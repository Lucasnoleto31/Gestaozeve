-- ============================================================================
-- S51 · Funil: resultado do mês (ganhos, perdidos, contas novas, ativados, reativados e a receita por tipo)
-- Re-runnável. Rodar depois da S29 (lotes_mes) e da S47.
--
-- Lucas, 18/10/2026: "quero saber com precisão quantos ganhos tivemos, quantos ativados, quantos
-- reativados, quantos perdidos, e quanto os clientes novos geraram de receita no mês, quanto os
-- reativados deixaram, quanto os ativados deixaram". A safra (por mês de entrada do lead) não
-- responde isso; esta função conta pela DATA DO EVENTO dentro do mês:
--   ganhos / perdidos   leads fechados como Ganho / Perdido no mês (data_fechamento)
--   contas_novas        contas (cliente × corretora) migradas no mês (data de migração)
-- e classifica cada conta que OPEROU no mês em um tipo só, nesta ordem:
--   novo       conta migrada no próprio mês
--   reativado  voltou a operar N meses (de calendário) depois do último giro, ou da migração se nunca
--              tinha girado — a mesma regra da comissão (S41), N = p_meses_inativo (padrão 4)
--   ativado    primeira operação da conta, aberta antes do mês
--   carteira   os demais clientes que operaram
-- receita_* e lotes_* são a soma de lotes_mes (receita bruta: corretagem + zeragem + avulsas) por tipo;
-- receita_total = soma dos quatro.
-- ============================================================================
DROP FUNCTION IF EXISTS public.funil_resultado(date, integer, integer);
CREATE OR REPLACE FUNCTION public.funil_resultado(p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12, p_meses_inativo integer DEFAULT 4)
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
           GREATEST(COALESCE(p_meses_inativo, 4), 1) AS n_inativo
  ),
  meses AS MATERIALIZED (
    SELECT (cfg.mes_ref - (n || ' months')::interval)::date AS mes_ref
    FROM cfg, generate_series(0, GREATEST(p_meses, 1) - 1) AS n
  ),
  -- giro mensal por conta (cliente × corretora), todo o histórico
  lm AS MATERIALIZED (
    SELECT x.cliente_id, x.corretora, x.mes_ref, SUM(x.operados) AS operados, SUM(x.receita) AS receita
    FROM public.lotes_mes x
    WHERE x.cliente_id IS NOT NULL
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
    FROM public.v_cliente_corretora v
  ),
  giro AS MATERIALIZED (
    SELECT h.mes_ref, h.cliente_id, h.corretora, h.operados, h.receita,
           CASE WHEN v.mes_migracao = h.mes_ref THEN 'novo'
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

REVOKE ALL ON FUNCTION public.funil_resultado(date, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.funil_resultado(date, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.funil_resultado(date, integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Conferência: os últimos 6 meses; receita_total deve ser a soma das quatro receitas
SELECT mes_ref, ganhos, perdidos, contas_novas, novos_operaram, ativados, reativados, carteira_operou,
       receita_total, receita_novos + receita_ativados + receita_reativados + receita_carteira AS soma_receitas,
       receita_novos, receita_ativados, receita_reativados, receita_carteira
FROM public.funil_resultado(NULL, 6, 4);
