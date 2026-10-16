-- ============================================================================
-- S49 · Comissões e extrato para qualquer parceiro (também os do campo Parceiro da ficha)
-- Re-runnável. Rodar depois da S43.
--
-- Lucas, 16/10/2026: "em Comissões só aparece o Aikon, não aparece o parceiro Atual Capital" (que
-- está no campo Parceiro das fichas, em Clientes). A tela passou a listar também os parceiros das
-- fichas e dos assessores. No banco, comissao_mensal só aceitava parceiro marcado como comissionado
-- em responsaveis; agora, com p_parceiro informado, calcula para ele mesmo sem a marcação (sem
-- regras a comissão sai 0; aberturas, ativações, contas e receita saem normalmente). Sem p_parceiro
-- (todos), continua só com os comissionados.
-- ============================================================================
DROP FUNCTION IF EXISTS public.comissao_mensal(date, integer, text, text);
CREATE OR REPLACE FUNCTION public.comissao_mensal(p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12, p_parceiro text DEFAULT NULL, p_corretora text DEFAULT NULL)
RETURNS TABLE(
  mes_ref date, parceiro text, corretora text, aberturas integer, ativacoes integer, reativacoes integer,
  valor_abertura numeric, valor_ativacao numeric, contas_mes integer, receita_contas numeric, receita_carteira numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref,
           (COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) - (GREATEST(p_meses, 1) || ' months')::interval)::date AS mes_ini
  ),
  parceiros AS (
    -- um parceiro pedido vale mesmo sem a marcação; "todos" segue só os comissionados
    SELECT r.nome FROM public.responsaveis r WHERE p_parceiro IS NULL AND r.comissionado
    UNION
    SELECT p_parceiro WHERE NULLIF(trim(p_parceiro), '') IS NOT NULL
  ),
  ev AS (
    SELECT p.nome AS parceiro, e.cliente_id, e.corretora, e.tipo, e.mes_ref, e.valor
    FROM parceiros p CROSS JOIN LATERAL public.comissao_eventos(p.nome, p_corretora) e CROSS JOIN cfg
    WHERE e.mes_ref > cfg.mes_ini AND e.mes_ref <= cfg.mes_ref
  ),
  base AS (
    SELECT DISTINCT p.nome AS parceiro, b.cliente_id, b.corretora
    FROM parceiros p CROSS JOIN LATERAL public.comissao_base(p.nome, p_corretora) b
    WHERE b.status = 'Migrado'
  ),
  rec AS (
    SELECT lm.cliente_id, lm.corretora, lm.mes_ref, SUM(lm.receita) AS receita
    FROM public.lotes_mes lm CROSS JOIN cfg
    WHERE lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref
      AND lm.cliente_id IN (SELECT b.cliente_id FROM base b)
    GROUP BY 1, 2, 3
  ),
  contas AS (
    SELECT DISTINCT e.parceiro, e.corretora, e.mes_ref, e.cliente_id FROM ev e
  ),
  rc AS (
    SELECT c.parceiro, c.corretora, c.mes_ref, COUNT(*)::integer AS contas_mes, SUM(COALESCE(r.receita, 0)) AS receita_contas
    FROM contas c
    LEFT JOIN rec r ON r.cliente_id = c.cliente_id AND r.corretora = c.corretora AND r.mes_ref = c.mes_ref
    GROUP BY 1, 2, 3
  ),
  rk AS (
    SELECT b.parceiro, b.corretora, r.mes_ref, SUM(r.receita) AS receita_carteira
    FROM base b JOIN rec r ON r.cliente_id = b.cliente_id AND r.corretora = b.corretora
    GROUP BY 1, 2, 3
  ),
  agg AS (
    SELECT e.mes_ref, e.parceiro, e.corretora,
           COUNT(*) FILTER (WHERE e.tipo = 'abertura')::integer AS aberturas,
           COUNT(*) FILTER (WHERE e.tipo = 'ativacao')::integer AS ativacoes,
           COUNT(*) FILTER (WHERE e.tipo = 'reativacao')::integer AS reativacoes,
           COALESCE(SUM(e.valor) FILTER (WHERE e.tipo = 'abertura'), 0) AS valor_abertura,
           COALESCE(SUM(e.valor) FILTER (WHERE e.tipo <> 'abertura'), 0) AS valor_ativacao
    FROM ev e GROUP BY 1, 2, 3
  ),
  chaves AS (
    SELECT a.mes_ref, a.parceiro, a.corretora FROM agg a
    UNION
    SELECT k.mes_ref, k.parceiro, k.corretora FROM rk k
  )
  SELECT k.mes_ref, k.parceiro, k.corretora,
         COALESCE(a.aberturas, 0), COALESCE(a.ativacoes, 0), COALESCE(a.reativacoes, 0),
         ROUND(COALESCE(a.valor_abertura, 0), 2), ROUND(COALESCE(a.valor_ativacao, 0), 2),
         COALESCE(rc.contas_mes, 0), ROUND(COALESCE(rc.receita_contas, 0), 2), ROUND(COALESCE(rk.receita_carteira, 0), 2)
  FROM chaves k
  LEFT JOIN agg a ON a.mes_ref = k.mes_ref AND a.parceiro = k.parceiro AND a.corretora = k.corretora
  LEFT JOIN rc ON rc.mes_ref = k.mes_ref AND rc.parceiro = k.parceiro AND rc.corretora = k.corretora
  LEFT JOIN rk ON rk.mes_ref = k.mes_ref AND rk.parceiro = k.parceiro AND rk.corretora = k.corretora
  WHERE public.acesso_ok()
  ORDER BY 1, 2, 3;
$$;

REVOKE ALL ON FUNCTION public.comissao_mensal(date, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.comissao_mensal(date, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.comissao_mensal(date, integer, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Conferência: o mês a mês de um parceiro da ficha (troque o nome se for outro)
SELECT mes_ref, corretora, aberturas, ativacoes, reativacoes, contas_mes, receita_contas, receita_carteira
FROM public.comissao_mensal(NULL, 6, 'Atual Capital', NULL);
