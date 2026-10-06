-- =============================================
-- ZeveAI — S21: desempenho das funções de leitura. Rode DEPOIS da S20.
--
-- Problema: o mês de referência (mes_referencia), parâmetros (param) e o
-- status da conta (status_conta) eram recalculados linha a linha — 31 mil
-- vezes em assessores_resumo (8 s) e leads_lista (3 s), estourando o tempo
-- máximo de 8 s da API. Agora o mês/parâmetros ficam numa CTE MATERIALIZED
-- (calculada uma vez) e o status vem de um JOIN direto no mapa.
-- Mesmas assinaturas e colunas: o app não muda.
-- =============================================

-- ---------------------------------------------
-- Clientes
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
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref,
           (COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) - INTERVAL '12 months')::date AS mes_ini,
           COALESCE(NULLIF(public.param(p_corretora, 'meses_inativo'), '')::integer, 1) AS meses_inativo,
           public.brasil_hoje() AS hoje
  ),
  contas_s AS (
    SELECT ct.*, COALESCE(m.status, 'Em processamento') AS st
    FROM public.contas ct
    LEFT JOIN public.status_conta_mapa m ON m.corretora = ct.corretora AND m.situacao = upper(trim(COALESCE(ct.situacao_conta, '')))
    WHERE ct.corretora = p_corretora AND ct.cliente_id IS NOT NULL
      AND (p_cliente_id IS NULL OR ct.cliente_id = p_cliente_id)
  ),
  contas_c AS (
    SELECT ct.cliente_id,
      COUNT(*)::integer AS n_contas,
      MAX(ct.conta) FILTER (WHERE ct.principal) AS conta_principal,
      MAX(ct.situacao_conta) FILTER (WHERE ct.principal) AS situacao_conta,
      MAX(ct.st) FILTER (WHERE ct.principal) AS status,
      MAX(ct.assessor_nome) FILTER (WHERE ct.principal) AS assessor_nome,
      MAX(ct.assessor_norm) FILTER (WHERE ct.principal) AS assessor_norm,
      MIN(ct.data_habilitacao) FILTER (WHERE ct.st = 'Migrado') AS data_migracao
    FROM contas_s ct
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
    cc.n_contas, cc.conta_principal, COALESCE(cc.status, 'Em processamento'), cc.situacao_conta,
    cc.assessor_nome, a.responsavel,
    COALESCE(tv.corretagem, a.corretagem, 0) AS tarifa,
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
  CROSS JOIN cfg
  LEFT JOIN giro g ON g.cliente_id = c.id
  LEFT JOIN public.cliente_corretora m ON m.cliente_id = c.id AND m.corretora = p_corretora
  LEFT JOIN public.assessores a ON a.corretora = p_corretora AND a.nome_norm = cc.assessor_norm
  LEFT JOIN LATERAL (
    SELECT t.corretagem FROM public.tarifas_cliente t
    WHERE t.corretora = p_corretora AND t.cliente_id = c.id AND t.vigencia <= cfg.hoje
    ORDER BY t.vigencia DESC LIMIT 1
  ) tv ON true
  WHERE public.acesso_ok()
  ORDER BY COALESCE(g.lotes_12m, 0) DESC, c.nome;
$$;

DROP FUNCTION IF EXISTS public.cliente_contas(text, uuid);
CREATE OR REPLACE FUNCTION public.cliente_contas(p_corretora text, p_cliente_id uuid)
RETURNS TABLE(conta_id uuid, conta text, conta_digito text, situacao_conta text, status text, assessor_nome text, filial text,
              data_habilitacao date, principal boolean, lotes numeric, lotes_12m numeric, zerados numeric, receita numeric, ultimo_giro date)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT public.mes_referencia(p_corretora) AS mes_ref, (public.mes_referencia(p_corretora) - INTERVAL '12 months')::date AS mes_ini
  )
  SELECT ct.id, ct.conta, ct.conta_digito, ct.situacao_conta, COALESCE(m.status, 'Em processamento'),
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
  GROUP BY ct.id, m.status, cfg.mes_ref, cfg.mes_ini
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

DROP FUNCTION IF EXISTS public.cliente_mensal(text, uuid, date, integer);
CREATE OR REPLACE FUNCTION public.cliente_mensal(p_corretora text, p_cliente_id uuid, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(mes_ref date, lotes numeric, zerados numeric, receita numeric, pontos numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref,
           (COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) - (p_meses || ' months')::interval)::date AS mes_ini
  )
  SELECT v.mes_ref, SUM(v.lotes_operados), SUM(v.lotes_zerados), ROUND(SUM(v.receita), 2), SUM(v.pontos)
  FROM public.v_lotes v CROSS JOIN cfg
  WHERE v.corretora = p_corretora AND v.cliente_id = p_cliente_id
    AND v.mes_ref > cfg.mes_ini AND v.mes_ref <= cfg.mes_ref
    AND public.acesso_ok()
  GROUP BY v.mes_ref ORDER BY v.mes_ref;
$$;

