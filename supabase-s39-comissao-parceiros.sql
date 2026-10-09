-- ============================================================================
-- S39 · Comissão de parceiros por abertura e ativação de conta (Aikon é o primeiro)
-- Re-runnável. Rodar depois da S38.
--
-- Regras combinadas com o Lucas em 09/10/2026:
--   conta do parceiro = lead em que ele é o responsável e que virou cliente, ou cliente com
--                       parceiro = nome dele (cliente_corretora.parceiro)
--   abertura          = cliente Migrado, na data de migração (para conta vinda de lead, a
--                       migração tem que ser a partir do lead, com 30 dias de folga: conta de
--                       2022 que apareceu como lead em 2026 não paga)
--   ativação          = primeira operação (qualquer tamanho) em até N dias da abertura (60);
--                       paga uma vez por cliente e por corretora
--   valores           = por corretora, com vigência, em faixas pela quantidade do mês:
--                       "mínimo no mês:R$ por conta;…" — a faixa alcançada vale para todas
--                       as contas daquele mês (meta que aumenta a comissão)
--   pagamentos        = lançados pelo admin (mês, valor, data, observação); saldo = gerado − pago
-- ============================================================================

-- 1. Quem é parceiro comissionado --------------------------------------------------------
ALTER TABLE public.responsaveis ADD COLUMN IF NOT EXISTS comissionado boolean NOT NULL DEFAULT false;
UPDATE public.responsaveis SET comissionado = true WHERE public.norm_texto(nome) = 'AIKON';

-- 2. Regras por parceiro × corretora, com vigência ------------------------------------------
CREATE TABLE IF NOT EXISTS public.comissao_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro text NOT NULL,                 -- nome em responsaveis
  corretora text NOT NULL,
  vigencia date NOT NULL,
  prazo_ativacao_dias integer NOT NULL DEFAULT 60,
  metas_abertura text NOT NULL DEFAULT '0:0',   -- "mínimo no mês:R$ por conta;…"
  metas_ativacao text NOT NULL DEFAULT '0:0',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parceiro, corretora, vigencia)
);

-- Aikon: Genial ativação R$ 80 (abertura ainda sem valor: preencher pela tela quando a tabela
-- chegar); BTG R$ 20 por conta levada e R$ 100 por ativada, subindo por meta mensal
INSERT INTO public.comissao_regras (parceiro, corretora, vigencia, prazo_ativacao_dias, metas_abertura, metas_ativacao) VALUES
  ('Aikon', 'GENIAL', DATE '2026-01-01', 60, '0:0', '0:80'),
  ('Aikon', 'BTG',    DATE '2026-01-01', 60, '0:20;5:25;10:30;15:35', '0:100;3:120;6:140;10:160')
ON CONFLICT (parceiro, corretora, vigencia) DO NOTHING;

-- 3. Pagamentos ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comissao_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro text NOT NULL,
  corretora text,                         -- vazio = pagamento geral
  mes_ref date NOT NULL,                  -- mês a que o pagamento se refere (dia 1)
  valor numeric(12,2) NOT NULL,
  data_pagamento date NOT NULL,
  observacao text,
  criado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comissao_pagamentos_parceiro_idx ON public.comissao_pagamentos (parceiro, mes_ref);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['comissao_regras', 'comissao_pagamentos']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- 4. Faixa: "mínimo:valor;mínimo:valor" → valor da maior faixa alcançada pela quantidade ----
CREATE OR REPLACE FUNCTION public.comissao_faixa(p_metas text, p_qtd integer)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE((
    SELECT replace(split_part(f, ':', 2), ',', '.')::numeric
    FROM unnest(string_to_array(COALESCE(p_metas, ''), ';')) AS f
    WHERE trim(f) <> '' AND position(':' IN f) > 0
      AND replace(split_part(f, ':', 1), ',', '.')::numeric <= COALESCE(p_qtd, 0)
    ORDER BY replace(split_part(f, ':', 1), ',', '.')::numeric DESC
    LIMIT 1
  ), 0);
$$;

