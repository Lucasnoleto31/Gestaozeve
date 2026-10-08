-- ============================================================================
-- S34 · Grupo de corretagem no BTG: migrados = Sim, menos os bloqueados
-- Re-runnável. Rodar depois da S33.
--
-- Planilha GRUPO CORRETAGEM_BLOQUEADOS.xlsx (08/10/2026): 7 clientes do BTG com a alteração
-- do grupo de corretagem bloqueada (aguardando desbloqueio) → Não. Os demais migrados do BTG já
-- estão no grupo certo, conforme a tarifa combinada → Sim. Recusou e Em processamento ficam
-- sem informação. Quem já tinha Sim/Não marcado na ficha não é alterado.
-- Quando um bloqueado for liberado, basta trocar para Sim na ficha do cliente.
-- ============================================================================

-- 1. Bloqueados → Não (casados pelo CPF/CNPJ; a corretagem da planilha bate com a tarifa do cadastro)
WITH bloqueados(documento, conta, nome, corretagem) AS (VALUES
  ('18636659949',     '4456898',   'CLOVIS ANTONIO PEREIRA',                0.10),
  ('02319270108',     '27300672',  'JOSYELL BARBOSA RODRIGUES DA SILVA',    0.07),
  ('54405309000190',  '40836058',  'SIDNEI LOPES LIMA',                     0.10),
  ('33337170854',     '2757672',   'SAMUEL MENDES PEREIRA',                 0.25),
  ('84320737172',     '5553635',   'ALLAN WALLACE CAETANO',                 0.25),
  ('05807641175',     '23967912',  'ARTHUR MARTINS',                        0.25),
  ('38857540880',     '8650580',   'LUCAS PEREIRA CESCON',                  0.25)
)
INSERT INTO public.cliente_corretora (cliente_id, corretora, grupo_corretagem)
SELECT c.id, 'BTG', false
FROM bloqueados b
JOIN public.clientes c ON c.documento = b.documento
ON CONFLICT (cliente_id, corretora) DO UPDATE SET grupo_corretagem = false, updated_at = now();

-- 2. Demais migrados do BTG ainda sem informação → Sim
INSERT INTO public.cliente_corretora (cliente_id, corretora, grupo_corretagem)
SELECT vc.cliente_id, vc.corretora, true
FROM public.v_cliente_corretora vc
WHERE vc.corretora = 'BTG' AND vc.status = 'Migrado' AND vc.grupo_corretagem IS NULL
ON CONFLICT (cliente_id, corretora) DO UPDATE SET grupo_corretagem = true, updated_at = now()
WHERE cliente_corretora.grupo_corretagem IS NULL;

-- 3. Conferência: os bloqueados como ficaram, e o panorama do BTG
SELECT c.nome, vc.status, vc.grupo_corretagem, vc.conta_principal
FROM public.v_cliente_corretora vc
JOIN public.clientes c ON c.id = vc.cliente_id
WHERE vc.corretora = 'BTG' AND c.documento IN ('18636659949', '02319270108', '54405309000190', '33337170854', '84320737172', '05807641175', '38857540880')
ORDER BY c.nome;

SELECT vc.status,
       COUNT(*) FILTER (WHERE vc.grupo_corretagem IS TRUE)  AS vinculados,
       COUNT(*) FILTER (WHERE vc.grupo_corretagem IS FALSE) AS nao_vinculados,
       COUNT(*) FILTER (WHERE vc.grupo_corretagem IS NULL)  AS nao_informados
FROM public.v_cliente_corretora vc
WHERE vc.corretora = 'BTG'
GROUP BY vc.status
ORDER BY 1;
