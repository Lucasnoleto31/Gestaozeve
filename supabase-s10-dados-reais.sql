-- =============================================
-- ZeveAI — S10: dados reais, retenção mensal e incentivo
-- Execute no SQL Editor do Supabase POR ÚLTIMO
-- (depois de supabase-filtro-barra.sql e dos sprints anteriores).
--
-- O que este arquivo corrige/adiciona:
--   1. brasil_hoje()            — "hoje" no fuso America/Sao_Paulo (o banco roda em UTC)
--   2. contratos_produto()      — aceita dígito na 3ª posição ('DI1F27' → 'DI1', antes caía em 'OUTRO')
--   3. contratos_conta_key()    — identidade de cliente por NÚMERO DE CONTA (fallback id/nome)
--   4. dashboard_contratos_kpis — clientes ativos por conta; média diária do período
--                                 (substitui volume_hoje/media_30d, que ignoravam o filtro)
--   5. por_produto/top_clientes — contagem por conta + correção do % acumulado (Pareto)
--   6. evolucao_mensal          — agora aceita filtro de barra + clientes por conta
--   7. drilldown_dia            — agora aceita filtro de barra
--   8. dashboard_retencao_mensal    — NOVO: churn/retenção mês a mês por conta
--   9. dashboard_incentivo_mensal   — NOVO: pontos × faixas de incentivo por mês
--  10. dashboard_incentivo_clientes — NOVO: detalhe de pontos por cliente num mês
--  11. receita_mes_projecao / meta_anual — projeção por PREGÕES (antes multiplicava
--                                 ritmo de pregão por dias corridos: ~40% inflada)
-- =============================================

-- ---------------------------------------------
-- 1. Hoje no fuso de Brasília
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.brasil_hoje()
RETURNS date
LANGUAGE sql STABLE
AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;
GRANT EXECUTE ON FUNCTION public.brasil_hoje() TO authenticated, service_role;

