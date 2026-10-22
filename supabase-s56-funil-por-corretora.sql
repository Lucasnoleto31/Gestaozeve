-- ============================================================================
-- S56 · Funil: resultado do mês por corretora e "cliente novo" só sem giro anterior
-- Re-runnável. Rodar depois da S51 (funil_resultado). Substitui a função da S51 (assinatura nova).
--
-- Lucas, 22/10/2026: "quando eu mudo para BTG, continua os dados no funil da Genial; quero que separe
-- de cada um e depois mostre deles: clientes novos Genial x, clientes novos BTG y, e assim por diante".
-- O Funil é um só para o escritório; o bloco 1 (Resultado do mês) passa a mostrar cada corretora
-- separada e o total.
--
-- 1. funil_resultado ganha p_corretora (padrão NULL = todas, o comportamento de antes). Com a corretora,
--    contas novas, novos/ativados/reativados/carteira, lotes e receita saem só dela. Ganhos e perdidos são
--    leads fechados no mês e não têm corretora de destino: continuam sendo o total do escritório em
--    qualquer chamada (a tela não os mostra por corretora).
-- 2. Correção: "cliente novo" (conta migrada no próprio mês) só quando a conta nunca tinha girado antes.
--    Cliente que operava e abriu outra conta no mês (ou cuja conta antiga não é vista como migrada) não é
--    novo: entra em reativado ou carteira pela regra do giro. Caso achado: Victor de Santana (Genial,
--    migração 03/10/26, giro desde fevereiro) aparecia como cliente novo de outubro.
-- ============================================================================
DROP FUNCTION IF EXISTS public.funil_resultado(date, integer, integer);
DROP FUNCTION IF EXISTS public.funil_resultado(date, integer, integer, text);
CREATE OR REPLACE FUNCTION public.funil_resultado(p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12, p_meses_inativo integer DEFAULT 4, p_corretora text DEFAULT NULL)
RETURNS TABLE(
  mes_ref date, ganhos integer, perdidos integer,
  contas_novas integer, novos_operaram integer, ativados integer, reativados integer, carteira_operou integer,
  receita_total numeric, receita_novos numeric, receita_ativados numeric, receita_reativados numeric, receita_carteira numeric,
  lotes_total numeric, lotes_novos numeric, lotes_ativados numeric, lotes_reativados numeric, lotes_carteira numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref,
           (COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) - ((GREATEST(p_meses, 1) - 1) || ' months')::interval)::date AS mes_ini,
           GREATEST(COALESCE(p_meses_inativo, 4), 1) AS n_inativo,
           NULLIF(upper(trim(p_corretora)), '') AS corretora
  ),
  meses AS MATERIALIZED (
    SELECT (cfg.mes_ref - (n || ' months')::interval)::date AS mes_ref
    FROM cfg, generate_series(0, GREATEST(p_meses, 1) - 1) AS n
  ),
  -- giro mensal por conta (cliente × corretora), todo o histórico; só a corretora pedida, quando há
  lm AS MATERIALIZED (
    SELECT x.cliente_id, x.corretora, x.mes_ref, SUM(x.operados) AS operados, SUM(x.receita) AS receita
    FROM public.lotes_mes x CROSS JOIN cfg
    WHERE x.cliente_id IS NOT NULL AND (cfg.corretora IS NULL OR x.corretora = cfg.corretora)
    GROUP BY 1, 2, 3
  ),
  hist AS MATERIALIZED (
    SELECT h.*,
           MAX(h.mes_ref) FILTER (WHERE h.operados > 0)
             OVER (PARTITION BY h.cliente_id, h.corretora ORDER BY h.mes_ref ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS giro_anterior
    FROM lm h
  ),
  vc AS MATERIALIZED (
    SELECT v.cliente_id, v.corretora, v.status, date_trunc('month', v.data_migracao)::date AS mes_migracao
    FROM public.v_cliente_corretora v CROSS JOIN cfg
    WHERE cfg.corretora IS NULL OR v.corretora = cfg.corretora
  ),
  giro AS MATERIALIZED (
    SELECT h.mes_ref, h.cliente_id, h.corretora, h.operados, h.receita,
           CASE WHEN v.mes_migracao = h.mes_ref AND h.giro_anterior IS NULL THEN 'novo'
                WHEN h.giro_anterior IS NOT NULL AND h.mes_ref >= (h.giro_anterior + make_interval(months => cfg.n_inativo))::date THEN 'reativado'
                WHEN h.giro_anterior IS NULL AND v.mes_migracao IS NOT NULL AND h.mes_ref >= (v.mes_migracao + make_interval(months => cfg.n_inativo))::date THEN 'reativado'
                WHEN h.giro_anterior IS NULL THEN 'ativado'
                ELSE 'carteira' END AS tipo
    FROM hist h CROSS JOIN cfg
    LEFT JOIN vc v ON v.cliente_id = h.cliente_id AND v.corretora = h.corretora
    WHERE h.operados > 0 AND h.mes_ref BETWEEN cfg.mes_ini AND cfg.mes_ref
  ),
  novas AS (
    SELECT v.mes_migracao AS mes_ref, COUNT(*)::integer AS contas
    FROM vc v CROSS JOIN cfg
    WHERE v.status = 'Migrado' AND v.mes_migracao BETWEEN cfg.mes_ini AND cfg.mes_ref
    GROUP BY 1
  ),
  -- leads fechados no mês: total do escritório (um lead não tem corretora de destino)
  fech AS (
    SELECT date_trunc('month', l.data_fechamento)::date AS mes_ref,
           COUNT(*) FILTER (WHERE l.status = 'Ganho')::integer AS ganhos,
           COUNT(*) FILTER (WHERE l.status = 'Perdido')::integer AS perdidos
    FROM public.leads l CROSS JOIN cfg
    WHERE l.data_fechamento IS NOT NULL
      AND date_trunc('month', l.data_fechamento)::date BETWEEN cfg.mes_ini AND cfg.mes_ref
    GROUP BY 1
  ),
  agg AS (
    SELECT g.mes_ref,
           COUNT(*) FILTER (WHERE g.tipo = 'novo')::integer AS novos_operaram,
           COUNT(*) FILTER (WHERE g.tipo = 'ativado')::integer AS ativados,
           COUNT(*) FILTER (WHERE g.tipo = 'reativado')::integer AS reativados,
           COUNT(*) FILTER (WHERE g.tipo = 'carteira')::integer AS carteira_operou,
           SUM(g.receita) AS receita_total,
           SUM(g.receita) FILTER (WHERE g.tipo = 'novo') AS receita_novos,
           SUM(g.receita) FILTER (WHERE g.tipo = 'ativado') AS receita_ativados,
           SUM(g.receita) FILTER (WHERE g.tipo = 'reativado') AS receita_reativados,
           SUM(g.receita) FILTER (WHERE g.tipo = 'carteira') AS receita_carteira,
           SUM(g.operados) AS lotes_total,
           SUM(g.operados) FILTER (WHERE g.tipo = 'novo') AS lotes_novos,
           SUM(g.operados) FILTER (WHERE g.tipo = 'ativado') AS lotes_ativados,
           SUM(g.operados) FILTER (WHERE g.tipo = 'reativado') AS lotes_reativados,
           SUM(g.operados) FILTER (WHERE g.tipo = 'carteira') AS lotes_carteira
    FROM giro g
    GROUP BY 1
  )
  SELECT m.mes_ref,
         COALESCE(f.ganhos, 0), COALESCE(f.perdidos, 0),
         COALESCE(nv.contas, 0), COALESCE(a.novos_operaram, 0), COALESCE(a.ativados, 0), COALESCE(a.reativados, 0), COALESCE(a.carteira_operou, 0),
         ROUND(COALESCE(a.receita_total, 0), 2), ROUND(COALESCE(a.receita_novos, 0), 2), ROUND(COALESCE(a.receita_ativados, 0), 2),
         ROUND(COALESCE(a.receita_reativados, 0), 2), ROUND(COALESCE(a.receita_carteira, 0), 2),
         COALESCE(a.lotes_total, 0), COALESCE(a.lotes_novos, 0), COALESCE(a.lotes_ativados, 0), COALESCE(a.lotes_reativados, 0), COALESCE(a.lotes_carteira, 0)
  FROM meses m
  LEFT JOIN fech f ON f.mes_ref = m.mes_ref
  LEFT JOIN novas nv ON nv.mes_ref = m.mes_ref
  LEFT JOIN agg a ON a.mes_ref = m.mes_ref
  WHERE public.acesso_ok()
  ORDER BY m.mes_ref;
$$;

REVOKE ALL ON FUNCTION public.funil_resultado(date, integer, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.funil_resultado(date, integer, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.funil_resultado(date, integer, integer, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Conferência: o mês corrente por corretora e o total; a soma das corretoras deve dar o total
-- (ganhos e perdidos repetem o total do escritório em cada linha, por definição)
SELECT c.corretora, r.contas_novas, r.novos_operaram, r.ativados, r.reativados, r.carteira_operou, r.lotes_total, r.receita_total,
       r.receita_novos, r.receita_ativados, r.receita_reativados, r.receita_carteira
FROM (VALUES ('GENIAL'), ('XP'), ('BTG'), (NULL)) AS c(corretora)
CROSS JOIN LATERAL public.funil_resultado(NULL, 1, 4, c.corretora) r
ORDER BY c.corretora NULLS LAST;
