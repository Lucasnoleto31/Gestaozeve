-- =============================================
-- ZeveAI — Sprint 5: Budget de zeragem
--   Limite máximo de % zeragem aceitável por barra. Se ultrapassar,
--   gera alerta. Default 30% (configurável por barra).
-- Execute no SQL Editor do Supabase.
-- =============================================

-- 1. Coluna de budget na tabela de pricing
ALTER TABLE public.assessor_pricing
  ADD COLUMN IF NOT EXISTS budget_zeragem_pct_max NUMERIC(5,2) DEFAULT 30.00;

COMMENT ON COLUMN public.assessor_pricing.budget_zeragem_pct_max IS
  'Limite máximo de % de zeragem aceitável (lotes_zerados / lotes_operados). Acima dispara alerta.';

-- 2. Função de budget — calcula consumo por barra no período
DROP FUNCTION IF EXISTS dashboard_budget_zeragem(date, date) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_budget_zeragem(p_inicio date, p_fim date)
RETURNS TABLE(
  barra_nome text,
  numero text,
  lotes_operados numeric,
  lotes_zerados numeric,
  pct_zeragem numeric,
  budget_pct numeric,
  consumo_pct numeric,
  status text  -- 'ok' | 'atencao' (>= 80%) | 'excedido' (>= 100%)
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH agg AS (
    SELECT
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      SUM(ct.lotes_operados) AS lotes_operados,
      SUM(ct.lotes_zerados)  AS lotes_zerados
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
    GROUP BY 1
  ),
  pr AS (
    SELECT
      UPPER(TRIM(p.barra_nome)) AS chave,
      p.barra_nome, p.numero,
      COALESCE(p.budget_zeragem_pct_max, 30.00) AS budget_pct
    FROM public.assessor_pricing p
    WHERE p.ativo = true
  )
  SELECT
    a.barra_nome,
    pr.numero,
    a.lotes_operados,
    a.lotes_zerados,
    CASE WHEN a.lotes_operados > 0
      THEN ROUND(a.lotes_zerados / a.lotes_operados * 100, 2)
      ELSE 0 END AS pct_zeragem,
    COALESCE(pr.budget_pct, 30.00) AS budget_pct,
    CASE WHEN a.lotes_operados > 0 AND COALESCE(pr.budget_pct, 30.00) > 0
      THEN ROUND((a.lotes_zerados / a.lotes_operados * 100) / pr.budget_pct * 100, 2)
      ELSE 0 END AS consumo_pct,
    CASE
      WHEN a.lotes_operados = 0 OR COALESCE(pr.budget_pct, 30.00) <= 0 THEN 'ok'
      WHEN (a.lotes_zerados / a.lotes_operados * 100) >= COALESCE(pr.budget_pct, 30.00)        THEN 'excedido'
      WHEN (a.lotes_zerados / a.lotes_operados * 100) >= COALESCE(pr.budget_pct, 30.00) * 0.8  THEN 'atencao'
      ELSE 'ok'
    END AS status
  FROM agg a
  LEFT JOIN pr ON pr.chave = UPPER(TRIM(a.barra_nome))
  ORDER BY consumo_pct DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION dashboard_budget_zeragem(date, date) TO authenticated, service_role;
