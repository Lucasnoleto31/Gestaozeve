-- ============================================================================
-- S29 · Desempenho do banco: resumo mensal de lotes (lotes_mes) + funções sobre ele
-- Re-runnável. Rodar depois da S28. Leva alguns segundos (monta o resumo).
--
-- Antes: cada tela chamava de 5 a 8 funções e cada uma varria os 31 mil lançamentos
-- de novo, com CASE, joins e, no incentivo, 12 vezes por chamada (histórico).
-- Agora: os lançamentos ficam somados por mês × cliente × conta × assessor × chave de
-- incentivo × produto na tabela lotes_mes (poucos milhares de linhas), mantida por
-- gatilho a cada escrita em lotes (importar, vincular, recalcular, excluir importação).
-- As funções das telas leem lotes_mes: mesmos nomes, mesmas colunas, mesmos números.
-- Continuam em lotes (índice por data) só o que precisa do dia: diário, top clientes,
-- mix de plataforma, extrato e por ativo do cliente, lançamentos não cadastrados.
-- ============================================================================

-- 1. Tabela-resumo -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lotes_mes (
  corretora text NOT NULL,
  mes_ref date NOT NULL,
  cliente_id uuid,                -- NULL = lançamento sem cliente cadastrado
  conta_id uuid,
  conta text,
  assessor_nome text,
  assessor_norm text,
  chave_incentivo text,
  produto text,
  nome_export text,               -- nome como veio no relatório (para quem não está cadastrado)
  filial text,
  linhas integer NOT NULL DEFAULT 0,
  operados numeric NOT NULL DEFAULT 0,
  zerados numeric NOT NULL DEFAULT 0,
  receita numeric NOT NULL DEFAULT 0,
  receita_corretagem numeric NOT NULL DEFAULT 0,
  receita_zeragem numeric NOT NULL DEFAULT 0,
  pontos numeric NOT NULL DEFAULT 0,
  primeiro_dia date,
  ultimo_dia date,
  ultimo_giro date                -- último dia com lote operado (> 0)
);
CREATE INDEX IF NOT EXISTS lotes_mes_cliente_idx  ON public.lotes_mes (corretora, cliente_id, mes_ref);
CREATE INDEX IF NOT EXISTS lotes_mes_mes_idx      ON public.lotes_mes (corretora, mes_ref);
CREATE INDEX IF NOT EXISTS lotes_mes_conta_idx    ON public.lotes_mes (corretora, conta_id);
CREATE INDEX IF NOT EXISTS lotes_mes_chave_idx    ON public.lotes_mes (corretora, mes_ref, chave_incentivo);
CREATE INDEX IF NOT EXISTS lotes_mes_assessor_idx ON public.lotes_mes (corretora, assessor_norm, mes_ref);
CREATE INDEX IF NOT EXISTS lotes_mes_cliente_global_idx ON public.lotes_mes (cliente_id, mes_ref);
ALTER TABLE public.lotes_mes ENABLE ROW LEVEL SECURITY;

