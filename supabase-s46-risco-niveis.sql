-- ============================================================================
-- S46 · Cliente em risco corrigido + nível do cliente (Alto / Médio / Baixo) pela média de lotes
-- Re-runnável. Rodar depois da S44 (as funções abaixo são as da S44 com as mudanças marcadas).
--
-- Lucas, 13/10/2026: "cliente em risco não está funcionando corretamente e gostaria de classificar os
-- clientes por 3 níveis de acordo com a média de lotes nos últimos 3 meses".
--
-- 1. Risco: a S44 só avaliava quem já tinha girado no mês de referência (situação Ativo). Com
--    MesesInativo = 1, quem parou no fim do mês anterior já aparece como Inativo e ficava de fora:
--    em 13/10 eram 80 clientes da Genial com média de 20+ lotes/mês (um com média de 3.942 parado
--    desde 29/09). Agora o risco vale para todo cliente migrado que girou nos 3 meses anteriores ou
--    no mês: 'parou' = sem giro há risco_dias_parado dias ou mais (até o último dia lançado);
--    'em queda' = igual à S44.
-- 2. Nível: média de lotes/mês dos 3 meses anteriores ao de referência (lotes_media_3m):
--    Alto  = nivel_alto_lotes ou mais (padrão 1.000)
--    Médio = nivel_medio_lotes ou mais (padrão 100)
--    Baixo = abaixo disso, com algum giro; sem giro nos 3 meses = sem nível.
--    Os dois limites ficam em Parâmetros › Premissas, por corretora.
-- 3. Lista de risco e painel: os de nível mais alto primeiro; painel_resumo conta clientes por nível.
-- ============================================================================

-- 1. Parâmetros dos níveis
INSERT INTO public.parametros (corretora, chave, valor, descricao)
SELECT c, k, v, d FROM (VALUES ('GENIAL'), ('XP'), ('BTG')) AS cs(c)
CROSS JOIN (VALUES
  ('nivel_alto_lotes',  '1000', 'Nível Alto: média de lotes/mês nos 3 meses anteriores a partir deste valor'),
  ('nivel_medio_lotes', '100',  'Nível Médio: média de lotes/mês nos 3 meses anteriores a partir deste valor (abaixo é Baixo)')
) AS ps(k, v, d)
ON CONFLICT DO NOTHING;

-- 2. Lista de clientes: risco corrigido + nível --------------------------------------------------
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
  nivel text
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
    END AS nivel
  FROM q CROSS JOIN cfg2 cfg
  ORDER BY q.lotes_12m DESC, q.nome;
$$;
REVOKE ALL ON FUNCTION public.clientes_lista(text, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clientes_lista(text, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.clientes_lista(text, date, uuid) TO authenticated, service_role;

-- 3. Clientes em risco: nível mais alto primeiro ------------------------------------------------
DROP FUNCTION IF EXISTS public.clientes_risco(text, date, integer);
CREATE OR REPLACE FUNCTION public.clientes_risco(p_corretora text, p_mes_ref date DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS TABLE(
  cliente_id uuid, nome text, responsavel text, telefone text, risco text,
  lotes_mes numeric, lotes_mes_anterior numeric, lotes_media_3m numeric, receita_12m numeric,
  ultimo_giro date, dias_sem_giro integer, total integer, nivel text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT cl.cliente_id, cl.nome, cl.responsavel, cl.telefone, cl.risco,
         cl.lotes_mes, cl.lotes_mes_anterior, cl.lotes_media_3m, cl.receita_12m,
         cl.ultimo_giro, cl.dias_sem_giro,
         COUNT(*) OVER ()::integer AS total, cl.nivel
  FROM public.clientes_lista(p_corretora, p_mes_ref) cl
  WHERE cl.risco IS NOT NULL
  ORDER BY CASE cl.nivel WHEN 'Alto' THEN 1 WHEN 'Médio' THEN 2 WHEN 'Baixo' THEN 3 ELSE 4 END, cl.lotes_media_3m DESC, cl.receita_12m DESC, cl.nome
  LIMIT GREATEST(COALESCE(p_limit, 20), 1);
$$;
REVOKE ALL ON FUNCTION public.clientes_risco(text, date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clientes_risco(text, date, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.clientes_risco(text, date, integer) TO authenticated, service_role;

-- 4. Resumo do painel: contagem por nível e lista de risco por nível ------------------------------
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
      COUNT(*) FILTER (WHERE risco IS NOT NULL)::integer AS em_risco,
      COUNT(*) FILTER (WHERE nivel = 'Alto')::integer AS nivel_alto,
      COUNT(*) FILTER (WHERE nivel = 'Médio')::integer AS nivel_medio,
      COUNT(*) FILTER (WHERE nivel = 'Baixo')::integer AS nivel_baixo,
      COUNT(*) FILTER (WHERE risco IS NOT NULL AND nivel = 'Alto')::integer AS em_risco_alto
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
    -- os de nível mais alto primeiro (maior média de lotes dos 3 meses anteriores)
    SELECT cliente_id, nome, responsavel, telefone, risco, lotes_mes, lotes_mes_anterior, lotes_media_3m, receita_12m, ultimo_giro, dias_sem_giro, nivel,
           CASE nivel WHEN 'Alto' THEN 1 WHEN 'Médio' THEN 2 WHEN 'Baixo' THEN 3 ELSE 4 END AS ordem_nivel
    FROM cl WHERE risco IS NOT NULL
    ORDER BY ordem_nivel, lotes_media_3m DESC, receita_12m DESC, nome
    LIMIT 12
  )
  SELECT jsonb_build_object(
    'resumo', (SELECT to_jsonb(t) FROM tot t),
    'grupos', (SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.tipo, g.lotes_mes DESC, g.levados DESC, g.grupo), '[]'::jsonb) FROM grupos g),
    'sem_giro', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.data_migracao DESC NULLS LAST, s.nome), '[]'::jsonb) FROM sem_giro s),
    'em_risco', (SELECT COALESCE(jsonb_agg(to_jsonb(e) - 'ordem_nivel' ORDER BY e.ordem_nivel, e.lotes_media_3m DESC, e.receita_12m DESC, e.nome), '[]'::jsonb) FROM em_risco e)
  )
  WHERE public.acesso_ok();
$$;
REVOKE ALL ON FUNCTION public.painel_resumo(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.painel_resumo(text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.painel_resumo(text, date) TO authenticated, service_role;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('clientes_lista', 'clientes_risco', 'painel_resumo')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Conferência: clientes por nível e risco (Genial e BTG)
SELECT c AS corretora, COALESCE(cl.nivel, 'sem nível') AS nivel, COALESCE(cl.risco, '-') AS risco, COUNT(*) AS clientes,
       ROUND(AVG(cl.lotes_media_3m)) AS media_3m
FROM (VALUES ('GENIAL'), ('BTG')) AS cs(c)
CROSS JOIN LATERAL public.clientes_lista(c) cl
WHERE cl.status = 'Migrado'
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- Os 12 do painel da Genial (nível mais alto primeiro)
SELECT e->>'nome' AS nome, e->>'nivel' AS nivel, e->>'risco' AS risco, e->>'lotes_media_3m' AS media_3m, e->>'dias_sem_giro' AS dias_sem_giro
FROM jsonb_array_elements(public.painel_resumo('GENIAL')->'em_risco') e;