-- ---------------------------------------------
-- Incentivo
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
  WITH cfg AS MATERIALIZED (SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref),
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
    FROM public.v_lotes v CROSS JOIN cfg
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
  WITH cfg AS MATERIALIZED (SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref),
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
-- Painel
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
  WITH cfg AS MATERIALIZED (SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref),
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

DROP FUNCTION IF EXISTS public.painel_mensal(text, date, integer);
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
    SELECT ct.cliente_id, MIN(ct.data_habilitacao) AS data_migracao
    FROM public.contas ct
    JOIN public.status_conta_mapa m ON m.corretora = ct.corretora AND m.situacao = upper(trim(COALESCE(ct.situacao_conta, '')))
    WHERE ct.corretora = p_corretora AND ct.cliente_id IS NOT NULL AND m.status = 'Migrado'
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

DROP FUNCTION IF EXISTS public.painel_clientes_mensal(text, date, integer);
CREATE OR REPLACE FUNCTION public.painel_clientes_mensal(p_corretora text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(cliente_id uuid, cliente_nome text, responsavel text, mes_ref date, lotes numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref,
           (COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) - (p_meses || ' months')::interval)::date AS mes_ini
  )
  SELECT v.cliente_id, MAX(v.cliente_nome), MAX(v.responsavel), v.mes_ref, SUM(v.lotes_operados)
  FROM public.v_lotes v CROSS JOIN cfg
  WHERE v.corretora = p_corretora AND v.cliente_id IS NOT NULL
    AND v.mes_ref > cfg.mes_ini AND v.mes_ref <= cfg.mes_ref
    AND public.acesso_ok()
  GROUP BY v.cliente_id, v.mes_ref
  HAVING SUM(v.lotes_operados) > 0
  ORDER BY 1, 4;
$$;

DROP FUNCTION IF EXISTS public.migracoes_diarias(text, date, date);
CREATE OR REPLACE FUNCTION public.migracoes_diarias(p_corretora text, p_inicio date, p_fim date)
RETURNS TABLE(dia date, migrados integer, entradas integer, acumulado integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH mig AS MATERIALIZED (
    SELECT ct.cliente_id, MIN(ct.data_habilitacao) AS d
    FROM public.contas ct
    JOIN public.status_conta_mapa m ON m.corretora = ct.corretora AND m.situacao = upper(trim(COALESCE(ct.situacao_conta, '')))
    WHERE ct.corretora = p_corretora AND ct.cliente_id IS NOT NULL AND m.status = 'Migrado'
    GROUP BY ct.cliente_id
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

-- ---------------------------------------------
-- Assessores
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
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref,
           (COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) - INTERVAL '1 month')::date AS mes_ant,
           (COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) - INTERVAL '12 months')::date AS mes_ini,
           (COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) - INTERVAL '13 months')::date AS mes_janela
  )
  SELECT COALESCE(v.assessor_nome, 'Sem assessor'),
         MAX(a.responsavel), MAX(a.corretagem), MAX(a.tipo_zeragem),
         COUNT(DISTINCT v.cliente_id) FILTER (WHERE v.mes_ref = cfg.mes_ref AND v.lotes_operados > 0)::integer,
         COALESCE(SUM(v.lotes_operados) FILTER (WHERE v.mes_ref = cfg.mes_ref), 0),
         COALESCE(SUM(v.lotes_zerados)  FILTER (WHERE v.mes_ref = cfg.mes_ref), 0),
         ROUND(COALESCE(SUM(v.lotes_operados * v.tarifa) FILTER (WHERE v.mes_ref = cfg.mes_ref), 0), 2),
         ROUND(COALESCE(SUM(v.lotes_zerados * v.zeragem_rs) FILTER (WHERE v.mes_ref = cfg.mes_ref), 0), 2),
         ROUND(COALESCE(SUM(v.receita) FILTER (WHERE v.mes_ref = cfg.mes_ref), 0), 2),
         COALESCE(SUM(v.lotes_operados) FILTER (WHERE v.mes_ref = cfg.mes_ant), 0),
         COALESCE(SUM(v.lotes_operados) FILTER (WHERE v.mes_ref > cfg.mes_ini AND v.mes_ref <= cfg.mes_ref), 0),
         ROUND(COALESCE(SUM(v.receita) FILTER (WHERE v.mes_ref > cfg.mes_ini AND v.mes_ref <= cfg.mes_ref), 0), 2)
  FROM public.v_lotes v
  CROSS JOIN cfg
  LEFT JOIN public.assessores a ON a.corretora = v.corretora AND a.nome_norm = v.assessor_norm
  WHERE v.corretora = p_corretora AND v.mes_ref > cfg.mes_janela AND v.mes_ref <= cfg.mes_ref
    AND public.acesso_ok()
  GROUP BY v.assessor_nome
  ORDER BY 6 DESC;
$$;