-- 2. Recarga do resumo de uma corretora (apaga e refaz; ~0,1 s) -----------------
CREATE OR REPLACE FUNCTION public.atualizar_lotes_mes(p_corretora text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.lotes_mes WHERE corretora = p_corretora;
  INSERT INTO public.lotes_mes (corretora, mes_ref, cliente_id, conta_id, conta, assessor_nome, assessor_norm, chave_incentivo, produto,
                                nome_export, filial, linhas, operados, zerados, receita, receita_corretagem, receita_zeragem, pontos,
                                primeiro_dia, ultimo_dia, ultimo_giro)
  SELECT l.corretora, date_trunc('month', l.data::timestamp)::date, l.cliente_id, l.conta_id, l.conta, l.assessor_nome, l.assessor_norm,
         l.chave_incentivo, l.produto,
         MAX(l.nome_cliente), MAX(l.filial), COUNT(*)::integer,
         SUM(CASE WHEN l.zeragem THEN 0 ELSE l.qtd END),
         SUM(CASE WHEN l.zeragem THEN l.qtd ELSE 0 END),
         SUM(CASE WHEN l.zeragem THEN l.qtd * l.zeragem_rs ELSE l.qtd * l.tarifa END),
         SUM(CASE WHEN l.zeragem THEN 0 ELSE l.qtd * l.tarifa END),
         SUM(CASE WHEN l.zeragem THEN l.qtd * l.zeragem_rs ELSE 0 END),
         SUM(CASE WHEN l.zeragem THEN 0 ELSE l.qtd * l.multiplicador END),
         MIN(l.data), MAX(l.data),
         MAX(l.data) FILTER (WHERE NOT l.zeragem AND l.qtd > 0)
  FROM public.lotes l
  WHERE l.corretora = p_corretora
  GROUP BY l.corretora, 2, l.cliente_id, l.conta_id, l.conta, l.assessor_nome, l.assessor_norm, l.chave_incentivo, l.produto;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- 3. Gatilhos: qualquer escrita em lotes refaz o resumo das corretoras afetadas ----
CREATE OR REPLACE FUNCTION public.lotes_mes_gatilho()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE c text;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    DELETE FROM public.lotes_mes;
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    FOR c IN SELECT DISTINCT n.corretora FROM novas n LOOP
      PERFORM public.atualizar_lotes_mes(c);
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    FOR c IN SELECT DISTINCT v.corretora FROM velhas v LOOP
      PERFORM public.atualizar_lotes_mes(c);
    END LOOP;
  ELSE
    FOR c IN SELECT n.corretora FROM novas n UNION SELECT v.corretora FROM velhas v LOOP
      PERFORM public.atualizar_lotes_mes(c);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS lotes_mes_ins ON public.lotes;
DROP TRIGGER IF EXISTS lotes_mes_upd ON public.lotes;
DROP TRIGGER IF EXISTS lotes_mes_del ON public.lotes;
DROP TRIGGER IF EXISTS lotes_mes_trunc ON public.lotes;
CREATE TRIGGER lotes_mes_ins AFTER INSERT ON public.lotes REFERENCING NEW TABLE AS novas
  FOR EACH STATEMENT EXECUTE FUNCTION public.lotes_mes_gatilho();
CREATE TRIGGER lotes_mes_upd AFTER UPDATE ON public.lotes REFERENCING OLD TABLE AS velhas NEW TABLE AS novas
  FOR EACH STATEMENT EXECUTE FUNCTION public.lotes_mes_gatilho();
CREATE TRIGGER lotes_mes_del AFTER DELETE ON public.lotes REFERENCING OLD TABLE AS velhas
  FOR EACH STATEMENT EXECUTE FUNCTION public.lotes_mes_gatilho();
CREATE TRIGGER lotes_mes_trunc AFTER TRUNCATE ON public.lotes
  FOR EACH STATEMENT EXECUTE FUNCTION public.lotes_mes_gatilho();

-- 4. Funções das telas, agora sobre lotes_mes ------------------------------------

-- 4a. Lista de clientes: o giro de cada cliente vem do resumo (um índice por cliente,
--     também quando a ficha pede um cliente só, que antes levava vários segundos)
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
  LEFT JOIN LATERAL (
    SELECT SUM(lm.operados) AS lotes_total,
           SUM(lm.operados) FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS lotes_mes,
           SUM(lm.zerados)  FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS zerados_mes,
           SUM(lm.receita)  FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS receita_mes,
           SUM(lm.receita_corretagem) FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS rc_mes,
           SUM(lm.receita_zeragem)    FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS rz_mes,
           SUM(lm.operados) FILTER (WHERE lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref) AS lotes_12m,
           SUM(lm.receita)  FILTER (WHERE lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref) AS receita_12m,
           MAX(lm.ultimo_giro) FILTER (WHERE lm.mes_ref <= cfg.mes_ref) AS ultimo_giro,
           MAX(lm.mes_ref) FILTER (WHERE lm.operados > 0 AND lm.mes_ref <= cfg.mes_ref) AS ultimo_mes_giro
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
  ORDER BY COALESCE(g.lotes_12m, 0) DESC, c.nome;
$$;

-- 4b. Contas do cliente (ficha)
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
         COALESCE(g.lotes, 0), COALESCE(g.lotes_12m, 0), COALESCE(g.zerados, 0), ROUND(COALESCE(g.receita, 0), 2), g.ultimo_giro
  FROM public.contas ct
  CROSS JOIN cfg
  LEFT JOIN public.status_conta_mapa m ON m.corretora = ct.corretora AND m.situacao = upper(trim(COALESCE(ct.situacao_conta, '')))
  LEFT JOIN LATERAL (
    SELECT SUM(lm.operados) AS lotes,
           SUM(lm.operados) FILTER (WHERE lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref) AS lotes_12m,
           SUM(lm.zerados) AS zerados, SUM(lm.receita) AS receita, MAX(lm.ultimo_giro) AS ultimo_giro
    FROM public.lotes_mes lm
    WHERE lm.corretora = ct.corretora AND lm.conta_id = ct.id
  ) g ON true
  WHERE ct.corretora = p_corretora AND ct.cliente_id = p_cliente_id AND public.acesso_ok()
  UNION ALL
  SELECT NULL, lm.conta, NULL, NULL, 'Não cadastrada', MAX(lm.assessor_nome), MAX(lm.filial), NULL, false,
         SUM(lm.operados),
         SUM(lm.operados) FILTER (WHERE lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref),
         SUM(lm.zerados), ROUND(SUM(lm.receita), 2), MAX(lm.ultimo_giro)
  FROM public.lotes_mes lm CROSS JOIN cfg
  WHERE lm.corretora = p_corretora AND lm.cliente_id = p_cliente_id AND lm.conta_id IS NULL AND public.acesso_ok()
  GROUP BY lm.conta, cfg.mes_ref, cfg.mes_ini
  ORDER BY 9 DESC, 8 NULLS LAST;
$$;

-- 4c. Série mensal do cliente (ficha)
CREATE OR REPLACE FUNCTION public.cliente_mensal(p_corretora text, p_cliente_id uuid, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(mes_ref date, lotes numeric, zerados numeric, receita numeric, pontos numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref,
           (COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) - (p_meses || ' months')::interval)::date AS mes_ini
  )
  SELECT lm.mes_ref, SUM(lm.operados), SUM(lm.zerados), ROUND(SUM(lm.receita), 2), SUM(lm.pontos)
  FROM public.lotes_mes lm CROSS JOIN cfg
  WHERE lm.corretora = p_corretora AND lm.cliente_id = p_cliente_id
    AND lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref
    AND public.acesso_ok()
  GROUP BY lm.mes_ref ORDER BY lm.mes_ref;
$$;

-- 4d. Incentivo do mês (pontos por chave de incentivo)
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
    SELECT lm.chave_incentivo AS chave,
           MAX(COALESCE(c.nome, lm.nome_export, 'Não cadastrado')) AS nome,
           MAX(lm.cliente_id::text)::uuid AS cliente_id,
           COUNT(DISTINCT lm.conta)::integer AS contas,
           SUM(lm.operados) AS lotes,
           SUM(lm.pontos) AS pontos,
           SUM(lm.pontos) FILTER (WHERE lm.produto = 'WIN') AS p_win,
           SUM(lm.pontos) FILTER (WHERE lm.produto = 'WDO') AS p_wdo,
           SUM(lm.pontos) FILTER (WHERE lm.produto = 'DOL') AS p_dol,
           SUM(lm.pontos) FILTER (WHERE COALESCE(lm.produto, '') NOT IN ('WIN', 'WDO', 'DOL')) AS p_out
    FROM public.lotes_mes lm CROSS JOIN cfg
    LEFT JOIN public.clientes c ON c.id = lm.cliente_id
    WHERE lm.corretora = p_corretora AND lm.mes_ref = cfg.mes_ref AND public.acesso_ok()
    GROUP BY lm.chave_incentivo
    HAVING SUM(lm.operados) > 0
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

-- 4e. Histórico do incentivo: uma consulta para os 12 meses (antes chamava incentivo_mes 12 vezes)
CREATE OR REPLACE FUNCTION public.incentivo_historico(p_corretora text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(mes_ref date, pontos numeric, clientes_pontuando integer, clientes_com_faixa integer, incentivo numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref),
  meses AS MATERIALIZED (
    SELECT (cfg.mes_ref - (n || ' months')::interval)::date AS mes_ref
    FROM cfg, generate_series(0, GREATEST(p_meses, 1) - 1) AS n
  ),
  pts AS (
    SELECT lm.mes_ref, lm.chave_incentivo, SUM(lm.pontos) AS pontos
    FROM public.lotes_mes lm
    WHERE lm.corretora = p_corretora AND lm.mes_ref IN (SELECT m.mes_ref FROM meses m)
    GROUP BY lm.mes_ref, lm.chave_incentivo
    HAVING SUM(lm.operados) > 0
  ),
  val AS (
    SELECT p.mes_ref, ROUND(p.pontos, 0) AS pontos,
           COALESCE((SELECT f.valor FROM public.faixas_incentivo f
                     WHERE f.corretora = p_corretora AND p.pontos > f.pontos_min ORDER BY f.pontos_min DESC LIMIT 1), 0) AS valor
    FROM pts p
  )
  SELECT m.mes_ref,
         COALESCE(SUM(v.pontos), 0),
         COUNT(v.mes_ref) FILTER (WHERE v.pontos > 0)::integer,
         COUNT(v.mes_ref) FILTER (WHERE v.valor > 0)::integer,
         COALESCE(SUM(v.valor), 0)
  FROM meses m
  LEFT JOIN val v ON v.mes_ref = m.mes_ref
  WHERE public.acesso_ok()
  GROUP BY m.mes_ref ORDER BY m.mes_ref;
$$;

-- 4f. Indicadores mensais do painel
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
    SELECT lm.mes_ref, COUNT(DISTINCT lm.cliente_id) FILTER (WHERE lm.operados > 0) AS ativos,
           SUM(lm.operados) AS lotes, SUM(lm.zerados) AS zerados,
           SUM(lm.receita_corretagem) AS rc, SUM(lm.receita_zeragem) AS rz
    FROM public.lotes_mes lm
    WHERE lm.corretora = p_corretora AND lm.mes_ref IN (SELECT m.mes_ref FROM meses m)
    GROUP BY lm.mes_ref
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

-- 4g. Lotes por cliente e mês (mapa de calor)
CREATE OR REPLACE FUNCTION public.painel_clientes_mensal(p_corretora text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12, p_top integer DEFAULT NULL)
RETURNS TABLE(cliente_id uuid, cliente_nome text, responsavel text, mes_ref date, lotes numeric, total_clientes integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref,
           (COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) - (p_meses || ' months')::interval)::date AS mes_ini
  ),
  base AS MATERIALIZED (
    SELECT lm.cliente_id, MAX(COALESCE(c.nome, lm.nome_export, 'Não cadastrado')) AS nome, MAX(a.responsavel) AS resp,
           lm.mes_ref, SUM(lm.operados) AS lotes
    FROM public.lotes_mes lm CROSS JOIN cfg
    LEFT JOIN public.clientes c ON c.id = lm.cliente_id
    LEFT JOIN public.assessores a ON a.corretora = lm.corretora AND a.nome_norm = lm.assessor_norm
    WHERE lm.corretora = p_corretora AND lm.cliente_id IS NOT NULL
      AND lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref
    GROUP BY lm.cliente_id, lm.mes_ref
    HAVING SUM(lm.operados) > 0
  ),
  tot AS MATERIALIZED (SELECT b.cliente_id, SUM(b.lotes) AS total FROM base b GROUP BY b.cliente_id),
  escolhidos AS (SELECT t.cliente_id FROM tot t ORDER BY t.total DESC, t.cliente_id LIMIT COALESCE(p_top, 2147483647))
  SELECT b.cliente_id, b.nome, b.resp, b.mes_ref, b.lotes, (SELECT COUNT(*) FROM tot)::integer
  FROM base b
  JOIN escolhidos e ON e.cliente_id = b.cliente_id
  WHERE public.acesso_ok()
  ORDER BY 1, 4;
$$;

-- 4h. Assessores: resumo do mês e série mensal
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
  SELECT COALESCE(lm.assessor_nome, 'Sem assessor'),
         MAX(a.responsavel), MAX(a.corretagem), MAX(a.tipo_zeragem),
         COUNT(DISTINCT lm.cliente_id) FILTER (WHERE lm.mes_ref = cfg.mes_ref AND lm.operados > 0)::integer,
         COALESCE(SUM(lm.operados) FILTER (WHERE lm.mes_ref = cfg.mes_ref), 0),
         COALESCE(SUM(lm.zerados)  FILTER (WHERE lm.mes_ref = cfg.mes_ref), 0),
         ROUND(COALESCE(SUM(lm.receita_corretagem) FILTER (WHERE lm.mes_ref = cfg.mes_ref), 0), 2),
         ROUND(COALESCE(SUM(lm.receita_zeragem) FILTER (WHERE lm.mes_ref = cfg.mes_ref), 0), 2),
         ROUND(COALESCE(SUM(lm.receita) FILTER (WHERE lm.mes_ref = cfg.mes_ref), 0), 2),
         COALESCE(SUM(lm.operados) FILTER (WHERE lm.mes_ref = cfg.mes_ant), 0),
         COALESCE(SUM(lm.operados) FILTER (WHERE lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref), 0),
         ROUND(COALESCE(SUM(lm.receita) FILTER (WHERE lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref), 0), 2)
  FROM public.lotes_mes lm
  CROSS JOIN cfg
  LEFT JOIN public.assessores a ON a.corretora = lm.corretora AND a.nome_norm = lm.assessor_norm
  WHERE lm.corretora = p_corretora AND lm.mes_ref > cfg.mes_janela AND lm.mes_ref <= cfg.mes_ref
    AND public.acesso_ok()
  GROUP BY lm.assessor_nome
  ORDER BY 6 DESC;
$$;

CREATE OR REPLACE FUNCTION public.assessores_mensal(p_corretora text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(mes_ref date, assessor_nome text, lotes numeric, receita numeric, clientes integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref,
           (COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) - (p_meses || ' months')::interval)::date AS mes_ini
  )
  SELECT lm.mes_ref, COALESCE(lm.assessor_nome, 'Sem assessor'),
         SUM(lm.operados), ROUND(SUM(lm.receita), 2),
         COUNT(DISTINCT lm.cliente_id) FILTER (WHERE lm.operados > 0)::integer
  FROM public.lotes_mes lm CROSS JOIN cfg
  WHERE lm.corretora = p_corretora AND lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref
    AND public.acesso_ok()
  GROUP BY 1, 2 ORDER BY 1, 3 DESC;
$$;

-- 4i. Série mensal de receita (BTG/ATP): todo o histórico vem do resumo; com data de início
--     (corte no meio do mês) continua lendo os lançamentos
CREATE OR REPLACE FUNCTION public.receita_mensal(p_corretora text, p_inicio date DEFAULT NULL)
RETURNS TABLE(mes_ref date, lotes numeric, zerados numeric, receita_corretagem numeric, receita_zeragem numeric, receita numeric, clientes_ativos integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT lm.mes_ref, SUM(lm.operados), SUM(lm.zerados),
         ROUND(SUM(lm.receita_corretagem), 2), ROUND(SUM(lm.receita_zeragem), 2), ROUND(SUM(lm.receita), 2),
         COUNT(DISTINCT lm.cliente_id) FILTER (WHERE lm.operados > 0)::integer
  FROM public.lotes_mes lm
  WHERE p_inicio IS NULL AND lm.corretora = p_corretora AND public.acesso_ok()
  GROUP BY lm.mes_ref
  UNION ALL
  SELECT v.mes_ref, SUM(v.lotes_operados), SUM(v.lotes_zerados),
         ROUND(SUM(v.lotes_operados * v.tarifa), 2), ROUND(SUM(v.lotes_zerados * v.zeragem_rs), 2), ROUND(SUM(v.receita), 2),
         COUNT(DISTINCT v.cliente_id) FILTER (WHERE v.lotes_operados > 0)::integer
  FROM public.v_lotes v
  WHERE p_inicio IS NOT NULL AND v.corretora = p_corretora AND v.data >= p_inicio AND public.acesso_ok()
  GROUP BY v.mes_ref
  ORDER BY 1;
$$;

-- 4j. Lista de leads: o giro de cada cliente ligado vem do resumo
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
           date_trunc('month', (public.brasil_hoje() - INTERVAL '12 months'))::date AS mes_ini
  ),
  giro AS MATERIALIZED (
    SELECT lm.cliente_id, SUM(lm.operados) AS lotes_12m, bool_or(lm.operados > 0) AS girou
    FROM public.lotes_mes lm CROSS JOIN cfg
    WHERE lm.cliente_id IS NOT NULL AND lm.mes_ref >= cfg.mes_ini
    GROUP BY lm.cliente_id
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

-- 4k. Funil por safra: giro dos clientes ligados a leads vem do resumo
CREATE OR REPLACE FUNCTION public.funil_safra(p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(
  mes_ref date, recebidos integer, contatados integer, perdidos integer, ganhos integer, em_aberto integer,
  ja_clientes integer, viraram_clientes integer, ativados integer, em_processamento integer, recusaram integer,
  com_giro integer, lotes numeric, receita numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref),
  meses AS MATERIALIZED (
    SELECT (cfg.mes_ref - (n || ' months')::interval)::date AS mes_ref
    FROM cfg, generate_series(0, GREATEST(p_meses, 1) - 1) AS n
  ),
  lead AS MATERIALIZED (
    SELECT ld.id, ld.cliente_id, ld.status, COALESCE(sl.tipo, 'Aberto') AS tipo,
           (ld.ultimo_contato IS NOT NULL OR ld.status <> 'Novo') AS contatado,
           date_trunc('month', (ld.data_hora AT TIME ZONE 'America/Sao_Paulo'))::date AS mes_lead,
           (ld.data_hora AT TIME ZONE 'America/Sao_Paulo')::date AS dia_lead
    FROM public.leads ld
    LEFT JOIN public.status_lead sl ON sl.status = ld.status
  ),
  cli AS MATERIALIZED (
    SELECT DISTINCT ON (vc.cliente_id) vc.cliente_id, vc.status, vc.data_migracao
    FROM public.v_cliente_corretora vc
    WHERE vc.cliente_id IN (SELECT lead.cliente_id FROM lead WHERE lead.cliente_id IS NOT NULL)
    ORDER BY vc.cliente_id, (vc.status = 'Migrado') DESC, (vc.status = 'Em processamento') DESC, vc.data_migracao
  ),
  giro AS MATERIALIZED (
    SELECT lm.cliente_id, SUM(lm.operados) AS lotes, SUM(lm.receita) AS receita
    FROM public.lotes_mes lm
    WHERE lm.cliente_id IN (SELECT cli.cliente_id FROM cli)
    GROUP BY lm.cliente_id
  ),
  l AS MATERIALIZED (
    SELECT lead.*, c.status AS status_cliente,
           COALESCE(c.status = 'Migrado' AND c.data_migracao IS NOT NULL AND c.data_migracao < lead.dia_lead, false) AS ja_cliente,
           g.lotes, g.receita
    FROM lead
    LEFT JOIN cli c ON c.cliente_id = lead.cliente_id
    LEFT JOIN giro g ON g.cliente_id = lead.cliente_id
  )
  SELECT m.mes_ref,
    COUNT(l.id)::integer,
    COUNT(*) FILTER (WHERE l.contatado)::integer,
    COUNT(*) FILTER (WHERE l.status = 'Perdido')::integer,
    COUNT(*) FILTER (WHERE l.status = 'Ganho')::integer,
    COUNT(*) FILTER (WHERE l.tipo = 'Aberto')::integer,
    COUNT(*) FILTER (WHERE l.ja_cliente)::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND (l.status = 'Ganho' OR l.status_cliente IS NOT NULL))::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado')::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Em processamento')::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Recusou')::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado' AND COALESCE(l.lotes, 0) > 0)::integer,
    COALESCE(SUM(l.lotes) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado'), 0),
    ROUND(COALESCE(SUM(l.receita) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado'), 0), 2)
  FROM meses m
  LEFT JOIN l ON l.mes_lead = m.mes_ref
  WHERE public.acesso_ok()
  GROUP BY m.mes_ref
  ORDER BY m.mes_ref;
$$;

CREATE OR REPLACE FUNCTION public.funil_safra_por(p_campo text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(
  grupo text, recebidos integer, contatados integer, perdidos integer, ganhos integer, em_aberto integer,
  ja_clientes integer, viraram_clientes integer, ativados integer, em_processamento integer, recusaram integer,
  com_giro integer, lotes numeric, receita numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref,
           (COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) - ((GREATEST(p_meses, 1) - 1) || ' months')::interval)::date AS d_ini
  ),
  lead AS MATERIALIZED (
    SELECT ld.id, ld.cliente_id, ld.status, COALESCE(sl.tipo, 'Aberto') AS tipo,
           (ld.ultimo_contato IS NOT NULL OR ld.status <> 'Novo') AS contatado,
           (ld.data_hora AT TIME ZONE 'America/Sao_Paulo')::date AS dia_lead,
           CASE WHEN p_campo = 'origem' THEN COALESCE(NULLIF(ld.origem, ''), 'Sem origem')
                WHEN p_campo = 'corretora' THEN COALESCE(NULLIF(ld.corretora, ''), 'Não informada')
                ELSE COALESCE(NULLIF(ld.responsavel, ''), 'Sem responsável') END AS grupo
    FROM public.leads ld CROSS JOIN cfg
    LEFT JOIN public.status_lead sl ON sl.status = ld.status
    WHERE date_trunc('month', (ld.data_hora AT TIME ZONE 'America/Sao_Paulo'))::date BETWEEN cfg.d_ini AND cfg.mes_ref
  ),
  cli AS MATERIALIZED (
    SELECT DISTINCT ON (vc.cliente_id) vc.cliente_id, vc.status, vc.data_migracao
    FROM public.v_cliente_corretora vc
    WHERE vc.cliente_id IN (SELECT lead.cliente_id FROM lead WHERE lead.cliente_id IS NOT NULL)
    ORDER BY vc.cliente_id, (vc.status = 'Migrado') DESC, (vc.status = 'Em processamento') DESC, vc.data_migracao
  ),
  giro AS MATERIALIZED (
    SELECT lm.cliente_id, SUM(lm.operados) AS lotes, SUM(lm.receita) AS receita
    FROM public.lotes_mes lm
    WHERE lm.cliente_id IN (SELECT cli.cliente_id FROM cli)
    GROUP BY lm.cliente_id
  ),
  l AS MATERIALIZED (
    SELECT lead.*, c.status AS status_cliente,
           COALESCE(c.status = 'Migrado' AND c.data_migracao IS NOT NULL AND c.data_migracao < lead.dia_lead, false) AS ja_cliente,
           g.lotes, g.receita
    FROM lead
    LEFT JOIN cli c ON c.cliente_id = lead.cliente_id
    LEFT JOIN giro g ON g.cliente_id = lead.cliente_id
  )
  SELECT l.grupo,
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE l.contatado)::integer,
    COUNT(*) FILTER (WHERE l.status = 'Perdido')::integer,
    COUNT(*) FILTER (WHERE l.status = 'Ganho')::integer,
    COUNT(*) FILTER (WHERE l.tipo = 'Aberto')::integer,
    COUNT(*) FILTER (WHERE l.ja_cliente)::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND (l.status = 'Ganho' OR l.status_cliente IS NOT NULL))::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado')::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Em processamento')::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Recusou')::integer,
    COUNT(*) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado' AND COALESCE(l.lotes, 0) > 0)::integer,
    COALESCE(SUM(l.lotes) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado'), 0),
    ROUND(COALESCE(SUM(l.receita) FILTER (WHERE NOT l.ja_cliente AND l.status_cliente = 'Migrado'), 0), 2)
  FROM l
  WHERE public.acesso_ok()
  GROUP BY l.grupo
  ORDER BY 2 DESC, 1;
$$;

-- 5. Resumo dos leads para o Início e o Funil (contagens + lista de ação) -----------
--    Antes, essas telas baixavam a lista inteira (1.400 leads, 770 KB) só para contar.
CREATE OR REPLACE FUNCTION public.leads_resumo(p_limite integer DEFAULT 40)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH l AS MATERIALIZED (SELECT * FROM public.leads_lista(NULL)),
  cfg AS MATERIALIZED (SELECT date_trunc('month', public.brasil_hoje())::date AS mes)
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM l),
    'neste_mes', (SELECT COUNT(*) FROM l, cfg WHERE date_trunc('month', (l.data_hora AT TIME ZONE 'America/Sao_Paulo'))::date = cfg.mes),
    'abertos', (SELECT COUNT(*) FROM l WHERE l.tipo_status = 'Aberto'),
    'com_alerta', (SELECT COUNT(*) FROM l WHERE l.alerta),
    'ganhos', (SELECT COUNT(*) FROM l WHERE l.status = 'Ganho'),
    'perdidos', (SELECT COUNT(*) FROM l WHERE l.status = 'Perdido'),
    'ja_clientes', (SELECT COUNT(*) FROM l WHERE l.cliente_id IS NOT NULL),
    'acao', (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.dias DESC NULLS LAST, x.data_hora), '[]'::jsonb)
             FROM (SELECT l.id, l.nome, l.whatsapp, l.responsavel, l.status, l.tipo_status, l.data_hora, l.ultimo_contato, l.dias, l.corretora
                   FROM l WHERE l.alerta ORDER BY l.dias DESC NULLS LAST, l.data_hora LIMIT GREATEST(COALESCE(p_limite, 0), 0)) x)
  )
  WHERE public.acesso_ok();
