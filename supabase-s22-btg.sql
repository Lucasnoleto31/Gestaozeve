-- ============================================================================
-- S22 · BTG (e qualquer corretora com lista própria de clientes) + acesso por corretora
-- Re-runnável. Rodar depois da S21 no SQL Editor.
--
--   1. Perfis: quais corretoras cada usuário vê (profiles.corretoras; NULL = todas).
--      Aikon deixa de ver o BTG.
--   2. Clientes sem conta na corretora (lista do Notion): status, responsável e data de
--      migração manuais em cliente_corretora + view v_cliente_corretora (uma linha por
--      cliente × corretora) que as consultas passam a usar.
--   3. Lotes com CPF/CNPJ e parceiro (relatório do BTG): vínculo pelo CPF, conta criada a
--      partir do lote quando o CPF é conhecido, assessor herdado do responsável.
--   4. importar_clientes aceita Status / Responsável / Corretagem; importar_lotes aceita
--      documento / parceiro.
--   5. Parâmetros do BTG: zeragem 16, repasse (75/80/85 %), imposto 16,6 %, Delta 30 %,
--      participações 50/50, ATP Turbo Receita; Artur e Lucas como "assessores" do BTG.
--   6. receita_mensal(): série mensal desde uma data (ATP e repasse).
-- ============================================================================

-- ---------------------------------------------
-- 1. Acesso por corretora
-- ---------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS corretoras text[];
COMMENT ON COLUMN public.profiles.corretoras IS 'Corretoras que o usuário vê (GENIAL/XP/BTG). NULL = todas.';

CREATE OR REPLACE FUNCTION public.get_my_corretoras()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT corretoras FROM public.profiles WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_corretoras() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_corretoras() TO authenticated, service_role;

-- Quem edita o próprio perfil não muda o papel nem as corretoras
DROP POLICY IF EXISTS "Usuário edita próprio perfil" ON public.profiles;
CREATE POLICY "Usuário edita próprio perfil" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND role = public.get_my_role()
              AND corretoras IS NOT DISTINCT FROM public.get_my_corretoras());

-- Aikon vê Genial e XP; BTG fica com Lucas e Artur (ambos sem restrição)
UPDATE public.profiles SET corretoras = ARRAY['GENIAL', 'XP']
 WHERE nome ILIKE 'aikon%' AND corretoras IS NULL;

-- ---------------------------------------------
-- 2. Cliente × corretora: status manual (lista própria) e view unificada
-- ---------------------------------------------
ALTER TABLE public.cliente_corretora ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.cliente_corretora ADD COLUMN IF NOT EXISTS responsavel text;
ALTER TABLE public.cliente_corretora ADD COLUMN IF NOT EXISTS data_migracao date;
ALTER TABLE public.cliente_corretora DROP CONSTRAINT IF EXISTS cliente_corretora_status_check;
ALTER TABLE public.cliente_corretora ADD CONSTRAINT cliente_corretora_status_check
  CHECK (status IS NULL OR status IN ('Migrado', 'Em processamento', 'Recusou'));

-- Texto livre da lista (Migrado / Em processamento / Recusou e variações) → status do controle;
-- qualquer outra palavra pode ser mapeada em Parâmetros → Status da conta.
CREATE OR REPLACE FUNCTION public.status_manual(p_corretora text, p_texto text)
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN t IS NULL THEN NULL
    WHEN t IN ('MIGRADO', 'MIGRADA', 'MIGROU', 'ATIVA', 'ATIVO', 'CONCLUIDO', 'CONCLUIDA') THEN 'Migrado'
    WHEN t LIKE 'EM PROCESS%' OR t LIKE 'PROCESS%' OR t LIKE 'EM ANDAMENTO%' OR t IN ('PENDENTE', 'ABERTURA', 'EM ABERTURA') THEN 'Em processamento'
    WHEN t LIKE 'RECUS%' OR t LIKE 'NAO QUIS%' OR t LIKE 'DESIST%' THEN 'Recusou'
    ELSE (SELECT m.status FROM public.status_conta_mapa m WHERE m.corretora = p_corretora AND m.situacao = t)
  END
  FROM (SELECT public.norm_texto(p_texto) AS t) s;
