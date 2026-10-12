-- ============================================================================
-- S44 · Projeção de fechamento, variação vs mês anterior, valor do cliente (LTV) e clientes em risco
-- Re-runnável. Rodar depois da S43.
--
-- Lucas, 12/10/2026:
-- 1. Projeção de fechamento do mês (Genial e BTG) com base em todo o histórico: o app lê o giro por
--    dia (giro_diario, nova e mais leve que diario: sem joins, sem contagem de clientes) e monta a
--    curva de cada mês completo (fração do total atingida a cada dia útil). O mês corrente é
--    projetado pela mediana dessas curvas; o cálculo fica em src/lib/gestao/projecao.ts.
-- 2. Valor do cliente: clientes_lista passa a devolver receita_total (todo o histórico),
--    primeiro_mes_giro e meses_ativos (meses com lote operado).
-- 3. Clientes em risco antes de virar Inativo: clientes_lista devolve lotes_mes_anterior,
--    lotes_media_3m (média dos 3 meses anteriores ao de referência), dias_sem_giro (contados até o
--    último dia lançado na corretora, nunca até hoje) e risco:
--      'parou'    = ativo no mês, mas sem giro há risco_dias_parado dias ou mais;
--      'em queda' = no ritmo atual (dias úteis lançados ÷ dias úteis do mês), fecha o mês
--                   risco_queda_pct % ou mais abaixo da média dos 3 meses anteriores
--                   (só quem tinha média de pelo menos risco_minimo_lotes lotes/mês e com ao menos
--                   1/4 do mês lançado). Em mês já fechado o ritmo é 1 (compara o mês inteiro).
--    Três parâmetros novos por corretora (Parâmetros → Premissas). painel_kpis ganha em_risco,
--    painel_resumo devolve a contagem e os 12 maiores em risco (o Painel não roda clientes_lista
--    duas vezes) e clientes_risco lista todos, maiores primeiro (conferência e consultas avulsas).
-- ============================================================================

-- 1. Parâmetros --------------------------------------------------------------------------------
INSERT INTO public.parametros (corretora, chave, valor, descricao)
SELECT c, k, v, d FROM (VALUES ('GENIAL'), ('XP'), ('BTG')) AS cs(c)
CROSS JOIN (VALUES
  ('risco_dias_parado',  '10', 'Risco "parou": dias sem giro (contados até o último dia lançado) para um cliente ativo entrar em risco'),
  ('risco_queda_pct',    '50', 'Risco "em queda": queda (%) dos lotes do mês, no ritmo atual, contra a média dos 3 meses anteriores'),
  ('risco_minimo_lotes', '20', 'Risco "em queda": média mínima de lotes/mês nos 3 meses anteriores para avaliar a queda')
) AS ps(k, v, d)
ON CONFLICT DO NOTHING;

-- 2. Dias úteis (segunda a sexta, sem feriados) entre duas datas, inclusive ------------------------
CREATE OR REPLACE FUNCTION public.dias_uteis(p_inicio date, p_fim date)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE((
    SELECT COUNT(*)::integer
    FROM generate_series(p_inicio, p_fim, interval '1 day') AS d
    WHERE EXTRACT(ISODOW FROM d) < 6
  ), 0)
  WHERE p_inicio IS NOT NULL AND p_fim IS NOT NULL AND p_fim >= p_inicio;
$$;

