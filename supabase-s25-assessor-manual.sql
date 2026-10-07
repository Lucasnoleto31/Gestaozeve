-- ============================================================================
-- S25 · Assessor informado à mão (cliente cadastrado antes de aparecer no export)
-- Re-runnável. Rodar depois da S24.
--
-- Um cliente levado para a Genial/XP pelo funil de leads ou pelo botão "Novo cliente"
-- ainda não tem conta no export da corretora. O assessor escolhido no cadastro fica em
-- cliente_corretora.assessor e vale até a conta aparecer no export (que tem prioridade).
-- ============================================================================
ALTER TABLE public.cliente_corretora ADD COLUMN IF NOT EXISTS assessor text;

CREATE OR REPLACE VIEW public.v_cliente_corretora AS
WITH contas_s AS (
  SELECT ct.corretora, ct.cliente_id, ct.conta, ct.situacao_conta, ct.assessor_nome, ct.assessor_norm,
         ct.data_habilitacao, ct.principal, m.status AS st
  FROM public.contas ct
  LEFT JOIN public.status_conta_mapa m ON m.corretora = ct.corretora AND m.situacao = upper(trim(COALESCE(ct.situacao_conta, '')))
  WHERE ct.cliente_id IS NOT NULL
),
por_cliente AS (
  SELECT corretora, cliente_id,
    COUNT(*)::integer AS n_contas,
    MAX(conta) FILTER (WHERE principal) AS conta_principal,
    MAX(situacao_conta) FILTER (WHERE principal) AS situacao_conta,
    MAX(st) FILTER (WHERE principal) AS status_conta,
    MAX(assessor_nome) FILTER (WHERE principal) AS assessor_nome,
    MAX(assessor_norm) FILTER (WHERE principal) AS assessor_norm,
    MIN(data_habilitacao) FILTER (WHERE st = 'Migrado') AS data_migracao
  FROM contas_s
  GROUP BY corretora, cliente_id
)
SELECT
  COALESCE(pc.corretora, m.corretora) AS corretora,
  COALESCE(pc.cliente_id, m.cliente_id) AS cliente_id,
  COALESCE(pc.n_contas, 0) AS n_contas,
  pc.conta_principal,
  pc.situacao_conta,
  -- manual (ficha / lista própria) > conta da corretora > padrão
  COALESCE(m.status, pc.status_conta, 'Em processamento') AS status,
  -- assessor: conta do export > informado à mão > responsável interno (BTG)
  COALESCE(pc.assessor_nome, m.assessor, m.responsavel) AS assessor_nome,
  COALESCE(pc.assessor_norm, public.norm_texto(m.assessor), public.norm_texto(m.responsavel)) AS assessor_norm,
  CASE WHEN COALESCE(m.status, pc.status_conta, 'Em processamento') = 'Migrado'
       THEN COALESCE(m.data_migracao, pc.data_migracao) END AS data_migracao,
  m.responsavel, m.data_entrada, m.parceiro, m.observacoes, m.motivo_recusa
FROM por_cliente pc
FULL JOIN public.cliente_corretora m ON m.corretora = pc.corretora AND m.cliente_id = pc.cliente_id
WHERE pc.cliente_id IS NOT NULL OR m.status IS NOT NULL;

GRANT SELECT ON public.v_cliente_corretora TO service_role;

