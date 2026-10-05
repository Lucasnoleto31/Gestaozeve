-- =============================================
-- ZeveAI — S19: esquema do controle por corretora (Genial, XP, BTG)
-- Rode DEPOIS do supabase-s18-autenticacao.sql, no SQL Editor do Supabase.
-- Pode ser rodado de novo sem medo (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS).
--
-- Reproduz o modelo da planilha de controle da Genial:
--   Parâmetros   → parametros, assessores, status_conta_mapa, multiplicadores,
--                  faixas_incentivo, consolidados, status_lead, responsaveis
--   Clientes     → clientes (pessoa, por CPF/CNPJ), contas (1 cliente : N contas,
--                  conta principal), cliente_corretora (campos manuais), tarifas_cliente
--   Lotes        → lotes (fato, já com tarifa/zeragem/multiplicador gravados) +
--                  v_lotes (operados/zerados, receita, pontos, cliente)
--   Leads        → leads (formulário + campos da equipe + cruzamento com clientes);
--                  o funil é um só para o escritório (a coluna corretora do lead é
--                  "onde ele já opera", como no formulário)
--   Importações  → importacoes + importar_clientes / importar_lotes / importar_leads
-- Tudo tem a coluna corretora, então XP e BTG usam as mesmas tabelas e telas.
-- O app acessa pelo servidor (service_role); RLS ligada sem políticas = nada
-- de acesso direto pelo navegador.
-- =============================================

-- ---------------------------------------------
-- 0. Helpers
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.acesso_ok()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(auth.role(), '') = 'service_role'
      OR public.get_my_role() IN ('admin', 'vendedor')
      OR session_user IN ('postgres', 'supabase_admin');
$$;

CREATE OR REPLACE FUNCTION public.brasil_hoje()
RETURNS date
LANGUAGE sql STABLE
AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

-- Maiúsculas, sem acento, espaços colapsados (chave de comparação de nomes)
CREATE OR REPLACE FUNCTION public.norm_texto(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(upper(translate(
    COALESCE(p, ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
    'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'
  )), '\s+', ' ', 'g'), '')::text;
$$;

CREATE OR REPLACE FUNCTION public.so_digitos(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(COALESCE(p, ''), '\D', '', 'g'), '');
$$;

-- Produto = 3 primeiras letras do ativo (WINV26 → WIN)
CREATE OR REPLACE FUNCTION public.produto_de(p_ativo text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT NULLIF(upper(left(trim(COALESCE(p_ativo, '')), 3)), '');
$$;

-- ---------------------------------------------
-- 1. Parâmetros
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.parametros (
  corretora text NOT NULL,                -- GENIAL / XP / BTG / GERAL (leads)
  chave text NOT NULL,
  valor text NOT NULL,
  descricao text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corretora, chave)
);

INSERT INTO public.parametros (corretora, chave, valor, descricao)
SELECT c, k, v, d FROM (VALUES ('GENIAL'), ('XP'), ('BTG')) AS cs(c)
CROSS JOIN (VALUES
  ('zeragem_padrao', '0',       'ZeragemRS: R$ por contrato zerado nos assessores com zeragem PADRAO'),
  ('meses_inativo',  '1',       'MesesInativo: meses sem giro para o cliente virar Inativo'),
  ('modo_zeragem',   'ZERAGEM', 'ModoZeragem: texto no campo MODO que marca a linha como zeragem')
) AS ps(k, v, d)
ON CONFLICT DO NOTHING;

INSERT INTO public.parametros (corretora, chave, valor, descricao) VALUES
  ('GERAL', 'dias_alerta_lead', '7', 'Dias sem contato para alertar um lead em aberto')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.param(p_corretora text, p_chave text)
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT valor FROM public.parametros WHERE corretora = p_corretora AND chave = p_chave;
$$;

CREATE TABLE IF NOT EXISTS public.assessores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretora text NOT NULL,
  nome text NOT NULL,
  nome_norm text NOT NULL,
  id_assessor text,
  corretagem numeric(10,4) NOT NULL DEFAULT 0,          -- R$ por lote operado
  tipo_zeragem text NOT NULL DEFAULT 'PADRAO' CHECK (tipo_zeragem IN ('PADRAO', 'FIXA')),
  zeragem_fixa numeric(10,2) NOT NULL DEFAULT 0,        -- R$ por contrato zerado quando FIXA
  responsavel text,                                      -- responsável interno (Artur / Lucas)
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (corretora, nome_norm)
);

INSERT INTO public.assessores (corretora, nome, nome_norm, corretagem, tipo_zeragem, zeragem_fixa)
SELECT 'GENIAL', n, public.norm_texto(n), c, t, z FROM (VALUES
  ('ARTUR AILTON FONSECA MARANHÃO', 0.25, 'PADRAO', 0),
  ('Lucas Gomes Noleto Lopes',      0.25, 'FIXA',   29.9),
  ('ZEVE INVESTIMENTOS 1',  0.20, 'PADRAO', 0),
  ('ZEVE INVESTIMENTOS 2',  0.05, 'PADRAO', 0),
  ('ZEVE INVESTIMENTOS 3',  0.30, 'PADRAO', 0),
  ('ZEVE INVESTIMENTOS 4',  0.30, 'PADRAO', 0),
  ('ZEVE INVESTIMENTOS 5',  0.25, 'PADRAO', 0),
  ('ZEVE INVESTIMENTOS 6',  0.25, 'PADRAO', 0),
  ('ZEVE INVESTIMENTOS 7',  0.15, 'PADRAO', 0),
  ('ZEVE INVESTIMENTOS 8',  0.25, 'PADRAO', 0),
  ('ZEVE INVESTIMENTOS 9',  0.00, 'FIXA',   39.9),
  ('ZEVE INVESTIMENTOS 10', 0.25, 'PADRAO', 0),
  ('ZEVE INVESTIMENTOS 11', 0.25, 'PADRAO', 0),
  ('ZEVE INVESTIMENTOS 12', 0.25, 'PADRAO', 0),
  ('ZEVE INVESTIMENTOS 13', 0.25, 'PADRAO', 0),
  ('ZEVE INVESTIMENTOS 14', 0.25, 'PADRAO', 0),
  ('ZEVE INVESTIMENTOS 15', 0.25, 'PADRAO', 0),
  ('ZEVE INVESTIMENTOS 16', 0.25, 'PADRAO', 0),
  ('ZEVE INVESTIMENTOS 17', 0.25, 'PADRAO', 0),
  ('ZEVE INVESTIMENTOS 18', 0.25, 'PADRAO', 0),
  ('ZEVE INVESTIMENTOS 19', 0.25, 'PADRAO', 0)
) AS v(n, c, t, z)
ON CONFLICT DO NOTHING;

-- SITUACAO_CONTA da corretora → status do controle
CREATE TABLE IF NOT EXISTS public.status_conta_mapa (
  corretora text NOT NULL,
  situacao text NOT NULL,                 -- como vem no export (maiúsculas)
  status text NOT NULL CHECK (status IN ('Migrado', 'Em processamento', 'Recusou')),
  PRIMARY KEY (corretora, situacao)
);
INSERT INTO public.status_conta_mapa (corretora, situacao, status) VALUES
  ('GENIAL', 'ATIVA', 'Migrado')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.multiplicadores (
  corretora text NOT NULL,
  produto text NOT NULL,
  pontos numeric(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (corretora, produto)
);
INSERT INTO public.multiplicadores (corretora, produto, pontos) VALUES
  ('GENIAL', 'WIN', 1), ('GENIAL', 'WDO', 2), ('GENIAL', 'DOL', 5), ('GENIAL', 'BIT', 4), ('GENIAL', 'IND', 3),
  ('GENIAL', 'ETR', 3), ('GENIAL', 'GLD', 3), ('GENIAL', 'SOL', 3), ('GENIAL', 'WSP', 1), ('GENIAL', 'DI1', 1)
ON CONFLICT DO NOTHING;

-- Faixas: o cliente entra na maior faixa cujo mínimo ULTRAPASSOU (pontos > pontos_min)
CREATE TABLE IF NOT EXISTS public.faixas_incentivo (
  corretora text NOT NULL,
  pontos_min numeric(14,2) NOT NULL,
  valor numeric(12,2) NOT NULL,
  PRIMARY KEY (corretora, pontos_min)
);
INSERT INTO public.faixas_incentivo (corretora, pontos_min, valor) VALUES
  ('GENIAL', 1000, 200), ('GENIAL', 5000, 500), ('GENIAL', 10000, 1000), ('GENIAL', 50000, 5000),
  ('GENIAL', 150000, 12000), ('GENIAL', 300000, 21000), ('GENIAL', 500000, 31500),
  ('GENIAL', 750000, 42000), ('GENIAL', 1000000, 49000)
ON CONFLICT DO NOTHING;

-- Clientes cujas contas somam juntas no incentivo (pelo nome), mesmo sem CPF
CREATE TABLE IF NOT EXISTS public.consolidados (
  corretora text NOT NULL,
  nome text NOT NULL,
  nome_norm text NOT NULL,
  PRIMARY KEY (corretora, nome_norm)
);

CREATE TABLE IF NOT EXISTS public.status_lead (
  status text PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('Aberto', 'Fechado')),
  ordem integer NOT NULL DEFAULT 0
);
INSERT INTO public.status_lead (status, tipo, ordem) VALUES
  ('Novo', 'Aberto', 1), ('Em contato', 'Aberto', 2), ('Ganho', 'Fechado', 3), ('Perdido', 'Fechado', 4)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.responsaveis (
  nome text PRIMARY KEY,
  atende_clientes boolean NOT NULL DEFAULT true,
  atende_leads boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true
);
INSERT INTO public.responsaveis (nome, atende_clientes, atende_leads) VALUES
  ('Artur', true, true), ('Lucas', true, true), ('Aikon', false, true)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------
