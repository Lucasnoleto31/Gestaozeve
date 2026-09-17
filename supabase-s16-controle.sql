-- =============================================
-- ZeveAI — S16: controle de lotes completo
-- Execute no SQL Editor do Supabase DEPOIS do supabase-s15-barras.sql.
--
-- O que este arquivo faz:
--   1. Log de importações (quem importou / desfez), com carga retroativa.
--   2. Barras inferidas: linhas "Sem barra" recebem a barra que o mesmo
--      cliente (conta → CPF/CNPJ → nome) tem em outras linhas da corretora.
--      A coluna assessor_inferido marca o que foi atribuído (dá pra desfazer).
--   3. Cliente único por CPF/CNPJ: cria clientes + contas a partir dos lotes,
--      preenche contratos.cliente_id e faz contratos_conta_key contar por
--      cliente (um cliente com 3 contas em 2 corretoras = 1 cliente).
--   4. contratos_sobreposicao / contratos_chaves_com_barra: checagens da
--      importação (arquivo ou período já importado; linhas atribuíveis).
--   5. Tarifa por produto (assessor_pricing_produto) e receita_outros na
--      receita por barra (BIT, IND, DOL… deixam de valer zero).
--   6. dashboard_clientes_movimento: quem parou, quem chegou, quem voltou.
--   7. dashboard_cobertura_pregoes: dias úteis sem lotes importados.
--   8. Visão do assessor: assessor_* (só as barras do usuário logado).
--   9. Hardening + reload do PostgREST.
-- =============================================

-- ---------------------------------------------
-- 1. Log de importações
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.contratos_importacoes_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id uuid,                       -- sem FK: a importação pode já ter sido desfeita
  nome_arquivo text NOT NULL,
  corretora text,
  total_linhas integer NOT NULL DEFAULT 0,
  total_lotes_operados numeric(15,2) NOT NULL DEFAULT 0,
  acao text NOT NULL CHECK (acao IN ('importou', 'desfez')),
  usuario_id uuid,
  usuario_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contratos_importacoes_log_created_idx
  ON public.contratos_importacoes_log (created_at DESC);
ALTER TABLE public.contratos_importacoes_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin le o log" ON public.contratos_importacoes_log;
CREATE POLICY "admin le o log" ON public.contratos_importacoes_log
  FOR SELECT TO authenticated USING (public.get_my_role() = 'admin');

-- Carga retroativa: cada importação existente vira um registro "importou"
INSERT INTO public.contratos_importacoes_log
  (importacao_id, nome_arquivo, corretora, total_linhas, total_lotes_operados, acao, usuario_id, usuario_nome, created_at)
SELECT i.id, i.nome_arquivo, i.corretora, COALESCE(i.total_linhas, 0), COALESCE(i.total_lotes_operados, 0),
       'importou', i.criado_por, p.nome, COALESCE(i.created_at, now())
FROM public.contratos_importacoes i
LEFT JOIN public.profiles p ON p.id = i.criado_por
WHERE NOT EXISTS (
  SELECT 1 FROM public.contratos_importacoes_log l
  WHERE l.importacao_id = i.id AND l.acao = 'importou'
);

-- ---------------------------------------------
-- 2. Barras inferidas pelo cliente
-- ---------------------------------------------
ALTER TABLE public.contratos ADD COLUMN IF NOT EXISTS assessor_inferido boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS contratos_corretora_conta_barra_idx
  ON public.contratos (corretora, numero_conta) WHERE assessor_nome IS NOT NULL;
CREATE INDEX IF NOT EXISTS contratos_corretora_cpf_barra_idx
  ON public.contratos (corretora, cpf) WHERE assessor_nome IS NOT NULL;
CREATE INDEX IF NOT EXISTS contratos_corretora_norm_barra_idx
  ON public.contratos (corretora, (norm_barra(assessor_nome)));

