-- =============================================
-- ZeveAI — Pricing por barra/assessor + Metas anuais
-- Execute no SQL Editor do Supabase.
-- =============================================

-- 1. Pricing por barra (preço por lote operado / zeragem / Bovespa)
CREATE TABLE IF NOT EXISTS public.assessor_pricing (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barra_id           UUID REFERENCES public.barras(id) ON DELETE SET NULL,
  barra_nome         TEXT NOT NULL,                              -- snapshot do nome (alinha com contratos.assessor_nome)
  preco_lote_futuros NUMERIC(10,4) NOT NULL DEFAULT 0,           -- R$ por lote WIN/WDO operado
  modelo_zeragem     TEXT NOT NULL DEFAULT 'b2b'
    CHECK (modelo_zeragem IN ('b2b', 'fixo', 'mesmo_operado')),
  preco_zeragem      NUMERIC(10,4) NOT NULL DEFAULT 0,           -- vale quando modelo='fixo'
  pct_volume_bovespa NUMERIC(7,6)  NOT NULL DEFAULT 0,           -- 0.05 = 5%
  observacao         TEXT,
  ativo              BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- Garante 1 pricing ativo por barra
CREATE UNIQUE INDEX IF NOT EXISTS assessor_pricing_barra_unique
  ON public.assessor_pricing (barra_nome)
  WHERE ativo = true;

ALTER TABLE public.assessor_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assessor_pricing_admin"   ON public.assessor_pricing;
DROP POLICY IF EXISTS "assessor_pricing_read"    ON public.assessor_pricing;

CREATE POLICY "assessor_pricing_admin" ON public.assessor_pricing
  FOR ALL TO authenticated USING (get_my_role() = 'admin');

CREATE POLICY "assessor_pricing_read" ON public.assessor_pricing
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'vendedor'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessor_pricing TO authenticated;

-- 2. Metas anuais (lotes + receita) — uma linha por ano
CREATE TABLE IF NOT EXISTS public.metas_anuais (
  ano           INTEGER PRIMARY KEY,
  meta_lotes    NUMERIC(15,2) NOT NULL DEFAULT 0,
  meta_receita  NUMERIC(15,2) NOT NULL DEFAULT 0,
  observacao    TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.metas_anuais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "metas_anuais_admin" ON public.metas_anuais;
DROP POLICY IF EXISTS "metas_anuais_read"  ON public.metas_anuais;

CREATE POLICY "metas_anuais_admin" ON public.metas_anuais
  FOR ALL TO authenticated USING (get_my_role() = 'admin');

CREATE POLICY "metas_anuais_read" ON public.metas_anuais
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'vendedor'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_anuais TO authenticated;

-- =============================================
-- 3. Funções de receita
-- =============================================

-- 3.1 Receita por assessor/barra no período
-- Considera apenas WIN/WDO (futuros) hoje. Bovespa fica como TODO até termos
-- volume financeiro por cliente em outra tabela.
DROP FUNCTION IF EXISTS dashboard_contratos_receita_por_assessor(date, date) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_receita_por_assessor(p_inicio date, p_fim date)
RETURNS TABLE(
  barra_nome text,
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
  WITH agg AS (
    SELECT
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
          THEN ct.lotes_operados ELSE 0 END) AS lotes_op_futuros,
      SUM(CASE WHEN contratos_produto(ct.ativo) IN ('WIN', 'WDO')
          THEN ct.lotes_zerados ELSE 0 END) AS lotes_ze_futuros,
      SUM(ct.lotes_operados) AS lotes_operados,
      SUM(ct.lotes_zerados)  AS lotes_zerados
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
    GROUP BY 1
  ),
  joined AS (
    SELECT
      a.barra_nome,
      COALESCE(p.preco_lote_futuros, 0)                      AS preco_lote_futuros,
      COALESCE(p.modelo_zeragem, 'b2b')                      AS modelo_zeragem,
      COALESCE(p.preco_zeragem, 0)                           AS preco_zeragem,
      a.lotes_operados,
      a.lotes_zerados,
      a.lotes_op_futuros,
      a.lotes_ze_futuros
    FROM agg a
    LEFT JOIN public.assessor_pricing p
      ON UPPER(TRIM(p.barra_nome)) = UPPER(TRIM(a.barra_nome))
      AND p.ativo = true
  )
  SELECT
    barra_nome,
    preco_lote_futuros,
    modelo_zeragem,
    preco_zeragem,
    lotes_operados,
    lotes_zerados,
    ROUND(preco_lote_futuros * lotes_op_futuros, 2)             AS receita_operados,
    ROUND(
      CASE modelo_zeragem
        WHEN 'fixo'           THEN preco_zeragem      * lotes_ze_futuros
        WHEN 'mesmo_operado'  THEN preco_lote_futuros * lotes_ze_futuros
        ELSE 0
      END, 2
    )                                                            AS receita_zeragem,
    ROUND(
      preco_lote_futuros * lotes_op_futuros
      + CASE modelo_zeragem
          WHEN 'fixo'           THEN preco_zeragem      * lotes_ze_futuros
          WHEN 'mesmo_operado'  THEN preco_lote_futuros * lotes_ze_futuros
          ELSE 0
        END, 2
    )                                                            AS receita_total
  FROM joined
  ORDER BY receita_total DESC NULLS LAST;
$$;

-- 3.2 Receita total no período (rollup das linhas acima)
DROP FUNCTION IF EXISTS dashboard_contratos_receita_total(date, date) CASCADE;
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

-- 3.3 Projeção do mês corrente:
--   consolidada       = receita do mês até hoje
--   ritmo_diario      = receita ÷ dias com dado no mês
--   dias_corridos_rest = dias que faltam (corridos, não úteis)
--   projecao_total    = consolidada + ritmo × dias restantes
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
  WITH bounds AS (
    SELECT
      DATE_TRUNC('month', CURRENT_DATE)::date AS mes_inicio,
      (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::date AS mes_fim
  ),
  consol AS (
    SELECT
      COALESCE(SUM(receita_total), 0) AS receita,
      (SELECT COUNT(DISTINCT data)::integer
         FROM public.contratos, bounds
         WHERE data BETWEEN bounds.mes_inicio AND CURRENT_DATE) AS dias
    FROM dashboard_contratos_receita_por_assessor(
      (SELECT mes_inicio FROM bounds), CURRENT_DATE
    )
  )
  SELECT
    b.mes_inicio,
    c.receita,
    c.dias,
    CASE WHEN c.dias > 0 THEN ROUND(c.receita / c.dias, 2) ELSE 0 END,
    GREATEST(0, (b.mes_fim - CURRENT_DATE)::integer),
    CASE WHEN c.dias > 0
      THEN ROUND((c.receita / c.dias) * (b.mes_fim - CURRENT_DATE)::integer, 2)
      ELSE 0
    END,
    c.receita + CASE WHEN c.dias > 0
      THEN ROUND((c.receita / c.dias) * (b.mes_fim - CURRENT_DATE)::integer, 2)
      ELSE 0
    END
  FROM bounds b, consol c;
$$;

-- 3.4 Tracking da meta anual (ano corrente)
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

-- =============================================
-- Permissões
-- =============================================
GRANT EXECUTE ON FUNCTION dashboard_contratos_receita_por_assessor(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION dashboard_contratos_receita_total(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION dashboard_contratos_receita_mes_projecao() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION dashboard_meta_anual() TO authenticated, service_role;

-- =============================================
-- 4. Seed inicial (valores iniciais informados pelo Lucas, em 2026-05-08)
--    Nota: zeragem 'b2b' para todos. Bovespa 5% registrado mas ainda
--    não vira receita (depende de volume financeiro por cliente).
-- =============================================
INSERT INTO public.assessor_pricing
  (barra_nome, preco_lote_futuros, modelo_zeragem, preco_zeragem, pct_volume_bovespa, observacao)
VALUES
  ('ZEVE INVESTIMENTOS 1',  0.20, 'b2b',  0,      0.05, 'WIN_WDO_0.20_DMA_Zeragem_B2B_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 2',  0.05, 'b2b',  0,      0.05, 'WIN_WDO_0.05_DMA_Zeragem_B2B_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 3',  0.30, 'b2b',  0,      0.05, 'WIN_WDO_0.30_DMA_Zeragem_B2B_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 4',  0.30, 'b2b',  0,      0.05, 'WIN_WDO_0.30_DMA_Zeragem_B2B_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 5',  0.25, 'b2b',  0,      0.05, 'WIN_WDO_0.25_DMA_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 6',  0.25, 'b2b',  0,      0.05, 'WIN_WDO_0.25_DMA_Zeragem_B2B_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 7',  0.15, 'b2b',  0,      0.05, 'WIN_WDO_0.15_DMA_Zeragem_B2B_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 8',  0.25, 'b2b',  0,      0.05, 'WIN_WDO_0.25_DMA_Zeragem_B2B_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 9',  0.00, 'fixo', 39.90,  0.05, 'WIN_WDO_0.0_DMA_Zeragem_39.90_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 10', 0.25, 'b2b',  0,      0.05, 'WIN_WDO_0.25_DMA_Zeragem_B2B_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 11', 0.25, 'b2b',  0,      0.05, 'WIN_WDO_0.25_DMA_Zeragem_B2B_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 12', 0.25, 'b2b',  0,      0.05, 'WIN_WDO_0.25_DMA_Zeragem_B2B_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 13', 0.25, 'b2b',  0,      0.05, 'WIN_WDO_0.25_DMA_Zeragem_B2B_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 14', 0.25, 'b2b',  0,      0.05, 'WIN_WDO_0.25_DMA_Zeragem_B2B_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 15', 0.25, 'b2b',  0,      0.05, 'WIN_WDO_0.25_DMA_Zeragem_B2B_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 16', 0.25, 'b2b',  0,      0.05, 'WIN_WDO_0.25_DMA_Zeragem_B2B_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 17', 0.25, 'b2b',  0,      0.05, 'WIN_WDO_0.25_DMA_Zeragem_B2B_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 18', 0.25, 'b2b',  0,      0.05, 'WIN_WDO_0.25_DMA_Zeragem_B2B_Bovespa 5% Vol Negociado'),
  ('ZEVE INVESTIMENTOS 19', 0.25, 'b2b',  0,      0.05, 'WIN_WDO_0.25_DMA_Zeragem_B2B_Bovespa 5% Vol Negociado')
ON CONFLICT (barra_nome) WHERE ativo = true DO NOTHING;
