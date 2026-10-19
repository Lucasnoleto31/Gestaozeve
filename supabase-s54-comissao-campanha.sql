-- ============================================================================
-- S54 · Comissão da campanha de ativação (Milena): conta atribuída na campanha entra na comissão
-- Re-runnável. Rodar depois da S52 (campanha) e da S49 (comissao_mensal).
--
-- Lucas, 19/10/2026: "a Milena vai receber R$ 80 por cada conta ativada e reativada e R$ 25 por cada
-- lead novo que virar cliente". O motor de comissão (S39–S43) só reconhecia conta por lead, parceiro na
-- ficha, assessor ou responsável interno; a campanha (S52) tinha campo próprio e ficava de fora.
--
-- 1. cliente_corretora.ativador_desde: desde quando a conta está com o atendente (atribuir_ativador grava
--    o dia; muda só quando o atendente muda; some quando a conta sai da campanha).
-- 2. comissao_base ganha a origem 'campanha' (conta com ativador = parceiro, por corretora), SEM data de
--    abertura (a conta já existia: não gera abertura), e devolve ativador_desde para qualquer origem.
--    Prioridade: ficha (parceiro) > assessor > responsável > lead > campanha.
-- 3. comissao_eventos: ativação também pela campanha — primeira operação da conta (em toda a história)
--    ocorrida depois da atribuição, sem prazo de 60 dias; reativação pela mesma regra de sempre (volta a
--    girar N meses depois do último giro), só depois da atribuição quando a conta é da campanha.
--    Os dois pagam pelo valor da ativação (metas_ativacao). comissao_itens mostra 'Na campanha' para a
--    conta da campanha que ainda não ativou nem reativou.
-- 4. funil_ativacoes_por_atendente conta só o que aconteceu depois da atribuição.
-- 5. Regra da Milena nas três corretoras, vigente desde 01/10/2026: abertura R$ 25 (só pelo lead, que é a
--    única origem dela com data de abertura), ativação e reativação R$ 80, prazo de ativação 60 dias e
--    reativação depois de 4 meses parado (os padrões; ajuste pela tela Comissões › Regras).
-- ============================================================================

-- 1. Desde quando a conta está na campanha ---------------------------------------------------------
ALTER TABLE public.cliente_corretora ADD COLUMN IF NOT EXISTS ativador_desde date;
UPDATE public.cliente_corretora SET ativador_desde = public.brasil_hoje() WHERE ativador IS NOT NULL AND ativador_desde IS NULL;

CREATE OR REPLACE FUNCTION public.atribuir_ativador(p_corretora text, p_cliente_ids uuid[], p_ativador text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_ativador text := NULLIF(trim(p_ativador), ''); n integer;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  IF NULLIF(trim(p_corretora), '') IS NULL THEN RAISE EXCEPTION 'corretora não informada'; END IF;
  IF p_cliente_ids IS NULL OR cardinality(p_cliente_ids) = 0 THEN RETURN 0; END IF;
  IF v_ativador IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.responsaveis r WHERE r.nome = v_ativador AND r.ativo) THEN
    RAISE EXCEPTION 'atendente não cadastrado em Parâmetros › Responsáveis: %', v_ativador;
  END IF;
  IF v_ativador IS NULL THEN
    UPDATE public.cliente_corretora SET ativador = NULL, ativador_desde = NULL, updated_at = now()
    WHERE corretora = p_corretora AND cliente_id = ANY (p_cliente_ids) AND ativador IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
  END IF;
  INSERT INTO public.cliente_corretora (cliente_id, corretora, ativador, ativador_desde)
  SELECT DISTINCT c.id, p_corretora, v_ativador, public.brasil_hoje()
  FROM public.clientes c
  WHERE c.id = ANY (p_cliente_ids)
  ON CONFLICT (cliente_id, corretora) DO UPDATE
    SET ativador = EXCLUDED.ativador, ativador_desde = public.brasil_hoje(), updated_at = now()
    WHERE cliente_corretora.ativador IS DISTINCT FROM EXCLUDED.ativador;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- 2. Base da comissão com a origem 'campanha' e o ativador_desde --------------------------------------