-- Preenche assessor_nome das linhas sem barra com a barra da linha mais
-- próxima no tempo do mesmo cliente na mesma corretora. Só usa linhas
-- originais (assessor_inferido = false) como fonte. Devolve quantas linhas
-- atribuiu. p_importacao_id limita a uma importação (usado ao importar).
CREATE OR REPLACE FUNCTION public.contratos_inferir_barras(p_importacao_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  n1 integer := 0;
  n2 integer := 0;
  n3 integer := 0;
BEGIN
  IF NOT public.dashboard_acesso_ok() THEN
    RAISE EXCEPTION 'não autorizado';
  END IF;

  -- Passo 1: mesma conta
  WITH alvo AS (
    SELECT c.id, c.corretora, c.numero_conta, c.data
    FROM public.contratos c
    WHERE c.assessor_nome IS NULL
      AND NULLIF(TRIM(COALESCE(c.numero_conta, '')), '') IS NOT NULL
      AND (p_importacao_id IS NULL OR c.importacao_id = p_importacao_id)
  ),
  escolha AS (
    SELECT a.id, r.assessor_nome
    FROM alvo a
    CROSS JOIN LATERAL (
      SELECT c2.assessor_nome
      FROM public.contratos c2
      WHERE c2.corretora = a.corretora
        AND c2.numero_conta = a.numero_conta
        AND c2.assessor_nome IS NOT NULL
        AND c2.assessor_inferido = false
      ORDER BY ABS(c2.data - a.data), c2.data DESC
      LIMIT 1
    ) r
  )
  UPDATE public.contratos c
     SET assessor_nome = e.assessor_nome, assessor_inferido = true
    FROM escolha e
   WHERE c.id = e.id;
  GET DIAGNOSTICS n1 = ROW_COUNT;

  -- Passo 2: mesmo CPF/CNPJ (linhas que ainda ficaram sem barra)
  WITH alvo AS (
    SELECT c.id, c.corretora, COALESCE(NULLIF(TRIM(c.cpf), ''), NULLIF(TRIM(c.cnpj), '')) AS doc, c.data
    FROM public.contratos c
    WHERE c.assessor_nome IS NULL
      AND COALESCE(NULLIF(TRIM(c.cpf), ''), NULLIF(TRIM(c.cnpj), '')) IS NOT NULL
      AND (p_importacao_id IS NULL OR c.importacao_id = p_importacao_id)
  ),
  escolha AS (
    SELECT a.id, r.assessor_nome
    FROM alvo a
    CROSS JOIN LATERAL (
      SELECT c2.assessor_nome
      FROM public.contratos c2
      WHERE c2.corretora = a.corretora
        AND COALESCE(NULLIF(TRIM(c2.cpf), ''), NULLIF(TRIM(c2.cnpj), '')) = a.doc
        AND c2.assessor_nome IS NOT NULL
        AND c2.assessor_inferido = false
      ORDER BY ABS(c2.data - a.data), c2.data DESC
      LIMIT 1
    ) r
  )
  UPDATE public.contratos c
     SET assessor_nome = e.assessor_nome, assessor_inferido = true
    FROM escolha e
   WHERE c.id = e.id;
  GET DIAGNOSTICS n2 = ROW_COUNT;

  -- Passo 3: mesmo nome (barra mais recente do nome na corretora)
  WITH fonte AS (
    SELECT DISTINCT ON (c2.corretora, norm_texto(c2.cliente_nome))
           c2.corretora, norm_texto(c2.cliente_nome) AS nk, c2.assessor_nome
    FROM public.contratos c2
    WHERE c2.assessor_nome IS NOT NULL
      AND c2.assessor_inferido = false
      AND c2.cliente_nome IS NOT NULL
    ORDER BY c2.corretora, norm_texto(c2.cliente_nome), c2.data DESC
  ),
  escolha AS (
    SELECT c.id, f.assessor_nome
    FROM public.contratos c
    JOIN fonte f ON f.corretora = c.corretora AND f.nk = norm_texto(c.cliente_nome)
    WHERE c.assessor_nome IS NULL
      AND c.cliente_nome IS NOT NULL
      AND (p_importacao_id IS NULL OR c.importacao_id = p_importacao_id)
  )
  UPDATE public.contratos c
     SET assessor_nome = e.assessor_nome, assessor_inferido = true
    FROM escolha e
   WHERE c.id = e.id;
  GET DIAGNOSTICS n3 = ROW_COUNT;

  RETURN n1 + n2 + n3;
END;
$$;
GRANT EXECUTE ON FUNCTION public.contratos_inferir_barras(uuid) TO authenticated, service_role;

-- Roda uma vez no histórico inteiro
SELECT public.contratos_inferir_barras(NULL) AS linhas_atribuidas;

-- ---------------------------------------------
-- 3. Cliente único por CPF/CNPJ
-- ---------------------------------------------
ALTER TABLE public.cliente_contas ADD COLUMN IF NOT EXISTS corretora text;
CREATE INDEX IF NOT EXISTS cliente_contas_numero_idx ON public.cliente_contas (numero_conta);
CREATE INDEX IF NOT EXISTS clientes_cpf_digitos_idx ON public.clientes ((regexp_replace(cpf, '\D', '', 'g')));

-- 3a. Clientes que ainda não existem (documento com 11 a 14 dígitos; nome = o mais recente nos lotes)
WITH docs AS (
  SELECT
    regexp_replace(COALESCE(NULLIF(TRIM(ct.cpf), ''), NULLIF(TRIM(ct.cnpj), '')), '\D', '', 'g') AS doc,
    ct.cliente_nome, ct.corretora, ct.data
  FROM public.contratos ct
  WHERE COALESCE(NULLIF(TRIM(ct.cpf), ''), NULLIF(TRIM(ct.cnpj), '')) IS NOT NULL
    AND NULLIF(TRIM(COALESCE(ct.cliente_nome, '')), '') IS NOT NULL
),
ultimo AS (
  SELECT DISTINCT ON (doc) doc, cliente_nome, corretora
  FROM docs
  WHERE LENGTH(doc) BETWEEN 11 AND 14
  ORDER BY doc, data DESC NULLS LAST
)
INSERT INTO public.clientes (cpf, nome, corretora_origem)
SELECT u.doc, TRIM(u.cliente_nome), u.corretora
FROM ultimo u
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes c WHERE regexp_replace(c.cpf, '\D', '', 'g') = u.doc
)
ON CONFLICT DO NOTHING;