-- ---------------------------------------------
-- 2. Produto: 1 letra + 2 alfanuméricos ('WINM26'→WIN, 'DI1F27'→DI1)
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.contratos_produto(p_ativo text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(UPPER(SUBSTRING(TRIM(COALESCE(p_ativo, '')) FROM '^[A-Za-z][A-Za-z0-9]{2}')), 'OUTRO');
$$;
GRANT EXECUTE ON FUNCTION public.contratos_produto(text) TO authenticated, service_role;

-- ---------------------------------------------
-- 3. Identidade do cliente = número de conta
--    (fallback: cliente_id → nome, para linhas antigas sem conta)
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.contratos_conta_key(p_conta text, p_cliente_id uuid, p_nome text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(TRIM(COALESCE(p_conta, '')), ''),
    p_cliente_id::text,
    NULLIF(UPPER(TRIM(COALESCE(p_nome, ''))), ''),
    'sem_cliente'
  );
$$;
GRANT EXECUTE ON FUNCTION public.contratos_conta_key(text, uuid, text) TO authenticated, service_role;

-- Índice para as novas agregações por conta
CREATE INDEX IF NOT EXISTS contratos_numero_conta_idx ON public.contratos(numero_conta);

-- Guard de acesso: admin logado, service_role (chave do servidor) ou
-- sessão direta do SQL Editor (postgres). A anon key pública tem
-- auth.uid() nulo E auth.role() = 'anon' → bloqueada.
CREATE OR REPLACE FUNCTION public.dashboard_acesso_ok()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(auth.role(), '') = 'service_role'
      OR public.get_my_role() = 'admin'
      OR session_user IN ('postgres', 'supabase_admin');
$$;
REVOKE ALL ON FUNCTION public.dashboard_acesso_ok() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_acesso_ok() TO authenticated, service_role;

-- ---------------------------------------------
-- 4. KPIs — clientes por conta, média diária coerente com o filtro
-- ---------------------------------------------
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
  ultimo_dia_data date,
  ultimo_dia_lotes numeric,
  media_diaria numeric,
  dataset_max date
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT data,
      SUM(COALESCE(lotes_operados, 0)) AS op,
      SUM(COALESCE(lotes_zerados, 0))  AS ze,
      COUNT(DISTINCT contratos_conta_key(numero_conta, cliente_id, cliente_nome))
        FILTER (WHERE COALESCE(lotes_operados, 0) > 0) AS contas_dia
    FROM public.contratos
    WHERE data BETWEEN p_inicio AND p_fim
      AND (p_barra IS NULL OR norm_barra(assessor_nome) = norm_barra(p_barra))
      AND public.dashboard_acesso_ok()
    GROUP BY data
  ),
  periodo AS (
    SELECT
      COALESCE(SUM(op), 0) AS op,
      COALESCE(SUM(ze), 0) AS ze,
      COUNT(*) AS dias
    FROM base
  ),
  clientes AS (
    SELECT COUNT(DISTINCT contratos_conta_key(numero_conta, cliente_id, cliente_nome)) AS n
    FROM public.contratos
    WHERE data BETWEEN p_inicio AND p_fim
      AND COALESCE(lotes_operados, 0) > 0
      AND (p_barra IS NULL OR norm_barra(assessor_nome) = norm_barra(p_barra))
      AND public.dashboard_acesso_ok()
  ),
  maior AS (
    SELECT data AS d, op FROM base ORDER BY op DESC NULLS LAST, data DESC LIMIT 1
  ),
  ultimo AS (
    SELECT data AS d, op FROM base ORDER BY data DESC LIMIT 1
  ),
  ds AS (
    SELECT MAX(data) AS m FROM public.contratos
    WHERE (p_barra IS NULL OR norm_barra(assessor_nome) = norm_barra(p_barra))
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
GRANT EXECUTE ON FUNCTION dashboard_contratos_kpis(date, date, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 5a. Por produto — clientes por conta (só quem operou)
-- ---------------------------------------------
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
    COUNT(DISTINCT contratos_conta_key(numero_conta, cliente_id, cliente_nome))
      FILTER (WHERE COALESCE(lotes_operados, 0) > 0)::integer,
    COUNT(DISTINCT data)::integer
  FROM public.contratos
  WHERE data BETWEEN p_inicio AND p_fim
    AND (p_barra IS NULL OR norm_barra(assessor_nome) = norm_barra(p_barra))
    AND public.dashboard_acesso_ok()
  GROUP BY 1
  ORDER BY 2 DESC;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_por_produto(date, date, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 5b. Top clientes — agrupado por conta + Pareto com frame ROWS
--     (antes, clientes empatados recebiam o mesmo % acumulado)
-- ---------------------------------------------
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
GRANT EXECUTE ON FUNCTION dashboard_contratos_top_clientes(date, date, integer, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 6. Evolução mensal — com filtro de barra e clientes por conta
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_evolucao_mensal() CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_evolucao_mensal(text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_evolucao_mensal(p_barra text DEFAULT NULL)
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
    date_trunc('month', data)::date AS mes_data,
    COALESCE(SUM(lotes_operados), 0),
    COALESCE(SUM(lotes_zerados), 0),
    COUNT(DISTINCT data)::integer,
    COUNT(DISTINCT contratos_conta_key(numero_conta, cliente_id, cliente_nome))
      FILTER (WHERE COALESCE(lotes_operados, 0) > 0)::integer
  FROM public.contratos
  WHERE data IS NOT NULL
    AND (p_barra IS NULL OR norm_barra(assessor_nome) = norm_barra(p_barra))
    AND public.dashboard_acesso_ok()
  GROUP BY 1
  ORDER BY 1;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_evolucao_mensal(text) TO authenticated, service_role;

-- ---------------------------------------------
-- 7. Drill-down do dia — com filtro de barra
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_drilldown_dia(date) CASCADE;
DROP FUNCTION IF EXISTS dashboard_contratos_drilldown_dia(date, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_drilldown_dia(p_data date, p_barra text DEFAULT NULL)
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
GRANT EXECUTE ON FUNCTION dashboard_contratos_drilldown_dia(date, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 8. NOVO — Retenção e churn mês a mês (por número de conta)
--    "Ativos no mês" = contas que operaram (lotes_operados > 0).
--    "Continuaram" = mesmas contas operando no mês seguinte.
--    A última linha é parcial enquanto o mês seguinte ainda recebe dados.
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_retencao_mensal(text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_retencao_mensal(p_barra text DEFAULT NULL)
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
      date_trunc('month', data)::date AS mes,
      contratos_conta_key(numero_conta, cliente_id, cliente_nome) AS conta
    FROM public.contratos
    WHERE data IS NOT NULL
      AND COALESCE(lotes_operados, 0) > 0
      AND (p_barra IS NULL OR norm_barra(assessor_nome) = norm_barra(p_barra))
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
GRANT EXECUTE ON FUNCTION dashboard_retencao_mensal(text) TO authenticated, service_role;

-- ---------------------------------------------
-- 9. NOVO — Incentivo mensal por faixa de pontos
--    Pontos do cliente no mês = Σ lotes_operados × multiplicador do produto:
--      BIT 4× · DI1 1× · DOL 5× · ETR 3× · GLD 3× · IND 3× · SOL 3×
--      WDO 2× · WIN 1× · WSP 1×  (demais produtos: 0)
--    Faixas (cliente conta na MAIOR faixa atingida; "mais de" = estritamente >):
--      >1.000.000 → R$ 49.000   |  >750.000 → R$ 42.000  |  >500.000 → R$ 31.500
--      >300.000   → R$ 21.000   |  >150.000 → R$ 12.000  |  >50.000  → R$ 5.000
--      >10.000    → R$ 1.000    |  >5.000   → R$ 500     |  >1.000   → R$ 200
--    faixa_min = 0 é o "Resto" (ativos que não atingiram 1.000 pontos, valor 0).
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
      contratos_conta_key(numero_conta, cliente_id, cliente_nome) AS conta,
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

-- ---------------------------------------------
-- 10. NOVO — Detalhe do incentivo por cliente num mês
--     (pontos, faixa atual e quanto falta pra próxima faixa)
-- ---------------------------------------------
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
      (SELECT date_trunc('month', MAX(data))::date FROM public.contratos)
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
      contratos_conta_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome) AS conta,
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
    -- menor faixa ainda não atingida (precisa de pts > faixa_min)
    SELECT f.faixa_min FROM faixas f
    WHERE p.pts <= f.faixa_min
    ORDER BY f.faixa_min ASC LIMIT 1
  ) fp ON true
  ORDER BY p.pts DESC
  LIMIT 300;
$$;
GRANT EXECUTE ON FUNCTION dashboard_incentivo_clientes(date) TO authenticated, service_role;

-- ---------------------------------------------
-- 11a. Projeção do mês — ritmo por PREGÃO × pregões restantes (seg-sex)
--      Antes: ritmo por pregão × dias corridos → ~40% inflada.
--      Mantém o nome da coluna dias_corridos_restantes por compatibilidade,
--      mas o valor agora é de DIAS ÚTEIS restantes.
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_contratos_receita_mes_projecao() CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_receita_mes_projecao()
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
    FROM mes m, LATERAL dashboard_contratos_receita_por_assessor(m.ini, m.h) r
  ),
  dias AS (
    SELECT COUNT(DISTINCT c.data) AS com_dado
    FROM public.contratos c, mes m
    WHERE c.data BETWEEN m.ini AND m.h
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
GRANT EXECUTE ON FUNCTION dashboard_contratos_receita_mes_projecao() TO authenticated, service_role;

-- ---------------------------------------------
-- 11b. Meta anual — ritmo necessário por dias ÚTEIS restantes
--      Mantém nome dias_corridos_restantes por compatibilidade (valor = dias úteis).
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_meta_anual() CASCADE;
CREATE OR REPLACE FUNCTION dashboard_meta_anual()
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
  ritmo_receita_necessario numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH hoje AS (SELECT public.brasil_hoje() AS h),
  anos AS (
    SELECT EXTRACT(YEAR FROM h)::integer AS ano,
           make_date(EXTRACT(YEAR FROM h)::integer, 1, 1) AS ini,
           make_date(EXTRACT(YEAR FROM h)::integer, 12, 31) AS fim,
           h
    FROM hoje
  ),
  meta AS (
    SELECT m.ano, m.meta_lotes, m.meta_receita
    FROM public.metas_anuais m, anos a
    WHERE m.ano = a.ano
  ),
  lotes AS (
    SELECT COALESCE(SUM(c.lotes_operados), 0) AS total
    FROM public.contratos c, anos a
    WHERE c.data BETWEEN a.ini AND a.h
  ),
  receita AS (
    SELECT COALESCE(SUM(r.receita_total), 0) AS total
    FROM anos a, LATERAL dashboard_contratos_receita_por_assessor(a.ini, a.h) r
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
    ROUND(GREATEST(COALESCE(m.meta_receita, 0) - r.total, 0) / u.n, 2)
  FROM anos a
  LEFT JOIN meta m ON m.ano = a.ano
  CROSS JOIN lotes l
  CROSS JOIN receita r
  CROSS JOIN uteis_restantes u
  WHERE public.dashboard_acesso_ok();
$$;
GRANT EXECUTE ON FUNCTION dashboard_meta_anual() TO authenticated, service_role;

-- ---------------------------------------------
-- 12. Hardening: nenhuma função do dashboard fica executável pela
--     anon key pública. O Postgres concede EXECUTE a PUBLIC por padrão
--     ao criar funções, e os GRANTs dos sprints anteriores não removiam
--     isso — qualquer pessoa com a anon key (embutida no frontend)
--     conseguia chamar as RPCs SECURITY DEFINER e ler todos os dados.
-- ---------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE 'dashboard\_%'
           OR p.proname IN ('contratos_resumo', 'contratos_por_mes',
                            'contratos_por_assessor', 'contratos_por_cliente'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;
