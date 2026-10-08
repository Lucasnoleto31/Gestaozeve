-- ============================================================================
-- S36 · Contas dos 4 bloqueados do BTG sem conta + vínculo de lotes ignorando zeros à esquerda
-- Re-runnável. Rodar depois da S35.
--
-- Allan Wallace, Arthur Martins, Lucas Cescon e Sidnei Lopes estão no BTG sem conta no cadastro;
-- a planilha GRUPO CORRETAGEM_BLOQUEADOS.xlsx traz as contas. Elas entram como no relatório de
-- lotes do BTG (sem zeros à esquerda), com o assessor = responsável do cliente.
-- De quebra, vincular_lotes passa a casar conta ignorando zeros à esquerda: a lista de clientes
-- do BTG traz a conta com 9 dígitos (002757672) e o relatório de lotes sem os zeros (2757672),
-- o que hoje gera conta duplicada para o mesmo cliente (caso do Samuel Mendes).
-- ============================================================================

-- 1. vincular_lotes: passo 2b (zeros à esquerda) e 3b sem duplicar conta por causa de zeros ----
CREATE OR REPLACE FUNCTION public.vincular_lotes(p_corretora text, p_importacao_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n integer := 0; k integer;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;

  -- 1. conta sem dígito
  UPDATE public.lotes l
     SET cliente_id = ct.cliente_id, conta_id = ct.id
    FROM public.contas ct
   WHERE l.corretora = p_corretora
     AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
     AND ct.corretora = l.corretora
     AND l.conta IS NOT NULL AND ct.conta = l.conta
     AND (l.conta_id IS DISTINCT FROM ct.id OR l.cliente_id IS DISTINCT FROM ct.cliente_id);
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  -- 2. conta com dígito
  UPDATE public.lotes l
     SET cliente_id = ct.cliente_id, conta_id = ct.id
    FROM public.contas ct
   WHERE l.corretora = p_corretora
     AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
     AND ct.corretora = l.corretora
     AND l.conta IS NOT NULL AND ct.conta_digito = l.conta
     AND (l.conta_id IS DISTINCT FROM ct.id OR l.cliente_id IS DISTINCT FROM ct.cliente_id);
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  -- 2b. mesma conta com zeros à esquerda diferentes (lista do BTG: 002757672 · relatório: 2757672)
  UPDATE public.lotes l
     SET cliente_id = ct.cliente_id, conta_id = ct.id
    FROM public.contas ct
   WHERE l.corretora = p_corretora
     AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
     AND l.conta_id IS NULL AND l.conta IS NOT NULL
     AND ct.corretora = l.corretora AND ltrim(ct.conta, '0') = ltrim(l.conta, '0');
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  -- 3. CPF/CNPJ do relatório (BTG traz o documento em cada linha)
  UPDATE public.lotes l
     SET cliente_id = c.id
    FROM public.clientes c
   WHERE l.corretora = p_corretora
     AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
     AND l.conta_id IS NULL AND l.documento IS NOT NULL AND c.documento = l.documento
     AND l.cliente_id IS DISTINCT FROM c.id;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  -- 3b. conta que só aparece nos lotes, de um CPF conhecido → vira conta do cliente
  --     (não cria outra conta se já existe a mesma com zeros à esquerda)
  INSERT INTO public.contas (corretora, cliente_id, conta, assessor_nome, assessor_norm)
  SELECT DISTINCT ON (l.corretora, l.conta) l.corretora, c.id, l.conta, m.responsavel, public.norm_texto(m.responsavel)
  FROM public.lotes l
  JOIN public.clientes c ON c.documento = l.documento
  LEFT JOIN public.cliente_corretora m ON m.cliente_id = c.id AND m.corretora = l.corretora
  WHERE l.corretora = p_corretora
    AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
    AND l.conta IS NOT NULL AND l.conta_id IS NULL AND l.documento IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.contas ct
                    WHERE ct.corretora = l.corretora
                      AND (ct.conta = l.conta OR ct.conta_digito = l.conta OR ltrim(ct.conta, '0') = ltrim(l.conta, '0')))
  ORDER BY l.corretora, l.conta, l.data DESC
  ON CONFLICT (corretora, conta) DO NOTHING;
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k > 0 THEN
    UPDATE public.lotes l
       SET cliente_id = ct.cliente_id, conta_id = ct.id
      FROM public.contas ct
     WHERE l.corretora = p_corretora
       AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
       AND l.conta_id IS NULL AND l.conta IS NOT NULL
       AND ct.corretora = l.corretora AND ct.conta = l.conta;
    GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
    PERFORM public.marcar_contas_principais(p_corretora);
  END IF;

  -- 4. ID_CLIENTE da corretora
  UPDATE public.lotes l
     SET cliente_id = ct.cliente_id, conta_id = ct.id
    FROM (
      SELECT DISTINCT ON (id_cliente) id, cliente_id, id_cliente
      FROM public.contas
      WHERE corretora = p_corretora AND id_cliente IS NOT NULL
      ORDER BY id_cliente, principal DESC, data_habilitacao NULLS LAST
    ) ct
   WHERE l.corretora = p_corretora
     AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
     AND l.conta_id IS NULL
     AND l.id_cliente IS NOT NULL AND ct.id_cliente = l.id_cliente;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  -- 5. nome do relatório: só quando é único entre os clientes desta corretora
  UPDATE public.lotes l
     SET cliente_id = m.id
    FROM (
      SELECT c.nome_norm, MIN(c.id::text)::uuid AS id
      FROM public.clientes c
      WHERE EXISTS (SELECT 1 FROM public.v_cliente_corretora vc WHERE vc.cliente_id = c.id AND vc.corretora = p_corretora)
      GROUP BY c.nome_norm HAVING COUNT(*) = 1
    ) m
   WHERE l.corretora = p_corretora
     AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
     AND l.cliente_id IS NULL AND l.nome_cliente IS NOT NULL
     AND public.norm_texto(l.nome_cliente) = m.nome_norm;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  -- 6. lote sem assessor herda o responsável do cliente (o relatório do BTG não traz assessor)
  UPDATE public.lotes l
     SET assessor_nome = m.responsavel, assessor_norm = public.norm_texto(m.responsavel)
    FROM public.cliente_corretora m
   WHERE l.corretora = p_corretora
     AND (p_importacao_id IS NULL OR l.importacao_id = p_importacao_id)
     AND l.assessor_nome IS NULL AND l.cliente_id IS NOT NULL
     AND m.cliente_id = l.cliente_id AND m.corretora = l.corretora AND m.responsavel IS NOT NULL;

  RETURN n;