-- 3b. Contas dos clientes (por corretora)
INSERT INTO public.cliente_contas (cliente_id, numero_conta, corretora)
SELECT DISTINCT c.id, TRIM(ct.numero_conta), ct.corretora
FROM public.contratos ct
JOIN public.clientes c
  ON regexp_replace(c.cpf, '\D', '', 'g')
   = regexp_replace(COALESCE(NULLIF(TRIM(ct.cpf), ''), NULLIF(TRIM(ct.cnpj), '')), '\D', '', 'g')
WHERE NULLIF(TRIM(COALESCE(ct.numero_conta, '')), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.cliente_contas cc
    WHERE cc.cliente_id = c.id AND cc.numero_conta = TRIM(ct.numero_conta)
  )
ON CONFLICT DO NOTHING;

-- 3c. contratos.cliente_id pelo documento…
UPDATE public.contratos ct
   SET cliente_id = c.id
  FROM public.clientes c
 WHERE ct.cliente_id IS NULL
   AND COALESCE(NULLIF(TRIM(ct.cpf), ''), NULLIF(TRIM(ct.cnpj), '')) IS NOT NULL
   AND regexp_replace(c.cpf, '\D', '', 'g')
     = regexp_replace(COALESCE(NULLIF(TRIM(ct.cpf), ''), NULLIF(TRIM(ct.cnpj), '')), '\D', '', 'g');

-- …e, sem documento, pela conta conhecida na mesma corretora
UPDATE public.contratos ct
   SET cliente_id = cc.cliente_id
  FROM public.cliente_contas cc
 WHERE ct.cliente_id IS NULL
   AND NULLIF(TRIM(COALESCE(ct.numero_conta, '')), '') IS NOT NULL
   AND cc.numero_conta = TRIM(ct.numero_conta)
   AND (cc.corretora IS NULL OR cc.corretora = ct.corretora);

