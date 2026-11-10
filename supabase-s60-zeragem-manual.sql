-- ============================================================================
-- S60 · Zeragem aceita corretagem manual (fechamento do BTG)
-- ----------------------------------------------------------------------------
-- No fechamento de outubro sobrou R$ 160 de zeragem lançada que o BTG não pagou (Leonardo
-- Bordignon, 28/10) porque a linha de zeragem ignorava tarifa_manual: a receita dela era sempre
-- qtd × zeragem_rs do parâmetro/faixa. Agora, quando uma linha de zeragem tem tarifa_manual, esse
-- é o R$/contrato dela (0 = não paga). Nada muda para as linhas sem ajuste.
-- O parâmetro zeragem_manual = SIM avisa o app que a regra está ativa (a tela do fechamento passa
-- a propor o ajuste da zeragem em vez de deixá-la como resíduo).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalcular_lotes(p_corretora text, p_importacao_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n integer; v_modo text; v_modo_dt text; v_zeragem_padrao numeric; v_desde date; v_tem_faixas boolean;
        v_desde_migracao boolean; v_apenas_futuros boolean; v_tarifa_acoes numeric;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  v_modo := upper(COALESCE(NULLIF(public.param(p_corretora, 'modo_zeragem'), ''), 'ZERAGEM'));
  v_modo_dt := upper(COALESCE(public.param(p_corretora, 'modo_daytrade'), ''));
  v_zeragem_padrao := COALESCE(NULLIF(public.param(p_corretora, 'zeragem_padrao'), '')::numeric, 0);
  v_tem_faixas := EXISTS (SELECT 1 FROM public.zeragem_faixas(p_corretora));
  v_desde := NULLIF(public.param(p_corretora, 'zeragem_faixas_desde'), '')::date;
  v_desde_migracao := upper(COALESCE(public.param(p_corretora, 'receita_desde_migracao'), 'NAO')) = 'SIM';
  v_apenas_futuros := upper(COALESCE(public.param(p_corretora, 'lotes_apenas_futuros'), 'NAO')) = 'SIM';
  v_tarifa_acoes := COALESCE(replace(NULLIF(public.param(p_corretora, 'tarifa_acoes_daytrade'), ''), ',', '.')::numeric, 0);
  -- a tabela regressiva depende do volume do mês inteiro (e do anterior): com ela ativa,
  -- uma importação parcial recalcula a corretora toda
  IF v_tem_faixas THEN p_importacao_id := NULL; END IF;

  WITH faixas AS MATERIALIZED (
    SELECT f.minimo, f.valor FROM public.zeragem_faixas(p_corretora) f
  ),
  migra AS MATERIALIZED (
    SELECT vc.cliente_id, vc.data_migracao FROM public.v_cliente_corretora vc WHERE vc.corretora = p_corretora
  ),
  -- classificação de cada linha: zeragem (MODO tem modo_zeragem), posição (não é day trade),
  -- ações (day trade fora de futuros), e se conta para a receita (a partir da migração)
  base AS MATERIALIZED (
    SELECT l2.id, l2.qtd, l2.data, l2.cliente_id, l2.conta, l2.nome_cliente,
           z.zer AS zeragem, z.pos AS posicao,
           (NOT z.zer AND NOT z.pos AND v_apenas_futuros
            AND COALESCE(upper(l2.ativo), '') !~ '^[A-Z]{3}F?[FGHJKMNQUVXZ][0-9]{2}$') AS acoes,
           NOT (v_desde_migracao AND mg.data_migracao IS NOT NULL AND l2.data < mg.data_migracao) AS conta_receita
    FROM public.lotes l2
    CROSS JOIN LATERAL (
      SELECT (position(v_modo IN upper(COALESCE(l2.modo, ''))) > 0) AS zer,
             (position(v_modo IN upper(COALESCE(l2.modo, ''))) = 0
              AND v_modo_dt <> '' AND position(v_modo_dt IN upper(COALESCE(l2.modo, ''))) = 0) AS pos
    ) z
    LEFT JOIN migra mg ON mg.cliente_id = l2.cliente_id
    WHERE l2.corretora = p_corretora AND (p_importacao_id IS NULL OR l2.importacao_id = p_importacao_id)
  ),
  -- volume mensal por cliente para a tabela regressiva (com faixas ativas, base cobre a corretora toda)
  vol AS MATERIALIZED (
    SELECT COALESCE(b.cliente_id::text, 'CONTA:' || b.conta, 'NOME:' || b.nome_cliente, '?') AS chave,
           date_trunc('month', b.data::timestamp)::date AS mes,
           SUM(CASE WHEN b.zeragem OR b.posicao OR b.acoes THEN 0 ELSE b.qtd END) AS operados
    FROM base b
    WHERE b.conta_receita
    GROUP BY 1, 2
  )
  UPDATE public.lotes l SET
    zeragem = b.zeragem,
    posicao = b.posicao,
    acoes = b.acoes,
    produto = public.produto_de(l.ativo),
    -- corretagem ajustada à mão vale sobre o cadastro; ações: corretagem fixa por operação;
    -- posição: nada, salvo ajuste manual
    tarifa = COALESCE(l2.tarifa_manual, CASE
      WHEN b.acoes THEN v_tarifa_acoes
      WHEN b.posicao THEN 0
      ELSE COALESCE(
        (SELECT t.corretagem FROM public.tarifas_cliente t
          WHERE t.corretora = l.corretora AND t.cliente_id = l.cliente_id AND t.vigencia <= l.data
          ORDER BY t.vigencia DESC LIMIT 1),
        a.corretagem, 0)
    END),
    -- S60: zeragem com ajuste manual usa o R$/contrato informado (0 = não paga)
    zeragem_rs = CASE
      WHEN b.zeragem AND l2.tarifa_manual IS NOT NULL THEN l2.tarifa_manual
      WHEN a.tipo_zeragem = 'FIXA' THEN a.zeragem_fixa
      WHEN v_tem_faixas AND (v_desde IS NULL OR l2.data >= v_desde) THEN COALESCE(fz.valor, v_zeragem_padrao)
      ELSE v_zeragem_padrao
    END,
    multiplicador = COALESCE(m.pontos, 0),
    chave_incentivo = CASE
      WHEN cons.nome_norm IS NOT NULL THEN 'NOME:' || cons.nome_norm
      WHEN c.documento IS NOT NULL THEN 'DOC:' || c.documento
      WHEN l.conta IS NOT NULL THEN 'CONTA:' || l.conta
      ELSE 'NOME:' || COALESCE(c.nome_norm, public.norm_texto(l.nome_cliente), '?')
    END,
    conta_para_receita = b.conta_receita
  FROM public.lotes l2
  JOIN base b ON b.id = l2.id
  LEFT JOIN public.clientes c ON c.id = l2.cliente_id
  LEFT JOIN public.assessores a ON a.corretora = l2.corretora AND a.nome_norm = l2.assessor_norm
  LEFT JOIN public.multiplicadores m ON m.corretora = l2.corretora AND m.produto = public.produto_de(l2.ativo)
  LEFT JOIN LATERAL (
    SELECT x.nome_norm FROM public.consolidados x
    WHERE x.corretora = l2.corretora AND x.nome_norm IN (c.nome_norm, public.norm_texto(l2.nome_cliente))
    LIMIT 1
  ) cons ON true
  LEFT JOIN vol va ON va.chave = COALESCE(l2.cliente_id::text, 'CONTA:' || l2.conta, 'NOME:' || l2.nome_cliente, '?')
                  AND va.mes = date_trunc('month', l2.data::timestamp)::date
  LEFT JOIN vol vb ON vb.chave = COALESCE(l2.cliente_id::text, 'CONTA:' || l2.conta, 'NOME:' || l2.nome_cliente, '?')
                  AND vb.mes = (date_trunc('month', l2.data::timestamp) - INTERVAL '1 month')::date
  LEFT JOIN LATERAL (
    SELECT f.valor FROM faixas f
    WHERE f.minimo <= GREATEST(COALESCE(va.operados, 0), COALESCE(vb.operados, 0), 1)
    ORDER BY f.minimo DESC LIMIT 1
  ) fz ON true
  WHERE l.id = l2.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- O app lê este parâmetro para saber que a zeragem aceita ajuste manual
INSERT INTO public.parametros (corretora, chave, valor, descricao)
SELECT c, 'zeragem_manual', 'SIM', 'S60: linha de zeragem com corretagem manual usa esse R$/contrato (0 = não paga)'
FROM unnest(ARRAY['GENIAL', 'XP', 'BTG']) AS c
ON CONFLICT (corretora, chave) DO UPDATE SET valor = 'SIM', updated_at = now();

NOTIFY pgrst, 'reload schema';

-- Conferência: nenhuma linha de zeragem tem ajuste manual ainda, então nada muda no recálculo
SELECT corretora, COUNT(*) AS zeragens_com_ajuste FROM public.lotes WHERE zeragem AND tarifa_manual IS NOT NULL GROUP BY 1;
SELECT corretora, chave, valor FROM public.parametros WHERE chave = 'zeragem_manual' ORDER BY 1;