-- 3. Giro por dia (projeção): só lotes e receita, direto da tabela, mesmas regras de lotes_mes.
--    Só clientes cadastrados: é a mesma base dos KPIs (clientes_lista); lançamentos sem cliente ficam
--    nas pendências, como já acontece no Painel.
CREATE OR REPLACE FUNCTION public.giro_diario(p_corretora text, p_inicio date, p_fim date)
RETURNS TABLE(dia date, lotes numeric, receita numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT l.data,
         SUM(CASE WHEN l.zeragem OR l.posicao OR l.acoes THEN 0 ELSE l.qtd END),
         ROUND(SUM(CASE WHEN l.zeragem THEN l.qtd * l.zeragem_rs WHEN l.acoes OR l.posicao THEN l.tarifa ELSE l.qtd * l.tarifa END), 2)
  FROM public.lotes l
  WHERE l.corretora = p_corretora AND l.conta_para_receita AND l.cliente_id IS NOT NULL
    AND l.data BETWEEN p_inicio AND p_fim
    AND public.acesso_ok()
  GROUP BY l.data
  ORDER BY l.data;
$$;
REVOKE ALL ON FUNCTION public.giro_diario(text, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.giro_diario(text, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.giro_diario(text, date, date) TO authenticated, service_role;

-- 4. Lista de clientes: receita_total, primeiro_mes_giro, meses_ativos, sinais de risco e risco ----
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
  lotes_mes_anterior numeric, lotes_media_3m numeric, dias_sem_giro integer, risco text
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
    CASE
      WHEN q.status <> 'Migrado' OR q.situacao <> 'Ativo' THEN NULL
      WHEN q.dias_sem_giro >= cfg.risco_dias THEN 'parou'
      WHEN q.lotes_media_3m >= cfg.risco_min AND cfg.fator >= 0.25
           AND q.lotes_mes <= q.lotes_media_3m * cfg.fator * (1 - cfg.risco_pct / 100.0) THEN 'em queda'
    END AS risco
  FROM q CROSS JOIN cfg2 cfg
  ORDER BY q.lotes_12m DESC, q.nome;
$$;
REVOKE ALL ON FUNCTION public.clientes_lista(text, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clientes_lista(text, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.clientes_lista(text, date, uuid) TO authenticated, service_role;

-- 5. Clientes em risco, maiores primeiro (Painel e Início) ---------------------------------------
CREATE OR REPLACE FUNCTION public.clientes_risco(p_corretora text, p_mes_ref date DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS TABLE(
  cliente_id uuid, nome text, responsavel text, telefone text, risco text,
  lotes_mes numeric, lotes_mes_anterior numeric, lotes_media_3m numeric, receita_12m numeric,
  ultimo_giro date, dias_sem_giro integer, total integer
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT cl.cliente_id, cl.nome, cl.responsavel, cl.telefone, cl.risco,
         cl.lotes_mes, cl.lotes_mes_anterior, cl.lotes_media_3m, cl.receita_12m,
         cl.ultimo_giro, cl.dias_sem_giro,
         COUNT(*) OVER ()::integer AS total
  FROM public.clientes_lista(p_corretora, p_mes_ref) cl
  WHERE cl.risco IS NOT NULL
  ORDER BY cl.receita_12m DESC, cl.nome
  LIMIT GREATEST(COALESCE(p_limit, 20), 1);
$$;
REVOKE ALL ON FUNCTION public.clientes_risco(text, date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clientes_risco(text, date, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.clientes_risco(text, date, integer) TO authenticated, service_role;

-- 6. Resumo do painel: + em_risco (contagem) e a lista dos 12 maiores em risco ---------------------
CREATE OR REPLACE FUNCTION public.painel_resumo(p_corretora text, p_mes_ref date DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cl AS MATERIALIZED (SELECT * FROM public.clientes_lista(p_corretora, p_mes_ref)),
  tot AS (
    SELECT
      COUNT(*)::integer AS levados,
      COALESCE(SUM(n_contas), 0)::integer AS contas,
      COUNT(*) FILTER (WHERE status = 'Migrado')::integer AS migrados,
      COUNT(*) FILTER (WHERE status = 'Em processamento')::integer AS em_processamento,
      COUNT(*) FILTER (WHERE status = 'Recusou')::integer AS recusaram,
      COUNT(*) FILTER (WHERE lotes_mes > 0)::integer AS ativos,
      COALESCE(SUM(lotes_mes), 0) AS lotes_mes,
      COALESCE(SUM(zerados_mes), 0) AS zerados_mes,
      ROUND(COALESCE(SUM(receita_mes), 0), 2) AS receita_mes,
      COALESCE(SUM(lotes_12m), 0) AS lotes_12m,
      ROUND(COALESCE(SUM(receita_12m), 0), 2) AS receita_12m,
      COUNT(*) FILTER (WHERE situacao = 'Nunca girou')::integer AS nunca_giraram,
      COUNT(*) FILTER (WHERE situacao = 'Inativo')::integer AS inativos,
      COUNT(*) FILTER (WHERE situacao = 'Ativo')::integer AS ativos_sit,
      COUNT(*) FILTER (WHERE array_length(alertas, 1) > 0)::integer AS com_alertas,
      COUNT(*) FILTER (WHERE status = 'Migrado' AND data_migracao IS NULL)::integer AS migrados_sem_data,
      COUNT(*) FILTER (WHERE n_contas > 1)::integer AS multi_conta,
      COUNT(*) FILTER (WHERE receita_mes > 0)::integer AS com_receita,
      AVG(dias_ate_migrar) AS media_dias_migrar,
      COUNT(*) FILTER (WHERE risco IS NOT NULL)::integer AS em_risco
    FROM cl
  ),
  por AS (
    SELECT 'assessor' AS tipo, COALESCE(assessor_nome, 'Sem assessor') AS grupo, * FROM cl
    UNION ALL
    SELECT 'responsavel', COALESCE(responsavel, 'Sem responsável'), * FROM cl
  ),
  grupos AS (
    SELECT tipo, grupo, MAX(responsavel) AS responsavel,
      COUNT(*)::integer AS levados,
      COUNT(*) FILTER (WHERE status = 'Migrado')::integer AS migrados,
      COUNT(*) FILTER (WHERE status = 'Em processamento')::integer AS em_processamento,
      COUNT(*) FILTER (WHERE status = 'Recusou')::integer AS recusaram,
      COUNT(*) FILTER (WHERE lotes_mes > 0)::integer AS ativos,
      COALESCE(SUM(lotes_mes), 0) AS lotes_mes,
      ROUND(COALESCE(SUM(receita_mes), 0), 2) AS receita_mes,
      COALESCE(SUM(lotes_12m), 0) AS lotes_12m,
      ROUND(COALESCE(SUM(receita_12m), 0), 2) AS receita_12m,
      COUNT(*) FILTER (WHERE receita_mes > 0)::integer AS com_receita
    FROM por
    GROUP BY tipo, grupo
  ),
  sem_giro AS (
    SELECT cliente_id, nome, responsavel, data_migracao, telefone
    FROM cl WHERE situacao = 'Nunca girou'
    ORDER BY data_migracao DESC NULLS LAST, nome
    LIMIT 15
  ),
  em_risco AS (
    SELECT cliente_id, nome, responsavel, telefone, risco, lotes_mes, lotes_mes_anterior, lotes_media_3m, receita_12m, ultimo_giro, dias_sem_giro
    FROM cl WHERE risco IS NOT NULL
    ORDER BY receita_12m DESC, nome
    LIMIT 12
  )
  SELECT jsonb_build_object(
    'resumo', (SELECT to_jsonb(t) FROM tot t),
    'grupos', (SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.tipo, g.lotes_mes DESC, g.levados DESC, g.grupo), '[]'::jsonb) FROM grupos g),
    'sem_giro', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.data_migracao DESC NULLS LAST, s.nome), '[]'::jsonb) FROM sem_giro s),
    'em_risco', (SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.receita_12m DESC, e.nome), '[]'::jsonb) FROM em_risco e)
  )
  WHERE public.acesso_ok();
$$;
REVOKE ALL ON FUNCTION public.painel_resumo(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.painel_resumo(text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.painel_resumo(text, date) TO authenticated, service_role;

-- 7. KPIs do painel: + em_risco ------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.painel_kpis(text, date);
CREATE OR REPLACE FUNCTION public.painel_kpis(p_corretora text, p_mes_ref date DEFAULT NULL)
RETURNS TABLE(
  mes_ref date, clientes_levados integer, total_contas integer, migrados integer, em_processamento integer, recusaram integer,
  ativos_mes integer, lotes_mes numeric, zerados_mes numeric, receita_mes numeric, incentivo_mes numeric, clientes_com_faixa integer,
  migrados_sem_giro integer, inativos integer, com_alertas integer, migrados_sem_data integer, multi_conta integer,
  linhas_nao_cadastradas integer, lotes_nao_cadastrados numeric, ultima_data date,
  lotes_12m numeric, receita_12m numeric, posicao_mes numeric, acoes_operacoes_mes integer, receita_acoes_mes numeric,
  em_risco integer
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
    SELECT COUNT(*)::integer AS linhas, COALESCE(SUM(CASE WHEN zeragem OR posicao OR acoes THEN 0 ELSE qtd END), 0) AS lotes
    FROM public.lotes WHERE corretora = p_corretora AND cliente_id IS NULL AND conta_para_receita
  ),
  extra AS (
    SELECT COALESCE(SUM(lm.posicao), 0) AS posicao, COALESCE(SUM(lm.acoes_operacoes), 0)::integer AS acoes_op,
           ROUND(COALESCE(SUM(lm.receita_acoes), 0), 2) AS r_ac
    FROM public.lotes_mes lm, cfg
    WHERE lm.corretora = p_corretora AND lm.mes_ref = cfg.mes_ref
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
    (SELECT MAX(data) FROM public.lotes WHERE corretora = p_corretora),
    COALESCE(SUM(cl.lotes_12m), 0), ROUND(COALESCE(SUM(cl.receita_12m), 0), 2),
    (SELECT posicao FROM extra), (SELECT acoes_op FROM extra), (SELECT r_ac FROM extra),
    COUNT(*) FILTER (WHERE cl.risco IS NOT NULL)::integer
  FROM cfg LEFT JOIN cl ON true
  GROUP BY cfg.mes_ref;
$$;
REVOKE ALL ON FUNCTION public.painel_kpis(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.painel_kpis(text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.painel_kpis(text, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- 8. Conferência -------------------------------------------------------------------------------
-- Clientes em risco por corretora e tipo
SELECT c AS corretora, cl.risco, COUNT(*) AS clientes, ROUND(SUM(cl.receita_12m)) AS receita_12m
FROM (VALUES ('GENIAL'), ('XP'), ('BTG')) AS cs(c)
CROSS JOIN LATERAL public.clientes_lista(c) cl
WHERE cl.risco IS NOT NULL
GROUP BY 1, 2 ORDER BY 1, 2;

-- Os 10 maiores em risco da Genial
SELECT nome, risco, lotes_mes, lotes_mes_anterior, lotes_media_3m, ultimo_giro, dias_sem_giro, receita_12m
FROM public.clientes_risco('GENIAL', NULL, 10);

-- Valor do cliente: receita total e meses ativos (Genial, 10 maiores)
SELECT nome, status, receita_total, meses_ativos, primeiro_mes_giro, ROUND(receita_total / NULLIF(meses_ativos, 0)) AS receita_por_mes_ativo
FROM public.clientes_lista('GENIAL') ORDER BY receita_total DESC LIMIT 10;

-- Giro por dia do mês corrente (Genial)
SELECT * FROM public.giro_diario('GENIAL', date_trunc('month', public.brasil_hoje())::date, public.brasil_hoje());

-- KPIs com em_risco
SELECT mes_ref, ativos_mes, inativos, em_risco, ultima_data FROM public.painel_kpis('GENIAL');

-- Resumo do painel: contagem e lista dos em risco
SELECT (r->'resumo'->>'em_risco') AS em_risco, jsonb_array_length(r->'em_risco') AS listados
FROM public.painel_resumo('GENIAL') r;
