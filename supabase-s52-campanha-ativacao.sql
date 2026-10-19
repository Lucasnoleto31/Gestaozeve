-- ============================================================================
-- S52 · Campanha de ativação: atendente por conta, contatos com clientes e ativações por atendente
-- Re-runnável. Rodar depois da S47 (contatos de leads) e da S51 (funil_resultado).
--
-- Lucas, 19/10/2026: a Milena entrou na equipe para ativar contas que nunca giraram e reativar as
-- inativas. O campo Responsável da ficha é a base de comissão de outro parceiro (comissao_base,
-- origem 'responsavel', S43): trocar tiraria o cliente da base dele (ex.: Aikon). A campanha tem
-- campo e histórico próprios, fora do responsável, do assessor e da comissão:
--
-- 1. cliente_corretora.ativador — quem está trabalhando a conta na campanha (um nome ativo de
--    Parâmetros › Responsáveis). atribuir_ativador(corretora, ids, nome) marca em lote; nome vazio tira
--    da campanha. A ficha edita o campo um a um (Ativação). clientes_lista passa a devolver a coluna.
-- 2. cliente_contatos — um registro por contato com o cliente, por corretora (data, nota, quem
--    registrou), no molde de lead_contatos (S47): registrar_contato_cliente / excluir_contato_cliente.
--    Não há "último contato" no cadastro do cliente: o histórico é a fonte.
-- 3. funil_ativacoes_por_atendente(mes, N) — por atendente: as contas atribuídas a ele HOJE e, no mês:
--    contatos registrados com essas contas, contas contatadas, contas que operaram, contas que fizeram
--    a 1ª operação, contas que voltaram a operar, e os lotes e a receita bruta (lotes_mes) das contas
--    com 1ª operação ou reativação no mês.
--    · reativação = a mesma regra da S51 e da comissão (S41): voltou a operar N meses de calendário
--      depois do último giro, ou da migração se nunca tinha girado (N = p_meses_inativo, padrão 4);
--    · 1ª operação = primeiro mês com lote operado da conta, sem contar como reativação. Conta aberta
--      no próprio mês entra aqui (no Resultado do mês, bloco 1 do Funil, ela é "cliente novo");
--    · a atribuição é a de hoje: olhar um mês passado mostra o resultado das contas atribuídas agora;
--    · contato conta pela conta atribuída, não por quem registrou: um contato do Lucas com uma conta
--      da Milena entra na linha dela. Conta sem atendente fica fora do painel.
-- Limites conhecidos: unificar_clientes (S29) não leva o ativador nem os contatos do cadastro removido
-- (os contatos caem com ele, ON DELETE CASCADE); a importação de clientes não mexe no ativador.
-- ============================================================================

-- 1. Atendente da campanha por conta (cliente × corretora) ------------------------------------------
ALTER TABLE public.cliente_corretora ADD COLUMN IF NOT EXISTS ativador text;
CREATE INDEX IF NOT EXISTS cliente_corretora_ativador_idx ON public.cliente_corretora (corretora, ativador) WHERE ativador IS NOT NULL;

-- Marca o atendente em lote (nome vazio = tira as contas da campanha). Devolve quantas contas mudaram.
CREATE OR REPLACE FUNCTION public.atribuir_ativador(p_corretora text, p_cliente_ids uuid[], p_ativador text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_ativador text := NULLIF(trim(p_ativador), ''); n integer;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  IF NULLIF(trim(p_corretora), '') IS NULL THEN RAISE EXCEPTION 'corretora não informada'; END IF;
  IF p_cliente_ids IS NULL OR cardinality(p_cliente_ids) = 0 THEN RETURN 0; END IF;
  IF v_ativador IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.responsaveis r WHERE r.nome = v_ativador AND r.ativo) THEN
    RAISE EXCEPTION 'atendente não cadastrado em Parâmetros › Responsáveis: %', v_ativador;
  END IF;
  IF v_ativador IS NULL THEN
    -- tirar da campanha: só quem está nela (não cria ficha vazia)
    UPDATE public.cliente_corretora SET ativador = NULL, updated_at = now()
    WHERE corretora = p_corretora AND cliente_id = ANY (p_cliente_ids) AND ativador IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
  END IF;
  INSERT INTO public.cliente_corretora (cliente_id, corretora, ativador)
  SELECT DISTINCT c.id, p_corretora, v_ativador
  FROM public.clientes c
  WHERE c.id = ANY (p_cliente_ids)
  ON CONFLICT (cliente_id, corretora) DO UPDATE SET ativador = EXCLUDED.ativador, updated_at = now()
  WHERE cliente_corretora.ativador IS DISTINCT FROM EXCLUDED.ativador;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- 2. Histórico de contatos com clientes --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cliente_contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes (id) ON DELETE CASCADE,
  corretora text NOT NULL,
  data date NOT NULL DEFAULT public.brasil_hoje(),
  nota text,
  criado_por uuid,
  criado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cliente_contatos_cliente_idx ON public.cliente_contatos (cliente_id, corretora, data);
