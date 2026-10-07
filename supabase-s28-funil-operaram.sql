-- ============================================================================
-- S28 · Funil por safra: "ativados" = quem operou, também por responsável e origem
-- Re-runnável. Rodar depois da S27.
--
-- Vocabulário do escritório: tombou = virou cliente (abriu a conta); ativado = operou.
-- funil_safra() já devolve com_giro (quem abriu a conta e operou); esta S28 acrescenta a
-- mesma coluna em funil_safra_por(), usada nas tabelas por responsável e por origem.
-- ============================================================================
DROP FUNCTION IF EXISTS public.funil_safra_por(text, date, integer);
CREATE OR REPLACE FUNCTION public.funil_safra_por(p_campo text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(
  grupo text, recebidos integer, contatados integer, perdidos integer, ganhos integer, em_aberto integer,
  ja_clientes integer, viraram_clientes integer, ativados integer, em_processamento integer, recusaram integer,
  com_giro integer, lotes numeric, receita numeric
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
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado' AND COALESCE(l.lotes, 0) > 0)::integer,
    COALESCE(SUM(l.lotes) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado'), 0),
    ROUND(COALESCE(SUM(l.receita) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado'), 0), 2)
  FROM l
  WHERE public.acesso_ok()
  GROUP BY l.grupo
  ORDER BY 2 DESC, 1;
$$;

REVOKE ALL ON FUNCTION public.funil_safra_por(text, date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.funil_safra_por(text, date, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.funil_safra_por(text, date, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT grupo, recebidos, contatados, perdidos, viraram_clientes AS cadastrados, ativados AS tombaram, com_giro AS operaram, lotes, receita
FROM public.funil_safra_por('responsavel', NULL, 12);
