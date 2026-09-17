-- =============================================
-- ZeveAI — S12: lotes por plataforma + filtro "excluir cliente"
-- Execute no SQL Editor do Supabase POR ÚLTIMO
-- (depois de supabase-s10-dados-reais.sql e supabase-s11-incentivo-fabricio.sql).
--
-- O que este arquivo adiciona:
--   1. norm_texto()                     — normaliza nome (maiúsculas, sem acento, sem espaços nas pontas)
--   2. Parâmetro p_excluir_cliente text DEFAULT NULL nas funções de LOTES do dashboard:
--        dashboard_contratos_kpis, _por_produto, _top_clientes, _diario_produto,
--        _evolucao_mensal, _drilldown_dia e dashboard_retencao_mensal.
--      NULL (padrão) = comportamento atual. Preenchido = ignora todas as linhas cujo
--      cliente_nome bate com o nome informado — ou seja, TODAS as contas do cliente.
--      (Receita, metas e demais funções não mudam: continuam do escritório inteiro.)
--   3. dashboard_lotes_por_plataforma() — NOVO: lotes por plataforma com período, barra e exclusão
--   4. dashboard_clientes_lista()       — NOVO: nomes de cliente pro seletor "Excluir cliente"
--   5. Hardening: REVOKE do anon nas funções novas/recriadas + reload do PostgREST
-- =============================================

-- ---------------------------------------------
-- 1. Normalização de texto (mesma regra da norm_barra)
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.norm_texto(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT TRANSLATE(
    UPPER(TRIM(COALESCE(p, ''))),
    'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
    'AAAAAEEEEIIIIOOOOOUUUUC'
  );
$$;
GRANT EXECUTE ON FUNCTION public.norm_texto(text) TO authenticated, service_role;

-- ---------------------------------------------
-- 2a. KPIs — com exclusão de cliente
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_kpis(date, date, text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_kpis(date, date, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_kpis(
  p_inicio date,
  p_fim date,
  p_barra text DEFAULT NULL,
  p_excluir_cliente text DEFAULT NULL
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
    WHERE (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
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
GRANT EXECUTE ON FUNCTION dashboard_contratos_kpis(date, date, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 2b. Por produto — com exclusão de cliente
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_por_produto(date, date, text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_por_produto(date, date, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_por_produto(
  p_inicio date, p_fim date, p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL
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
    AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
    AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
    AND public.dashboard_acesso_ok()
  GROUP BY 1
  ORDER BY 2 DESC;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_por_produto(date, date, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 2c. Top clientes — com exclusão de cliente
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_top_clientes(date, date, integer, text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_top_clientes(date, date, integer, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_top_clientes(
  p_inicio date, p_fim date,
  p_limit integer DEFAULT 20,
  p_barra text DEFAULT NULL,
  p_excluir_cliente text DEFAULT NULL
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
GRANT EXECUTE ON FUNCTION dashboard_contratos_top_clientes(date, date, integer, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 2d. Diário por produto — com exclusão de cliente
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_diario_produto(date, date, text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_diario_produto(date, date, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_diario_produto(
  p_inicio date, p_fim date, p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL
)
RETURNS TABLE(data date, produto text, lotes_operados numeric, lotes_zerados numeric)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT ct.data, contratos_produto(ct.ativo) AS produto,
    COALESCE(SUM(ct.lotes_operados), 0), COALESCE(SUM(ct.lotes_zerados), 0)
  FROM public.contratos ct
  WHERE ct.data BETWEEN p_inicio AND p_fim
    AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
    AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
    AND public.dashboard_acesso_ok()
  GROUP BY ct.data, contratos_produto(ct.ativo)
  ORDER BY ct.data, produto;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_diario_produto(date, date, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 2e. Evolução mensal — com exclusão de cliente
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_evolucao_mensal(text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_evolucao_mensal(text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_evolucao_mensal(
  p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL
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
    AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
    AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
    AND public.dashboard_acesso_ok()
  GROUP BY 1
  ORDER BY 1;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_evolucao_mensal(text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 2f. Drill-down do dia — com exclusão de cliente
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_drilldown_dia(date, text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_drilldown_dia(date, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_drilldown_dia(
  p_data date, p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL
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
GRANT EXECUTE ON FUNCTION dashboard_contratos_drilldown_dia(date, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 2g. Retenção e churn mês a mês — com exclusão de cliente
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_retencao_mensal(text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_retencao_mensal(text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_retencao_mensal(
  p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL
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
GRANT EXECUTE ON FUNCTION dashboard_retencao_mensal(text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 3. NOVO — Lotes por plataforma (período + barra + exclusão de cliente)
--    Plataforma = coluna `plataforma` da tabela contratos (vem do Excel).
--    Linhas sem plataforma aparecem como "Sem plataforma".
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_lotes_por_plataforma(date, date, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_lotes_por_plataforma(
  p_inicio date, p_fim date, p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL
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
    AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
    AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
    AND public.dashboard_acesso_ok()
  GROUP BY 1
  HAVING COALESCE(SUM(ct.lotes_operados), 0) > 0 OR COALESCE(SUM(ct.lotes_zerados), 0) > 0
  ORDER BY 2 DESC, 1;
$$;
GRANT EXECUTE ON FUNCTION dashboard_lotes_por_plataforma(date, date, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 4. NOVO — Lista de clientes pro seletor "Excluir cliente"
--    Agrupa por nome normalizado (um cliente com várias contas aparece uma vez),
--    ordenado por volume. O nome devolvido é o que o app manda de volta em
--    p_excluir_cliente — o match nas funções acima usa norm_texto dos dois lados.
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_clientes_lista() CASCADE;
CREATE OR REPLACE FUNCTION dashboard_clientes_lista()
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
    AND public.dashboard_acesso_ok()
  GROUP BY norm_texto(ct.cliente_nome)
  HAVING COALESCE(SUM(ct.lotes_operados), 0) > 0
  ORDER BY 2 DESC, 1
  LIMIT 1000;
$$;
GRANT EXECUTE ON FUNCTION dashboard_clientes_lista() TO authenticated, service_role;

-- ---------------------------------------------
-- 5. Hardening: nenhuma função do dashboard executável pela anon key
--    (mesma rotina do S10, repetida pra cobrir as funções recriadas aqui).
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

-- PostgREST precisa reler o schema pra enxergar as novas assinaturas
NOTIFY pgrst, 'reload schema';