CREATE INDEX IF NOT EXISTS cliente_contatos_data_idx ON public.cliente_contatos (data);
ALTER TABLE public.cliente_contatos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_contatos TO service_role;
REVOKE ALL ON public.cliente_contatos FROM anon;

-- Registra um contato (histórico da ficha). Devolve quantos contatos a conta tem nesta corretora.
CREATE OR REPLACE FUNCTION public.registrar_contato_cliente(
  p_cliente_id uuid, p_corretora text, p_data date DEFAULT NULL, p_nota text DEFAULT NULL,
  p_criado_por uuid DEFAULT NULL, p_criado_por_nome text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_data date := COALESCE(p_data, public.brasil_hoje()); n integer;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  IF NULLIF(trim(p_corretora), '') IS NULL THEN RAISE EXCEPTION 'corretora não informada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id) THEN RAISE EXCEPTION 'cliente não encontrado'; END IF;
  IF v_data > public.brasil_hoje() THEN RAISE EXCEPTION 'a data do contato não pode ser futura'; END IF;
  INSERT INTO public.cliente_contatos (cliente_id, corretora, data, nota, criado_por, criado_por_nome)
  VALUES (p_cliente_id, p_corretora, v_data, NULLIF(trim(p_nota), ''), p_criado_por, NULLIF(trim(p_criado_por_nome), ''));
  SELECT COUNT(*)::integer INTO n FROM public.cliente_contatos WHERE cliente_id = p_cliente_id AND corretora = p_corretora;
  RETURN n;
END;
$$;

-- Apaga um contato registrado por engano. Devolve quantos contatos a conta ainda tem.
CREATE OR REPLACE FUNCTION public.excluir_contato_cliente(p_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_cliente uuid; v_corretora text; n integer;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  DELETE FROM public.cliente_contatos WHERE id = p_id RETURNING cliente_id, corretora INTO v_cliente, v_corretora;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT COUNT(*)::integer INTO n FROM public.cliente_contatos WHERE cliente_id = v_cliente AND corretora = v_corretora;
  RETURN n;
END;
$$;

-- 3. Ativações e reativações por atendente no mês ----------------------------------------------------
DROP FUNCTION IF EXISTS public.funil_ativacoes_por_atendente(date, integer);
CREATE OR REPLACE FUNCTION public.funil_ativacoes_por_atendente(p_mes_ref date DEFAULT NULL, p_meses_inativo integer DEFAULT 4)
RETURNS TABLE(
  ativador text, contas integer, contatos integer, contas_contatadas integer,
  operaram integer, ativados integer, reativados integer, lotes numeric, receita numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref,
           GREATEST(COALESCE(p_meses_inativo, 4), 1) AS n_inativo
  ),
  -- contas na campanha hoje (cliente × corretora com atendente)
  camp AS MATERIALIZED (
    SELECT m.cliente_id, m.corretora, trim(m.ativador) AS ativador
    FROM public.cliente_corretora m
    WHERE NULLIF(trim(m.ativador), '') IS NOT NULL
  ),
  -- giro mensal dessas contas, todo o histórico (é dele que sai o giro anterior)
  lm AS MATERIALIZED (
    SELECT x.cliente_id, x.corretora, x.mes_ref, SUM(x.operados) AS operados, SUM(x.receita) AS receita
    FROM public.lotes_mes x
    JOIN camp c ON c.cliente_id = x.cliente_id AND c.corretora = x.corretora
    GROUP BY 1, 2, 3
  ),
  hist AS MATERIALIZED (
    SELECT h.*,
           MAX(h.mes_ref) FILTER (WHERE h.operados > 0)
             OVER (PARTITION BY h.cliente_id, h.corretora ORDER BY h.mes_ref ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS giro_anterior
    FROM lm h
  ),
  vc AS MATERIALIZED (
    SELECT v.cliente_id, v.corretora, date_trunc('month', v.data_migracao)::date AS mes_migracao
    FROM public.v_cliente_corretora v
    JOIN camp c ON c.cliente_id = v.cliente_id AND c.corretora = v.corretora
  ),
  -- quem operou no mês, em um tipo só (a mesma regra da S51; conta aberta no mês entra como 1ª operação)
  giro AS (
    SELECT h.cliente_id, h.corretora, h.operados, h.receita,
           CASE WHEN h.giro_anterior IS NOT NULL AND h.mes_ref >= (h.giro_anterior + make_interval(months => cfg.n_inativo))::date THEN 'reativado'
                WHEN h.giro_anterior IS NULL AND v.mes_migracao IS NOT NULL AND h.mes_ref >= (v.mes_migracao + make_interval(months => cfg.n_inativo))::date THEN 'reativado'
                WHEN h.giro_anterior IS NULL THEN 'ativado'
                ELSE 'carteira' END AS tipo
    FROM hist h CROSS JOIN cfg
    LEFT JOIN vc v ON v.cliente_id = h.cliente_id AND v.corretora = h.corretora
    WHERE h.operados > 0 AND h.mes_ref = cfg.mes_ref
  ),
  ct AS (
    SELECT c.cliente_id, c.corretora, COUNT(*)::integer AS contatos
    FROM public.cliente_contatos c CROSS JOIN cfg
    WHERE c.data >= cfg.mes_ref AND c.data < (cfg.mes_ref + INTERVAL '1 month')::date
    GROUP BY 1, 2
  )
  SELECT c.ativador,
         COUNT(*)::integer AS contas,
         COALESCE(SUM(ct.contatos), 0)::integer AS contatos,
         COUNT(ct.cliente_id)::integer AS contas_contatadas,
         COUNT(g.cliente_id)::integer AS operaram,
         COUNT(*) FILTER (WHERE g.tipo = 'ativado')::integer AS ativados,
         COUNT(*) FILTER (WHERE g.tipo = 'reativado')::integer AS reativados,
         COALESCE(SUM(g.operados) FILTER (WHERE g.tipo IN ('ativado', 'reativado')), 0) AS lotes,
         ROUND(COALESCE(SUM(g.receita) FILTER (WHERE g.tipo IN ('ativado', 'reativado')), 0), 2) AS receita
  FROM camp c
  LEFT JOIN ct ON ct.cliente_id = c.cliente_id AND ct.corretora = c.corretora
  LEFT JOIN giro g ON g.cliente_id = c.cliente_id AND g.corretora = c.corretora
  WHERE public.acesso_ok()
  GROUP BY c.ativador
  ORDER BY (COUNT(*) FILTER (WHERE g.tipo IN ('ativado', 'reativado'))) DESC, 3 DESC, 1;
$$;

-- 4. clientes_lista devolve o atendente da campanha (ativador) ----------------------------------------
-- A versão anterior é a da S46 (nível); só entra a coluna ativador no fim, lida direto de cliente_corretora.
DROP FUNCTION IF EXISTS public.clientes_lista(text, date, uuid);
CREATE OR REPLACE FUNCTION public.clientes_lista(p_corretora text, p_mes_ref date DEFAULT NULL, p_cliente_id uuid DEFAULT NULL)
RETURNS TABLE(
  cliente_id uuid, nome text, documento text, telefone text, email text, uf text, perfil text, tipo_pessoa text,
  n_contas integer, conta_principal text, status text, situacao_conta text,
  assessor_nome text, responsavel text, tarifa numeric,
  data_migracao date, data_entrada date, dias_ate_migrar integer,
  lotes_total numeric, lotes_mes numeric, zerados_mes numeric, receita_mes numeric, receita_corretagem_mes numeric, receita_zeragem_mes numeric,
  lotes_12m numeric, receita_12m numeric, ultimo_giro date, ultimo_mes_giro date, meses_sem_giro integer,
  situacao text, alertas text[], parceiro text, observacoes text, motivo_recusa text,
  grupo_corretagem text,
  receita_total numeric, primeiro_mes_giro date, meses_ativos integer,
  lotes_mes_anterior numeric, lotes_media_3m numeric, dias_sem_giro integer, risco text,
  nivel text,
  ativador text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT m.mes_ref,
           (m.mes_ref - INTERVAL '12 months')::date AS mes_ini,
           (m.mes_ref - INTERVAL '1 month')::date  AS mes_ant,
           (m.mes_ref - INTERVAL '3 months')::date AS mes_3m_ini,
           (m.mes_ref + INTERVAL '1 month')::date  AS mes_seg,
           COALESCE(NULLIF(public.param(p_corretora, 'meses_inativo'), '')::integer, 1) AS meses_inativo,
           COALESCE(NULLIF(public.param(p_corretora, 'risco_dias_parado'), '')::numeric, 10) AS risco_dias,
           COALESCE(NULLIF(public.param(p_corretora, 'risco_queda_pct'), '')::numeric, 50) AS risco_pct,
           COALESCE(NULLIF(public.param(p_corretora, 'risco_minimo_lotes'), '')::numeric, 20) AS risco_min,
           COALESCE(NULLIF(public.param(p_corretora, 'nivel_alto_lotes'), '')::numeric, 1000) AS nivel_alto,
           COALESCE(NULLIF(public.param(p_corretora, 'nivel_medio_lotes'), '')::numeric, 100) AS nivel_medio,
           public.brasil_hoje() AS hoje,
           -- último dia lançado até o fim do mês de referência (o giro do cliente é medido contra ele)
           (SELECT MAX(l.data) FROM public.lotes l WHERE l.corretora = p_corretora AND l.data < (m.mes_ref + INTERVAL '1 month')::date) AS ultima_data,
           -- há lotes num mês posterior: o mês de referência está fechado
           EXISTS (SELECT 1 FROM public.lotes l WHERE l.corretora = p_corretora AND l.data >= (m.mes_ref + INTERVAL '1 month')::date) AS mes_fechado
    FROM (SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref) m
  ),
  cfg2 AS MATERIALIZED (
    -- fração do mês já lançada (dias úteis): 1 em mês fechado; 0 quando o mês de referência ainda
    -- não tem lançamento nenhum (mês escolhido à frente do último lançado: ninguém entra em queda)
    SELECT cfg.*,
           CASE WHEN cfg.mes_fechado THEN 1::numeric
                WHEN cfg.ultima_data IS NULL OR cfg.ultima_data < cfg.mes_ref THEN 0::numeric
                ELSE public.dias_uteis(cfg.mes_ref, cfg.ultima_data)::numeric
                     / GREATEST(public.dias_uteis(cfg.mes_ref, (cfg.mes_seg - INTERVAL '1 day')::date), 1) END AS fator
    FROM cfg
  ),
  base AS MATERIALIZED (
    SELECT * FROM public.v_cliente_corretora vc
    WHERE vc.corretora = p_corretora AND (p_cliente_id IS NULL OR vc.cliente_id = p_cliente_id)
  ),
  q AS (
    SELECT
      c.id AS cliente_id, c.nome, c.documento, c.telefone, c.email, c.uf, c.perfil, c.tipo_pessoa,
      b.n_contas, b.conta_principal, b.status, b.situacao_conta,
      b.assessor_nome, COALESCE(b.responsavel, a.responsavel) AS responsavel,
      COALESCE(tv.corretagem, a.corretagem, 0) AS tarifa,
      b.data_migracao, b.data_entrada,
      CASE WHEN b.data_migracao IS NOT NULL AND b.data_entrada IS NOT NULL THEN (b.data_migracao - b.data_entrada) END AS dias_ate_migrar,
      COALESCE(g.lotes_total, 0) AS lotes_total, COALESCE(g.lotes_mes, 0) AS lotes_mes, COALESCE(g.zerados_mes, 0) AS zerados_mes, ROUND(COALESCE(g.receita_mes, 0), 2) AS receita_mes,
      ROUND(COALESCE(g.rc_mes, 0), 2) AS receita_corretagem_mes, ROUND(COALESCE(g.rz_mes, 0), 2) AS receita_zeragem_mes,
      COALESCE(g.lotes_12m, 0) AS lotes_12m, ROUND(COALESCE(g.receita_12m, 0), 2) AS receita_12m,
      g.ultimo_giro, g.ultimo_mes_giro,
      CASE WHEN g.ultimo_mes_giro IS NULL THEN NULL
           ELSE ((EXTRACT(YEAR FROM cfg.mes_ref) - EXTRACT(YEAR FROM g.ultimo_mes_giro)) * 12
                + EXTRACT(MONTH FROM cfg.mes_ref) - EXTRACT(MONTH FROM g.ultimo_mes_giro))::integer END AS meses_sem_giro,
      CASE
        WHEN b.status = 'Recusou' THEN 'Recusou'
        WHEN b.status <> 'Migrado' THEN 'Em processamento'
        WHEN g.ultimo_mes_giro IS NULL THEN 'Nunca girou'
        WHEN ((EXTRACT(YEAR FROM cfg.mes_ref) - EXTRACT(YEAR FROM g.ultimo_mes_giro)) * 12
              + EXTRACT(MONTH FROM cfg.mes_ref) - EXTRACT(MONTH FROM g.ultimo_mes_giro)) >= cfg.meses_inativo
          THEN 'Inativo'
        ELSE 'Ativo'
      END AS situacao,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN c.documento IS NULL THEN 'sem CPF/CNPJ' END,
        CASE WHEN c.telefone_digits IS NULL THEN 'sem telefone' END,
        CASE WHEN b.status = 'Migrado' AND b.data_migracao IS NULL THEN 'migrado sem data' END,
        CASE WHEN b.data_entrada IS NULL THEN 'sem data de entrada' END,
        CASE WHEN b.n_contas > 1 THEN b.n_contas || ' contas' END,
        CASE WHEN b.status = 'Migrado' AND g.ultimo_mes_giro IS NULL THEN 'migrado sem giro' END,
        CASE WHEN b.n_contas = 0 AND b.status = 'Migrado' THEN 'sem conta' END,
        CASE WHEN b.n_contas > 0 AND b.conta_principal IS NULL THEN 'sem conta principal' END,
        CASE WHEN b.assessor_norm IS NOT NULL AND a.id IS NULL THEN 'assessor não cadastrado' END,
        CASE WHEN b.status = 'Migrado' AND COALESCE(tv.corretagem, a.corretagem, 0) = 0
              AND COALESCE(a.tipo_zeragem, 'PADRAO') <> 'FIXA' THEN 'tarifa zero' END,
        CASE WHEN b.status = 'Migrado' AND b.grupo_corretagem = 'Não vinculado' THEN 'fora do grupo de corretagem' END,
        CASE WHEN b.status = 'Migrado' AND b.grupo_corretagem = 'Bloqueado' THEN 'grupo de corretagem bloqueado' END
      ], NULL) AS alertas,
      b.parceiro, b.observacoes, b.motivo_recusa,
      b.grupo_corretagem,
      ROUND(COALESCE(g.receita_total, 0), 2) AS receita_total,
      g.primeiro_mes_giro,
      COALESCE(g.meses_ativos, 0)::integer AS meses_ativos,
      COALESCE(g.lotes_mes_anterior, 0) AS lotes_mes_anterior,
      -- média dos 3 meses anteriores; cliente com menos de 3 meses de giro divide pelos meses que tem
      CASE WHEN g.primeiro_mes_giro IS NULL OR g.primeiro_mes_giro > cfg.mes_ant THEN 0
           ELSE ROUND(COALESCE(g.lotes_3m, 0) / LEAST(3, ((EXTRACT(YEAR FROM cfg.mes_ant) - EXTRACT(YEAR FROM g.primeiro_mes_giro)) * 12
                + EXTRACT(MONTH FROM cfg.mes_ant) - EXTRACT(MONTH FROM g.primeiro_mes_giro)) + 1), 1) END AS lotes_media_3m,
      CASE WHEN g.ultimo_giro IS NULL OR cfg.ultima_data IS NULL THEN NULL ELSE (cfg.ultima_data - g.ultimo_giro)::integer END AS dias_sem_giro
    FROM base b
    JOIN public.clientes c ON c.id = b.cliente_id
    CROSS JOIN cfg2 cfg
    LEFT JOIN LATERAL (
      SELECT SUM(lm.operados) AS lotes_total,
             SUM(lm.receita)  AS receita_total,
             SUM(lm.operados) FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS lotes_mes,
             SUM(lm.zerados)  FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS zerados_mes,
             SUM(lm.receita)  FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS receita_mes,
             SUM(lm.receita_corretagem) FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS rc_mes,
             SUM(lm.receita_zeragem)    FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS rz_mes,
             SUM(lm.operados) FILTER (WHERE lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref) AS lotes_12m,
             SUM(lm.receita)  FILTER (WHERE lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref) AS receita_12m,
             SUM(lm.operados) FILTER (WHERE lm.mes_ref = cfg.mes_ant) AS lotes_mes_anterior,
             SUM(lm.operados) FILTER (WHERE lm.mes_ref >= cfg.mes_3m_ini AND lm.mes_ref <= cfg.mes_ant) AS lotes_3m,
             MAX(lm.ultimo_giro) FILTER (WHERE lm.mes_ref <= cfg.mes_ref) AS ultimo_giro,
             MAX(lm.mes_ref) FILTER (WHERE lm.operados > 0 AND lm.mes_ref <= cfg.mes_ref) AS ultimo_mes_giro,
             MIN(lm.mes_ref) FILTER (WHERE lm.operados > 0) AS primeiro_mes_giro,
             COUNT(DISTINCT lm.mes_ref) FILTER (WHERE lm.operados > 0) AS meses_ativos
      FROM public.lotes_mes lm
      WHERE lm.corretora = p_corretora AND lm.cliente_id = c.id
    ) g ON true
    LEFT JOIN public.assessores a ON a.corretora = p_corretora AND a.nome_norm = b.assessor_norm
    LEFT JOIN LATERAL (
      SELECT t.corretagem FROM public.tarifas_cliente t
      WHERE t.corretora = p_corretora AND t.cliente_id = c.id AND t.vigencia <= cfg.hoje
      ORDER BY t.vigencia DESC LIMIT 1
    ) tv ON true
    WHERE public.acesso_ok()
  )
  SELECT q.*,
    -- risco: todo cliente migrado que girou nos 3 meses anteriores ou neste mês (antes só quem já tinha
    -- girado no mês de referência: quem parou no fim do mês anterior aparecia como Inativo e ficava de fora)
    CASE
      WHEN q.status <> 'Migrado' OR (q.lotes_media_3m <= 0 AND q.lotes_mes <= 0) THEN NULL
      WHEN q.dias_sem_giro >= cfg.risco_dias THEN 'parou'
      WHEN q.lotes_media_3m >= cfg.risco_min AND cfg.fator >= 0.25
           AND q.lotes_mes <= q.lotes_media_3m * cfg.fator * (1 - cfg.risco_pct / 100.0) THEN 'em queda'
    END AS risco,
    -- nível pela média de lotes dos 3 meses anteriores ao de referência
    CASE
      WHEN q.lotes_media_3m <= 0 THEN NULL
      WHEN q.lotes_media_3m >= cfg.nivel_alto THEN 'Alto'
      WHEN q.lotes_media_3m >= cfg.nivel_medio THEN 'Médio'
      WHEN q.lotes_media_3m > 0 THEN 'Baixo'
    END AS nivel,
    -- atendente da campanha de ativação (S52): fora do responsável e da comissão
    NULLIF(trim(cc.ativador), '') AS ativador
  FROM q CROSS JOIN cfg2 cfg
  LEFT JOIN public.cliente_corretora cc ON cc.cliente_id = q.cliente_id AND cc.corretora = p_corretora
  ORDER BY q.lotes_12m DESC, q.nome;
$$;

-- 5. Permissões -----------------------------------------------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('atribuir_ativador', 'registrar_contato_cliente', 'excluir_contato_cliente', 'funil_ativacoes_por_atendente', 'clientes_lista')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Conferência: contas na campanha por atendente, contatos registrados e o painel do mês corrente
SELECT corretora, ativador, COUNT(*) AS contas
FROM public.cliente_corretora WHERE ativador IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2;
SELECT COUNT(*) AS contatos, COUNT(DISTINCT (cliente_id, corretora)) AS contas_com_contato FROM public.cliente_contatos;
SELECT * FROM public.funil_ativacoes_por_atendente(NULL, 4);
-- clientes_lista com a coluna nova (esperado: a mesma contagem de antes, com ativador vazio fora da campanha)
SELECT COALESCE(cl.ativador, '(sem atendente)') AS ativador, cl.situacao, COUNT(*) AS clientes
FROM public.clientes_lista('GENIAL') cl GROUP BY 1, 2 ORDER BY 1, 2;
