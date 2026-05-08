-- =============================================
-- ZeveAI — Fix de acentos no matching de receita
-- 1) ARTUR no pricing está com til (MARANHÃO) mas a planilha vem sem (MARANHAO).
-- 2) Torna a função `dashboard_contratos_receita_por_assessor` tolerante a
--    acentos via TRANSLATE — não precisa instalar a extensão `unaccent`.
-- =============================================

-- 1. Normaliza o nome do ARTUR no seed pra bater com a planilha
UPDATE public.assessor_pricing
   SET barra_nome = 'ARTUR AILTON FONSECA MARANHAO'
 WHERE barra_nome = 'ARTUR AILTON FONSECA MARANHÃO';

-- 2. Recria a função usando uma chave de matching sem acento + lowercase
DROP FUNCTION IF EXISTS dashboard_contratos_receita_por_assessor(date, date) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_receita_por_assessor(p_inicio date, p_fim date)
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
  receita_total numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH agg_barra AS (
    SELECT
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
          THEN ct.lotes_operados ELSE 0 END) AS lotes_op_futuros,
      SUM(ct.lotes_operados) AS lotes_operados,
      SUM(ct.lotes_zerados)  AS lotes_zerados
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
    GROUP BY 1
  ),
  agg_cliente_dia AS (
    SELECT
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key,
      ct.data,
      SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
          THEN ct.lotes_zerados ELSE 0 END) AS lotes_ze_dia
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
    GROUP BY 1, 2, 3
    HAVING SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
                    THEN ct.lotes_zerados ELSE 0 END) > 0
  ),
  pr AS (
    SELECT
      -- Chave de matching: UPPER + TRIM + sem acentos comuns. TRANSLATE
      -- não exige extensão unaccent (faz por mapeamento explícito).
      TRANSLATE(
        UPPER(TRIM(p.barra_nome)),
        'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
        'AAAAAEEEEIIIIOOOOOUUUUC'
      ) AS chave,
      p.id, p.barra_nome, p.numero,
      p.preco_lote_futuros, p.modelo_zeragem, p.preco_zeragem
    FROM public.assessor_pricing p
    WHERE p.ativo = true
  ),
  receita_ze_diaria AS (
    SELECT
      acd.barra_nome,
      acd.lotes_ze_dia,
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
    LEFT JOIN pr ON pr.chave = TRANSLATE(
      UPPER(TRIM(acd.barra_nome)),
      'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC'
    )
  ),
  receita_ze AS (
    SELECT barra_nome, COALESCE(SUM(receita_zeragem_dia), 0) AS receita_zeragem
    FROM receita_ze_diaria
    GROUP BY barra_nome
  )
  SELECT
    a.barra_nome,
    pr.numero,
    COALESCE(pr.preco_lote_futuros, 0)              AS preco_lote_futuros,
    COALESCE(pr.modelo_zeragem, 'b2b')              AS modelo_zeragem,
    COALESCE(pr.preco_zeragem, 0)                   AS preco_zeragem,
    a.lotes_operados,
    a.lotes_zerados,
    ROUND(COALESCE(pr.preco_lote_futuros, 0) * a.lotes_op_futuros, 2) AS receita_operados,
    ROUND(COALESCE(rz.receita_zeragem, 0), 2)       AS receita_zeragem,
    ROUND(
      COALESCE(pr.preco_lote_futuros, 0) * a.lotes_op_futuros
      + COALESCE(rz.receita_zeragem, 0), 2
    ) AS receita_total
  FROM agg_barra a
  LEFT JOIN pr ON pr.chave = TRANSLATE(
    UPPER(TRIM(a.barra_nome)),
    'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
    'AAAAAEEEEIIIIOOOOOUUUUC'
  )
  LEFT JOIN receita_ze rz ON rz.barra_nome = a.barra_nome
  ORDER BY receita_total DESC NULLS LAST;
$$;

-- Recria as duas dependentes que o CASCADE acima derruba
CREATE OR REPLACE FUNCTION dashboard_contratos_receita_total(p_inicio date, p_fim date)
RETURNS TABLE(
  receita_operados numeric,
  receita_zeragem numeric,
  receita_total numeric,
  num_barras integer,
  num_barras_sem_pricing integer
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH r AS (
    SELECT * FROM dashboard_contratos_receita_por_assessor(p_inicio, p_fim)
  )
  SELECT
    COALESCE(SUM(receita_operados), 0),
    COALESCE(SUM(receita_zeragem),  0),
    COALESCE(SUM(receita_total),    0),
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE preco_lote_futuros = 0 AND modelo_zeragem = 'b2b')::integer
  FROM r;
$$;

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
  WITH bounds AS (
    SELECT
      DATE_TRUNC('year', CURRENT_DATE)::date AS ano_inicio,
      (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year' - INTERVAL '1 day')::date AS ano_fim,
      EXTRACT(YEAR FROM CURRENT_DATE)::integer AS ano_n
  ),
  realizado_lotes_q AS (
    SELECT COALESCE(SUM(lotes_operados), 0) AS l
    FROM public.contratos, bounds
    WHERE data BETWEEN bounds.ano_inicio AND CURRENT_DATE
  ),
  realizado_receita_q AS (
    SELECT COALESCE(SUM(receita_total), 0) AS r
    FROM dashboard_contratos_receita_por_assessor(
      (SELECT ano_inicio FROM bounds), CURRENT_DATE
    )
  ),
  meta AS (
    SELECT
      bounds.ano_n,
      COALESCE(m.meta_lotes, 0)   AS meta_lotes,
      COALESCE(m.meta_receita, 0) AS meta_receita
    FROM bounds
    LEFT JOIN public.metas_anuais m ON m.ano = bounds.ano_n
  )
  SELECT
    meta.ano_n,
    meta.meta_lotes,
    meta.meta_receita,
    rl.l,
    rr.r,
    CASE WHEN meta.meta_lotes   > 0 THEN ROUND(rl.l / meta.meta_lotes   * 100, 2) ELSE 0 END,
    CASE WHEN meta.meta_receita > 0 THEN ROUND(rr.r / meta.meta_receita * 100, 2) ELSE 0 END,
    GREATEST(0, (b.ano_fim - CURRENT_DATE)::integer),
    CASE WHEN meta.meta_lotes > 0 AND (b.ano_fim - CURRENT_DATE) > 0
      THEN ROUND(GREATEST(0, meta.meta_lotes - rl.l) / (b.ano_fim - CURRENT_DATE)::numeric, 2)
      ELSE 0 END,
    CASE WHEN meta.meta_receita > 0 AND (b.ano_fim - CURRENT_DATE) > 0
      THEN ROUND(GREATEST(0, meta.meta_receita - rr.r) / (b.ano_fim - CURRENT_DATE)::numeric, 2)
      ELSE 0 END
  FROM bounds b, meta, realizado_lotes_q rl, realizado_receita_q rr;
$$;

GRANT EXECUTE ON FUNCTION dashboard_contratos_receita_por_assessor(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION dashboard_contratos_receita_total(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION dashboard_meta_anual() TO authenticated, service_role;
