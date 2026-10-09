-- ============================================================================
-- S42 · Genial: Aikon é o responsável interno da carteira ZEVE INVESTIMENTOS 18
-- Re-runnável.
--
-- Lucas, 09/10/2026: "na Genial, todos que estão na ZEVE 18 o Aikon é responsável interno por eles".
-- O responsável do assessor é herdado pelos clientes dele (clientes_lista usa
-- COALESCE(responsável manual da ficha, responsável do assessor)); a ficha com responsável
-- manual continua valendo. Equivale a escolher "Aikon" em Parâmetros › Assessores › ZEVE 18.
-- ============================================================================

UPDATE public.assessores
   SET responsavel = 'Aikon', updated_at = now()
 WHERE corretora = 'GENIAL' AND nome_norm = 'ZEVE INVESTIMENTOS 18' AND responsavel IS DISTINCT FROM 'Aikon';

-- Conferência: clientes da carteira por responsável efetivo (esperado: Aikon em todos, salvo ficha manual)
SELECT COALESCE(vc.responsavel, a.responsavel) AS responsavel, vc.status, COUNT(*) AS clientes
FROM public.v_cliente_corretora vc
JOIN public.assessores a ON a.corretora = vc.corretora AND a.nome_norm = vc.assessor_norm
WHERE vc.corretora = 'GENIAL' AND vc.assessor_norm = 'ZEVE INVESTIMENTOS 18'
GROUP BY 1, 2 ORDER BY 1, 2;
