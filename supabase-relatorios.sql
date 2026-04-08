-- =============================================
-- ZeveAI — Funções de Relatórios
-- Execute no SQL Editor do Supabase
-- =============================================

-- 1. Receita por mês
CREATE OR REPLACE FUNCTION relatorio_receita_por_mes()
RETURNS TABLE(mes text, receita_genial numeric, bruto_aai numeric, imposto numeric, liquido_aai numeric, comissao_assessor numeric)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', data_receita), 'MM/YYYY') AS mes,
    ROUND(SUM(receita_genial)::numeric, 2),
    ROUND(SUM(valor_bruto_aai)::numeric, 2),
    ROUND(SUM(imposto)::numeric, 2),
    ROUND(SUM(valor_liquido_aai)::numeric, 2),
    ROUND(SUM(comissao_assessor)::numeric, 2)
  FROM public.receitas
  WHERE data_receita IS NOT NULL
  GROUP BY DATE_TRUNC('month', data_receita)
  ORDER BY DATE_TRUNC('month', data_receita);
$$;

-- 2. Receita por assessor
CREATE OR REPLACE FUNCTION relatorio_receita_por_assessor()
RETURNS TABLE(assessor text, receita_genial numeric, bruto_aai numeric, imposto numeric, liquido_aai numeric, comissao_assessor numeric)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    COALESCE(assessor_nome, 'Sem assessor') AS assessor,
    ROUND(SUM(receita_genial)::numeric, 2),
    ROUND(SUM(valor_bruto_aai)::numeric, 2),
    ROUND(SUM(imposto)::numeric, 2),
    ROUND(SUM(valor_liquido_aai)::numeric, 2),
    ROUND(SUM(comissao_assessor)::numeric, 2)
  FROM public.receitas
  GROUP BY COALESCE(assessor_nome, 'Sem assessor')
  ORDER BY SUM(valor_liquido_aai) DESC;
$$;

-- 3. Receita por influenciador
CREATE OR REPLACE FUNCTION relatorio_receita_por_influenciador()
RETURNS TABLE(influenciador text, num_clientes bigint, liquido_aai numeric)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    COALESCE(i.nome, 'Sem influenciador') AS influenciador,
    COUNT(DISTINCT r.cliente_id) AS num_clientes,
    ROUND(SUM(r.valor_liquido_aai)::numeric, 2) AS liquido_aai
  FROM public.receitas r
  LEFT JOIN public.clientes c ON r.cliente_id = c.id
  LEFT JOIN public.influenciadores i ON c.influenciador_id = i.id
  GROUP BY COALESCE(i.nome, 'Sem influenciador')
  ORDER BY SUM(r.valor_liquido_aai) DESC NULLS LAST;
$$;

-- 4. Receita por ativo (produto)
CREATE OR REPLACE FUNCTION relatorio_receita_por_ativo()
RETURNS TABLE(produto text, tipo_produto text, num_operacoes bigint, liquido_aai numeric)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    COALESCE(produto, 'Não informado') AS produto,
    COALESCE(tipo_produto, '') AS tipo_produto,
    COUNT(*) AS num_operacoes,
    ROUND(SUM(valor_liquido_aai)::numeric, 2) AS liquido_aai
  FROM public.receitas
  GROUP BY COALESCE(produto, 'Não informado'), COALESCE(tipo_produto, '')
  ORDER BY SUM(valor_liquido_aai) DESC NULLS LAST;
$$;