$$;

-- Uma linha por cliente × corretora: junta as contas (export da corretora) com os campos
-- manuais (lista própria). Cliente sem conta só entra quando a lista deu um status.
DROP VIEW IF EXISTS public.v_cliente_corretora;
CREATE VIEW public.v_cliente_corretora AS
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
  COALESCE(pc.status_conta, m.status, 'Em processamento') AS status,
  COALESCE(pc.assessor_nome, m.responsavel) AS assessor_nome,
  COALESCE(pc.assessor_norm, public.norm_texto(m.responsavel)) AS assessor_norm,
  CASE WHEN COALESCE(pc.status_conta, m.status, 'Em processamento') = 'Migrado'
       THEN COALESCE(pc.data_migracao, m.data_migracao) END AS data_migracao,
  m.responsavel, m.data_entrada, m.parceiro, m.observacoes, m.motivo_recusa
FROM por_cliente pc
FULL JOIN public.cliente_corretora m ON m.corretora = pc.corretora AND m.cliente_id = pc.cliente_id
WHERE pc.cliente_id IS NOT NULL OR m.status IS NOT NULL;

GRANT SELECT ON public.v_cliente_corretora TO service_role;

-- Lista mestre de clientes (mesmas colunas da S21), agora sobre a view
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
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref,
           (COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) - INTERVAL '12 months')::date AS mes_ini,
           COALESCE(NULLIF(public.param(p_corretora, 'meses_inativo'), '')::integer, 1) AS meses_inativo,
           public.brasil_hoje() AS hoje
  ),
  base AS MATERIALIZED (
    SELECT * FROM public.v_cliente_corretora vc
    WHERE vc.corretora = p_corretora AND (p_cliente_id IS NULL OR vc.cliente_id = p_cliente_id)
  ),
  giro AS (
    SELECT v.cliente_id,
      SUM(v.lotes_operados) AS lotes_total,
      SUM(v.lotes_operados) FILTER (WHERE v.mes_ref = cfg.mes_ref) AS lotes_mes,
      SUM(v.lotes_zerados)  FILTER (WHERE v.mes_ref = cfg.mes_ref) AS zerados_mes,
      SUM(v.receita)        FILTER (WHERE v.mes_ref = cfg.mes_ref) AS receita_mes,
      SUM(v.lotes_operados * v.tarifa)    FILTER (WHERE v.mes_ref = cfg.mes_ref) AS rc_mes,
      SUM(v.lotes_zerados * v.zeragem_rs) FILTER (WHERE v.mes_ref = cfg.mes_ref) AS rz_mes,
      SUM(v.lotes_operados) FILTER (WHERE v.mes_ref > cfg.mes_ini AND v.mes_ref <= cfg.mes_ref) AS lotes_12m,
      SUM(v.receita)        FILTER (WHERE v.mes_ref > cfg.mes_ini AND v.mes_ref <= cfg.mes_ref) AS receita_12m,
      MAX(v.data)    FILTER (WHERE v.lotes_operados > 0 AND v.mes_ref <= cfg.mes_ref) AS ultimo_giro,
      MAX(v.mes_ref) FILTER (WHERE v.lotes_operados > 0 AND v.mes_ref <= cfg.mes_ref) AS ultimo_mes_giro
    FROM public.v_lotes v CROSS JOIN cfg
    WHERE v.corretora = p_corretora AND v.cliente_id IS NOT NULL
      AND (p_cliente_id IS NULL OR v.cliente_id = p_cliente_id)
    GROUP BY v.cliente_id
  )
  SELECT
    c.id, c.nome, c.documento, c.telefone, c.email, c.uf, c.perfil, c.tipo_pessoa,
    b.n_contas, b.conta_principal, b.status, b.situacao_conta,
    b.assessor_nome, COALESCE(b.responsavel, a.responsavel),
    COALESCE(tv.corretagem, a.corretagem, 0) AS tarifa,
    b.data_migracao, b.data_entrada,
    CASE WHEN b.data_migracao IS NOT NULL AND b.data_entrada IS NOT NULL THEN (b.data_migracao - b.data_entrada) END AS dias_ate_migrar,
    COALESCE(g.lotes_total, 0), COALESCE(g.lotes_mes, 0), COALESCE(g.zerados_mes, 0), ROUND(COALESCE(g.receita_mes, 0), 2),
    ROUND(COALESCE(g.rc_mes, 0), 2), ROUND(COALESCE(g.rz_mes, 0), 2),
    COALESCE(g.lotes_12m, 0), ROUND(COALESCE(g.receita_12m, 0), 2),
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
            AND COALESCE(a.tipo_zeragem, 'PADRAO') <> 'FIXA' THEN 'tarifa zero' END
    ], NULL) AS alertas,
    b.parceiro, b.observacoes, b.motivo_recusa
  FROM base b
  JOIN public.clientes c ON c.id = b.cliente_id
  CROSS JOIN cfg
  LEFT JOIN giro g ON g.cliente_id = c.id
  LEFT JOIN public.assessores a ON a.corretora = p_corretora AND a.nome_norm = b.assessor_norm
  LEFT JOIN LATERAL (
    SELECT t.corretagem FROM public.tarifas_cliente t
    WHERE t.corretora = p_corretora AND t.cliente_id = c.id AND t.vigencia <= cfg.hoje
    ORDER BY t.vigencia DESC LIMIT 1
  ) tv ON true
  WHERE public.acesso_ok()
  ORDER BY COALESCE(g.lotes_12m, 0) DESC, c.nome;
