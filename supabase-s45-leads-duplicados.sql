-- ============================================================================
-- S45 · Leads sem duplicados (era S44; a S44 ficou com a projeção/risco/LTV de outra sessão)
-- Re-runnável (a unificação só mexe no que ainda está duplicado).
--
-- Lucas, 13/10/2026: leads duplicados (a mesma pessoa preenche o formulário do site mais de uma vez
-- e a importação só reconhecia a linha por data + nome; e cadastro manual repetido). Regra de "mesma
-- pessoa": CPF igual, ou WhatsApp igual (8 últimos dígitos) com o mesmo primeiro nome e CPF compatível
-- (um dos dois sem CPF, ou iguais). Nome sozinho não basta (muitos "Rafael", "Gabriel"…).
--
-- 1. Unifica os duplicados que já existem (unificar_leads_duplicados): fica um lead por pessoa, com a
--    data do PRIMEIRO cadastro (safra do funil), os dados em branco completados pelo outro, o status
--    mais avançado (Ganho > aberto > Perdido), o cliente ligado se algum tinha, e uma nota em
--    observações. Quem sobrevive: o que tem cliente, senão o Ganho, senão o não Perdido, senão o mais antigo.
-- 2. importar_leads passa a reconhecer a mesma pessoa: a nova linha vira "preencheu o formulário de
--    novo" (reentradas + 1, ultima_entrada, nota em observações; se estava Perdido volta para Novo),
--    em vez de um lead novo. Devolve novos / atualizados / reentradas.
-- ============================================================================

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS reentradas integer NOT NULL DEFAULT 0;   -- vezes que preencheu o formulário de novo
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ultima_entrada timestamptz;              -- última vez que entrou pelo formulário
CREATE INDEX IF NOT EXISTS leads_fone8_idx ON public.leads (right(whatsapp_digits, 8)) WHERE whatsapp_digits IS NOT NULL;

-- 1. Unificação de dois leads: o mantido recebe o que faltava do removido ------------------------------
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

-- 2. Varre a base e unifica todos os pares da mesma pessoa --------------------------------------------
CREATE OR REPLACE FUNCTION public.unificar_leads_duplicados()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_manter uuid; v_remover uuid; n integer := 0;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  LOOP
    WITH r AS MATERIALIZED (
      SELECT l.id, l.cpf_digits, l.whatsapp_digits, split_part(public.norm_texto(l.nome), ' ', 1) AS nome1,
             ROW_NUMBER() OVER (ORDER BY (l.cliente_id IS NOT NULL) DESC, (l.status = 'Ganho') DESC, (l.status <> 'Perdido') DESC, l.data_hora, l.id) AS pos
      FROM public.leads l
    ),
    pares AS (
      -- mesmo CPF
      SELECT a.pos AS pa, b.pos AS pb, a.id AS manter, b.id AS remover
      FROM r a JOIN r b ON b.cpf_digits = a.cpf_digits AND b.pos > a.pos
      WHERE a.cpf_digits IS NOT NULL AND length(a.cpf_digits) >= 11
      UNION ALL
      -- mesmo WhatsApp + mesmo primeiro nome + CPF compatível
      SELECT a.pos, b.pos, a.id, b.id
      FROM r a JOIN r b ON right(b.whatsapp_digits, 8) = right(a.whatsapp_digits, 8) AND b.pos > a.pos
      WHERE a.whatsapp_digits IS NOT NULL AND b.whatsapp_digits IS NOT NULL
        AND length(a.whatsapp_digits) >= 10 AND length(b.whatsapp_digits) >= 10
        AND a.nome1 = b.nome1 AND a.nome1 <> ''
        AND (a.cpf_digits IS NULL OR b.cpf_digits IS NULL OR a.cpf_digits = b.cpf_digits)
    )
    SELECT p.manter, p.remover INTO v_manter, v_remover FROM pares p ORDER BY p.pa, p.pb LIMIT 1;
    EXIT WHEN NOT FOUND;
    PERFORM public.unificar_leads(v_manter, v_remover);
    n := n + 1;
    EXIT WHEN n >= 5000;
  END LOOP;
  PERFORM public.vincular_leads();
  RETURN n;
END;
$$;

