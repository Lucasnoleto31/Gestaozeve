-- ============================================================================
-- S61 · Parceiros do cliente: vários parceiros por cliente, cada um com o seu percentual
-- Re-runnável. Rodar depois da S60. Pode rodar antes de a tela nova entrar: enquanto a tabela
-- estiver vazia, nada muda em nenhum número.
--
-- Lucas, 17/11/2026: "eu posso ter um cliente que está em outra assessoria nossa mas está vinculado
-- a um parceiro (...) pois ele pode estar em outra assessoria e ter um produto de um parceiro nosso.
-- e esse mesmo cliente pode ter 3/4 parceiros diferentes, e toda a comissão que ele gerar dividir
-- entre os parceiros" · "Percentual por parceiro".
--
-- A regra:
--   - Cada linha desta tabela diz: neste cliente, nesta corretora, o parceiro leva pct % de tudo o
--     que o cliente gerar, em qualquer código de assessor nosso, do mês `desde` ao mês `ate`
--     (ate vazio = continua valendo).
--   - Genial e XP: pct % da corretagem e da zeragem do cliente; o incentivo entra com o mesmo
--     percentual só para o parceiro cuja regra geral (parâmetro parceiros_receita) tem incentivo.
--   - BTG: pct % da comissão que o BTG paga pelo cliente, depois do imposto (no lugar do percentual
--     geral do parâmetro repasse_parceiros).
--   - Cliente com lista em vigor no mês segue só a lista: o código do assessor (Genial) e o campo
--     Parceiro da ficha (BTG) deixam de valer para ele naquele mês. Sem lista, tudo como antes.
--
-- A conta é feita no aplicativo (participacao.ts, btg.ts); nenhuma função de comissão do banco muda.
-- A única função alterada é unificar_clientes (S29): ao juntar dois cadastros, a lista do cadastro
-- mantido prevalece e, na corretora em que ele não tem lista, vem a do cadastro removido.
-- ============================================================================

-- 1. A lista ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cliente_parceiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes (id) ON DELETE CASCADE,
  corretora text NOT NULL,
  parceiro text NOT NULL,
  pct numeric(5,2) NOT NULL CHECK (pct > 0 AND pct <= 100),            -- % do que o cliente gera
  desde date NOT NULL CHECK (EXTRACT(DAY FROM desde) = 1),              -- primeiro mês em que vale
  ate date CHECK (ate IS NULL OR (EXTRACT(DAY FROM ate) = 1 AND ate >= desde)),   -- último mês em que vale (NULL = continua)
  criado_por uuid,
  criado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- um começo por parceiro em cada cliente × corretora (nomes casam sem acento nem caixa)
CREATE UNIQUE INDEX IF NOT EXISTS cliente_parceiros_unico_idx ON public.cliente_parceiros (cliente_id, corretora, public.norm_texto(parceiro), desde);
CREATE INDEX IF NOT EXISTS cliente_parceiros_corretora_idx ON public.cliente_parceiros (corretora, cliente_id);
ALTER TABLE public.cliente_parceiros ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_parceiros TO service_role;
REVOKE ALL ON public.cliente_parceiros FROM anon, authenticated;