DROP FUNCTION IF EXISTS public.assessores_mensal(text, date, integer);
CREATE OR REPLACE FUNCTION public.assessores_mensal(p_corretora text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(mes_ref date, assessor_nome text, lotes numeric, receita numeric, clientes integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref,
           (COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) - (p_meses || ' months')::interval)::date AS mes_ini
  )
  SELECT v.mes_ref, COALESCE(v.assessor_nome, 'Sem assessor'),
         SUM(v.lotes_operados), ROUND(SUM(v.receita), 2),
         COUNT(DISTINCT v.cliente_id) FILTER (WHERE v.lotes_operados > 0)::integer
  FROM public.v_lotes v CROSS JOIN cfg
  WHERE v.corretora = p_corretora AND v.mes_ref > cfg.mes_ini AND v.mes_ref <= cfg.mes_ref
    AND public.acesso_ok()
  GROUP BY 1, 2 ORDER BY 1, 3 DESC;
$$;

-- ---------------------------------------------
-- Leads e funil
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
    SELECT DISTINCT ON (ct.cliente_id) ct.cliente_id, ct.conta, ct.corretora,
           COALESCE(m.status, 'Em processamento') AS status
    FROM public.contas ct
    LEFT JOIN public.status_conta_mapa m ON m.corretora = ct.corretora AND m.situacao = upper(trim(COALESCE(ct.situacao_conta, '')))
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

DROP FUNCTION IF EXISTS public.funil_mensal(date, integer);
CREATE OR REPLACE FUNCTION public.funil_mensal(p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(
  mes_ref date, recebidos integer, ja_clientes integer, ganhos integer, perdidos integer,
  safra_ganhos integer, safra_perdidos integer, safra_abertos integer, abertos_acumulado integer, dias_fechar numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref),
  meses AS MATERIALIZED (
    SELECT (cfg.mes_ref - (n || ' months')::interval)::date AS mes_ref
    FROM cfg, generate_series(0, GREATEST(p_meses, 1) - 1) AS n
  ),
  l AS MATERIALIZED (
    SELECT ld.id, ld.status, ld.cliente_id, ld.data_fechamento, COALESCE(sl.tipo, 'Aberto') AS tipo,
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

DROP FUNCTION IF EXISTS public.funil_por(text, date, integer);
CREATE OR REPLACE FUNCTION public.funil_por(p_campo text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(grupo text, leads integer, ja_clientes integer, abertos integer, ganhos integer, perdidos integer,
              taxa_ganho numeric, conversao numeric, dias_fechar numeric, com_alerta integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref,
           (COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) - ((GREATEST(p_meses, 1) - 1) || ' months')::interval)::date AS d_ini,
           (COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) + INTERVAL '1 month')::date AS d_fim
  ),
  l AS (
    SELECT ll.*,
      CASE WHEN p_campo = 'origem' THEN COALESCE(NULLIF(ll.origem, ''), 'Sem origem')
           WHEN p_campo = 'corretora' THEN COALESCE(NULLIF(ll.corretora, ''), 'Não informada')
           WHEN p_campo = 'status' THEN ll.status
           ELSE COALESCE(NULLIF(ll.responsavel, ''), 'Sem responsável') END AS grupo
    FROM public.leads_lista(NULL) ll CROSS JOIN cfg
    WHERE (ll.data_hora AT TIME ZONE 'America/Sao_Paulo')::date >= cfg.d_ini
      AND (ll.data_hora AT TIME ZONE 'America/Sao_Paulo')::date < cfg.d_fim
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
-- Conta principal (status por JOIN)
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_contas_principais(p_corretora text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  WITH ranqueada AS (
    SELECT ct.id,
      ROW_NUMBER() OVER (
        PARTITION BY ct.cliente_id
        ORDER BY (m.status = 'Migrado') DESC NULLS LAST, ct.data_habilitacao NULLS LAST, ct.created_at
      ) AS rk
    FROM public.contas ct
    LEFT JOIN public.status_conta_mapa m ON m.corretora = ct.corretora AND m.situacao = upper(trim(COALESCE(ct.situacao_conta, '')))
    WHERE ct.corretora = p_corretora AND ct.cliente_id IS NOT NULL
  )
  UPDATE public.contas c
     SET principal = (r.rk = 1)
    FROM ranqueada r
   WHERE c.id = r.id AND c.principal IS DISTINCT FROM (r.rk = 1);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Índices que ajudam os JOINs acima
CREATE INDEX IF NOT EXISTS lotes_cliente_mes_idx ON public.lotes (corretora, cliente_id, ((date_trunc('month', data::timestamp))::date));
CREATE INDEX IF NOT EXISTS leads_cliente_idx ON public.leads (cliente_id);

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('clientes_lista', 'cliente_contas', 'cliente_mensal', 'incentivo_mes', 'incentivo_historico',
      'painel_kpis', 'painel_mensal', 'painel_clientes_mensal', 'migracoes_diarias', 'assessores_resumo', 'assessores_mensal',
      'leads_lista', 'funil_mensal', 'funil_por', 'marcar_contas_principais')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Conferência de tempo (deve ficar bem abaixo de 1 s cada)
EXPLAIN (ANALYZE, SUMMARY) SELECT COUNT(*) FROM public.assessores_resumo('GENIAL');
EXPLAIN (ANALYZE, SUMMARY) SELECT COUNT(*) FROM public.leads_lista(NULL);
EXPLAIN (ANALYZE, SUMMARY) SELECT COUNT(*) FROM public.clientes_lista('GENIAL');
