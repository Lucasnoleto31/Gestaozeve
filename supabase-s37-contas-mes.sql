-- ============================================================================
-- S37 · Contas do cliente: lotes e receita do mês de referência e de 12 meses
-- Re-runnável. Rodar depois da S36.
--
-- A tabela "Contas" da ficha mostrava o total de lotes desde sempre (igual aos 12 meses na
-- prática). Passa a trazer, por conta: lotes do mês, lotes de 12 meses, receita do mês,
-- receita de 12 meses e último giro, no mês de referência escolhido na ficha (p_mes_ref).
-- ============================================================================

DROP FUNCTION IF EXISTS public.cliente_contas(text, uuid);
CREATE OR REPLACE FUNCTION public.cliente_contas(p_corretora text, p_cliente_id uuid, p_mes_ref date DEFAULT NULL)
RETURNS TABLE(conta_id uuid, conta text, conta_digito text, situacao_conta text, status text, assessor_nome text, filial text,
              data_habilitacao date, principal boolean, lotes numeric, lotes_12m numeric, zerados numeric, receita numeric, ultimo_giro date,
              lotes_mes numeric, receita_mes numeric, receita_12m numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref,
           (COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) - INTERVAL '12 months')::date AS mes_ini,
           (SELECT vc.status FROM public.v_cliente_corretora vc WHERE vc.corretora = p_corretora AND vc.cliente_id = p_cliente_id) AS status_cliente
  )
  SELECT ct.id, ct.conta, ct.conta_digito, ct.situacao_conta, COALESCE(m.status, cfg.status_cliente, 'Em processamento'),
         ct.assessor_nome, ct.filial, ct.data_habilitacao, ct.principal,
         COALESCE(g.lotes, 0), COALESCE(g.lotes_12m, 0), COALESCE(g.zerados, 0), ROUND(COALESCE(g.receita, 0), 2), g.ultimo_giro,
         COALESCE(g.lotes_mes, 0), ROUND(COALESCE(g.receita_mes, 0), 2), ROUND(COALESCE(g.receita_12m, 0), 2)
  FROM public.contas ct
  CROSS JOIN cfg
  LEFT JOIN public.status_conta_mapa m ON m.corretora = ct.corretora AND m.situacao = upper(trim(COALESCE(ct.situacao_conta, '')))
  LEFT JOIN LATERAL (
    SELECT SUM(lm.operados) AS lotes,
           SUM(lm.operados) FILTER (WHERE lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref) AS lotes_12m,
           SUM(lm.zerados) AS zerados, SUM(lm.receita) AS receita, MAX(lm.ultimo_giro) AS ultimo_giro,
           SUM(lm.operados) FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS lotes_mes,
           SUM(lm.receita)  FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS receita_mes,
           SUM(lm.receita)  FILTER (WHERE lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref) AS receita_12m
    FROM public.lotes_mes lm
    WHERE lm.corretora = ct.corretora AND lm.conta_id = ct.id
  ) g ON true
  WHERE ct.corretora = p_corretora AND ct.cliente_id = p_cliente_id AND public.acesso_ok()
  UNION ALL
  SELECT NULL, lm.conta, NULL, NULL, 'Não cadastrada', MAX(lm.assessor_nome), MAX(lm.filial), NULL, false,
         SUM(lm.operados),
         SUM(lm.operados) FILTER (WHERE lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref),
         SUM(lm.zerados), ROUND(SUM(lm.receita), 2), MAX(lm.ultimo_giro),
         SUM(lm.operados) FILTER (WHERE lm.mes_ref = cfg.mes_ref),
         ROUND(SUM(lm.receita) FILTER (WHERE lm.mes_ref = cfg.mes_ref), 2),
         ROUND(SUM(lm.receita) FILTER (WHERE lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref), 2)
  FROM public.lotes_mes lm CROSS JOIN cfg
  WHERE lm.corretora = p_corretora AND lm.cliente_id = p_cliente_id AND lm.conta_id IS NULL AND public.acesso_ok()
  GROUP BY lm.conta, cfg.mes_ref, cfg.mes_ini
  ORDER BY 9 DESC, 8 NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.cliente_contas(text, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cliente_contas(text, uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.cliente_contas(text, uuid, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