-- 5. Contas de um parceiro, com abertura, ativação, prazo e valores ---------------------------
CREATE OR REPLACE FUNCTION public.comissao_itens(p_parceiro text, p_corretora text DEFAULT NULL)
RETURNS TABLE(
  cliente_id uuid, nome text, corretora text, origem text, data_lead date, status text,
  data_abertura date, data_ativacao date, prazo_dias integer, limite_ativacao date, ativou_no_prazo boolean,
  mes_abertura date, mes_ativacao date, valor_abertura numeric, valor_ativacao numeric, situacao text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH atrib AS (
    SELECT l.cliente_id, 'lead'::text AS origem, MIN((l.data_hora AT TIME ZONE 'America/Sao_Paulo')::date) AS data_lead
    FROM public.leads l
    WHERE l.cliente_id IS NOT NULL AND public.norm_texto(l.responsavel) = public.norm_texto(p_parceiro)
    GROUP BY l.cliente_id
    UNION ALL
    SELECT m.cliente_id, 'parceiro', NULL
    FROM public.cliente_corretora m
    WHERE public.norm_texto(m.parceiro) = public.norm_texto(p_parceiro)
  ),
  unico AS (
    -- um por cliente: a marcação de parceiro vale sem exigir data; o lead exige migração depois dele
    SELECT DISTINCT ON (a.cliente_id) a.cliente_id, a.origem, a.data_lead
    FROM atrib a ORDER BY a.cliente_id, (a.origem = 'parceiro') DESC
  ),
  base AS (
    SELECT u.cliente_id, u.origem, u.data_lead, vc.corretora, vc.status, vc.data_migracao,
           CASE WHEN vc.status = 'Migrado' AND vc.data_migracao IS NOT NULL
                 AND (u.data_lead IS NULL OR vc.data_migracao >= u.data_lead - 30)
                THEN vc.data_migracao END AS data_abertura
    FROM unico u
    JOIN public.v_cliente_corretora vc ON vc.cliente_id = u.cliente_id
    WHERE p_corretora IS NULL OR vc.corretora = p_corretora
  ),
  com_regra AS (
    SELECT b.*, COALESCE(r.prazo_ativacao_dias, 60) AS prazo_dias, r.metas_abertura, r.metas_ativacao
    FROM base b
    LEFT JOIN LATERAL (
      SELECT x.prazo_ativacao_dias, x.metas_abertura, x.metas_ativacao
      FROM public.comissao_regras x
      WHERE public.norm_texto(x.parceiro) = public.norm_texto(p_parceiro) AND x.corretora = b.corretora
        AND x.vigencia <= COALESCE(b.data_abertura, public.brasil_hoje())
      ORDER BY x.vigencia DESC LIMIT 1
    ) r ON true
  ),
  ativ AS (
    SELECT c.*,
           (SELECT MIN(v.data) FROM public.v_lotes v
             WHERE v.cliente_id = c.cliente_id AND v.corretora = c.corretora AND v.lotes_operados > 0 AND v.data >= c.data_abertura) AS data_ativacao
    FROM com_regra c
  ),
  calc AS (
    SELECT a.*, (a.data_abertura + a.prazo_dias) AS limite_ativacao,
           (a.data_ativacao IS NOT NULL AND a.data_ativacao <= a.data_abertura + a.prazo_dias) AS ativou_no_prazo,
           date_trunc('month', a.data_abertura)::date AS mes_abertura,
           CASE WHEN a.data_ativacao IS NOT NULL AND a.data_ativacao <= a.data_abertura + a.prazo_dias
                THEN date_trunc('month', a.data_ativacao)::date END AS mes_ativacao
    FROM ativ a
  ),
  cont AS (
    -- quantas no mês: a faixa alcançada vale para todas as contas daquele mês
    SELECT c.*,
           COUNT(*) FILTER (WHERE c.data_abertura IS NOT NULL) OVER (PARTITION BY c.corretora, c.mes_abertura) AS n_abertura,
           COUNT(*) FILTER (WHERE c.ativou_no_prazo) OVER (PARTITION BY c.corretora, c.mes_ativacao) AS n_ativacao
    FROM calc c
  )
  SELECT c.cliente_id, cl.nome, c.corretora, c.origem, c.data_lead, c.status,
         c.data_abertura, c.data_ativacao, c.prazo_dias, c.limite_ativacao, COALESCE(c.ativou_no_prazo, false),
         c.mes_abertura, c.mes_ativacao,
         CASE WHEN c.data_abertura IS NOT NULL THEN public.comissao_faixa(c.metas_abertura, c.n_abertura::integer) ELSE 0 END,
         CASE WHEN c.ativou_no_prazo THEN public.comissao_faixa(c.metas_ativacao, c.n_ativacao::integer) ELSE 0 END,
         CASE WHEN c.data_abertura IS NULL THEN (CASE WHEN c.status = 'Migrado' THEN 'Conta anterior ao lead' ELSE c.status END)
              WHEN c.ativou_no_prazo THEN 'Ativado'
              WHEN c.data_ativacao IS NOT NULL THEN 'Operou fora do prazo'
              WHEN public.brasil_hoje() <= c.limite_ativacao THEN 'Aberto, no prazo'
              ELSE 'Prazo vencido' END
  FROM cont c
  JOIN public.clientes cl ON cl.id = c.cliente_id
  WHERE public.acesso_ok()
  ORDER BY c.data_abertura DESC NULLS LAST, cl.nome;
$$;

-- 6. Por mês: aberturas, ativações e valores (todos os parceiros comissionados ou um só) --------
CREATE OR REPLACE FUNCTION public.comissao_mensal(p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12, p_parceiro text DEFAULT NULL, p_corretora text DEFAULT NULL)
RETURNS TABLE(mes_ref date, parceiro text, corretora text, aberturas integer, ativacoes integer, valor_abertura numeric, valor_ativacao numeric)
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
  itens AS (
    SELECT p.nome AS parceiro, i.corretora, i.mes_abertura, i.mes_ativacao, i.valor_abertura, i.valor_ativacao, i.data_abertura, i.ativou_no_prazo
    FROM parceiros p CROSS JOIN LATERAL public.comissao_itens(p.nome, p_corretora) i
  ),
  ab AS (
    SELECT i.mes_abertura AS mes_ref, i.parceiro, i.corretora, COUNT(*)::integer AS aberturas, SUM(i.valor_abertura) AS valor_abertura
    FROM itens i WHERE i.mes_abertura IS NOT NULL GROUP BY 1, 2, 3
  ),
  at AS (
    SELECT i.mes_ativacao AS mes_ref, i.parceiro, i.corretora, COUNT(*)::integer AS ativacoes, SUM(i.valor_ativacao) AS valor_ativacao
    FROM itens i WHERE i.mes_ativacao IS NOT NULL GROUP BY 1, 2, 3
  ),
  tudo AS (
    SELECT COALESCE(ab.mes_ref, at.mes_ref) AS mes_ref, COALESCE(ab.parceiro, at.parceiro) AS parceiro, COALESCE(ab.corretora, at.corretora) AS corretora,
           COALESCE(ab.aberturas, 0) AS aberturas, COALESCE(at.ativacoes, 0) AS ativacoes,
           COALESCE(ab.valor_abertura, 0) AS valor_abertura, COALESCE(at.valor_ativacao, 0) AS valor_ativacao
    FROM ab FULL JOIN at ON at.mes_ref = ab.mes_ref AND at.parceiro = ab.parceiro AND at.corretora = ab.corretora
  )
  SELECT t.mes_ref, t.parceiro, t.corretora, t.aberturas, t.ativacoes, ROUND(t.valor_abertura, 2), ROUND(t.valor_ativacao, 2)
  FROM tudo t CROSS JOIN cfg
  WHERE t.mes_ref > cfg.mes_ini AND t.mes_ref <= cfg.mes_ref AND public.acesso_ok()
  ORDER BY 1, 2, 3;
$$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('comissao_faixa', 'comissao_itens', 'comissao_mensal')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- 7. Conferência: as contas do Aikon e o resumo mensal -------------------------------------------
SELECT nome, corretora, origem, data_lead, data_abertura, data_ativacao, limite_ativacao, situacao, valor_abertura, valor_ativacao
FROM public.comissao_itens('Aikon');

SELECT * FROM public.comissao_mensal(NULL, 12, 'Aikon');
