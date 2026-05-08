-- =============================================
-- ZeveAI — Dashboard exclusivo de Contratos
-- Funções SQL agrupadas por bloco do dashboard.
-- Execute no SQL Editor do Supabase.
-- Todas as funções aceitam um intervalo (p_inicio, p_fim) — frontend
-- já manda os limites do filtro de período.
-- =============================================

-- Helper: extrai o símbolo do produto do campo ativo (ex: 'WINM26' → 'WIN').
-- Os ativos da B3 vêm com código de vencimento ('WINM26' = WIN + mês M + ano 26),
-- então pegamos *exatamente os 3 primeiros caracteres alfabéticos*. Versão antiga
-- usava `^[A-Za-z]+` e pegava 'WINM' inteiro, quebrando o filtro IN ('WIN','WDO').
DROP FUNCTION IF EXISTS public.contratos_produto(text) CASCADE;
CREATE OR REPLACE FUNCTION public.contratos_produto(p_ativo text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(UPPER(SUBSTRING(COALESCE(p_ativo, '') FROM '^[A-Za-z]{3}')), ''),
    'OUTRO'
  );
$$;

-- 1. KPIs principais do período
-- volume_operados, volume_zerados, num_clientes_ativos, num_dias_uteis,
-- maior_dia (data + lotes), volume_hoje, media_30d (encerrada antes do filtro),
-- dataset_max (data mais recente em contratos)
DROP FUNCTION IF EXISTS dashboard_contratos_kpis(date, date) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_kpis(p_inicio date, p_fim date)
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
  ),
  maior AS (
    SELECT data AS d, SUM(lotes_operados) AS lotes
    FROM public.contratos
    WHERE data BETWEEN p_inicio AND p_fim
    GROUP BY data
    ORDER BY 2 DESC
    LIMIT 1
  ),
  hoje AS (
    SELECT COALESCE(SUM(lotes_operados), 0) AS v
    FROM public.contratos
    WHERE data = CURRENT_DATE
  ),
  ultimos30 AS (
    -- Janela dos últimos 30 dias *anteriores* a hoje (pra hoje vs média 30d)
    SELECT COALESCE(AVG(daily), 0) AS m
    FROM (
      SELECT data, SUM(lotes_operados) AS daily
      FROM public.contratos
      WHERE data BETWEEN CURRENT_DATE - INTERVAL '30 days' AND CURRENT_DATE - INTERVAL '1 day'
      GROUP BY data
    ) s
  ),
  ds AS (
    SELECT MAX(data) AS m FROM public.contratos
  )
  SELECT
    p.op,
    p.ze,
    p.clientes::integer,
    p.dias::integer,
    m.d,
    COALESCE(m.lotes, 0),
    h.v,
    ROUND(u.m::numeric, 2),
    ds.m
  FROM periodo p
  LEFT JOIN maior m ON true
  LEFT JOIN hoje h ON true
  LEFT JOIN ultimos30 u ON true
  LEFT JOIN ds ON true;
$$;

