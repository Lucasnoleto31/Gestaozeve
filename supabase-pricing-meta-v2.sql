-- =============================================
-- ZeveAI — Pricing v2: zeragem por faixas (tiered) + número da conta
-- Aplica sobre supabase-pricing-meta.sql.
-- Execute no SQL Editor do Supabase.
-- =============================================

-- 1. Adicionar coluna `numero` (código da conta na corretora)
ALTER TABLE public.assessor_pricing
  ADD COLUMN IF NOT EXISTS numero TEXT;

-- 2. Liberar 'tiered' no CHECK do modelo de zeragem
ALTER TABLE public.assessor_pricing
  DROP CONSTRAINT IF EXISTS assessor_pricing_modelo_zeragem_check;
ALTER TABLE public.assessor_pricing
  ADD  CONSTRAINT assessor_pricing_modelo_zeragem_check
  CHECK (modelo_zeragem IN ('b2b', 'fixo', 'mesmo_operado', 'tiered'));

-- 3. Tabela de faixas de zeragem (1..N por pricing)
CREATE TABLE IF NOT EXISTS public.assessor_pricing_zeragem_tier (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_id      UUID NOT NULL REFERENCES public.assessor_pricing(id) ON DELETE CASCADE,
  volume_min      INTEGER NOT NULL,                 -- inclusivo (ex: 1)
  volume_max      INTEGER,                          -- inclusivo, NULL = +infinito (ex: NULL)
  preco_zeragem   NUMERIC(10,2) NOT NULL,
  ordem           INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT tier_volume_check CHECK (volume_max IS NULL OR volume_max >= volume_min)
);
CREATE INDEX IF NOT EXISTS assessor_pricing_zeragem_tier_pricing_idx
  ON public.assessor_pricing_zeragem_tier (pricing_id, ordem);

ALTER TABLE public.assessor_pricing_zeragem_tier ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tier_admin" ON public.assessor_pricing_zeragem_tier;
DROP POLICY IF EXISTS "tier_read"  ON public.assessor_pricing_zeragem_tier;

CREATE POLICY "tier_admin" ON public.assessor_pricing_zeragem_tier
  FOR ALL TO authenticated USING (get_my_role() = 'admin');

CREATE POLICY "tier_read" ON public.assessor_pricing_zeragem_tier
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'vendedor'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessor_pricing_zeragem_tier TO authenticated;

-- =============================================
-- 4. Limpar seed antigo (b2b zerada) e aplicar valores reais
--    Importante: pricing antigos (com b2b) ficam sem efeito de zeragem.
--    Atualizamos pra 'tiered' onde aplicável e populamos faixas.
-- =============================================
UPDATE public.assessor_pricing
   SET modelo_zeragem = 'tiered', preco_zeragem = 0
 WHERE barra_nome LIKE 'ZEVE INVESTIMENTOS %' AND modelo_zeragem = 'b2b';

-- Insere quaisquer barras novas (idempotente — ON CONFLICT impede duplicar ativos)
INSERT INTO public.assessor_pricing
  (barra_nome, numero, preco_lote_futuros, modelo_zeragem, preco_zeragem, pct_volume_bovespa, observacao)
VALUES
  -- Casos especiais (pessoas)
  ('ARTUR AILTON FONSECA MARANHÃO', '14342', 0.25, 'tiered', 0,     0.05, 'Tabela escalonada'),
  ('Lucas Gomes Noleto Lopes',      '14253', 0.25, 'fixo',   29.90, 0.05, 'Zeragem fixa R$29,90'),
  -- Barras ZEVE 1..19 (atualiza número se já existe; senão cria)
  ('ZEVE INVESTIMENTOS 1',  '14525', 0.20, 'tiered', 0, 0.05, 'Tabela escalonada'),
  ('ZEVE INVESTIMENTOS 2',  '14560', 0.05, 'tiered', 0, 0.05, 'Tabela escalonada'),
  ('ZEVE INVESTIMENTOS 3',  '13660', 0.30, 'tiered', 0, 0.05, 'Tabela escalonada'),
  ('ZEVE INVESTIMENTOS 4',  '14034', 0.30, 'tiered', 0, 0.05, 'Tabela escalonada'),
  ('ZEVE INVESTIMENTOS 5',  '12602', 0.25, 'tiered', 0, 0.05, 'Tabela escalonada'),
  ('ZEVE INVESTIMENTOS 6',  '13983', 0.25, 'tiered', 0, 0.05, 'Tabela escalonada'),
  ('ZEVE INVESTIMENTOS 7',  '14153', 0.15, 'tiered', 0, 0.05, 'Tabela escalonada'),
  ('ZEVE INVESTIMENTOS 8',  '14179', 0.25, 'tiered', 0, 0.05, 'Tabela escalonada'),
  ('ZEVE INVESTIMENTOS 9',  '15167', 0.00, 'fixo',   39.90, 0.05, 'Zeragem fixa R$39,90'),
  ('ZEVE INVESTIMENTOS 10', '15168', 0.25, 'tiered', 0, 0.05, 'Tabela escalonada'),
  ('ZEVE INVESTIMENTOS 11', '15265', 0.25, 'tiered', 0, 0.05, 'Tabela escalonada'),
  ('ZEVE INVESTIMENTOS 12', '15266', 0.25, 'tiered', 0, 0.05, 'Tabela escalonada'),
  ('ZEVE INVESTIMENTOS 13', '15221', 0.25, 'tiered', 0, 0.05, 'Tabela escalonada'),
  ('ZEVE INVESTIMENTOS 14', '15246', 0.25, 'tiered', 0, 0.05, 'Tabela escalonada'),
  ('ZEVE INVESTIMENTOS 15', '15269', 0.25, 'tiered', 0, 0.05, 'Tabela escalonada'),
  ('ZEVE INVESTIMENTOS 16', '15247', 0.25, 'tiered', 0, 0.05, 'Tabela escalonada'),
  ('ZEVE INVESTIMENTOS 17', '15248', 0.25, 'tiered', 0, 0.05, 'Tabela escalonada'),
  ('ZEVE INVESTIMENTOS 18', '15249', 0.25, 'tiered', 0, 0.05, 'Tabela escalonada'),
  ('ZEVE INVESTIMENTOS 19', '15250', 0.25, 'tiered', 0, 0.05, 'Tabela escalonada')
