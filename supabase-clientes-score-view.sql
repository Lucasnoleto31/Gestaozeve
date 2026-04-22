-- =============================================
-- ZeveAI — View clientes_com_score
-- Junta cada cliente com o seu score mais recente
-- em uma única query (LATERAL JOIN).
-- Execute no SQL Editor do Supabase.
-- =============================================

CREATE OR REPLACE VIEW public.clientes_com_score AS
SELECT
  c.*,
  s.score_total,
  s.classificacao,
  s.tendencia,
  s.created_at AS score_atualizado_em
FROM public.clientes c
LEFT JOIN LATERAL (
  SELECT score_total, classificacao, tendencia, created_at
  FROM public.cliente_scores
  WHERE cliente_id = c.id
  ORDER BY created_at DESC
  LIMIT 1
) s ON true;

GRANT SELECT ON public.clientes_com_score TO authenticated;

-- Contagem por classificação (para KPIs da toolbar de clientes)
CREATE OR REPLACE FUNCTION public.clientes_classificacao_counts()
RETURNS TABLE(classificacao text, total bigint)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT classificacao, COUNT(*)::bigint
  FROM public.clientes_com_score
  GROUP BY classificacao;
$$;

GRANT EXECUTE ON FUNCTION public.clientes_classificacao_counts() TO authenticated;
