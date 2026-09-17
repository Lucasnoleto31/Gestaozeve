-- =============================================
-- ZeveAI — S11: incentivo — somar as contas do FABRICIO DA SILVA GONCALVES
-- Execute no SQL Editor do Supabase (depois do supabase-s10-dados-reais.sql).
--
-- Problema: o incentivo pontua por CONTA. O FABRICIO DA SILVA GONCALVES
-- opera em várias contas (1193966, 22826672, 22826680, 22826788, 22826800,
-- além de variações truncadas vindas da importação), então os pontos dele
-- se dividiam e cada conta caía numa faixa menor do que a real.
--
-- Correção: nas DUAS funções do incentivo, todas as linhas com o nome dele
-- são somadas como um cliente único. SOMENTE ele — os demais clientes
-- continuam pontuando por conta. As demais abas (KPIs, retenção, evolução,
-- top clientes) não mudam: seguem usando contratos_conta_key().
-- =============================================

-- ---------------------------------------------
-- 1. Chave de agrupamento específica do incentivo:
--    consolida os clientes listados; os demais usam contratos_conta_key().
--    Match por nome (maiúsculas, sem espaços nas pontas) — todas as linhas
--    dele no banco usam exatamente 'FABRICIO DA SILVA GONCALVES'.
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.contratos_incentivo_key(p_conta text, p_cliente_id uuid, p_nome text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN UPPER(TRIM(COALESCE(p_nome, ''))) IN ('FABRICIO DA SILVA GONCALVES')
      THEN 'CONSOLIDADO:' || UPPER(TRIM(p_nome))
    ELSE public.contratos_conta_key(p_conta, p_cliente_id, p_nome)
  END;
$$;
GRANT EXECUTE ON FUNCTION public.contratos_incentivo_key(text, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 2. Incentivo mensal por faixa (mesmo corpo do S10,
--    trocando contratos_conta_key → contratos_incentivo_key)
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_incentivo_mensal() CASCADE;
CREATE OR REPLACE FUNCTION dashboard_incentivo_mensal()
RETURNS TABLE(
  mes date,
  faixa_min numeric,
  valor_unitario numeric,
  num_clientes integer,
  valor_total numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH faixas(faixa_min, valor) AS (
    VALUES
      (1000000::numeric, 49000::numeric),
      (750000, 42000),
      (500000, 31500),
      (300000, 21000),
      (150000, 12000),
      (50000, 5000),
      (10000, 1000),
      (5000, 500),
      (1000, 200)
  ),
  pontos AS (
    SELECT
      date_trunc('month', data)::date AS mes,
      contratos_incentivo_key(numero_conta, cliente_id, cliente_nome) AS conta,
      SUM(COALESCE(lotes_operados, 0) * CASE contratos_produto(ativo)
        WHEN 'BIT' THEN 4
        WHEN 'DI1' THEN 1
        WHEN 'DOL' THEN 5
        WHEN 'ETR' THEN 3
        WHEN 'GLD' THEN 3
        WHEN 'IND' THEN 3
        WHEN 'SOL' THEN 3
        WHEN 'WDO' THEN 2
        WHEN 'WIN' THEN 1
        WHEN 'WSP' THEN 1
        ELSE 0
      END) AS pts
    FROM public.contratos
    WHERE data IS NOT NULL
      AND public.dashboard_acesso_ok()
    GROUP BY 1, 2
    HAVING SUM(COALESCE(lotes_operados, 0)) > 0
  ),
  classificado AS (
    SELECT
      p.mes,
      COALESCE(
        (SELECT f.faixa_min FROM faixas f WHERE p.pts > f.faixa_min ORDER BY f.faixa_min DESC LIMIT 1),
        0
      ) AS faixa_min
    FROM pontos p
  )
  SELECT
    c.mes,
    c.faixa_min,
    COALESCE(f.valor, 0) AS valor_unitario,
    COUNT(*)::integer AS num_clientes,
    (COUNT(*) * COALESCE(f.valor, 0)) AS valor_total
  FROM classificado c
  LEFT JOIN faixas f ON f.faixa_min = c.faixa_min
  GROUP BY c.mes, c.faixa_min, f.valor
  ORDER BY c.mes, c.faixa_min DESC;
$$;
GRANT EXECUTE ON FUNCTION dashboard_incentivo_mensal() TO authenticated, service_role;

-- ---------------------------------------------
-- 3. Detalhe por cliente no mês (mesmo corpo do S10,
--    trocando a chave e exibindo 'todas as contas' na linha consolidada)
-- ---------------------------------------------
DROP FUNCTION IF EXISTS dashboard_incentivo_clientes(date) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_incentivo_clientes(p_mes date DEFAULT NULL)
RETURNS TABLE(
  conta text,
  cliente_nome text,
  pontos numeric,
  lotes_operados numeric,
  faixa_min numeric,
  valor_incentivo numeric,
  proxima_faixa numeric,
  pontos_faltantes numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH alvo AS (
    SELECT COALESCE(
      date_trunc('month', p_mes)::date,
      (SELECT date_trunc('month', MAX(data))::date FROM public.contratos)
    ) AS mes
  ),
  faixas(faixa_min, valor) AS (
    VALUES
      (1000000::numeric, 49000::numeric),
      (750000, 42000),
      (500000, 31500),
      (300000, 21000),
      (150000, 12000),
      (50000, 5000),
      (10000, 1000),
      (5000, 500),
      (1000, 200)
  ),
  pontos AS (
    SELECT
      contratos_incentivo_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome) AS conta,
      COALESCE(MAX(c.nome), MAX(ct.cliente_nome), 'Sem cliente') AS nome,
      SUM(COALESCE(ct.lotes_operados, 0) * CASE contratos_produto(ct.ativo)
        WHEN 'BIT' THEN 4
        WHEN 'DI1' THEN 1
        WHEN 'DOL' THEN 5
        WHEN 'ETR' THEN 3
        WHEN 'GLD' THEN 3
        WHEN 'IND' THEN 3
        WHEN 'SOL' THEN 3
        WHEN 'WDO' THEN 2
        WHEN 'WIN' THEN 1
        WHEN 'WSP' THEN 1
        ELSE 0
      END) AS pts,
      SUM(COALESCE(ct.lotes_operados, 0)) AS lotes
    FROM public.contratos ct
    LEFT JOIN public.clientes c ON ct.cliente_id = c.id, alvo a
    WHERE date_trunc('month', ct.data)::date = a.mes
      AND public.dashboard_acesso_ok()
    GROUP BY 1
    HAVING SUM(COALESCE(ct.lotes_operados, 0)) > 0
  )
  SELECT
    CASE WHEN p.conta LIKE 'CONSOLIDADO:%' THEN 'todas as contas' ELSE p.conta END AS conta,
    p.nome,
    ROUND(p.pts, 0) AS pontos,
    ROUND(p.lotes, 0) AS lotes_operados,
    COALESCE(fa.faixa_min, 0) AS faixa_min,
    COALESCE(fa.valor, 0) AS valor_incentivo,
    fp.faixa_min AS proxima_faixa,
    CASE WHEN fp.faixa_min IS NULL THEN NULL
         ELSE ROUND(fp.faixa_min - p.pts, 0) END AS pontos_faltantes
  FROM pontos p
  LEFT JOIN LATERAL (
    SELECT f.faixa_min, f.valor FROM faixas f
    WHERE p.pts > f.faixa_min ORDER BY f.faixa_min DESC LIMIT 1
  ) fa ON true
  LEFT JOIN LATERAL (
    -- menor faixa ainda não atingida (precisa de pts > faixa_min)
    SELECT f.faixa_min FROM faixas f
    WHERE p.pts <= f.faixa_min
    ORDER BY f.faixa_min ASC LIMIT 1
  ) fp ON true
  ORDER BY p.pts DESC
  LIMIT 300;
$$;
GRANT EXECUTE ON FUNCTION dashboard_incentivo_clientes(date) TO authenticated, service_role;
