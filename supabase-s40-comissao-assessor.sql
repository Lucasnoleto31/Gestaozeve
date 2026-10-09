-- ============================================================================
-- S40 · Comissão de parceiros: clientes de um assessor contam para o parceiro
-- Re-runnável. Rodar depois da S39.
--
-- Lucas, 09/10/2026: todos os clientes do assessor "Zeve Investimentos 18" (Genial) são do
-- Aikon. O assessor ganha o campo parceiro (editável em Parâmetros › Assessores) e passa a ser
-- a terceira origem de atribuição, ao lado do lead e do parceiro na ficha. A atribuição agora
-- é por cliente × corretora: a marcação na ficha e a do assessor valem só na corretora delas;
-- o lead vale em qualquer corretora (com a migração a partir do lead).
-- ============================================================================

ALTER TABLE public.assessores ADD COLUMN IF NOT EXISTS parceiro text;   -- parceiro comissionado dono dos clientes do assessor
UPDATE public.assessores SET parceiro = 'Aikon', updated_at = now()
 WHERE corretora = 'GENIAL' AND nome_norm = 'ZEVE INVESTIMENTOS 18' AND parceiro IS DISTINCT FROM 'Aikon';

DROP FUNCTION IF EXISTS public.comissao_itens(text, text);
CREATE OR REPLACE FUNCTION public.comissao_itens(p_parceiro text, p_corretora text DEFAULT NULL)
RETURNS TABLE(
  cliente_id uuid, nome text, corretora text, origem text, data_lead date, status text,
  data_abertura date, data_ativacao date, prazo_dias integer, limite_ativacao date, ativou_no_prazo boolean,
  mes_abertura date, mes_ativacao date, valor_abertura numeric, valor_ativacao numeric, situacao text,
  assessor_nome text
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
              ELSE 'Prazo vencido' END,
         c.assessor_nome
  FROM cont c
  JOIN public.clientes cl ON cl.id = c.cliente_id
  WHERE public.acesso_ok()
  ORDER BY c.data_abertura DESC NULLS LAST, cl.nome;
$$;

REVOKE ALL ON FUNCTION public.comissao_itens(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.comissao_itens(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.comissao_itens(text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Conferência: por origem e situação, e o resumo mensal
SELECT origem, situacao, COUNT(*) AS contas, SUM(valor_abertura) AS abertura_rs, SUM(valor_ativacao) AS ativacao_rs
FROM public.comissao_itens('Aikon')
GROUP BY 1, 2 ORDER BY 1, 2;

SELECT * FROM public.comissao_mensal(NULL, 12, 'Aikon');
