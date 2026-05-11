-- =============================================
-- ZeveAI — Sprint 6: Aba Executivo expandida
--   - Receita liquida (% repasse) + bruta
--   - Receita por plataforma + por clearing
--   - Contratos girados detalhados por produto (com MTD, dia, mes ant, media)
--   - Distribuicao de zeragem por intensidade (leve/media/alta/total)
--   - Score Qualidade Operacional
--   - Metas por assessor + alertas executivos
-- Execute no SQL Editor do Supabase.
-- =============================================

-- 1. Novas colunas em assessor_pricing
ALTER TABLE public.assessor_pricing
  ADD COLUMN IF NOT EXISTS pct_repasse_escritorio NUMERIC(5,4) DEFAULT 0.5000,
  ADD COLUMN IF NOT EXISTS clearing TEXT DEFAULT 'Genial';

COMMENT ON COLUMN public.assessor_pricing.pct_repasse_escritorio IS
  'Fracao da receita bruta que o escritorio embolsa (0-1). 0.5 = 50%.';
COMMENT ON COLUMN public.assessor_pricing.clearing IS
  'Corretora/clearing house. Permite consolidar quando houver multiplas (Genial, XP, BTG...).';

-- 2. Tabela de metas por assessor
CREATE TABLE IF NOT EXISTS public.metas_assessor (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barra_nome    TEXT NOT NULL,
  ano           INTEGER NOT NULL,
  meta_lotes    NUMERIC(15,2) DEFAULT 0,
  meta_receita NUMERIC(15,2) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (barra_nome, ano)
);

CREATE INDEX IF NOT EXISTS metas_assessor_ano_idx ON public.metas_assessor (ano);

ALTER TABLE public.metas_assessor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "metas_assessor_admin" ON public.metas_assessor;
DROP POLICY IF EXISTS "metas_assessor_read"  ON public.metas_assessor;

CREATE POLICY "metas_assessor_admin" ON public.metas_assessor
  FOR ALL TO authenticated USING (get_my_role() = 'admin');
