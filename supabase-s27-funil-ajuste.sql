-- ============================================================================
-- S27 · Funil por safra: separa quem já era cliente e fica 5× mais rápido
-- Re-runnável. Rodar depois da S26.
--
-- 1. "Já era cliente": lead ligado a um cliente que já estava migrado antes de entrar no
--    formulário. Não conta como ativado por nós (nem os lotes e a receita dele).
-- 2. "Viraram clientes": ganhos ou leads ligados a um cadastro novo (qualquer status).
-- 3. Status do cliente calculado uma vez por cliente (antes era por lead: 2 s).
-- ============================================================================
DROP FUNCTION IF EXISTS public.funil_safra(date, integer);
CREATE OR REPLACE FUNCTION public.funil_safra(p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(
  mes_ref date, recebidos integer, contatados integer, perdidos integer, ganhos integer, em_aberto integer,
  ja_clientes integer, viraram_clientes integer, ativados integer, em_processamento integer, recusaram integer,
  com_giro integer, lotes numeric, receita numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref),
  meses AS MATERIALIZED (
    SELECT (cfg.mes_ref - (n || ' months')::interval)::date AS mes_ref
    FROM cfg, generate_series(0, GREATEST(p_meses, 1) - 1) AS n
  ),
  lead AS MATERIALIZED (
    SELECT ld.id, ld.cliente_id, ld.status, COALESCE(sl.tipo, 'Aberto') AS tipo,
           (ld.ultimo_contato IS NOT NULL OR ld.status <> 'Novo') AS contatado,
           date_trunc('month', (ld.data_hora AT TIME ZONE 'America/Sao_Paulo'))::date AS mes_lead,
           (ld.data_hora AT TIME ZONE 'America/Sao_Paulo')::date AS dia_lead
    FROM public.leads ld
    LEFT JOIN public.status_lead sl ON sl.status = ld.status
  ),
  -- um status por cliente ligado a lead: Migrado > Em processamento > Recusou
  cli AS MATERIALIZED (
    SELECT DISTINCT ON (vc.cliente_id) vc.cliente_id, vc.status, vc.data_migracao
    FROM public.v_cliente_corretora vc
    WHERE vc.cliente_id IN (SELECT cliente_id FROM lead WHERE cliente_id IS NOT NULL)
    ORDER BY vc.cliente_id, (vc.status = 'Migrado') DESC, (vc.status = 'Em processamento') DESC, vc.data_migracao
  ),
  giro AS MATERIALIZED (
    SELECT v.cliente_id, SUM(v.lotes_operados) AS lotes, SUM(v.receita) AS receita
    FROM public.v_lotes v
    WHERE v.cliente_id IN (SELECT cliente_id FROM cli)
    GROUP BY v.cliente_id
  ),
  l AS MATERIALIZED (
    SELECT lead.*, c.status AS status_cliente,
           COALESCE(c.status = 'Migrado' AND c.data_migracao IS NOT NULL AND c.data_migracao < lead.dia_lead, false) AS ja_cliente,
           g.lotes, g.receita
    FROM lead
    LEFT JOIN cli c ON c.cliente_id = lead.cliente_id
    LEFT JOIN giro g ON g.cliente_id = lead.cliente_id
  )
  SELECT m.mes_ref,
    COUNT(l.id)::integer,
    COUNT(*) FILTER (WHERE l.contatado)::integer,
    COUNT(*) FILTER (WHERE l.status = 'Perdido')::integer,
    COUNT(*) FILTER (WHERE l.status = 'Ganho')::integer,
    COUNT(*) FILTER (WHERE l.tipo = 'Aberto')::integer,
    COUNT(*) FILTER (WHERE l.ja_cliente)::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND (l.status = 'Ganho' OR l.status_cliente IS NOT NULL))::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado')::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Em processamento')::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Recusou')::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado' AND COALESCE(l.lotes, 0) > 0)::integer,
    COALESCE(SUM(l.lotes) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado'), 0),
    ROUND(COALESCE(SUM(l.receita) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado'), 0), 2)
  FROM meses m
  LEFT JOIN l ON l.mes_lead = m.mes_ref
  WHERE public.acesso_ok()
  GROUP BY m.mes_ref
  ORDER BY m.mes_ref;
$$;

DROP FUNCTION IF EXISTS public.funil_safra_por(text, date, integer);
CREATE OR REPLACE FUNCTION public.funil_safra_por(p_campo text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(
  grupo text, recebidos integer, contatados integer, perdidos integer, ganhos integer, em_aberto integer,
  ja_clientes integer, viraram_clientes integer, ativados integer, em_processamento integer, recusaram integer,
  lotes numeric, receita numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref,
           (COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) - ((GREATEST(p_meses, 1) - 1) || ' months')::interval)::date AS d_ini
  ),
  lead AS MATERIALIZED (
    SELECT ld.id, ld.cliente_id, ld.status, COALESCE(sl.tipo, 'Aberto') AS tipo,
           (ld.ultimo_contato IS NOT NULL OR ld.status <> 'Novo') AS contatado,
           (ld.data_hora AT TIME ZONE 'America/Sao_Paulo')::date AS dia_lead,
           CASE WHEN p_campo = 'origem' THEN COALESCE(NULLIF(ld.origem, ''), 'Sem origem')
                WHEN p_campo = 'corretora' THEN COALESCE(NULLIF(ld.corretora, ''), 'Não informada')
                ELSE COALESCE(NULLIF(ld.responsavel, ''), 'Sem responsável') END AS grupo
    FROM public.leads ld CROSS JOIN cfg
    LEFT JOIN public.status_lead sl ON sl.status = ld.status
    WHERE date_trunc('month', (ld.data_hora AT TIME ZONE 'America/Sao_Paulo'))::date BETWEEN cfg.d_ini AND cfg.mes_ref
  ),
  cli AS MATERIALIZED (
    SELECT DISTINCT ON (vc.cliente_id) vc.cliente_id, vc.status, vc.data_migracao
    FROM public.v_cliente_corretora vc
    WHERE vc.cliente_id IN (SELECT cliente_id FROM lead WHERE cliente_id IS NOT NULL)
    ORDER BY vc.cliente_id, (vc.status = 'Migrado') DESC, (vc.status = 'Em processamento') DESC, vc.data_migracao
  ),
  giro AS MATERIALIZED (
    SELECT v.cliente_id, SUM(v.lotes_operados) AS lotes, SUM(v.receita) AS receita
    FROM public.v_lotes v
    WHERE v.cliente_id IN (SELECT cliente_id FROM cli)
    GROUP BY v.cliente_id
  ),
  l AS MATERIALIZED (
    SELECT lead.*, c.status AS status_cliente,
           COALESCE(c.status = 'Migrado' AND c.data_migracao IS NOT NULL AND c.data_migracao < lead.dia_lead, false) AS ja_cliente,
           g.lotes, g.receita
    FROM lead
    LEFT JOIN cli c ON c.cliente_id = lead.cliente_id
    LEFT JOIN giro g ON g.cliente_id = lead.cliente_id
  )
  SELECT l.grupo,
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE l.contatado)::integer,
    COUNT(*) FILTER (WHERE l.status = 'Perdido')::integer,
    COUNT(*) FILTER (WHERE l.status = 'Ganho')::integer,
    COUNT(*) FILTER (WHERE l.tipo = 'Aberto')::integer,
    COUNT(*) FILTER (WHERE l.ja_cliente)::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND (l.status = 'Ganho' OR l.status_cliente IS NOT NULL))::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado')::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Em processamento')::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Recusou')::integer,
    COALESCE(SUM(l.lotes) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado'), 0),
    ROUND(COALESCE(SUM(l.receita) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado'), 0), 2)
  FROM l
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

-- Conferência (deve ficar bem abaixo de 1 s)
EXPLAIN (ANALYZE, SUMMARY) SELECT COUNT(*) FROM public.funil_safra(NULL, 12);
SELECT mes_ref, recebidos, contatados, perdidos, ganhos, ja_clientes, viraram_clientes, ativados, recusaram, lotes, receita FROM public.funil_safra(NULL, 12);
