-- ============================================================================
-- S50 · Funil: um destino só para cada lead (Perdido, Em contato, Conta aberta, Conta reativada)
-- Re-runnável. Rodar depois da S47.
--
-- Lucas, 16/10/2026: "em Funil está confuso; deveria ser perdido, em contato, conta aberta, conta
-- reativada". O painel "Saídas e pendências" somava recortes que se sobrepunham (quem já era cliente
-- também entrava em "em aberto" ou "perdidos"). Agora cada lead cai em um destino só, nesta ordem:
--   conta reativada  já era cliente migrado antes de entrar pelo formulário (voltou)
--   conta aberta     marcado como Ganho, ou ligado a um cliente Migrado / Em processamento
--                    (contas_em_abertura = a parte que ainda não migrou)
--   perdido          status Perdido, ou o cliente ligado recusou a corretora
--   em contato       o resto: lead aberto, ainda sendo trabalhado
-- Os quatro somam os leads que entraram. funil_safra e funil_safra_por devolvem em_contato,
-- perdidos_funil, contas_abertas e contas_em_abertura (conta reativada = ja_clientes, que já existia).
-- ============================================================================
DROP FUNCTION IF EXISTS public.funil_safra(date, integer);
CREATE OR REPLACE FUNCTION public.funil_safra(p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(
  mes_ref date, recebidos integer, contatados integer, perdidos integer, ganhos integer, em_aberto integer,
  ja_clientes integer, viraram_clientes integer, ativados integer, em_processamento integer, recusaram integer,
  com_giro integer, lotes numeric, receita numeric, contatos integer, contatos_ganhos integer, ganhos_contatados integer,
  em_contato integer, perdidos_funil integer, contas_abertas integer, contas_em_abertura integer
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref),
  meses AS MATERIALIZED (
    SELECT (cfg.mes_ref - (n || ' months')::interval)::date AS mes_ref
    FROM cfg, generate_series(0, GREATEST(p_meses, 1) - 1) AS n
  ),
  ct AS MATERIALIZED (
    SELECT c.lead_id, COUNT(*)::integer AS n FROM public.lead_contatos c GROUP BY c.lead_id
  ),
  lead AS MATERIALIZED (
    SELECT ld.id, ld.cliente_id, ld.status, COALESCE(sl.tipo, 'Aberto') AS tipo,
           (ld.ultimo_contato IS NOT NULL OR ld.status <> 'Novo') AS contatado,
           date_trunc('month', (ld.data_hora AT TIME ZONE 'America/Sao_Paulo'))::date AS mes_lead,
           (ld.data_hora AT TIME ZONE 'America/Sao_Paulo')::date AS dia_lead,
           COALESCE(ct.n, 0) AS contatos
    FROM public.leads ld
    LEFT JOIN public.status_lead sl ON sl.status = ld.status
    LEFT JOIN ct ON ct.lead_id = ld.id
  ),
  cli AS MATERIALIZED (
    SELECT DISTINCT ON (vc.cliente_id) vc.cliente_id, vc.status, vc.data_migracao
    FROM public.v_cliente_corretora vc
    WHERE vc.cliente_id IN (SELECT lead.cliente_id FROM lead WHERE lead.cliente_id IS NOT NULL)
    ORDER BY vc.cliente_id, (vc.status = 'Migrado') DESC, (vc.status = 'Em processamento') DESC, vc.data_migracao
  ),
  giro AS MATERIALIZED (
    SELECT lm.cliente_id, SUM(lm.operados) AS lotes, SUM(lm.receita) AS receita
    FROM public.lotes_mes lm
    WHERE lm.cliente_id IN (SELECT cli.cliente_id FROM cli)
    GROUP BY lm.cliente_id
  ),
  l AS MATERIALIZED (
    SELECT x.*,
           CASE WHEN x.ja_cliente THEN 'reativada'
                WHEN x.status = 'Ganho' OR x.status_cliente IN ('Migrado', 'Em processamento') THEN 'aberta'
                WHEN x.status = 'Perdido' OR x.status_cliente = 'Recusou' THEN 'perdido'
                ELSE 'contato' END AS destino
    FROM (
      SELECT lead.*, c.status AS status_cliente,
             COALESCE(c.status = 'Migrado' AND c.data_migracao IS NOT NULL AND c.data_migracao < lead.dia_lead, false) AS ja_cliente,
             g.lotes, g.receita
      FROM lead
      LEFT JOIN cli c ON c.cliente_id = lead.cliente_id
      LEFT JOIN giro g ON g.cliente_id = lead.cliente_id
    ) x
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
    ROUND(COALESCE(SUM(l.receita) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado'), 0), 2),
    COALESCE(SUM(l.contatos), 0)::integer,
    COALESCE(SUM(l.contatos) FILTER (WHERE l.status = 'Ganho'), 0)::integer,
    COUNT(*) FILTER (WHERE l.status = 'Ganho' AND l.contatos > 0)::integer,
    COUNT(*) FILTER (WHERE l.destino = 'contato')::integer,
    COUNT(*) FILTER (WHERE l.destino = 'perdido')::integer,
    COUNT(*) FILTER (WHERE l.destino = 'aberta')::integer,
    COUNT(*) FILTER (WHERE l.destino = 'aberta' AND l.status_cliente IS DISTINCT FROM 'Migrado')::integer
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
  com_giro integer, lotes numeric, receita numeric, contatos integer, contatos_ganhos integer, ganhos_contatados integer,
  em_contato integer, perdidos_funil integer, contas_abertas integer, contas_em_abertura integer
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref,
           (COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) - ((GREATEST(p_meses, 1) - 1) || ' months')::interval)::date AS d_ini
  ),
  ct AS MATERIALIZED (
    SELECT c.lead_id, COUNT(*)::integer AS n FROM public.lead_contatos c GROUP BY c.lead_id
  ),
  lead AS MATERIALIZED (
    SELECT ld.id, ld.cliente_id, ld.status, COALESCE(sl.tipo, 'Aberto') AS tipo,
           (ld.ultimo_contato IS NOT NULL OR ld.status <> 'Novo') AS contatado,
           (ld.data_hora AT TIME ZONE 'America/Sao_Paulo')::date AS dia_lead,
           COALESCE(ct.n, 0) AS contatos,
           CASE WHEN p_campo = 'origem' THEN COALESCE(NULLIF(ld.origem, ''), 'Sem origem')
                WHEN p_campo = 'corretora' THEN COALESCE(NULLIF(ld.corretora, ''), 'Não informada')
                ELSE COALESCE(NULLIF(ld.responsavel, ''), 'Sem responsável') END AS grupo
    FROM public.leads ld CROSS JOIN cfg
    LEFT JOIN public.status_lead sl ON sl.status = ld.status
    LEFT JOIN ct ON ct.lead_id = ld.id
    WHERE date_trunc('month', (ld.data_hora AT TIME ZONE 'America/Sao_Paulo'))::date BETWEEN cfg.d_ini AND cfg.mes_ref
  ),
  cli AS MATERIALIZED (
    SELECT DISTINCT ON (vc.cliente_id) vc.cliente_id, vc.status, vc.data_migracao
    FROM public.v_cliente_corretora vc
    WHERE vc.cliente_id IN (SELECT lead.cliente_id FROM lead WHERE lead.cliente_id IS NOT NULL)
    ORDER BY vc.cliente_id, (vc.status = 'Migrado') DESC, (vc.status = 'Em processamento') DESC, vc.data_migracao
  ),
  giro AS MATERIALIZED (
    SELECT lm.cliente_id, SUM(lm.operados) AS lotes, SUM(lm.receita) AS receita
    FROM public.lotes_mes lm
    WHERE lm.cliente_id IN (SELECT cli.cliente_id FROM cli)
    GROUP BY lm.cliente_id
  ),
  l AS MATERIALIZED (
    SELECT x.*,
           CASE WHEN x.ja_cliente THEN 'reativada'
                WHEN x.status = 'Ganho' OR x.status_cliente IN ('Migrado', 'Em processamento') THEN 'aberta'
                WHEN x.status = 'Perdido' OR x.status_cliente = 'Recusou' THEN 'perdido'
                ELSE 'contato' END AS destino
    FROM (
      SELECT lead.*, c.status AS status_cliente,
             COALESCE(c.status = 'Migrado' AND c.data_migracao IS NOT NULL AND c.data_migracao < lead.dia_lead, false) AS ja_cliente,
             g.lotes, g.receita
      FROM lead
      LEFT JOIN cli c ON c.cliente_id = lead.cliente_id
      LEFT JOIN giro g ON g.cliente_id = lead.cliente_id
    ) x
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
    ROUND(COALESCE(SUM(l.receita) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado'), 0), 2),
    COALESCE(SUM(l.contatos), 0)::integer,
    COALESCE(SUM(l.contatos) FILTER (WHERE l.status = 'Ganho'), 0)::integer,
    COUNT(*) FILTER (WHERE l.status = 'Ganho' AND l.contatos > 0)::integer,
    COUNT(*) FILTER (WHERE l.destino = 'contato')::integer,
    COUNT(*) FILTER (WHERE l.destino = 'perdido')::integer,
    COUNT(*) FILTER (WHERE l.destino = 'aberta')::integer,
    COUNT(*) FILTER (WHERE l.destino = 'aberta' AND l.status_cliente IS DISTINCT FROM 'Migrado')::integer
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

-- Conferência: os quatro destinos somam os leads que entraram em cada mês
SELECT mes_ref, recebidos, em_contato, perdidos_funil, contas_abertas, contas_em_abertura, ja_clientes AS contas_reativadas,
       em_contato + perdidos_funil + contas_abertas + ja_clientes AS soma
FROM public.funil_safra(NULL, 4);