$$;

-- 5b. Unificar dois cadastros do mesmo cliente (CPF/CNPJ repetido) ------------------
--     Contas, lotes, leads, campos por corretora e tarifas passam para o cadastro mantido;
--     o que estava vazio nele vem do outro, que é apagado. Devolve quantos itens moveu.
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

-- 6. Permissões ------------------------------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'atualizar_lotes_mes', 'lotes_mes_gatilho', 'leads_resumo', 'unificar_clientes', 'clientes_lista', 'cliente_contas', 'cliente_mensal',
      'incentivo_mes', 'incentivo_historico', 'painel_mensal', 'painel_clientes_mensal', 'assessores_resumo', 'assessores_mensal',
      'receita_mensal', 'leads_lista', 'funil_safra', 'funil_safra_por')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    IF f.proname IN ('atualizar_lotes_mes', 'lotes_mes_gatilho') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.assinatura);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
    END IF;
  END LOOP;
END $$;

-- 7. Primeira carga do resumo (uma vez por corretora com lotes) ---------------------
SELECT s.corretora, public.atualizar_lotes_mes(s.corretora) AS linhas_resumo
FROM (SELECT DISTINCT corretora FROM public.lotes) s;

NOTIFY pgrst, 'reload schema';

-- 8. Conferência: lançamentos × resumo, por corretora e mês (deve voltar VAZIO) --------
WITH det AS (
  SELECT v.corretora, v.mes_ref, SUM(v.lotes_operados) AS operados, SUM(v.lotes_zerados) AS zerados, SUM(v.receita) AS receita, SUM(v.pontos) AS pontos
  FROM public.v_lotes v GROUP BY 1, 2
),
res AS (
  SELECT lm.corretora, lm.mes_ref, SUM(lm.operados) AS operados, SUM(lm.zerados) AS zerados, SUM(lm.receita) AS receita, SUM(lm.pontos) AS pontos
  FROM public.lotes_mes lm GROUP BY 1, 2
)
SELECT COALESCE(d.corretora, r.corretora) AS corretora, COALESCE(d.mes_ref, r.mes_ref) AS mes_ref,
       d.operados AS operados_lancamentos, r.operados AS operados_resumo,
       ROUND(d.receita, 2) AS receita_lancamentos, ROUND(r.receita, 2) AS receita_resumo
FROM det d FULL JOIN res r ON r.corretora = d.corretora AND r.mes_ref = d.mes_ref
WHERE d.operados IS DISTINCT FROM r.operados OR d.zerados IS DISTINCT FROM r.zerados
   OR ROUND(d.receita, 4) IS DISTINCT FROM ROUND(r.receita, 4) OR ROUND(d.pontos, 4) IS DISTINCT FROM ROUND(r.pontos, 4)
ORDER BY 1, 2;
