-- =============================================
-- ZeveAI — Sprint 7: Aba Operacional expandida
--   - Fluxo operacional (nº sessões, frequência, dias com dado)
--   - Índice de Sobrevivência (sobreviventes / zerados)
--   - Score de Risco Operacional por cliente (4 sinais)
-- Execute no SQL Editor do Supabase.
-- =============================================

-- =============================================
-- 1. Fluxo operacional — agregados por período
-- =============================================
DROP FUNCTION IF EXISTS dashboard_fluxo_operacional(date, date, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_fluxo_operacional(
  p_inicio date,
  p_fim date,
  p_barra text DEFAULT NULL
)
RETURNS TABLE(
  num_sessoes integer,           -- dias distintos com volume no periodo
  num_dias_corridos integer,
  taxa_atividade numeric,        -- num_sessoes / num_dias_corridos
  num_clientes_ativos integer,
  sessoes_por_cliente numeric,   -- media de dias operados por cliente
  lotes_por_sessao numeric,      -- media de lotes por (cliente, dia)
  ticket_medio_diario numeric    -- volume total / num_sessoes
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      ct.data,
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key,
      ct.lotes_operados
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
  ),
  sessoes AS (
    SELECT
      cliente_key,
      COUNT(DISTINCT data)::integer AS dias_op,
      SUM(lotes_operados) AS lotes
    FROM base
    WHERE lotes_operados > 0
    GROUP BY cliente_key
  )
  SELECT
    COUNT(DISTINCT b.data) FILTER (WHERE b.lotes_operados > 0)::integer AS num_sessoes,
    (p_fim - p_inicio + 1)::integer AS num_dias_corridos,
    CASE WHEN (p_fim - p_inicio + 1) > 0
      THEN ROUND(COUNT(DISTINCT b.data) FILTER (WHERE b.lotes_operados > 0)::numeric / (p_fim - p_inicio + 1) * 100, 2)
      ELSE 0 END AS taxa_atividade,
    (SELECT COUNT(*) FROM sessoes)::integer AS num_clientes_ativos,
    CASE WHEN (SELECT COUNT(*) FROM sessoes) > 0
      THEN ROUND((SELECT SUM(dias_op) FROM sessoes)::numeric / (SELECT COUNT(*) FROM sessoes), 2)
      ELSE 0 END AS sessoes_por_cliente,
    CASE WHEN (SELECT SUM(dias_op) FROM sessoes) > 0
      THEN ROUND((SELECT SUM(lotes) FROM sessoes)::numeric / (SELECT SUM(dias_op) FROM sessoes), 2)
      ELSE 0 END AS lotes_por_sessao,
    CASE WHEN COUNT(DISTINCT b.data) FILTER (WHERE b.lotes_operados > 0) > 0
      THEN ROUND(SUM(b.lotes_operados)::numeric / COUNT(DISTINCT b.data) FILTER (WHERE b.lotes_operados > 0), 2)
      ELSE 0 END AS ticket_medio_diario
  FROM base b;
$$;

GRANT EXECUTE ON FUNCTION dashboard_fluxo_operacional(date, date, text) TO authenticated, service_role;

-- =============================================
-- 2. Índice de Sobrevivência
--    Sobrevivente: cliente que teve pelo menos um dia operando com
--                  zeragem < 95% (não foi virado totalmente).
--    Zerado:       cliente cujos dias TODOS terminaram com zeragem >= 95%
--                  (perdeu tudo em cada dia que operou).
--
--    Indice = num_sobreviventes / max(num_zerados, 1)
--    > 5  → mesa saudavel
--    1-5  → atencao
--    < 1  → alto risco
-- =============================================
DROP FUNCTION IF EXISTS dashboard_indice_sobrevivencia(date, date, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_indice_sobrevivencia(
  p_inicio date,
  p_fim date,
  p_barra text DEFAULT NULL
)
RETURNS TABLE(
  num_clientes_total integer,
  num_sobreviventes integer,
  num_zerados integer,
  indice numeric,
  pct_sobreviventes numeric,
  classificacao text   -- 'saudavel' | 'atencao' | 'alto_risco'
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key,
      ct.data,
      SUM(ct.lotes_operados) AS lotes_op,
      SUM(ct.lotes_zerados) AS lotes_ze
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
    GROUP BY 1, 2
    HAVING SUM(ct.lotes_operados) > 0
  ),
  classificado AS (
    SELECT
      cliente_key,
      -- foi zerado neste dia se >= 95% zerado
      bool_and(lotes_ze / lotes_op >= 0.95) AS sempre_zerado,
      bool_or(lotes_ze / lotes_op < 0.95) AS algum_dia_sobreviveu
    FROM base
    GROUP BY cliente_key
  ),
  agg AS (
    SELECT
      COUNT(*)::integer AS total,
      COUNT(*) FILTER (WHERE algum_dia_sobreviveu)::integer AS sobreviventes,
      COUNT(*) FILTER (WHERE sempre_zerado AND NOT algum_dia_sobreviveu)::integer AS zerados
    FROM classificado
  )
  SELECT
    a.total,
    a.sobreviventes,
    a.zerados,
    CASE WHEN a.zerados > 0 THEN ROUND(a.sobreviventes::numeric / a.zerados, 2)
         WHEN a.sobreviventes > 0 THEN 999
         ELSE 0 END AS indice,
    CASE WHEN a.total > 0
      THEN ROUND(a.sobreviventes::numeric / a.total * 100, 2)
      ELSE 0 END AS pct_sobreviventes,
    CASE
      WHEN a.zerados = 0 AND a.sobreviventes > 0 THEN 'saudavel'
      WHEN a.zerados > 0 AND (a.sobreviventes::numeric / a.zerados) > 5 THEN 'saudavel'
      WHEN a.zerados > 0 AND (a.sobreviventes::numeric / a.zerados) > 1 THEN 'atencao'
      ELSE 'alto_risco'
    END AS classificacao
  FROM agg a;
$$;

GRANT EXECUTE ON FUNCTION dashboard_indice_sobrevivencia(date, date, text) TO authenticated, service_role;

-- =============================================
-- 3. Score de Risco Operacional por cliente
--    Pontua 0-100 com 4 sinais:
--      +30 pontos — frequência subiu >50% (aumento de operações)
--      +25 pontos — volume médio diário subiu >50% (aumento de lote)
--      +30 pontos — eventos de zeragem >=95% subiram >50%
--      +15 pontos — % zeragem média subiu >20pp
--    Janelas: ultimos 15d vs 16-30d atrás.
--    Inclui clientes com >= 3 dias operados em ambas janelas.
-- =============================================
DROP FUNCTION IF EXISTS dashboard_risco_operacional(integer, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_risco_operacional(
  p_limit integer DEFAULT 50,
  p_barra text DEFAULT NULL
)
RETURNS TABLE(
  rank integer,
  cliente_id uuid,
  cliente_nome text,
  assessor_nome text,
  score_risco integer,
  dias_atual integer,
  dias_anterior integer,
  lotes_atual numeric,
  lotes_anterior numeric,
  pct_ze_atual numeric,
  pct_ze_anterior numeric,
  eventos_zer_atual integer,
  eventos_zer_anterior integer,
  motivo text         -- descricao dos sinais acionados
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH base_atual AS (
    SELECT
      ct.cliente_id,
      COALESCE(ct.cliente_nome, 'Sem cliente') AS cliente_nome,
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), '') AS assessor_nome,
      ct.data,
      SUM(ct.lotes_operados) AS lotes_op,
      SUM(ct.lotes_zerados) AS lotes_ze
    FROM public.contratos ct
    WHERE ct.data BETWEEN (CURRENT_DATE - INTERVAL '15 days')::date AND CURRENT_DATE
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
    GROUP BY 1, 2, 3, ct.data
    HAVING SUM(ct.lotes_operados) > 0
  ),
  base_anterior AS (
    SELECT
      ct.cliente_id,
      COALESCE(ct.cliente_nome, 'Sem cliente') AS cliente_nome,
      ct.data,
      SUM(ct.lotes_operados) AS lotes_op,
      SUM(ct.lotes_zerados) AS lotes_ze
    FROM public.contratos ct
    WHERE ct.data BETWEEN (CURRENT_DATE - INTERVAL '30 days')::date AND (CURRENT_DATE - INTERVAL '16 days')::date
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
    GROUP BY 1, 2, ct.data
    HAVING SUM(ct.lotes_operados) > 0
  ),
  agg_atual AS (
    SELECT
      cliente_id,
      cliente_nome,
      MAX(assessor_nome) AS assessor_nome,
      COUNT(DISTINCT data)::integer AS dias,
      SUM(lotes_op) AS lotes,
      CASE WHEN SUM(lotes_op) > 0 THEN ROUND(SUM(lotes_ze) / SUM(lotes_op) * 100, 2) ELSE 0 END AS pct_ze,
      COUNT(*) FILTER (WHERE lotes_op > 0 AND lotes_ze / lotes_op >= 0.95)::integer AS eventos_zer
    FROM base_atual
    GROUP BY cliente_id, cliente_nome
  ),
  agg_anterior AS (
    SELECT
      cliente_id,
      cliente_nome,
      COUNT(DISTINCT data)::integer AS dias,
      SUM(lotes_op) AS lotes,
      CASE WHEN SUM(lotes_op) > 0 THEN ROUND(SUM(lotes_ze) / SUM(lotes_op) * 100, 2) ELSE 0 END AS pct_ze,
      COUNT(*) FILTER (WHERE lotes_op > 0 AND lotes_ze / lotes_op >= 0.95)::integer AS eventos_zer
    FROM base_anterior
    GROUP BY cliente_id, cliente_nome
  ),
  combinado AS (
    SELECT
      a.cliente_id,
      a.cliente_nome,
      a.assessor_nome,
      a.dias AS dias_atual,
      COALESCE(b.dias, 0) AS dias_anterior,
      a.lotes AS lotes_atual,
      COALESCE(b.lotes, 0) AS lotes_anterior,
      a.pct_ze AS pct_ze_atual,
      COALESCE(b.pct_ze, 0) AS pct_ze_anterior,
      a.eventos_zer AS eventos_zer_atual,
      COALESCE(b.eventos_zer, 0) AS eventos_zer_anterior
    FROM agg_atual a
    LEFT JOIN agg_anterior b ON b.cliente_id IS NOT DISTINCT FROM a.cliente_id
                             AND b.cliente_nome = a.cliente_nome
    WHERE a.dias >= 3
  ),
  scored AS (
    SELECT
      c.*,
      -- Cada sinal: pontos + descricao
      (CASE WHEN c.dias_anterior > 0 AND (c.dias_atual::numeric / c.dias_anterior) > 1.50 THEN 30 ELSE 0 END
       + CASE WHEN c.lotes_anterior > 0 AND (c.lotes_atual / c.lotes_anterior) > 1.50 THEN 25 ELSE 0 END
       + CASE WHEN c.eventos_zer_anterior > 0 AND (c.eventos_zer_atual::numeric / c.eventos_zer_anterior) > 1.50 THEN 30
              WHEN c.eventos_zer_anterior = 0 AND c.eventos_zer_atual > 0 THEN 25
              ELSE 0 END
       + CASE WHEN (c.pct_ze_atual - c.pct_ze_anterior) > 20 THEN 15 ELSE 0 END
      )::integer AS score_risco,
      CONCAT_WS(' · ',
        CASE WHEN c.dias_anterior > 0 AND (c.dias_atual::numeric / c.dias_anterior) > 1.50
          THEN 'frequência ↑' || ROUND((c.dias_atual::numeric / c.dias_anterior - 1) * 100, 0) || '%' END,
        CASE WHEN c.lotes_anterior > 0 AND (c.lotes_atual / c.lotes_anterior) > 1.50
          THEN 'volume ↑' || ROUND((c.lotes_atual / c.lotes_anterior - 1) * 100, 0) || '%' END,
        CASE WHEN c.eventos_zer_anterior > 0 AND (c.eventos_zer_atual::numeric / c.eventos_zer_anterior) > 1.50
          THEN 'eventos zer ↑' || ROUND((c.eventos_zer_atual::numeric / c.eventos_zer_anterior - 1) * 100, 0) || '%'
             WHEN c.eventos_zer_anterior = 0 AND c.eventos_zer_atual > 0
          THEN c.eventos_zer_atual || ' evento(s) total novo(s)' END,
        CASE WHEN (c.pct_ze_atual - c.pct_ze_anterior) > 20
          THEN '%zer ↑' || ROUND(c.pct_ze_atual - c.pct_ze_anterior, 1) || 'pp' END
      ) AS motivo
    FROM combinado c
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY score_risco DESC, lotes_atual DESC)::integer AS rank,
    cliente_id,
    cliente_nome,
    NULLIF(assessor_nome, '') AS assessor_nome,
    score_risco,
    dias_atual,
    dias_anterior,
    lotes_atual,
    lotes_anterior,
    pct_ze_atual,
    pct_ze_anterior,
    eventos_zer_atual,
    eventos_zer_anterior,
    motivo
  FROM scored
  WHERE score_risco >= 25
  ORDER BY score_risco DESC, lotes_atual DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION dashboard_risco_operacional(integer, text) TO authenticated, service_role;
