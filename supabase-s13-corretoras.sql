-- =============================================
-- ZeveAI — S13: três corretoras (GENIAL, XP, BTG)
-- Execute no SQL Editor do Supabase POR ÚLTIMO
-- (depois de supabase-s12-plataforma-excluir-cliente.sql).
--
-- O que este arquivo faz:
--   1. Coluna `corretora` em contratos, contratos_importacoes, barras e
--      assessor_pricing (GENIAL | XP | BTG). Todo o histórico vira GENIAL.
--      Barras e tarifas passam a ser únicas por (corretora, nome).
--   2. Metas anuais ganham escopo: TOTAL (escritório) ou uma corretora.
--      A chave vira (ano, corretora).
--   3. Parâmetro `p_corretora text DEFAULT NULL` nas funções de LOTES do dashboard
--      (kpis, por_produto, top_clientes, diario_produto, evolucao_mensal,
--      drilldown_dia, retencao_mensal, lotes_por_plataforma, clientes_lista,
--      alertas, curva_abc). NULL = todas as corretoras.
--   4. Receita: dashboard_contratos_receita_por_assessor casa a tarifa por
--      (corretora, barra) e aceita p_corretora, p_barra e p_excluir_cliente.
--      receita_total, receita_bruta_liquida, receita_mes_projecao e meta_anual
--      passam os mesmos filtros adiante.
--   5. NOVO: dashboard_resumo_corretoras (lotes + receita por corretora) e
--      dashboard_evolucao_mensal_corretora (mês × corretora).
--   6. Incentivo: só lotes GENIAL (é o programa de pontos da Genial).
--   7. ltv_clientes, ranking_assessores e score_cliente casam a tarifa por
--      (corretora, barra) — evita contar duas vezes uma barra com o mesmo nome
--      em duas corretoras.
--   8. Hardening + reload do PostgREST.
-- =============================================