-- importar_clientes: linha sem conta guarda o assessor informado em cliente_corretora.assessor
CREATE OR REPLACE FUNCTION public.importar_clientes(p_corretora text, p_linhas jsonb)
RETURNS TABLE(linhas integer, clientes_novos integer, contas_novas integer, contas_atualizadas integer, sem_conta integer,
              por_cpf integer, por_conta integer, por_telefone integer, por_nome integer)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_linhas integer := 0; v_cli_novos integer := 0; v_contas_novas integer := 0; v_contas_upd integer := 0; v_sem_conta integer := 0;
  v_cpf integer := 0; v_conta integer := 0; v_tel integer := 0; v_nome integer := 0;
  r record; v_id uuid;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;

  DROP TABLE IF EXISTS tmp_cli;
  CREATE TEMP TABLE tmp_cli ON COMMIT DROP AS
  SELECT DISTINCT ON (chave) *
  FROM (
    SELECT
      public.so_digitos(x.conta) AS conta,
      public.so_digitos(x.conta_digito) AS conta_digito,
      NULLIF(trim(x.id_conta), '') AS id_conta,
      NULLIF(trim(x.id_cliente), '') AS id_cliente,
      COALESCE(NULLIF(trim(x.nome), ''), 'SEM NOME') AS nome,
      COALESCE(public.norm_texto(x.nome), 'SEM NOME') AS nome_norm,
      public.so_digitos(x.documento) AS documento,
      -- lista própria: o responsável interno faz o papel do assessor
      COALESCE(NULLIF(trim(x.assessor), ''), NULLIF(trim(x.responsavel), '')) AS assessor_nome,
      public.norm_texto(COALESCE(NULLIF(trim(x.assessor), ''), x.responsavel)) AS assessor_norm,
      NULLIF(trim(x.assessor), '') AS assessor_manual,
      NULLIF(trim(x.filial), '') AS filial,
      NULLIF(upper(trim(x.situacao_conta)), '') AS situacao_conta,
      NULLIF(trim(x.tipo_pessoa), '') AS tipo_pessoa,
      NULLIF(trim(x.sexo), '') AS sexo,
      NULLIF(trim(x.estado_civil), '') AS estado_civil,
      NULLIF(upper(trim(x.uf)), '') AS uf,
      NULLIF(trim(x.profissao), '') AS profissao,
      x.rendimentos, x.patrimonio,
      NULLIF(lower(trim(x.email)), '') AS email,
      NULLIF(trim(x.telefone), '') AS telefone,
      public.so_digitos(x.telefone) AS telefone_digits,
      NULLIF(trim(x.perfil), '') AS perfil,
      NULLIF(trim(x.perfil_suitability), '') AS perfil_suitability,
      x.dt_nascimento, x.data_habilitacao, x.soma_total,
      NULLIF(trim(x.id_assessor), '') AS id_assessor,
      x.dt_partition,
      x.data_entrada,
      NULLIF(trim(x.parceiro), '') AS parceiro,
      NULLIF(trim(x.observacoes), '') AS observacoes,
      NULLIF(trim(x.motivo_recusa), '') AS motivo_recusa,
      public.status_manual(p_corretora, x.status) AS status_manual,
      NULLIF(trim(x.responsavel), '') AS responsavel,
      x.corretagem,
      NULL::uuid AS cliente_id,
      NULL::text AS casado_por,
      COALESCE('CONTA:' || public.so_digitos(x.conta), 'DOC:' || public.so_digitos(x.documento),
               'TEL:' || public.so_digitos(x.telefone), 'NOME:' || public.norm_texto(x.nome)) AS chave
    FROM jsonb_to_recordset(p_linhas) AS x(
      conta text, conta_digito text, id_conta text, id_cliente text, nome text, documento text, assessor text,
      filial text, situacao_conta text, tipo_pessoa text, sexo text, estado_civil text, uf text, profissao text,
      rendimentos numeric, patrimonio numeric, email text, telefone text, perfil text, perfil_suitability text,
      dt_nascimento date, data_habilitacao date, soma_total numeric, id_assessor text, dt_partition date,
      data_entrada date, parceiro text, observacoes text, motivo_recusa text,
      status text, responsavel text, corretagem numeric)
    WHERE NULLIF(trim(COALESCE(x.nome, '')), '') IS NOT NULL OR public.so_digitos(x.conta) IS NOT NULL
  ) s
  ORDER BY chave, dt_partition DESC NULLS LAST;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE conta IS NULL) INTO v_linhas, v_sem_conta FROM tmp_cli;

  -- a) CPF/CNPJ
  UPDATE tmp_cli t SET cliente_id = c.id, casado_por = 'cpf'
    FROM public.clientes c
   WHERE t.documento IS NOT NULL AND c.documento = t.documento;

  -- b) conta já conhecida (com ou sem dígito)
  UPDATE tmp_cli t SET cliente_id = ct.cliente_id, casado_por = 'conta'
    FROM public.contas ct JOIN public.clientes c ON c.id = ct.cliente_id
   WHERE t.cliente_id IS NULL AND ct.corretora = p_corretora
     AND (ct.conta = t.conta OR ct.conta_digito = t.conta OR (t.conta_digito IS NOT NULL AND ct.conta_digito = t.conta_digito))
     AND (c.documento IS NULL OR t.documento IS NULL OR c.documento = t.documento);

  -- c) telefone (8 últimos dígitos), só quando bate com um único cliente
  UPDATE tmp_cli t SET cliente_id = m.id, casado_por = 'telefone'
    FROM (
      SELECT right(c.telefone_digits, 8) AS tel8, MIN(c.id::text)::uuid AS id
      FROM public.clientes c
      WHERE c.telefone_digits IS NOT NULL AND length(c.telefone_digits) >= 8
      GROUP BY 1 HAVING COUNT(*) = 1
    ) m
   WHERE t.cliente_id IS NULL AND t.telefone_digits IS NOT NULL AND length(t.telefone_digits) >= 8
     AND right(t.telefone_digits, 8) = m.tel8;

  -- d) nome, só quando é único no cadastro
  UPDATE tmp_cli t SET cliente_id = m.id, casado_por = 'nome'
    FROM (SELECT c.nome_norm, MIN(c.id::text)::uuid AS id FROM public.clientes c GROUP BY c.nome_norm HAVING COUNT(*) = 1) m
   WHERE t.cliente_id IS NULL AND t.nome_norm <> 'SEM NOME' AND t.nome_norm = m.nome_norm;

  SELECT COUNT(*) FILTER (WHERE casado_por = 'cpf'), COUNT(*) FILTER (WHERE casado_por = 'conta'),
         COUNT(*) FILTER (WHERE casado_por = 'telefone'), COUNT(*) FILTER (WHERE casado_por = 'nome')
    INTO v_cpf, v_conta, v_tel, v_nome FROM tmp_cli;

  -- e) clientes novos com documento: um por CPF/CNPJ
  SELECT COUNT(DISTINCT documento) INTO v_cli_novos FROM tmp_cli WHERE cliente_id IS NULL AND documento IS NOT NULL;
  INSERT INTO public.clientes (documento, nome, nome_norm, tipo_pessoa, sexo, estado_civil, uf, profissao, rendimentos,
                               patrimonio, email, telefone, telefone_digits, perfil, perfil_suitability, dt_nascimento)
  SELECT DISTINCT ON (t.documento) t.documento, t.nome, t.nome_norm, t.tipo_pessoa, t.sexo, t.estado_civil, t.uf, t.profissao,
         t.rendimentos, t.patrimonio, t.email, t.telefone, t.telefone_digits, t.perfil, t.perfil_suitability, t.dt_nascimento
  FROM tmp_cli t
  WHERE t.cliente_id IS NULL AND t.documento IS NOT NULL
  ORDER BY t.documento, t.data_habilitacao NULLS LAST;
  UPDATE tmp_cli t SET cliente_id = c.id, casado_por = 'novo'
    FROM public.clientes c
   WHERE t.cliente_id IS NULL AND t.documento IS NOT NULL AND c.documento = t.documento;

  -- f) sem documento: um cliente por nome (sem nome, um por conta)
  FOR r IN
    SELECT DISTINCT ON (grupo) *
    FROM (SELECT *, CASE WHEN nome_norm = 'SEM NOME' THEN 'C:' || COALESCE(conta, chave) ELSE nome_norm END AS grupo
          FROM tmp_cli WHERE cliente_id IS NULL) g
    ORDER BY grupo, data_habilitacao NULLS LAST
  LOOP
    INSERT INTO public.clientes (nome, nome_norm, tipo_pessoa, sexo, estado_civil, uf, profissao, rendimentos, patrimonio,
                                 email, telefone, telefone_digits, perfil, perfil_suitability, dt_nascimento)
    VALUES (r.nome, r.nome_norm, r.tipo_pessoa, r.sexo, r.estado_civil, r.uf, r.profissao, r.rendimentos, r.patrimonio,
            r.email, r.telefone, r.telefone_digits, r.perfil, r.perfil_suitability, r.dt_nascimento)
    RETURNING id INTO v_id;
    UPDATE tmp_cli SET cliente_id = v_id, casado_por = 'novo'
     WHERE cliente_id IS NULL
       AND (CASE WHEN nome_norm = 'SEM NOME' THEN 'C:' || COALESCE(conta, chave) ELSE nome_norm END) = r.grupo;
    v_cli_novos := v_cli_novos + 1;
  END LOOP;

  -- g) completa o cadastro dos clientes existentes (vazio não apaga)
  UPDATE public.clientes c SET
    documento = COALESCE(c.documento, t.documento),
    nome = CASE WHEN t.nome <> 'SEM NOME' THEN t.nome ELSE c.nome END,
    nome_norm = CASE WHEN t.nome <> 'SEM NOME' THEN t.nome_norm ELSE c.nome_norm END,
    tipo_pessoa = COALESCE(t.tipo_pessoa, c.tipo_pessoa),
    sexo = COALESCE(t.sexo, c.sexo),
    estado_civil = COALESCE(t.estado_civil, c.estado_civil),
    uf = COALESCE(t.uf, c.uf),
    profissao = COALESCE(t.profissao, c.profissao),
    rendimentos = COALESCE(t.rendimentos, c.rendimentos),
    patrimonio = COALESCE(t.patrimonio, c.patrimonio),
    email = COALESCE(t.email, c.email),
    telefone = COALESCE(t.telefone, c.telefone),
    telefone_digits = COALESCE(t.telefone_digits, c.telefone_digits),
    perfil = COALESCE(t.perfil, c.perfil),
    perfil_suitability = COALESCE(t.perfil_suitability, c.perfil_suitability),
    dt_nascimento = COALESCE(t.dt_nascimento, c.dt_nascimento),
    updated_at = now()
  FROM (SELECT DISTINCT ON (cliente_id) * FROM tmp_cli WHERE casado_por <> 'novo' ORDER BY cliente_id, data_habilitacao NULLS LAST) t
  WHERE c.id = t.cliente_id
    AND NOT EXISTS (SELECT 1 FROM public.clientes o WHERE o.documento = t.documento AND o.id <> c.id);

  -- h) contas (só linhas com conta)
  SELECT COUNT(*) INTO v_contas_upd
    FROM tmp_cli t JOIN public.contas ct ON ct.corretora = p_corretora AND ct.conta = t.conta
   WHERE t.conta IS NOT NULL;
  v_contas_novas := (v_linhas - v_sem_conta) - v_contas_upd;

  INSERT INTO public.contas (corretora, cliente_id, conta, conta_digito, id_conta, id_cliente, assessor_nome, assessor_norm,
                             id_assessor, filial, situacao_conta, data_habilitacao, soma_total, dt_partition)
  SELECT p_corretora, t.cliente_id, t.conta, t.conta_digito, t.id_conta, t.id_cliente, t.assessor_nome, t.assessor_norm,
         t.id_assessor, t.filial, t.situacao_conta, t.data_habilitacao, t.soma_total, t.dt_partition
  FROM tmp_cli t
  WHERE t.conta IS NOT NULL
  ON CONFLICT (corretora, conta) DO UPDATE SET
    cliente_id = EXCLUDED.cliente_id,
    conta_digito = COALESCE(EXCLUDED.conta_digito, contas.conta_digito),
    id_conta = COALESCE(EXCLUDED.id_conta, contas.id_conta),
    id_cliente = COALESCE(EXCLUDED.id_cliente, contas.id_cliente),
    assessor_nome = COALESCE(EXCLUDED.assessor_nome, contas.assessor_nome),
    assessor_norm = COALESCE(EXCLUDED.assessor_norm, contas.assessor_norm),
    id_assessor = COALESCE(EXCLUDED.id_assessor, contas.id_assessor),
    filial = COALESCE(EXCLUDED.filial, contas.filial),
    situacao_conta = COALESCE(EXCLUDED.situacao_conta, contas.situacao_conta),
    data_habilitacao = COALESCE(EXCLUDED.data_habilitacao, contas.data_habilitacao),
    soma_total = COALESCE(EXCLUDED.soma_total, contas.soma_total),
    dt_partition = COALESCE(EXCLUDED.dt_partition, contas.dt_partition),
    updated_at = now();

  -- i) campos manuais (vazio não apaga); status/data de migração só quando a lista trouxe status;
  --    assessor informado à mão só vale para quem ainda não tem conta
  INSERT INTO public.cliente_corretora (cliente_id, corretora, data_entrada, parceiro, observacoes, motivo_recusa, status, responsavel, data_migracao, assessor)
  SELECT DISTINCT ON (t.cliente_id) t.cliente_id, p_corretora, t.data_entrada, t.parceiro, t.observacoes, t.motivo_recusa,
         t.status_manual, t.responsavel, CASE WHEN t.status_manual IS NOT NULL THEN t.data_habilitacao END,
         CASE WHEN t.conta IS NULL THEN t.assessor_manual END
  FROM tmp_cli t
  WHERE t.cliente_id IS NOT NULL
  ORDER BY t.cliente_id, (t.data_entrada IS NULL), (t.parceiro IS NULL), (t.status_manual IS NULL), t.data_habilitacao NULLS LAST
  ON CONFLICT (cliente_id, corretora) DO UPDATE SET
    data_entrada = COALESCE(EXCLUDED.data_entrada, cliente_corretora.data_entrada),
    parceiro = COALESCE(EXCLUDED.parceiro, cliente_corretora.parceiro),
    observacoes = COALESCE(EXCLUDED.observacoes, cliente_corretora.observacoes),
    motivo_recusa = COALESCE(EXCLUDED.motivo_recusa, cliente_corretora.motivo_recusa),
    status = COALESCE(EXCLUDED.status, cliente_corretora.status),
    responsavel = COALESCE(EXCLUDED.responsavel, cliente_corretora.responsavel),
    data_migracao = COALESCE(EXCLUDED.data_migracao, cliente_corretora.data_migracao),
    assessor = COALESCE(EXCLUDED.assessor, cliente_corretora.assessor),
    updated_at = now();

  -- j) corretagem da lista → tarifa inicial de quem ainda não tem tarifa nesta corretora
  --    (vigência: 1º dia do mês da entrada/migração, como na aba Tarifas)
  INSERT INTO public.tarifas_cliente (corretora, cliente_id, vigencia, corretagem, observacao)
  SELECT DISTINCT ON (t.cliente_id) p_corretora, t.cliente_id,
         date_trunc('month', COALESCE(LEAST(t.data_entrada, t.data_habilitacao), t.data_entrada, t.data_habilitacao, public.brasil_hoje()))::date,
         t.corretagem, 'Importada da lista de clientes'
  FROM tmp_cli t
  WHERE t.cliente_id IS NOT NULL AND t.corretagem IS NOT NULL AND t.corretagem > 0
    AND NOT EXISTS (SELECT 1 FROM public.tarifas_cliente x WHERE x.corretora = p_corretora AND x.cliente_id = t.cliente_id)
  ORDER BY t.cliente_id, t.data_habilitacao NULLS LAST
  ON CONFLICT DO NOTHING;

  PERFORM public.marcar_contas_principais(p_corretora);
  PERFORM public.vincular_lotes(p_corretora, NULL);
  PERFORM public.recalcular_lotes(p_corretora, NULL);
  PERFORM public.vincular_leads();

  RETURN QUERY SELECT v_linhas, v_cli_novos, v_contas_novas, v_contas_upd, v_sem_conta, v_cpf, v_conta, v_tel, v_nome;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- Conferência
SELECT corretora, COUNT(*) AS clientes, COUNT(*) FILTER (WHERE n_contas = 0) AS sem_conta FROM public.v_cliente_corretora GROUP BY corretora;
