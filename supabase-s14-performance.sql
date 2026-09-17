-- =============================================
-- ZeveAI — S14: performance do dashboard (timeouts de 8 s)
-- Execute no SQL Editor do Supabase DEPOIS do supabase-s13-corretoras.sql.
--
-- Problema: com as 3 corretoras, a aba Executivo passou a rodar 4 cálculos de
-- meta (total + Genial + XP + BTG), cada um varrendo o ano inteiro (~3,7 s),
-- em paralelo com o resto. O banco passou dos 8 s de statement_timeout e
-- cancelou ("canceling statement due to statement timeout"). A aba Análises
-- já estourava sozinha em dashboard_score_cliente.
--
-- O que este arquivo faz:
--   1. dashboard_contratos_receita_por_assessor: uma passada só na tabela
--      (antes eram duas), produto calculado uma vez por linha, zeragem filtrada
--      antes de agrupar. Devolve também pct_repasse e receita_liquida por barra,
--      então receita total e bruta/líquida saem da mesma consulta.
--   2. dashboard_metas_anuais(): as 4 metas (TOTAL, GENIAL, XP, BTG) numa
--      única passada pelo ano — substitui 4 chamadas de dashboard_meta_anual.
--   3. dashboard_score_cliente: pré-agrega os meses ativos (antes era uma
--      subconsulta por cliente varrendo a tabela inteira).
--   4. receita_bruta_liquida e resumo_corretoras usam a receita_liquida já
--      calculada (sem refazer o join de tarifas).
--   5. statement_timeout do papel `authenticated` sobe de 8 s para 20 s.
--   6. Hardening + reload do PostgREST.
-- =============================================

-- ---------------------------------------------
-- 1. Receita por barra — uma passada, produto calculado 1x por linha
-- ---------------------------------------------
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
  corretora text,
  pct_repasse numeric,
  receita_liquida numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH base AS (
    -- Materializada 1x (é usada duas vezes abaixo). O produto (regex) é
    -- calculado uma única vez por linha.
    SELECT
      ct.corretora,
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key,
      ct.data,
      COALESCE(ct.lotes_operados, 0) AS lotes_operados,
      COALESCE(ct.lotes_zerados, 0)  AS lotes_zerados,
      (contratos_produto(ct.ativo) IN ('WIN', 'WDO')) AS futuros
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
      AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
      AND public.dashboard_acesso_ok()
  ),
  agg_barra AS (
    SELECT
      corretora,
      barra_nome,
      SUM(CASE WHEN futuros THEN lotes_operados ELSE 0 END) AS lotes_op_futuros,
      SUM(lotes_operados) AS lotes_operados,
      SUM(lotes_zerados)  AS lotes_zerados
    FROM base
    GROUP BY 1, 2
  ),
  -- Só linhas WIN/WDO com zeragem: é o que define a faixa diária por cliente
  agg_cliente_dia AS (
    SELECT corretora, barra_nome, cliente_key, data, SUM(lotes_zerados) AS lotes_ze_dia
    FROM base
    WHERE futuros AND lotes_zerados > 0
    GROUP BY 1, 2, 3, 4
  ),
  pr AS (
    SELECT
      p.corretora,
      norm_barra(p.barra_nome) AS chave,
      p.id, p.barra_nome, p.numero,
      p.preco_lote_futuros, p.modelo_zeragem, p.preco_zeragem,
      COALESCE(p.pct_repasse_escritorio, 0.50) AS pct_repasse
    FROM public.assessor_pricing p
    WHERE p.ativo = true
  ),
  receita_ze_diaria AS (
    SELECT
      acd.corretora,
      acd.barra_nome,
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
  ),
  final AS (
    SELECT
      a.barra_nome,
      pr.numero,
      COALESCE(pr.preco_lote_futuros, 0) AS preco_lote_futuros,
      COALESCE(pr.modelo_zeragem, 'b2b') AS modelo_zeragem,
      COALESCE(pr.preco_zeragem, 0)      AS preco_zeragem,
      a.lotes_operados,
      a.lotes_zerados,
      ROUND(COALESCE(pr.preco_lote_futuros, 0) * a.lotes_op_futuros, 2) AS receita_operados,
      ROUND(COALESCE(rz.receita_zeragem, 0), 2) AS receita_zeragem,
      a.corretora,
      COALESCE(pr.pct_repasse, 0.50) AS pct_repasse
    FROM agg_barra a
    LEFT JOIN pr ON pr.corretora = a.corretora AND pr.chave = norm_barra(a.barra_nome)
    LEFT JOIN receita_ze rz ON rz.corretora = a.corretora AND rz.barra_nome = a.barra_nome
  )
  SELECT
    f.barra_nome,
    f.numero,
    f.preco_lote_futuros,
    f.modelo_zeragem,
    f.preco_zeragem,
    f.lotes_operados,
    f.lotes_zerados,
    f.receita_operados,
    f.receita_zeragem,
    (f.receita_operados + f.receita_zeragem) AS receita_total,
    f.corretora,
    f.pct_repasse,
    ROUND((f.receita_operados + f.receita_zeragem) * f.pct_repasse, 2) AS receita_liquida
  FROM final f
  ORDER BY (f.receita_operados + f.receita_zeragem) DESC NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_receita_por_assessor(date, date, text, text, text) TO authenticated, service_role;

