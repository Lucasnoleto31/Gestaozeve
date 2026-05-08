-- =============================================
-- ZeveAI — Sprint 3: Análises avançadas
--   - Cohort de retenção (clientes por mês de entrada × meses subsequentes)
--   - LTV (top clientes por receita acumulada life-to-date)
--   - Ranking de assessores expandido (com comparação período anterior)
-- Execute no SQL Editor do Supabase.
-- =============================================

-- =============================================
-- 1. COHORT DE RETENÇÃO
--    Para cada mês-cohort (mês da primeira operação do cliente), conta
--    quantos clientes daquele cohort operaram em cada mês subsequente.
--    p_meses: tamanho da matriz (ex: 12 → cohort × 12 meses).
-- =============================================
DROP FUNCTION IF EXISTS dashboard_cohort_retencao(integer) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_cohort_retencao(p_meses integer DEFAULT 12)
RETURNS TABLE(
  cohort_mes date,
  mes_offset integer,
  clientes_ativos integer,
  cohort_size integer,
  retencao_pct numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH primeira_op AS (
    SELECT
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key,
      DATE_TRUNC('month', MIN(ct.data))::date AS cohort_mes
    FROM public.contratos ct
    WHERE ct.cliente_id IS NOT NULL OR ct.cliente_nome IS NOT NULL
    GROUP BY 1
  ),
  atividade AS (
    SELECT DISTINCT
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key,
      DATE_TRUNC('month', ct.data)::date AS mes_atividade
    FROM public.contratos ct
    WHERE ct.cliente_id IS NOT NULL OR ct.cliente_nome IS NOT NULL
  ),
  matriz AS (
    SELECT
      po.cohort_mes,
      ((EXTRACT(YEAR FROM a.mes_atividade) - EXTRACT(YEAR FROM po.cohort_mes)) * 12
       + EXTRACT(MONTH FROM a.mes_atividade) - EXTRACT(MONTH FROM po.cohort_mes))::integer AS mes_offset,
      a.cliente_key
    FROM primeira_op po
    JOIN atividade a ON a.cliente_key = po.cliente_key
  ),
  cohort_sizes AS (
    SELECT cohort_mes, COUNT(*)::integer AS cohort_size
    FROM primeira_op
    GROUP BY cohort_mes
  ),
  agg AS (
    SELECT
      m.cohort_mes,
      m.mes_offset,
      COUNT(DISTINCT m.cliente_key)::integer AS clientes_ativos
    FROM matriz m
    WHERE m.mes_offset BETWEEN 0 AND p_meses - 1
    GROUP BY 1, 2
  )
  SELECT
    a.cohort_mes,
    a.mes_offset,
    a.clientes_ativos,
    cs.cohort_size,
    CASE WHEN cs.cohort_size > 0
      THEN ROUND(a.clientes_ativos::numeric / cs.cohort_size * 100, 2)
      ELSE 0 END AS retencao_pct
  FROM agg a
  JOIN cohort_sizes cs ON cs.cohort_mes = a.cohort_mes
  WHERE a.cohort_mes >= (CURRENT_DATE - (p_meses || ' months')::interval)::date
  ORDER BY a.cohort_mes DESC, a.mes_offset ASC;
$$;

GRANT EXECUTE ON FUNCTION dashboard_cohort_retencao(integer) TO authenticated, service_role;

-- =============================================
-- 2. LTV — TOP CLIENTES POR RECEITA ACUMULADA
--    Calcula receita life-to-date por cliente, aplicando pricing por barra.
--    Considera receita de futuros (WIN/WDO) + zeragem (modelo da barra).
--    p_limit: top N clientes (default 50).
-- =============================================
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
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      MIN(ct.data) AS primeira_op,
      MAX(ct.data) AS ultima_op,
      SUM(ct.lotes_operados) AS lotes_operados,
      SUM(ct.lotes_zerados)  AS lotes_zerados,
      SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
          THEN ct.lotes_operados ELSE 0 END) AS lotes_op_futuros
    FROM public.contratos ct
    WHERE ct.cliente_id IS NOT NULL OR ct.cliente_nome IS NOT NULL
    GROUP BY ct.cliente_id, ct.cliente_nome, COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra')
  ),
  -- Zeragem por (cliente, dia) — mesmo padrão da função de receita
  agg_cliente_dia AS (
    SELECT
      ct.cliente_id,
      COALESCE(ct.cliente_nome, 'Sem cliente') AS cliente_nome,
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      ct.data,
      SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
          THEN ct.lotes_zerados ELSE 0 END) AS lotes_ze_dia
    FROM public.contratos ct
    WHERE ct.cliente_id IS NOT NULL OR ct.cliente_nome IS NOT NULL
    GROUP BY ct.cliente_id, ct.cliente_nome, COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra'), ct.data
    HAVING SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
                    THEN ct.lotes_zerados ELSE 0 END) > 0
  ),
  pr AS (
    SELECT
      UPPER(TRIM(p.barra_nome)) AS chave,
      p.id, p.preco_lote_futuros, p.modelo_zeragem, p.preco_zeragem
    FROM public.assessor_pricing p
    WHERE p.ativo = true
  ),
  receita_ze AS (
    SELECT
      acd.cliente_id,
      acd.cliente_nome,
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
    LEFT JOIN pr ON pr.chave = UPPER(TRIM(acd.barra_nome))
    GROUP BY acd.cliente_id, acd.cliente_nome
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
    LEFT JOIN pr ON pr.chave = UPPER(TRIM(a.barra_nome))
    LEFT JOIN receita_ze rz ON rz.cliente_id IS NOT DISTINCT FROM a.cliente_id
                            AND rz.cliente_nome = a.cliente_nome
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

-- =============================================
-- 3. RANKING DE ASSESSORES EXPANDIDO
--    Métricas detalhadas por barra com comparação ao período anterior:
--      - clientes únicos ativos (atual e anterior)
--      - lotes operados/zerados, % zeragem
--      - receita total + delta vs período anterior
--      - taxa de churn (clientes ativos no anterior que não operaram no atual)
-- =============================================
DROP FUNCTION IF EXISTS dashboard_ranking_assessores(date, date, date, date) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_ranking_assessores(
  p_inicio date,
  p_fim date,
  p_inicio_anterior date,
  p_fim_anterior date
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
  delta_receita_pct numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH atual AS (
    SELECT
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key,
      ct.lotes_operados,
      ct.lotes_zerados
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
  ),
  anterior AS (
    SELECT
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio_anterior AND p_fim_anterior
  ),
  metricas_atual AS (
    SELECT
      barra_nome,
      COUNT(DISTINCT cliente_key)::integer AS clientes_ativos,
      SUM(lotes_operados) AS lotes_operados,
      SUM(lotes_zerados) AS lotes_zerados
    FROM atual
    GROUP BY barra_nome
  ),
  metricas_anterior AS (
    SELECT
      barra_nome,
      COUNT(DISTINCT cliente_key)::integer AS clientes_anterior
    FROM anterior
    GROUP BY barra_nome
  ),
  -- Clientes que operaram no atual mas não no anterior
  novos AS (
    SELECT
      barra_nome,
      COUNT(DISTINCT cliente_key)::integer AS clientes_novos
    FROM (
      SELECT DISTINCT a.barra_nome, a.cliente_key
      FROM atual a
      LEFT JOIN anterior an ON an.barra_nome = a.barra_nome AND an.cliente_key = a.cliente_key
      WHERE an.cliente_key IS NULL
    ) x
    GROUP BY barra_nome
  ),
  -- Clientes que operaram no anterior mas não no atual
  churn AS (
    SELECT
      barra_nome,
      COUNT(DISTINCT cliente_key)::integer AS clientes_churn
    FROM (
      SELECT DISTINCT an.barra_nome, an.cliente_key
      FROM anterior an
      LEFT JOIN atual a ON a.barra_nome = an.barra_nome AND a.cliente_key = an.cliente_key
      WHERE a.cliente_key IS NULL
    ) x
    GROUP BY barra_nome
  ),
  -- Clientes presentes em ambos (retidos)
  retidos AS (
    SELECT
      barra_nome,
      COUNT(DISTINCT cliente_key)::integer AS clientes_retidos
    FROM (
      SELECT DISTINCT an.barra_nome, an.cliente_key
      FROM anterior an
      INNER JOIN atual a ON a.barra_nome = an.barra_nome AND a.cliente_key = an.cliente_key
    ) x
    GROUP BY barra_nome
  ),
  receita_atual AS (
    SELECT barra_nome, receita_total
    FROM dashboard_contratos_receita_por_assessor(p_inicio, p_fim)
  ),
  receita_anterior_q AS (
    SELECT barra_nome, receita_total AS receita_anterior
    FROM dashboard_contratos_receita_por_assessor(p_inicio_anterior, p_fim_anterior)
  ),
  pricing AS (
    SELECT UPPER(TRIM(p.barra_nome)) AS chave, p.numero
    FROM public.assessor_pricing p
    WHERE p.ativo = true
  ),
  combinado AS (
    SELECT
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
    LEFT JOIN metricas_anterior man ON man.barra_nome = ma.barra_nome
    LEFT JOIN novos n ON n.barra_nome = ma.barra_nome
    LEFT JOIN churn c ON c.barra_nome = ma.barra_nome
    LEFT JOIN retidos re ON re.barra_nome = ma.barra_nome
    LEFT JOIN receita_atual ra ON ra.barra_nome = ma.barra_nome
    LEFT JOIN receita_anterior_q ran ON ran.barra_nome = ma.barra_nome
    LEFT JOIN pricing pr ON pr.chave = UPPER(TRIM(ma.barra_nome))
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
      ELSE 0 END AS delta_receita_pct
  FROM combinado co
  ORDER BY co.receita_total DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION dashboard_ranking_assessores(date, date, date, date) TO authenticated, service_role;
