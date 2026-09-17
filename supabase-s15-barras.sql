-- =============================================
-- ZeveAI — S15: ranking de barras, lista de barras, evolução por barra
-- Execute no SQL Editor do Supabase DEPOIS do supabase-s14-performance.sql.
--
-- O que este arquivo faz:
--   1. dashboard_ranking_assessores: devolve também lotes_anterior (pra variação
--      de lotes vs período anterior) e aceita p_excluir_cliente.
--   2. NOVO dashboard_barras_lista(p_corretora): barras que existem nos LOTES
--      (antes o filtro só listava barras com tarifa cadastrada).
--   3. NOVO dashboard_evolucao_mensal_barra(p_corretora, p_excluir_cliente):
--      lotes por mês × barra (últimos 12 meses) pro gráfico das maiores barras.
--   4. dashboard_contratos_por_produto_detalhado: aceita corretora e exclusão
--      de cliente (comparativo dia / mês / mês anterior por produto).
--   5. Limpeza de dados: unifica o nome do ARTUR (3 grafias por acento quebrado)
--      e manda pra "Sem barra" as linhas em que o nome da plataforma veio na
--      coluna de assessor (NELOGICA, METATRADER, NELOGICA_DT).
--   6. Hardening + reload do PostgREST.
-- =============================================