DROP FUNCTION IF EXISTS public.comissao_base(text, text);
CREATE OR REPLACE FUNCTION public.comissao_base(p_parceiro text, p_corretora text DEFAULT NULL)
RETURNS TABLE(
  cliente_id uuid, nome text, corretora text, origem text, data_lead date, assessor_nome text, status text,
  data_migracao date, data_abertura date, prazo_dias integer, reativacao_meses integer, ativador_desde date
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
    UNION ALL
    -- conta atribuída ao parceiro na campanha de ativação (S52), só naquela corretora; sem abertura
    SELECT m.cliente_id, m.corretora, 'campanha', NULL, NULL
    FROM public.cliente_corretora m
    WHERE public.norm_texto(m.ativador) = public.norm_texto(p_parceiro)
  ),
  base AS (
    -- uma origem por cliente × corretora: ficha > assessor > responsável > lead > campanha
    SELECT DISTINCT ON (vc.cliente_id, vc.corretora)
           vc.cliente_id, vc.corretora, a.origem, a.data_lead, a.assessor_nome, vc.status, vc.data_migracao,
           CASE WHEN a.origem <> 'campanha' AND vc.status = 'Migrado' AND vc.data_migracao IS NOT NULL
                 AND (a.origem <> 'lead' OR a.data_lead IS NULL OR vc.data_migracao >= a.data_lead - 30)
                THEN vc.data_migracao END AS data_abertura
    FROM atrib a
    JOIN public.v_cliente_corretora vc ON vc.cliente_id = a.cliente_id AND (a.corretora IS NULL OR a.corretora = vc.corretora)
    WHERE p_corretora IS NULL OR vc.corretora = p_corretora
    ORDER BY vc.cliente_id, vc.corretora, (a.origem = 'parceiro') DESC, (a.origem = 'assessor') DESC, (a.origem = 'responsavel') DESC, (a.origem = 'lead') DESC
  ),
  regras AS (
    SELECT x.* FROM public.comissao_regras x WHERE public.norm_texto(x.parceiro) = public.norm_texto(p_parceiro)
  )
  SELECT b.cliente_id, cl.nome, b.corretora, b.origem, b.data_lead, b.assessor_nome, b.status, b.data_migracao, b.data_abertura,
         COALESCE(ra.prazo_ativacao_dias, ru.prazo_ativacao_dias, 60),   -- prazo: regra vigente na abertura, senão a atual
         COALESCE(ru.reativacao_meses, ra.reativacao_meses, 4),          -- inatividade: regra atual
         cc.ativador_desde                                                -- desde quando está na campanha deste parceiro (qualquer origem)
  FROM base b
  JOIN public.clientes cl ON cl.id = b.cliente_id
  LEFT JOIN public.cliente_corretora cc ON cc.cliente_id = b.cliente_id AND cc.corretora = b.corretora
       AND public.norm_texto(cc.ativador) = public.norm_texto(p_parceiro)
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

