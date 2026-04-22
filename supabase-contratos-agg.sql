-- =============================================
-- ZeveAI — Funções de agregação para Contratos
-- Execute no SQL Editor do Supabase
-- =============================================

-- Resumo geral (cards)
CREATE OR REPLACE FUNCTION contratos_resumo()
RETURNS TABLE(total_operados numeric, total_zerados numeric, num_contratos bigint)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    COALESCE(SUM(lotes_operados), 0),
    COALESCE(SUM(lotes_zerados), 0),
    COUNT(*)
  FROM public.contratos;
$$;

-- Evolução por mês
CREATE OR REPLACE FUNCTION contratos_por_mes()
RETURNS TABLE(mes text, operados numeric, zerados numeric)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', data), 'YYYY-MM') AS mes,
    SUM(lotes_operados) AS operados,
    SUM(lotes_zerados) AS zerados
  FROM public.contratos
  WHERE data IS NOT NULL
  GROUP BY DATE_TRUNC('month', data)
  ORDER BY DATE_TRUNC('month', data);
$$;

-- Por barra (top 10)
CREATE OR REPLACE FUNCTION contratos_por_assessor()
RETURNS TABLE(nome text, operados numeric, zerados numeric)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    COALESCE(assessor_nome, 'Sem barra') AS nome,
    SUM(lotes_operados) AS operados,
    SUM(lotes_zerados) AS zerados
  FROM public.contratos
  GROUP BY COALESCE(assessor_nome, 'Sem barra')
  ORDER BY SUM(lotes_operados) + SUM(lotes_zerados) DESC
  LIMIT 10;
$$;

-- Por cliente (top 10)
CREATE OR REPLACE FUNCTION contratos_por_cliente()
RETURNS TABLE(nome text, operados numeric, zerados numeric)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    COALESCE(c.nome, ct.cliente_nome, 'Sem cliente') AS nome,
    SUM(ct.lotes_operados) AS operados,
    SUM(ct.lotes_zerados) AS zerados
  FROM public.contratos ct
  LEFT JOIN public.clientes c ON ct.cliente_id = c.id
  GROUP BY COALESCE(c.nome, ct.cliente_nome, 'Sem cliente')
  ORDER BY SUM(ct.lotes_operados) + SUM(ct.lotes_zerados) DESC
  LIMIT 10;
$$;

-- Permissões (service_role precisa de GRANT explícito em RPCs custom)
GRANT EXECUTE ON FUNCTION contratos_resumo() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION contratos_por_mes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION contratos_por_assessor() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION contratos_por_cliente() TO authenticated, service_role;