-- 2. Importações
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretora text NOT NULL,                -- GERAL para leads
  tipo text NOT NULL CHECK (tipo IN ('clientes', 'lotes', 'leads')),
  nome_arquivo text NOT NULL,
  linhas integer NOT NULL DEFAULT 0,
  linhas_novas integer NOT NULL DEFAULT 0,
  linhas_ignoradas integer NOT NULL DEFAULT 0,
  data_min date,
  data_max date,
  detalhes jsonb,
  criado_por uuid,
  criado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.importacoes ADD COLUMN IF NOT EXISTS detalhes jsonb;

-- ---------------------------------------------
-- 3. Clientes e contas
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento text UNIQUE,                 -- CPF/CNPJ só dígitos (nulo quando o export não traz)
  nome text NOT NULL,
  nome_norm text NOT NULL,
  tipo_pessoa text,
  sexo text,
  estado_civil text,
  uf text,
  profissao text,
  rendimentos numeric(16,2),
  patrimonio numeric(16,2),
  email text,
  telefone text,
  telefone_digits text,
  perfil text,
  perfil_suitability text,
  dt_nascimento date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clientes_nome_norm_idx ON public.clientes (nome_norm);
CREATE INDEX IF NOT EXISTS clientes_telefone_idx ON public.clientes (telefone_digits);

CREATE TABLE IF NOT EXISTS public.contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretora text NOT NULL,
  cliente_id uuid REFERENCES public.clientes (id) ON DELETE SET NULL,
  conta text NOT NULL,                   -- CD_CONTA_SEM_DIGITO (texto)
  conta_digito text,                     -- CD_CONTA_COM_DIGITO
  id_conta text,                         -- ID_CONTA da corretora
  id_cliente text,                       -- ID_CLIENTE da corretora
  assessor_nome text,
  assessor_norm text,
  id_assessor text,
  filial text,
  situacao_conta text,                   -- como vem no export
  data_habilitacao date,                 -- = Data de Migração
  soma_total numeric(16,2),
  dt_partition date,
  principal boolean NOT NULL DEFAULT false,  -- conta que representa o cliente (evita dupla contagem)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (corretora, conta)
);
CREATE INDEX IF NOT EXISTS contas_cliente_idx ON public.contas (cliente_id);
CREATE INDEX IF NOT EXISTS contas_corretora_assessor_idx ON public.contas (corretora, assessor_norm);
CREATE INDEX IF NOT EXISTS contas_id_cliente_idx ON public.contas (corretora, id_cliente);
CREATE INDEX IF NOT EXISTS contas_conta_digito_idx ON public.contas (corretora, conta_digito);

-- Campos manuais do controle, por cliente e corretora
CREATE TABLE IF NOT EXISTS public.cliente_corretora (
  cliente_id uuid NOT NULL REFERENCES public.clientes (id) ON DELETE CASCADE,
  corretora text NOT NULL,
  data_entrada date,                     -- quando o cliente foi levado pra corretora
  parceiro text,
  observacoes text,
  motivo_recusa text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, corretora)
);

-- Histórico de tarifa do cliente: vale a vigência mais recente ≤ data do lançamento
CREATE TABLE IF NOT EXISTS public.tarifas_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretora text NOT NULL,
  cliente_id uuid NOT NULL REFERENCES public.clientes (id) ON DELETE CASCADE,
  vigencia date NOT NULL,
  corretagem numeric(10,4) NOT NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (corretora, cliente_id, vigencia)
);

-- ---------------------------------------------
-- 4. Lotes (fato)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretora text NOT NULL,
  importacao_id uuid REFERENCES public.importacoes (id) ON DELETE CASCADE,
  data date NOT NULL,
  conta text,                            -- conta como veio no export (com ou sem dígito)
  id_cliente text,
  id_assessor text,
  assessor_nome text,
  assessor_norm text,
  filial text,
  ativo text,
  produto text,                          -- 3 primeiras letras do ativo
  modo text,
  zeragem boolean NOT NULL DEFAULT false, -- MODO contém o parâmetro modo_zeragem
  qtd numeric(14,2) NOT NULL DEFAULT 0,
  plataforma text,
  nome_cliente text,                     -- como veio no export
  tipo_pessoa text,
  cliente_id uuid REFERENCES public.clientes (id) ON DELETE SET NULL,
  conta_id uuid REFERENCES public.contas (id) ON DELETE SET NULL,
  -- derivados (recalcular_lotes): gravados aqui pra consulta ser instantânea
  tarifa numeric(10,4) NOT NULL DEFAULT 0,        -- R$/lote vigente na data
  zeragem_rs numeric(10,2) NOT NULL DEFAULT 0,    -- R$/contrato zerado
  multiplicador numeric(10,2) NOT NULL DEFAULT 0, -- pontos por lote (incentivo)
  chave_incentivo text,                           -- NOME: / DOC: / CONTA:
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS tarifa numeric(10,4) NOT NULL DEFAULT 0;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS zeragem_rs numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS multiplicador numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS chave_incentivo text;
CREATE INDEX IF NOT EXISTS lotes_corretora_data_idx ON public.lotes (corretora, data);
-- data::timestamp (sem fuso) deixa a expressão IMMUTABLE; a view usa a mesma expressão
CREATE INDEX IF NOT EXISTS lotes_mes_idx ON public.lotes (corretora, ((date_trunc('month', data::timestamp))::date));
CREATE INDEX IF NOT EXISTS lotes_cliente_data_idx ON public.lotes (corretora, cliente_id, data);
CREATE INDEX IF NOT EXISTS lotes_assessor_data_idx ON public.lotes (corretora, assessor_norm, data);
CREATE INDEX IF NOT EXISTS lotes_conta_idx ON public.lotes (corretora, conta);
CREATE INDEX IF NOT EXISTS lotes_importacao_idx ON public.lotes (importacao_id);

-- ---------------------------------------------
-- 5. Leads
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretora text,                        -- onde o lead já opera (vem do formulário: Genial, XP, BTG, Toro, Outra…)
  data_hora timestamptz NOT NULL DEFAULT now(),
  nome text NOT NULL,
  whatsapp text,
  whatsapp_digits text,
  cpf text,
  cpf_digits text,
  email text,
  ja_opera text,
  origem text,                           -- origem / parceiro
  responsavel text,
  status text NOT NULL DEFAULT 'Novo',
  ultimo_contato date,
  data_fechamento date,
  motivo_perda text,
  observacoes text,
  cliente_id uuid REFERENCES public.clientes (id) ON DELETE SET NULL,
  importacao_id uuid REFERENCES public.importacoes (id) ON DELETE SET NULL,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_data_idx ON public.leads (data_hora);
CREATE INDEX IF NOT EXISTS leads_cpf_idx ON public.leads (cpf_digits);
CREATE INDEX IF NOT EXISTS leads_whatsapp_idx ON public.leads (whatsapp_digits);
CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads (status);

-- ---------------------------------------------
-- 6. Segurança: RLS ligada, sem políticas → só o servidor (service_role) acessa
-- ---------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['parametros', 'assessores', 'status_conta_mapa', 'multiplicadores', 'faixas_incentivo',
    'consolidados', 'status_lead', 'responsaveis', 'importacoes', 'clientes', 'contas', 'cliente_corretora',
    'tarifas_cliente', 'lotes', 'leads']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- ---------------------------------------------
-- 7. Motor de cálculo
-- ---------------------------------------------
-- Status do controle a partir da SITUACAO_CONTA (não mapeada = Em processamento)
CREATE OR REPLACE FUNCTION public.status_conta(p_corretora text, p_situacao text)
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (SELECT m.status FROM public.status_conta_mapa m
      WHERE m.corretora = p_corretora AND m.situacao = upper(trim(COALESCE(p_situacao, '')))),
    'Em processamento');
$$;

-- Tarifa vigente: a do cliente (vigência ≤ data) senão a do assessor, senão 0
CREATE OR REPLACE FUNCTION public.tarifa_vigente(p_corretora text, p_cliente_id uuid, p_assessor_norm text, p_data date)
RETURNS numeric
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (SELECT t.corretagem FROM public.tarifas_cliente t
      WHERE t.corretora = p_corretora AND t.cliente_id = p_cliente_id AND t.vigencia <= p_data
      ORDER BY t.vigencia DESC LIMIT 1),
    (SELECT a.corretagem FROM public.assessores a
      WHERE a.corretora = p_corretora AND a.nome_norm = p_assessor_norm),
    0);
$$;

-- Mês de referência = último mês com lotes
CREATE OR REPLACE FUNCTION public.mes_referencia(p_corretora text)
RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE((SELECT date_trunc('month', MAX(data))::date FROM public.lotes WHERE corretora = p_corretora),
                  date_trunc('month', public.brasil_hoje())::date);
$$;