-- 5. Receita e lotes por plataforma (join receitas + contratos via cliente)
CREATE OR REPLACE FUNCTION relatorio_receita_por_plataforma()
RETURNS TABLE(plataforma text, liquido_aai numeric, lotes_operados numeric, lotes_zerados numeric, pct_zeramento numeric)
LANGUAGE sql SECURITY DEFINER AS $$
  WITH plataforma_cliente AS (
    SELECT DISTINCT ON (cliente_id)
      cliente_id,
      COALESCE(plataforma, 'Não informada') AS plataforma
    FROM public.contratos
    WHERE cliente_id IS NOT NULL
    ORDER BY cliente_id, data DESC NULLS LAST
  ),
  receita_plat AS (
    SELECT
      COALESCE(pc.plataforma, 'Não informada') AS plataforma,
      SUM(r.valor_liquido_aai) AS liquido_aai
    FROM public.receitas r
    LEFT JOIN plataforma_cliente pc ON r.cliente_id = pc.cliente_id
    GROUP BY COALESCE(pc.plataforma, 'Não informada')
  ),
  lotes_plat AS (
    SELECT
      COALESCE(plataforma, 'Não informada') AS plataforma,
      SUM(lotes_operados) AS lotes_operados,
      SUM(lotes_zerados) AS lotes_zerados
    FROM public.contratos
    GROUP BY COALESCE(plataforma, 'Não informada')
  )
  SELECT
    COALESCE(r.plataforma, l.plataforma, 'Não informada') AS plataforma,
    ROUND(COALESCE(r.liquido_aai, 0)::numeric, 2) AS liquido_aai,
    ROUND(COALESCE(l.lotes_operados, 0)::numeric, 2) AS lotes_operados,
    ROUND(COALESCE(l.lotes_zerados, 0)::numeric, 2) AS lotes_zerados,
    CASE WHEN COALESCE(l.lotes_operados, 0) > 0
      THEN ROUND((COALESCE(l.lotes_zerados, 0) / l.lotes_operados * 100)::numeric, 2)
      ELSE 0 END AS pct_zeramento
  FROM receita_plat r
  FULL OUTER JOIN lotes_plat l ON r.plataforma = l.plataforma
  ORDER BY COALESCE(r.liquido_aai, 0) DESC NULLS LAST;
$$;

-- 6. Contratos girados e zerados por mês
CREATE OR REPLACE FUNCTION relatorio_contratos_por_mes()
RETURNS TABLE(mes text, lotes_operados numeric, lotes_zerados numeric, pct_zeramento numeric)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', data), 'MM/YYYY') AS mes,
    ROUND(SUM(lotes_operados)::numeric, 2) AS lotes_operados,
    ROUND(SUM(lotes_zerados)::numeric, 2) AS lotes_zerados,
    CASE WHEN SUM(lotes_operados) > 0
      THEN ROUND((SUM(lotes_zerados) / SUM(lotes_operados) * 100)::numeric, 2)
      ELSE 0 END AS pct_zeramento
  FROM public.contratos
  WHERE data IS NOT NULL
  GROUP BY DATE_TRUNC('month', data)
  ORDER BY DATE_TRUNC('month', data);
$$;

-- 7. Top clientes por receita
CREATE OR REPLACE FUNCTION relatorio_top_clientes()
RETURNS TABLE(cliente text, cpf text, assessor text, liquido_aai numeric)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    COALESCE(c.nome, r.cliente_nome, 'Sem nome') AS cliente,
    COALESCE(c.cpf, r.cpf_cnpj, '') AS cpf,
    COALESCE(p.nome, r.assessor_nome, '') AS assessor,
    ROUND(SUM(r.valor_liquido_aai)::numeric, 2) AS liquido_aai
  FROM public.receitas r
  LEFT JOIN public.clientes c ON r.cliente_id = c.id
  LEFT JOIN public.profiles p ON c.assessor_id = p.id
  GROUP BY COALESCE(c.nome, r.cliente_nome, 'Sem nome'), COALESCE(c.cpf, r.cpf_cnpj, ''), COALESCE(p.nome, r.assessor_nome, '')
  ORDER BY SUM(r.valor_liquido_aai) DESC NULLS LAST
  LIMIT 100;
$$;

