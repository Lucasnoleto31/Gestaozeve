-- ============================================================================
-- S59 · Fila do dia: próximo contato combinado e a tela "Minha fila" (/fila)
-- ----------------------------------------------------------------------------
-- Até aqui o sistema só registrava o contato depois de feito (lead_contatos, S47; cliente_contatos,
-- S52). Agora cada contato pode combinar o próximo ("retorno dia 14") e a tela Minha fila junta o que
-- vence hoje, o que está atrasado, lead novo sem contato, lead parado, cliente em risco sem contato
-- recente e conta da campanha ainda não chamada.
--   1. leads.proximo_contato e cliente_corretora.proximo_contato
--   2. registrar_contato_lead / registrar_contato_cliente ganham p_proximo: a data combinada na
--      ligação. Sem p_proximo, o contato cumpre o retorno que estava marcado até a data dele e
--      preserva um retorno marcado para depois.
--   3. agendar_contato_lead / agendar_contato_cliente: marcar ou desmarcar o retorno sem registrar contato
-- Sem este script o app continua funcionando: registra contatos como antes e a fila avisa que o
-- próximo contato ainda não está ativado no banco. Rode inteiro no SQL Editor do Supabase.
-- ============================================================================

-- 1. Colunas ------------------------------------------------------------------------------------------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS proximo_contato date;
ALTER TABLE public.cliente_corretora ADD COLUMN IF NOT EXISTS proximo_contato date;
CREATE INDEX IF NOT EXISTS leads_proximo_contato_idx ON public.leads (proximo_contato) WHERE proximo_contato IS NOT NULL;
CREATE INDEX IF NOT EXISTS cliente_corretora_proximo_contato_idx ON public.cliente_corretora (corretora, proximo_contato) WHERE proximo_contato IS NOT NULL;

-- 2. Registrar contato com o próximo combinado --------------------------------------------------------
-- A assinatura muda (p_proximo no fim): a antiga sai para a API não ficar com duas candidatas.
DROP FUNCTION IF EXISTS public.registrar_contato_lead(uuid, date, text, text, uuid, text);
CREATE OR REPLACE FUNCTION public.registrar_contato_lead(
  p_lead_id uuid, p_data date DEFAULT NULL, p_nota text DEFAULT NULL, p_status text DEFAULT NULL,
  p_criado_por uuid DEFAULT NULL, p_criado_por_nome text DEFAULT NULL, p_proximo date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_data date := COALESCE(p_data, public.brasil_hoje()); n integer;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = p_lead_id) THEN RAISE EXCEPTION 'lead não encontrado'; END IF;
  IF v_data > public.brasil_hoje() THEN RAISE EXCEPTION 'a data do contato não pode ser futura'; END IF;
  IF p_proximo IS NOT NULL AND p_proximo <= v_data THEN RAISE EXCEPTION 'o próximo contato tem de ser depois deste'; END IF;
  INSERT INTO public.lead_contatos (lead_id, data, nota, criado_por, criado_por_nome)
  VALUES (p_lead_id, v_data, NULLIF(trim(p_nota), ''), p_criado_por, NULLIF(trim(p_criado_por_nome), ''));
  UPDATE public.leads SET
    ultimo_contato = GREATEST(COALESCE(ultimo_contato, v_data), v_data),
    status = COALESCE(NULLIF(trim(p_status), ''), status),
    -- o retorno combinado agora; senão, o contato cumpre o que vencia até a data dele e preserva um retorno futuro
    proximo_contato = CASE WHEN p_proximo IS NOT NULL THEN p_proximo
                           WHEN proximo_contato > v_data THEN proximo_contato ELSE NULL END,
    updated_at = now()
  WHERE id = p_lead_id;
  SELECT COUNT(*)::integer INTO n FROM public.lead_contatos WHERE lead_id = p_lead_id;
  RETURN n;
END;
$$;