-- Liga lotes a clientes/contas: pela conta (sem ou com dígito), depois pelo ID_CLIENTE da corretora
CREATE OR REPLACE FUNCTION public.vincular_lotes(p_corretora text, p_importacao_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n1 integer; n2 integer; n3 integer;
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
     AND l.conta_id IS NULL
     AND ct.corretora = l.corretora
     AND l.conta IS NOT NULL AND ct.conta_digito = l.conta;
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

  RETURN n1 + n2 + n3;
END;
$$;

-- Marca a conta principal de cada cliente na corretora:
-- a migrada mais antiga; sem migrada, a mais antiga de todas
CREATE OR REPLACE FUNCTION public.marcar_contas_principais(p_corretora text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  WITH ranqueada AS (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY cliente_id
        ORDER BY (public.status_conta(corretora, situacao_conta) = 'Migrado') DESC,
                 data_habilitacao NULLS LAST, created_at
      ) AS rk
    FROM public.contas
    WHERE corretora = p_corretora AND cliente_id IS NOT NULL
  )
  UPDATE public.contas c
     SET principal = (r.rk = 1)
    FROM ranqueada r
   WHERE c.id = r.id AND c.principal IS DISTINCT FROM (r.rk = 1);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Cruza leads com clientes por CPF ou telefone (últimos 8 dígitos)
CREATE OR REPLACE FUNCTION public.vincular_leads()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n integer;
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
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Recalcula os derivados de cada lote (zeragem, produto, tarifa vigente, R$ zeragem,
-- multiplicador e chave do incentivo). Chamar depois de importar e sempre que um
-- parâmetro mudar (assessores, tarifas, multiplicadores, consolidados, modo_zeragem).
CREATE OR REPLACE FUNCTION public.recalcular_lotes(p_corretora text, p_importacao_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n integer; v_modo text; v_zeragem_padrao numeric;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  v_modo := upper(COALESCE(NULLIF(public.param(p_corretora, 'modo_zeragem'), ''), 'ZERAGEM'));
  v_zeragem_padrao := COALESCE(NULLIF(public.param(p_corretora, 'zeragem_padrao'), '')::numeric, 0);

  UPDATE public.lotes l SET
    zeragem = (position(v_modo IN upper(COALESCE(l.modo, ''))) > 0),
    produto = public.produto_de(l.ativo),
    tarifa = COALESCE(
      (SELECT t.corretagem FROM public.tarifas_cliente t
        WHERE t.corretora = l.corretora AND t.cliente_id = l.cliente_id AND t.vigencia <= l.data
        ORDER BY t.vigencia DESC LIMIT 1),
      a.corretagem, 0),
    zeragem_rs = CASE WHEN a.tipo_zeragem = 'FIXA' THEN a.zeragem_fixa ELSE v_zeragem_padrao END,
    multiplicador = COALESCE(m.pontos, 0),
    chave_incentivo = CASE
      WHEN cons.nome_norm IS NOT NULL THEN 'NOME:' || cons.nome_norm
      WHEN c.documento IS NOT NULL THEN 'DOC:' || c.documento
      WHEN l.conta IS NOT NULL THEN 'CONTA:' || l.conta
      ELSE 'NOME:' || COALESCE(c.nome_norm, public.norm_texto(l.nome_cliente), '?')
    END
  FROM public.lotes l2
  LEFT JOIN public.clientes c ON c.id = l2.cliente_id
  LEFT JOIN public.assessores a ON a.corretora = l2.corretora AND a.nome_norm = l2.assessor_norm
  LEFT JOIN public.multiplicadores m ON m.corretora = l2.corretora AND m.produto = public.produto_de(l2.ativo)
  LEFT JOIN LATERAL (
    SELECT x.nome_norm FROM public.consolidados x
    WHERE x.corretora = l2.corretora AND x.nome_norm IN (c.nome_norm, public.norm_texto(l2.nome_cliente))
    LIMIT 1
  ) cons ON true
  WHERE l.id = l2.id
    AND l2.corretora = p_corretora
    AND (p_importacao_id IS NULL OR l2.importacao_id = p_importacao_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Lotes com tudo derivado (a planilha "Lotes" colunas N–AK)
DROP VIEW IF EXISTS public.v_lotes;
CREATE VIEW public.v_lotes AS
SELECT
  l.id, l.corretora, l.importacao_id, l.data,
  (date_trunc('month', l.data::timestamp))::date AS mes_ref,
  (date_trunc('week', l.data::timestamp))::date  AS semana_ini,
  l.conta, l.id_cliente, l.id_assessor, l.assessor_nome, l.assessor_norm, l.filial,
  l.ativo, l.produto, l.modo, l.zeragem, l.qtd, l.plataforma, l.nome_cliente, l.tipo_pessoa,
  l.cliente_id, l.conta_id, l.tarifa, l.zeragem_rs, l.multiplicador, l.chave_incentivo,
  CASE WHEN l.zeragem THEN 0 ELSE l.qtd END AS lotes_operados,
  CASE WHEN l.zeragem THEN l.qtd ELSE 0 END AS lotes_zerados,
  CASE WHEN l.zeragem THEN l.qtd * l.zeragem_rs ELSE l.qtd * l.tarifa END AS receita,
  CASE WHEN l.zeragem THEN 0 ELSE l.qtd * l.multiplicador END AS pontos,
  COALESCE(c.nome, l.nome_cliente, 'Não cadastrado') AS cliente_nome,
  c.nome_norm AS cliente_norm,
  c.documento,
  (c.id IS NULL) AS nao_cadastrado,
  a.responsavel
FROM public.lotes l
LEFT JOIN public.clientes c ON c.id = l.cliente_id
LEFT JOIN public.assessores a ON a.corretora = l.corretora AND a.nome_norm = l.assessor_norm;

-- ---------------------------------------------
-- 8. Importações (set-based: o app manda o arquivo inteiro em JSON)
-- ---------------------------------------------
-- Export de clientes da corretora (+ colunas manuais, se vierem da planilha antiga)
DROP FUNCTION IF EXISTS public.importar_clientes(text, jsonb);
CREATE OR REPLACE FUNCTION public.importar_clientes(p_corretora text, p_linhas jsonb)
RETURNS TABLE(linhas integer, clientes_novos integer, contas_novas integer, contas_atualizadas integer)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_linhas integer := 0; v_cli_novos integer := 0; v_contas_novas integer := 0; v_contas_upd integer := 0;
  r record; v_id uuid;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;

  DROP TABLE IF EXISTS tmp_cli;
  CREATE TEMP TABLE tmp_cli ON COMMIT DROP AS
  SELECT DISTINCT ON (public.so_digitos(x.conta))
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
    NULL::uuid AS cliente_id
  FROM jsonb_to_recordset(p_linhas) AS x(
    conta text, conta_digito text, id_conta text, id_cliente text, nome text, documento text, assessor text,
    filial text, situacao_conta text, tipo_pessoa text, sexo text, estado_civil text, uf text, profissao text,
    rendimentos numeric, patrimonio numeric, email text, telefone text, perfil text, perfil_suitability text,
    dt_nascimento date, data_habilitacao date, soma_total numeric, id_assessor text, dt_partition date,
    data_entrada date, parceiro text, observacoes text, motivo_recusa text)
  WHERE public.so_digitos(x.conta) IS NOT NULL
  ORDER BY public.so_digitos(x.conta), x.dt_partition DESC NULLS LAST;

  SELECT COUNT(*) INTO v_linhas FROM tmp_cli;

  -- a) cliente já existe pelo CPF/CNPJ
  UPDATE tmp_cli t SET cliente_id = c.id
    FROM public.clientes c
   WHERE t.documento IS NOT NULL AND c.documento = t.documento;

  -- b) conta já conhecida cujo cliente não tem documento (ou tem o mesmo)
  UPDATE tmp_cli t SET cliente_id = c.id
    FROM public.contas ct JOIN public.clientes c ON c.id = ct.cliente_id
   WHERE t.cliente_id IS NULL AND ct.corretora = p_corretora AND ct.conta = t.conta
     AND (c.documento IS NULL OR c.documento = t.documento);

  -- c) clientes novos com documento: um por CPF/CNPJ
  SELECT COUNT(DISTINCT documento) INTO v_cli_novos FROM tmp_cli WHERE cliente_id IS NULL AND documento IS NOT NULL;
  INSERT INTO public.clientes (documento, nome, nome_norm, tipo_pessoa, sexo, estado_civil, uf, profissao, rendimentos,
                               patrimonio, email, telefone, telefone_digits, perfil, perfil_suitability, dt_nascimento)
  SELECT DISTINCT ON (t.documento) t.documento, t.nome, t.nome_norm, t.tipo_pessoa, t.sexo, t.estado_civil, t.uf, t.profissao,
         t.rendimentos, t.patrimonio, t.email, t.telefone, t.telefone_digits, t.perfil, t.perfil_suitability, t.dt_nascimento
  FROM tmp_cli t
  WHERE t.cliente_id IS NULL AND t.documento IS NOT NULL
  ORDER BY t.documento, t.data_habilitacao NULLS LAST;
  UPDATE tmp_cli t SET cliente_id = c.id
    FROM public.clientes c
   WHERE t.cliente_id IS NULL AND t.documento IS NOT NULL AND c.documento = t.documento;

  -- d) sem documento: um cliente por conta
  FOR r IN SELECT * FROM tmp_cli WHERE cliente_id IS NULL LOOP
    INSERT INTO public.clientes (nome, nome_norm, tipo_pessoa, sexo, estado_civil, uf, profissao, rendimentos, patrimonio,
                                 email, telefone, telefone_digits, perfil, perfil_suitability, dt_nascimento)
    VALUES (r.nome, r.nome_norm, r.tipo_pessoa, r.sexo, r.estado_civil, r.uf, r.profissao, r.rendimentos, r.patrimonio,
            r.email, r.telefone, r.telefone_digits, r.perfil, r.perfil_suitability, r.dt_nascimento)
    RETURNING id INTO v_id;
    UPDATE tmp_cli SET cliente_id = v_id WHERE conta = r.conta;
    v_cli_novos := v_cli_novos + 1;
  END LOOP;

  -- e) atualiza o cadastro dos clientes já existentes (o export manda; vazio não apaga)
  UPDATE public.clientes c SET
    documento = COALESCE(c.documento, t.documento),
    nome = t.nome, nome_norm = t.nome_norm,
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
  FROM (SELECT DISTINCT ON (cliente_id) * FROM tmp_cli ORDER BY cliente_id, data_habilitacao NULLS LAST) t
  WHERE c.id = t.cliente_id;

  -- f) contas
  SELECT COUNT(*) INTO v_contas_upd
    FROM tmp_cli t JOIN public.contas ct ON ct.corretora = p_corretora AND ct.conta = t.conta;
  v_contas_novas := v_linhas - v_contas_upd;

  INSERT INTO public.contas (corretora, cliente_id, conta, conta_digito, id_conta, id_cliente, assessor_nome, assessor_norm,
                             id_assessor, filial, situacao_conta, data_habilitacao, soma_total, dt_partition)
  SELECT p_corretora, t.cliente_id, t.conta, t.conta_digito, t.id_conta, t.id_cliente, t.assessor_nome, t.assessor_norm,
         t.id_assessor, t.filial, t.situacao_conta, t.data_habilitacao, t.soma_total, t.dt_partition
  FROM tmp_cli t
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

  -- g) campos manuais (só o que veio preenchido)
  INSERT INTO public.cliente_corretora (cliente_id, corretora, data_entrada, parceiro, observacoes, motivo_recusa)
  SELECT DISTINCT ON (t.cliente_id) t.cliente_id, p_corretora, t.data_entrada, t.parceiro, t.observacoes, t.motivo_recusa
  FROM tmp_cli t
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

  RETURN QUERY SELECT v_linhas, v_cli_novos, v_contas_novas, v_contas_upd;