-- ---------------------------------------------
-- 0. Helper: normaliza o parâmetro de corretora (NULL/'' = todas)
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.norm_corretora(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT NULLIF(UPPER(TRIM(COALESCE(p, ''))), '');
$$;
GRANT EXECUTE ON FUNCTION public.norm_corretora(text) TO authenticated, service_role;

-- ---------------------------------------------
-- 1. Colunas de corretora
-- ---------------------------------------------
-- contratos: todo o histórico é GENIAL (confirmado com o escritório)
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS corretora TEXT NOT NULL DEFAULT 'GENIAL';
ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS contratos_corretora_check;
ALTER TABLE public.contratos
  ADD CONSTRAINT contratos_corretora_check CHECK (corretora IN ('GENIAL', 'XP', 'BTG'));
CREATE INDEX IF NOT EXISTS contratos_corretora_data_idx ON public.contratos (corretora, data);

-- importações: cada arquivo pertence a uma corretora
ALTER TABLE public.contratos_importacoes
  ADD COLUMN IF NOT EXISTS corretora TEXT NOT NULL DEFAULT 'GENIAL';
ALTER TABLE public.contratos_importacoes DROP CONSTRAINT IF EXISTS contratos_importacoes_corretora_check;
ALTER TABLE public.contratos_importacoes
  ADD CONSTRAINT contratos_importacoes_corretora_check CHECK (corretora IN ('GENIAL', 'XP', 'BTG'));

-- barras: o mesmo nome pode existir em corretoras diferentes
ALTER TABLE public.barras
  ADD COLUMN IF NOT EXISTS corretora TEXT NOT NULL DEFAULT 'GENIAL';
ALTER TABLE public.barras DROP CONSTRAINT IF EXISTS barras_corretora_check;
ALTER TABLE public.barras
  ADD CONSTRAINT barras_corretora_check CHECK (corretora IN ('GENIAL', 'XP', 'BTG'));
ALTER TABLE public.barras DROP CONSTRAINT IF EXISTS barras_nome_key;
ALTER TABLE public.barras DROP CONSTRAINT IF EXISTS barras_nome_corretora_key;
ALTER TABLE public.barras
  ADD CONSTRAINT barras_nome_corretora_key UNIQUE (nome, corretora);

-- tarifas: uma tarifa ativa por (corretora, barra). A coluna antiga `clearing`
-- é mantida em sincronia só por compatibilidade.
ALTER TABLE public.assessor_pricing
  ADD COLUMN IF NOT EXISTS corretora TEXT NOT NULL DEFAULT 'GENIAL';
UPDATE public.assessor_pricing
   SET corretora = UPPER(TRIM(clearing))
 WHERE corretora = 'GENIAL'
   AND UPPER(TRIM(COALESCE(clearing, ''))) IN ('XP', 'BTG');
UPDATE public.assessor_pricing SET clearing = corretora WHERE clearing IS DISTINCT FROM corretora;
ALTER TABLE public.assessor_pricing DROP CONSTRAINT IF EXISTS assessor_pricing_corretora_check;
ALTER TABLE public.assessor_pricing
  ADD CONSTRAINT assessor_pricing_corretora_check CHECK (corretora IN ('GENIAL', 'XP', 'BTG'));
DROP INDEX IF EXISTS public.assessor_pricing_barra_unique;
CREATE UNIQUE INDEX IF NOT EXISTS assessor_pricing_corretora_barra_unique
  ON public.assessor_pricing (corretora, barra_nome)
  WHERE ativo = true;

-- ---------------------------------------------
-- 2. Metas anuais por escopo (TOTAL = escritório inteiro)
-- ---------------------------------------------
ALTER TABLE public.metas_anuais
  ADD COLUMN IF NOT EXISTS corretora TEXT NOT NULL DEFAULT 'TOTAL';
ALTER TABLE public.metas_anuais DROP CONSTRAINT IF EXISTS metas_anuais_corretora_check;
ALTER TABLE public.metas_anuais
  ADD CONSTRAINT metas_anuais_corretora_check CHECK (corretora IN ('TOTAL', 'GENIAL', 'XP', 'BTG'));
ALTER TABLE public.metas_anuais DROP CONSTRAINT IF EXISTS metas_anuais_pkey;
ALTER TABLE public.metas_anuais ADD PRIMARY KEY (ano, corretora);

-- ---------------------------------------------
-- 3a. KPIs
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_kpis(date, date, text, text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_kpis(date, date, text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_kpis(
  p_inicio date,
  p_fim date,
  p_barra text DEFAULT NULL,
  p_excluir_cliente text DEFAULT NULL,
  p_corretora text DEFAULT NULL
)
RETURNS TABLE(
  volume_operados numeric,
  volume_zerados numeric,
  num_clientes_ativos integer,
  num_dias_com_dado integer,
  maior_dia_data date,
  maior_dia_lotes numeric,
  ultimo_dia_data date,
  ultimo_dia_lotes numeric,
  media_diaria numeric,
  dataset_max date
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT ct.data,
      SUM(COALESCE(ct.lotes_operados, 0)) AS op,
      SUM(COALESCE(ct.lotes_zerados, 0))  AS ze
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
      AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
      AND public.dashboard_acesso_ok()
    GROUP BY ct.data
  ),
  periodo AS (
    SELECT
      COALESCE(SUM(op), 0) AS op,
      COALESCE(SUM(ze), 0) AS ze,
      COUNT(*) AS dias
    FROM base
  ),
  clientes AS (
    SELECT COUNT(DISTINCT contratos_conta_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome)) AS n
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
      AND COALESCE(ct.lotes_operados, 0) > 0
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
      AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
      AND public.dashboard_acesso_ok()
  ),
  maior AS (
    SELECT data AS d, op FROM base ORDER BY op DESC NULLS LAST, data DESC LIMIT 1
  ),
  ultimo AS (
    SELECT data AS d, op FROM base ORDER BY data DESC LIMIT 1
  ),
  ds AS (
    SELECT MAX(ct.data) AS m FROM public.contratos ct
    WHERE (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
      AND public.dashboard_acesso_ok()
  )
  SELECT
    p.op, p.ze, c.n::integer, p.dias::integer,
    m.d, COALESCE(m.op, 0),
    u.d, COALESCE(u.op, 0),
    ROUND(p.op / NULLIF(p.dias, 0), 2),
    ds.m
  FROM periodo p
  CROSS JOIN clientes c
  LEFT JOIN maior m ON true
  LEFT JOIN ultimo u ON true
  LEFT JOIN ds ON true;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_kpis(date, date, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 3b. Por produto
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_por_produto(date, date, text, text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_por_produto(date, date, text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_por_produto(
  p_inicio date, p_fim date, p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL,
  p_corretora text DEFAULT NULL
)
RETURNS TABLE(
  produto text, lotes_operados numeric, lotes_zerados numeric,
  num_clientes integer, num_dias integer
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    contratos_produto(ct.ativo) AS produto,
    COALESCE(SUM(ct.lotes_operados), 0),
    COALESCE(SUM(ct.lotes_zerados), 0),
    COUNT(DISTINCT contratos_conta_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome))
      FILTER (WHERE COALESCE(ct.lotes_operados, 0) > 0)::integer,
    COUNT(DISTINCT ct.data)::integer
  FROM public.contratos ct
  WHERE ct.data BETWEEN p_inicio AND p_fim
    AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
    AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
    AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
    AND public.dashboard_acesso_ok()
  GROUP BY 1
  ORDER BY 2 DESC;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_por_produto(date, date, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 3c. Top clientes
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_top_clientes(date, date, integer, text, text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_top_clientes(date, date, integer, text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_top_clientes(
  p_inicio date, p_fim date,
  p_limit integer DEFAULT 20,
  p_barra text DEFAULT NULL,
  p_excluir_cliente text DEFAULT NULL,
  p_corretora text DEFAULT NULL
)
RETURNS TABLE(
  rank integer, cliente_id uuid, cliente_nome text, assessor_nome text,
  lotes_operados numeric, lotes_zerados numeric, pct_acumulado numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH agg AS (
    SELECT
      contratos_conta_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome) AS conta,
      MAX(ct.cliente_id::text)::uuid AS cliente_id,
      COALESCE(MAX(c.nome), MAX(ct.cliente_nome), 'Sem cliente') AS nome,
      MAX(ct.assessor_nome) AS assessor_nome,
      SUM(COALESCE(ct.lotes_operados, 0)) AS lotes_op,
      SUM(COALESCE(ct.lotes_zerados, 0))  AS lotes_ze
    FROM public.contratos ct
    LEFT JOIN public.clientes c ON ct.cliente_id = c.id
    WHERE ct.data BETWEEN p_inicio AND p_fim
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
      AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
      AND public.dashboard_acesso_ok()
    GROUP BY 1
  ),
  total AS (SELECT NULLIF(SUM(lotes_op), 0) AS t FROM agg),
  ranked AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY lotes_op DESC) AS rk,
      cliente_id, nome, assessor_nome, lotes_op, lotes_ze,
      SUM(lotes_op) OVER (ORDER BY lotes_op DESC, conta
                          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acum
    FROM agg
  )
  SELECT
    r.rk::integer, r.cliente_id, r.nome, r.assessor_nome, r.lotes_op, r.lotes_ze,
    CASE WHEN t.t IS NULL THEN 0 ELSE ROUND(r.acum / t.t * 100, 2) END
  FROM ranked r, total t
  WHERE r.rk <= p_limit
  ORDER BY r.rk;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_top_clientes(date, date, integer, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 3d. Diário por produto
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_diario_produto(date, date, text, text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_diario_produto(date, date, text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_diario_produto(
  p_inicio date, p_fim date, p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL,
  p_corretora text DEFAULT NULL
)
RETURNS TABLE(data date, produto text, lotes_operados numeric, lotes_zerados numeric)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT ct.data, contratos_produto(ct.ativo) AS produto,
    COALESCE(SUM(ct.lotes_operados), 0), COALESCE(SUM(ct.lotes_zerados), 0)
  FROM public.contratos ct
  WHERE ct.data BETWEEN p_inicio AND p_fim
    AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
    AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
    AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
    AND public.dashboard_acesso_ok()
  GROUP BY ct.data, contratos_produto(ct.ativo)
  ORDER BY ct.data, produto;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_diario_produto(date, date, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 3e. Evolução mensal
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_evolucao_mensal(text, text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_evolucao_mensal(text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_evolucao_mensal(
  p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL, p_corretora text DEFAULT NULL
)
RETURNS TABLE(
  mes_data date,
  lotes_operados numeric,
  lotes_zerados numeric,
  num_pregoes integer,
  num_clientes integer
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    date_trunc('month', ct.data)::date AS mes_data,
    COALESCE(SUM(ct.lotes_operados), 0),
    COALESCE(SUM(ct.lotes_zerados), 0),
    COUNT(DISTINCT ct.data)::integer,
    COUNT(DISTINCT contratos_conta_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome))
      FILTER (WHERE COALESCE(ct.lotes_operados, 0) > 0)::integer
  FROM public.contratos ct
  WHERE ct.data IS NOT NULL
    AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
    AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
    AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
    AND public.dashboard_acesso_ok()
  GROUP BY 1
  ORDER BY 1;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_evolucao_mensal(text, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 3f. Drill-down do dia
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_drilldown_dia(date, text, text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_drilldown_dia(date, text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_drilldown_dia(
  p_data date, p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL, p_corretora text DEFAULT NULL
)
RETURNS TABLE(
  tipo text, rank integer, cliente_id uuid, cliente_nome text,
  assessor_nome text, lotes_operados numeric, lotes_zerados numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      contratos_conta_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome) AS conta,
      MAX(ct.cliente_id::text)::uuid AS cliente_id,
      COALESCE(MAX(c.nome), MAX(ct.cliente_nome), 'Sem cliente') AS nome,
      MAX(ct.assessor_nome) AS assessor_nome,
      SUM(COALESCE(ct.lotes_operados, 0)) AS lotes_op,
      SUM(COALESCE(ct.lotes_zerados, 0))  AS lotes_ze
    FROM public.contratos ct
    LEFT JOIN public.clientes c ON ct.cliente_id = c.id
    WHERE ct.data = p_data
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
      AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
      AND public.dashboard_acesso_ok()
    GROUP BY 1
  ),
  totals AS (
    SELECT 'totals'::text AS tipo, 0 AS rank, NULL::uuid AS cliente_id,
      ''::text AS nome, NULL::text AS assessor_nome,
      COALESCE(SUM(lotes_op), 0) AS lotes_op, COALESCE(SUM(lotes_ze), 0) AS lotes_ze
    FROM base
  ),
  girou AS (
    SELECT 'top_girou'::text, ROW_NUMBER() OVER (ORDER BY lotes_op DESC)::integer,
      cliente_id, nome, assessor_nome, lotes_op, lotes_ze
    FROM base WHERE lotes_op > 0
    ORDER BY lotes_op DESC LIMIT 3
  ),
  zerou AS (
    SELECT 'top_zerou'::text, ROW_NUMBER() OVER (ORDER BY lotes_ze DESC)::integer,
      cliente_id, nome, assessor_nome, lotes_op, lotes_ze
    FROM base WHERE lotes_ze > 0
    ORDER BY lotes_ze DESC LIMIT 3
  )
  SELECT * FROM totals
  UNION ALL SELECT * FROM girou
  UNION ALL SELECT * FROM zerou;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_drilldown_dia(date, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 3g. Retenção e churn mês a mês
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_retencao_mensal(text, text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_retencao_mensal(text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_retencao_mensal(
  p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL, p_corretora text DEFAULT NULL
)
RETURNS TABLE(
  mes date,
  mes_seguinte date,
  ativos integer,
  continuaram integer,
  pararam integer,
  churn_pct numeric,
  retencao_pct numeric,
  parcial boolean
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH mensal AS (
    SELECT DISTINCT
      date_trunc('month', ct.data)::date AS mes,
      contratos_conta_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome) AS conta
    FROM public.contratos ct
    WHERE ct.data IS NOT NULL
      AND COALESCE(ct.lotes_operados, 0) > 0
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
      AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
      AND public.dashboard_acesso_ok()
  ),
  limites AS (
    SELECT MAX(mes) AS ultimo_mes FROM mensal
  ),
  pares AS (
    SELECT
      m.mes,
      COUNT(*) AS ativos,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM mensal n
          WHERE n.conta = m.conta
            AND n.mes = (m.mes + INTERVAL '1 month')::date
        )
      ) AS continuaram
    FROM mensal m
    GROUP BY m.mes
  )
  SELECT
    p.mes,
    (p.mes + INTERVAL '1 month')::date AS mes_seguinte,
    p.ativos::integer,
    p.continuaram::integer,
    (p.ativos - p.continuaram)::integer AS pararam,
    ROUND((p.ativos - p.continuaram)::numeric / NULLIF(p.ativos, 0) * 100, 1) AS churn_pct,
    ROUND(p.continuaram::numeric / NULLIF(p.ativos, 0) * 100, 1) AS retencao_pct,
    ((p.mes + INTERVAL '1 month')::date >= l.ultimo_mes) AS parcial
  FROM pares p, limites l
  WHERE p.mes < l.ultimo_mes
  ORDER BY p.mes;
$$;
GRANT EXECUTE ON FUNCTION dashboard_retencao_mensal(text, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 3h. Lotes por plataforma
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_lotes_por_plataforma(date, date, text, text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_lotes_por_plataforma(date, date, text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_lotes_por_plataforma(
  p_inicio date, p_fim date, p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL,
  p_corretora text DEFAULT NULL
)
RETURNS TABLE(
  plataforma text,
  lotes_operados numeric,
  lotes_zerados numeric,
  num_clientes integer,
  num_dias integer
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    COALESCE(NULLIF(TRIM(ct.plataforma), ''), 'Sem plataforma') AS plataforma,
    COALESCE(SUM(ct.lotes_operados), 0) AS lotes_operados,
    COALESCE(SUM(ct.lotes_zerados), 0)  AS lotes_zerados,
    COUNT(DISTINCT contratos_conta_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome))
      FILTER (WHERE COALESCE(ct.lotes_operados, 0) > 0)::integer AS num_clientes,
    COUNT(DISTINCT ct.data)::integer AS num_dias
  FROM public.contratos ct
  WHERE ct.data BETWEEN p_inicio AND p_fim
    AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
    AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
    AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
    AND public.dashboard_acesso_ok()
  GROUP BY 1
  HAVING COALESCE(SUM(ct.lotes_operados), 0) > 0 OR COALESCE(SUM(ct.lotes_zerados), 0) > 0
  ORDER BY 2 DESC, 1;
$$;
GRANT EXECUTE ON FUNCTION dashboard_lotes_por_plataforma(date, date, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 3i. Lista de clientes pro seletor "Excluir cliente"
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_clientes_lista() CASCADE;
DROP FUNCTION IF EXISTS dashboard_clientes_lista(text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_clientes_lista(p_corretora text DEFAULT NULL)
RETURNS TABLE(
  cliente_nome text,
  lotes_operados numeric,
  num_contas integer
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    MIN(TRIM(ct.cliente_nome)) AS cliente_nome,
    COALESCE(SUM(ct.lotes_operados), 0) AS lotes_operados,
    COUNT(DISTINCT contratos_conta_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome))::integer AS num_contas
  FROM public.contratos ct
  WHERE NULLIF(TRIM(COALESCE(ct.cliente_nome, '')), '') IS NOT NULL
    AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
    AND public.dashboard_acesso_ok()
  GROUP BY norm_texto(ct.cliente_nome)
  HAVING COALESCE(SUM(ct.lotes_operados), 0) > 0
  ORDER BY 2 DESC, 1
  LIMIT 1000;
$$;
GRANT EXECUTE ON FUNCTION dashboard_clientes_lista(text) TO authenticated, service_role;

-- ---------------------------------------------
-- 3j. Alertas (inativo / esfriando / zeragem alta / zeragem concentrada)
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_alertas(integer, text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_alertas(integer, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_alertas(
  p_inativo_dias integer DEFAULT 30,
  p_barra text DEFAULT NULL,
  p_corretora text DEFAULT NULL
)
RETURNS TABLE(
  tipo text, severidade text, cliente_id uuid, cliente_nome text,
  assessor_nome text, metric_label text, metric_value text, detalhe text
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      ct.cliente_id,
      COALESCE(c.nome, ct.cliente_nome, 'Sem cliente') AS nome,
      MAX(ct.assessor_nome) AS assessor_nome,
      SUM(ct.lotes_operados) AS lotes_op,
      SUM(ct.lotes_zerados)  AS lotes_ze,
      MAX(ct.data) AS ultima_op
    FROM public.contratos ct
    LEFT JOIN public.clientes c ON ct.cliente_id = c.id
    WHERE ct.data >= CURRENT_DATE - INTERVAL '180 days'
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
      AND public.dashboard_acesso_ok()
    GROUP BY ct.cliente_id, COALESCE(c.nome, ct.cliente_nome, 'Sem cliente')
  ),
  ina AS (
    SELECT
      'inativo'::text AS tipo,
      'media'::text   AS severidade,
      b.cliente_id    AS cliente_id,
      b.nome          AS cliente_nome,
      b.assessor_nome AS assessor_nome,
      'Última operação'::text AS metric_label,
      TO_CHAR(b.ultima_op, 'DD/MM/YYYY') AS metric_value,
      ('Sem operar há ' || (CURRENT_DATE - b.ultima_op)::text || ' dias')::text AS detalhe
    FROM base b
    WHERE b.lotes_op > 0
      AND b.ultima_op < CURRENT_DATE - (p_inativo_dias || ' days')::interval
      AND b.ultima_op >= CURRENT_DATE - INTERVAL '90 days'
  ),
  esfr AS (
    SELECT
      'esfriando'::text AS tipo,
      CASE WHEN queda >= 0.8 THEN 'alta' ELSE 'media' END::text AS severidade,
      cliente_id, nome AS cliente_nome, assessor_nome,
      'Queda de volume'::text AS metric_label,
      ROUND(queda * 100, 1)::text || '%' AS metric_value,
      ('30d últimos: ' || lotes_recentes || ' · 30d anteriores: ' || lotes_anteriores)::text AS detalhe
    FROM (
      SELECT ct.cliente_id,
        COALESCE(c.nome, ct.cliente_nome, 'Sem cliente') AS nome,
        MAX(ct.assessor_nome) AS assessor_nome,
        SUM(ct.lotes_operados) FILTER (WHERE ct.data >= CURRENT_DATE - INTERVAL '30 days') AS lotes_recentes,
        SUM(ct.lotes_operados) FILTER (
          WHERE ct.data BETWEEN CURRENT_DATE - INTERVAL '60 days' AND CURRENT_DATE - INTERVAL '31 days'
        ) AS lotes_anteriores,
        CASE
          WHEN SUM(ct.lotes_operados) FILTER (
            WHERE ct.data BETWEEN CURRENT_DATE - INTERVAL '60 days' AND CURRENT_DATE - INTERVAL '31 days'
          ) > 0 THEN
            (SUM(ct.lotes_operados) FILTER (
              WHERE ct.data BETWEEN CURRENT_DATE - INTERVAL '60 days' AND CURRENT_DATE - INTERVAL '31 days'
            ) - COALESCE(SUM(ct.lotes_operados) FILTER (WHERE ct.data >= CURRENT_DATE - INTERVAL '30 days'), 0))
            / SUM(ct.lotes_operados) FILTER (
              WHERE ct.data BETWEEN CURRENT_DATE - INTERVAL '60 days' AND CURRENT_DATE - INTERVAL '31 days'
            )
          ELSE 0
        END AS queda
      FROM public.contratos ct
      LEFT JOIN public.clientes c ON ct.cliente_id = c.id
      WHERE ct.data >= CURRENT_DATE - INTERVAL '60 days'
        AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
        AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
        AND public.dashboard_acesso_ok()
      GROUP BY ct.cliente_id, COALESCE(c.nome, ct.cliente_nome, 'Sem cliente')
    ) s
    WHERE queda >= 0.5 AND lotes_anteriores >= 10
  ),
  zalt AS (
    SELECT
      'zeragem_alta'::text AS tipo,
      CASE WHEN pct >= 0.7 THEN 'alta' ELSE 'media' END::text AS severidade,
      cliente_id, nome AS cliente_nome, assessor_nome,
      '% zeragem'::text AS metric_label,
      ROUND(pct * 100, 1)::text || '%' AS metric_value,
      ('Op: ' || lotes_op || ' · Ze: ' || lotes_ze || ' (últimos 30d)')::text AS detalhe
    FROM (
      SELECT ct.cliente_id,
        COALESCE(c.nome, ct.cliente_nome, 'Sem cliente') AS nome,
        MAX(ct.assessor_nome) AS assessor_nome,
        SUM(ct.lotes_operados) AS lotes_op,
        SUM(ct.lotes_zerados)  AS lotes_ze,
        CASE WHEN SUM(ct.lotes_operados) > 0
          THEN SUM(ct.lotes_zerados) / SUM(ct.lotes_operados)
          ELSE 0 END AS pct
      FROM public.contratos ct
      LEFT JOIN public.clientes c ON ct.cliente_id = c.id
      WHERE ct.data >= CURRENT_DATE - INTERVAL '30 days'
        AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
        AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
        AND public.dashboard_acesso_ok()
      GROUP BY ct.cliente_id, COALESCE(c.nome, ct.cliente_nome, 'Sem cliente')
    ) s
    WHERE pct >= 0.5 AND lotes_op >= 10
  ),
  zcon AS (
    SELECT
      'zeragem_concentrada'::text AS tipo,
      'alta'::text AS severidade,
      cliente_id, nome AS cliente_nome, assessor_nome,
      'Zeragem em 7 dias'::text AS metric_label,
      lotes_ze::text || ' lotes' AS metric_value,
      ('Concentrado em ' || TO_CHAR(janela_inicio, 'DD/MM') || ' a ' || TO_CHAR(janela_fim, 'DD/MM'))::text AS detalhe
    FROM (
      SELECT ct.cliente_id,
        COALESCE(c.nome, ct.cliente_nome, 'Sem cliente') AS nome,
        MAX(ct.assessor_nome) AS assessor_nome,
        SUM(ct.lotes_zerados) AS lotes_ze,
        MIN(ct.data) AS janela_inicio,
        MAX(ct.data) AS janela_fim
      FROM public.contratos ct
      LEFT JOIN public.clientes c ON ct.cliente_id = c.id
      WHERE ct.data >= CURRENT_DATE - INTERVAL '7 days'
        AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
        AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
        AND public.dashboard_acesso_ok()
      GROUP BY ct.cliente_id, COALESCE(c.nome, ct.cliente_nome, 'Sem cliente')
    ) s
    WHERE lotes_ze >= 50
  ),
  todos AS (
    SELECT * FROM ina
    UNION ALL SELECT * FROM esfr
    UNION ALL SELECT * FROM zalt
    UNION ALL SELECT * FROM zcon
  )
  SELECT *
  FROM todos
  ORDER BY
    CASE severidade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
    tipo, cliente_nome;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_alertas(integer, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 4a. Receita por barra — tarifa casada por (corretora, barra);
--     filtros de corretora, barra e exclusão de cliente.
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_receita_por_assessor(date, date) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_receita_por_assessor(date, date, text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_receita_por_assessor(
  p_inicio date,
  p_fim date,
  p_corretora text DEFAULT NULL,
  p_barra text DEFAULT NULL,
  p_excluir_cliente text DEFAULT NULL
)
RETURNS TABLE(
  barra_nome text,
  numero text,
  preco_lote_futuros numeric,
  modelo_zeragem text,
  preco_zeragem numeric,
  lotes_operados numeric,
  lotes_zerados numeric,
  receita_operados numeric,
  receita_zeragem numeric,
  receita_total numeric,
  corretora text
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH agg_barra AS (
    SELECT
      ct.corretora,
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
          THEN ct.lotes_operados ELSE 0 END) AS lotes_op_futuros,
      SUM(ct.lotes_operados) AS lotes_operados,
      SUM(ct.lotes_zerados)  AS lotes_zerados
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
      AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
      AND public.dashboard_acesso_ok()
    GROUP BY 1, 2
  ),
  agg_cliente_dia AS (
    SELECT
      ct.corretora,
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key,
      ct.data,
      SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
          THEN ct.lotes_zerados ELSE 0 END) AS lotes_ze_dia
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
      AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
      AND public.dashboard_acesso_ok()
    GROUP BY 1, 2, 3, 4
    HAVING SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
                    THEN ct.lotes_zerados ELSE 0 END) > 0
  ),
  pr AS (
    SELECT
      p.corretora,
      norm_barra(p.barra_nome) AS chave,
      p.id, p.barra_nome, p.numero,
      p.preco_lote_futuros, p.modelo_zeragem, p.preco_zeragem
    FROM public.assessor_pricing p
    WHERE p.ativo = true
  ),
  receita_ze_diaria AS (
    SELECT
      acd.corretora,
      acd.barra_nome,
      acd.lotes_ze_dia,
      CASE pr.modelo_zeragem
        WHEN 'fixo'           THEN pr.preco_zeragem      * acd.lotes_ze_dia
        WHEN 'mesmo_operado'  THEN pr.preco_lote_futuros * acd.lotes_ze_dia
        WHEN 'tiered'         THEN COALESCE((
          SELECT t.preco_zeragem
          FROM public.assessor_pricing_zeragem_tier t
          WHERE t.pricing_id = pr.id
            AND acd.lotes_ze_dia >= t.volume_min
            AND (t.volume_max IS NULL OR acd.lotes_ze_dia <= t.volume_max)
          ORDER BY t.ordem
          LIMIT 1
        ), 0) * acd.lotes_ze_dia
        ELSE 0
      END AS receita_zeragem_dia
    FROM agg_cliente_dia acd
    LEFT JOIN pr ON pr.corretora = acd.corretora AND pr.chave = norm_barra(acd.barra_nome)
  ),
  receita_ze AS (
    SELECT corretora, barra_nome, COALESCE(SUM(receita_zeragem_dia), 0) AS receita_zeragem
    FROM receita_ze_diaria
    GROUP BY 1, 2
  )
  SELECT
    a.barra_nome,
    pr.numero,
    COALESCE(pr.preco_lote_futuros, 0)              AS preco_lote_futuros,
    COALESCE(pr.modelo_zeragem, 'b2b')              AS modelo_zeragem,
    COALESCE(pr.preco_zeragem, 0)                   AS preco_zeragem,
    a.lotes_operados,
    a.lotes_zerados,
    ROUND(COALESCE(pr.preco_lote_futuros, 0) * a.lotes_op_futuros, 2) AS receita_operados,
    ROUND(COALESCE(rz.receita_zeragem, 0), 2)       AS receita_zeragem,
    ROUND(
      COALESCE(pr.preco_lote_futuros, 0) * a.lotes_op_futuros
      + COALESCE(rz.receita_zeragem, 0), 2
    ) AS receita_total,
    a.corretora
  FROM agg_barra a
  LEFT JOIN pr ON pr.corretora = a.corretora AND pr.chave = norm_barra(a.barra_nome)
  LEFT JOIN receita_ze rz ON rz.corretora = a.corretora AND rz.barra_nome = a.barra_nome
  ORDER BY receita_total DESC NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_receita_por_assessor(date, date, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 4b. Receita total
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_receita_total(date, date) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_receita_total(date, date, text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_receita_total(
  p_inicio date, p_fim date,
  p_corretora text DEFAULT NULL, p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL
)
RETURNS TABLE(
  receita_operados numeric,
  receita_zeragem numeric,
  receita_total numeric,
  num_barras integer,
  num_barras_sem_pricing integer
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH r AS (
    SELECT * FROM dashboard_contratos_receita_por_assessor(p_inicio, p_fim, p_corretora, p_barra, p_excluir_cliente)
  )
  SELECT
    COALESCE(SUM(receita_operados), 0),
    COALESCE(SUM(receita_zeragem),  0),
    COALESCE(SUM(receita_total),    0),
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE preco_lote_futuros = 0 AND modelo_zeragem = 'b2b')::integer
  FROM r;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_receita_total(date, date, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 4c. Receita bruta vs líquida (% repasse por corretora + barra)
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_receita_bruta_liquida(date, date) CASCADE;
DROP FUNCTION IF EXISTS dashboard_receita_bruta_liquida(date, date, text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_receita_bruta_liquida(
  p_inicio date, p_fim date,
  p_corretora text DEFAULT NULL, p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL
)
RETURNS TABLE(
  receita_bruta numeric,
  receita_liquida numeric,
  pct_repasse_medio numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH r AS (
    SELECT a.corretora, a.barra_nome, a.receita_total
    FROM dashboard_contratos_receita_por_assessor(p_inicio, p_fim, p_corretora, p_barra, p_excluir_cliente) a
  ),
  pr AS (
    SELECT p.corretora, norm_barra(p.barra_nome) AS chave,
           COALESCE(p.pct_repasse_escritorio, 0.50) AS pct
    FROM public.assessor_pricing p WHERE p.ativo = true
  )
  SELECT
    COALESCE(SUM(r.receita_total), 0) AS receita_bruta,
    COALESCE(SUM(r.receita_total * COALESCE(pr.pct, 0.50)), 0) AS receita_liquida,
    CASE WHEN SUM(r.receita_total) > 0
      THEN ROUND(SUM(r.receita_total * COALESCE(pr.pct, 0.50)) / SUM(r.receita_total) * 100, 2)
      ELSE 0 END AS pct_repasse_medio
  FROM r
  LEFT JOIN pr ON pr.corretora = r.corretora AND pr.chave = norm_barra(r.barra_nome);
$$;
GRANT EXECUTE ON FUNCTION dashboard_receita_bruta_liquida(date, date, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 4d. Projeção do mês (por corretora ou escritório)
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_receita_mes_projecao() CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_receita_mes_projecao(text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_receita_mes_projecao(p_corretora text DEFAULT NULL)
RETURNS TABLE(
  mes_data date,
  receita_consolidada numeric,
  num_dias_com_dado integer,
  ritmo_diario numeric,
  dias_corridos_restantes integer,
  projecao_complementar numeric,
  projecao_total numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH hoje AS (SELECT public.brasil_hoje() AS h),
  mes AS (
    SELECT date_trunc('month', h)::date AS ini,
           (date_trunc('month', h) + INTERVAL '1 month - 1 day')::date AS fim,
           h
    FROM hoje
  ),
  receita AS (
    SELECT
      COALESCE(SUM(r.receita_total), 0) AS total
    FROM mes m, LATERAL dashboard_contratos_receita_por_assessor(m.ini, m.h, p_corretora) r
  ),
  dias AS (
    SELECT COUNT(DISTINCT c.data) AS com_dado
    FROM public.contratos c, mes m
    WHERE c.data BETWEEN m.ini AND m.h
      AND (norm_corretora(p_corretora) IS NULL OR c.corretora = norm_corretora(p_corretora))
  ),
  uteis_restantes AS (
    SELECT COUNT(*) AS n
    FROM mes m, generate_series(m.h + 1, m.fim, INTERVAL '1 day') g
    WHERE EXTRACT(ISODOW FROM g) BETWEEN 1 AND 5
  )
  SELECT
    m.ini,
    r.total,
    d.com_dado::integer,
    ROUND(r.total / NULLIF(d.com_dado, 0), 2) AS ritmo_diario,
    u.n::integer,
    ROUND(COALESCE(r.total / NULLIF(d.com_dado, 0), 0) * u.n, 2) AS projecao_complementar,
    ROUND(r.total + COALESCE(r.total / NULLIF(d.com_dado, 0), 0) * u.n, 2) AS projecao_total
  FROM mes m, receita r, dias d, uteis_restantes u
  WHERE public.dashboard_acesso_ok();
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_receita_mes_projecao(text) TO authenticated, service_role;

-- ---------------------------------------------
-- 4e. Meta anual por escopo (NULL = TOTAL do escritório)
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_meta_anual() CASCADE;
DROP FUNCTION IF EXISTS dashboard_meta_anual(text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_meta_anual(p_corretora text DEFAULT NULL)
RETURNS TABLE(
  ano integer,
  meta_lotes numeric,
  meta_receita numeric,
  realizado_lotes numeric,
  realizado_receita numeric,
  pct_lotes numeric,
  pct_receita numeric,
  dias_corridos_restantes integer,
  ritmo_lotes_necessario numeric,
  ritmo_receita_necessario numeric,
  corretora text
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH hoje AS (SELECT public.brasil_hoje() AS h),
  escopo AS (SELECT COALESCE(norm_corretora(p_corretora), 'TOTAL') AS e),
  anos AS (
    SELECT EXTRACT(YEAR FROM h)::integer AS ano,
           make_date(EXTRACT(YEAR FROM h)::integer, 1, 1) AS ini,
           make_date(EXTRACT(YEAR FROM h)::integer, 12, 31) AS fim,
           h
    FROM hoje
  ),
  meta AS (
    SELECT m.ano, m.meta_lotes, m.meta_receita
    FROM public.metas_anuais m, anos a, escopo e
    WHERE m.ano = a.ano AND m.corretora = e.e
  ),
  lotes AS (
    SELECT COALESCE(SUM(c.lotes_operados), 0) AS total
    FROM public.contratos c, anos a, escopo e
    WHERE c.data BETWEEN a.ini AND a.h
      AND (e.e = 'TOTAL' OR c.corretora = e.e)
  ),
  receita AS (
    SELECT COALESCE(SUM(r.receita_total), 0) AS total
    FROM anos a, LATERAL dashboard_contratos_receita_por_assessor(a.ini, a.h, p_corretora) r
  ),
  uteis_restantes AS (
    SELECT GREATEST(COUNT(*), 1) AS n
    FROM anos a, generate_series(a.h + 1, a.fim, INTERVAL '1 day') g
    WHERE EXTRACT(ISODOW FROM g) BETWEEN 1 AND 5
  )
  SELECT
    a.ano,
    COALESCE(m.meta_lotes, 0),
    COALESCE(m.meta_receita, 0),
    l.total,
    r.total,
    ROUND(l.total / NULLIF(m.meta_lotes, 0) * 100, 1),
    ROUND(r.total / NULLIF(m.meta_receita, 0) * 100, 1),
    u.n::integer,
    ROUND(GREATEST(COALESCE(m.meta_lotes, 0) - l.total, 0) / u.n, 0),
    ROUND(GREATEST(COALESCE(m.meta_receita, 0) - r.total, 0) / u.n, 2),
    e.e
  FROM anos a
  CROSS JOIN escopo e
  LEFT JOIN meta m ON m.ano = a.ano
  CROSS JOIN lotes l
  CROSS JOIN receita r
  CROSS JOIN uteis_restantes u
  WHERE public.dashboard_acesso_ok();
$$;
GRANT EXECUTE ON FUNCTION dashboard_meta_anual(text) TO authenticated, service_role;

-- ---------------------------------------------
-- 5a. NOVO — Resumo por corretora (sempre devolve as 3 linhas)
--     Lotes seguem barra e exclusão; receita usa a tarifa de cada corretora.
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_resumo_corretoras(date, date, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_resumo_corretoras(
  p_inicio date, p_fim date, p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL
)
RETURNS TABLE(
  corretora text,
  lotes_operados numeric,
  lotes_zerados numeric,
  num_clientes integer,
  num_dias integer,
  receita_bruta numeric,
  receita_liquida numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH lotes AS (
    SELECT
      ct.corretora,
      COALESCE(SUM(ct.lotes_operados), 0) AS lotes_operados,
      COALESCE(SUM(ct.lotes_zerados), 0)  AS lotes_zerados,
      COUNT(DISTINCT contratos_conta_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome))
        FILTER (WHERE COALESCE(ct.lotes_operados, 0) > 0)::integer AS num_clientes,
      COUNT(DISTINCT ct.data)::integer AS num_dias
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
      AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
      AND public.dashboard_acesso_ok()
    GROUP BY 1
  ),
  pr AS (
    SELECT p.corretora, norm_barra(p.barra_nome) AS chave,
           COALESCE(p.pct_repasse_escritorio, 0.50) AS pct
    FROM public.assessor_pricing p WHERE p.ativo = true
  ),
  receita AS (
    SELECT
      r.corretora,
      SUM(r.receita_total) AS bruta,
      SUM(r.receita_total * COALESCE(pr.pct, 0.50)) AS liquida
    FROM dashboard_contratos_receita_por_assessor(p_inicio, p_fim, NULL, p_barra, p_excluir_cliente) r
    LEFT JOIN pr ON pr.corretora = r.corretora AND pr.chave = norm_barra(r.barra_nome)
    GROUP BY 1
  )
  SELECT
    c.corretora,
    COALESCE(l.lotes_operados, 0),
    COALESCE(l.lotes_zerados, 0),
    COALESCE(l.num_clientes, 0),
    COALESCE(l.num_dias, 0),
    ROUND(COALESCE(rc.bruta, 0), 2),
    ROUND(COALESCE(rc.liquida, 0), 2)
  FROM (VALUES ('GENIAL'), ('XP'), ('BTG')) AS c(corretora)
  LEFT JOIN lotes l ON l.corretora = c.corretora
  LEFT JOIN receita rc ON rc.corretora = c.corretora
  ORDER BY CASE c.corretora WHEN 'GENIAL' THEN 1 WHEN 'XP' THEN 2 ELSE 3 END;
$$;
GRANT EXECUTE ON FUNCTION dashboard_resumo_corretoras(date, date, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 5b. NOVO — Evolução mensal por corretora (gráfico empilhado)
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_evolucao_mensal_corretora(text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_evolucao_mensal_corretora(
  p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL
)
RETURNS TABLE(
  mes_data date,
  corretora text,
  lotes_operados numeric,
  lotes_zerados numeric,
  num_clientes integer
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    date_trunc('month', ct.data)::date AS mes_data,
    ct.corretora,
    COALESCE(SUM(ct.lotes_operados), 0),
    COALESCE(SUM(ct.lotes_zerados), 0),
    COUNT(DISTINCT contratos_conta_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome))
      FILTER (WHERE COALESCE(ct.lotes_operados, 0) > 0)::integer
  FROM public.contratos ct
  WHERE ct.data IS NOT NULL
    AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
    AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
    AND public.dashboard_acesso_ok()
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;
GRANT EXECUTE ON FUNCTION dashboard_evolucao_mensal_corretora(text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 6. Incentivo — programa de pontos da GENIAL (só lotes dessa corretora)
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_incentivo_mensal() CASCADE;
CREATE OR REPLACE FUNCTION dashboard_incentivo_mensal()
RETURNS TABLE(
  mes date,
  faixa_min numeric,
  valor_unitario numeric,
  num_clientes integer,
  valor_total numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH faixas(faixa_min, valor) AS (
    VALUES
      (1000000::numeric, 49000::numeric),
      (750000, 42000),
      (500000, 31500),
      (300000, 21000),
      (150000, 12000),
      (50000, 5000),
      (10000, 1000),
      (5000, 500),
      (1000, 200)
  ),
  pontos AS (
    SELECT
      date_trunc('month', data)::date AS mes,
      contratos_incentivo_key(numero_conta, cliente_id, cliente_nome) AS conta,
      SUM(COALESCE(lotes_operados, 0) * CASE contratos_produto(ativo)
        WHEN 'BIT' THEN 4
        WHEN 'DI1' THEN 1
        WHEN 'DOL' THEN 5
        WHEN 'ETR' THEN 3
        WHEN 'GLD' THEN 3
        WHEN 'IND' THEN 3
        WHEN 'SOL' THEN 3
        WHEN 'WDO' THEN 2
        WHEN 'WIN' THEN 1
        WHEN 'WSP' THEN 1
        ELSE 0
      END) AS pts
    FROM public.contratos
    WHERE data IS NOT NULL
      AND corretora = 'GENIAL'
      AND public.dashboard_acesso_ok()
    GROUP BY 1, 2
    HAVING SUM(COALESCE(lotes_operados, 0)) > 0
  ),
  classificado AS (
    SELECT
      p.mes,
      COALESCE(
        (SELECT f.faixa_min FROM faixas f WHERE p.pts > f.faixa_min ORDER BY f.faixa_min DESC LIMIT 1),
        0
      ) AS faixa_min
    FROM pontos p
  )
  SELECT
    c.mes,
    c.faixa_min,
    COALESCE(f.valor, 0) AS valor_unitario,
    COUNT(*)::integer AS num_clientes,
    (COUNT(*) * COALESCE(f.valor, 0)) AS valor_total
  FROM classificado c
  LEFT JOIN faixas f ON f.faixa_min = c.faixa_min
  GROUP BY c.mes, c.faixa_min, f.valor
  ORDER BY c.mes, c.faixa_min DESC;
$$;
GRANT EXECUTE ON FUNCTION dashboard_incentivo_mensal() TO authenticated, service_role;

DROP FUNCTION IF EXISTS dashboard_incentivo_clientes(date) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_incentivo_clientes(p_mes date DEFAULT NULL)
RETURNS TABLE(
  conta text,
  cliente_nome text,
  pontos numeric,
  lotes_operados numeric,
  faixa_min numeric,
  valor_incentivo numeric,
  proxima_faixa numeric,
  pontos_faltantes numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH alvo AS (
    SELECT COALESCE(
      date_trunc('month', p_mes)::date,
      (SELECT date_trunc('month', MAX(data))::date FROM public.contratos WHERE corretora = 'GENIAL')
    ) AS mes
  ),
  faixas(faixa_min, valor) AS (
    VALUES
      (1000000::numeric, 49000::numeric),
      (750000, 42000),
      (500000, 31500),
      (300000, 21000),
      (150000, 12000),
      (50000, 5000),
      (10000, 1000),
      (5000, 500),
      (1000, 200)
  ),
  pontos AS (
    SELECT
      contratos_incentivo_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome) AS conta,
      COALESCE(MAX(c.nome), MAX(ct.cliente_nome), 'Sem cliente') AS nome,
      SUM(COALESCE(ct.lotes_operados, 0) * CASE contratos_produto(ct.ativo)
        WHEN 'BIT' THEN 4
        WHEN 'DI1' THEN 1
        WHEN 'DOL' THEN 5
        WHEN 'ETR' THEN 3
        WHEN 'GLD' THEN 3
        WHEN 'IND' THEN 3
        WHEN 'SOL' THEN 3
        WHEN 'WDO' THEN 2
        WHEN 'WIN' THEN 1
        WHEN 'WSP' THEN 1
        ELSE 0
      END) AS pts,
      SUM(COALESCE(ct.lotes_operados, 0)) AS lotes
    FROM public.contratos ct
    LEFT JOIN public.clientes c ON ct.cliente_id = c.id, alvo a
    WHERE date_trunc('month', ct.data)::date = a.mes
      AND ct.corretora = 'GENIAL'
      AND public.dashboard_acesso_ok()
    GROUP BY 1
    HAVING SUM(COALESCE(ct.lotes_operados, 0)) > 0
  )
  SELECT
    p.conta,
    p.nome,
    ROUND(p.pts, 0) AS pontos,
    ROUND(p.lotes, 0) AS lotes_operados,
    COALESCE(fa.faixa_min, 0) AS faixa_min,
    COALESCE(fa.valor, 0) AS valor_incentivo,
    fp.faixa_min AS proxima_faixa,
    CASE WHEN fp.faixa_min IS NULL THEN NULL
         ELSE ROUND(fp.faixa_min - p.pts, 0) END AS pontos_faltantes
  FROM pontos p
  LEFT JOIN LATERAL (
    SELECT f.faixa_min, f.valor FROM faixas f
    WHERE p.pts > f.faixa_min ORDER BY f.faixa_min DESC LIMIT 1
  ) fa ON true
  LEFT JOIN LATERAL (
    SELECT f.faixa_min FROM faixas f
    WHERE p.pts <= f.faixa_min
    ORDER BY f.faixa_min ASC LIMIT 1
  ) fp ON true
  ORDER BY p.pts DESC
  LIMIT 300;
$$;
GRANT EXECUTE ON FUNCTION dashboard_incentivo_clientes(date) TO authenticated, service_role;

-- ---------------------------------------------
-- 7a. Curva ABC — tarifa por (corretora, barra) + filtros
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_curva_abc(date, date, text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_curva_abc(date, date, text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_curva_abc(
  p_inicio date,
  p_fim date,
  p_barra text DEFAULT NULL,
  p_excluir_cliente text DEFAULT NULL,
  p_corretora text DEFAULT NULL
)
RETURNS TABLE(
  rank integer,
  cliente_id uuid,
  cliente_nome text,
  assessor_nome text,
  receita_estimada numeric,
  pct_individual numeric,
  pct_acumulado numeric,
  classe text
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH agg_cliente AS (
    SELECT
      ct.cliente_id,
      COALESCE(ct.cliente_nome, 'Sem cliente') AS cliente_nome,
      ct.corretora,
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
          THEN ct.lotes_operados ELSE 0 END) AS lotes_op_futuros,
      SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
          THEN ct.lotes_zerados ELSE 0 END) AS lotes_ze_futuros
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
      AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
      AND (ct.cliente_id IS NOT NULL OR ct.cliente_nome IS NOT NULL)
      AND public.dashboard_acesso_ok()
    GROUP BY ct.cliente_id, ct.cliente_nome, ct.corretora,
             COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra')
  ),
  pr AS (
    SELECT p.corretora, norm_barra(p.barra_nome) AS chave,
           p.preco_lote_futuros, p.modelo_zeragem, p.preco_zeragem
    FROM public.assessor_pricing p WHERE p.ativo = true
  ),
  receita_cliente AS (
    SELECT
      a.cliente_id,
      a.cliente_nome,
      a.barra_nome,
      ROUND(
        COALESCE(pr.preco_lote_futuros, 0) * a.lotes_op_futuros
        + CASE pr.modelo_zeragem
            WHEN 'fixo'          THEN pr.preco_zeragem      * a.lotes_ze_futuros
            WHEN 'mesmo_operado' THEN pr.preco_lote_futuros * a.lotes_ze_futuros
            ELSE 0
          END,
        2
      ) AS receita
    FROM agg_cliente a
    LEFT JOIN pr ON pr.corretora = a.corretora AND pr.chave = norm_barra(a.barra_nome)
  ),
  total AS (SELECT COALESCE(SUM(receita), 0) AS tot FROM receita_cliente WHERE receita > 0),
  ranked AS (
    SELECT
      rc.cliente_id,
      rc.cliente_nome,
      rc.barra_nome,
      rc.receita,
      SUM(rc.receita) OVER (ORDER BY rc.receita DESC NULLS LAST
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acum,
      ROW_NUMBER() OVER (ORDER BY rc.receita DESC NULLS LAST)::integer AS rank
    FROM receita_cliente rc
    WHERE rc.receita > 0
  )
  SELECT
    r.rank,
    r.cliente_id,
    r.cliente_nome,
    NULLIF(r.barra_nome, 'Sem barra') AS assessor_nome,
    r.receita,
    CASE WHEN t.tot > 0 THEN ROUND(r.receita / t.tot * 100, 2) ELSE 0 END AS pct_individual,
    CASE WHEN t.tot > 0 THEN ROUND(r.acum / t.tot * 100, 2) ELSE 0 END AS pct_acumulado,
    CASE
      WHEN t.tot <= 0 THEN 'D'
      WHEN (r.acum / t.tot) <= 0.70 THEN 'A'
      WHEN (r.acum / t.tot) <= 0.90 THEN 'B'
      WHEN (r.acum / t.tot) <= 0.99 THEN 'C'
      ELSE 'D'
    END AS classe
  FROM ranked r, total t
  ORDER BY r.rank;
$$;
GRANT EXECUTE ON FUNCTION dashboard_curva_abc(date, date, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 7b. LTV — tarifa por (corretora, barra)
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_ltv_clientes(integer) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_ltv_clientes(p_limit integer DEFAULT 50)
RETURNS TABLE(
  rank integer,
  cliente_id uuid,
  cliente_nome text,
  assessor_nome text,
  primeira_op date,
  ultima_op date,
  meses_ativo integer,
  lotes_operados numeric,
  lotes_zerados numeric,
  receita_estimada numeric,
  receita_media_mensal numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH agg_cliente AS (
    SELECT
      ct.cliente_id,
      COALESCE(ct.cliente_nome, 'Sem cliente') AS cliente_nome,
      ct.corretora,
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      MIN(ct.data) AS primeira_op,
      MAX(ct.data) AS ultima_op,
      SUM(ct.lotes_operados) AS lotes_operados,
      SUM(ct.lotes_zerados)  AS lotes_zerados,
      SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
          THEN ct.lotes_operados ELSE 0 END) AS lotes_op_futuros
    FROM public.contratos ct
    WHERE (ct.cliente_id IS NOT NULL OR ct.cliente_nome IS NOT NULL)
      AND public.dashboard_acesso_ok()
    GROUP BY ct.cliente_id, ct.cliente_nome, ct.corretora,
             COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra')
  ),
  agg_cliente_dia AS (
    SELECT
      ct.cliente_id,
      COALESCE(ct.cliente_nome, 'Sem cliente') AS cliente_nome,
      ct.corretora,
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      ct.data,
      SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
          THEN ct.lotes_zerados ELSE 0 END) AS lotes_ze_dia
    FROM public.contratos ct
    WHERE (ct.cliente_id IS NOT NULL OR ct.cliente_nome IS NOT NULL)
      AND public.dashboard_acesso_ok()
    GROUP BY ct.cliente_id, ct.cliente_nome, ct.corretora,
             COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra'), ct.data
    HAVING SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
                    THEN ct.lotes_zerados ELSE 0 END) > 0
  ),
  pr AS (
    SELECT
      p.corretora, norm_barra(p.barra_nome) AS chave,
      p.id, p.preco_lote_futuros, p.modelo_zeragem, p.preco_zeragem
    FROM public.assessor_pricing p
    WHERE p.ativo = true
  ),
  receita_ze AS (
    SELECT
      acd.cliente_id,
      acd.cliente_nome,
      acd.corretora,
      acd.barra_nome,
      SUM(
        CASE pr.modelo_zeragem
          WHEN 'fixo'          THEN pr.preco_zeragem      * acd.lotes_ze_dia
          WHEN 'mesmo_operado' THEN pr.preco_lote_futuros * acd.lotes_ze_dia
          WHEN 'tiered'        THEN COALESCE((
            SELECT t.preco_zeragem
            FROM public.assessor_pricing_zeragem_tier t
            WHERE t.pricing_id = pr.id
              AND acd.lotes_ze_dia >= t.volume_min
              AND (t.volume_max IS NULL OR acd.lotes_ze_dia <= t.volume_max)
            ORDER BY t.ordem
            LIMIT 1
          ), 0) * acd.lotes_ze_dia
          ELSE 0
        END
      ) AS receita_zeragem
    FROM agg_cliente_dia acd
    LEFT JOIN pr ON pr.corretora = acd.corretora AND pr.chave = norm_barra(acd.barra_nome)
    GROUP BY acd.cliente_id, acd.cliente_nome, acd.corretora, acd.barra_nome
  ),
  combinado AS (
    SELECT
      a.cliente_id,
      a.cliente_nome,
      a.barra_nome,
      a.primeira_op,
      a.ultima_op,
      a.lotes_operados,
      a.lotes_zerados,
      a.lotes_op_futuros,
      pr.preco_lote_futuros,
      COALESCE(rz.receita_zeragem, 0) AS receita_zeragem
    FROM agg_cliente a
    LEFT JOIN pr ON pr.corretora = a.corretora AND pr.chave = norm_barra(a.barra_nome)
    LEFT JOIN receita_ze rz ON rz.cliente_id IS NOT DISTINCT FROM a.cliente_id
                            AND rz.cliente_nome = a.cliente_nome
                            AND rz.corretora = a.corretora
                            AND rz.barra_nome = a.barra_nome
  ),
  ranked AS (
    SELECT
      c.cliente_id,
      c.cliente_nome,
      c.barra_nome,
      c.primeira_op,
      c.ultima_op,
      c.lotes_operados,
      c.lotes_zerados,
      ROUND(
        COALESCE(c.preco_lote_futuros, 0) * c.lotes_op_futuros + c.receita_zeragem,
        2
      ) AS receita_estimada,
      GREATEST(1,
        ((EXTRACT(YEAR FROM c.ultima_op) - EXTRACT(YEAR FROM c.primeira_op)) * 12
         + EXTRACT(MONTH FROM c.ultima_op) - EXTRACT(MONTH FROM c.primeira_op))::integer + 1
      ) AS meses_ativo
    FROM combinado c
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY r.receita_estimada DESC NULLS LAST)::integer AS rank,
    r.cliente_id,
    r.cliente_nome,
    r.barra_nome,
    r.primeira_op,
    r.ultima_op,
    r.meses_ativo,
    r.lotes_operados,
    r.lotes_zerados,
    r.receita_estimada,
    ROUND(r.receita_estimada / NULLIF(r.meses_ativo, 0), 2) AS receita_media_mensal
  FROM ranked r
  ORDER BY r.receita_estimada DESC NULLS LAST
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION dashboard_ltv_clientes(integer) TO authenticated, service_role;

-- ---------------------------------------------
-- 7c. Ranking de assessores — por (corretora, barra), com filtro de corretora
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_ranking_assessores(date, date, date, date) CASCADE;
DROP FUNCTION IF EXISTS dashboard_ranking_assessores(date, date, date, date, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_ranking_assessores(
  p_inicio date,
  p_fim date,
  p_inicio_anterior date,
  p_fim_anterior date,
  p_corretora text DEFAULT NULL
)
RETURNS TABLE(
  rank integer,
  barra_nome text,
  numero text,
  clientes_ativos integer,
  clientes_anterior integer,
  clientes_novos integer,
  clientes_churn integer,
  taxa_retencao numeric,
  lotes_operados numeric,
  lotes_zerados numeric,
  pct_zeragem numeric,
  receita_total numeric,
  receita_anterior numeric,
  delta_receita_pct numeric,
  corretora text
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH atual AS (
    SELECT
      ct.corretora,
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key,
      ct.lotes_operados,
      ct.lotes_zerados
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND public.dashboard_acesso_ok()
  ),
  anterior AS (
    SELECT
      ct.corretora,
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio_anterior AND p_fim_anterior
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND public.dashboard_acesso_ok()
  ),
  metricas_atual AS (
    SELECT
      corretora, barra_nome,
      COUNT(DISTINCT cliente_key)::integer AS clientes_ativos,
      SUM(lotes_operados) AS lotes_operados,
      SUM(lotes_zerados) AS lotes_zerados
    FROM atual
    GROUP BY 1, 2
  ),
  metricas_anterior AS (
    SELECT
      corretora, barra_nome,
      COUNT(DISTINCT cliente_key)::integer AS clientes_anterior
    FROM anterior
    GROUP BY 1, 2
  ),
  novos AS (
    SELECT
      corretora, barra_nome,
      COUNT(DISTINCT cliente_key)::integer AS clientes_novos
    FROM (
      SELECT DISTINCT a.corretora, a.barra_nome, a.cliente_key
      FROM atual a
      LEFT JOIN anterior an ON an.corretora = a.corretora AND an.barra_nome = a.barra_nome AND an.cliente_key = a.cliente_key
      WHERE an.cliente_key IS NULL
    ) x
    GROUP BY 1, 2
  ),
  churn AS (
    SELECT
      corretora, barra_nome,
      COUNT(DISTINCT cliente_key)::integer AS clientes_churn
    FROM (
      SELECT DISTINCT an.corretora, an.barra_nome, an.cliente_key
      FROM anterior an
      LEFT JOIN atual a ON a.corretora = an.corretora AND a.barra_nome = an.barra_nome AND a.cliente_key = an.cliente_key
      WHERE a.cliente_key IS NULL
    ) x
    GROUP BY 1, 2
  ),
  retidos AS (
    SELECT
      corretora, barra_nome,
      COUNT(DISTINCT cliente_key)::integer AS clientes_retidos
    FROM (
      SELECT DISTINCT an.corretora, an.barra_nome, an.cliente_key
      FROM anterior an
      INNER JOIN atual a ON a.corretora = an.corretora AND a.barra_nome = an.barra_nome AND a.cliente_key = an.cliente_key
    ) x
    GROUP BY 1, 2
  ),
  receita_atual AS (
    SELECT corretora, barra_nome, receita_total
    FROM dashboard_contratos_receita_por_assessor(p_inicio, p_fim, p_corretora)
  ),
  receita_anterior_q AS (
    SELECT corretora, barra_nome, receita_total AS receita_anterior
    FROM dashboard_contratos_receita_por_assessor(p_inicio_anterior, p_fim_anterior, p_corretora)
  ),
  pricing AS (
    SELECT p.corretora, norm_barra(p.barra_nome) AS chave, p.numero
    FROM public.assessor_pricing p
    WHERE p.ativo = true
  ),
  combinado AS (
    SELECT
      ma.corretora,
      ma.barra_nome,
      pr.numero,
      ma.clientes_ativos,
      COALESCE(man.clientes_anterior, 0) AS clientes_anterior,
      COALESCE(n.clientes_novos, 0) AS clientes_novos,
      COALESCE(c.clientes_churn, 0) AS clientes_churn,
      COALESCE(re.clientes_retidos, 0) AS clientes_retidos,
      ma.lotes_operados,
      ma.lotes_zerados,
      COALESCE(ra.receita_total, 0) AS receita_total,
      COALESCE(ran.receita_anterior, 0) AS receita_anterior
    FROM metricas_atual ma
    LEFT JOIN metricas_anterior man ON man.corretora = ma.corretora AND man.barra_nome = ma.barra_nome
    LEFT JOIN novos n ON n.corretora = ma.corretora AND n.barra_nome = ma.barra_nome
    LEFT JOIN churn c ON c.corretora = ma.corretora AND c.barra_nome = ma.barra_nome
    LEFT JOIN retidos re ON re.corretora = ma.corretora AND re.barra_nome = ma.barra_nome
    LEFT JOIN receita_atual ra ON ra.corretora = ma.corretora AND ra.barra_nome = ma.barra_nome
    LEFT JOIN receita_anterior_q ran ON ran.corretora = ma.corretora AND ran.barra_nome = ma.barra_nome
    LEFT JOIN pricing pr ON pr.corretora = ma.corretora AND pr.chave = norm_barra(ma.barra_nome)
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY co.receita_total DESC NULLS LAST)::integer AS rank,
    co.barra_nome,
    co.numero,
    co.clientes_ativos,
    co.clientes_anterior,
    co.clientes_novos,
    co.clientes_churn,
    CASE WHEN co.clientes_anterior > 0
      THEN ROUND(co.clientes_retidos::numeric / co.clientes_anterior * 100, 2)
      ELSE 0 END AS taxa_retencao,
    co.lotes_operados,
    co.lotes_zerados,
    CASE WHEN co.lotes_operados > 0
      THEN ROUND(co.lotes_zerados / co.lotes_operados * 100, 2)
      ELSE 0 END AS pct_zeragem,
    co.receita_total,
    co.receita_anterior,
    CASE WHEN co.receita_anterior > 0
      THEN ROUND((co.receita_total - co.receita_anterior) / co.receita_anterior * 100, 2)
      WHEN co.receita_total > 0 THEN 100
      ELSE 0 END AS delta_receita_pct,
    co.corretora
  FROM combinado co
  ORDER BY co.receita_total DESC NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION dashboard_ranking_assessores(date, date, date, date, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 7d. Score do cliente — tarifa por (corretora, barra)
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_score_cliente(integer) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_score_cliente(p_limit integer DEFAULT 100)
RETURNS TABLE(
  rank integer,
  cliente_id uuid,
  cliente_nome text,
  assessor_nome text,
  score_financeiro integer,
  score_operacional integer,
  score_emocional integer,
  score_retencao integer,
  score_total integer,
  classificacao text
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      ct.cliente_id,
      COALESCE(ct.cliente_nome, 'Sem cliente') AS cliente_nome,
      ct.corretora,
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      ct.data,
      ct.lotes_operados,
      ct.lotes_zerados
    FROM public.contratos ct
    WHERE (ct.cliente_id IS NOT NULL OR ct.cliente_nome IS NOT NULL)
      AND public.dashboard_acesso_ok()
  ),
  agg AS (
    SELECT
      b.cliente_id,
      b.cliente_nome,
      MAX(b.corretora) AS corretora,
      MAX(b.barra_nome) AS barra_nome,
      MIN(b.data) AS primeira_op,
      MAX(b.data) AS ultima_op,
      COUNT(DISTINCT b.data)::integer AS dias_ativos,
      SUM(b.lotes_operados) AS lotes_op,
      SUM(b.lotes_zerados) AS lotes_ze
    FROM base b
    WHERE b.lotes_operados > 0
    GROUP BY b.cliente_id, b.cliente_nome
  ),
  pr AS (
    SELECT p.corretora, norm_barra(p.barra_nome) AS chave,
           p.preco_lote_futuros, p.modelo_zeragem, p.preco_zeragem
    FROM public.assessor_pricing p WHERE p.ativo = true
  ),
  enriched AS (
    SELECT
      a.cliente_id,
      a.cliente_nome,
      a.barra_nome,
      a.primeira_op,
      a.ultima_op,
      a.dias_ativos,
      a.lotes_op,
      a.lotes_ze,
      CASE WHEN a.lotes_op > 0 THEN a.lotes_ze / a.lotes_op * 100 ELSE 0 END AS pct_zeragem,
      ROUND(
        COALESCE(pr.preco_lote_futuros, 0) * a.lotes_op
        + CASE pr.modelo_zeragem
            WHEN 'fixo'          THEN pr.preco_zeragem      * a.lotes_ze
            WHEN 'mesmo_operado' THEN pr.preco_lote_futuros * a.lotes_ze
            ELSE 0
          END, 2
      ) AS receita,
      GREATEST(1,
        ((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM a.primeira_op)) * 12
        + EXTRACT(MONTH FROM CURRENT_DATE) - EXTRACT(MONTH FROM a.primeira_op))::integer + 1
      ) AS meses_total,
      (SELECT COUNT(DISTINCT DATE_TRUNC('month', b2.data))
       FROM base b2
       WHERE b2.cliente_id IS NOT DISTINCT FROM a.cliente_id
         AND b2.cliente_nome = a.cliente_nome
         AND b2.lotes_operados > 0)::integer AS meses_ativos
    FROM agg a
    LEFT JOIN pr ON pr.corretora = a.corretora AND pr.chave = norm_barra(a.barra_nome)
  ),
  percentis AS (
    SELECT
      MAX(receita) AS max_receita,
      MAX(dias_ativos) AS max_dias
    FROM enriched
  ),
  scored AS (
    SELECT
      e.*,
      LEAST(100, GREATEST(0, ROUND(e.receita / NULLIF(p.max_receita, 0) * 100)))::integer AS score_financeiro,
      LEAST(100, GREATEST(0, ROUND(e.dias_ativos::numeric / NULLIF(p.max_dias, 0) * 100)))::integer AS score_operacional,
      LEAST(100, GREATEST(0, ROUND(100 - e.pct_zeragem)))::integer AS score_emocional,
      LEAST(100, GREATEST(0, ROUND(e.meses_ativos::numeric / NULLIF(e.meses_total, 0) * 100)))::integer AS score_retencao
    FROM enriched e, percentis p
  ),
  com_total AS (
    SELECT
      s.*,
      ROUND(
        (s.score_financeiro * 0.35 + s.score_operacional * 0.25
         + s.score_emocional * 0.20 + s.score_retencao * 0.20)
      )::integer AS score_total
    FROM scored s
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY score_total DESC, score_financeiro DESC)::integer AS rank,
    cliente_id,
    cliente_nome,
    NULLIF(barra_nome, 'Sem barra') AS assessor_nome,
    score_financeiro,
    score_operacional,
    score_emocional,
    score_retencao,
    score_total,
    CASE
      WHEN score_total >= 75 THEN 'premium'
      WHEN score_total >= 50 THEN 'solido'
      WHEN score_total >= 30 THEN 'medio'
      ELSE 'fragil'
    END AS classificacao
  FROM com_total
  ORDER BY score_total DESC, score_financeiro DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION dashboard_score_cliente(integer) TO authenticated, service_role;

-- ---------------------------------------------
-- 8. Hardening (mesma rotina do S10) + reload do PostgREST
-- ---------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'dashboard\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
