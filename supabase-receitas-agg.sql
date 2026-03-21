-- =============================================
-- ZeveAI — Funções de agregação para Receitas
-- Execute no SQL Editor do Supabase
-- =============================================

-- Resumo geral (cards)
CREATE OR REPLACE FUNCTION receitas_resumo()
RETURNS TABLE(total_liquido numeric, mes_atual numeric, num_meses bigint)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    COALESCE(SUM(valor_liquido_aai), 0),
    COALESCE(SUM(CASE WHEN DATE_TRUNC('month', data_receita) = DATE_TRUNC('month', NOW()) THEN valor_liquido_aai ELSE 0 END), 0),
    COUNT(DISTINCT DATE_TRUNC('month', data_receita))
  FROM public.receitas;
$$;

-- Evolução por mês
CREATE OR REPLACE FUNCTION receitas_por_mes()
RETURNS TABLE(mes text, total numeric)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', data_receita), 'YYYY-MM') AS mes,
    SUM(valor_liquido_aai) AS total
  FROM public.receitas
  WHERE data_receita IS NOT NULL
  GROUP BY DATE_TRUNC('month', data_receita)
  ORDER BY DATE_TRUNC('month', data_receita);
$$;

-- Por assessor (top 10)
CREATE OR REPLACE FUNCTION receitas_por_assessor()
RETURNS TABLE(nome text, total numeric)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    COALESCE(assessor_nome, 'Sem assessor') AS nome,
    SUM(valor_liquido_aai) AS total
  FROM public.receitas
  GROUP BY COALESCE(assessor_nome, 'Sem assessor')
  ORDER BY SUM(valor_liquido_aai) DESC
  LIMIT 10;
$$;

-- Por cliente (top 10)
CREATE OR REPLACE FUNCTION receitas_por_cliente()
RETURNS TABLE(nome text, total numeric)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    COALESCE(c.nome, r.cliente_nome, 'Sem cliente') AS nome,
    SUM(r.valor_liquido_aai) AS total
  FROM public.receitas r
  LEFT JOIN public.clientes c ON r.cliente_id = c.id
  GROUP BY COALESCE(c.nome, r.cliente_nome, 'Sem cliente')
  ORDER BY SUM(r.valor_liquido_aai) DESC
  LIMIT 10;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION receitas_resumo() TO authenticated;
GRANT EXECUTE ON FUNCTION receitas_por_mes() TO authenticated;
GRANT EXECUTE ON FUNCTION receitas_por_assessor() TO authenticated;
GRANT EXECUTE ON FUNCTION receitas_por_cliente() TO authenticated;