END;
$$;

-- Export de lotes (aceita o formato de 9 colunas "Sinacor…" e o de 13 colunas "ID_CLIENTE…NOME_CLIENTE")
CREATE OR REPLACE FUNCTION public.importar_lotes(p_corretora text, p_importacao_id uuid, p_linhas jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n integer; v_modo text;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  v_modo := upper(COALESCE(NULLIF(public.param(p_corretora, 'modo_zeragem'), ''), 'ZERAGEM'));

  INSERT INTO public.lotes (corretora, importacao_id, data, conta, id_cliente, id_assessor, assessor_nome, assessor_norm,
                            filial, ativo, produto, modo, zeragem, qtd, plataforma, nome_cliente, tipo_pessoa)
  SELECT p_corretora, p_importacao_id, x.data, public.so_digitos(x.conta),
         NULLIF(trim(x.id_cliente), ''), NULLIF(trim(x.id_assessor), ''),
         NULLIF(trim(x.assessor), ''), public.norm_texto(x.assessor), NULLIF(trim(x.filial), ''),
         NULLIF(upper(trim(x.ativo)), ''), public.produto_de(x.ativo), NULLIF(upper(trim(x.modo)), ''),
         position(v_modo IN upper(COALESCE(x.modo, ''))) > 0,
         COALESCE(x.qtd, 0), NULLIF(upper(trim(x.plataforma)), ''),
         NULLIF(trim(x.nome_cliente), ''), NULLIF(trim(x.tipo_pessoa), '')
  FROM jsonb_to_recordset(p_linhas) AS x(
    data date, conta text, id_cliente text, id_assessor text, assessor text, filial text, ativo text, modo text,
    qtd numeric, plataforma text, nome_cliente text, tipo_pessoa text)
  WHERE x.data IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;

  PERFORM public.vincular_lotes(p_corretora, p_importacao_id);
  PERFORM public.recalcular_lotes(p_corretora, p_importacao_id);
  RETURN n;
END;
$$;

-- Export do formulário de leads (+ colunas da equipe, se vierem da planilha antiga)
DROP FUNCTION IF EXISTS public.importar_leads(uuid, jsonb);
CREATE OR REPLACE FUNCTION public.importar_leads(p_importacao_id uuid, p_linhas jsonb)
RETURNS TABLE(novos integer, atualizados integer)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_novos integer := 0; v_upd integer := 0;
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
    NULLIF(trim(x.motivo_perda), '') AS motivo_perda, NULLIF(trim(x.observacoes), '') AS observacoes,
    NULL::uuid AS lead_id
  FROM jsonb_to_recordset(p_linhas) AS x(
    data_hora timestamptz, nome text, whatsapp text, cpf text, email text, ja_opera text, corretora text,
    origem text, responsavel text, status text, ultimo_contato date, data_fechamento date, motivo_perda text, observacoes text)
  WHERE x.data_hora IS NOT NULL AND NULLIF(trim(x.nome), '') IS NOT NULL
  ORDER BY x.data_hora, public.norm_texto(x.nome);

  UPDATE tmp_leads t SET lead_id = l.id
    FROM public.leads l
   WHERE l.data_hora = t.data_hora AND public.norm_texto(l.nome) = t.nome_norm;

  -- já existia: só completa o acompanhamento da equipe (e dados em branco)
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
  FROM tmp_leads t
  WHERE t.lead_id = l.id
    AND (t.origem IS NOT NULL OR t.responsavel IS NOT NULL OR t.status IS NOT NULL OR t.ultimo_contato IS NOT NULL
         OR t.data_fechamento IS NOT NULL OR t.motivo_perda IS NOT NULL OR t.observacoes IS NOT NULL);
  GET DIAGNOSTICS v_upd = ROW_COUNT;

  INSERT INTO public.leads (data_hora, nome, whatsapp, whatsapp_digits, cpf, cpf_digits, email, ja_opera, corretora, origem,
                            responsavel, status, ultimo_contato, data_fechamento, motivo_perda, observacoes, importacao_id)
  SELECT t.data_hora, t.nome, t.whatsapp, t.whatsapp_digits, t.cpf, t.cpf_digits, t.email, t.ja_opera, t.corretora, t.origem,
         t.responsavel, COALESCE(t.status, 'Novo'), t.ultimo_contato, t.data_fechamento, t.motivo_perda, t.observacoes, p_importacao_id
  FROM tmp_leads t WHERE t.lead_id IS NULL;
  GET DIAGNOSTICS v_novos = ROW_COUNT;

  PERFORM public.vincular_leads();
  RETURN QUERY SELECT v_novos, v_upd;
END;
$$;

-- ---------------------------------------------
-- 9. Clientes (a aba Clientes + a aba Receita): uma linha por cliente
-- ---------------------------------------------
DROP FUNCTION IF EXISTS public.clientes_lista(text, date, uuid);
CREATE OR REPLACE FUNCTION public.clientes_lista(p_corretora text, p_mes_ref date DEFAULT NULL, p_cliente_id uuid DEFAULT NULL)
RETURNS TABLE(
  cliente_id uuid, nome text, documento text, telefone text, email text, uf text, perfil text, tipo_pessoa text,
  n_contas integer, conta_principal text, status text, situacao_conta text,
  assessor_nome text, responsavel text, tarifa numeric,
  data_migracao date, data_entrada date, dias_ate_migrar integer,
  lotes_total numeric, lotes_mes numeric, zerados_mes numeric, receita_mes numeric, receita_corretagem_mes numeric, receita_zeragem_mes numeric,
  lotes_12m numeric, receita_12m numeric, ultimo_giro date, ultimo_mes_giro date, meses_sem_giro integer,
  situacao text, alertas text[], parceiro text, observacoes text, motivo_recusa text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS (
    SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref,
           COALESCE(NULLIF(public.param(p_corretora, 'meses_inativo'), '')::integer, 1) AS meses_inativo
  ),
  contas_c AS (
    SELECT ct.cliente_id,
      COUNT(*)::integer AS n_contas,
      MAX(ct.conta) FILTER (WHERE ct.principal) AS conta_principal,
      MAX(ct.situacao_conta) FILTER (WHERE ct.principal) AS situacao_conta,
      MAX(public.status_conta(ct.corretora, ct.situacao_conta)) FILTER (WHERE ct.principal) AS status,
      MAX(ct.assessor_nome) FILTER (WHERE ct.principal) AS assessor_nome,
      MAX(ct.assessor_norm) FILTER (WHERE ct.principal) AS assessor_norm,
      MIN(ct.data_habilitacao) FILTER (WHERE public.status_conta(ct.corretora, ct.situacao_conta) = 'Migrado') AS data_migracao
    FROM public.contas ct
    WHERE ct.corretora = p_corretora AND ct.cliente_id IS NOT NULL
      AND (p_cliente_id IS NULL OR ct.cliente_id = p_cliente_id)
    GROUP BY ct.cliente_id
  ),
  giro AS (
    SELECT v.cliente_id,
      SUM(v.lotes_operados) AS lotes_total,
      SUM(v.lotes_operados) FILTER (WHERE v.mes_ref = cfg.mes_ref) AS lotes_mes,
      SUM(v.lotes_zerados)  FILTER (WHERE v.mes_ref = cfg.mes_ref) AS zerados_mes,
      SUM(v.receita)        FILTER (WHERE v.mes_ref = cfg.mes_ref) AS receita_mes,
      SUM(v.lotes_operados * v.tarifa)    FILTER (WHERE v.mes_ref = cfg.mes_ref) AS rc_mes,
      SUM(v.lotes_zerados * v.zeragem_rs) FILTER (WHERE v.mes_ref = cfg.mes_ref) AS rz_mes,
      SUM(v.lotes_operados) FILTER (WHERE v.mes_ref > cfg.mes_ref - INTERVAL '12 months' AND v.mes_ref <= cfg.mes_ref) AS lotes_12m,
      SUM(v.receita)        FILTER (WHERE v.mes_ref > cfg.mes_ref - INTERVAL '12 months' AND v.mes_ref <= cfg.mes_ref) AS receita_12m,
      MAX(v.data)    FILTER (WHERE v.lotes_operados > 0 AND v.mes_ref <= cfg.mes_ref) AS ultimo_giro,
      MAX(v.mes_ref) FILTER (WHERE v.lotes_operados > 0 AND v.mes_ref <= cfg.mes_ref) AS ultimo_mes_giro
    FROM public.v_lotes v, cfg
    WHERE v.corretora = p_corretora AND v.cliente_id IS NOT NULL
      AND (p_cliente_id IS NULL OR v.cliente_id = p_cliente_id)
    GROUP BY v.cliente_id
  )
  SELECT
    c.id, c.nome, c.documento, c.telefone, c.email, c.uf, c.perfil, c.tipo_pessoa,
    cc.n_contas, cc.conta_principal, COALESCE(cc.status, 'Em processamento'), cc.situacao_conta,
    cc.assessor_nome, a.responsavel,
    public.tarifa_vigente(p_corretora, c.id, cc.assessor_norm, public.brasil_hoje()) AS tarifa,
    cc.data_migracao, m.data_entrada,
    CASE WHEN cc.data_migracao IS NOT NULL AND m.data_entrada IS NOT NULL THEN (cc.data_migracao - m.data_entrada) END AS dias_ate_migrar,
    COALESCE(g.lotes_total, 0), COALESCE(g.lotes_mes, 0), COALESCE(g.zerados_mes, 0), ROUND(COALESCE(g.receita_mes, 0), 2),
    ROUND(COALESCE(g.rc_mes, 0), 2), ROUND(COALESCE(g.rz_mes, 0), 2),
    COALESCE(g.lotes_12m, 0), ROUND(COALESCE(g.receita_12m, 0), 2),
    g.ultimo_giro, g.ultimo_mes_giro,
    CASE WHEN g.ultimo_mes_giro IS NULL THEN NULL
         ELSE ((EXTRACT(YEAR FROM cfg.mes_ref) - EXTRACT(YEAR FROM g.ultimo_mes_giro)) * 12
              + EXTRACT(MONTH FROM cfg.mes_ref) - EXTRACT(MONTH FROM g.ultimo_mes_giro))::integer END AS meses_sem_giro,
    CASE
      WHEN cc.status = 'Recusou' THEN 'Recusou'
      WHEN COALESCE(cc.status, '') <> 'Migrado' THEN 'Em processamento'
      WHEN g.ultimo_mes_giro IS NULL THEN 'Nunca girou'
      WHEN ((EXTRACT(YEAR FROM cfg.mes_ref) - EXTRACT(YEAR FROM g.ultimo_mes_giro)) * 12
            + EXTRACT(MONTH FROM cfg.mes_ref) - EXTRACT(MONTH FROM g.ultimo_mes_giro)) >= cfg.meses_inativo
        THEN 'Inativo'
      ELSE 'Ativo'
    END AS situacao,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN c.documento IS NULL THEN 'sem CPF/CNPJ' END,
      CASE WHEN c.telefone_digits IS NULL THEN 'sem telefone' END,
      CASE WHEN cc.status = 'Migrado' AND cc.data_migracao IS NULL THEN 'migrado sem data' END,
      CASE WHEN m.data_entrada IS NULL THEN 'sem data de entrada' END,
      CASE WHEN cc.n_contas > 1 THEN cc.n_contas || ' contas' END,
      CASE WHEN cc.status = 'Migrado' AND g.ultimo_mes_giro IS NULL THEN 'migrado sem giro' END,
      CASE WHEN cc.conta_principal IS NULL THEN 'sem conta principal' END,
      CASE WHEN cc.assessor_norm IS NOT NULL AND a.id IS NULL THEN 'assessor não cadastrado' END
    ], NULL) AS alertas,
    m.parceiro, m.observacoes, m.motivo_recusa
  FROM public.clientes c
  JOIN contas_c cc ON cc.cliente_id = c.id
  LEFT JOIN giro g ON g.cliente_id = c.id
  LEFT JOIN public.cliente_corretora m ON m.cliente_id = c.id AND m.corretora = p_corretora
  LEFT JOIN public.assessores a ON a.corretora = p_corretora AND a.nome_norm = cc.assessor_norm
  CROSS JOIN cfg
  WHERE public.acesso_ok()
  ORDER BY COALESCE(g.lotes_12m, 0) DESC, c.nome;