$$;

-- Contas do cliente: conta sem situação mapeada herda o status do cliente (lista própria)
CREATE OR REPLACE FUNCTION public.cliente_contas(p_corretora text, p_cliente_id uuid)
RETURNS TABLE(conta_id uuid, conta text, conta_digito text, situacao_conta text, status text, assessor_nome text, filial text,
              data_habilitacao date, principal boolean, lotes numeric, lotes_12m numeric, zerados numeric, receita numeric, ultimo_giro date)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT public.mes_referencia(p_corretora) AS mes_ref, (public.mes_referencia(p_corretora) - INTERVAL '12 months')::date AS mes_ini,
           (SELECT vc.status FROM public.v_cliente_corretora vc WHERE vc.corretora = p_corretora AND vc.cliente_id = p_cliente_id) AS status_cliente
  )
  SELECT ct.id, ct.conta, ct.conta_digito, ct.situacao_conta, COALESCE(m.status, cfg.status_cliente, 'Em processamento'),
         ct.assessor_nome, ct.filial, ct.data_habilitacao, ct.principal,
         COALESCE(SUM(v.lotes_operados), 0),
         COALESCE(SUM(v.lotes_operados) FILTER (WHERE v.mes_ref > cfg.mes_ini AND v.mes_ref <= cfg.mes_ref), 0),
         COALESCE(SUM(v.lotes_zerados), 0),
         ROUND(COALESCE(SUM(v.receita), 0), 2),
         MAX(v.data) FILTER (WHERE v.lotes_operados > 0)
  FROM public.contas ct
  CROSS JOIN cfg
  LEFT JOIN public.status_conta_mapa m ON m.corretora = ct.corretora AND m.situacao = upper(trim(COALESCE(ct.situacao_conta, '')))
  LEFT JOIN public.v_lotes v ON v.conta_id = ct.id
  WHERE ct.corretora = p_corretora AND ct.cliente_id = p_cliente_id AND public.acesso_ok()
  GROUP BY ct.id, m.status, cfg.status_cliente, cfg.mes_ref, cfg.mes_ini
  UNION ALL
  SELECT NULL, v.conta, NULL, NULL, 'Não cadastrada', MAX(v.assessor_nome), MAX(v.filial), NULL, false,
         SUM(v.lotes_operados),
         SUM(v.lotes_operados) FILTER (WHERE v.mes_ref > cfg.mes_ini AND v.mes_ref <= cfg.mes_ref),
         SUM(v.lotes_zerados), ROUND(SUM(v.receita), 2), MAX(v.data) FILTER (WHERE v.lotes_operados > 0)
  FROM public.v_lotes v CROSS JOIN cfg
  WHERE v.corretora = p_corretora AND v.cliente_id = p_cliente_id AND v.conta_id IS NULL AND public.acesso_ok()
  GROUP BY v.conta, cfg.mes_ref, cfg.mes_ini
  ORDER BY 9 DESC, 8 NULLS LAST;
