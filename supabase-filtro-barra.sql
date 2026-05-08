-- =============================================
-- ZeveAI — Filtro global por barra/assessor
-- Adiciona parâmetro opcional `p_barra text DEFAULT NULL` nas funções
-- principais. Quando NULL, mantém o comportamento atual (todas as barras).
-- Quando preenchido, filtra com matching tolerante a acentos.
-- =============================================

-- Helper: mesma função TRANSLATE usada na receita, agora reutilizável.
CREATE OR REPLACE FUNCTION public.norm_barra(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT TRANSLATE(
    UPPER(TRIM(COALESCE(p, ''))),
    'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
    'AAAAAEEEEIIIIOOOOOUUUUC'
  );
$$;
GRANT EXECUTE ON FUNCTION public.norm_barra(text) TO authenticated, service_role;

-- =============================================
-- 1. KPIs com filtro de barra
-- =============================================
DROP FUNCTION IF EXISTS dashboard_contratos_kpis(date, date) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_kpis(date, date, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_kpis(
  p_inicio date,
  p_fim date,
  p_barra text DEFAULT NULL
)
RETURNS TABLE(
  volume_operados numeric,
  volume_zerados numeric,
  num_clientes_ativos integer,
  num_dias_com_dado integer,
  maior_dia_data date,
  maior_dia_lotes numeric,
  volume_hoje numeric,
  media_30d numeric,
  dataset_max date
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH periodo AS (
    SELECT
      COALESCE(SUM(lotes_operados), 0) AS op,
      COALESCE(SUM(lotes_zerados), 0)  AS ze,
      COUNT(DISTINCT COALESCE(cliente_id::text, cliente_nome)) FILTER (
        WHERE COALESCE(lotes_operados, 0) > 0
      ) AS clientes,
      COUNT(DISTINCT data) AS dias
    FROM public.contratos
    WHERE data BETWEEN p_inicio AND p_fim
      AND (p_barra IS NULL OR norm_barra(assessor_nome) = norm_barra(p_barra))
  ),
  maior AS (
    SELECT data AS d, SUM(lotes_operados) AS lotes
    FROM public.contratos
    WHERE data BETWEEN p_inicio AND p_fim
      AND (p_barra IS NULL OR norm_barra(assessor_nome) = norm_barra(p_barra))
    GROUP BY data
    ORDER BY 2 DESC
    LIMIT 1
  ),
  hoje AS (
    SELECT COALESCE(SUM(lotes_operados), 0) AS v
    FROM public.contratos
    WHERE data = CURRENT_DATE
      AND (p_barra IS NULL OR norm_barra(assessor_nome) = norm_barra(p_barra))
  ),
  ultimos30 AS (
    SELECT COALESCE(AVG(daily), 0) AS m
    FROM (
      SELECT data, SUM(lotes_operados) AS daily
      FROM public.contratos
      WHERE data BETWEEN CURRENT_DATE - INTERVAL '30 days' AND CURRENT_DATE - INTERVAL '1 day'
        AND (p_barra IS NULL OR norm_barra(assessor_nome) = norm_barra(p_barra))
      GROUP BY data
    ) s
  ),
  ds AS (
    SELECT MAX(data) AS m FROM public.contratos
    WHERE (p_barra IS NULL OR norm_barra(assessor_nome) = norm_barra(p_barra))
  )
  SELECT p.op, p.ze, p.clientes::integer, p.dias::integer,
         m.d, COALESCE(m.lotes, 0), h.v, ROUND(u.m::numeric, 2), ds.m
  FROM periodo p
  LEFT JOIN maior m ON true
  LEFT JOIN hoje h ON true
  LEFT JOIN ultimos30 u ON true
  LEFT JOIN ds ON true;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_kpis(date, date, text) TO authenticated, service_role;

-- =============================================
-- 2. Por produto com filtro
-- =============================================
DROP FUNCTION IF EXISTS dashboard_contratos_por_produto(date, date) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_por_produto(date, date, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_por_produto(
  p_inicio date, p_fim date, p_barra text DEFAULT NULL
)
RETURNS TABLE(
  produto text, lotes_operados numeric, lotes_zerados numeric,
  num_clientes integer, num_dias integer
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    contratos_produto(ativo) AS produto,
    COALESCE(SUM(lotes_operados), 0),
    COALESCE(SUM(lotes_zerados), 0),
    COUNT(DISTINCT COALESCE(cliente_id::text, cliente_nome))::integer,
    COUNT(DISTINCT data)::integer
  FROM public.contratos
  WHERE data BETWEEN p_inicio AND p_fim
    AND (p_barra IS NULL OR norm_barra(assessor_nome) = norm_barra(p_barra))
  GROUP BY 1
  ORDER BY 2 DESC;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_por_produto(date, date, text) TO authenticated, service_role;

-- =============================================
-- 3. Top clientes com filtro
-- =============================================
DROP FUNCTION IF EXISTS dashboard_contratos_top_clientes(date, date, integer) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_top_clientes(date, date, integer, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_top_clientes(
  p_inicio date, p_fim date,
  p_limit integer DEFAULT 20,
  p_barra text DEFAULT NULL
)
RETURNS TABLE(
  rank integer, cliente_id uuid, cliente_nome text, assessor_nome text,
  lotes_operados numeric, lotes_zerados numeric, pct_acumulado numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH agg AS (
    SELECT
      ct.cliente_id,
      COALESCE(c.nome, ct.cliente_nome, 'Sem cliente') AS nome,
      MAX(ct.assessor_nome) AS assessor_nome,
      SUM(ct.lotes_operados) AS lotes_op,
      SUM(ct.lotes_zerados)  AS lotes_ze
    FROM public.contratos ct
    LEFT JOIN public.clientes c ON ct.cliente_id = c.id
    WHERE ct.data BETWEEN p_inicio AND p_fim
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
    GROUP BY ct.cliente_id, COALESCE(c.nome, ct.cliente_nome, 'Sem cliente')
  ),
  total AS (SELECT NULLIF(SUM(lotes_op), 0) AS t FROM agg),
  ranked AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY lotes_op DESC) AS rk,
      cliente_id, nome, assessor_nome, lotes_op, lotes_ze,
      SUM(lotes_op) OVER (ORDER BY lotes_op DESC) AS acum
    FROM agg
  )
  SELECT
    r.rk::integer, r.cliente_id, r.nome, r.assessor_nome, r.lotes_op, r.lotes_ze,
    CASE WHEN t.t IS NULL THEN 0 ELSE ROUND(r.acum / t.t * 100, 2) END
  FROM ranked r, total t
  WHERE r.rk <= p_limit
  ORDER BY r.rk;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_top_clientes(date, date, integer, text) TO authenticated, service_role;

-- =============================================
-- 4. Diário produto com filtro
-- =============================================
DROP FUNCTION IF EXISTS dashboard_contratos_diario_produto(date, date) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_diario_produto(date, date, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_diario_produto(
  p_inicio date, p_fim date, p_barra text DEFAULT NULL
)
RETURNS TABLE(data date, produto text, lotes_operados numeric, lotes_zerados numeric)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT data, contratos_produto(ativo) AS produto,
    COALESCE(SUM(lotes_operados), 0), COALESCE(SUM(lotes_zerados), 0)
  FROM public.contratos
  WHERE data BETWEEN p_inicio AND p_fim
    AND (p_barra IS NULL OR norm_barra(assessor_nome) = norm_barra(p_barra))
  GROUP BY data, contratos_produto(ativo)
  ORDER BY data, produto;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_diario_produto(date, date, text) TO authenticated, service_role;

-- =============================================
-- 5. Heatmap com filtro
-- =============================================
DROP FUNCTION IF EXISTS dashboard_contratos_heatmap_dow(date, date) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_heatmap_dow(date, date, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_heatmap_dow(
  p_inicio date, p_fim date, p_barra text DEFAULT NULL
)
RETURNS TABLE(
  dow integer, semana_mes integer, num_dias integer,
  lotes_operados numeric, lotes_zerados numeric, media_diaria numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT data,
      EXTRACT(DOW FROM data)::integer AS dow,
      ((EXTRACT(DAY FROM data)::integer - 1) / 7 + 1) AS semana_mes,
      SUM(lotes_operados) AS op, SUM(lotes_zerados) AS ze
    FROM public.contratos
    WHERE data BETWEEN p_inicio AND p_fim
      AND (p_barra IS NULL OR norm_barra(assessor_nome) = norm_barra(p_barra))
    GROUP BY data
  )
  SELECT dow, semana_mes, COUNT(*)::integer,
    SUM(op), SUM(ze), ROUND(AVG(op)::numeric, 2)
  FROM base
  GROUP BY dow, semana_mes
  ORDER BY dow, semana_mes;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_heatmap_dow(date, date, text) TO authenticated, service_role;

-- =============================================
-- 6. Alertas com filtro
-- =============================================
DROP FUNCTION IF EXISTS dashboard_contratos_alertas(integer) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_alertas(integer, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_alertas(
  p_inativo_dias integer DEFAULT 30,
  p_barra text DEFAULT NULL
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
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
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
        AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
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
        AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
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
        AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
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
GRANT EXECUTE ON FUNCTION dashboard_contratos_alertas(integer, text) TO authenticated, service_role;