$$;

-- Situações de conta que ainda não têm mapa (pra tela de parâmetros)
DROP FUNCTION IF EXISTS public.situacoes_nao_mapeadas(text);
CREATE OR REPLACE FUNCTION public.situacoes_nao_mapeadas(p_corretora text)
RETURNS TABLE(situacao text, contas integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT upper(trim(ct.situacao_conta)), COUNT(*)::integer
  FROM public.contas ct
  WHERE ct.corretora = p_corretora AND NULLIF(trim(COALESCE(ct.situacao_conta, '')), '') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.status_conta_mapa m WHERE m.corretora = p_corretora AND m.situacao = upper(trim(ct.situacao_conta)))
    AND public.acesso_ok()
  GROUP BY 1 ORDER BY 2 DESC;
$$;

-- Assessores que aparecem nas contas/lotes mas não estão em Parâmetros
DROP FUNCTION IF EXISTS public.assessores_nao_cadastrados(text);
CREATE OR REPLACE FUNCTION public.assessores_nao_cadastrados(p_corretora text)
RETURNS TABLE(assessor_nome text, contas integer, lotes numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH nomes AS (
    SELECT ct.assessor_norm, MAX(ct.assessor_nome) AS nome, COUNT(*)::integer AS contas, 0::numeric AS lotes
    FROM public.contas ct WHERE ct.corretora = p_corretora AND ct.assessor_norm IS NOT NULL GROUP BY ct.assessor_norm
    UNION ALL
    SELECT l.assessor_norm, MAX(l.assessor_nome), 0, SUM(CASE WHEN l.zeragem THEN 0 ELSE l.qtd END)
    FROM public.lotes l WHERE l.corretora = p_corretora AND l.assessor_norm IS NOT NULL GROUP BY l.assessor_norm
  )
  SELECT MAX(n.nome), SUM(n.contas)::integer, SUM(n.lotes)
  FROM nomes n
  WHERE NOT EXISTS (SELECT 1 FROM public.assessores a WHERE a.corretora = p_corretora AND a.nome_norm = n.assessor_norm)
    AND public.acesso_ok()
  GROUP BY n.assessor_norm ORDER BY 3 DESC, 2 DESC;
$$;

-- Ficha 360º: contas do cliente com giro e receita
DROP FUNCTION IF EXISTS public.cliente_contas(text, uuid);
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
  ORDER BY ct.principal DESC, ct.data_habilitacao NULLS LAST;
$$;

-- Giro mensal de um cliente (últimos N meses até o mês de referência)
DROP FUNCTION IF EXISTS public.cliente_mensal(text, uuid, integer);
DROP FUNCTION IF EXISTS public.cliente_mensal(text, uuid, date, integer);
CREATE OR REPLACE FUNCTION public.cliente_mensal(p_corretora text, p_cliente_id uuid, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(mes_ref date, lotes numeric, zerados numeric, receita numeric, pontos numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS (SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref)
  SELECT v.mes_ref, SUM(v.lotes_operados), SUM(v.lotes_zerados), ROUND(SUM(v.receita), 2), SUM(v.pontos)
  FROM public.v_lotes v, cfg
  WHERE v.corretora = p_corretora AND v.cliente_id = p_cliente_id
    AND v.mes_ref > cfg.mes_ref - (p_meses || ' months')::interval AND v.mes_ref <= cfg.mes_ref
    AND public.acesso_ok()
  GROUP BY v.mes_ref ORDER BY v.mes_ref;
$$;

-- Extrato de lançamentos do cliente (mais recentes primeiro)
DROP FUNCTION IF EXISTS public.cliente_extrato(text, uuid, integer);
CREATE OR REPLACE FUNCTION public.cliente_extrato(p_corretora text, p_cliente_id uuid, p_limit integer DEFAULT 400)
RETURNS TABLE(id uuid, data date, conta text, ativo text, produto text, plataforma text, modo text,
              lotes_operados numeric, lotes_zerados numeric, tarifa numeric, zeragem_rs numeric,
              receita_corretagem numeric, receita_zeragem numeric, pontos numeric, nome_cliente text)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT v.id, v.data, v.conta, v.ativo, v.produto, v.plataforma, v.modo, v.lotes_operados, v.lotes_zerados,
         v.tarifa, v.zeragem_rs,
         ROUND(v.lotes_operados * v.tarifa, 2), ROUND(v.lotes_zerados * v.zeragem_rs, 2), v.pontos, v.nome_cliente
  FROM public.v_lotes v
  WHERE v.corretora = p_corretora AND v.cliente_id = p_cliente_id AND public.acesso_ok()
  ORDER BY v.data DESC, v.ativo
  LIMIT p_limit;
$$;

-- Resumo por ativo do cliente (todo o histórico)
DROP FUNCTION IF EXISTS public.cliente_por_ativo(text, uuid);
CREATE OR REPLACE FUNCTION public.cliente_por_ativo(p_corretora text, p_cliente_id uuid)
RETURNS TABLE(ativo text, lotes numeric, zerados numeric, receita numeric, operacoes integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(v.ativo, '—'), SUM(v.lotes_operados), SUM(v.lotes_zerados), ROUND(SUM(v.receita), 2), COUNT(*)::integer
  FROM public.v_lotes v
  WHERE v.corretora = p_corretora AND v.cliente_id = p_cliente_id AND public.acesso_ok()
  GROUP BY v.ativo ORDER BY 2 DESC;
$$;

-- ---------------------------------------------
-- 10. Incentivo (bônus pago pela corretora) — antes do painel, que o usa
-- ---------------------------------------------
DROP FUNCTION IF EXISTS public.incentivo_mes(text, date);
CREATE OR REPLACE FUNCTION public.incentivo_mes(p_corretora text, p_mes_ref date DEFAULT NULL)
RETURNS TABLE(
  chave text, nome text, cliente_id uuid, contas integer, lotes numeric, pontos numeric,
  pontos_win numeric, pontos_wdo numeric, pontos_dol numeric, pontos_outros numeric,
  faixa_min numeric, valor_incentivo numeric, proxima_faixa numeric, pontos_faltantes numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS (SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref),
  pts AS (
    SELECT v.chave_incentivo AS chave,
           MAX(v.cliente_nome) AS nome,
           MAX(v.cliente_id::text)::uuid AS cliente_id,
           COUNT(DISTINCT v.conta)::integer AS contas,
           SUM(v.lotes_operados) AS lotes,
           SUM(v.pontos) AS pontos,
           SUM(v.pontos) FILTER (WHERE v.produto = 'WIN') AS p_win,
           SUM(v.pontos) FILTER (WHERE v.produto = 'WDO') AS p_wdo,
           SUM(v.pontos) FILTER (WHERE v.produto = 'DOL') AS p_dol,
           SUM(v.pontos) FILTER (WHERE COALESCE(v.produto, '') NOT IN ('WIN', 'WDO', 'DOL')) AS p_out
    FROM public.v_lotes v, cfg
    WHERE v.corretora = p_corretora AND v.mes_ref = cfg.mes_ref AND public.acesso_ok()
    GROUP BY v.chave_incentivo
    HAVING SUM(v.lotes_operados) > 0
  )
  SELECT p.chave, p.nome, p.cliente_id, p.contas, p.lotes, ROUND(p.pontos, 0),
         COALESCE(p.p_win, 0), COALESCE(p.p_wdo, 0), COALESCE(p.p_dol, 0), COALESCE(p.p_out, 0),
         COALESCE(fa.pontos_min, 0), COALESCE(fa.valor, 0),
         fp.pontos_min, CASE WHEN fp.pontos_min IS NULL THEN NULL ELSE ROUND(fp.pontos_min - p.pontos, 0) END
  FROM pts p
  LEFT JOIN LATERAL (
    SELECT f.pontos_min, f.valor FROM public.faixas_incentivo f
    WHERE f.corretora = p_corretora AND p.pontos > f.pontos_min ORDER BY f.pontos_min DESC LIMIT 1
  ) fa ON true
  LEFT JOIN LATERAL (
    SELECT f.pontos_min FROM public.faixas_incentivo f
    WHERE f.corretora = p_corretora AND p.pontos <= f.pontos_min ORDER BY f.pontos_min ASC LIMIT 1
  ) fp ON true
  ORDER BY p.pontos DESC;
$$;

DROP FUNCTION IF EXISTS public.incentivo_historico(text, date, integer);
CREATE OR REPLACE FUNCTION public.incentivo_historico(p_corretora text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(mes_ref date, pontos numeric, clientes_pontuando integer, clientes_com_faixa integer, incentivo numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS (SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref),
  meses AS (
    SELECT (cfg.mes_ref - (n || ' months')::interval)::date AS mes_ref
    FROM cfg, generate_series(0, GREATEST(p_meses, 1) - 1) AS n
  )
  SELECT m.mes_ref,
         COALESCE(SUM(i.pontos), 0),
         COUNT(*) FILTER (WHERE i.pontos > 0)::integer,
         COUNT(*) FILTER (WHERE i.valor_incentivo > 0)::integer,
         COALESCE(SUM(i.valor_incentivo), 0)
  FROM meses m
  LEFT JOIN LATERAL (SELECT * FROM public.incentivo_mes(p_corretora, m.mes_ref)) i ON true
  GROUP BY m.mes_ref ORDER BY m.mes_ref;
$$;

-- ---------------------------------------------
-- 11. Painel
-- ---------------------------------------------
DROP FUNCTION IF EXISTS public.painel_kpis(text, date);
CREATE OR REPLACE FUNCTION public.painel_kpis(p_corretora text, p_mes_ref date DEFAULT NULL)
RETURNS TABLE(
  mes_ref date, clientes_levados integer, total_contas integer, migrados integer, em_processamento integer, recusaram integer,
  ativos_mes integer, lotes_mes numeric, zerados_mes numeric, receita_mes numeric, incentivo_mes numeric, clientes_com_faixa integer,
  migrados_sem_giro integer, inativos integer, com_alertas integer, migrados_sem_data integer, multi_conta integer,
  linhas_nao_cadastradas integer, lotes_nao_cadastrados numeric, ultima_data date
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS (SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref),
  cl AS (SELECT * FROM public.clientes_lista(p_corretora, (SELECT mes_ref FROM cfg))),
  inc AS (
    SELECT COALESCE(SUM(valor_incentivo), 0) AS total, COUNT(*) FILTER (WHERE valor_incentivo > 0)::integer AS com_faixa
    FROM public.incentivo_mes(p_corretora, (SELECT mes_ref FROM cfg))
  ),
  nc AS (
    SELECT COUNT(*)::integer AS linhas, COALESCE(SUM(CASE WHEN zeragem THEN 0 ELSE qtd END), 0) AS lotes
    FROM public.lotes WHERE corretora = p_corretora AND cliente_id IS NULL
  )
  SELECT cfg.mes_ref,
    COUNT(cl.cliente_id)::integer,
    COALESCE(SUM(cl.n_contas), 0)::integer,
    COUNT(*) FILTER (WHERE cl.status = 'Migrado')::integer,
    COUNT(*) FILTER (WHERE cl.status = 'Em processamento')::integer,
    COUNT(*) FILTER (WHERE cl.status = 'Recusou')::integer,
    COUNT(*) FILTER (WHERE cl.lotes_mes > 0)::integer,
    COALESCE(SUM(cl.lotes_mes), 0), COALESCE(SUM(cl.zerados_mes), 0), COALESCE(SUM(cl.receita_mes), 0),
    (SELECT total FROM inc), (SELECT com_faixa FROM inc),
    COUNT(*) FILTER (WHERE cl.situacao = 'Nunca girou')::integer,
    COUNT(*) FILTER (WHERE cl.situacao = 'Inativo')::integer,
    COUNT(*) FILTER (WHERE array_length(cl.alertas, 1) > 0)::integer,
    COUNT(*) FILTER (WHERE cl.status = 'Migrado' AND cl.data_migracao IS NULL)::integer,
    COUNT(*) FILTER (WHERE cl.n_contas > 1)::integer,
    (SELECT linhas FROM nc), (SELECT lotes FROM nc),
    (SELECT MAX(data) FROM public.lotes WHERE corretora = p_corretora)
  FROM cfg LEFT JOIN cl ON true
  GROUP BY cfg.mes_ref;
$$;

-- Indicadores mensais (últimos N meses até o mês de referência)
DROP FUNCTION IF EXISTS public.painel_mensal(text, date, integer);
CREATE OR REPLACE FUNCTION public.painel_mensal(p_corretora text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(
  mes_ref date, migrados_acumulados integer, novas_migracoes integer, entradas integer, clientes_ativos integer,
  lotes numeric, zerados numeric, receita_corretagem numeric, receita_zeragem numeric, receita numeric,
  incentivo numeric, clientes_pontuando integer, clientes_com_faixa integer
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS (SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref),
  meses AS (
    SELECT (cfg.mes_ref - (n || ' months')::interval)::date AS mes_ref
    FROM cfg, generate_series(0, GREATEST(p_meses, 1) - 1) AS n
  ),
  mig AS (
    SELECT ct.cliente_id, MIN(ct.data_habilitacao) AS data_migracao
    FROM public.contas ct
    WHERE ct.corretora = p_corretora AND ct.cliente_id IS NOT NULL
      AND public.status_conta(ct.corretora, ct.situacao_conta) = 'Migrado'
    GROUP BY ct.cliente_id
  ),
  ent AS (
    SELECT date_trunc('month', m.data_entrada)::date AS mes_ref, COUNT(*)::integer AS n
    FROM public.cliente_corretora m WHERE m.corretora = p_corretora AND m.data_entrada IS NOT NULL
    GROUP BY 1
  ),
  giro AS (
    SELECT v.mes_ref, COUNT(DISTINCT v.cliente_id) FILTER (WHERE v.lotes_operados > 0) AS ativos,
           SUM(v.lotes_operados) AS lotes, SUM(v.lotes_zerados) AS zerados,
           SUM(v.lotes_operados * v.tarifa) AS rc, SUM(v.lotes_zerados * v.zeragem_rs) AS rz
    FROM public.v_lotes v
    WHERE v.corretora = p_corretora AND v.mes_ref IN (SELECT mes_ref FROM meses)
    GROUP BY v.mes_ref
  ),
  inc AS (
    SELECT h.mes_ref, h.incentivo, h.clientes_pontuando, h.clientes_com_faixa
    FROM public.incentivo_historico(p_corretora, (SELECT mes_ref FROM cfg), p_meses) h
  )
  SELECT m.mes_ref,
    (SELECT COUNT(*) FROM mig WHERE mig.data_migracao < m.mes_ref + INTERVAL '1 month')::integer,
    (SELECT COUNT(*) FROM mig WHERE date_trunc('month', mig.data_migracao)::date = m.mes_ref)::integer,
    COALESCE(e.n, 0),
    COALESCE(g.ativos, 0)::integer,
    COALESCE(g.lotes, 0), COALESCE(g.zerados, 0),
    ROUND(COALESCE(g.rc, 0), 2), ROUND(COALESCE(g.rz, 0), 2), ROUND(COALESCE(g.rc, 0) + COALESCE(g.rz, 0), 2),
    COALESCE(i.incentivo, 0), COALESCE(i.clientes_pontuando, 0), COALESCE(i.clientes_com_faixa, 0)
  FROM meses m
  LEFT JOIN giro g ON g.mes_ref = m.mes_ref
  LEFT JOIN inc i ON i.mes_ref = m.mes_ref
  LEFT JOIN ent e ON e.mes_ref = m.mes_ref
  WHERE public.acesso_ok()
  ORDER BY m.mes_ref;
$$;

-- Lotes por cliente × mês (mapa de calor do painel)
DROP FUNCTION IF EXISTS public.painel_clientes_mensal(text, date, integer);
CREATE OR REPLACE FUNCTION public.painel_clientes_mensal(p_corretora text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(cliente_id uuid, cliente_nome text, responsavel text, mes_ref date, lotes numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS (SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref)
  SELECT v.cliente_id, MAX(v.cliente_nome), MAX(v.responsavel), v.mes_ref, SUM(v.lotes_operados)
  FROM public.v_lotes v, cfg
  WHERE v.corretora = p_corretora AND v.cliente_id IS NOT NULL
    AND v.mes_ref > cfg.mes_ref - (p_meses || ' months')::interval AND v.mes_ref <= cfg.mes_ref
    AND public.acesso_ok()
  GROUP BY v.cliente_id, v.mes_ref
  HAVING SUM(v.lotes_operados) > 0
  ORDER BY 1, 4;
$$;

-- Lotes de contas que não estão no cadastro de clientes
DROP FUNCTION IF EXISTS public.lotes_nao_cadastrados(text);
CREATE OR REPLACE FUNCTION public.lotes_nao_cadastrados(p_corretora text)
RETURNS TABLE(conta text, nome_cliente text, assessor_nome text, lotes numeric, linhas integer, primeira date, ultima date)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT l.conta, MAX(l.nome_cliente), MAX(l.assessor_nome), SUM(CASE WHEN l.zeragem THEN 0 ELSE l.qtd END),
         COUNT(*)::integer, MIN(l.data), MAX(l.data)
  FROM public.lotes l
  WHERE l.corretora = p_corretora AND l.cliente_id IS NULL AND public.acesso_ok()
  GROUP BY l.conta ORDER BY 4 DESC;
$$;

-- Migrações (1ª conta migrada do cliente) e entradas por dia, com acumulado da base
DROP FUNCTION IF EXISTS public.migracoes_diarias(text, date, date);
CREATE OR REPLACE FUNCTION public.migracoes_diarias(p_corretora text, p_inicio date, p_fim date)
RETURNS TABLE(dia date, migrados integer, entradas integer, acumulado integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH mig AS (
    SELECT ct.cliente_id, MIN(ct.data_habilitacao) AS d
    FROM public.contas ct
    WHERE ct.corretora = p_corretora AND ct.cliente_id IS NOT NULL
      AND public.status_conta(ct.corretora, ct.situacao_conta) = 'Migrado'
    GROUP BY ct.cliente_id
  ),
  ent AS (
    SELECT m.data_entrada AS d FROM public.cliente_corretora m
    WHERE m.corretora = p_corretora AND m.data_entrada IS NOT NULL
  ),
  dias AS (
    SELECT d FROM mig WHERE d BETWEEN p_inicio AND p_fim
    UNION
    SELECT d FROM ent WHERE d BETWEEN p_inicio AND p_fim
  ),
  por_dia AS (
    SELECT dias.d,
      (SELECT COUNT(*) FROM mig WHERE mig.d = dias.d)::integer AS migrados,
      (SELECT COUNT(*) FROM ent WHERE ent.d = dias.d)::integer AS entradas
    FROM dias
  )
  SELECT p.d, p.migrados, p.entradas,
         ((SELECT COUNT(*) FROM mig WHERE mig.d < p_inicio) + SUM(p.migrados) OVER (ORDER BY p.d))::integer
  FROM por_dia p
  WHERE public.acesso_ok()
  ORDER BY p.d;
$$;

-- ---------------------------------------------
-- 12. Assessores
-- ---------------------------------------------
DROP FUNCTION IF EXISTS public.assessores_resumo(text, date);
CREATE OR REPLACE FUNCTION public.assessores_resumo(p_corretora text, p_mes_ref date DEFAULT NULL)
RETURNS TABLE(
  assessor_nome text, responsavel text, tarifa numeric, tipo_zeragem text,
  clientes_ativos integer, lotes numeric, zerados numeric, receita_corretagem numeric, receita_zeragem numeric, receita numeric,
  lotes_mes_anterior numeric, lotes_12m numeric, receita_12m numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS (SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref)
  SELECT COALESCE(v.assessor_nome, 'Sem assessor'),
         MAX(a.responsavel), MAX(a.corretagem), MAX(a.tipo_zeragem),
         COUNT(DISTINCT v.cliente_id) FILTER (WHERE v.mes_ref = cfg.mes_ref AND v.lotes_operados > 0)::integer,
         COALESCE(SUM(v.lotes_operados) FILTER (WHERE v.mes_ref = cfg.mes_ref), 0),
         COALESCE(SUM(v.lotes_zerados)  FILTER (WHERE v.mes_ref = cfg.mes_ref), 0),
         ROUND(COALESCE(SUM(v.lotes_operados * v.tarifa) FILTER (WHERE v.mes_ref = cfg.mes_ref), 0), 2),
         ROUND(COALESCE(SUM(v.lotes_zerados * v.zeragem_rs) FILTER (WHERE v.mes_ref = cfg.mes_ref), 0), 2),
         ROUND(COALESCE(SUM(v.receita) FILTER (WHERE v.mes_ref = cfg.mes_ref), 0), 2),
         COALESCE(SUM(v.lotes_operados) FILTER (WHERE v.mes_ref = (cfg.mes_ref - INTERVAL '1 month')::date), 0),
         COALESCE(SUM(v.lotes_operados) FILTER (WHERE v.mes_ref > cfg.mes_ref - INTERVAL '12 months' AND v.mes_ref <= cfg.mes_ref), 0),
         ROUND(COALESCE(SUM(v.receita) FILTER (WHERE v.mes_ref > cfg.mes_ref - INTERVAL '12 months' AND v.mes_ref <= cfg.mes_ref), 0), 2)
  FROM public.v_lotes v
  LEFT JOIN public.assessores a ON a.corretora = v.corretora AND a.nome_norm = v.assessor_norm
  CROSS JOIN cfg
  WHERE v.corretora = p_corretora AND v.mes_ref > cfg.mes_ref - INTERVAL '13 months' AND v.mes_ref <= cfg.mes_ref
    AND public.acesso_ok()
  GROUP BY v.assessor_nome
  ORDER BY 6 DESC;
$$;

-- Lotes e receita por mês × assessor (mapa de calor)
DROP FUNCTION IF EXISTS public.assessores_mensal(text, date, integer);
CREATE OR REPLACE FUNCTION public.assessores_mensal(p_corretora text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(mes_ref date, assessor_nome text, lotes numeric, receita numeric, clientes integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS (SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref)
  SELECT v.mes_ref, COALESCE(v.assessor_nome, 'Sem assessor'),
         SUM(v.lotes_operados), ROUND(SUM(v.receita), 2),
         COUNT(DISTINCT v.cliente_id) FILTER (WHERE v.lotes_operados > 0)::integer
  FROM public.v_lotes v, cfg
  WHERE v.corretora = p_corretora AND v.mes_ref > cfg.mes_ref - (p_meses || ' months')::interval AND v.mes_ref <= cfg.mes_ref
    AND public.acesso_ok()
  GROUP BY 1, 2 ORDER BY 1, 3 DESC;
$$;

-- Top clientes num intervalo (opcionalmente de um assessor)
DROP FUNCTION IF EXISTS public.top_clientes(text, date, date, text, integer);
CREATE OR REPLACE FUNCTION public.top_clientes(p_corretora text, p_inicio date, p_fim date, p_assessor text DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS TABLE(cliente_id uuid, cliente_nome text, assessor_nome text, responsavel text, lotes numeric, zerados numeric, receita numeric, pct_lotes numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH agg AS (
    SELECT v.cliente_id, MAX(v.cliente_nome) AS nome, MAX(v.assessor_nome) AS assessor, MAX(v.responsavel) AS resp,
           SUM(v.lotes_operados) AS lotes, SUM(v.lotes_zerados) AS zerados, SUM(v.receita) AS receita
    FROM public.v_lotes v
    WHERE v.corretora = p_corretora AND v.data BETWEEN p_inicio AND p_fim
      AND (p_assessor IS NULL OR v.assessor_norm = public.norm_texto(p_assessor))
      AND public.acesso_ok()
    GROUP BY v.cliente_id
  ),
  tot AS (SELECT NULLIF(SUM(lotes), 0) AS t FROM agg)
  SELECT a.cliente_id, a.nome, a.assessor, a.resp, a.lotes, a.zerados, ROUND(a.receita, 2),
         CASE WHEN tot.t IS NULL THEN 0 ELSE ROUND(a.lotes / tot.t * 100, 2) END
  FROM agg a, tot
  ORDER BY a.lotes DESC NULLS LAST
  LIMIT p_limit;
$$;

-- ---------------------------------------------
-- 13. Diário e plataforma
-- ---------------------------------------------
DROP FUNCTION IF EXISTS public.diario(text, date, date);
CREATE OR REPLACE FUNCTION public.diario(p_corretora text, p_inicio date, p_fim date)
RETURNS TABLE(dia date, lotes numeric, zerados numeric, clientes integer, operacoes integer, receita numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT v.data, SUM(v.lotes_operados), SUM(v.lotes_zerados),
         COUNT(DISTINCT v.cliente_id) FILTER (WHERE v.lotes_operados > 0)::integer,
         COUNT(*)::integer,
         ROUND(SUM(v.receita), 2)
  FROM public.v_lotes v
  WHERE v.corretora = p_corretora AND v.data BETWEEN p_inicio AND p_fim AND public.acesso_ok()
  GROUP BY v.data
  HAVING SUM(v.lotes_operados) > 0
  ORDER BY v.data;
$$;

DROP FUNCTION IF EXISTS public.mix_plataforma(text, date, date);
CREATE OR REPLACE FUNCTION public.mix_plataforma(p_corretora text, p_inicio date, p_fim date)
RETURNS TABLE(plataforma text, lotes numeric, zerados numeric, clientes integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(NULLIF(trim(v.plataforma), ''), 'Não informada'), SUM(v.lotes_operados), SUM(v.lotes_zerados),
         COUNT(DISTINCT v.cliente_id) FILTER (WHERE v.lotes_operados > 0)::integer
  FROM public.v_lotes v
  WHERE v.corretora = p_corretora AND v.data BETWEEN p_inicio AND p_fim AND public.acesso_ok()
  GROUP BY 1 ORDER BY 2 DESC;
$$;

-- ---------------------------------------------
-- 14. Leads e funil (um funil só para o escritório)
-- ---------------------------------------------
DROP FUNCTION IF EXISTS public.leads_lista(text);
CREATE OR REPLACE FUNCTION public.leads_lista(p_corretora_opera text DEFAULT NULL)
RETURNS TABLE(
  id uuid, corretora text, data_hora timestamptz, nome text, whatsapp text, cpf text, email text, ja_opera text,
  origem text, responsavel text, status text, tipo_status text, ultimo_contato date, data_fechamento date,
  motivo_perda text, observacoes text, cliente_id uuid, cliente_nome text, cliente_status text, cliente_corretora text, conta text,
  girou boolean, lotes_12m numeric, dias integer, alerta boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS (SELECT COALESCE(NULLIF(public.param('GERAL', 'dias_alerta_lead'), '')::integer, 7) AS dias_alerta),
  giro AS (
    SELECT v.cliente_id, SUM(v.lotes_operados) AS lotes_12m, bool_or(v.lotes_operados > 0) AS girou
    FROM public.v_lotes v
    WHERE v.cliente_id IS NOT NULL AND v.data > public.brasil_hoje() - INTERVAL '12 months'
    GROUP BY v.cliente_id
  ),
  conta_p AS (
    SELECT DISTINCT ON (ct.cliente_id) ct.cliente_id, ct.conta, ct.corretora,
           public.status_conta(ct.corretora, ct.situacao_conta) AS status
    FROM public.contas ct
    WHERE ct.cliente_id IS NOT NULL
    ORDER BY ct.cliente_id, ct.principal DESC, ct.data_habilitacao NULLS LAST
  )
  SELECT ld.id, ld.corretora, ld.data_hora, ld.nome, ld.whatsapp, ld.cpf, ld.email, ld.ja_opera,
         ld.origem, ld.responsavel, ld.status, COALESCE(sl.tipo, 'Aberto'),
         ld.ultimo_contato, ld.data_fechamento, ld.motivo_perda, ld.observacoes,
         ld.cliente_id, c.nome, cp.status, cp.corretora, cp.conta,
         COALESCE(g.girou, false), COALESCE(g.lotes_12m, 0),
         CASE WHEN COALESCE(sl.tipo, 'Aberto') = 'Fechado' AND ld.data_fechamento IS NOT NULL
              THEN (ld.data_fechamento - (ld.data_hora AT TIME ZONE 'America/Sao_Paulo')::date)
              ELSE (public.brasil_hoje() - (ld.data_hora AT TIME ZONE 'America/Sao_Paulo')::date) END,
         (COALESCE(sl.tipo, 'Aberto') = 'Aberto'
          AND (public.brasil_hoje() - COALESCE(ld.ultimo_contato, (ld.data_hora AT TIME ZONE 'America/Sao_Paulo')::date)) > cfg.dias_alerta)
  FROM public.leads ld
  CROSS JOIN cfg
  LEFT JOIN public.status_lead sl ON sl.status = ld.status
  LEFT JOIN public.clientes c ON c.id = ld.cliente_id
  LEFT JOIN conta_p cp ON cp.cliente_id = ld.cliente_id
  LEFT JOIN giro g ON g.cliente_id = ld.cliente_id
  WHERE (p_corretora_opera IS NULL OR upper(COALESCE(ld.corretora, '')) = upper(p_corretora_opera))
    AND public.acesso_ok()
  ORDER BY ld.data_hora DESC;
$$;

-- Funil mensal: recebidos, já clientes, ganhos, perdidos (por data de fechamento), safra do mês
DROP FUNCTION IF EXISTS public.funil_mensal(text, date, integer);
CREATE OR REPLACE FUNCTION public.funil_mensal(p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(
  mes_ref date, recebidos integer, ja_clientes integer, ganhos integer, perdidos integer,
  safra_ganhos integer, safra_perdidos integer, safra_abertos integer, abertos_acumulado integer, dias_fechar numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS (SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref),
  meses AS (
    SELECT (cfg.mes_ref - (n || ' months')::interval)::date AS mes_ref
    FROM cfg, generate_series(0, GREATEST(p_meses, 1) - 1) AS n
  ),
  l AS (
    SELECT ld.*, COALESCE(sl.tipo, 'Aberto') AS tipo,
           date_trunc('month', (ld.data_hora AT TIME ZONE 'America/Sao_Paulo'))::date AS mes_lead,
           (ld.data_hora AT TIME ZONE 'America/Sao_Paulo')::date AS dia_lead,
           date_trunc('month', ld.data_fechamento)::date AS mes_fech
    FROM public.leads ld LEFT JOIN public.status_lead sl ON sl.status = ld.status
  )
  SELECT m.mes_ref,
    (SELECT COUNT(*) FROM l WHERE l.mes_lead = m.mes_ref)::integer,
    (SELECT COUNT(*) FROM l WHERE l.mes_lead = m.mes_ref AND l.cliente_id IS NOT NULL)::integer,
    (SELECT COUNT(*) FROM l WHERE l.mes_fech = m.mes_ref AND l.status = 'Ganho')::integer,
    (SELECT COUNT(*) FROM l WHERE l.mes_fech = m.mes_ref AND l.status = 'Perdido')::integer,
    (SELECT COUNT(*) FROM l WHERE l.mes_lead = m.mes_ref AND l.status = 'Ganho')::integer,
    (SELECT COUNT(*) FROM l WHERE l.mes_lead = m.mes_ref AND l.status = 'Perdido')::integer,
    (SELECT COUNT(*) FROM l WHERE l.mes_lead = m.mes_ref AND l.tipo = 'Aberto')::integer,
    (SELECT COUNT(*) FROM l WHERE l.mes_lead <= m.mes_ref
        AND NOT (l.tipo = 'Fechado' AND l.data_fechamento IS NOT NULL AND l.mes_fech <= m.mes_ref))::integer,
    (SELECT ROUND(AVG(l.data_fechamento - l.dia_lead), 1) FROM l WHERE l.mes_fech = m.mes_ref AND l.tipo = 'Fechado' AND l.data_fechamento IS NOT NULL)
  FROM meses m
  WHERE public.acesso_ok()
  ORDER BY m.mes_ref;
$$;

-- Funil por responsável ou por origem (na janela)
DROP FUNCTION IF EXISTS public.funil_por(text, text, date, integer);
CREATE OR REPLACE FUNCTION public.funil_por(p_campo text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(grupo text, leads integer, ja_clientes integer, abertos integer, ganhos integer, perdidos integer,
              taxa_ganho numeric, conversao numeric, dias_fechar numeric, com_alerta integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS (SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref),
  l AS (
    SELECT ll.*,
      CASE WHEN p_campo = 'origem' THEN COALESCE(NULLIF(ll.origem, ''), 'Sem origem')
           WHEN p_campo = 'corretora' THEN COALESCE(NULLIF(ll.corretora, ''), 'Não informada')
           WHEN p_campo = 'status' THEN ll.status
           ELSE COALESCE(NULLIF(ll.responsavel, ''), 'Sem responsável') END AS grupo
    FROM public.leads_lista(NULL) ll, cfg
    WHERE (ll.data_hora AT TIME ZONE 'America/Sao_Paulo')::date >= (cfg.mes_ref - ((GREATEST(p_meses, 1) - 1) || ' months')::interval)::date
      AND (ll.data_hora AT TIME ZONE 'America/Sao_Paulo')::date < (cfg.mes_ref + INTERVAL '1 month')::date
  )
  SELECT l.grupo, COUNT(*)::integer,
         COUNT(*) FILTER (WHERE l.cliente_id IS NOT NULL)::integer,
         COUNT(*) FILTER (WHERE l.tipo_status = 'Aberto')::integer,
         COUNT(*) FILTER (WHERE l.status = 'Ganho')::integer,
         COUNT(*) FILTER (WHERE l.status = 'Perdido')::integer,
         CASE WHEN COUNT(*) FILTER (WHERE l.tipo_status = 'Fechado') > 0
              THEN ROUND(COUNT(*) FILTER (WHERE l.status = 'Ganho')::numeric / COUNT(*) FILTER (WHERE l.tipo_status = 'Fechado') * 100, 1) ELSE 0 END,
         ROUND(COUNT(*) FILTER (WHERE l.status = 'Ganho')::numeric / NULLIF(COUNT(*), 0) * 100, 1),
         ROUND(AVG(l.dias) FILTER (WHERE l.tipo_status = 'Fechado'), 1),
         COUNT(*) FILTER (WHERE l.alerta)::integer
  FROM l
  GROUP BY l.grupo ORDER BY 2 DESC;
$$;

-- ---------------------------------------------
-- 15. Permissões das funções
-- ---------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('acesso_ok', 'brasil_hoje', 'norm_texto', 'so_digitos', 'produto_de', 'param', 'status_conta',
        'tarifa_vigente', 'mes_referencia', 'vincular_lotes', 'marcar_contas_principais', 'vincular_leads', 'recalcular_lotes',
        'importar_clientes', 'importar_lotes', 'importar_leads',
        'clientes_lista', 'situacoes_nao_mapeadas', 'assessores_nao_cadastrados', 'cliente_contas', 'cliente_mensal',
        'cliente_extrato', 'cliente_por_ativo',
        'incentivo_mes', 'incentivo_historico',
        'painel_kpis', 'painel_mensal', 'painel_clientes_mensal', 'lotes_nao_cadastrados', 'migracoes_diarias',
        'assessores_resumo', 'assessores_mensal', 'top_clientes', 'diario', 'mix_plataforma',
        'leads_lista', 'funil_mensal', 'funil_por')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;
GRANT SELECT ON public.v_lotes TO service_role;

-- Funções da versão anterior deste arquivo que não existem mais
DROP FUNCTION IF EXISTS public.zeragem_valor(text, text);
DROP FUNCTION IF EXISTS public.chave_incentivo(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.recalcular_zeragem(text);
DROP FUNCTION IF EXISTS public.painel_base_status(text);
DROP FUNCTION IF EXISTS public.painel_por_assessor(text, date);

NOTIFY pgrst, 'reload schema';

-- Conferência
SELECT 'tabelas' AS tipo, string_agg(table_name, ', ' ORDER BY table_name) AS nomes
FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
UNION ALL
SELECT 'funções', string_agg(DISTINCT p.proname, ', ' ORDER BY p.proname)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public';
