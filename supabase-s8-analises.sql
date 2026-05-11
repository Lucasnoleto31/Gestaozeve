-- =============================================
-- ZeveAI — Sprint 8: Analises avancadas
--   - Curva ABC de clientes (A/B/C/D por % acumulada)
--   - Score segmentado (financeiro/operacional/emocional/retencao)
--   - Clusterizacao heuristica (scalper/emocional/consistente/agressivo/swing)
--   - Correlacoes Pearson entre sinais comportamentais
--   - Indice "Risco do Escritorio" (0-100 consolidando 4 fatores)
-- Execute no SQL Editor do Supabase.
-- =============================================

-- =============================================
-- 1. Curva ABC de Clientes
--    A: clientes responsaveis pelos primeiros 70% da receita
--    B: 70-90%
--    C: 90-99%
--    D: > 99% (cauda, marginal)
-- =============================================
DROP FUNCTION IF EXISTS dashboard_curva_abc(date, date, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_curva_abc(
  p_inicio date,
  p_fim date,
  p_barra text DEFAULT NULL
)
RETURNS TABLE(
  rank integer,
  cliente_id uuid,
  cliente_nome text,
  assessor_nome text,
  receita_estimada numeric,
  pct_individual numeric,
  pct_acumulado numeric,
  classe text  -- 'A' | 'B' | 'C' | 'D'
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH agg_cliente AS (
    SELECT
      ct.cliente_id,
      COALESCE(ct.cliente_nome, 'Sem cliente') AS cliente_nome,
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
          THEN ct.lotes_operados ELSE 0 END) AS lotes_op_futuros,
      SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
          THEN ct.lotes_zerados ELSE 0 END) AS lotes_ze_futuros
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
      AND (ct.cliente_id IS NOT NULL OR ct.cliente_nome IS NOT NULL)
    GROUP BY ct.cliente_id, ct.cliente_nome, COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra')
  ),
  pr AS (
    SELECT UPPER(TRIM(p.barra_nome)) AS chave,
           p.preco_lote_futuros, p.modelo_zeragem, p.preco_zeragem
    FROM public.assessor_pricing p WHERE p.ativo = true
  ),
  receita_cliente AS (
    SELECT
      a.cliente_id,
      a.cliente_nome,
      a.barra_nome,
      ROUND(
        COALESCE(pr.preco_lote_futuros, 0) * a.lotes_op_futuros
        + CASE pr.modelo_zeragem
            WHEN 'fixo'          THEN pr.preco_zeragem      * a.lotes_ze_futuros
            WHEN 'mesmo_operado' THEN pr.preco_lote_futuros * a.lotes_ze_futuros
            ELSE 0  -- tiered exigiria detalhamento por dia, simplificacao OK pra ABC
          END,
        2
      ) AS receita
    FROM agg_cliente a
    LEFT JOIN pr ON pr.chave = UPPER(TRIM(a.barra_nome))
  ),
  total AS (SELECT COALESCE(SUM(receita), 0) AS tot FROM receita_cliente WHERE receita > 0),
  ranked AS (
    SELECT
      rc.cliente_id,
      rc.cliente_nome,
      rc.barra_nome,
      rc.receita,
      SUM(rc.receita) OVER (ORDER BY rc.receita DESC NULLS LAST
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acum,
      ROW_NUMBER() OVER (ORDER BY rc.receita DESC NULLS LAST)::integer AS rank
    FROM receita_cliente rc
    WHERE rc.receita > 0
  )
  SELECT
    r.rank,
    r.cliente_id,
    r.cliente_nome,
    NULLIF(r.barra_nome, 'Sem barra') AS assessor_nome,
    r.receita,
    CASE WHEN t.tot > 0 THEN ROUND(r.receita / t.tot * 100, 2) ELSE 0 END AS pct_individual,
    CASE WHEN t.tot > 0 THEN ROUND(r.acum / t.tot * 100, 2) ELSE 0 END AS pct_acumulado,
    CASE
      WHEN t.tot <= 0 THEN 'D'
      WHEN (r.acum / t.tot) <= 0.70 THEN 'A'
      WHEN (r.acum / t.tot) <= 0.90 THEN 'B'
      WHEN (r.acum / t.tot) <= 0.99 THEN 'C'
      ELSE 'D'
    END AS classe
  FROM ranked r, total t
  ORDER BY r.rank;
$$;

GRANT EXECUTE ON FUNCTION dashboard_curva_abc(date, date, text) TO authenticated, service_role;

-- =============================================
-- 2. Score segmentado do cliente (4 dimensoes 0-100)
--    Financeiro:  receita gerada (percentil)
--    Operacional: consistencia (frequencia + dias)
--    Emocional:   inverso da % zeragem (1 - pct/100)*100
--    Retencao:    meses ativos / meses desde primeira op
-- =============================================
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
  classificacao text  -- 'premium' | 'solido' | 'medio' | 'frágil'
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      ct.cliente_id,
      COALESCE(ct.cliente_nome, 'Sem cliente') AS cliente_nome,
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      ct.data,
      ct.lotes_operados,
      ct.lotes_zerados
    FROM public.contratos ct
    WHERE ct.cliente_id IS NOT NULL OR ct.cliente_nome IS NOT NULL
  ),
  agg AS (
    SELECT
      b.cliente_id,
      b.cliente_nome,
      MAX(b.barra_nome) AS barra_nome,
      MIN(b.data) AS primeira_op,
      MAX(b.data) AS ultima_op,
      COUNT(DISTINCT b.data)::integer AS dias_ativos,
      SUM(b.lotes_operados) AS lotes_op,
      SUM(b.lotes_zerados) AS lotes_ze
    FROM base b
    WHERE b.lotes_operados > 0
    GROUP BY b.cliente_id, b.cliente_nome
  ),
  pr AS (
    SELECT UPPER(TRIM(p.barra_nome)) AS chave,
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
      -- meses desde primeira operacao
      GREATEST(1,
        ((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM a.primeira_op)) * 12
        + EXTRACT(MONTH FROM CURRENT_DATE) - EXTRACT(MONTH FROM a.primeira_op))::integer + 1
      ) AS meses_total,
      -- meses ativos: meses com dia operado
      (SELECT COUNT(DISTINCT DATE_TRUNC('month', b2.data))
       FROM base b2
       WHERE b2.cliente_id IS NOT DISTINCT FROM a.cliente_id
         AND b2.cliente_nome = a.cliente_nome
         AND b2.lotes_operados > 0)::integer AS meses_ativos
    FROM agg a
    LEFT JOIN pr ON pr.chave = UPPER(TRIM(a.barra_nome))
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
      -- Financeiro: receita / max_receita * 100
      LEAST(100, GREATEST(0, ROUND(e.receita / NULLIF(p.max_receita, 0) * 100)))::integer AS score_financeiro,
      -- Operacional: dias_ativos / max_dias * 100
      LEAST(100, GREATEST(0, ROUND(e.dias_ativos::numeric / NULLIF(p.max_dias, 0) * 100)))::integer AS score_operacional,
      -- Emocional: 100 - %zeragem (clamp 0-100)
      LEAST(100, GREATEST(0, ROUND(100 - e.pct_zeragem)))::integer AS score_emocional,
      -- Retencao: meses_ativos / meses_total * 100
      LEAST(100, GREATEST(0, ROUND(e.meses_ativos::numeric / NULLIF(e.meses_total, 0) * 100)))::integer AS score_retencao
    FROM enriched e, percentis p
  ),
  com_total AS (
    SELECT
      s.*,
      -- score_total = media ponderada (financeiro pesa mais)
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

-- =============================================
-- 3. Clusterizacao heuristica de clientes
--    scalper:     alta frequencia (>=10 dias/mes) + volume diario alto
--    emocional:   alta %zeragem (>=50%) com frequencia >= 4 dias/mes
--    consistente: baixa %zeragem (<25%) + frequencia >= 6 dias/mes
--    agressivo:   lotes/dia no top 10% + %zeragem >= 30%
--    swing:       baixa frequencia (<4 dias/mes) com volume mensal relevante
--    casual:      resto (volume baixo, frequencia baixa)
-- =============================================
DROP FUNCTION IF EXISTS dashboard_clusters_clientes() CASCADE;
CREATE OR REPLACE FUNCTION dashboard_clusters_clientes()
RETURNS TABLE(
  cluster text,
  num_clientes integer,
  pct_base numeric,
  lotes_total numeric,
  pct_lotes numeric,
  lotes_medio_dia numeric,
  pct_zeragem_medio numeric,
  dias_medio_mes numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key,
      ct.data,
      ct.lotes_operados,
      ct.lotes_zerados
    FROM public.contratos ct
    WHERE ct.data >= (CURRENT_DATE - INTERVAL '90 days')::date
      AND (ct.cliente_id IS NOT NULL OR ct.cliente_nome IS NOT NULL)
  ),
  agg AS (
    SELECT
      cliente_key,
      COUNT(DISTINCT data) AS dias_op,
      SUM(lotes_operados) AS lotes_op,
      SUM(lotes_zerados) AS lotes_ze,
      ROUND(SUM(lotes_operados) / NULLIF(COUNT(DISTINCT data), 0)::numeric, 2) AS lotes_dia
    FROM base
    WHERE lotes_operados > 0
    GROUP BY cliente_key
  ),
  enriched AS (
    SELECT
      a.*,
      -- frequencia (dias por mes, considerando janela de 3 meses = 90 dias)
      ROUND(a.dias_op / 3.0, 2) AS dias_mes,
      CASE WHEN a.lotes_op > 0 THEN ROUND(a.lotes_ze / a.lotes_op * 100, 2) ELSE 0 END AS pct_ze,
      -- percentil 90 de lotes/dia
      PERCENT_RANK() OVER (ORDER BY a.lotes_dia) AS perc_lotes_dia
    FROM agg a
  ),
  classificado AS (
    SELECT
      e.*,
      CASE
        WHEN e.dias_mes >= 10 AND e.lotes_dia >= 50 THEN 'scalper'
        WHEN e.pct_ze >= 50 AND e.dias_mes >= 4 THEN 'emocional'
        WHEN e.pct_ze < 25 AND e.dias_mes >= 6 THEN 'consistente'
        WHEN e.perc_lotes_dia >= 0.9 AND e.pct_ze >= 30 THEN 'agressivo'
        WHEN e.dias_mes < 4 AND e.lotes_op >= 50 THEN 'swing'
        ELSE 'casual'
      END AS cluster
    FROM enriched e
  ),
  total AS (
    SELECT COUNT(*) AS total_clientes, SUM(lotes_op) AS total_lotes FROM classificado
  )
  SELECT
    c.cluster,
    COUNT(*)::integer AS num_clientes,
    ROUND(COUNT(*)::numeric / t.total_clientes * 100, 2) AS pct_base,
    SUM(c.lotes_op) AS lotes_total,
    ROUND(SUM(c.lotes_op) / NULLIF(t.total_lotes, 0) * 100, 2) AS pct_lotes,
    ROUND(AVG(c.lotes_dia), 2) AS lotes_medio_dia,
    ROUND(AVG(c.pct_ze), 2) AS pct_zeragem_medio,
    ROUND(AVG(c.dias_mes), 2) AS dias_medio_mes
  FROM classificado c, total t
  GROUP BY c.cluster, t.total_clientes, t.total_lotes
  ORDER BY
    CASE c.cluster
      WHEN 'consistente' THEN 1
      WHEN 'scalper' THEN 2
      WHEN 'swing' THEN 3
      WHEN 'agressivo' THEN 4
      WHEN 'emocional' THEN 5
      WHEN 'casual' THEN 6
    END;
$$;

GRANT EXECUTE ON FUNCTION dashboard_clusters_clientes() TO authenticated, service_role;

-- =============================================
-- 4. Correlacoes de Pearson entre sinais comportamentais
--    Calcula r entre pares de variaveis agregadas por cliente:
--      pct_zeragem × variacao_volume   (zeragem alta destroe volume futuro?)
--      lotes_dia × dias_mes            (quem opera muito tambem opera por muitos dias?)
--      pct_zeragem × dias_mes          (quem zera mais opera mais?)
--      lotes_op × pct_zeragem          (volume bruto correlaciona com zeragem?)
--    -1 a 1, |r| > 0.5 = correlacao forte
-- =============================================
DROP FUNCTION IF EXISTS dashboard_correlacoes() CASCADE;
CREATE OR REPLACE FUNCTION dashboard_correlacoes()
RETURNS TABLE(
  par text,
  descricao text,
  r numeric,
  forca text,        -- 'forte' | 'moderada' | 'fraca' | 'sem_relacao'
  direcao text,      -- 'positiva' | 'negativa' | 'nula'
  num_amostras integer
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key,
      ct.data,
      ct.lotes_operados,
      ct.lotes_zerados
    FROM public.contratos ct
    WHERE ct.data >= (CURRENT_DATE - INTERVAL '90 days')::date
      AND (ct.cliente_id IS NOT NULL OR ct.cliente_nome IS NOT NULL)
  ),
  por_cliente AS (
    SELECT
      cliente_key,
      COUNT(DISTINCT data) AS dias_mes,
      SUM(lotes_operados) AS lotes_op,
      CASE WHEN SUM(lotes_operados) > 0
        THEN SUM(lotes_zerados) / SUM(lotes_operados) * 100
        ELSE 0 END AS pct_ze,
      SUM(lotes_operados)::numeric / NULLIF(COUNT(DISTINCT data), 0) AS lotes_dia
    FROM base
    WHERE lotes_operados > 0
    GROUP BY cliente_key
  ),
  variacao AS (
    -- variacao de volume: lotes mes recente vs mes anterior
    SELECT
      cliente_key,
      SUM(CASE WHEN data >= (CURRENT_DATE - INTERVAL '30 days')::date
               THEN lotes_operados ELSE 0 END) AS lotes_recente,
      SUM(CASE WHEN data BETWEEN (CURRENT_DATE - INTERVAL '60 days')::date
                              AND (CURRENT_DATE - INTERVAL '31 days')::date
               THEN lotes_operados ELSE 0 END) AS lotes_anterior
    FROM base
    GROUP BY cliente_key
  ),
  combinado AS (
    SELECT
      p.cliente_key,
      p.dias_mes,
      p.lotes_op,
      p.pct_ze,
      p.lotes_dia,
      CASE WHEN v.lotes_anterior > 0
        THEN (v.lotes_recente - v.lotes_anterior) / v.lotes_anterior
        ELSE 0 END AS variacao_volume
    FROM por_cliente p
    JOIN variacao v ON v.cliente_key = p.cliente_key
    WHERE p.dias_mes >= 3  -- minimo de amostras
  ),
  pares AS (
    SELECT 'zeragem_x_variacao' AS par,
           'Zeragem ↑ → volume futuro ↓ (churn antecipado?)' AS descricao,
           CORR(pct_ze, variacao_volume) AS r,
           COUNT(*) AS n
    FROM combinado
    UNION ALL
    SELECT 'lote_x_frequencia',
           'Quem opera muito também opera por muitos dias?',
           CORR(lotes_dia, dias_mes),
           COUNT(*)
    FROM combinado
    UNION ALL
    SELECT 'zeragem_x_frequencia',
           'Quem zera mais opera mais dias? (vício)',
           CORR(pct_ze, dias_mes),
           COUNT(*)
    FROM combinado
    UNION ALL
    SELECT 'volume_x_zeragem',
           'Volume bruto correlaciona com % zeragem?',
           CORR(lotes_op, pct_ze),
           COUNT(*)
    FROM combinado
  )
  SELECT
    p.par,
    p.descricao,
    ROUND(p.r::numeric, 3) AS r,
    CASE
      WHEN ABS(p.r) >= 0.5 THEN 'forte'
      WHEN ABS(p.r) >= 0.3 THEN 'moderada'
      WHEN ABS(p.r) >= 0.1 THEN 'fraca'
      ELSE 'sem_relacao'
    END AS forca,
    CASE
      WHEN p.r > 0.05 THEN 'positiva'
      WHEN p.r < -0.05 THEN 'negativa'
      ELSE 'nula'
    END AS direcao,
    p.n::integer AS num_amostras
  FROM pares p
  WHERE p.r IS NOT NULL
  ORDER BY ABS(p.r) DESC;
$$;

GRANT EXECUTE ON FUNCTION dashboard_correlacoes() TO authenticated, service_role;

-- =============================================
-- 5. Indice "Risco do Escritorio" (0-100)
--    Consolida 4 fatores em score unico:
--      Concentracao top 3 clientes (peso 25): >40% = risco alto
--      % zeragem agregada           (peso 25): >25%  = risco alto
--      % clientes inativos 30d      (peso 25): >50%  = risco alto
--      % barras abaixo de ritmo     (peso 25): >50%  = risco alto
--    Cada fator vira 0-100 e a media e o indice final.
-- =============================================
DROP FUNCTION IF EXISTS dashboard_risco_escritorio() CASCADE;
CREATE OR REPLACE FUNCTION dashboard_risco_escritorio()
RETURNS TABLE(
  indice integer,           -- 0-100 (maior = pior)
  classificacao text,       -- 'saudavel' | 'atencao' | 'critico'
  fator_concentracao integer,
  fator_zeragem integer,
  fator_inativos integer,
  fator_metas integer,
  detalhe_concentracao text,
  detalhe_zeragem text,
  detalhe_inativos text,
  detalhe_metas text
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      COALESCE(ct.cliente_id::text, ct.cliente_nome) AS cliente_key,
      ct.data,
      ct.lotes_operados,
      ct.lotes_zerados
    FROM public.contratos ct
    WHERE ct.data >= (CURRENT_DATE - INTERVAL '30 days')::date
  ),
  top3 AS (
    SELECT SUM(s.lotes)::numeric AS lotes_top3
    FROM (
      SELECT cliente_key, SUM(lotes_operados) AS lotes
      FROM base
      WHERE cliente_key IS NOT NULL
      GROUP BY cliente_key
      ORDER BY 2 DESC NULLS LAST
      LIMIT 3
    ) s
  ),
  totais AS (
    SELECT
      COALESCE(SUM(lotes_operados), 0) AS lotes_total,
      COALESCE(SUM(lotes_zerados), 0) AS zerados_total
    FROM base
  ),
  todos_clientes AS (
    SELECT DISTINCT COALESCE(ct.cliente_id::text, ct.cliente_nome) AS k
    FROM public.contratos ct
    WHERE ct.cliente_id IS NOT NULL OR ct.cliente_nome IS NOT NULL
  ),
  ativos_30d AS (
    SELECT COUNT(DISTINCT cliente_key)::integer AS n FROM base WHERE lotes_operados > 0
  ),
  metricas AS (
    SELECT
      CASE WHEN t.lotes_total > 0
        THEN ROUND(t3.lotes_top3 / t.lotes_total * 100, 2) ELSE 0 END AS pct_concentracao,
      CASE WHEN t.lotes_total > 0
        THEN ROUND(t.zerados_total / t.lotes_total * 100, 2) ELSE 0 END AS pct_zeragem,
      CASE WHEN (SELECT COUNT(*) FROM todos_clientes) > 0
        THEN ROUND(100 - (SELECT n FROM ativos_30d)::numeric / (SELECT COUNT(*) FROM todos_clientes) * 100, 2)
        ELSE 0 END AS pct_inativos,
      COALESCE((
        SELECT ROUND(COUNT(*) FILTER (WHERE status IN ('atencao', 'critico'))::numeric
                   / NULLIF(COUNT(*), 0) * 100, 2)
        FROM dashboard_metas_assessor()
      ), 0) AS pct_metas_fora
    FROM top3 t3, totais t
  ),
  fatores AS (
    SELECT
      -- Concentracao: 0% conc = 0 risco, 40%+ conc = 100 risco
      LEAST(100, GREATEST(0, ROUND(pct_concentracao / 40 * 100)))::integer AS fator_conc,
      -- Zeragem: 0% = 0 risco, 25%+ = 100 risco
      LEAST(100, GREATEST(0, ROUND(pct_zeragem / 25 * 100)))::integer AS fator_zer,
      -- Inativos: 0% = 0 risco, 50%+ = 100 risco
      LEAST(100, GREATEST(0, ROUND(pct_inativos / 50 * 100)))::integer AS fator_ina,
      -- Metas fora: 0% = 0 risco, 50%+ = 100 risco
      LEAST(100, GREATEST(0, ROUND(pct_metas_fora / 50 * 100)))::integer AS fator_met,
      pct_concentracao, pct_zeragem, pct_inativos, pct_metas_fora
    FROM metricas
  )
  SELECT
    ROUND((fator_conc + fator_zer + fator_ina + fator_met) / 4.0)::integer AS indice,
    CASE
      WHEN (fator_conc + fator_zer + fator_ina + fator_met) / 4.0 < 30 THEN 'saudavel'
      WHEN (fator_conc + fator_zer + fator_ina + fator_met) / 4.0 < 60 THEN 'atencao'
      ELSE 'critico'
    END AS classificacao,
    fator_conc,
    fator_zer,
    fator_ina,
    fator_met,
    'Top 3 clientes: ' || pct_concentracao || '% do volume 30d' AS detalhe_concentracao,
    '% zeragem agregado: ' || pct_zeragem || '% (alerta acima de 25%)' AS detalhe_zeragem,
    '% clientes inativos 30d: ' || pct_inativos || '%' AS detalhe_inativos,
    '% barras fora do ritmo: ' || pct_metas_fora || '%' AS detalhe_metas
  FROM fatores;
$$;

GRANT EXECUTE ON FUNCTION dashboard_risco_escritorio() TO authenticated, service_role;