ON CONFLICT (barra_nome) WHERE ativo = true
DO UPDATE SET
  numero             = EXCLUDED.numero,
  preco_lote_futuros = EXCLUDED.preco_lote_futuros,
  modelo_zeragem     = EXCLUDED.modelo_zeragem,
  preco_zeragem      = EXCLUDED.preco_zeragem,
  pct_volume_bovespa = EXCLUDED.pct_volume_bovespa,
  observacao         = EXCLUDED.observacao,
  updated_at         = now();

-- =============================================
-- 5. Faixas padrão de zeragem para todas as barras com modelo_zeragem='tiered'
--    Tabela escalonada Genial:
--      1..19   → R$ 23,00
--      20..499 → R$ 22,00
--      500..999 → R$ 21,00
--      1000..4999 → R$ 20,00
--      5000+ → R$ 19,00
-- =============================================
DELETE FROM public.assessor_pricing_zeragem_tier
 WHERE pricing_id IN (SELECT id FROM public.assessor_pricing WHERE modelo_zeragem = 'tiered');

INSERT INTO public.assessor_pricing_zeragem_tier (pricing_id, volume_min, volume_max, preco_zeragem, ordem)
SELECT p.id, 1,    19,   23.00, 1 FROM public.assessor_pricing p WHERE p.modelo_zeragem = 'tiered'
UNION ALL
SELECT p.id, 20,   499,  22.00, 2 FROM public.assessor_pricing p WHERE p.modelo_zeragem = 'tiered'
UNION ALL
SELECT p.id, 500,  999,  21.00, 3 FROM public.assessor_pricing p WHERE p.modelo_zeragem = 'tiered'
UNION ALL
SELECT p.id, 1000, 4999, 20.00, 4 FROM public.assessor_pricing p WHERE p.modelo_zeragem = 'tiered'
UNION ALL
SELECT p.id, 5000, NULL, 19.00, 5 FROM public.assessor_pricing p WHERE p.modelo_zeragem = 'tiered';

-- =============================================
-- 6. Função de receita atualizada — calcula zeragem por faixa
--    Regra: a faixa é determinada pelo VOLUME ZERADO DIÁRIO POR CLIENTE
--           (cada dia, cada cliente cai numa faixa baseada no que zerou no dia).
-- =============================================
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
  -- Volume operado e zerado por barra (consolidado do período)
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
  -- Volume zerado de WIN/WDO por (barra, cliente, data) → para aplicar faixa diária
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
  -- Pricing ativo por barra
  pr AS (
    SELECT
      UPPER(TRIM(p.barra_nome)) AS chave,
      p.id, p.barra_nome, p.numero,
      p.preco_lote_futuros, p.modelo_zeragem, p.preco_zeragem
    FROM public.assessor_pricing p
    WHERE p.ativo = true
  ),
  -- Receita de zeragem por (cliente, dia) — depende do modelo da barra
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
    LEFT JOIN pr ON pr.chave = UPPER(TRIM(acd.barra_nome))
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
  LEFT JOIN pr ON pr.chave = UPPER(TRIM(a.barra_nome))
  LEFT JOIN receita_ze rz ON rz.barra_nome = a.barra_nome
  ORDER BY receita_total DESC NULLS LAST;
$$;

-- A função `dashboard_contratos_receita_total` segue válida — agrega receita_por_assessor.
GRANT EXECUTE ON FUNCTION dashboard_contratos_receita_por_assessor(date, date) TO authenticated, service_role;