END;
$$;

CREATE INDEX IF NOT EXISTS contas_conta_sem_zeros_idx ON public.contas (corretora, ltrim(conta, '0'));

-- 2. As quatro contas (casadas pelo CPF/CNPJ; assessor = responsável do cliente) -----------------
WITH novas(documento, conta, nome) AS (VALUES
  ('84320737172',    '5553635',  'ALLAN WALLACE CAETANO'),
  ('05807641175',    '23967912', 'ARTHUR MARTINS'),
  ('38857540880',    '8650580',  'LUCAS PEREIRA CESCON'),
  ('54405309000190', '40836058', 'SIDNEI LOPES LIMA')
)
INSERT INTO public.contas (corretora, cliente_id, conta, assessor_nome, assessor_norm)
SELECT 'BTG', c.id, n.conta, COALESCE(m.assessor, m.responsavel), public.norm_texto(COALESCE(m.assessor, m.responsavel))
FROM novas n
JOIN public.clientes c ON c.documento = n.documento
LEFT JOIN public.cliente_corretora m ON m.cliente_id = c.id AND m.corretora = 'BTG'
WHERE NOT EXISTS (SELECT 1 FROM public.contas x WHERE x.corretora = 'BTG' AND ltrim(x.conta, '0') = ltrim(n.conta, '0'))
ON CONFLICT (corretora, conta) DO NOTHING;

SELECT 'contas principais' AS etapa, public.marcar_contas_principais('BTG') AS linhas
UNION ALL SELECT 'lotes vinculados', public.vincular_lotes('BTG', NULL)
UNION ALL SELECT 'lotes recalculados', public.recalcular_lotes('BTG', NULL);

NOTIFY pgrst, 'reload schema';

-- 3. Conferência: os quatro com conta e o alerta "sem conta" sumido ------------------------------
SELECT cl.nome, cl.conta_principal, cl.n_contas, cl.status, cl.grupo_corretagem, cl.alertas
FROM public.clientes_lista('BTG') cl
JOIN public.clientes c ON c.id = cl.cliente_id
WHERE c.documento IN ('84320737172', '05807641175', '38857540880', '54405309000190')
ORDER BY cl.nome;