-- 3. Eventos: ativação também pela campanha (1ª operação depois da atribuição, sem prazo) ---------------
DROP FUNCTION IF EXISTS public.comissao_eventos(text, text);
CREATE OR REPLACE FUNCTION public.comissao_eventos(p_parceiro text, p_corretora text DEFAULT NULL)
RETURNS TABLE(cliente_id uuid, nome text, corretora text, origem text, assessor_nome text, tipo text, data date, mes_ref date, valor numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH b AS (
    -- contas migradas do parceiro; a conta anterior ao lead e a da campanha entram sem abertura
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
  primeiro AS (
    -- primeira operação da conta em toda a história
    SELECT d.cliente_id, d.corretora, MIN(d.data) AS data FROM dias d GROUP BY 1, 2
  ),
  ativ AS (
    -- ativação: 1ª operação depois da abertura dentro do prazo (regra normal) OU, para a conta na campanha,
    -- 1ª operação da conta ocorrida depois da atribuição (sem prazo)
    SELECT b.cliente_id, b.corretora, p.data
    FROM b JOIN primeiro p ON p.cliente_id = b.cliente_id AND p.corretora = b.corretora
    WHERE (b.data_abertura IS NOT NULL AND p.data >= b.data_abertura AND p.data <= b.data_abertura + b.prazo_dias)
       OR (b.ativador_desde IS NOT NULL AND p.data >= b.ativador_desde)
  ),
  eventos AS (
    SELECT b.cliente_id, b.corretora, 'abertura'::text AS tipo, b.data_abertura AS data FROM b WHERE b.data_abertura IS NOT NULL
    UNION ALL
    SELECT a.cliente_id, a.corretora, 'ativacao', a.data FROM ativ a
    UNION ALL
    -- reativação: voltou a girar N meses (de calendário) depois do último giro, ou da migração se nunca girou.
    -- Não conta no dia da ativação; na conta da campanha, só depois da atribuição.
    SELECT b.cliente_id, b.corretora, 'reativacao', d.data
    FROM b
    JOIN dias d ON d.cliente_id = b.cliente_id AND d.corretora = b.corretora
    LEFT JOIN ativ a ON a.cliente_id = b.cliente_id AND a.corretora = b.corretora
    WHERE d.data > b.data_migracao
      AND (b.data_abertura IS NOT NULL OR b.data_lead IS NULL OR d.data >= b.data_lead)   -- conta anterior ao lead: só depois do lead
      AND (b.origem <> 'campanha' OR d.data >= b.ativador_desde)                           -- campanha: só depois da atribuição
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

-- Uma linha por conta, com os eventos somados; a conta da campanha sem evento aparece como 'Na campanha'
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
    -- primeira operação depois da abertura (ou, na campanha, depois da atribuição)
    SELECT b.cliente_id, b.corretora,
           (SELECT MIN(v.data) FROM public.v_lotes v
             WHERE v.cliente_id = b.cliente_id AND v.corretora = b.corretora AND v.lotes_operados > 0
               AND v.data >= COALESCE(b.data_abertura, b.ativador_desde)) AS data_ativacao
    FROM b WHERE b.data_abertura IS NOT NULL OR b.ativador_desde IS NOT NULL
  )
  SELECT b.cliente_id, b.nome, b.corretora, b.origem, b.data_lead, b.status,
         b.data_abertura, p.data_ativacao, b.prazo_dias, b.data_abertura + b.prazo_dias, (ev.data_ativacao_prazo IS NOT NULL),
         date_trunc('month', b.data_abertura)::date, date_trunc('month', ev.data_ativacao_prazo)::date,
         COALESCE(ev.valor_abertura, 0), COALESCE(ev.valor_ativacao, 0),
         CASE WHEN ev.data_ativacao_prazo IS NOT NULL THEN 'Ativado'
              WHEN COALESCE(ev.reativacoes, 0) > 0 THEN 'Reativado'
              WHEN b.origem = 'campanha' THEN 'Na campanha'
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

-- 4. Painel do Funil por atendente: só o que aconteceu depois da atribuição ------------------------------
DROP FUNCTION IF EXISTS public.funil_ativacoes_por_atendente(date, integer);
CREATE OR REPLACE FUNCTION public.funil_ativacoes_por_atendente(p_mes_ref date DEFAULT NULL, p_meses_inativo integer DEFAULT 4)
RETURNS TABLE(
  ativador text, contas integer, contatos integer, contas_contatadas integer,
  operaram integer, ativados integer, reativados integer, lotes numeric, receita numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref,
           GREATEST(COALESCE(p_meses_inativo, 4), 1) AS n_inativo
  ),
  camp AS MATERIALIZED (
    SELECT m.cliente_id, m.corretora, trim(m.ativador) AS ativador, date_trunc('month', m.ativador_desde)::date AS mes_desde
    FROM public.cliente_corretora m
    WHERE NULLIF(trim(m.ativador), '') IS NOT NULL
  ),
  lm AS MATERIALIZED (
    SELECT x.cliente_id, x.corretora, x.mes_ref, SUM(x.operados) AS operados, SUM(x.receita) AS receita
    FROM public.lotes_mes x
    JOIN camp c ON c.cliente_id = x.cliente_id AND c.corretora = x.corretora
    GROUP BY 1, 2, 3
  ),
  hist AS MATERIALIZED (
    SELECT h.*,
           MAX(h.mes_ref) FILTER (WHERE h.operados > 0)
             OVER (PARTITION BY h.cliente_id, h.corretora ORDER BY h.mes_ref ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS giro_anterior
    FROM lm h
  ),
  vc AS MATERIALIZED (
    SELECT v.cliente_id, v.corretora, date_trunc('month', v.data_migracao)::date AS mes_migracao
    FROM public.v_cliente_corretora v
    JOIN camp c ON c.cliente_id = v.cliente_id AND c.corretora = v.corretora
  ),
  giro AS (
    SELECT h.cliente_id, h.corretora, h.operados, h.receita,
           CASE WHEN h.giro_anterior IS NOT NULL AND h.mes_ref >= (h.giro_anterior + make_interval(months => cfg.n_inativo))::date THEN 'reativado'
                WHEN h.giro_anterior IS NULL AND v.mes_migracao IS NOT NULL AND h.mes_ref >= (v.mes_migracao + make_interval(months => cfg.n_inativo))::date THEN 'reativado'
                WHEN h.giro_anterior IS NULL THEN 'ativado'
                ELSE 'carteira' END AS tipo
    FROM hist h CROSS JOIN cfg
    JOIN camp c ON c.cliente_id = h.cliente_id AND c.corretora = h.corretora
    LEFT JOIN vc v ON v.cliente_id = h.cliente_id AND v.corretora = h.corretora
    WHERE h.operados > 0 AND h.mes_ref = cfg.mes_ref
      AND (c.mes_desde IS NULL OR h.mes_ref >= c.mes_desde)   -- só depois da atribuição
  ),
  ct AS (
    SELECT c.cliente_id, c.corretora, COUNT(*)::integer AS contatos
    FROM public.cliente_contatos c CROSS JOIN cfg
    WHERE c.data >= cfg.mes_ref AND c.data < (cfg.mes_ref + INTERVAL '1 month')::date
    GROUP BY 1, 2
  )
  SELECT c.ativador,
         COUNT(*)::integer AS contas,
         COALESCE(SUM(ct.contatos), 0)::integer AS contatos,
         COUNT(ct.cliente_id)::integer AS contas_contatadas,
         COUNT(g.cliente_id)::integer AS operaram,
         COUNT(*) FILTER (WHERE g.tipo = 'ativado')::integer AS ativados,
         COUNT(*) FILTER (WHERE g.tipo = 'reativado')::integer AS reativados,
         COALESCE(SUM(g.operados) FILTER (WHERE g.tipo IN ('ativado', 'reativado')), 0) AS lotes,
         ROUND(COALESCE(SUM(g.receita) FILTER (WHERE g.tipo IN ('ativado', 'reativado')), 0), 2) AS receita
  FROM camp c
  LEFT JOIN ct ON ct.cliente_id = c.cliente_id AND ct.corretora = c.corretora
  LEFT JOIN giro g ON g.cliente_id = c.cliente_id AND g.corretora = c.corretora
  WHERE public.acesso_ok()
  GROUP BY c.ativador
  ORDER BY (COUNT(*) FILTER (WHERE g.tipo IN ('ativado', 'reativado'))) DESC, 3 DESC, 1;
$$;

-- 5. Regra da Milena (ajuste pela tela Comissões › Regras) ---------------------------------------------
INSERT INTO public.comissao_regras (parceiro, corretora, vigencia, prazo_ativacao_dias, reativacao_meses, metas_abertura, metas_ativacao) VALUES
  ('Milena', 'GENIAL', DATE '2026-10-01', 60, 4, '0:25', '0:80'),
  ('Milena', 'XP',     DATE '2026-10-01', 60, 4, '0:25', '0:80'),
  ('Milena', 'BTG',    DATE '2026-10-01', 60, 4, '0:25', '0:80')
ON CONFLICT (parceiro, corretora, vigencia) DO NOTHING;
UPDATE public.responsaveis SET comissionado = true WHERE nome = 'Milena' AND NOT comissionado;

-- 6. Permissões ------------------------------------------------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('atribuir_ativador', 'comissao_base', 'comissao_eventos', 'comissao_itens', 'funil_ativacoes_por_atendente')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Conferência: a carteira da Milena por origem e situação, e o mês a mês dela (o Aikon não deve mudar)
SELECT origem, situacao, COUNT(*) AS contas, SUM(valor_abertura) AS abertura, SUM(valor_ativacao) AS ativacao
FROM public.comissao_itens('Milena', NULL) GROUP BY 1, 2 ORDER BY 1, 2;
SELECT mes_ref, corretora, aberturas, ativacoes, reativacoes, valor_abertura, valor_ativacao
FROM public.comissao_mensal(NULL, 3, 'Milena', NULL);
SELECT mes_ref, corretora, aberturas, ativacoes, reativacoes, valor_abertura, valor_ativacao
FROM public.comissao_mensal(NULL, 3, 'Aikon', NULL);
