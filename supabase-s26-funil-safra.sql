-- ============================================================================
-- S26 · Funil de leads por safra
-- Re-runnável. Rodar depois da S25.
--
-- Do que entrou em cada mês, o que aconteceu até hoje: quantos contatamos, quantos
-- tombaram (perdidos), quantos ganhamos, quantos ativamos (viraram clientes migrados),
-- quantos recusaram, e dos ativados quantos lotes operaram e quanta receita deixaram.
-- O cliente vem do vínculo lead → cliente (CPF, telefone, nome ou o assistente de lead ganho).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.funil_safra(p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(
  mes_ref date, recebidos integer, contatados integer, perdidos integer, ganhos integer, em_aberto integer,
  ativados integer, em_processamento integer, recusaram integer, com_giro integer, lotes numeric, receita numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref),
  meses AS MATERIALIZED (
    SELECT (cfg.mes_ref - (n || ' months')::interval)::date AS mes_ref
    FROM cfg, generate_series(0, GREATEST(p_meses, 1) - 1) AS n
  ),
  l AS MATERIALIZED (
    SELECT ld.id, ld.cliente_id, ld.status, COALESCE(sl.tipo, 'Aberto') AS tipo,
           (ld.ultimo_contato IS NOT NULL OR ld.status <> 'Novo') AS contatado,
           date_trunc('month', (ld.data_hora AT TIME ZONE 'America/Sao_Paulo'))::date AS mes_lead,
           cs.status AS status_cliente
    FROM public.leads ld
    LEFT JOIN public.status_lead sl ON sl.status = ld.status
    LEFT JOIN LATERAL (
      SELECT vc.status FROM public.v_cliente_corretora vc WHERE vc.cliente_id = ld.cliente_id
      ORDER BY (vc.status = 'Migrado') DESC, (vc.status = 'Em processamento') DESC LIMIT 1
    ) cs ON true
  ),
  giro AS MATERIALIZED (
    SELECT v.cliente_id, SUM(v.lotes_operados) AS lotes, SUM(v.receita) AS receita
    FROM public.v_lotes v
    WHERE v.cliente_id IN (SELECT cliente_id FROM l WHERE cliente_id IS NOT NULL)
    GROUP BY v.cliente_id
  )
  SELECT m.mes_ref,
    COUNT(l.id)::integer,
    COUNT(*) FILTER (WHERE l.contatado)::integer,
    COUNT(*) FILTER (WHERE l.status = 'Perdido')::integer,
    COUNT(*) FILTER (WHERE l.status = 'Ganho')::integer,
    COUNT(*) FILTER (WHERE l.tipo = 'Aberto')::integer,
    COUNT(*) FILTER (WHERE l.status_cliente = 'Migrado')::integer,
    COUNT(*) FILTER (WHERE l.status_cliente = 'Em processamento')::integer,
    COUNT(*) FILTER (WHERE l.status_cliente = 'Recusou')::integer,
    COUNT(*) FILTER (WHERE l.status_cliente = 'Migrado' AND COALESCE(g.lotes, 0) > 0)::integer,
    COALESCE(SUM(g.lotes) FILTER (WHERE l.status_cliente = 'Migrado'), 0),
    ROUND(COALESCE(SUM(g.receita) FILTER (WHERE l.status_cliente = 'Migrado'), 0), 2)
  FROM meses m
  LEFT JOIN l ON l.mes_lead = m.mes_ref
  LEFT JOIN giro g ON g.cliente_id = l.cliente_id
  WHERE public.acesso_ok()
  GROUP BY m.mes_ref
  ORDER BY m.mes_ref;
$$;

-- Mesma safra agrupada por responsável, origem ou corretora onde o lead já operava (janela inteira)
CREATE OR REPLACE FUNCTION public.funil_safra_por(p_campo text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(
  grupo text, recebidos integer, contatados integer, perdidos integer, ganhos integer, em_aberto integer,
  ativados integer, em_processamento integer, recusaram integer, lotes numeric, receita numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref,
           (COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) - ((GREATEST(p_meses, 1) - 1) || ' months')::interval)::date AS d_ini
  ),
  l AS MATERIALIZED (
    SELECT ld.id, ld.cliente_id, ld.status, COALESCE(sl.tipo, 'Aberto') AS tipo,
           (ld.ultimo_contato IS NOT NULL OR ld.status <> 'Novo') AS contatado,
           cs.status AS status_cliente,
           CASE WHEN p_campo = 'origem' THEN COALESCE(NULLIF(ld.origem, ''), 'Sem origem')
                WHEN p_campo = 'corretora' THEN COALESCE(NULLIF(ld.corretora, ''), 'Não informada')
                ELSE COALESCE(NULLIF(ld.responsavel, ''), 'Sem responsável') END AS grupo
    FROM public.leads ld CROSS JOIN cfg
    LEFT JOIN public.status_lead sl ON sl.status = ld.status
    LEFT JOIN LATERAL (
      SELECT vc.status FROM public.v_cliente_corretora vc WHERE vc.cliente_id = ld.cliente_id
      ORDER BY (vc.status = 'Migrado') DESC, (vc.status = 'Em processamento') DESC LIMIT 1
    ) cs ON true
    WHERE date_trunc('month', (ld.data_hora AT TIME ZONE 'America/Sao_Paulo'))::date BETWEEN cfg.d_ini AND cfg.mes_ref
  ),
  giro AS MATERIALIZED (
    SELECT v.cliente_id, SUM(v.lotes_operados) AS lotes, SUM(v.receita) AS receita
    FROM public.v_lotes v
    WHERE v.cliente_id IN (SELECT cliente_id FROM l WHERE cliente_id IS NOT NULL)
    GROUP BY v.cliente_id
  )
  SELECT l.grupo,
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE l.contatado)::integer,
    COUNT(*) FILTER (WHERE l.status = 'Perdido')::integer,
    COUNT(*) FILTER (WHERE l.status = 'Ganho')::integer,
    COUNT(*) FILTER (WHERE l.tipo = 'Aberto')::integer,
    COUNT(*) FILTER (WHERE l.status_cliente = 'Migrado')::integer,
    COUNT(*) FILTER (WHERE l.status_cliente = 'Em processamento')::integer,
    COUNT(*) FILTER (WHERE l.status_cliente = 'Recusou')::integer,
    COALESCE(SUM(g.lotes) FILTER (WHERE l.status_cliente = 'Migrado'), 0),
    ROUND(COALESCE(SUM(g.receita) FILTER (WHERE l.status_cliente = 'Migrado'), 0), 2)
  FROM l
  LEFT JOIN giro g ON g.cliente_id = l.cliente_id
  WHERE public.acesso_ok()
  GROUP BY l.grupo
  ORDER BY 2 DESC, 1;
$$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('funil_safra', 'funil_safra_por')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Conferência
SELECT * FROM public.funil_safra(NULL, 12);
SELECT * FROM public.funil_safra_por('responsavel', NULL, 12);
