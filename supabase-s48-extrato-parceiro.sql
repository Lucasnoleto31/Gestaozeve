-- ============================================================================
-- S48 · Extrato mensal do parceiro: carteira inteira com lotes e receita do mês
-- Re-runnável. Rodar depois da S43 (comissao_base).
--
-- Lucas, 16/10/2026: "tenho alguns parceiros e gostaria de enviar para eles quem são os clientes
-- deles, quantos lotes giraram no mês e qual foi a receita, individual de cada um".
--
-- comissao_carteira_mes(parceiro, corretora, mês): uma linha por conta da carteira do parceiro
-- (mesma atribuição da comissão: lead ganho, parceiro na ficha, assessor ligado ao parceiro ou
-- responsável interno), com conta principal, situação, abertura, lotes e receita bruta do mês,
-- lotes e receita dos 12 meses até o mês e o último mês com giro. Receita bruta = corretagem +
-- zeragem + operações avulsas (resumo mensal lotes_mes), antes de repasse e impostos.
-- A tela Comissões monta o extrato com isso, com planilha para baixar e versão para imprimir.
-- ============================================================================
DROP FUNCTION IF EXISTS public.comissao_carteira_mes(text, text, date);
CREATE OR REPLACE FUNCTION public.comissao_carteira_mes(p_parceiro text, p_corretora text DEFAULT NULL, p_mes_ref date DEFAULT NULL)
RETURNS TABLE(
  cliente_id uuid, nome text, corretora text, conta text, status text, origem text, assessor_nome text, data_abertura date,
  lotes_mes numeric, zerados_mes numeric, receita_mes numeric, lotes_12m numeric, receita_12m numeric, ultimo_mes_giro date
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) AS mes_ref,
           (COALESCE(p_mes_ref, date_trunc('month', public.brasil_hoje())::date) - INTERVAL '11 months')::date AS mes_ini
  ),
  base AS MATERIALIZED (
    SELECT b.cliente_id, b.nome, b.corretora, b.origem, b.assessor_nome, b.status, b.data_migracao, b.data_abertura
    FROM public.comissao_base(p_parceiro, p_corretora) b
  ),
  rec AS MATERIALIZED (
    SELECT lm.cliente_id, lm.corretora,
           SUM(lm.operados) FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS lotes_mes,
           SUM(lm.zerados) FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS zerados_mes,
           SUM(lm.receita) FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS receita_mes,
           SUM(lm.operados) AS lotes_12m,
           SUM(lm.receita) AS receita_12m,
           MAX(lm.mes_ref) FILTER (WHERE lm.operados > 0) AS ultimo_mes_giro
    FROM public.lotes_mes lm CROSS JOIN cfg
    WHERE lm.cliente_id IN (SELECT b.cliente_id FROM base b)
      AND lm.mes_ref BETWEEN cfg.mes_ini AND cfg.mes_ref
    GROUP BY lm.cliente_id, lm.corretora
  )
  SELECT b.cliente_id, b.nome, b.corretora, vc.conta_principal, b.status, b.origem, b.assessor_nome,
         COALESCE(b.data_abertura, b.data_migracao),
         COALESCE(r.lotes_mes, 0), COALESCE(r.zerados_mes, 0), ROUND(COALESCE(r.receita_mes, 0), 2),
         COALESCE(r.lotes_12m, 0), ROUND(COALESCE(r.receita_12m, 0), 2), r.ultimo_mes_giro
  FROM base b
  LEFT JOIN public.v_cliente_corretora vc ON vc.cliente_id = b.cliente_id AND vc.corretora = b.corretora
  LEFT JOIN rec r ON r.cliente_id = b.cliente_id AND r.corretora = b.corretora
  WHERE public.acesso_ok()
  ORDER BY COALESCE(r.lotes_mes, 0) DESC, COALESCE(r.receita_mes, 0) DESC, b.nome;
$$;

REVOKE ALL ON FUNCTION public.comissao_carteira_mes(text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.comissao_carteira_mes(text, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.comissao_carteira_mes(text, text, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Conferência: a carteira do Aikon no mês corrente (contas, quantas giraram, lotes e receita do mês)
SELECT corretora, COUNT(*) AS contas, COUNT(*) FILTER (WHERE lotes_mes > 0) AS giraram,
       SUM(lotes_mes) AS lotes, SUM(receita_mes) AS receita
FROM public.comissao_carteira_mes('Aikon', NULL, NULL)
GROUP BY corretora ORDER BY corretora;
