-- ============================================================================
-- S43 · Comissão de parceiros: responsável interno atribui o cliente + receita das contas por mês
-- Re-runnável. Rodar depois da S41 e da S42.
--
-- Lucas, 09/10/2026:
-- 1. Os clientes que o Aikon levou foram marcados com responsável Aikon na ficha, alguns em outras
--    assessorias. Se o responsável interno é o Aikon, o cliente conta como dele (abertura, ativação e
--    reativação) mesmo fora da ZEVE INVESTIMENTOS 18. Responsável efetivo = o da ficha, senão o do
--    assessor (mesma regra da lista de clientes). Quarta origem: ficha (parceiro) > assessor (parceiro)
--    > responsável > lead.
-- 2. A tela de comissões passa a ser por mês: contas abertas, ativadas e reativadas, quais são as
--    contas de cada mês, a receita bruta que geraram (corretagem + zeragem + operações avulsas, do
--    resumo mensal lotes_mes, antes de repasse e impostos), a comissão do parceiro e o que sobrou
--    para o escritório. Novas: comissao_contas_mes (um evento por linha com a receita da conta) e
--    comissao_mensal com contas_mes, receita_contas e receita_carteira.
-- ============================================================================

-- 1. Base: contas do parceiro, agora também pelo responsável interno ------------------------------
CREATE OR REPLACE FUNCTION public.comissao_base(p_parceiro text, p_corretora text DEFAULT NULL)
RETURNS TABLE(
  cliente_id uuid, nome text, corretora text, origem text, data_lead date, assessor_nome text, status text,
  data_migracao date, data_abertura date, prazo_dias integer, reativacao_meses integer
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH atrib AS (
    -- lead do parceiro que virou cliente (vale em qualquer corretora)
    SELECT l.cliente_id, NULL::text AS corretora, 'lead'::text AS origem,
           MIN((l.data_hora AT TIME ZONE 'America/Sao_Paulo')::date) AS data_lead, NULL::text AS assessor_nome
    FROM public.leads l
    WHERE l.cliente_id IS NOT NULL AND public.norm_texto(l.responsavel) = public.norm_texto(p_parceiro)
    GROUP BY l.cliente_id
    UNION ALL
    -- parceiro marcado na ficha do cliente (só naquela corretora)
    SELECT m.cliente_id, m.corretora, 'parceiro', NULL, NULL
    FROM public.cliente_corretora m
    WHERE public.norm_texto(m.parceiro) = public.norm_texto(p_parceiro)
    UNION ALL
    -- cliente de um assessor ligado ao parceiro (só naquela corretora)
    SELECT vc.cliente_id, vc.corretora, 'assessor', NULL, a.nome
    FROM public.v_cliente_corretora vc
    JOIN public.assessores a ON a.corretora = vc.corretora AND a.nome_norm = vc.assessor_norm
    WHERE public.norm_texto(a.parceiro) = public.norm_texto(p_parceiro)
    UNION ALL
    -- responsável interno = parceiro (na ficha ou herdado do assessor), só naquela corretora
    SELECT vc.cliente_id, vc.corretora, 'responsavel', NULL, a.nome
    FROM public.v_cliente_corretora vc
    LEFT JOIN public.assessores a ON a.corretora = vc.corretora AND a.nome_norm = vc.assessor_norm
    WHERE public.norm_texto(COALESCE(vc.responsavel, a.responsavel)) = public.norm_texto(p_parceiro)
  ),
  base AS (
    -- uma origem por cliente × corretora: ficha > assessor > responsável > lead (só o lead exige migração depois dele)
    SELECT DISTINCT ON (vc.cliente_id, vc.corretora)
           vc.cliente_id, vc.corretora, a.origem, a.data_lead, a.assessor_nome, vc.status, vc.data_migracao,
           CASE WHEN vc.status = 'Migrado' AND vc.data_migracao IS NOT NULL
                 AND (a.origem <> 'lead' OR a.data_lead IS NULL OR vc.data_migracao >= a.data_lead - 30)
                THEN vc.data_migracao END AS data_abertura
    FROM atrib a
    JOIN public.v_cliente_corretora vc ON vc.cliente_id = a.cliente_id AND (a.corretora IS NULL OR a.corretora = vc.corretora)
    WHERE p_corretora IS NULL OR vc.corretora = p_corretora
    ORDER BY vc.cliente_id, vc.corretora, (a.origem = 'parceiro') DESC, (a.origem = 'assessor') DESC, (a.origem = 'responsavel') DESC
  ),
  regras AS (
    SELECT x.* FROM public.comissao_regras x WHERE public.norm_texto(x.parceiro) = public.norm_texto(p_parceiro)
  )
  SELECT b.cliente_id, cl.nome, b.corretora, b.origem, b.data_lead, b.assessor_nome, b.status, b.data_migracao, b.data_abertura,
         COALESCE(ra.prazo_ativacao_dias, ru.prazo_ativacao_dias, 60),   -- prazo: regra vigente na abertura, senão a atual
         COALESCE(ru.reativacao_meses, ra.reativacao_meses, 4)           -- inatividade: regra atual
  FROM base b
  JOIN public.clientes cl ON cl.id = b.cliente_id
  LEFT JOIN LATERAL (
    SELECT r.prazo_ativacao_dias, r.reativacao_meses FROM regras r
    WHERE r.corretora = b.corretora AND r.vigencia <= COALESCE(b.data_abertura, public.brasil_hoje())
    ORDER BY r.vigencia DESC LIMIT 1
  ) ra ON true
  LEFT JOIN LATERAL (
    SELECT r.prazo_ativacao_dias, r.reativacao_meses FROM regras r
    WHERE r.corretora = b.corretora AND r.vigencia <= public.brasil_hoje()
    ORDER BY r.vigencia DESC LIMIT 1
  ) ru ON true
  WHERE public.acesso_ok();
$$;

-- 2. Contas de cada mês: um evento por linha, com a receita bruta que a conta gerou -------------------
DROP FUNCTION IF EXISTS public.comissao_contas_mes(text, text, date, integer);
CREATE OR REPLACE FUNCTION public.comissao_contas_mes(p_parceiro text, p_corretora text DEFAULT NULL, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(
  mes_ref date, cliente_id uuid, nome text, corretora text, origem text, assessor_nome text,
  tipo text, data date, valor numeric, lotes_mes numeric, receita_mes numeric, receita_desde numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref,
           (COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) - (GREATEST(p_meses, 1) || ' months')::interval)::date AS mes_ini
  ),
  ev AS (
    SELECT e.* FROM public.comissao_eventos(p_parceiro, p_corretora) e CROSS JOIN cfg
    WHERE e.mes_ref > cfg.mes_ini AND e.mes_ref <= cfg.mes_ref
  ),
  rec AS (
    -- receita bruta da conta por mês (corretagem + zeragem + operações avulsas), do resumo mensal
    SELECT lm.cliente_id, lm.corretora, lm.mes_ref, SUM(lm.receita) AS receita, SUM(lm.operados) AS operados
    FROM public.lotes_mes lm
    WHERE lm.cliente_id IN (SELECT DISTINCT e.cliente_id FROM ev e)
    GROUP BY 1, 2, 3
  )
  SELECT e.mes_ref, e.cliente_id, e.nome, e.corretora, e.origem, e.assessor_nome, e.tipo, e.data, e.valor,
         COALESCE(rm.operados, 0),
         ROUND(COALESCE(rm.receita, 0), 2),
         ROUND(COALESCE((SELECT SUM(r2.receita) FROM rec r2
                          WHERE r2.cliente_id = e.cliente_id AND r2.corretora = e.corretora AND r2.mes_ref >= e.mes_ref), 0), 2)
  FROM ev e
  LEFT JOIN rec rm ON rm.cliente_id = e.cliente_id AND rm.corretora = e.corretora AND rm.mes_ref = e.mes_ref
  WHERE public.acesso_ok()
  ORDER BY e.mes_ref DESC, e.data DESC, e.nome;
$$;

-- 3. Por mês: eventos, comissão, contas do mês com a receita delas e receita da carteira inteira ------
DROP FUNCTION IF EXISTS public.comissao_mensal(date, integer, text, text);
CREATE OR REPLACE FUNCTION public.comissao_mensal(p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12, p_parceiro text DEFAULT NULL, p_corretora text DEFAULT NULL)
RETURNS TABLE(
  mes_ref date, parceiro text, corretora text, aberturas integer, ativacoes integer, reativacoes integer,
  valor_abertura numeric, valor_ativacao numeric, contas_mes integer, receita_contas numeric, receita_carteira numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref,
           (COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) - (GREATEST(p_meses, 1) || ' months')::interval)::date AS mes_ini
  ),
  parceiros AS (
    SELECT r.nome FROM public.responsaveis r
    WHERE r.comissionado AND (p_parceiro IS NULL OR public.norm_texto(r.nome) = public.norm_texto(p_parceiro))
  ),
  ev AS (
    SELECT p.nome AS parceiro, e.cliente_id, e.corretora, e.tipo, e.mes_ref, e.valor
    FROM parceiros p CROSS JOIN LATERAL public.comissao_eventos(p.nome, p_corretora) e CROSS JOIN cfg
    WHERE e.mes_ref > cfg.mes_ini AND e.mes_ref <= cfg.mes_ref
  ),
  base AS (
    -- carteira do parceiro (contas migradas), para a receita da carteira por mês
    SELECT DISTINCT p.nome AS parceiro, b.cliente_id, b.corretora
    FROM parceiros p CROSS JOIN LATERAL public.comissao_base(p.nome, p_corretora) b
    WHERE b.status = 'Migrado'
  ),
  rec AS (
    SELECT lm.cliente_id, lm.corretora, lm.mes_ref, SUM(lm.receita) AS receita
    FROM public.lotes_mes lm CROSS JOIN cfg
    WHERE lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref
      AND lm.cliente_id IN (SELECT b.cliente_id FROM base b)
    GROUP BY 1, 2, 3
  ),
  contas AS (
    -- contas distintas com evento no mês (a receita da conta entra uma vez, mesmo com dois eventos)
    SELECT DISTINCT e.parceiro, e.corretora, e.mes_ref, e.cliente_id FROM ev e
  ),
  rc AS (
    SELECT c.parceiro, c.corretora, c.mes_ref, COUNT(*)::integer AS contas_mes, SUM(COALESCE(r.receita, 0)) AS receita_contas
    FROM contas c
    LEFT JOIN rec r ON r.cliente_id = c.cliente_id AND r.corretora = c.corretora AND r.mes_ref = c.mes_ref
    GROUP BY 1, 2, 3
  ),
  rk AS (
    SELECT b.parceiro, b.corretora, r.mes_ref, SUM(r.receita) AS receita_carteira
    FROM base b JOIN rec r ON r.cliente_id = b.cliente_id AND r.corretora = b.corretora
    GROUP BY 1, 2, 3
  ),
  agg AS (
    SELECT e.mes_ref, e.parceiro, e.corretora,
           COUNT(*) FILTER (WHERE e.tipo = 'abertura')::integer AS aberturas,
           COUNT(*) FILTER (WHERE e.tipo = 'ativacao')::integer AS ativacoes,
           COUNT(*) FILTER (WHERE e.tipo = 'reativacao')::integer AS reativacoes,
           COALESCE(SUM(e.valor) FILTER (WHERE e.tipo = 'abertura'), 0) AS valor_abertura,
           COALESCE(SUM(e.valor) FILTER (WHERE e.tipo <> 'abertura'), 0) AS valor_ativacao
    FROM ev e GROUP BY 1, 2, 3
  ),
  chaves AS (
    SELECT a.mes_ref, a.parceiro, a.corretora FROM agg a
    UNION
    SELECT k.mes_ref, k.parceiro, k.corretora FROM rk k
  )
  SELECT k.mes_ref, k.parceiro, k.corretora,
         COALESCE(a.aberturas, 0), COALESCE(a.ativacoes, 0), COALESCE(a.reativacoes, 0),
         ROUND(COALESCE(a.valor_abertura, 0), 2), ROUND(COALESCE(a.valor_ativacao, 0), 2),
         COALESCE(rc.contas_mes, 0), ROUND(COALESCE(rc.receita_contas, 0), 2), ROUND(COALESCE(rk.receita_carteira, 0), 2)
  FROM chaves k
  LEFT JOIN agg a ON a.mes_ref = k.mes_ref AND a.parceiro = k.parceiro AND a.corretora = k.corretora
  LEFT JOIN rc ON rc.mes_ref = k.mes_ref AND rc.parceiro = k.parceiro AND rc.corretora = k.corretora
  LEFT JOIN rk ON rk.mes_ref = k.mes_ref AND rk.parceiro = k.parceiro AND rk.corretora = k.corretora
  WHERE public.acesso_ok()
  ORDER BY 1, 2, 3;
$$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('comissao_base', 'comissao_contas_mes', 'comissao_mensal')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Conferência: contas do Aikon por origem, o mês a mês e as contas de setembro com a receita delas
SELECT origem, corretora, COUNT(*) AS contas FROM public.comissao_base('Aikon') GROUP BY 1, 2 ORDER BY 1, 2;

SELECT * FROM public.comissao_mensal(NULL, 12, 'Aikon');

SELECT tipo, data, nome, valor, lotes_mes, receita_mes, receita_desde
FROM public.comissao_contas_mes('Aikon', NULL, DATE '2026-09-01', 1)
ORDER BY data, nome;