-- 2. Unificar cadastros leva a lista junto ---------------------------------------------------------------
-- O texto é o da S29 com um bloco a mais (marcado com S61), antes de apagar o cadastro removido.
CREATE OR REPLACE FUNCTION public.unificar_clientes(p_manter uuid, p_remover uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE r public.clientes%ROWTYPE; v_contas integer; v_lotes integer; v_leads integer; c text;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  IF p_manter = p_remover THEN RAISE EXCEPTION 'os dois cadastros são o mesmo cliente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_manter) THEN RAISE EXCEPTION 'cadastro a manter não encontrado'; END IF;
  SELECT * INTO r FROM public.clientes WHERE id = p_remover;
  IF NOT FOUND THEN RAISE EXCEPTION 'cadastro a remover não encontrado'; END IF;

  UPDATE public.contas SET cliente_id = p_manter, principal = false, updated_at = now() WHERE cliente_id = p_remover;
  GET DIAGNOSTICS v_contas = ROW_COUNT;
  UPDATE public.lotes SET cliente_id = p_manter WHERE cliente_id = p_remover;
  GET DIAGNOSTICS v_lotes = ROW_COUNT;
  UPDATE public.leads SET cliente_id = p_manter, updated_at = now() WHERE cliente_id = p_remover;
  GET DIAGNOSTICS v_leads = ROW_COUNT;

  -- campos por corretora: o mantido prevalece; o que ele não tem vem do removido
  UPDATE public.cliente_corretora m SET
    data_entrada = COALESCE(m.data_entrada, x.data_entrada), parceiro = COALESCE(m.parceiro, x.parceiro),
    observacoes = COALESCE(m.observacoes, x.observacoes), motivo_recusa = COALESCE(m.motivo_recusa, x.motivo_recusa),
    status = COALESCE(m.status, x.status), responsavel = COALESCE(m.responsavel, x.responsavel),
    data_migracao = COALESCE(m.data_migracao, x.data_migracao), assessor = COALESCE(m.assessor, x.assessor), updated_at = now()
  FROM public.cliente_corretora x
  WHERE m.cliente_id = p_manter AND x.cliente_id = p_remover AND x.corretora = m.corretora;
  UPDATE public.cliente_corretora x SET cliente_id = p_manter, updated_at = now()
  WHERE x.cliente_id = p_remover
    AND NOT EXISTS (SELECT 1 FROM public.cliente_corretora m WHERE m.cliente_id = p_manter AND m.corretora = x.corretora);
  DELETE FROM public.cliente_corretora WHERE cliente_id = p_remover;

  -- tarifas: as do removido valem onde o mantido não tem tarifa com a mesma vigência
  UPDATE public.tarifas_cliente t SET cliente_id = p_manter
  WHERE t.cliente_id = p_remover
    AND NOT EXISTS (SELECT 1 FROM public.tarifas_cliente m WHERE m.cliente_id = p_manter AND m.corretora = t.corretora AND m.vigencia = t.vigencia);
  DELETE FROM public.tarifas_cliente WHERE cliente_id = p_remover;

  -- cadastro: libera o documento do removido e completa o que estava vazio no mantido
  UPDATE public.clientes SET documento = NULL WHERE id = p_remover;
  UPDATE public.clientes m SET
    documento = COALESCE(m.documento, r.documento), tipo_pessoa = COALESCE(m.tipo_pessoa, r.tipo_pessoa), sexo = COALESCE(m.sexo, r.sexo),
    estado_civil = COALESCE(m.estado_civil, r.estado_civil), uf = COALESCE(m.uf, r.uf), profissao = COALESCE(m.profissao, r.profissao),
    rendimentos = COALESCE(m.rendimentos, r.rendimentos), patrimonio = COALESCE(m.patrimonio, r.patrimonio), email = COALESCE(m.email, r.email),
    telefone = COALESCE(m.telefone, r.telefone), telefone_digits = COALESCE(m.telefone_digits, r.telefone_digits),
    perfil = COALESCE(m.perfil, r.perfil), perfil_suitability = COALESCE(m.perfil_suitability, r.perfil_suitability),
    dt_nascimento = COALESCE(m.dt_nascimento, r.dt_nascimento), updated_at = now()
  WHERE m.id = p_manter;
  -- S61 · parceiros do cliente: a lista do mantido prevalece; na corretora em que ele não tem lista, vem a do removido
  -- (o que sobrar no removido sai junto com o cadastro)
  UPDATE public.cliente_parceiros x SET cliente_id = p_manter, updated_at = now()
  WHERE x.cliente_id = p_remover
    AND NOT EXISTS (SELECT 1 FROM public.cliente_parceiros m WHERE m.cliente_id = p_manter AND m.corretora = x.corretora);
  DELETE FROM public.clientes WHERE id = p_remover;

  -- conta principal, vínculos e tarifas dos lotes nas corretoras envolvidas (lotes_mes acompanha pelo gatilho)
  FOR c IN
    SELECT ct.corretora FROM public.contas ct WHERE ct.cliente_id = p_manter
    UNION SELECT l.corretora FROM public.lotes l WHERE l.cliente_id = p_manter
    UNION SELECT m.corretora FROM public.cliente_corretora m WHERE m.cliente_id = p_manter
  LOOP
    PERFORM public.marcar_contas_principais(c);
    PERFORM public.vincular_lotes(c, NULL);
    PERFORM public.recalcular_lotes(c, NULL);
  END LOOP;
  PERFORM public.vincular_leads();

  RETURN jsonb_build_object('contas', v_contas, 'lotes', v_lotes, 'leads', v_leads);
END;
$$;

REVOKE ALL ON FUNCTION public.unificar_clientes(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unificar_clientes(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.unificar_clientes(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Conferência: a tabela existe e está vazia (as linhas entram pela ficha do cliente, bloco "Parceiros do cliente")
SELECT COUNT(*) AS linhas FROM public.cliente_parceiros;
