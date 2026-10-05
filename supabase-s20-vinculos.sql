-- =============================================
-- ZeveAI — S20: importação da lista própria de clientes e vínculos por
-- CPF/CNPJ, conta, telefone e nome. Rode DEPOIS da S19.
--
-- importar_clientes: a conta passa a ser opcional e o cliente é casado por
--   CPF/CNPJ → conta (com ou sem dígito) → telefone (8 últimos dígitos, único)
--   → nome (único). Linhas sem conta só completam o cadastro (telefone, e-mail,
--   campos manuais). Devolve quantos foram casados por cada chave.
-- vincular_lotes: além da conta e do ID_CLIENTE, liga pelo nome do relatório
--   quando ele é único no cadastro (export de 13 colunas).
-- vincular_leads: CPF, telefone e, por último, nome único.
-- cliente_contas: mostra também contas que só existem nos lotes.
-- =============================================

DROP FUNCTION IF EXISTS public.importar_clientes(text, jsonb);
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
      NULLIF(trim(x.assessor), '') AS assessor_nome,
      public.norm_texto(x.assessor) AS assessor_norm,
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
      NULL::uuid AS cliente_id,
      NULL::text AS casado_por,
      -- chave de deduplicação dentro do arquivo
      COALESCE('CONTA:' || public.so_digitos(x.conta), 'DOC:' || public.so_digitos(x.documento),
               'TEL:' || public.so_digitos(x.telefone), 'NOME:' || public.norm_texto(x.nome)) AS chave
    FROM jsonb_to_recordset(p_linhas) AS x(
      conta text, conta_digito text, id_conta text, id_cliente text, nome text, documento text, assessor text,
      filial text, situacao_conta text, tipo_pessoa text, sexo text, estado_civil text, uf text, profissao text,
      rendimentos numeric, patrimonio numeric, email text, telefone text, perfil text, perfil_suitability text,
      dt_nascimento date, data_habilitacao date, soma_total numeric, id_assessor text, dt_partition date,
      data_entrada date, parceiro text, observacoes text, motivo_recusa text)
    WHERE NULLIF(trim(COALESCE(x.nome, '')), '') IS NOT NULL OR public.so_digitos(x.conta) IS NOT NULL
  ) s
  ORDER BY chave, dt_partition DESC NULLS LAST;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE conta IS NULL) INTO v_linhas, v_sem_conta FROM tmp_cli;

  -- a) CPF/CNPJ
  UPDATE tmp_cli t SET cliente_id = c.id, casado_por = 'cpf'
    FROM public.clientes c
   WHERE t.documento IS NOT NULL AND c.documento = t.documento;

  -- b) conta já conhecida (a conta do arquivo pode vir com ou sem dígito)
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

  -- f) sem documento: um cliente por nome (linhas com o mesmo nome no arquivo viram um cliente só;
  --    sem nome, um por conta)
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

  -- i) campos manuais (só o que veio preenchido)
  INSERT INTO public.cliente_corretora (cliente_id, corretora, data_entrada, parceiro, observacoes, motivo_recusa)
  SELECT DISTINCT ON (t.cliente_id) t.cliente_id, p_corretora, t.data_entrada, t.parceiro, t.observacoes, t.motivo_recusa
  FROM tmp_cli t
  WHERE t.cliente_id IS NOT NULL
  ORDER BY t.cliente_id, (t.data_entrada IS NULL), (t.parceiro IS NULL), t.data_habilitacao NULLS LAST
  ON CONFLICT (cliente_id, corretora) DO UPDATE SET
    data_entrada = COALESCE(EXCLUDED.data_entrada, cliente_corretora.data_entrada),
    parceiro = COALESCE(EXCLUDED.parceiro, cliente_corretora.parceiro),
    observacoes = COALESCE(EXCLUDED.observacoes, cliente_corretora.observacoes),
    motivo_recusa = COALESCE(EXCLUDED.motivo_recusa, cliente_corretora.motivo_recusa),
    updated_at = now();

  PERFORM public.marcar_contas_principais(p_corretora);
  PERFORM public.vincular_lotes(p_corretora, NULL);
  PERFORM public.recalcular_lotes(p_corretora, NULL);
  PERFORM public.vincular_leads();

  RETURN QUERY SELECT v_linhas, v_cli_novos, v_contas_novas, v_contas_upd, v_sem_conta, v_cpf, v_conta, v_tel, v_nome;