CREATE POLICY "metas_assessor_read" ON public.metas_assessor
  FOR SELECT TO authenticated USING (get_my_role() IN ('admin', 'vendedor'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_assessor TO authenticated;

-- =============================================
-- 3. Receita por produto com MTD/dia/mes anterior/media diaria
--    Retorna multiplas janelas para cada produto, pronto pra UI executiva.
-- =============================================
DROP FUNCTION IF EXISTS dashboard_contratos_por_produto_detalhado(date, date, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_por_produto_detalhado(
  p_inicio date,
  p_fim date,
  p_barra text DEFAULT NULL
)
RETURNS TABLE(
  produto text,
  lotes_dia numeric,         -- volume do ultimo dia do range
  lotes_mtd numeric,         -- volume no mes corrente
  lotes_mes_anterior numeric,
  lotes_periodo numeric,     -- volume no range escolhido
  media_diaria numeric,      -- volume / dias com dado
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
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
  ),
  base AS (
    SELECT
      contratos_produto(ct.ativo) AS produto,
      ct.data,
      ct.lotes_operados
    FROM public.contratos ct, bounds
    WHERE (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
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

GRANT EXECUTE ON FUNCTION dashboard_contratos_por_produto_detalhado(date, date, text) TO authenticated, service_role;

-- =============================================
-- 4. Distribuicao de zeragem (heuristica por intensidade diaria por cliente)
--    leve:   <30%   (operacao saudavel)
--    media:  30-70% (atencao)
--    alta:   70-95% (problematico)
--    total:  >95%   (compulsoria / cassino)
-- =============================================
DROP FUNCTION IF EXISTS dashboard_zeragem_distribuicao(date, date, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_zeragem_distribuicao(
  p_inicio date,
  p_fim date,
  p_barra text DEFAULT NULL
)
RETURNS TABLE(
  intensidade text,
  num_eventos integer,
  lotes_zerados numeric,
  pct_dos_zerados numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH agg_dia AS (
    SELECT
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key,
      ct.data,
      SUM(ct.lotes_operados) AS lotes_op_dia,
      SUM(ct.lotes_zerados) AS lotes_ze_dia
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
    GROUP BY 1, 2
    HAVING SUM(ct.lotes_zerados) > 0
  ),
  classificado AS (
    SELECT
      CASE
        WHEN lotes_op_dia = 0 OR lotes_ze_dia / lotes_op_dia < 0.30 THEN 'leve'
        WHEN lotes_ze_dia / lotes_op_dia < 0.70 THEN 'media'
        WHEN lotes_ze_dia / lotes_op_dia < 0.95 THEN 'alta'
        ELSE 'total'
      END AS intensidade,
      lotes_ze_dia
    FROM agg_dia
  ),
  total_ze AS (SELECT SUM(lotes_ze_dia) AS tot FROM classificado),
  por_int AS (
    SELECT
      intensidade,
      COUNT(*)::integer AS num_eventos,
      SUM(lotes_ze_dia) AS lotes_zerados
    FROM classificado
    GROUP BY intensidade
  )
  SELECT
    p.intensidade,
    p.num_eventos,
    p.lotes_zerados,
    CASE WHEN t.tot > 0 THEN ROUND(p.lotes_zerados / t.tot * 100, 2) ELSE 0 END AS pct_dos_zerados
  FROM por_int p, total_ze t
  ORDER BY
    CASE p.intensidade
      WHEN 'leve' THEN 1
      WHEN 'media' THEN 2
      WHEN 'alta' THEN 3
      WHEN 'total' THEN 4
    END;
$$;

GRANT EXECUTE ON FUNCTION dashboard_zeragem_distribuicao(date, date, text) TO authenticated, service_role;

-- =============================================
-- 5. Receita bruta vs liquida + por plataforma + por clearing
-- =============================================
DROP FUNCTION IF EXISTS dashboard_receita_bruta_liquida(date, date) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_receita_bruta_liquida(p_inicio date, p_fim date)
RETURNS TABLE(
  receita_bruta numeric,
  receita_liquida numeric,
  pct_repasse_medio numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH r AS (
    SELECT
      a.barra_nome,
      a.receita_total
    FROM dashboard_contratos_receita_por_assessor(p_inicio, p_fim) a
  ),
  pr AS (
    SELECT UPPER(TRIM(p.barra_nome)) AS chave,
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
  LEFT JOIN pr ON pr.chave = UPPER(TRIM(r.barra_nome));
$$;

GRANT EXECUTE ON FUNCTION dashboard_receita_bruta_liquida(date, date) TO authenticated, service_role;

-- Receita por plataforma (campo plataforma da tabela contratos)
DROP FUNCTION IF EXISTS dashboard_receita_por_plataforma(date, date) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_receita_por_plataforma(p_inicio date, p_fim date)
RETURNS TABLE(
  plataforma text,
  lotes_operados numeric,
  lotes_zerados numeric,
  num_clientes integer
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    COALESCE(NULLIF(TRIM(ct.plataforma), ''), 'Sem plataforma') AS plataforma,
    SUM(ct.lotes_operados) AS lotes_operados,
    SUM(ct.lotes_zerados)  AS lotes_zerados,
    COUNT(DISTINCT COALESCE(ct.cliente_id::text, ct.cliente_nome))::integer AS num_clientes
  FROM public.contratos ct
  WHERE ct.data BETWEEN p_inicio AND p_fim
  GROUP BY 1
  HAVING SUM(ct.lotes_operados) > 0
  ORDER BY 2 DESC;
$$;

GRANT EXECUTE ON FUNCTION dashboard_receita_por_plataforma(date, date) TO authenticated, service_role;

-- Receita por clearing (agrega pelo clearing da barra)
DROP FUNCTION IF EXISTS dashboard_receita_por_clearing(date, date) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_receita_por_clearing(p_inicio date, p_fim date)
RETURNS TABLE(
  clearing text,
  receita_total numeric,
  num_barras integer,
  lotes_operados numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH r AS (
    SELECT a.barra_nome, a.receita_total, a.lotes_operados
    FROM dashboard_contratos_receita_por_assessor(p_inicio, p_fim) a
  ),
  pr AS (
    SELECT UPPER(TRIM(p.barra_nome)) AS chave,
           COALESCE(p.clearing, 'Genial') AS clearing
    FROM public.assessor_pricing p WHERE p.ativo = true
  )
  SELECT
    COALESCE(pr.clearing, 'Genial') AS clearing,
    COALESCE(SUM(r.receita_total), 0) AS receita_total,
    COUNT(*)::integer AS num_barras,
    COALESCE(SUM(r.lotes_operados), 0) AS lotes_operados
  FROM r
  LEFT JOIN pr ON pr.chave = UPPER(TRIM(r.barra_nome))
  GROUP BY 1
  ORDER BY 2 DESC;
$$;

GRANT EXECUTE ON FUNCTION dashboard_receita_por_clearing(date, date) TO authenticated, service_role;

-- =============================================
-- 6. Score Qualidade Operacional
--    Score = receita_total / (1 + lotes_zerados / 100)
--    Quanto MAIOR, melhor (mais receita por unidade de zeragem).
-- =============================================
DROP FUNCTION IF EXISTS dashboard_score_qualidade_barras(date, date) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_score_qualidade_barras(p_inicio date, p_fim date)
RETURNS TABLE(
  rank integer,
  barra_nome text,
  numero text,
  lotes_operados numeric,
  lotes_zerados numeric,
  pct_zeragem numeric,
  receita_total numeric,
  score_qualidade numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      r.barra_nome,
      r.numero,
      r.lotes_operados,
      r.lotes_zerados,
      r.receita_total,
      CASE WHEN r.lotes_operados > 0
        THEN ROUND(r.lotes_zerados / r.lotes_operados * 100, 2)
        ELSE 0 END AS pct_zeragem,
      -- Score: receita / (1 + zerados/100), penaliza zeragem alta sem zerar denominator
      ROUND(r.receita_total / NULLIF(1 + r.lotes_zerados / 100.0, 0), 2) AS score_qualidade
    FROM dashboard_contratos_receita_por_assessor(p_inicio, p_fim) r
    WHERE r.lotes_operados > 0
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY base.score_qualidade DESC NULLS LAST)::integer AS rank,
    base.barra_nome,
    base.numero,
    base.lotes_operados,
    base.lotes_zerados,
    base.pct_zeragem,
    base.receita_total,
    base.score_qualidade
  FROM base
  ORDER BY score_qualidade DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION dashboard_score_qualidade_barras(date, date) TO authenticated, service_role;

-- =============================================
-- 7. Metas por assessor — realizado vs meta no ano
-- =============================================
DROP FUNCTION IF EXISTS dashboard_metas_assessor() CASCADE;
CREATE OR REPLACE FUNCTION dashboard_metas_assessor()
RETURNS TABLE(
  barra_nome text,
  numero text,
  ano integer,
  meta_receita numeric,
  realizado_receita numeric,
  pct_atingido numeric,
  status text  -- 'ok' (>= 95% do ritmo) | 'atencao' (80-95%) | 'critico' (<80%)
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH bounds AS (
    SELECT
      DATE_TRUNC('year', CURRENT_DATE)::date AS ano_ini,
      (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year' - INTERVAL '1 day')::date AS ano_fim,
      EXTRACT(YEAR FROM CURRENT_DATE)::integer AS ano_n,
      EXTRACT(DOY FROM CURRENT_DATE)::numeric AS doy,
      EXTRACT(DOY FROM (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year' - INTERVAL '1 day'))::numeric AS dias_ano
  ),
  realizado AS (
    SELECT
      r.barra_nome,
      r.receita_total AS realizado
    FROM dashboard_contratos_receita_por_assessor(
      (SELECT ano_ini FROM bounds), CURRENT_DATE
    ) r
  ),
  metas AS (
    SELECT
      m.barra_nome,
      m.meta_receita
    FROM public.metas_assessor m, bounds
    WHERE m.ano = bounds.ano_n
  ),
  pricing AS (
    SELECT UPPER(TRIM(p.barra_nome)) AS chave, p.numero
    FROM public.assessor_pricing p WHERE p.ativo = true
  ),
  combinado AS (
    SELECT
      COALESCE(m.barra_nome, r.barra_nome) AS barra_nome,
      COALESCE(m.meta_receita, 0) AS meta_receita,
      COALESCE(r.realizado, 0) AS realizado,
      bounds.ano_n,
      bounds.doy / bounds.dias_ano AS pct_ano_decorrido
    FROM metas m
    FULL OUTER JOIN realizado r ON r.barra_nome = m.barra_nome
    CROSS JOIN bounds
  )
  SELECT
    co.barra_nome,
    pr.numero,
    co.ano_n,
    co.meta_receita,
    co.realizado,
    CASE WHEN co.meta_receita > 0
      THEN ROUND(co.realizado / co.meta_receita * 100, 2)
      ELSE 0 END AS pct_atingido,
    CASE
      WHEN co.meta_receita <= 0 THEN 'sem_meta'
      WHEN co.realizado >= co.meta_receita * co.pct_ano_decorrido * 0.95 THEN 'ok'
      WHEN co.realizado >= co.meta_receita * co.pct_ano_decorrido * 0.80 THEN 'atencao'
      ELSE 'critico'
    END AS status
  FROM combinado co
  LEFT JOIN pricing pr ON pr.chave = UPPER(TRIM(co.barra_nome))
  WHERE co.meta_receita > 0 OR co.realizado > 0
  ORDER BY co.realizado DESC;
$$;

GRANT EXECUTE ON FUNCTION dashboard_metas_assessor() TO authenticated, service_role;

-- =============================================
-- 8. Alertas executivos (5 tipos novos)
-- =============================================
DROP FUNCTION IF EXISTS dashboard_alertas_executivos() CASCADE;
CREATE OR REPLACE FUNCTION dashboard_alertas_executivos()
RETURNS TABLE(
  tipo text,
  severidade text,
  titulo text,
  descricao text,
  valor numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH
  -- Alerta 1: Queda de receita em 5 dias
  receita_5d AS (
    SELECT COALESCE(SUM(receita_total), 0) AS valor
    FROM dashboard_contratos_receita_por_assessor(
      (CURRENT_DATE - INTERVAL '5 days')::date, CURRENT_DATE)
  ),
  receita_5d_ant AS (
    SELECT COALESCE(SUM(receita_total), 0) AS valor
    FROM dashboard_contratos_receita_por_assessor(
      (CURRENT_DATE - INTERVAL '10 days')::date, (CURRENT_DATE - INTERVAL '6 days')::date)
  ),
  -- Alerta 2: Clientes que reduziram operacao >40%
  vol_atual AS (
    SELECT
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key,
      SUM(ct.lotes_operados) AS lotes
    FROM public.contratos ct
    WHERE ct.data BETWEEN (CURRENT_DATE - INTERVAL '15 days')::date AND CURRENT_DATE
    GROUP BY 1
  ),
  vol_anterior AS (
    SELECT
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key,
      SUM(ct.lotes_operados) AS lotes
    FROM public.contratos ct
    WHERE ct.data BETWEEN (CURRENT_DATE - INTERVAL '30 days')::date AND (CURRENT_DATE - INTERVAL '16 days')::date
    GROUP BY 1
  ),
  reducao_clientes AS (
    SELECT COUNT(*)::integer AS num
    FROM vol_atual va
    JOIN vol_anterior vant ON vant.cliente_key = va.cliente_key
    WHERE vant.lotes > 0 AND (va.lotes / vant.lotes) < 0.6
  ),
  -- Alerta 3: Assessores abaixo da meta
  abaixo_meta AS (
    SELECT COUNT(*)::integer AS num
    FROM dashboard_metas_assessor()
    WHERE status IN ('atencao', 'critico')
  ),
  -- Alerta 4: Concentracao top 3 clientes
  top_clientes AS (
    SELECT
      COALESCE(ct.cliente_id::text, ct.cliente_nome) AS cliente_key,
      SUM(ct.lotes_operados) AS lotes
    FROM public.contratos ct
    WHERE ct.data >= (CURRENT_DATE - INTERVAL '30 days')::date
    GROUP BY 1
    ORDER BY 2 DESC NULLS LAST
    LIMIT 3
  ),
  total_periodo AS (
    SELECT COALESCE(SUM(lotes_operados), 0) AS lotes
    FROM public.contratos
    WHERE data >= (CURRENT_DATE - INTERVAL '30 days')::date
  ),
  concentracao AS (
    SELECT
      CASE WHEN tp.lotes > 0
        THEN ROUND(SUM(tc.lotes) / tp.lotes * 100, 1)
        ELSE 0 END AS pct
    FROM top_clientes tc, total_periodo tp
    GROUP BY tp.lotes
  ),
  -- Alerta 5: Aumento de zeragem compulsoria (intensidade alta/total)
  zer_atual AS (
    SELECT COALESCE(SUM(lotes_zerados), 0) AS lotes
    FROM dashboard_zeragem_distribuicao(
      (CURRENT_DATE - INTERVAL '15 days')::date, CURRENT_DATE, NULL)
    WHERE intensidade IN ('alta', 'total')
  ),
  zer_ant AS (
    SELECT COALESCE(SUM(lotes_zerados), 0) AS lotes
    FROM dashboard_zeragem_distribuicao(
      (CURRENT_DATE - INTERVAL '30 days')::date, (CURRENT_DATE - INTERVAL '16 days')::date, NULL)
    WHERE intensidade IN ('alta', 'total')
  ),
  todos AS (
    -- 1
    SELECT
      'queda_receita_5d'::text AS tipo,
      CASE WHEN r5a.valor > 0 AND (r5.valor / r5a.valor) < 0.82 THEN 'alta'
           WHEN r5a.valor > 0 AND (r5.valor / r5a.valor) < 0.95 THEN 'media'
           ELSE 'baixa' END AS severidade,
      'Receita dos ultimos 5 dias'::text AS titulo,
      CASE WHEN r5a.valor > 0
        THEN 'Variou ' || ROUND((r5.valor - r5a.valor) / r5a.valor * 100, 1) || '% vs 5d anteriores'
        ELSE 'Sem base de comparacao'
        END AS descricao,
      CASE WHEN r5a.valor > 0
        THEN ROUND((r5.valor - r5a.valor) / r5a.valor * 100, 2)
        ELSE 0 END AS valor
    FROM receita_5d r5, receita_5d_ant r5a
    WHERE r5a.valor > 0
    UNION ALL
    -- 2
    SELECT
      'clientes_reduziram', 'media',
      'Clientes reduzindo operacao',
      rc.num || ' clientes operaram <60% do volume vs 15d anteriores',
      rc.num::numeric
    FROM reducao_clientes rc
    WHERE rc.num > 0
    UNION ALL
    -- 3
    SELECT
      'assessores_abaixo_meta', 'alta',
      'Assessores fora de ritmo',
      ab.num || ' barras estao abaixo do ritmo da meta anual',
      ab.num::numeric
    FROM abaixo_meta ab
    WHERE ab.num > 0
    UNION ALL
    -- 4
    SELECT
      'concentracao_top_clientes',
      CASE WHEN c.pct > 40 THEN 'alta' WHEN c.pct > 25 THEN 'media' ELSE 'baixa' END,
      'Concentracao de receita',
      'Top 3 clientes representam ' || c.pct || '% do volume (30d)',
      c.pct
    FROM concentracao c
    WHERE c.pct > 15
    UNION ALL
    -- 5
    SELECT
      'zeragem_compulsoria_subindo',
      CASE WHEN za.lotes > 0 AND zant.lotes > 0 AND (za.lotes / zant.lotes) > 1.30 THEN 'alta' ELSE 'media' END,
      'Zeragem compulsoria em alta',
      CASE WHEN zant.lotes > 0
        THEN 'Eventos alta/total subiram ' || ROUND((za.lotes - zant.lotes) / zant.lotes * 100, 1) || '% nos ultimos 15d'
        ELSE za.lotes || ' lotes em zeragens >70% recentemente' END,
      CASE WHEN zant.lotes > 0
        THEN ROUND((za.lotes - zant.lotes) / zant.lotes * 100, 2)
        ELSE za.lotes END
    FROM zer_atual za, zer_ant zant
    WHERE za.lotes > 0 AND (zant.lotes = 0 OR (za.lotes / NULLIF(zant.lotes, 0)) > 1.10)
  )
  SELECT * FROM todos
  ORDER BY CASE severidade WHEN 'alta' THEN 1 WHEN 'media' THEN 2 WHEN 'baixa' THEN 3 ELSE 4 END;
$$;

GRANT EXECUTE ON FUNCTION dashboard_alertas_executivos() TO authenticated, service_role;
