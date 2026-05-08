-- =============================================
-- ZeveAI — Alertas de qualidade + Acuracidade do modelo
-- Execute no SQL Editor do Supabase.
-- =============================================

-- =============================================
-- 1. Alertas — heurísticas puras em SQL
-- Tipos:
--   'inativo'        cliente operou nos últimos 90 dias mas zerou nos últimos N
--   'esfriando'      volume últimos 30d caiu > 50% vs 30d anteriores
--   'zeragem_alta'   % zeragem > 50% no período recente
--   'zeragem_concentrada' tomou >= X lotes zerados em <= 7 dias
-- =============================================
DROP FUNCTION IF EXISTS dashboard_contratos_alertas(integer) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_alertas(p_inativo_dias integer DEFAULT 30)
RETURNS TABLE(
  tipo text,
  severidade text,
  cliente_id uuid,
  cliente_nome text,
  assessor_nome text,
  metric_label text,
  metric_value text,
  detalhe text
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
    GROUP BY ct.cliente_id, COALESCE(c.nome, ct.cliente_nome, 'Sem cliente')
  ),
  -- (1) inativos: tinha volume nos últimos 90 dias, mas nada nos últimos N dias
  ina AS (
    SELECT
      'inativo'::text AS tipo,
      'media'::text   AS severidade,
      b.cliente_id, b.nome AS cliente_nome, b.assessor_nome,
      'Última operação'::text AS metric_label,
      TO_CHAR(b.ultima_op, 'DD/MM/YYYY') AS metric_value,
      ('Sem operar há ' || (CURRENT_DATE - b.ultima_op)::text || ' dias')::text AS detalhe
    FROM base b
    WHERE b.lotes_op > 0
      AND b.ultima_op < CURRENT_DATE - (p_inativo_dias || ' days')::interval
      AND b.ultima_op >= CURRENT_DATE - INTERVAL '90 days'
  ),
  -- (2) esfriando: queda > 50% no volume últimos 30d vs 30d anteriores
  esfr AS (
    SELECT
      'esfriando'::text AS tipo,
      CASE WHEN queda >= 0.8 THEN 'alta' ELSE 'media' END::text AS severidade,
      cliente_id, nome AS cliente_nome, assessor_nome,
      'Queda de volume'::text AS metric_label,
      ROUND(queda * 100, 1)::text || '%' AS metric_value,
      ('30d últimos: ' || lotes_recentes || ' · 30d anteriores: ' || lotes_anteriores)::text AS detalhe
    FROM (
      SELECT
        ct.cliente_id,
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
      GROUP BY ct.cliente_id, COALESCE(c.nome, ct.cliente_nome, 'Sem cliente')
    ) s
    WHERE queda >= 0.5 AND lotes_anteriores >= 10
  ),
  -- (3) zeragem alta: % zeragem > 50% nos últimos 30 dias com volume mínimo
  zalt AS (
    SELECT
      'zeragem_alta'::text AS tipo,
      CASE WHEN pct >= 0.7 THEN 'alta' ELSE 'media' END::text AS severidade,
      cliente_id, nome AS cliente_nome, assessor_nome,
      '% zeragem'::text AS metric_label,
      ROUND(pct * 100, 1)::text || '%' AS metric_value,
      ('Op: ' || lotes_op || ' · Ze: ' || lotes_ze || ' (últimos 30d)')::text AS detalhe
    FROM (
      SELECT
        ct.cliente_id,
        COALESCE(c.nome, ct.cliente_nome, 'Sem cliente') AS nome,
        MAX(ct.assessor_nome) AS assessor_nome,
        SUM(ct.lotes_operados) AS lotes_op,
        SUM(ct.lotes_zerados)  AS lotes_ze,
        CASE WHEN SUM(ct.lotes_operados) > 0
          THEN SUM(ct.lotes_zerados) / SUM(ct.lotes_operados)
          ELSE 0
        END AS pct
      FROM public.contratos ct
      LEFT JOIN public.clientes c ON ct.cliente_id = c.id
      WHERE ct.data >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY ct.cliente_id, COALESCE(c.nome, ct.cliente_nome, 'Sem cliente')
    ) s
    WHERE pct >= 0.5 AND lotes_op >= 10
  ),
  -- (4) zeragem concentrada: muita zeragem em janela curta (7 dias)
  zcon AS (
    SELECT
      'zeragem_concentrada'::text AS tipo,
      'alta'::text AS severidade,
      cliente_id, nome AS cliente_nome, assessor_nome,
      'Zeragem em 7 dias'::text AS metric_label,
      lotes_ze::text || ' lotes' AS metric_value,
      ('Concentrado em ' || TO_CHAR(janela_inicio, 'DD/MM') || ' a ' || TO_CHAR(janela_fim, 'DD/MM'))::text AS detalhe
    FROM (
      SELECT
        ct.cliente_id,
        COALESCE(c.nome, ct.cliente_nome, 'Sem cliente') AS nome,
        MAX(ct.assessor_nome) AS assessor_nome,
        SUM(ct.lotes_zerados) AS lotes_ze,
        MIN(ct.data) AS janela_inicio,
        MAX(ct.data) AS janela_fim
      FROM public.contratos ct
      LEFT JOIN public.clientes c ON ct.cliente_id = c.id
      WHERE ct.data >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY ct.cliente_id, COALESCE(c.nome, ct.cliente_nome, 'Sem cliente')
    ) s
    WHERE lotes_ze >= 50  -- limiar arbitrário; refinar depois
  ),
  -- Postgres não aceita ORDER BY com expressão (CASE) direto após UNION ALL —
  -- envolvemos num CTE pra poder ordenar pela severidade calculada.
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
    tipo,
    cliente_nome;