-- 2. Volume por produto (WIN, WDO, BIT, IND, DOL, ...)
DROP FUNCTION IF EXISTS dashboard_contratos_por_produto(date, date) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_por_produto(p_inicio date, p_fim date)
RETURNS TABLE(
  produto text,
  lotes_operados numeric,
  lotes_zerados numeric,
  num_clientes integer,
  num_dias integer
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    contratos_produto(ativo) AS produto,
    COALESCE(SUM(lotes_operados), 0) AS lotes_operados,
    COALESCE(SUM(lotes_zerados),  0) AS lotes_zerados,
    COUNT(DISTINCT COALESCE(cliente_id::text, cliente_nome))::integer AS num_clientes,
    COUNT(DISTINCT data)::integer AS num_dias
  FROM public.contratos
  WHERE data BETWEEN p_inicio AND p_fim
  GROUP BY 1
  ORDER BY lotes_operados DESC;
$$;

-- 3. Pareto top N clientes por volume (operados) no período
DROP FUNCTION IF EXISTS dashboard_contratos_top_clientes(date, date, integer) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_top_clientes(
  p_inicio date,
  p_fim date,
  p_limit integer DEFAULT 20
)
RETURNS TABLE(
  rank integer,
  cliente_id uuid,
  cliente_nome text,
  assessor_nome text,
  lotes_operados numeric,
  lotes_zerados numeric,
  pct_acumulado numeric
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
    r.rk::integer,
    r.cliente_id,
    r.nome,
    r.assessor_nome,
    r.lotes_op,
    r.lotes_ze,
    CASE WHEN t.t IS NULL THEN 0 ELSE ROUND(r.acum / t.t * 100, 2) END
  FROM ranked r, total t
  WHERE r.rk <= p_limit
  ORDER BY r.rk;
$$;

-- 4. Lotes por dia × produto (pra gráfico WIN vs WDO etc + média móvel no front)
DROP FUNCTION IF EXISTS dashboard_contratos_diario_produto(date, date) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_diario_produto(p_inicio date, p_fim date)
RETURNS TABLE(
  data date,
  produto text,
  lotes_operados numeric,
  lotes_zerados numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    data,
    contratos_produto(ativo) AS produto,
    COALESCE(SUM(lotes_operados), 0) AS lotes_operados,
    COALESCE(SUM(lotes_zerados),  0) AS lotes_zerados
  FROM public.contratos
  WHERE data BETWEEN p_inicio AND p_fim
  GROUP BY data, contratos_produto(ativo)
  ORDER BY data, produto;
$$;

-- 5. Heatmap: volume médio por dia-da-semana × semana-do-mês
-- dow: 0 = dom, 1 = seg, ..., 6 = sáb (segue ISO do PG: 0..6 com 0=dom)
-- weekofmonth: 1..6 (semana corrida dentro do mês)
DROP FUNCTION IF EXISTS dashboard_contratos_heatmap_dow(date, date) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_heatmap_dow(p_inicio date, p_fim date)
RETURNS TABLE(
  dow integer,           -- 0..6 (0=dom)
  semana_mes integer,    -- 1..6
  num_dias integer,
  lotes_operados numeric,
  lotes_zerados numeric,
  media_diaria numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      data,
      EXTRACT(DOW FROM data)::integer AS dow,
      ((EXTRACT(DAY FROM data)::integer - 1) / 7 + 1) AS semana_mes,
      SUM(lotes_operados) AS op,
      SUM(lotes_zerados)  AS ze
    FROM public.contratos
    WHERE data BETWEEN p_inicio AND p_fim
    GROUP BY data
  )
  SELECT
    dow,
    semana_mes,
    COUNT(*)::integer,
    SUM(op),
    SUM(ze),
    ROUND(AVG(op)::numeric, 2)
  FROM base
  GROUP BY dow, semana_mes
  ORDER BY dow, semana_mes;
$$;

-- 6. Evolução mensal (tudo o que existe no dataset)
DROP FUNCTION IF EXISTS dashboard_contratos_evolucao_mensal() CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_evolucao_mensal()
RETURNS TABLE(
  mes_data date,
  lotes_operados numeric,
  lotes_zerados numeric,
  num_dias_uteis integer,
  num_clientes integer
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    DATE_TRUNC('month', data)::date AS mes_data,
    SUM(lotes_operados),
    SUM(lotes_zerados),
    COUNT(DISTINCT data)::integer,
    COUNT(DISTINCT COALESCE(cliente_id::text, cliente_nome))::integer
  FROM public.contratos
  WHERE data IS NOT NULL
  GROUP BY DATE_TRUNC('month', data)
  ORDER BY 1;
$$;

-- 7. Drill-down de um dia: totais + top 3 que giraram + top 3 que zeraram
-- Retorna 3 grupos identificados por tipo:
--   'totals'      → 1 linha com agregados
--   'top_girou'   → até 3 linhas com top clientes em lotes_operados
--   'top_zerou'   → até 3 linhas com top clientes em lotes_zerados
DROP FUNCTION IF EXISTS dashboard_contratos_drilldown_dia(date) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_drilldown_dia(p_data date)
RETURNS TABLE(
  tipo text,
  rank integer,
  cliente_id uuid,
  cliente_nome text,
  assessor_nome text,
  lotes_operados numeric,
  lotes_zerados numeric
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
    WHERE ct.data = p_data
    GROUP BY ct.cliente_id, COALESCE(c.nome, ct.cliente_nome, 'Sem cliente')
  ),
  total AS (
    SELECT
      'totals'::text AS tipo,
      0 AS rk,
      NULL::uuid AS cid,
      ('Total ' || TO_CHAR(p_data, 'DD/MM/YYYY'))::text AS nome,
      NULL::text AS assessor,
      COALESCE(SUM(lotes_op), 0) AS op,
      COALESCE(SUM(lotes_ze), 0) AS ze
    FROM agg
  ),
  top_op AS (
    SELECT
      'top_girou'::text AS tipo,
      ROW_NUMBER() OVER (ORDER BY lotes_op DESC)::integer AS rk,
      cliente_id, nome, assessor_nome, lotes_op, lotes_ze
    FROM agg
    WHERE lotes_op > 0
    ORDER BY lotes_op DESC
    LIMIT 3
  ),
  top_ze AS (
    SELECT
      'top_zerou'::text AS tipo,
      ROW_NUMBER() OVER (ORDER BY lotes_ze DESC)::integer AS rk,
      cliente_id, nome, assessor_nome, lotes_op, lotes_ze
    FROM agg
    WHERE lotes_ze > 0
    ORDER BY lotes_ze DESC
    LIMIT 3
  )
  SELECT tipo, rk, cid AS cliente_id, nome, assessor, op, ze FROM total
  UNION ALL
  SELECT tipo, rk, cliente_id, nome, assessor_nome, lotes_op, lotes_ze FROM top_op
  UNION ALL
  SELECT tipo, rk, cliente_id, nome, assessor_nome, lotes_op, lotes_ze FROM top_ze
  -- Ordena por índice porque "rank" colide com a função window homônima
  ORDER BY 1, 2;
$$;

-- =============================================
-- Permissões
-- =============================================
GRANT EXECUTE ON FUNCTION public.contratos_produto(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION dashboard_contratos_kpis(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION dashboard_contratos_por_produto(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION dashboard_contratos_top_clientes(date, date, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION dashboard_contratos_diario_produto(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION dashboard_contratos_heatmap_dow(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION dashboard_contratos_evolucao_mensal() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION dashboard_contratos_drilldown_dia(date) TO authenticated, service_role;
