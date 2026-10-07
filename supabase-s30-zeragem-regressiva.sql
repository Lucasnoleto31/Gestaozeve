-- ============================================================================
-- S30 · Zeragem compulsória regressiva da Genial (assessores com zeragem PADRAO)
-- Re-runnável. Rodar depois da S29.
--
-- Política de corretagem da Genial (tabela vigente desde 01/06/2026): a zeragem automática
-- custa, por minicontrato zerado, um valor regressivo definido pelo maior número de contratos
-- operados pelo cliente entre o mês anterior e o mês vigente:
--   1 a 19: R$ 24,50 · 20 a 499: R$ 23,25 · 500 a 999: R$ 22,00 · 1.000 a 4.999: R$ 20,75 · 5.000 ou mais: R$ 19,50
-- Assessores com zeragem FIXA continuam com o valor fixo deles. Sem a tabela (parâmetro vazio)
-- vale o ZeragemRS único de antes (é o caso do BTG: R$ 16). Os parâmetros ficam em
-- Parâmetros → Premissas (zeragem_faixas e zeragem_faixas_desde).
-- ============================================================================

-- 1. Parâmetros da Genial (se já existirem, só a descrição é atualizada) --------------
INSERT INTO public.parametros (corretora, chave, valor, descricao) VALUES
  ('GENIAL', 'zeragem_faixas', '1:24.50;20:23.25;500:22.00;1000:20.75;5000:19.50',
   'Zeragem regressiva (assessores com zeragem PADRAO): a partir de N contratos operados no mês pelo cliente (maior entre o mês anterior e o vigente):R$ por contrato zerado; vazio = usa ZeragemRS'),
  ('GENIAL', 'zeragem_faixas_desde', '',
   'Zeragem regressiva vale a partir desta data (AAAA-MM-DD); vazio = todo o histórico')
ON CONFLICT (corretora, chave) DO UPDATE SET descricao = EXCLUDED.descricao;

-- 2. Faixas lidas do parâmetro ("a partir de N contratos:R$; …") ----------------------
CREATE OR REPLACE FUNCTION public.zeragem_faixas(p_corretora text)
RETURNS TABLE(minimo numeric, valor numeric)
LANGUAGE sql STABLE
AS $$
  SELECT replace(trim(split_part(item, ':', 1)), ',', '.')::numeric,
         replace(trim(split_part(item, ':', 2)), ',', '.')::numeric
  FROM regexp_split_to_table(COALESCE(public.param(p_corretora, 'zeragem_faixas'), ''), ';') AS item
  WHERE trim(split_part(item, ':', 1)) ~ '^[0-9]+([.,][0-9]+)?$'
    AND trim(split_part(item, ':', 2)) ~ '^[0-9]+([.,][0-9]+)?$'
  ORDER BY 1;
$$;
REVOKE ALL ON FUNCTION public.zeragem_faixas(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zeragem_faixas(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.zeragem_faixas(text) TO authenticated, service_role;

-- 3. Recalcular lotes: zeragem PADRAO pela tabela regressiva -------------------------
--    Volume do cliente = contratos operados (linhas que não são zeragem) somados por mês,
--    pelo cliente cadastrado ou, sem cadastro, pela conta/nome do relatório.
CREATE OR REPLACE FUNCTION public.recalcular_lotes(p_corretora text, p_importacao_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n integer; v_modo text; v_zeragem_padrao numeric; v_desde date; v_tem_faixas boolean;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  v_modo := upper(COALESCE(NULLIF(public.param(p_corretora, 'modo_zeragem'), ''), 'ZERAGEM'));
  v_zeragem_padrao := COALESCE(NULLIF(public.param(p_corretora, 'zeragem_padrao'), '')::numeric, 0);
  v_tem_faixas := EXISTS (SELECT 1 FROM public.zeragem_faixas(p_corretora));
  v_desde := NULLIF(public.param(p_corretora, 'zeragem_faixas_desde'), '')::date;
  -- a tabela regressiva depende do volume do mês inteiro (e do anterior): com ela ativa,
  -- uma importação parcial recalcula a corretora toda
  IF v_tem_faixas THEN p_importacao_id := NULL; END IF;

  WITH faixas AS MATERIALIZED (
    SELECT f.minimo, f.valor FROM public.zeragem_faixas(p_corretora) f
  ),
  vol AS MATERIALIZED (
    SELECT COALESCE(x.cliente_id::text, 'CONTA:' || x.conta, 'NOME:' || x.nome_cliente, '?') AS chave,
           date_trunc('month', x.data::timestamp)::date AS mes,
           SUM(CASE WHEN x.zeragem THEN 0 ELSE x.qtd END) AS operados
    FROM public.lotes x
    WHERE x.corretora = p_corretora
    GROUP BY 1, 2
  )
  UPDATE public.lotes l SET
    zeragem = (position(v_modo IN upper(COALESCE(l.modo, ''))) > 0),
    produto = public.produto_de(l.ativo),
    tarifa = COALESCE(
      (SELECT t.corretagem FROM public.tarifas_cliente t
        WHERE t.corretora = l.corretora AND t.cliente_id = l.cliente_id AND t.vigencia <= l.data
        ORDER BY t.vigencia DESC LIMIT 1),
      a.corretagem, 0),
    zeragem_rs = CASE
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
    END
  FROM public.lotes l2
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
  WHERE l.id = l2.id
    AND l2.corretora = p_corretora
    AND (p_importacao_id IS NULL OR l2.importacao_id = p_importacao_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- 4. Aplica na Genial (o resumo lotes_mes acompanha pelo gatilho) ----------------------
SELECT public.recalcular_lotes('GENIAL', NULL) AS linhas_recalculadas;

NOTIFY pgrst, 'reload schema';

-- 5. Conferência: contratos zerados e receita de zeragem por mês na Genial --------------
SELECT lm.mes_ref, SUM(lm.zerados) AS contratos_zerados, ROUND(SUM(lm.receita_zeragem), 2) AS receita_zeragem,
       ROUND(SUM(lm.receita_zeragem) / NULLIF(SUM(lm.zerados), 0), 2) AS media_rs_por_contrato
FROM public.lotes_mes lm
WHERE lm.corretora = 'GENIAL'
GROUP BY lm.mes_ref
ORDER BY lm.mes_ref;