$$;

-- Painel mensal: migrações contam também os clientes com status manual
CREATE OR REPLACE FUNCTION public.painel_mensal(p_corretora text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(
  mes_ref date, migrados_acumulados integer, novas_migracoes integer, entradas integer, clientes_ativos integer,
  lotes numeric, zerados numeric, receita_corretagem numeric, receita_zeragem numeric, receita numeric,
  incentivo numeric, clientes_pontuando integer, clientes_com_faixa integer
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref),
  meses AS MATERIALIZED (
    SELECT (cfg.mes_ref - (n || ' months')::interval)::date AS mes_ref
    FROM cfg, generate_series(0, GREATEST(p_meses, 1) - 1) AS n
  ),
  mig AS MATERIALIZED (
    SELECT vc.cliente_id, vc.data_migracao
    FROM public.v_cliente_corretora vc
    WHERE vc.corretora = p_corretora AND vc.status = 'Migrado' AND vc.data_migracao IS NOT NULL
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

-- Migrações e entradas por dia (gráficos)
CREATE OR REPLACE FUNCTION public.migracoes_diarias(p_corretora text, p_inicio date, p_fim date)
RETURNS TABLE(dia date, migrados integer, entradas integer, acumulado integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH mig AS MATERIALIZED (
    SELECT vc.cliente_id, vc.data_migracao AS d
    FROM public.v_cliente_corretora vc
    WHERE vc.corretora = p_corretora AND vc.status = 'Migrado' AND vc.data_migracao IS NOT NULL
  ),
  ent AS MATERIALIZED (
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

-- Leads: status do cliente vem da view (corretora onde ele está migrado primeiro)
CREATE OR REPLACE FUNCTION public.leads_lista(p_corretora_opera text DEFAULT NULL)
RETURNS TABLE(
  id uuid, corretora text, data_hora timestamptz, nome text, whatsapp text, cpf text, email text, ja_opera text,
  origem text, responsavel text, status text, tipo_status text, ultimo_contato date, data_fechamento date,
  motivo_perda text, observacoes text, cliente_id uuid, cliente_nome text, cliente_status text, cliente_corretora text, conta text,
  girou boolean, lotes_12m numeric, dias integer, alerta boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(NULLIF(public.param('GERAL', 'dias_alerta_lead'), '')::integer, 7) AS dias_alerta,
           public.brasil_hoje() AS hoje,
           (public.brasil_hoje() - INTERVAL '12 months')::date AS d_ini
  ),
  giro AS MATERIALIZED (
    SELECT v.cliente_id, SUM(v.lotes_operados) AS lotes_12m, bool_or(v.lotes_operados > 0) AS girou
    FROM public.v_lotes v CROSS JOIN cfg
    WHERE v.cliente_id IS NOT NULL AND v.data > cfg.d_ini
    GROUP BY v.cliente_id
  ),
  conta_p AS MATERIALIZED (
    SELECT DISTINCT ON (vc.cliente_id) vc.cliente_id, vc.conta_principal AS conta, vc.corretora, vc.status
    FROM public.v_cliente_corretora vc
    ORDER BY vc.cliente_id, (vc.status = 'Migrado') DESC, vc.n_contas DESC, vc.corretora
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
          AND (cfg.hoje - COALESCE(ld.ultimo_contato, (ld.data_hora AT TIME ZONE 'America/Sao_Paulo')::date)) > cfg.dias_alerta)
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

-- ---------------------------------------------
-- 3. Lotes com CPF/CNPJ e parceiro; vínculo pelo CPF
-- ---------------------------------------------
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS documento text;   -- CPF/CNPJ do relatório (só dígitos)
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS parceiro text;    -- como veio no relatório
CREATE INDEX IF NOT EXISTS lotes_documento_idx ON public.lotes (corretora, documento) WHERE documento IS NOT NULL;

-- Liga lotes a clientes/contas: conta → conta com dígito → CPF/CNPJ (cria a conta quando ela
-- só aparece nos lotes) → ID_CLIENTE → nome único. Lote sem assessor herda o responsável.
CREATE OR REPLACE FUNCTION public.vincular_lotes(p_corretora text, p_importacao_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n integer := 0; k integer;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;

  -- 1. conta sem dígito
  UPDATE public.lotes l
     SET cliente_id = ct.cliente_id, conta_id = ct.id
    FROM public.contas ct
   WHERE l.corretora = p_corretora
     AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
     AND ct.corretora = l.corretora
     AND l.conta IS NOT NULL AND ct.conta = l.conta
     AND (l.conta_id IS DISTINCT FROM ct.id OR l.cliente_id IS DISTINCT FROM ct.cliente_id);
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  -- 2. conta com dígito
  UPDATE public.lotes l
     SET cliente_id = ct.cliente_id, conta_id = ct.id
    FROM public.contas ct
   WHERE l.corretora = p_corretora
     AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
     AND ct.corretora = l.corretora
     AND l.conta IS NOT NULL AND ct.conta_digito = l.conta
     AND (l.conta_id IS DISTINCT FROM ct.id OR l.cliente_id IS DISTINCT FROM ct.cliente_id);
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  -- 3. CPF/CNPJ do relatório (BTG traz o documento em cada linha)
  UPDATE public.lotes l
     SET cliente_id = c.id
    FROM public.clientes c
   WHERE l.corretora = p_corretora
     AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
     AND l.conta_id IS NULL AND l.documento IS NOT NULL AND c.documento = l.documento
     AND l.cliente_id IS DISTINCT FROM c.id;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  -- 3b. conta que só aparece nos lotes, de um CPF conhecido → vira conta do cliente
  INSERT INTO public.contas (corretora, cliente_id, conta, assessor_nome, assessor_norm)
  SELECT DISTINCT ON (l.corretora, l.conta) l.corretora, c.id, l.conta, m.responsavel, public.norm_texto(m.responsavel)
  FROM public.lotes l
  JOIN public.clientes c ON c.documento = l.documento
  LEFT JOIN public.cliente_corretora m ON m.cliente_id = c.id AND m.corretora = l.corretora
  WHERE l.corretora = p_corretora
    AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
    AND l.conta IS NOT NULL AND l.conta_id IS NULL AND l.documento IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.contas ct WHERE ct.corretora = l.corretora AND (ct.conta = l.conta OR ct.conta_digito = l.conta))
  ORDER BY l.corretora, l.conta, l.data DESC
  ON CONFLICT (corretora, conta) DO NOTHING;
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k > 0 THEN
    UPDATE public.lotes l
       SET cliente_id = ct.cliente_id, conta_id = ct.id
      FROM public.contas ct
     WHERE l.corretora = p_corretora
       AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
       AND l.conta_id IS NULL AND l.conta IS NOT NULL
       AND ct.corretora = l.corretora AND ct.conta = l.conta;
    GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
    PERFORM public.marcar_contas_principais(p_corretora);
  END IF;

  -- 4. ID_CLIENTE da corretora
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
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  -- 5. nome do relatório: só quando é único entre os clientes desta corretora
  UPDATE public.lotes l
     SET cliente_id = m.id
    FROM (
      SELECT c.nome_norm, MIN(c.id::text)::uuid AS id
      FROM public.clientes c
      WHERE EXISTS (SELECT 1 FROM public.v_cliente_corretora vc WHERE vc.cliente_id = c.id AND vc.corretora = p_corretora)
      GROUP BY c.nome_norm HAVING COUNT(*) = 1
    ) m
   WHERE l.corretora = p_corretora
     AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
     AND l.cliente_id IS NULL AND l.nome_cliente IS NOT NULL
     AND public.norm_texto(l.nome_cliente) = m.nome_norm;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  -- 6. lote sem assessor herda o responsável do cliente (o relatório do BTG não traz assessor)
  UPDATE public.lotes l
     SET assessor_nome = m.responsavel, assessor_norm = public.norm_texto(m.responsavel)
    FROM public.cliente_corretora m
   WHERE l.corretora = p_corretora
     AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
     AND l.assessor_nome IS NULL AND l.cliente_id IS NOT NULL
     AND m.cliente_id = l.cliente_id AND m.corretora = l.corretora AND m.responsavel IS NOT NULL;

  RETURN n;
END;
$$;

-- Importação de lotes: + documento e parceiro
CREATE OR REPLACE FUNCTION public.importar_lotes(p_corretora text, p_importacao_id uuid, p_linhas jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n integer; v_modo text;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  v_modo := upper(COALESCE(NULLIF(public.param(p_corretora, 'modo_zeragem'), ''), 'ZERAGEM'));

  INSERT INTO public.lotes (corretora, importacao_id, data, conta, id_cliente, id_assessor, assessor_nome, assessor_norm,
                            filial, ativo, produto, modo, zeragem, qtd, plataforma, nome_cliente, tipo_pessoa, documento, parceiro)
  SELECT p_corretora, p_importacao_id, x.data, public.so_digitos(x.conta),
         NULLIF(trim(x.id_cliente), ''), NULLIF(trim(x.id_assessor), ''),
         NULLIF(trim(x.assessor), ''), public.norm_texto(x.assessor), NULLIF(trim(x.filial), ''),
         NULLIF(upper(trim(x.ativo)), ''), public.produto_de(x.ativo), NULLIF(upper(trim(x.modo)), ''),
         position(v_modo IN upper(COALESCE(x.modo, ''))) > 0,
         COALESCE(x.qtd, 0), NULLIF(upper(trim(x.plataforma)), ''),
         NULLIF(trim(x.nome_cliente), ''), NULLIF(trim(x.tipo_pessoa), ''),
         public.so_digitos(x.documento), NULLIF(trim(x.parceiro), '')
  FROM jsonb_to_recordset(p_linhas) AS x(
    data date, conta text, id_cliente text, id_assessor text, assessor text, filial text, ativo text, modo text,
    qtd numeric, plataforma text, nome_cliente text, tipo_pessoa text, documento text, parceiro text)
  WHERE x.data IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;

  PERFORM public.vincular_lotes(p_corretora, p_importacao_id);
  PERFORM public.recalcular_lotes(p_corretora, p_importacao_id);
  RETURN n;
END;
$$;

-- ---------------------------------------------
-- 4. Importação de clientes: + Status, Responsável, Corretagem (lista própria)
-- ---------------------------------------------
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

  -- i) campos manuais (vazio não apaga); status/data de migração só quando a lista trouxe status
  INSERT INTO public.cliente_corretora (cliente_id, corretora, data_entrada, parceiro, observacoes, motivo_recusa, status, responsavel, data_migracao)
  SELECT DISTINCT ON (t.cliente_id) t.cliente_id, p_corretora, t.data_entrada, t.parceiro, t.observacoes, t.motivo_recusa,
         t.status_manual, t.responsavel, CASE WHEN t.status_manual IS NOT NULL THEN t.data_habilitacao END
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

-- ---------------------------------------------
-- 5. Parâmetros, mapas e "assessores" do BTG
-- ---------------------------------------------
INSERT INTO public.status_conta_mapa (corretora, situacao, status) VALUES
  ('BTG', 'ATIVA', 'Migrado'), ('BTG', 'MIGRADO', 'Migrado'), ('BTG', 'EM PROCESSAMENTO', 'Em processamento'), ('BTG', 'RECUSOU', 'Recusou'),
  ('XP',  'ATIVA', 'Migrado'), ('XP',  'MIGRADO', 'Migrado'), ('XP',  'EM PROCESSAMENTO', 'Em processamento'), ('XP',  'RECUSOU', 'Recusou')
ON CONFLICT DO NOTHING;

-- No BTG a tarifa é por cliente (aba Tarifas); Artur e Lucas entram como "assessores" com
-- corretagem 0 só para a página Assessores agrupar por responsável
INSERT INTO public.assessores (corretora, nome, nome_norm, corretagem, tipo_zeragem, zeragem_fixa, responsavel)
VALUES ('BTG', 'Artur', public.norm_texto('Artur'), 0, 'PADRAO', 0, 'Artur'),
       ('BTG', 'Lucas', public.norm_texto('Lucas'), 0, 'PADRAO', 0, 'Lucas')
ON CONFLICT DO NOTHING;

UPDATE public.parametros SET valor = '16', updated_at = now()
 WHERE corretora = 'BTG' AND chave = 'zeragem_padrao' AND valor IN ('0', '15', '');

INSERT INTO public.parametros (corretora, chave, valor, descricao) VALUES
  ('BTG', 'modelo_incentivo', 'ATP', 'Modelo do incentivo: PONTOS (faixas por pontos) ou ATP (metas de comissão acumulada do BTG)'),
  ('BTG', 'repasse_faixas', '0:75;100000:80;250000:85', 'Repasse do BTG sobre o faturamento bruto, progressivo: a partir de R$:%'),
  ('BTG', 'imposto_pct', '16.6', 'Imposto sobre o repasse (%)'),
  ('BTG', 'delta_pct', '30', 'Delta sobre o valor depois do imposto (%)'),
  ('BTG', 'participacoes', 'Lucas:50;Artur:50', 'Divisão do que sobra (nome:%)'),
  ('BTG', 'atp_assinatura', '', 'ATP Turbo Receita: data de assinatura do termo (AAAA-MM-DD). Vazio = 1º mês com lotes'),
  ('BTG', 'atp_metas', '18:50000:50000:Upfront com devolução;9:110000:50000;12:200000:100000;18:500000:200000;24:900000:300000',
          'ATP Turbo Receita: prazo em meses:comissão acumulada:prêmio[:observação], uma meta por ponto e vírgula'),
  ('GENIAL', 'modelo_incentivo', 'PONTOS', 'Modelo do incentivo: PONTOS (faixas por pontos) ou ATP (metas de comissão acumulada)'),
  ('XP', 'modelo_incentivo', 'PONTOS', 'Modelo do incentivo: PONTOS (faixas por pontos) ou ATP (metas de comissão acumulada)')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------
-- 6. Série mensal de receita desde uma data (ATP Turbo e repasse)
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.receita_mensal(p_corretora text, p_inicio date DEFAULT NULL)
RETURNS TABLE(mes_ref date, lotes numeric, zerados numeric, receita_corretagem numeric, receita_zeragem numeric, receita numeric, clientes_ativos integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT v.mes_ref, SUM(v.lotes_operados), SUM(v.lotes_zerados),
         ROUND(SUM(v.lotes_operados * v.tarifa), 2), ROUND(SUM(v.lotes_zerados * v.zeragem_rs), 2), ROUND(SUM(v.receita), 2),
         COUNT(DISTINCT v.cliente_id) FILTER (WHERE v.lotes_operados > 0)::integer
  FROM public.v_lotes v
  WHERE v.corretora = p_corretora AND (p_inicio IS NULL OR v.data >= p_inicio) AND public.acesso_ok()
  GROUP BY v.mes_ref
  ORDER BY v.mes_ref;
$$;

-- ---------------------------------------------
-- Permissões e recarga do cache da API
-- ---------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('clientes_lista', 'cliente_contas', 'painel_mensal', 'migracoes_diarias', 'leads_lista',
      'vincular_lotes', 'importar_lotes', 'importar_clientes', 'receita_mensal', 'status_manual')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Conferência
SELECT nome, role, corretoras FROM public.profiles ORDER BY nome;
SELECT chave, valor FROM public.parametros WHERE corretora = 'BTG' ORDER BY chave;
SELECT corretora, COUNT(*) AS clientes, COUNT(*) FILTER (WHERE n_contas = 0) AS sem_conta FROM public.v_cliente_corretora GROUP BY corretora;
EXPLAIN (ANALYZE, SUMMARY) SELECT COUNT(*) FROM public.clientes_lista('GENIAL');