-- 3. Importação: mesma linha → completa; mesma pessoa → preencheu de novo; senão → lead novo ------------
DROP FUNCTION IF EXISTS public.importar_leads(uuid, jsonb);
CREATE OR REPLACE FUNCTION public.importar_leads(p_importacao_id uuid, p_linhas jsonb)
RETURNS TABLE(novos integer, atualizados integer, reentradas integer)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_novos integer := 0; v_upd integer := 0; v_re integer := 0; t record; v_id uuid;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;

  DROP TABLE IF EXISTS tmp_leads;
  CREATE TEMP TABLE tmp_leads ON COMMIT DROP AS
  SELECT DISTINCT ON (x.data_hora, public.norm_texto(x.nome))
    x.data_hora, trim(x.nome) AS nome, public.norm_texto(x.nome) AS nome_norm,
    NULLIF(trim(x.whatsapp), '') AS whatsapp, public.so_digitos(x.whatsapp) AS whatsapp_digits,
    NULLIF(trim(x.cpf), '') AS cpf, public.so_digitos(x.cpf) AS cpf_digits,
    NULLIF(lower(trim(x.email)), '') AS email, NULLIF(trim(x.ja_opera), '') AS ja_opera,
    NULLIF(trim(x.corretora), '') AS corretora, NULLIF(trim(x.origem), '') AS origem,
    NULLIF(trim(x.responsavel), '') AS responsavel, NULLIF(trim(x.status), '') AS status,
    x.ultimo_contato, x.data_fechamento,
    NULLIF(trim(x.motivo_perda), '') AS motivo_perda, NULLIF(trim(x.observacoes), '') AS observacoes
  FROM jsonb_to_recordset(p_linhas) AS x(
    data_hora timestamptz, nome text, whatsapp text, cpf text, email text, ja_opera text, corretora text,
    origem text, responsavel text, status text, ultimo_contato date, data_fechamento date, motivo_perda text, observacoes text)
  WHERE x.data_hora IS NOT NULL AND NULLIF(trim(x.nome), '') IS NOT NULL
  ORDER BY x.data_hora, public.norm_texto(x.nome);

  FOR t IN SELECT * FROM tmp_leads ORDER BY data_hora, nome_norm LOOP
    -- a) a mesma linha (data e nome): só completa o acompanhamento da equipe e os dados em branco
    SELECT l.id INTO v_id FROM public.leads l WHERE l.data_hora = t.data_hora AND public.norm_texto(l.nome) = t.nome_norm LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE public.leads l SET
        origem = COALESCE(t.origem, l.origem),
        responsavel = COALESCE(t.responsavel, l.responsavel),
        status = COALESCE(t.status, l.status),
        ultimo_contato = COALESCE(t.ultimo_contato, l.ultimo_contato),
        data_fechamento = COALESCE(t.data_fechamento, l.data_fechamento),
        motivo_perda = COALESCE(t.motivo_perda, l.motivo_perda),
        observacoes = COALESCE(t.observacoes, l.observacoes),
        whatsapp = COALESCE(l.whatsapp, t.whatsapp), whatsapp_digits = COALESCE(l.whatsapp_digits, t.whatsapp_digits),
        cpf = COALESCE(l.cpf, t.cpf), cpf_digits = COALESCE(l.cpf_digits, t.cpf_digits),
        email = COALESCE(l.email, t.email), ja_opera = COALESCE(l.ja_opera, t.ja_opera), corretora = COALESCE(l.corretora, t.corretora),
        updated_at = now()
      WHERE l.id = v_id
        AND (t.origem IS NOT NULL OR t.responsavel IS NOT NULL OR t.status IS NOT NULL OR t.ultimo_contato IS NOT NULL
             OR t.data_fechamento IS NOT NULL OR t.motivo_perda IS NOT NULL OR t.observacoes IS NOT NULL);
      IF FOUND THEN v_upd := v_upd + 1; END IF;
      CONTINUE;
    END IF;

    -- b) a mesma pessoa (CPF, ou WhatsApp com o mesmo primeiro nome e CPF compatível): preencheu de novo
    SELECT l.id INTO v_id FROM public.leads l
     WHERE (t.cpf_digits IS NOT NULL AND length(t.cpf_digits) >= 11 AND l.cpf_digits = t.cpf_digits)
        OR (t.whatsapp_digits IS NOT NULL AND length(t.whatsapp_digits) >= 10
            AND l.whatsapp_digits IS NOT NULL AND length(l.whatsapp_digits) >= 10
            AND right(l.whatsapp_digits, 8) = right(t.whatsapp_digits, 8)
            AND split_part(public.norm_texto(l.nome), ' ', 1) = split_part(t.nome_norm, ' ', 1)
            AND (l.cpf_digits IS NULL OR t.cpf_digits IS NULL OR l.cpf_digits = t.cpf_digits))
     ORDER BY (l.cliente_id IS NOT NULL) DESC, (l.status = 'Ganho') DESC, (l.status <> 'Perdido') DESC, l.data_hora
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE public.leads l SET
        data_hora = LEAST(l.data_hora, t.data_hora),
        whatsapp = COALESCE(l.whatsapp, t.whatsapp), whatsapp_digits = COALESCE(l.whatsapp_digits, t.whatsapp_digits),
        cpf = COALESCE(l.cpf, t.cpf), cpf_digits = COALESCE(l.cpf_digits, t.cpf_digits),
        email = COALESCE(l.email, t.email),
        ja_opera = COALESCE(t.ja_opera, l.ja_opera), corretora = COALESCE(t.corretora, l.corretora),   -- resposta mais recente
        origem = COALESCE(l.origem, t.origem), responsavel = COALESCE(l.responsavel, t.responsavel),
        status = CASE WHEN l.status = 'Perdido' THEN 'Novo' ELSE l.status END,
        data_fechamento = CASE WHEN l.status = 'Perdido' THEN NULL ELSE l.data_fechamento END,
        observacoes = concat_ws(E'\n', NULLIF(l.observacoes, ''),
                      'Preencheu o formulário de novo em ' || to_char(t.data_hora AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YY HH24:MI')
                      || CASE WHEN l.status = 'Perdido' THEN ' (estava Perdido, voltou para Novo).' ELSE '.' END),
        reentradas = l.reentradas + 1,
        ultima_entrada = t.data_hora,
        updated_at = now()
      WHERE l.id = v_id AND t.data_hora > COALESCE(l.ultima_entrada, l.data_hora);   -- a mesma entrada não conta duas vezes
      IF FOUND THEN v_re := v_re + 1; END IF;
      CONTINUE;
    END IF;

    -- c) lead novo
    INSERT INTO public.leads (data_hora, nome, whatsapp, whatsapp_digits, cpf, cpf_digits, email, ja_opera, corretora, origem,
                              responsavel, status, ultimo_contato, data_fechamento, motivo_perda, observacoes, importacao_id, ultima_entrada)
    VALUES (t.data_hora, t.nome, t.whatsapp, t.whatsapp_digits, t.cpf, t.cpf_digits, t.email, t.ja_opera, t.corretora, t.origem,
            t.responsavel, COALESCE(t.status, 'Novo'), t.ultimo_contato, t.data_fechamento, t.motivo_perda, t.observacoes, p_importacao_id, t.data_hora);
    v_novos := v_novos + 1;
  END LOOP;

  PERFORM public.vincular_leads();
  RETURN QUERY SELECT v_novos, v_upd, v_re;
END;
$$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('unificar_leads', 'unificar_leads_duplicados', 'importar_leads')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- 4. Unifica o que já está duplicado (esperado ~230 unificações na primeira vez; depois 0)
SELECT public.unificar_leads_duplicados() AS unificados;

-- Conferência: deve sobrar 0 duplicados por CPF, e a lista dos Ganho sem cliente (resolver pelo troféu em Leads)
SELECT COUNT(*) AS grupos_cpf_duplicados
FROM (SELECT cpf_digits FROM public.leads WHERE cpf_digits IS NOT NULL AND length(cpf_digits) >= 11 GROUP BY cpf_digits HAVING COUNT(*) > 1) d;

SELECT COUNT(*) AS leads, SUM(reentradas) AS reentradas FROM public.leads;

SELECT nome, responsavel, corretora, data_hora::date AS recebido, data_fechamento
FROM public.leads WHERE status = 'Ganho' AND cliente_id IS NULL ORDER BY data_hora DESC;