DROP FUNCTION IF EXISTS public.registrar_contato_cliente(uuid, text, date, text, uuid, text);
CREATE OR REPLACE FUNCTION public.registrar_contato_cliente(
  p_cliente_id uuid, p_corretora text, p_data date DEFAULT NULL, p_nota text DEFAULT NULL,
  p_criado_por uuid DEFAULT NULL, p_criado_por_nome text DEFAULT NULL, p_proximo date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_data date := COALESCE(p_data, public.brasil_hoje()); n integer;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  IF NULLIF(trim(p_corretora), '') IS NULL THEN RAISE EXCEPTION 'corretora não informada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id) THEN RAISE EXCEPTION 'cliente não encontrado'; END IF;
  IF v_data > public.brasil_hoje() THEN RAISE EXCEPTION 'a data do contato não pode ser futura'; END IF;
  IF p_proximo IS NOT NULL AND p_proximo <= v_data THEN RAISE EXCEPTION 'o próximo contato tem de ser depois deste'; END IF;
  INSERT INTO public.cliente_contatos (cliente_id, corretora, data, nota, criado_por, criado_por_nome)
  VALUES (p_cliente_id, p_corretora, v_data, NULLIF(trim(p_nota), ''), p_criado_por, NULLIF(trim(p_criado_por_nome), ''));
  IF p_proximo IS NOT NULL THEN
    -- a ficha manual da corretora pode não existir ainda (cliente só com conta): cria só com o retorno
    INSERT INTO public.cliente_corretora (cliente_id, corretora, proximo_contato, updated_at)
    VALUES (p_cliente_id, p_corretora, p_proximo, now())
    ON CONFLICT (cliente_id, corretora) DO UPDATE SET proximo_contato = EXCLUDED.proximo_contato, updated_at = now();
  ELSE
    UPDATE public.cliente_corretora SET proximo_contato = NULL, updated_at = now()
    WHERE cliente_id = p_cliente_id AND corretora = p_corretora AND proximo_contato IS NOT NULL AND proximo_contato <= v_data;
  END IF;
  SELECT COUNT(*)::integer INTO n FROM public.cliente_contatos WHERE cliente_id = p_cliente_id AND corretora = p_corretora;
  RETURN n;
END;
$$;

-- 3. Marcar ou desmarcar o retorno sem registrar contato ----------------------------------------------
CREATE OR REPLACE FUNCTION public.agendar_contato_lead(p_lead_id uuid, p_data date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = p_lead_id) THEN RAISE EXCEPTION 'lead não encontrado'; END IF;
  IF p_data IS NOT NULL AND p_data < public.brasil_hoje() THEN RAISE EXCEPTION 'a data do próximo contato já passou'; END IF;
  UPDATE public.leads SET proximo_contato = p_data, updated_at = now() WHERE id = p_lead_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.agendar_contato_cliente(p_cliente_id uuid, p_corretora text, p_data date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  IF NULLIF(trim(p_corretora), '') IS NULL THEN RAISE EXCEPTION 'corretora não informada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id) THEN RAISE EXCEPTION 'cliente não encontrado'; END IF;
  IF p_data IS NOT NULL AND p_data < public.brasil_hoje() THEN RAISE EXCEPTION 'a data do próximo contato já passou'; END IF;
  IF p_data IS NOT NULL THEN
    INSERT INTO public.cliente_corretora (cliente_id, corretora, proximo_contato, updated_at)
    VALUES (p_cliente_id, p_corretora, p_data, now())
    ON CONFLICT (cliente_id, corretora) DO UPDATE SET proximo_contato = EXCLUDED.proximo_contato, updated_at = now();
  ELSE
    UPDATE public.cliente_corretora SET proximo_contato = NULL, updated_at = now()
    WHERE cliente_id = p_cliente_id AND corretora = p_corretora AND proximo_contato IS NOT NULL;
  END IF;
END;
$$;

-- 4. Permissões (como nos scripts anteriores) e recarga do esquema da API -----------------------------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.registrar_contato_lead(uuid, date, text, text, uuid, text, date)',
    'public.registrar_contato_cliente(uuid, text, date, text, uuid, text, date)',
    'public.agendar_contato_lead(uuid, date)',
    'public.agendar_contato_cliente(uuid, text, date)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Conferência: as colunas existem e as funções têm a assinatura nova (p_proximo no fim)
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'proximo_contato' ORDER BY 1;
SELECT p.proname, pg_get_function_arguments(p.oid) AS argumentos
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('registrar_contato_lead', 'registrar_contato_cliente', 'agendar_contato_lead', 'agendar_contato_cliente')
ORDER BY 1;