-- Dependentes recriados com o mesmo corpo (a saída da função acima mudou)
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
  SELECT
    COALESCE(SUM(r.receita_operados), 0),
    COALESCE(SUM(r.receita_zeragem),  0),
    COALESCE(SUM(r.receita_total),    0),
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE r.preco_lote_futuros = 0 AND r.modelo_zeragem = 'b2b')::integer
  FROM dashboard_contratos_receita_por_assessor(p_inicio, p_fim, p_corretora, p_barra, p_excluir_cliente) r;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_receita_total(date, date, text, text, text) TO authenticated, service_role;

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
  SELECT
    COALESCE(SUM(r.receita_total), 0) AS receita_bruta,
    COALESCE(SUM(r.receita_liquida), 0) AS receita_liquida,
    CASE WHEN SUM(r.receita_total) > 0
      THEN ROUND(SUM(r.receita_liquida) / SUM(r.receita_total) * 100, 2)
      ELSE 0 END AS pct_repasse_medio
  FROM dashboard_contratos_receita_por_assessor(p_inicio, p_fim, p_corretora, p_barra, p_excluir_cliente) r;
$$;
GRANT EXECUTE ON FUNCTION dashboard_receita_bruta_liquida(date, date, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 2. NOVO — Metas do ano de todos os escopos numa passada só
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_metas_anuais() CASCADE;
CREATE OR REPLACE FUNCTION dashboard_metas_anuais()
RETURNS TABLE(
  corretora text,
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
  escopos(e) AS (VALUES ('TOTAL'), ('GENIAL'), ('XP'), ('BTG')),
  lotes_corr AS (
    SELECT c.corretora, COALESCE(SUM(c.lotes_operados), 0) AS total
    FROM public.contratos c, anos a
    WHERE c.data BETWEEN a.ini AND a.h
      AND public.dashboard_acesso_ok()
    GROUP BY c.corretora
  ),
  receita_corr AS (
    SELECT r.corretora, COALESCE(SUM(r.receita_total), 0) AS total
    FROM anos a, LATERAL dashboard_contratos_receita_por_assessor(a.ini, a.h) r
    GROUP BY r.corretora
  ),
  realizado AS (
    SELECT
      e.e AS escopo,
      CASE WHEN e.e = 'TOTAL' THEN (SELECT COALESCE(SUM(total), 0) FROM lotes_corr)
           ELSE COALESCE((SELECT total FROM lotes_corr lc WHERE lc.corretora = e.e), 0) END AS lotes,
      CASE WHEN e.e = 'TOTAL' THEN (SELECT COALESCE(SUM(total), 0) FROM receita_corr)
           ELSE COALESCE((SELECT total FROM receita_corr rc WHERE rc.corretora = e.e), 0) END AS receita
    FROM escopos e
  ),
  uteis_restantes AS (
    SELECT GREATEST(COUNT(*), 1) AS n
    FROM anos a, generate_series(a.h + 1, a.fim, INTERVAL '1 day') g
    WHERE EXTRACT(ISODOW FROM g) BETWEEN 1 AND 5
  )
  SELECT
    r.escopo,
    a.ano,
    COALESCE(m.meta_lotes, 0),
    COALESCE(m.meta_receita, 0),
    r.lotes,
    r.receita,
    ROUND(r.lotes / NULLIF(m.meta_lotes, 0) * 100, 1),
    ROUND(r.receita / NULLIF(m.meta_receita, 0) * 100, 1),
    u.n::integer,
    ROUND(GREATEST(COALESCE(m.meta_lotes, 0) - r.lotes, 0) / u.n, 0),
    ROUND(GREATEST(COALESCE(m.meta_receita, 0) - r.receita, 0) / u.n, 2)
  FROM realizado r
  CROSS JOIN anos a
  CROSS JOIN uteis_restantes u
  LEFT JOIN public.metas_anuais m ON m.ano = a.ano AND m.corretora = r.escopo
  WHERE public.dashboard_acesso_ok()
  ORDER BY CASE r.escopo WHEN 'TOTAL' THEN 0 WHEN 'GENIAL' THEN 1 WHEN 'XP' THEN 2 ELSE 3 END;
$$;
GRANT EXECUTE ON FUNCTION dashboard_metas_anuais() TO authenticated, service_role;

-- ---------------------------------------------
-- 3. Score do cliente — meses ativos pré-agregados (era 1 subconsulta por cliente)
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
      COALESCE(ct.lotes_operados, 0) AS lotes_operados,
      COALESCE(ct.lotes_zerados, 0)  AS lotes_zerados
    FROM public.contratos ct
    WHERE (ct.cliente_id IS NOT NULL OR ct.cliente_nome IS NOT NULL)
      AND COALESCE(ct.lotes_operados, 0) > 0
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
      COUNT(DISTINCT DATE_TRUNC('month', b.data))::integer AS meses_ativos,
      SUM(b.lotes_operados) AS lotes_op,
      SUM(b.lotes_zerados) AS lotes_ze
    FROM base b
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
      a.meses_ativos,
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
      ) AS meses_total
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
-- 4. Resumo por corretora — receita líquida vem pronta da função de receita
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
  receita AS (
    SELECT r.corretora, SUM(r.receita_total) AS bruta, SUM(r.receita_liquida) AS liquida
    FROM dashboard_contratos_receita_por_assessor(p_inicio, p_fim, NULL, p_barra, p_excluir_cliente) r
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
-- 5. Limite de tempo por consulta do app: 8 s → 20 s
--    (o papel `authenticated` é o que o app usa; o PostgREST relê a config).
-- ---------------------------------------------
ALTER ROLE authenticated SET statement_timeout = '20s';

-- ---------------------------------------------
-- 6. Hardening (mesma rotina do S10) + reload do PostgREST
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
NOTIFY pgrst, 'reload config';
