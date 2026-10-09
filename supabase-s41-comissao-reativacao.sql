-- ============================================================================
-- S41 · Comissão de parceiros: reativação conta como ativação
-- Re-runnável. Rodar depois da S40.
--
-- Lucas, 09/10/2026: cliente inativo que o parceiro faz voltar a operar é contabilizado como
-- ativação. Regra: cliente da base do parceiro que fica N meses sem girar (reativacao_meses da regra,
-- padrão 4; meses de calendário, como o "meses sem giro" da lista de clientes) e volta a operar gera um
-- evento "reativacao", pago com o valor da ativação e contado na meta de ativações do mês. Vale quantas
-- vezes acontecer. Conta dormente (abriu, nunca girou e girou pela primeira vez N meses depois) também
-- conta: a parada é medida a partir do último giro ou, se nunca girou, da migração. A primeira operação
-- dentro do prazo continua sendo a ativação normal (nunca as duas no mesmo dia). Lead do parceiro cuja
-- conta é anterior ao lead não gera abertura, mas gera reativação a partir da data do lead.
-- O valor de cada evento segue a regra vigente NA DATA DO EVENTO (antes era a regra da abertura).
--
-- O cálculo passa a ser por evento: comissao_base (quem é do parceiro) → comissao_eventos
-- (abertura, ativacao, reativacao, com o valor pela faixa do mês e pela regra vigente na data
-- do evento) → comissao_itens (uma linha por conta) e comissao_mensal (por mês).
-- ============================================================================

ALTER TABLE public.comissao_regras ADD COLUMN IF NOT EXISTS reativacao_meses integer NOT NULL DEFAULT 4;   -- meses sem giro para a volta contar como ativação