-- 3d. Identidade nas agregações: cliente (quando conhecido) antes da conta
CREATE OR REPLACE FUNCTION public.contratos_conta_key(p_conta text, p_cliente_id uuid, p_nome text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(
    p_cliente_id::text,
    NULLIF(TRIM(COALESCE(p_conta, '')), ''),
    NULLIF(UPPER(TRIM(COALESCE(p_nome, ''))), ''),
    'sem_cliente'
  );
$$;
GRANT EXECUTE ON FUNCTION public.contratos_conta_key(text, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 4. Checagens da importação
-- ---------------------------------------------
-- Importações que já têm linhas no período (mesma corretora)
DROP FUNCTION IF EXISTS public.contratos_sobreposicao(text, date, date) CASCADE;
CREATE OR REPLACE FUNCTION public.contratos_sobreposicao(p_corretora text, p_inicio date, p_fim date)
RETURNS TABLE(
  importacao_id uuid,
  nome_arquivo text,
  created_at timestamptz,
  linhas integer,
  lotes_operados numeric,
  data_min date,
  data_max date
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT i.id, i.nome_arquivo, i.created_at,
         COUNT(*)::integer, COALESCE(SUM(ct.lotes_operados), 0), MIN(ct.data), MAX(ct.data)
  FROM public.contratos ct
  JOIN public.contratos_importacoes i ON i.id = ct.importacao_id
  WHERE ct.corretora = norm_corretora(p_corretora)
    AND ct.data BETWEEN p_inicio AND p_fim
    AND public.dashboard_acesso_ok()
  GROUP BY i.id, i.nome_arquivo, i.created_at
  ORDER BY i.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.contratos_sobreposicao(text, date, date) TO authenticated, service_role;

-- Contas e documentos que já têm barra conhecida na corretora (prévia da inferência)
DROP FUNCTION IF EXISTS public.contratos_chaves_com_barra(text, text[], text[]) CASCADE;
CREATE OR REPLACE FUNCTION public.contratos_chaves_com_barra(p_corretora text, p_contas text[], p_docs text[])
RETURNS TABLE(tipo text, chave text)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT DISTINCT 'conta'::text, ct.numero_conta
  FROM public.contratos ct
  WHERE ct.corretora = norm_corretora(p_corretora)
    AND ct.assessor_nome IS NOT NULL AND ct.assessor_inferido = false
    AND ct.numero_conta = ANY(COALESCE(p_contas, ARRAY[]::text[]))
    AND public.dashboard_acesso_ok()
  UNION
  SELECT DISTINCT 'doc'::text, COALESCE(NULLIF(TRIM(ct.cpf), ''), NULLIF(TRIM(ct.cnpj), ''))
  FROM public.contratos ct
  WHERE ct.corretora = norm_corretora(p_corretora)
    AND ct.assessor_nome IS NOT NULL AND ct.assessor_inferido = false
    AND COALESCE(NULLIF(TRIM(ct.cpf), ''), NULLIF(TRIM(ct.cnpj), '')) = ANY(COALESCE(p_docs, ARRAY[]::text[]))
    AND public.dashboard_acesso_ok();
$$;
GRANT EXECUTE ON FUNCTION public.contratos_chaves_com_barra(text, text[], text[]) TO authenticated, service_role;

-- ---------------------------------------------
-- 5. Tarifa por produto + receita_outros
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.assessor_pricing_produto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_id uuid NOT NULL REFERENCES public.assessor_pricing(id) ON DELETE CASCADE,
  produto text NOT NULL,                 -- BIT, IND, DOL, WSP… (contratos_produto)
  preco_lote numeric(10,4) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (pricing_id, produto)
);
ALTER TABLE public.assessor_pricing_produto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin gerencia tarifa por produto" ON public.assessor_pricing_produto;
CREATE POLICY "admin gerencia tarifa por produto" ON public.assessor_pricing_produto
  FOR ALL TO authenticated USING (public.get_my_role() = 'admin') WITH CHECK (public.get_my_role() = 'admin');

DROP FUNCTION IF EXISTS dashboard_contratos_receita_por_assessor(date, date, text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_receita_por_assessor(
  p_inicio date,
  p_fim date,
  p_corretora text DEFAULT NULL,
  p_barra text DEFAULT NULL,
  p_excluir_cliente text DEFAULT NULL
)
RETURNS TABLE(
  barra_nome text,
  numero text,
  preco_lote_futuros numeric,
  modelo_zeragem text,
  preco_zeragem numeric,
  lotes_operados numeric,
  lotes_zerados numeric,
  receita_operados numeric,
  receita_zeragem numeric,
  receita_total numeric,
  corretora text,
  pct_repasse numeric,
  receita_liquida numeric,
  receita_outros numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      ct.corretora,
      COALESCE(NULLIF(TRIM(ct.assessor_nome), ''), 'Sem barra') AS barra_nome,
      COALESCE(ct.cliente_id::text, ct.cliente_nome, 'sem_cliente') AS cliente_key,
      ct.data,
      COALESCE(ct.lotes_operados, 0) AS lotes_operados,
      COALESCE(ct.lotes_zerados, 0)  AS lotes_zerados,
      contratos_produto(ct.ativo) AS produto
    FROM public.contratos ct
    WHERE ct.data BETWEEN p_inicio AND p_fim
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
      AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
      AND public.dashboard_acesso_ok()
  ),
  pr AS (
    SELECT
      p.corretora,
      norm_barra(p.barra_nome) AS chave,
      p.id, p.barra_nome, p.numero,
      p.preco_lote_futuros, p.modelo_zeragem, p.preco_zeragem,
      COALESCE(p.pct_repasse_escritorio, 0.50) AS pct_repasse
    FROM public.assessor_pricing p
    WHERE p.ativo = true
  ),
  agg_barra AS (
    SELECT
      corretora,
      barra_nome,
      SUM(CASE WHEN produto IN ('WIN', 'WDO') THEN lotes_operados ELSE 0 END) AS lotes_op_futuros,
      SUM(lotes_operados) AS lotes_operados,
      SUM(lotes_zerados)  AS lotes_zerados
    FROM base
    GROUP BY 1, 2
  ),
  -- Só linhas WIN/WDO com zeragem: é o que define a faixa diária por cliente
  agg_cliente_dia AS (
    SELECT corretora, barra_nome, cliente_key, data, SUM(lotes_zerados) AS lotes_ze_dia
    FROM base
    WHERE produto IN ('WIN', 'WDO') AND lotes_zerados > 0
    GROUP BY 1, 2, 3, 4
  ),
  receita_ze_diaria AS (
    SELECT
      acd.corretora,
      acd.barra_nome,
      CASE pr.modelo_zeragem
        WHEN 'fixo'           THEN pr.preco_zeragem      * acd.lotes_ze_dia
        WHEN 'mesmo_operado'  THEN pr.preco_lote_futuros * acd.lotes_ze_dia
        WHEN 'tiered'         THEN COALESCE((
          SELECT t.preco_zeragem
          FROM public.assessor_pricing_zeragem_tier t
          WHERE t.pricing_id = pr.id
            AND acd.lotes_ze_dia >= t.volume_min
            AND (t.volume_max IS NULL OR acd.lotes_ze_dia <= t.volume_max)
          ORDER BY t.ordem
          LIMIT 1
        ), 0) * acd.lotes_ze_dia
        ELSE 0
      END AS receita_zeragem_dia
    FROM agg_cliente_dia acd
    LEFT JOIN pr ON pr.corretora = acd.corretora AND pr.chave = norm_barra(acd.barra_nome)
  ),
  receita_ze AS (
    SELECT corretora, barra_nome, COALESCE(SUM(receita_zeragem_dia), 0) AS receita_zeragem
    FROM receita_ze_diaria
    GROUP BY 1, 2
  ),
  -- Outros produtos: lotes × tarifa por produto da barra (0 se não cadastrada)
  agg_outros AS (
    SELECT b.corretora, b.barra_nome, SUM(b.lotes_operados * pp.preco_lote) AS receita_outros
    FROM base b
    JOIN pr ON pr.corretora = b.corretora AND pr.chave = norm_barra(b.barra_nome)
    JOIN public.assessor_pricing_produto pp ON pp.pricing_id = pr.id AND pp.produto = b.produto
    WHERE b.produto NOT IN ('WIN', 'WDO')
    GROUP BY 1, 2
  ),
  final AS (
    SELECT
      a.barra_nome,
      pr.numero,
      COALESCE(pr.preco_lote_futuros, 0) AS preco_lote_futuros,
      COALESCE(pr.modelo_zeragem, 'b2b') AS modelo_zeragem,
      COALESCE(pr.preco_zeragem, 0)      AS preco_zeragem,
      a.lotes_operados,
      a.lotes_zerados,
      ROUND(COALESCE(pr.preco_lote_futuros, 0) * a.lotes_op_futuros, 2) AS receita_operados,
      ROUND(COALESCE(rz.receita_zeragem, 0), 2) AS receita_zeragem,
      ROUND(COALESCE(ao.receita_outros, 0), 2)  AS receita_outros,
      a.corretora,
      COALESCE(pr.pct_repasse, 0.50) AS pct_repasse
    FROM agg_barra a
    LEFT JOIN pr ON pr.corretora = a.corretora AND pr.chave = norm_barra(a.barra_nome)
    LEFT JOIN receita_ze rz ON rz.corretora = a.corretora AND rz.barra_nome = a.barra_nome
    LEFT JOIN agg_outros ao ON ao.corretora = a.corretora AND ao.barra_nome = a.barra_nome
  )
  SELECT
    f.barra_nome,
    f.numero,
    f.preco_lote_futuros,
    f.modelo_zeragem,
    f.preco_zeragem,
    f.lotes_operados,
    f.lotes_zerados,
    f.receita_operados,
    f.receita_zeragem,
    (f.receita_operados + f.receita_zeragem + f.receita_outros) AS receita_total,
    f.corretora,
    f.pct_repasse,
    ROUND((f.receita_operados + f.receita_zeragem + f.receita_outros) * f.pct_repasse, 2) AS receita_liquida,
    f.receita_outros
  FROM final f
  ORDER BY (f.receita_operados + f.receita_zeragem + f.receita_outros) DESC NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_receita_por_assessor(date, date, text, text, text) TO authenticated, service_role;

-- Dependentes recriados (a saída da função acima ganhou receita_outros)
DROP FUNCTION IF EXISTS dashboard_contratos_receita_total(date, date, text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION dashboard_contratos_receita_total(
  p_inicio date, p_fim date,
  p_corretora text DEFAULT NULL, p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL
)
RETURNS TABLE(
  receita_operados numeric,
  receita_zeragem numeric,
  receita_total numeric,
  num_barras integer,
  num_barras_sem_pricing integer,
  receita_outros numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    COALESCE(SUM(r.receita_operados), 0),
    COALESCE(SUM(r.receita_zeragem),  0),
    COALESCE(SUM(r.receita_total),    0),
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE r.preco_lote_futuros = 0 AND r.modelo_zeragem = 'b2b')::integer,
    COALESCE(SUM(r.receita_outros),   0)
  FROM dashboard_contratos_receita_por_assessor(p_inicio, p_fim, p_corretora, p_barra, p_excluir_cliente) r;
$$;
GRANT EXECUTE ON FUNCTION dashboard_contratos_receita_total(date, date, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION dashboard_receita_bruta_liquida(
  p_inicio date, p_fim date,
  p_corretora text DEFAULT NULL, p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL
)
RETURNS TABLE(
  receita_bruta numeric,
  receita_liquida numeric,
  pct_repasse_medio numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    COALESCE(SUM(r.receita_total), 0) AS receita_bruta,
    COALESCE(SUM(r.receita_liquida), 0) AS receita_liquida,
    CASE WHEN SUM(r.receita_total) > 0
      THEN ROUND(SUM(r.receita_liquida) / SUM(r.receita_total) * 100, 2)
      ELSE 0 END AS pct_repasse_medio
  FROM dashboard_contratos_receita_por_assessor(p_inicio, p_fim, p_corretora, p_barra, p_excluir_cliente) r;
$$;
GRANT EXECUTE ON FUNCTION dashboard_receita_bruta_liquida(date, date, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 6. Visão do assessor — quem é o usuário e quais barras são dele
--    (definido antes do movimento de clientes, que usa estas funções)
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.assessor_acesso_ok()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT public.dashboard_acesso_ok() OR public.get_my_role() IN ('admin', 'vendedor');
$$;
GRANT EXECUTE ON FUNCTION public.assessor_acesso_ok() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.assessor_minhas_barras() CASCADE;
CREATE OR REPLACE FUNCTION public.assessor_minhas_barras()
RETURNS TABLE(corretora text, barra_nome text, chave text)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT b.corretora::text, b.nome, norm_barra(b.nome)
  FROM public.barras b
  JOIN public.profiles p ON p.id = b.assessor_id
  WHERE p.user_id = auth.uid()
    AND public.assessor_acesso_ok()
  ORDER BY b.corretora, b.nome;
$$;
GRANT EXECUTE ON FUNCTION public.assessor_minhas_barras() TO authenticated, service_role;

-- ---------------------------------------------
-- 6b. Movimento de clientes: parou / novo / voltou
-- ---------------------------------------------
-- Implementação compartilhada. p_escopo = lista 'CORRETORA|barra normalizada'
-- que limita as barras (visão do assessor); NULL = tudo. Quem não é admin
-- só passa se p_escopo estiver dentro das próprias barras.
DROP FUNCTION IF EXISTS public.dashboard_clientes_movimento_impl(date, date, date, date, text, text, text, text[]) CASCADE;
CREATE OR REPLACE FUNCTION public.dashboard_clientes_movimento_impl(
  p_inicio date, p_fim date, p_inicio_anterior date, p_fim_anterior date,
  p_corretora text, p_barra text, p_excluir_cliente text, p_escopo text[]
)
RETURNS TABLE(
  tipo text,
  cliente_key text,
  cliente_nome text,
  conta text,
  documento text,
  corretora text,
  barra_nome text,
  lotes_atual numeric,
  lotes_anterior numeric,
  primeira_operacao date,
  ultima_operacao date,
  dias_sem_operar integer
)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH permitido AS (
    SELECT public.dashboard_acesso_ok()
        OR (p_escopo IS NOT NULL AND p_escopo <@ COALESCE(
              (SELECT array_agg(mb.corretora || '|' || mb.chave) FROM public.assessor_minhas_barras() mb),
              ARRAY[]::text[])) AS ok
  ),
  filt AS (
    SELECT
      contratos_conta_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome) AS k,
      ct.corretora, ct.assessor_nome, ct.cliente_nome, ct.numero_conta,
      COALESCE(NULLIF(TRIM(ct.cpf), ''), NULLIF(TRIM(ct.cnpj), '')) AS doc,
      ct.data, COALESCE(ct.lotes_operados, 0) AS lotes
    FROM public.contratos ct, permitido pm
    WHERE pm.ok
      AND ct.data BETWEEN LEAST(p_inicio, p_inicio_anterior) AND GREATEST(p_fim, p_fim_anterior)
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_barra IS NULL OR norm_barra(ct.assessor_nome) = norm_barra(p_barra))
      AND (p_excluir_cliente IS NULL OR norm_texto(ct.cliente_nome) <> norm_texto(p_excluir_cliente))
      AND (p_escopo IS NULL OR (ct.corretora || '|' || norm_barra(ct.assessor_nome)) = ANY(p_escopo))
  ),
  atual AS (
    SELECT k, SUM(lotes) AS lotes, MAX(assessor_nome) AS barra, MAX(corretora) AS corretora,
           MAX(cliente_nome) AS nome, MAX(numero_conta) AS conta, MAX(doc) AS doc
    FROM filt
    WHERE data BETWEEN p_inicio AND p_fim AND lotes > 0
    GROUP BY k
  ),
  anterior AS (
    SELECT k, SUM(lotes) AS lotes, MAX(assessor_nome) AS barra, MAX(corretora) AS corretora,
           MAX(cliente_nome) AS nome, MAX(numero_conta) AS conta, MAX(doc) AS doc
    FROM filt
    WHERE data BETWEEN p_inicio_anterior AND p_fim_anterior AND lotes > 0
    GROUP BY k
  ),
  -- Primeira e última operação no histórico inteiro (não só no período)
  hist AS (
    SELECT contratos_conta_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome) AS k,
           MIN(ct.data) AS primeira, MAX(ct.data) AS ultima
    FROM public.contratos ct, permitido pm
    WHERE pm.ok
      AND COALESCE(ct.lotes_operados, 0) > 0
      AND (norm_corretora(p_corretora) IS NULL OR ct.corretora = norm_corretora(p_corretora))
      AND (p_escopo IS NULL OR (ct.corretora || '|' || norm_barra(ct.assessor_nome)) = ANY(p_escopo))
    GROUP BY 1
  )
  SELECT 'parou'::text, an.k, COALESCE(an.nome, 'Sem cliente'), an.conta, an.doc, an.corretora,
         COALESCE(an.barra, 'Sem barra'), 0::numeric, an.lotes, h.primeira, h.ultima,
         (p_fim - h.ultima)::integer
  FROM anterior an
  LEFT JOIN atual a ON a.k = an.k
  LEFT JOIN hist h ON h.k = an.k
  WHERE a.k IS NULL
  UNION ALL
  SELECT CASE WHEN h.primeira >= p_inicio THEN 'novo' ELSE 'voltou' END, a.k, COALESCE(a.nome, 'Sem cliente'),
         a.conta, a.doc, a.corretora, COALESCE(a.barra, 'Sem barra'), a.lotes, 0::numeric,
         h.primeira, h.ultima, (p_fim - h.ultima)::integer
  FROM atual a
  LEFT JOIN anterior an ON an.k = a.k
  LEFT JOIN hist h ON h.k = a.k
  WHERE an.k IS NULL
  ORDER BY 1, 9 DESC, 8 DESC;
$$;
GRANT EXECUTE ON FUNCTION public.dashboard_clientes_movimento_impl(date, date, date, date, text, text, text, text[]) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.dashboard_clientes_movimento(date, date, date, date, text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION public.dashboard_clientes_movimento(
  p_inicio date, p_fim date, p_inicio_anterior date, p_fim_anterior date,
  p_corretora text DEFAULT NULL, p_barra text DEFAULT NULL, p_excluir_cliente text DEFAULT NULL
)
RETURNS TABLE(
  tipo text, cliente_key text, cliente_nome text, conta text, documento text, corretora text,
  barra_nome text, lotes_atual numeric, lotes_anterior numeric,
  primeira_operacao date, ultima_operacao date, dias_sem_operar integer
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT * FROM public.dashboard_clientes_movimento_impl(
    p_inicio, p_fim, p_inicio_anterior, p_fim_anterior, p_corretora, p_barra, p_excluir_cliente, NULL);
$$;
GRANT EXECUTE ON FUNCTION public.dashboard_clientes_movimento(date, date, date, date, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------
-- 7. Cobertura de pregões (dias úteis sem lotes)
-- ---------------------------------------------
DROP FUNCTION IF EXISTS public.dashboard_cobertura_pregoes(integer) CASCADE;
CREATE OR REPLACE FUNCTION public.dashboard_cobertura_pregoes(p_dias integer DEFAULT 60)
RETURNS TABLE(dia date, corretora text, linhas integer, lotes_operados numeric)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH dias AS (
    SELECT d::date AS dia
    FROM generate_series(public.brasil_hoje() - (GREATEST(p_dias, 1) - 1), public.brasil_hoje(), interval '1 day') d
    WHERE EXTRACT(ISODOW FROM d) < 6
  ),
  corrs AS (
    SELECT DISTINCT ct.corretora FROM public.contratos ct WHERE public.dashboard_acesso_ok()
  ),
  agg AS (
    SELECT ct.data, ct.corretora, COUNT(*)::integer AS linhas, COALESCE(SUM(ct.lotes_operados), 0) AS lotes
    FROM public.contratos ct
    WHERE ct.data >= public.brasil_hoje() - (GREATEST(p_dias, 1) - 1)
      AND public.dashboard_acesso_ok()
    GROUP BY 1, 2
  )
  SELECT d.dia, c.corretora, COALESCE(a.linhas, 0), COALESCE(a.lotes, 0)
  FROM dias d
  CROSS JOIN corrs c
  LEFT JOIN agg a ON a.data = d.dia AND a.corretora = c.corretora
  ORDER BY d.dia, c.corretora;
$$;
GRANT EXECUTE ON FUNCTION public.dashboard_cobertura_pregoes(integer) TO authenticated, service_role;

-- ---------------------------------------------
-- 8. Visão do assessor — consultas (só as barras do usuário logado)
-- ---------------------------------------------
DROP FUNCTION IF EXISTS public.assessor_resumo(date, date) CASCADE;
CREATE OR REPLACE FUNCTION public.assessor_resumo(p_inicio date, p_fim date)
RETURNS TABLE(
  corretora text, barra_nome text,
  lotes_operados numeric, lotes_zerados numeric, num_clientes integer, num_dias integer
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT mb.corretora, mb.barra_nome,
         COALESCE(SUM(ct.lotes_operados), 0),
         COALESCE(SUM(ct.lotes_zerados), 0),
         COUNT(DISTINCT contratos_conta_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome))
           FILTER (WHERE COALESCE(ct.lotes_operados, 0) > 0)::integer,
         COUNT(DISTINCT ct.data)::integer
  FROM public.assessor_minhas_barras() mb
  LEFT JOIN public.contratos ct
    ON ct.corretora = mb.corretora
   AND norm_barra(ct.assessor_nome) = mb.chave
   AND ct.data BETWEEN p_inicio AND p_fim
  GROUP BY mb.corretora, mb.barra_nome
  ORDER BY 3 DESC;
$$;
GRANT EXECUTE ON FUNCTION public.assessor_resumo(date, date) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.assessor_evolucao_mensal() CASCADE;
CREATE OR REPLACE FUNCTION public.assessor_evolucao_mensal()
RETURNS TABLE(mes_data date, lotes_operados numeric, lotes_zerados numeric, num_clientes integer)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT date_trunc('month', ct.data)::date,
         COALESCE(SUM(ct.lotes_operados), 0),
         COALESCE(SUM(ct.lotes_zerados), 0),
         COUNT(DISTINCT contratos_conta_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome))
           FILTER (WHERE COALESCE(ct.lotes_operados, 0) > 0)::integer
  FROM public.contratos ct
  JOIN public.assessor_minhas_barras() mb
    ON mb.corretora = ct.corretora AND mb.chave = norm_barra(ct.assessor_nome)
  WHERE ct.data >= (date_trunc('month', public.brasil_hoje()) - INTERVAL '11 months')::date
  GROUP BY 1
  ORDER BY 1;
$$;
GRANT EXECUTE ON FUNCTION public.assessor_evolucao_mensal() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.assessor_top_clientes(date, date, integer) CASCADE;
CREATE OR REPLACE FUNCTION public.assessor_top_clientes(p_inicio date, p_fim date, p_limit integer DEFAULT 15)
RETURNS TABLE(
  cliente_nome text, conta text, corretora text, barra_nome text,
  lotes_operados numeric, lotes_zerados numeric
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT COALESCE(MAX(ct.cliente_nome), 'Sem cliente'), MAX(ct.numero_conta), MAX(ct.corretora), MAX(mb.barra_nome),
         SUM(COALESCE(ct.lotes_operados, 0)), SUM(COALESCE(ct.lotes_zerados, 0))
  FROM public.contratos ct
  JOIN public.assessor_minhas_barras() mb
    ON mb.corretora = ct.corretora AND mb.chave = norm_barra(ct.assessor_nome)
  WHERE ct.data BETWEEN p_inicio AND p_fim
  GROUP BY contratos_conta_key(ct.numero_conta, ct.cliente_id, ct.cliente_nome)
  HAVING SUM(COALESCE(ct.lotes_operados, 0)) > 0
  ORDER BY 5 DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.assessor_top_clientes(date, date, integer) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.assessor_clientes_movimento(date, date, date, date) CASCADE;
CREATE OR REPLACE FUNCTION public.assessor_clientes_movimento(
  p_inicio date, p_fim date, p_inicio_anterior date, p_fim_anterior date
)
RETURNS TABLE(
  tipo text, cliente_key text, cliente_nome text, conta text, documento text, corretora text,
  barra_nome text, lotes_atual numeric, lotes_anterior numeric,
  primeira_operacao date, ultima_operacao date, dias_sem_operar integer
)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT * FROM public.dashboard_clientes_movimento_impl(
    p_inicio, p_fim, p_inicio_anterior, p_fim_anterior, NULL, NULL, NULL,
    (SELECT COALESCE(array_agg(mb.corretora || '|' || mb.chave), ARRAY[]::text[]) FROM public.assessor_minhas_barras() mb));
$$;
GRANT EXECUTE ON FUNCTION public.assessor_clientes_movimento(date, date, date, date) TO authenticated, service_role;

-- ---------------------------------------------
-- 9. Hardening + reload
-- ---------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE 'dashboard\_%' OR p.proname LIKE 'assessor\_%' OR p.proname LIKE 'contratos\_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
