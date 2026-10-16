-- ============================================================================
-- S47 · Histórico de contatos por lead e clientes ganhos por dia
-- Re-runnável. Rodar depois da S45 (leads sem duplicados).
--
-- Lucas, 16/10/2026: "quantos contatos fizemos com aquele lead, uma rota" — para saber no funil
-- com quantos contatos, em média, um lead converte; e "quantos clientes estamos conseguindo
-- trazer por dia" (ontem +3, hoje +2).
--
-- 1. lead_contatos: um registro por contato (data, nota, quem registrou). O telefone da lista e o
--    histórico na ficha gravam aqui. O campo leads.ultimo_contato continua existindo (é o que
--    dispara o alerta de contato) e passa a ser a maior data do histórico.
-- 2. Gatilho em leads: quando ultimo_contato muda por outro caminho (ficha, importação,
--    unificação) e não há contato naquela data, entra um registro — o histórico nunca fica
--    atrás do campo.
-- 3. Carga inicial: lead com ultimo_contato preenchido ganha 1 contato nessa data (é o que se
--    sabe dele). A média de contatos passa a valer de verdade para os leads trabalhados daqui
--    em diante.
-- 4. leads_lista devolve contatos; funil_safra e funil_safra_por devolvem contatos (todos),
--    contatos_ganhos e ganhos_contatados (média por lead ganho = contatos_ganhos / ganhos_contatados).
-- 5. leads_diario(p_dias): por dia, quantos leads entraram, contatos feitos, ganhos, perdidos e
--    contas abertas (data de migração) — o "+3 ontem, +2 hoje".
-- ============================================================================

-- 1. Histórico de contatos --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  data date NOT NULL DEFAULT public.brasil_hoje(),
  nota text,
  criado_por uuid,
  criado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_contatos_lead_idx ON public.lead_contatos (lead_id, data);
CREATE INDEX IF NOT EXISTS lead_contatos_data_idx ON public.lead_contatos (data);
ALTER TABLE public.lead_contatos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_contatos TO service_role;
REVOKE ALL ON public.lead_contatos FROM anon;

-- 2. Gatilho: ultimo_contato mudou por fora (ficha, importação, unificação) → entra no histórico
CREATE OR REPLACE FUNCTION public.lead_contato_gatilho()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NEW.ultimo_contato IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.ultimo_contato IS DISTINCT FROM NEW.ultimo_contato)
     AND NOT EXISTS (SELECT 1 FROM public.lead_contatos c WHERE c.lead_id = NEW.id AND c.data = NEW.ultimo_contato) THEN
    INSERT INTO public.lead_contatos (lead_id, data, nota)
    VALUES (NEW.id, NEW.ultimo_contato, 'Último contato informado na ficha ou na importação');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lead_contato_gatilho ON public.leads;
CREATE TRIGGER lead_contato_gatilho
AFTER INSERT OR UPDATE OF ultimo_contato ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.lead_contato_gatilho();

-- 3. Carga inicial: o último contato conhecido vira o primeiro registro do histórico
INSERT INTO public.lead_contatos (lead_id, data, nota)
SELECT l.id, l.ultimo_contato, 'Contato anterior ao histórico (carga da S47)'
FROM public.leads l
WHERE l.ultimo_contato IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.lead_contatos c WHERE c.lead_id = l.id);

-- 4. Registrar e excluir contato (telefone da lista e histórico da ficha) -------------------------
CREATE OR REPLACE FUNCTION public.registrar_contato_lead(
  p_lead_id uuid, p_data date DEFAULT NULL, p_nota text DEFAULT NULL, p_status text DEFAULT NULL,
  p_criado_por uuid DEFAULT NULL, p_criado_por_nome text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_data date := COALESCE(p_data, public.brasil_hoje()); n integer;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = p_lead_id) THEN RAISE EXCEPTION 'lead não encontrado'; END IF;
  IF v_data > public.brasil_hoje() THEN RAISE EXCEPTION 'a data do contato não pode ser futura'; END IF;
  INSERT INTO public.lead_contatos (lead_id, data, nota, criado_por, criado_por_nome)
  VALUES (p_lead_id, v_data, NULLIF(trim(p_nota), ''), p_criado_por, NULLIF(trim(p_criado_por_nome), ''));
  UPDATE public.leads SET
    ultimo_contato = GREATEST(COALESCE(ultimo_contato, v_data), v_data),
    status = COALESCE(NULLIF(trim(p_status), ''), status),
    updated_at = now()
  WHERE id = p_lead_id;
  SELECT COUNT(*)::integer INTO n FROM public.lead_contatos WHERE lead_id = p_lead_id;
  RETURN n;