END;
$$;

-- Liga lotes a clientes/contas: conta (sem/com dígito) → ID_CLIENTE → nome do relatório (único)
CREATE OR REPLACE FUNCTION public.vincular_lotes(p_corretora text, p_importacao_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n1 integer; n2 integer; n3 integer; n4 integer;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;

  UPDATE public.lotes l
     SET cliente_id = ct.cliente_id, conta_id = ct.id
    FROM public.contas ct
   WHERE l.corretora = p_corretora
     AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
     AND ct.corretora = l.corretora
     AND l.conta IS NOT NULL AND ct.conta = l.conta
     AND (l.conta_id IS DISTINCT FROM ct.id OR l.cliente_id IS DISTINCT FROM ct.cliente_id);
  GET DIAGNOSTICS n1 = ROW_COUNT;

  UPDATE public.lotes l
     SET cliente_id = ct.cliente_id, conta_id = ct.id
    FROM public.contas ct
   WHERE l.corretora = p_corretora
     AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
     AND ct.corretora = l.corretora
     AND l.conta IS NOT NULL AND ct.conta_digito = l.conta
     AND (l.conta_id IS DISTINCT FROM ct.id OR l.cliente_id IS DISTINCT FROM ct.cliente_id);
  GET DIAGNOSTICS n2 = ROW_COUNT;

  UPDATE public.lotes l
     SET cliente_id = ct.cliente_id, conta_id = ct.id
    FROM (
      SELECT DISTINCT ON (id_cliente) id, cliente_id, id_cliente
      FROM public.contas
      WHERE corretora = p_corretora AND id_cliente IS NOT NULL
      ORDER BY id_cliente, principal DESC, data_habilitacao NULLS LAST
    ) ct
   WHERE l.corretora = p_corretora
     AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
     AND l.conta_id IS NULL
     AND l.id_cliente IS NOT NULL AND ct.id_cliente = l.id_cliente;
  GET DIAGNOSTICS n3 = ROW_COUNT;

  -- nome do relatório: só quando é único entre os clientes com conta nesta corretora
  UPDATE public.lotes l
     SET cliente_id = m.id
    FROM (
      SELECT c.nome_norm, MIN(c.id::text)::uuid AS id
      FROM public.clientes c
      WHERE EXISTS (SELECT 1 FROM public.contas ct WHERE ct.cliente_id = c.id AND ct.corretora = p_corretora)
      GROUP BY c.nome_norm HAVING COUNT(*) = 1
    ) m
   WHERE l.corretora = p_corretora
     AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
     AND l.cliente_id IS NULL AND l.nome_cliente IS NOT NULL
     AND public.norm_texto(l.nome_cliente) = m.nome_norm;
  GET DIAGNOSTICS n4 = ROW_COUNT;

  RETURN n1 + n2 + n3 + n4;
END;
$$;

-- Cruza leads com clientes: CPF → telefone (8 últimos dígitos) → nome único
CREATE OR REPLACE FUNCTION public.vincular_leads()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n1 integer; n2 integer;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  UPDATE public.leads ld
     SET cliente_id = c.id
    FROM public.clientes c
   WHERE ld.cliente_id IS NULL
     AND ((ld.cpf_digits IS NOT NULL AND c.documento = ld.cpf_digits)
       OR (ld.whatsapp_digits IS NOT NULL AND c.telefone_digits IS NOT NULL
           AND length(ld.whatsapp_digits) >= 8
           AND right(c.telefone_digits, 8) = right(ld.whatsapp_digits, 8)));
  GET DIAGNOSTICS n1 = ROW_COUNT;

  UPDATE public.leads ld
     SET cliente_id = m.id
    FROM (SELECT c.nome_norm, MIN(c.id::text)::uuid AS id FROM public.clientes c GROUP BY c.nome_norm HAVING COUNT(*) = 1) m
   WHERE ld.cliente_id IS NULL AND public.norm_texto(ld.nome) = m.nome_norm;
  GET DIAGNOSTICS n2 = ROW_COUNT;
  RETURN n1 + n2;
END;
$$;

-- Ficha 360º: contas do cadastro + contas que só aparecem nos lotes (ligadas ao cliente por nome/ID)
CREATE OR REPLACE FUNCTION public.cliente_contas(p_corretora text, p_cliente_id uuid)
RETURNS TABLE(conta_id uuid, conta text, conta_digito text, situacao_conta text, status text, assessor_nome text, filial text,
              data_habilitacao date, principal boolean, lotes numeric, lotes_12m numeric, zerados numeric, receita numeric, ultimo_giro date)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS (SELECT public.mes_referencia(p_corretora) AS mes_ref)
  SELECT ct.id, ct.conta, ct.conta_digito, ct.situacao_conta, public.status_conta(ct.corretora, ct.situacao_conta),
         ct.assessor_nome, ct.filial, ct.data_habilitacao, ct.principal,
         COALESCE(SUM(v.lotes_operados), 0),
         COALESCE(SUM(v.lotes_operados) FILTER (WHERE v.mes_ref > cfg.mes_ref - INTERVAL '12 months' AND v.mes_ref <= cfg.mes_ref), 0),
         COALESCE(SUM(v.lotes_zerados), 0),
         ROUND(COALESCE(SUM(v.receita), 0), 2),
         MAX(v.data) FILTER (WHERE v.lotes_operados > 0)
  FROM public.contas ct
  CROSS JOIN cfg
  LEFT JOIN public.v_lotes v ON v.conta_id = ct.id
  WHERE ct.corretora = p_corretora AND ct.cliente_id = p_cliente_id AND public.acesso_ok()
  GROUP BY ct.id, cfg.mes_ref
  UNION ALL
  SELECT NULL, v.conta, NULL, NULL, 'Não cadastrada', MAX(v.assessor_nome), MAX(v.filial), NULL, false,
         SUM(v.lotes_operados),
         SUM(v.lotes_operados) FILTER (WHERE v.mes_ref > cfg.mes_ref - INTERVAL '12 months' AND v.mes_ref <= cfg.mes_ref),
         SUM(v.lotes_zerados), ROUND(SUM(v.receita), 2), MAX(v.data) FILTER (WHERE v.lotes_operados > 0)
  FROM public.v_lotes v CROSS JOIN cfg
  WHERE v.corretora = p_corretora AND v.cliente_id = p_cliente_id AND v.conta_id IS NULL AND public.acesso_ok()
  GROUP BY v.conta, cfg.mes_ref
  ORDER BY 9 DESC, 8 NULLS LAST;
$$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('importar_clientes', 'vincular_lotes', 'vincular_leads', 'cliente_contas')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Religa o que já está no banco com as regras novas e mostra o que sobrou
SELECT public.vincular_lotes('GENIAL', NULL) AS lotes_religados, public.vincular_leads() AS leads_religados;
SELECT COUNT(*) AS linhas_sem_cliente, COUNT(DISTINCT conta) AS contas_sem_cliente, COALESCE(SUM(CASE WHEN zeragem THEN 0 ELSE qtd END), 0) AS lotes_sem_cliente
FROM public.lotes WHERE corretora = 'GENIAL' AND cliente_id IS NULL;