-- 8. Top clientes por risco (menor score CHS)
CREATE OR REPLACE FUNCTION relatorio_top_clientes_risco()
RETURNS TABLE(cliente text, cpf text, assessor text, score numeric, classificacao text, dias_sem_operar integer)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    c.nome AS cliente,
    c.cpf,
    COALESCE(p.nome, '') AS assessor,
    cs.score_total AS score,
    cs.classificacao,
    CASE WHEN cd.ultima_operacao IS NOT NULL
      THEN EXTRACT(DAY FROM NOW() - cd.ultima_operacao::timestamptz)::integer
      ELSE NULL END AS dias_sem_operar
  FROM public.clientes c
  LEFT JOIN public.profiles p ON c.assessor_id = p.id
  LEFT JOIN public.cliente_dados_chs cd ON cd.cliente_id = c.id
  LEFT JOIN LATERAL (
    SELECT score_total, classificacao
    FROM public.cliente_scores
    WHERE cliente_id = c.id
    ORDER BY created_at DESC
    LIMIT 1
  ) cs ON true
  WHERE cs.score_total IS NOT NULL
  ORDER BY cs.score_total ASC
  LIMIT 100;
$$;

-- 9. Top influenciadores
CREATE OR REPLACE FUNCTION relatorio_top_influenciadores()
RETURNS TABLE(influenciador text, codigo text, total_leads bigint, convertidos bigint, pct_conversao numeric, receita_gerada numeric)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    i.nome AS influenciador,
    i.codigo,
    COUNT(DISTINCT l.id) AS total_leads,
    COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'convertido') AS convertidos,
    CASE WHEN COUNT(DISTINCT l.id) > 0
      THEN ROUND((COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'convertido')::numeric / COUNT(DISTINCT l.id) * 100), 2)
      ELSE 0 END AS pct_conversao,
    ROUND(COALESCE(SUM(r.valor_liquido_aai), 0)::numeric, 2) AS receita_gerada
  FROM public.influenciadores i
  LEFT JOIN public.leads l ON l.influenciador_id = i.id
  LEFT JOIN public.clientes c ON c.influenciador_id = i.id
  LEFT JOIN public.receitas r ON r.cliente_id = c.id
  GROUP BY i.id, i.nome, i.codigo
  ORDER BY COALESCE(SUM(r.valor_liquido_aai), 0) DESC NULLS LAST;
$$;