-- ---------------------------------------------
-- 1. Ranking de barras com lotes do período anterior
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_ranking_assessores(date, date, date, date, text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_ranking_assessores(date, date, date, date, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_ranking_assessores(
  p_inicio date,
  p_fim date,
  p_inicio_anterior date,
  p_fim_anterior date,
  p_corretora text DEFAULT NULL,
  p_excluir_cliente text DEFAULT NULL
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
  corretora text,
  lotes_anterior numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH atual AS (
    SELECT
      ct.corretora,
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key,
      COALESCE(ct.lotes_operados, 0) AS lotes_operados,
      COALESCE(ct.lotes_zerados, 0)  AS lotes_zerados
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
      AND public.dashboard_acesso_ok()
  ),
  anterior AS (
    SELECT
      ct.corretora,
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key,
      COALESCE(ct.lotes_operados, 0) AS lotes_operados
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio_anterior AND p_fim_anterior
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
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
      COUNT(DISTINCT cliente_key)::integer AS clientes_anterior,
      SUM(lotes_operados) AS lotes_anterior
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
    FROM dashboard_contratos_receita_por_assessor(p_inicio, p_fim, p_corretora, NULL, p_excluir_cliente)
  ),
  receita_anterior_q AS (
    SELECT corretora, barra_nome, receita_total AS receita_anterior
    FROM dashboard_contratos_receita_por_assessor(p_inicio_anterior, p_fim_anterior, p_corretora, NULL, p_excluir_cliente)
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
      COALESCE(man.lotes_anterior, 0) AS lotes_anterior,
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
    ROW_NUMBER() OVER (ORDER BY co.lotes_operados DESC NULLS LAST)::integer AS rank,
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
    co.corretora,
    co.lotes_anterior
  FROM combinado co
  ORDER BY co.lotes_operados DESC NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION dashboard_ranking_assessores(date, date, date, date, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 2. NOVO — Barras que existem nos lotes (pro filtro global)
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_barras_lista(text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_barras_lista(p_corretora text DEFAULT NULL)
RETURNS TABLE(
  corretora text,
  barra_nome text,
  numero text,
  lotes_operados numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH b AS (
    SELECT
      ct.corretora,
      norm_barra(ct.assessor_nome) AS chave,
      MIN(TRIM(ct.assessor_nome)) AS barra_nome,
      COALESCE(SUM(ct.lotes_operados), 0) AS lotes_operados
    FROM public.contratos ct
    WHERE NULLIF(TRIM(COALESCE(ct.assessor_nome, '')), '') IS NOT NULL
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND public.dashboard_acesso_ok()
    GROUP BY ct.corretora, norm_barra(ct.assessor_nome)
  ),
  pricing AS (
    SELECT p.corretora, norm_barra(p.barra_nome) AS chave, p.numero
    FROM public.assessor_pricing p
    WHERE p.ativo = true
  )
  SELECT b.corretora, b.barra_nome, pr.numero, b.lotes_operados
  FROM b
  LEFT JOIN pricing pr ON pr.corretora = b.corretora AND pr.chave = b.chave
  ORDER BY b.lotes_operados DESC, b.barra_nome;
$$;
GRANT EXECUTE ON FUNCTION dashboard_barras_lista(text) TO authenticated, service_role;

-- ---------------------------------------------
-- 3. NOVO — Lotes por mês × barra (últimos 12 meses)
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_evolucao_mensal_barra(text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_evolucao_mensal_barra(
  p_corretora text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL
)
RETURNS TABLE(
  mes_data date,
  corretora text,
  barra_nome text,
  lotes_operados numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    date_trunc('month', ct.data)::date AS mes_data,
    ct.corretora,
    COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
    COALESCE(SUM(ct.lotes_operados), 0)
  FROM public.contratos ct
  WHERE ct.data >= (date_trunc('month', public.brasil_hoje()) - INTERVAL '11 months')::date
    AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
    AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
    AND public.dashboard_acesso_ok()
  GROUP BY 1, 2, 3
  ORDER BY 1, 4 DESC;
$$;
GRANT EXECUTE ON FUNCTION dashboard_evolucao_mensal_barra(text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 4. Comparativo por produto (dia / mês / mês anterior) com corretora e exclusão
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_por_produto_detalhado(date, date, text) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_por_produto_detalhado(date, date, text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_por_produto_detalhado(
  p_inicio date,
  p_fim date,
  p_barra text DEFAULT NULL,
  p_excluir_cliente text DEFAULT NULL,
  p_corretora text DEFAULT NULL
)
RETURNS TABLE(
  produto text,
  lotes_dia numeric,
  lotes_mtd numeric,
  lotes_mes_anterior numeric,
  lotes_periodo numeric,
  media_diaria numeric,
  delta_pct_vs_mes_ant numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH bounds AS (
    SELECT
      DATE_TRUNC('month', p_fim::timestamp)::date AS mes_atual_ini,
      DATE_TRUNC('month', (p_fim - INTERVAL '1 month')::timestamp)::date AS mes_ant_ini,
      (DATE_TRUNC('month', p_fim::timestamp) - INTERVAL '1 day')::date AS mes_ant_fim,
      MAX(ct.data) AS dia_max
    FROM public.contratos ct
    WHERE ct.data <= p_fim
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
      AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
      AND public.dashboard_acesso_ok()
  ),
  base AS (
    SELECT
      contratos_produto(ct.ativo) AS produto,
      ct.data,
      COALESCE(ct.lotes_operados, 0) AS lotes_operados
    FROM public.contratos ct, bounds b
    WHERE ct.data >= LEAST(p_inicio, b.mes_ant_ini)
      AND ct.data <= p_fim
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
      AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
      AND public.dashboard_acesso_ok()
  ),
  agg AS (
    SELECT
      b.produto,
      SUM(CASE WHEN b.data BETWEEN p_inicio AND p_fim THEN b.lotes_operados ELSE 0 END) AS lotes_periodo,
      SUM(CASE WHEN b.data = (SELECT dia_max FROM bounds) THEN b.lotes_operados ELSE 0 END) AS lotes_dia,
      SUM(CASE WHEN b.data >= (SELECT mes_atual_ini FROM bounds) AND b.data <= p_fim THEN b.lotes_operados ELSE 0 END) AS lotes_mtd,
      SUM(CASE WHEN b.data BETWEEN (SELECT mes_ant_ini FROM bounds) AND (SELECT mes_ant_fim FROM bounds) THEN b.lotes_operados ELSE 0 END) AS lotes_mes_anterior,
      COUNT(DISTINCT CASE WHEN b.data BETWEEN p_inicio AND p_fim AND b.lotes_operados > 0 THEN b.data END) AS dias_com_dado
    FROM base b
    GROUP BY b.produto
  )
  SELECT
    a.produto,
    a.lotes_dia,
    a.lotes_mtd,
    a.lotes_mes_anterior,
    a.lotes_periodo,
    CASE WHEN a.dias_com_dado > 0 THEN ROUND(a.lotes_periodo / a.dias_com_dado, 2) ELSE 0 END AS media_diaria,
    CASE WHEN a.lotes_mes_anterior > 0
      THEN ROUND((a.lotes_mtd - a.lotes_mes_anterior) / a.lotes_mes_anterior * 100, 2)
      WHEN a.lotes_mtd > 0 THEN 100
      ELSE 0 END AS delta_pct_vs_mes_ant
  FROM agg a
  WHERE a.lotes_periodo > 0 OR a.lotes_mtd > 0 OR a.lotes_dia > 0
  ORDER BY a.lotes_periodo DESC;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_por_produto_detalhado(date, date, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 5. Limpeza de dados
-- ---------------------------------------------
-- 5a. ARTUR aparecia com 3 grafias (acento quebrado na importação); só uma casava
--     com a tarifa. Unifica no nome cadastrado nas tarifas.
UPDATE public.contratos
   SET assessor_nome = 'ARTUR AILTON FONSECA MARANHAO'
 WHERE assessor_nome IS DISTINCT FROM 'ARTUR AILTON FONSECA MARANHAO'
   AND norm_barra(assessor_nome) LIKE 'ARTUR AILTON FONSECA MARANH%';

-- 5b. Em alguns arquivos a coluna de assessor veio com o nome da PLATAFORMA
--     (NELOGICA, METATRADER, NELOGICA_DT). Não são barras: viram "Sem barra".
--     Se preferir manter como está, apague este bloco antes de rodar.
UPDATE public.contratos
   SET plataforma = COALESCE(NULLIF(TRIM(plataforma), ''), TRIM(assessor_nome)),
       assessor_nome = NULL
 WHERE UPPER(TRIM(COALESCE(assessor_nome, ''))) IN
       ('NELOGICA', 'NELOGICA_DT', 'NELOGICA_HB', 'METATRADER', 'TRYD_DT', 'TRYD',
        'SMARTTBOT', 'FLEXSCAN', 'TRADING_VIEW', 'PROTRADER', 'PROFIT', 'PROFIT PRO');

-- ---------------------------------------------
-- 6. Hardening + reload
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