END;
$$;

-- Excluir um contato registrado por engano; ultimo_contato volta a ser a maior data que sobrou
CREATE OR REPLACE FUNCTION public.excluir_contato_lead(p_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_lead uuid; n integer;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  DELETE FROM public.lead_contatos WHERE id = p_id RETURNING lead_id INTO v_lead;
  IF NOT FOUND THEN RETURN 0; END IF;
  UPDATE public.leads SET
    ultimo_contato = (SELECT MAX(c.data) FROM public.lead_contatos c WHERE c.lead_id = v_lead),
    updated_at = now()
  WHERE id = v_lead;
  SELECT COUNT(*)::integer INTO n FROM public.lead_contatos WHERE lead_id = v_lead;
  RETURN n;
END;
$$;

-- 5. Unificação de leads leva o histórico junto (senão o CASCADE apagava os contatos do removido) ---
CREATE OR REPLACE FUNCTION public.unificar_leads(p_manter uuid, p_remover uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE a public.leads%ROWTYPE; b public.leads%ROWTYPE; v_status text;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  SELECT * INTO a FROM public.leads WHERE id = p_manter;
  SELECT * INTO b FROM public.leads WHERE id = p_remover;
  IF a.id IS NULL OR b.id IS NULL OR a.id = b.id THEN RETURN; END IF;

  -- status: Ganho vence; um status aberto vence Perdido; senão fica o do mantido
  v_status := CASE WHEN a.status = 'Ganho' OR b.status = 'Ganho' THEN 'Ganho'
                   WHEN a.status = 'Perdido' AND b.status <> 'Perdido' THEN b.status
                   ELSE a.status END;

  -- os contatos do removido passam para o mantido antes de ele sumir
  UPDATE public.lead_contatos SET lead_id = a.id WHERE lead_id = b.id;

  UPDATE public.leads SET
    data_hora = LEAST(a.data_hora, b.data_hora),
    nome = CASE WHEN length(b.nome) > length(a.nome) THEN b.nome ELSE a.nome END,
    whatsapp = COALESCE(a.whatsapp, b.whatsapp), whatsapp_digits = COALESCE(a.whatsapp_digits, b.whatsapp_digits),
    cpf = COALESCE(a.cpf, b.cpf), cpf_digits = COALESCE(a.cpf_digits, b.cpf_digits),
    email = COALESCE(a.email, b.email), ja_opera = COALESCE(a.ja_opera, b.ja_opera), corretora = COALESCE(a.corretora, b.corretora),
    origem = COALESCE(a.origem, b.origem), responsavel = COALESCE(a.responsavel, b.responsavel),
    status = v_status,
    ultimo_contato = GREATEST(a.ultimo_contato, b.ultimo_contato),
    data_fechamento = CASE WHEN v_status = 'Ganho' THEN COALESCE(CASE WHEN a.status = 'Ganho' THEN a.data_fechamento END, CASE WHEN b.status = 'Ganho' THEN b.data_fechamento END)
                           WHEN v_status = 'Perdido' THEN COALESCE(a.data_fechamento, b.data_fechamento)
                           ELSE NULL END,
    motivo_perda = COALESCE(a.motivo_perda, b.motivo_perda),
    observacoes = concat_ws(E'\n', NULLIF(a.observacoes, ''), NULLIF(b.observacoes, ''),
                            'Unificado com o cadastro repetido de ' || to_char(b.data_hora AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YY HH24:MI') || '.'),
    cliente_id = COALESCE(a.cliente_id, b.cliente_id),
    reentradas = a.reentradas + b.reentradas + 1,
    ultima_entrada = GREATEST(COALESCE(a.ultima_entrada, a.data_hora), COALESCE(b.ultima_entrada, b.data_hora)),
    updated_at = now()
  WHERE id = a.id;

  DELETE FROM public.leads WHERE id = b.id;
END;
$$;

-- 6. Lista de leads com a contagem de contatos ----------------------------------------------------
DROP FUNCTION IF EXISTS public.leads_lista(text);
CREATE OR REPLACE FUNCTION public.leads_lista(p_corretora_opera text DEFAULT NULL)
RETURNS TABLE(
  id uuid, corretora text, data_hora timestamptz, nome text, whatsapp text, cpf text, email text, ja_opera text,
  origem text, responsavel text, status text, tipo_status text, ultimo_contato date, data_fechamento date,
  motivo_perda text, observacoes text, cliente_id uuid, cliente_nome text, cliente_status text, cliente_corretora text, conta text,
  girou boolean, lotes_12m numeric, dias integer, alerta boolean, contatos integer
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(NULLIF(public.param('GERAL', 'dias_alerta_lead'), '')::integer, 7) AS dias_alerta,
           public.brasil_hoje() AS hoje,
           date_trunc('month', (public.brasil_hoje() - INTERVAL '12 months'))::date AS mes_ini
  ),
  giro AS MATERIALIZED (
    SELECT lm.cliente_id, SUM(lm.operados) AS lotes_12m, bool_or(lm.operados > 0) AS girou
    FROM public.lotes_mes lm CROSS JOIN cfg
    WHERE lm.cliente_id IS NOT NULL AND lm.mes_ref >= cfg.mes_ini
    GROUP BY lm.cliente_id
  ),
  conta_p AS MATERIALIZED (
    SELECT DISTINCT ON (vc.cliente_id) vc.cliente_id, vc.conta_principal AS conta, vc.corretora, vc.status
    FROM public.v_cliente_corretora vc
    ORDER BY vc.cliente_id, (vc.status = 'Migrado') DESC, vc.n_contas DESC, vc.corretora
  ),
  ct AS MATERIALIZED (
    SELECT c.lead_id, COUNT(*)::integer AS n FROM public.lead_contatos c GROUP BY c.lead_id
  )
  SELECT ld.id, ld.corretora, ld.data_hora, ld.nome, ld.whatsapp, ld.cpf, ld.email, ld.ja_opera,
         ld.origem, ld.responsavel, ld.status, COALESCE(sl.tipo, 'Aberto'),
         ld.ultimo_contato, ld.data_fechamento, ld.motivo_perda, ld.observacoes,
         ld.cliente_id, c.nome, cp.status, cp.corretora, cp.conta,
         COALESCE(g.girou, false), COALESCE(g.lotes_12m, 0),
         CASE WHEN COALESCE(sl.tipo, 'Aberto') = 'Fechado' AND ld.data_fechamento IS NOT NULL
              THEN (ld.data_fechamento - (ld.data_hora AT TIME ZONE 'America/Sao_Paulo')::date)
              ELSE (cfg.hoje - (ld.data_hora AT TIME ZONE 'America/Sao_Paulo')::date) END,
         (COALESCE(sl.tipo, 'Aberto') = 'Aberto'
          AND (cfg.hoje - COALESCE(ld.ultimo_contato, (ld.data_hora AT TIME ZONE 'America/Sao_Paulo')::date)) > cfg.dias_alerta),
         COALESCE(ct.n, 0)
  FROM public.leads ld
  CROSS JOIN cfg
  LEFT JOIN public.status_lead sl ON sl.status = ld.status
  LEFT JOIN public.clientes c ON c.id = ld.cliente_id
  LEFT JOIN conta_p cp ON cp.cliente_id = ld.cliente_id
  LEFT JOIN giro g ON g.cliente_id = ld.cliente_id
  LEFT JOIN ct ON ct.lead_id = ld.id
  WHERE (p_corretora_opera IS NULL OR upper(COALESCE(ld.corretora, '')) = upper(p_corretora_opera))
    AND public.acesso_ok()
  ORDER BY ld.data_hora DESC;
$$;

-- 7. Funil por safra com os contatos (média por lead ganho = contatos_ganhos / ganhos_contatados) ----
DROP FUNCTION IF EXISTS public.funil_safra(date, integer);
CREATE OR REPLACE FUNCTION public.funil_safra(p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(
  mes_ref date, recebidos integer, contatados integer, perdidos integer, ganhos integer, em_aberto integer,
  ja_clientes integer, viraram_clientes integer, ativados integer, em_processamento integer, recusaram integer,
  com_giro integer, lotes numeric, receita numeric, contatos integer, contatos_ganhos integer, ganhos_contatados integer
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
    ROUND(COALESCE(SUM(l.receita) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado'), 0), 2),
    COALESCE(SUM(l.contatos), 0)::integer,
    COALESCE(SUM(l.contatos) FILTER (WHERE l.status = 'Ganho'), 0)::integer,
    COUNT(*) FILTER (WHERE l.status = 'Ganho' AND l.contatos > 0)::integer
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
  com_giro integer, lotes numeric, receita numeric, contatos integer, contatos_ganhos integer, ganhos_contatados integer
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
    ROUND(COALESCE(SUM(l.receita) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado'), 0), 2),
    COALESCE(SUM(l.contatos), 0)::integer,
    COALESCE(SUM(l.contatos) FILTER (WHERE l.status = 'Ganho'), 0)::integer,
    COUNT(*) FILTER (WHERE l.status = 'Ganho' AND l.contatos > 0)::integer
  FROM l
  WHERE public.acesso_ok()
  GROUP BY l.grupo
  ORDER BY 2 DESC, 1;
$$;

-- 8. Por dia: leads que entraram, contatos feitos, ganhos, perdidos e contas abertas -------------------
CREATE OR REPLACE FUNCTION public.leads_diario(p_dias integer DEFAULT 30)
RETURNS TABLE(dia date, entraram integer, contatos integer, ganhos integer, perdidos integer, contas_abertas integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT public.brasil_hoje() AS hoje,
           (public.brasil_hoje() - (GREATEST(COALESCE(p_dias, 30), 1) - 1))::date AS d_ini
  ),
  dias AS MATERIALIZED (
    SELECT (cfg.hoje - n)::date AS dia FROM cfg, generate_series(0, cfg.hoje - cfg.d_ini) AS n
  ),
  ent AS (
    SELECT (l.data_hora AT TIME ZONE 'America/Sao_Paulo')::date AS dia, COUNT(*)::integer AS n
    FROM public.leads l CROSS JOIN cfg
    WHERE l.data_hora >= (cfg.d_ini::timestamp AT TIME ZONE 'America/Sao_Paulo')
    GROUP BY 1
  ),
  ct AS (
    SELECT c.data AS dia, COUNT(*)::integer AS n
    FROM public.lead_contatos c CROSS JOIN cfg
    WHERE c.data >= cfg.d_ini
    GROUP BY 1
  ),
  fe AS (
    SELECT l.data_fechamento AS dia,
           COUNT(*) FILTER (WHERE l.status = 'Ganho')::integer AS ganhos,
           COUNT(*) FILTER (WHERE l.status = 'Perdido')::integer AS perdidos
    FROM public.leads l CROSS JOIN cfg
    WHERE l.data_fechamento >= cfg.d_ini
    GROUP BY 1
  ),
  ab AS (
    SELECT vc.data_migracao AS dia, COUNT(*)::integer AS n
    FROM public.v_cliente_corretora vc CROSS JOIN cfg
    WHERE vc.status = 'Migrado' AND vc.data_migracao >= cfg.d_ini
    GROUP BY 1
  )
  SELECT d.dia, COALESCE(ent.n, 0), COALESCE(ct.n, 0), COALESCE(fe.ganhos, 0), COALESCE(fe.perdidos, 0), COALESCE(ab.n, 0)
  FROM dias d
  LEFT JOIN ent ON ent.dia = d.dia
  LEFT JOIN ct ON ct.dia = d.dia
  LEFT JOIN fe ON fe.dia = d.dia
  LEFT JOIN ab ON ab.dia = d.dia
  WHERE public.acesso_ok()
  ORDER BY d.dia;
$$;

-- 9. Permissões ------------------------------------------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('registrar_contato_lead', 'excluir_contato_lead', 'unificar_leads', 'leads_lista', 'funil_safra', 'funil_safra_por', 'leads_diario')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Conferência: contatos carregados, os últimos 14 dias e a média de contatos por lead ganho na safra
SELECT COUNT(*) AS contatos, COUNT(DISTINCT lead_id) AS leads_com_contato FROM public.lead_contatos;
SELECT * FROM public.leads_diario(14);
SELECT mes_ref, recebidos, ganhos, contatos, contatos_ganhos, ganhos_contatados,
       ROUND(contatos_ganhos::numeric / NULLIF(ganhos_contatados, 0), 1) AS contatos_por_ganho
FROM public.funil_safra(NULL, 6);