-- 10. Churn por plataforma
CREATE OR REPLACE FUNCTION relatorio_churn_por_plataforma()
RETURNS TABLE(plataforma text, total_clientes bigint, risco_alto bigint, risco_medio bigint, risco_baixo bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  WITH ultima_plataforma AS (
    SELECT DISTINCT ON (cliente_id)
      cliente_id,
      COALESCE(plataforma, 'Não informada') AS plataforma
    FROM public.contratos
    WHERE cliente_id IS NOT NULL
    ORDER BY cliente_id, data DESC NULLS LAST
  ),
  ultimo_score AS (
    SELECT DISTINCT ON (cliente_id)
      cliente_id, score_total
    FROM public.cliente_scores
    ORDER BY cliente_id, created_at DESC
  ),
  risco AS (
    SELECT
      COALESCE(up.plataforma, 'Não informada') AS plataforma,
      CASE
        WHEN us.score_total < 40 THEN 'alto'
        WHEN us.score_total < 70 THEN 'medio'
        ELSE 'baixo'
      END AS nivel
    FROM public.clientes c
    LEFT JOIN ultima_plataforma up ON up.cliente_id = c.id
    INNER JOIN ultimo_score us ON us.cliente_id = c.id
  )
  SELECT
    plataforma,
    COUNT(*) AS total_clientes,
    COUNT(*) FILTER (WHERE nivel = 'alto') AS risco_alto,
    COUNT(*) FILTER (WHERE nivel = 'medio') AS risco_medio,
    COUNT(*) FILTER (WHERE nivel = 'baixo') AS risco_baixo
  FROM risco
  GROUP BY plataforma
  ORDER BY COUNT(*) DESC;
$$;

-- 11. Clientes por período (mês de cadastro)
CREATE OR REPLACE FUNCTION relatorio_clientes_por_periodo()
RETURNS TABLE(mes text, total bigint, ativos bigint, inativos bigint, em_transferencia bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', created_at), 'MM/YYYY') AS mes,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status = 'ativo') AS ativos,
    COUNT(*) FILTER (WHERE status = 'inativo') AS inativos,
    COUNT(*) FILTER (WHERE status = 'em_transferencia') AS em_transferencia
  FROM public.clientes
  GROUP BY DATE_TRUNC('month', created_at)
  ORDER BY DATE_TRUNC('month', created_at);
$$;

-- 12. Plataformas únicas e valor total por mês
CREATE OR REPLACE FUNCTION relatorio_plataformas_por_mes()
RETURNS TABLE(mes text, plataformas_unicas bigint, valor_total numeric)
LANGUAGE sql SECURITY DEFINER AS $$
  WITH plataforma_cliente AS (
    SELECT DISTINCT ON (cliente_id)
      cliente_id,
      COALESCE(plataforma, 'Não informada') AS plataforma
    FROM public.contratos
    WHERE cliente_id IS NOT NULL
    ORDER BY cliente_id, data DESC NULLS LAST
  )
  SELECT
    TO_CHAR(DATE_TRUNC('month', r.data_receita), 'MM/YYYY') AS mes,
    COUNT(DISTINCT pc.plataforma) AS plataformas_unicas,
    ROUND(SUM(r.valor_liquido_aai)::numeric, 2) AS valor_total
  FROM public.receitas r
  LEFT JOIN plataforma_cliente pc ON r.cliente_id = pc.cliente_id
  WHERE r.data_receita IS NOT NULL
  GROUP BY DATE_TRUNC('month', r.data_receita)
  ORDER BY DATE_TRUNC('month', r.data_receita);
$$;

-- 13. Cohort de contratos por dia do mês
CREATE OR REPLACE FUNCTION relatorio_cohort_contratos()
RETURNS TABLE(cohort_mes text, dia_num integer, lotes_operados numeric, lotes_zerados numeric, pct_zeramento numeric)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', data), 'MM/YYYY') AS cohort_mes,
    EXTRACT(DAY FROM data)::integer AS dia_num,
    ROUND(SUM(lotes_operados)::numeric, 2) AS lotes_operados,
    ROUND(SUM(lotes_zerados)::numeric, 2) AS lotes_zerados,
    CASE WHEN SUM(lotes_operados) > 0
      THEN ROUND((SUM(lotes_zerados) / SUM(lotes_operados) * 100)::numeric, 2)
      ELSE 0 END AS pct_zeramento
  FROM public.contratos
  WHERE data IS NOT NULL
  GROUP BY DATE_TRUNC('month', data), EXTRACT(DAY FROM data)::integer
  ORDER BY DATE_TRUNC('month', data), EXTRACT(DAY FROM data)::integer;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION relatorio_receita_por_mes() TO authenticated;
GRANT EXECUTE ON FUNCTION relatorio_receita_por_assessor() TO authenticated;
GRANT EXECUTE ON FUNCTION relatorio_receita_por_influenciador() TO authenticated;
GRANT EXECUTE ON FUNCTION relatorio_receita_por_ativo() TO authenticated;
GRANT EXECUTE ON FUNCTION relatorio_receita_por_plataforma() TO authenticated;
GRANT EXECUTE ON FUNCTION relatorio_contratos_por_mes() TO authenticated;
GRANT EXECUTE ON FUNCTION relatorio_top_clientes() TO authenticated;
GRANT EXECUTE ON FUNCTION relatorio_top_clientes_risco() TO authenticated;
GRANT EXECUTE ON FUNCTION relatorio_top_influenciadores() TO authenticated;
GRANT EXECUTE ON FUNCTION relatorio_churn_por_plataforma() TO authenticated;
GRANT EXECUTE ON FUNCTION relatorio_clientes_por_periodo() TO authenticated;
GRANT EXECUTE ON FUNCTION relatorio_plataformas_por_mes() TO authenticated;
GRANT EXECUTE ON FUNCTION relatorio_cohort_contratos() TO authenticated;