-- 1. Base: contas do parceiro, uma por cliente × corretora --------------------------------------
DROP FUNCTION IF EXISTS public.comissao_base(text, text);
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
  ),
  base AS (
    -- uma origem por cliente × corretora: ficha > assessor > lead (só o lead exige migração depois dele)
    SELECT DISTINCT ON (vc.cliente_id, vc.corretora)
           vc.cliente_id, vc.corretora, a.origem, a.data_lead, a.assessor_nome, vc.status, vc.data_migracao,
           CASE WHEN vc.status = 'Migrado' AND vc.data_migracao IS NOT NULL
                 AND (a.origem <> 'lead' OR a.data_lead IS NULL OR vc.data_migracao >= a.data_lead - 30)
                THEN vc.data_migracao END AS data_abertura
    FROM atrib a
    JOIN public.v_cliente_corretora vc ON vc.cliente_id = a.cliente_id AND (a.corretora IS NULL OR a.corretora = vc.corretora)
    WHERE p_corretora IS NULL OR vc.corretora = p_corretora
    ORDER BY vc.cliente_id, vc.corretora, (a.origem = 'parceiro') DESC, (a.origem = 'assessor') DESC
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

-- 2. Eventos: abertura, ativação (1ª operação no prazo) e reativação (volta depois de N meses) ----
DROP FUNCTION IF EXISTS public.comissao_eventos(text, text);
CREATE OR REPLACE FUNCTION public.comissao_eventos(p_parceiro text, p_corretora text DEFAULT NULL)
RETURNS TABLE(cliente_id uuid, nome text, corretora text, origem text, assessor_nome text, tipo text, data date, mes_ref date, valor numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH b AS (
    -- contas migradas do parceiro; a conta anterior ao lead entra só para a reativação
    SELECT * FROM public.comissao_base(p_parceiro, p_corretora) WHERE status = 'Migrado' AND data_migracao IS NOT NULL
  ),
  dias AS (
    -- dias com operação (toda a história da conta), com o dia anterior para medir o intervalo
    SELECT b.cliente_id, b.corretora, d.data,
           LAG(d.data) OVER (PARTITION BY b.cliente_id, b.corretora ORDER BY d.data) AS dia_anterior
    FROM b
    JOIN LATERAL (
      SELECT DISTINCT v.data FROM public.v_lotes v
      WHERE v.cliente_id = b.cliente_id AND v.corretora = b.corretora AND v.lotes_operados > 0
    ) d ON true
  ),
  ativ AS (
    -- ativação: primeira operação depois da abertura, dentro do prazo
    SELECT d.cliente_id, d.corretora, MIN(d.data) AS data
    FROM dias d JOIN b ON b.cliente_id = d.cliente_id AND b.corretora = d.corretora
    WHERE b.data_abertura IS NOT NULL AND d.data >= b.data_abertura
    GROUP BY 1, 2, b.data_abertura, b.prazo_dias
    HAVING MIN(d.data) <= b.data_abertura + b.prazo_dias
  ),
  eventos AS (
    SELECT b.cliente_id, b.corretora, 'abertura'::text AS tipo, b.data_abertura AS data FROM b WHERE b.data_abertura IS NOT NULL
    UNION ALL
    SELECT a.cliente_id, a.corretora, 'ativacao', a.data FROM ativ a
    UNION ALL
    -- reativação: voltou a girar N meses (de calendário) depois do último giro, ou da migração se nunca girou.
    -- Só não conta no dia da ativação de verdade (1ª operação dentro do prazo): a conta dormente, cuja
    -- 1ª operação veio fora do prazo e N meses depois da migração, conta como reativação.
    SELECT b.cliente_id, b.corretora, 'reativacao', d.data
    FROM b
    JOIN dias d ON d.cliente_id = b.cliente_id AND d.corretora = b.corretora
    LEFT JOIN ativ a ON a.cliente_id = b.cliente_id AND a.corretora = b.corretora
    WHERE d.data > b.data_migracao
      AND (b.data_abertura IS NOT NULL OR b.data_lead IS NULL OR d.data >= b.data_lead)   -- conta anterior ao lead: só depois do lead
      AND date_trunc('month', d.data) >= date_trunc('month', COALESCE(d.dia_anterior, b.data_migracao)) + make_interval(months => b.reativacao_meses)
      AND (a.data IS NULL OR d.data <> a.data)
  ),
  com_mes AS (
    SELECT e.*, date_trunc('month', e.data)::date AS mes_ref FROM eventos e
  ),
  cont AS (
    -- quantos no mês: a faixa alcançada vale para todos os eventos daquele mês
    SELECT m.*,
           COUNT(*) FILTER (WHERE m.tipo = 'abertura') OVER (PARTITION BY m.corretora, m.mes_ref) AS n_abertura,
           COUNT(*) FILTER (WHERE m.tipo <> 'abertura') OVER (PARTITION BY m.corretora, m.mes_ref) AS n_ativacao
    FROM com_mes m
  ),
  regras AS (
    SELECT x.* FROM public.comissao_regras x WHERE public.norm_texto(x.parceiro) = public.norm_texto(p_parceiro)
  )
  SELECT c.cliente_id, b.nome, c.corretora, b.origem, b.assessor_nome, c.tipo, c.data, c.mes_ref,
         CASE WHEN c.tipo = 'abertura' THEN public.comissao_faixa(r.metas_abertura, c.n_abertura::integer)
              ELSE public.comissao_faixa(r.metas_ativacao, c.n_ativacao::integer) END
  FROM cont c
  JOIN b ON b.cliente_id = c.cliente_id AND b.corretora = c.corretora
  LEFT JOIN LATERAL (
    -- a regra vigente na data do evento (reativação de conta antiga usa a regra de hoje)
    SELECT x.metas_abertura, x.metas_ativacao FROM regras x
    WHERE x.corretora = c.corretora AND x.vigencia <= c.data
    ORDER BY x.vigencia DESC LIMIT 1
  ) r ON true
  WHERE public.acesso_ok()
  ORDER BY c.data DESC, b.nome;
$$;

-- 3. Uma linha por conta, com os eventos somados ---------------------------------------------------
DROP FUNCTION IF EXISTS public.comissao_itens(text, text);
CREATE OR REPLACE FUNCTION public.comissao_itens(p_parceiro text, p_corretora text DEFAULT NULL)
RETURNS TABLE(
  cliente_id uuid, nome text, corretora text, origem text, data_lead date, status text,
  data_abertura date, data_ativacao date, prazo_dias integer, limite_ativacao date, ativou_no_prazo boolean,
  mes_abertura date, mes_ativacao date, valor_abertura numeric, valor_ativacao numeric, situacao text,
  assessor_nome text, reativacoes integer, ultima_reativacao date
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH b AS (SELECT * FROM public.comissao_base(p_parceiro, p_corretora)),
  ev AS (
    SELECT e.cliente_id, e.corretora,
           SUM(e.valor) FILTER (WHERE e.tipo = 'abertura') AS valor_abertura,
           SUM(e.valor) FILTER (WHERE e.tipo <> 'abertura') AS valor_ativacao,
           MIN(e.data) FILTER (WHERE e.tipo = 'ativacao') AS data_ativacao_prazo,
           COUNT(*) FILTER (WHERE e.tipo = 'reativacao')::integer AS reativacoes,
           MAX(e.data) FILTER (WHERE e.tipo = 'reativacao') AS ultima_reativacao
    FROM public.comissao_eventos(p_parceiro, p_corretora) e
    GROUP BY 1, 2
  ),
  prim AS (
    SELECT b.cliente_id, b.corretora,
           (SELECT MIN(v.data) FROM public.v_lotes v
             WHERE v.cliente_id = b.cliente_id AND v.corretora = b.corretora AND v.lotes_operados > 0 AND v.data >= b.data_abertura) AS data_ativacao
    FROM b WHERE b.data_abertura IS NOT NULL
  )
  SELECT b.cliente_id, b.nome, b.corretora, b.origem, b.data_lead, b.status,
         b.data_abertura, p.data_ativacao, b.prazo_dias, b.data_abertura + b.prazo_dias, (ev.data_ativacao_prazo IS NOT NULL),
         date_trunc('month', b.data_abertura)::date, date_trunc('month', ev.data_ativacao_prazo)::date,
         COALESCE(ev.valor_abertura, 0), COALESCE(ev.valor_ativacao, 0),
         CASE WHEN ev.data_ativacao_prazo IS NOT NULL THEN 'Ativado'
              WHEN COALESCE(ev.reativacoes, 0) > 0 THEN 'Reativado'
              WHEN b.data_abertura IS NULL THEN (CASE WHEN b.status = 'Migrado' THEN 'Conta anterior ao lead' ELSE b.status END)
              WHEN p.data_ativacao IS NOT NULL THEN 'Operou fora do prazo'
              WHEN public.brasil_hoje() <= b.data_abertura + b.prazo_dias THEN 'Aberto, no prazo'
              ELSE 'Prazo vencido' END,
         b.assessor_nome, COALESCE(ev.reativacoes, 0), ev.ultima_reativacao
  FROM b
  LEFT JOIN ev ON ev.cliente_id = b.cliente_id AND ev.corretora = b.corretora
  LEFT JOIN prim p ON p.cliente_id = b.cliente_id AND p.corretora = b.corretora
  WHERE public.acesso_ok()
  ORDER BY b.data_abertura DESC NULLS LAST, b.nome;
$$;

-- 4. Por mês: aberturas, ativações, reativações e valores -----------------------------------------
DROP FUNCTION IF EXISTS public.comissao_mensal(date, integer, text, text);
CREATE OR REPLACE FUNCTION public.comissao_mensal(p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12, p_parceiro text DEFAULT NULL, p_corretora text DEFAULT NULL)
RETURNS TABLE(mes_ref date, parceiro text, corretora text, aberturas integer, ativacoes integer, reativacoes integer, valor_abertura numeric, valor_ativacao numeric)
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
    SELECT p.nome AS parceiro, e.corretora, e.tipo, e.mes_ref, e.valor
    FROM parceiros p CROSS JOIN LATERAL public.comissao_eventos(p.nome, p_corretora) e
  )
  SELECT e.mes_ref, e.parceiro, e.corretora,
         COUNT(*) FILTER (WHERE e.tipo = 'abertura')::integer,
         COUNT(*) FILTER (WHERE e.tipo = 'ativacao')::integer,
         COUNT(*) FILTER (WHERE e.tipo = 'reativacao')::integer,
         ROUND(COALESCE(SUM(e.valor) FILTER (WHERE e.tipo = 'abertura'), 0), 2),
         ROUND(COALESCE(SUM(e.valor) FILTER (WHERE e.tipo <> 'abertura'), 0), 2)
  FROM ev e CROSS JOIN cfg
  WHERE e.mes_ref > cfg.mes_ini AND e.mes_ref <= cfg.mes_ref AND public.acesso_ok()
  GROUP BY 1, 2, 3
  ORDER BY 1, 2, 3;
$$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('comissao_base', 'comissao_eventos', 'comissao_itens', 'comissao_mensal')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Conferência: eventos do Aikon por tipo e mês, e as reativações mais recentes (esperado em set/26:
-- 3 aberturas, 4 ativações e pelo menos 3 reativações — Ramer Dinucci 16/09, Lucas Lina 03/09, Saulo Roveres 30/09).
-- Correção 09/10 (2ª rodada): a 1ª versão excluía da reativação qualquer 1ª operação, e as contas dormentes
-- ficavam de fora (0 reativações); agora só o dia da ativação dentro do prazo é excluído.
SELECT mes_ref, corretora, tipo, COUNT(*) AS eventos, SUM(valor) AS valor
FROM public.comissao_eventos('Aikon')
WHERE mes_ref >= DATE '2026-01-01'
GROUP BY 1, 2, 3 ORDER BY 1 DESC, 2, 3;

SELECT nome, corretora, data, valor FROM public.comissao_eventos('Aikon') WHERE tipo = 'reativacao' ORDER BY data DESC LIMIT 20;