$$;

-- =============================================
-- 2. Acuracidade do modelo
-- "Modelo" usado: previsão do dia D = média móvel dos últimos 7 dias com dado
-- antes de D. Acuracidade calculada retrospectivamente sem precisar snapshot.
-- =============================================
DROP FUNCTION IF EXISTS dashboard_contratos_acuracidade(integer) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_acuracidade(p_lookback_days integer DEFAULT 60)
RETURNS TABLE(
  data date,
  previsto numeric,
  realizado numeric,
  erro numeric,
  pct_erro numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH daily AS (
    SELECT data, SUM(lotes_operados) AS lotes
    FROM public.contratos
    WHERE data IS NOT NULL
      AND data >= CURRENT_DATE - (p_lookback_days || ' days')::interval - INTERVAL '14 days'
      AND data <= CURRENT_DATE - INTERVAL '1 day'  -- ignora "hoje" (parcial)
    GROUP BY data
  ),
  with_pred AS (
    SELECT
      data,
      lotes,
      AVG(lotes) OVER (
        ORDER BY data
        ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING
      ) AS prev
    FROM daily
  )
  SELECT
    data,
    ROUND(prev::numeric, 2) AS previsto,
    lotes::numeric AS realizado,
    ROUND((lotes - prev)::numeric, 2) AS erro,
    CASE WHEN lotes > 0 THEN ROUND(((lotes - prev) / lotes * 100)::numeric, 2) ELSE NULL END AS pct_erro
  FROM with_pred
  WHERE prev IS NOT NULL
    AND data >= CURRENT_DATE - (p_lookback_days || ' days')::interval
  ORDER BY data;
$$;

-- 2.1 Resumo: MAPE + viés
DROP FUNCTION IF EXISTS dashboard_contratos_acuracidade_resumo(integer) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_acuracidade_resumo(p_lookback_days integer DEFAULT 60)
RETURNS TABLE(
  num_dias integer,
  mape numeric,
  vies numeric,
  vies_label text
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH a AS (
    SELECT * FROM dashboard_contratos_acuracidade(p_lookback_days)
  )
  SELECT
    COUNT(*)::integer AS num_dias,
    ROUND(AVG(ABS(pct_erro))::numeric, 2) AS mape,
    ROUND(AVG(erro)::numeric, 2) AS vies,
    CASE
      WHEN COUNT(*) = 0 THEN 'sem dados'
      WHEN AVG(erro) > 5  THEN 'subestima'   -- realizado > previsto → modelo subestima
      WHEN AVG(erro) < -5 THEN 'superestima' -- realizado < previsto → modelo superestima
      ELSE 'equilibrado'
    END AS vies_label
  FROM a
  WHERE pct_erro IS NOT NULL;
$$;

-- =============================================
-- Permissões
-- =============================================
GRANT EXECUTE ON FUNCTION dashboard_contratos_alertas(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION dashboard_contratos_acuracidade(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION dashboard_contratos_acuracidade_resumo(integer) TO authenticated, service_role;
