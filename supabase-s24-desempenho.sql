-- ============================================================================
-- S24 · Páginas mais rápidas: agregados calculados no banco
-- Re-runnável. Rodar depois da S23.
--
-- Antes, o Painel e a ficha do cliente baixavam a lista inteira de clientes (1.578 linhas,
-- 0,8 MB por página de 1.000) só para somar e ranquear. Agora o banco devolve o resumo:
--   1. painel_resumo(): KPIs, grupos por assessor e por responsável e os "migrados sem giro"
--      numa única chamada (um só cálculo da lista).
--   2. painel_clientes_mensal(): opção de trazer só os N maiores clientes (mapa de calor).
--   3. cliente_contexto(): posição no ranking, receita total e média dos ativos para a ficha.
--   4. painel_kpis(): ganha lotes e receita de 12 meses.
-- ============================================================================

-- 1. Resumo do Painel em uma chamada (jsonb)
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
      AVG(dias_ate_migrar) AS media_dias_migrar
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
  )
  SELECT jsonb_build_object(
    'resumo', (SELECT to_jsonb(t) FROM tot t),
    'grupos', (SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.tipo, g.lotes_mes DESC, g.levados DESC, g.grupo), '[]'::jsonb) FROM grupos g),
    'sem_giro', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.data_migracao DESC NULLS LAST, s.nome), '[]'::jsonb) FROM sem_giro s)
  )
  WHERE public.acesso_ok();
$$;

-- 2. Lotes por cliente e mês, só os N maiores (p_top NULL = todos); total_clientes = quantos giraram na janela
DROP FUNCTION IF EXISTS public.painel_clientes_mensal(text, date, integer);
CREATE OR REPLACE FUNCTION public.painel_clientes_mensal(p_corretora text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12, p_top integer DEFAULT NULL)
RETURNS TABLE(cliente_id uuid, cliente_nome text, responsavel text, mes_ref date, lotes numeric, total_clientes integer)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref,
           (COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) - (p_meses || ' months')::interval)::date AS mes_ini
  ),
  base AS MATERIALIZED (
    SELECT v.cliente_id, MAX(v.cliente_nome) AS nome, MAX(v.responsavel) AS resp, v.mes_ref, SUM(v.lotes_operados) AS lotes
    FROM public.v_lotes v CROSS JOIN cfg
    WHERE v.corretora = p_corretora AND v.cliente_id IS NOT NULL
      AND v.mes_ref > cfg.mes_ini AND v.mes_ref <= cfg.mes_ref
    GROUP BY v.cliente_id, v.mes_ref
    HAVING SUM(v.lotes_operados) > 0
  ),
  tot AS MATERIALIZED (SELECT b.cliente_id, SUM(b.lotes) AS total FROM base b GROUP BY b.cliente_id),
  escolhidos AS (SELECT t.cliente_id FROM tot t ORDER BY t.total DESC, t.cliente_id LIMIT COALESCE(p_top, 2147483647))
  SELECT b.cliente_id, b.nome, b.resp, b.mes_ref, b.lotes, (SELECT COUNT(*) FROM tot)::integer
  FROM base b
  JOIN escolhidos e ON e.cliente_id = b.cliente_id
  WHERE public.acesso_ok()
  ORDER BY 1, 4;
$$;

-- 3. Contexto do cliente na ficha: posição no ranking de lotes 12 m, receita total e média dos ativos no mês
CREATE OR REPLACE FUNCTION public.cliente_contexto(p_corretora text, p_cliente_id uuid, p_mes_ref date DEFAULT NULL)
RETURNS TABLE(posicao integer, com_giro integer, receita_total_mes numeric, media_lotes_ativos numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cl AS MATERIALIZED (SELECT c.cliente_id, c.nome, c.lotes_12m, c.lotes_mes, c.receita_mes FROM public.clientes_lista(p_corretora, p_mes_ref) c),
  rk AS (SELECT cliente_id, ROW_NUMBER() OVER (ORDER BY lotes_12m DESC, nome) AS pos FROM cl WHERE lotes_12m > 0)
  SELECT
    (SELECT r.pos FROM rk r WHERE r.cliente_id = p_cliente_id)::integer,
    (SELECT COUNT(*) FROM rk)::integer,
    (SELECT ROUND(COALESCE(SUM(receita_mes), 0), 2) FROM cl),
    (SELECT AVG(lotes_mes) FROM cl WHERE lotes_mes > 0)
  WHERE public.acesso_ok();
$$;

-- 4. painel_kpis com lotes e receita de 12 meses
DROP FUNCTION IF EXISTS public.painel_kpis(text, date);
CREATE OR REPLACE FUNCTION public.painel_kpis(p_corretora text, p_mes_ref date DEFAULT NULL)
RETURNS TABLE(
  mes_ref date, clientes_levados integer, total_contas integer, migrados integer, em_processamento integer, recusaram integer,
  ativos_mes integer, lotes_mes numeric, zerados_mes numeric, receita_mes numeric, incentivo_mes numeric, clientes_com_faixa integer,
  migrados_sem_giro integer, inativos integer, com_alertas integer, migrados_sem_data integer, multi_conta integer,
  linhas_nao_cadastradas integer, lotes_nao_cadastrados numeric, ultima_data date,
  lotes_12m numeric, receita_12m numeric
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
    (SELECT MAX(data) FROM public.lotes WHERE corretora = p_corretora),
    COALESCE(SUM(cl.lotes_12m), 0), ROUND(COALESCE(SUM(cl.receita_12m), 0), 2)
  FROM cfg LEFT JOIN cl ON true
  GROUP BY cfg.mes_ref;
$$;

-- Permissões e recarga do cache da API
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('painel_resumo', 'painel_clientes_mensal', 'cliente_contexto', 'painel_kpis')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Conferência de tempo
EXPLAIN (ANALYZE, SUMMARY) SELECT public.painel_resumo('GENIAL');
EXPLAIN (ANALYZE, SUMMARY) SELECT COUNT(*) FROM public.painel_clientes_mensal('GENIAL', NULL, 12, 80);
SELECT * FROM public.cliente_contexto('GENIAL', (SELECT cliente_id FROM public.v_cliente_corretora WHERE corretora = 'GENIAL' LIMIT 1));
