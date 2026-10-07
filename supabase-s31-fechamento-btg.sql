-- ============================================================================
-- S31 · Fechamento do BTG: receita a partir da migração, cadeia de impostos/comissão
--       e ajustes de setembro/26 conforme a planilha "Artur Fonseca_Setembro 26"
-- Re-runnável. Rodar depois da S30.
--
-- O que o fechamento mostrou:
-- 1. O BTG só paga a partir do dia em que a conta passou para o escritório. Nilson, Pablo e
--    Edevaldo contam desde 17/09 (a lista dizia 24, 21 e 22/09). Lotes antes da migração
--    deixam de entrar na receita (parâmetro receita_desde_migracao = SIM).
-- 2. Receita bruta do BTG = lotes × tarifa ÷ (1 − 9,65 %): o preço cobrado do cliente embute
--    ISS/PIS/COFINS. Dela o BTG desconta 6,65 % (receita líquida), paga 75 % de comissão,
--    a Delta fica com 30 % e o imposto do escritório é 16,5 % sobre o que sobra.
-- 3. Edevaldo Alves estava sem tarifa (receita zero); pelo fechamento, R$ 0,33 por lote.
-- 4. Faltavam no relatório importado lançamentos que o BTG pagou: 23/09 (Pablo, 40 lotes),
--    28/09 (Nilson 240, Pablo 14) e 29/09 (Nilson 106, Marcos 32, Jose Robson 16).
--    Entram como importação "Fechamento BTG set/26 (ajuste)".
-- ============================================================================

-- 1. Parâmetros --------------------------------------------------------------------
INSERT INTO public.parametros (corretora, chave, valor, descricao) VALUES
  ('BTG', 'impostos_embutidos_pct', '9.65', 'Impostos embutidos no preço cobrado do cliente (%): receita bruta do BTG = lotes × tarifa ÷ (1 − isso)'),
  ('BTG', 'imposto_btg_pct', '6.65', 'Impostos que o BTG desconta da receita bruta (%); sobra a receita líquida'),
  ('BTG', 'receita_desde_migracao', 'SIM', 'Receita só a partir da data de migração do cliente (SIM/NAO)'),
  ('BTG', 'atp_base', 'receita', 'Base das metas do ATP: receita (lotes × tarifa), bruta, liquida ou comissao (valores do BTG)'),
  ('GENIAL', 'receita_desde_migracao', 'NAO', 'Receita só a partir da data de migração do cliente (SIM/NAO)')
ON CONFLICT (corretora, chave) DO UPDATE SET descricao = EXCLUDED.descricao;

UPDATE public.parametros SET valor = '16.5', descricao = 'Imposto do escritório sobre a comissão depois da Delta (%)'
 WHERE corretora = 'BTG' AND chave = 'imposto_pct' AND replace(valor, ',', '.') IN ('16.6', '16.60');
UPDATE public.parametros SET descricao = 'Comissão do BTG sobre a receita líquida, progressiva: a partir de R$:%'
 WHERE corretora = 'BTG' AND chave = 'repasse_faixas';
UPDATE public.parametros SET descricao = 'Delta sobre a comissão (%)' WHERE corretora = 'BTG' AND chave = 'delta_pct';
UPDATE public.parametros SET descricao = 'Divisão da comissão líquida (nome:%)' WHERE corretora = 'BTG' AND chave = 'participacoes';

-- 2. Lançamentos antes da migração ficam marcados e fora da receita --------------------
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS conta_para_receita boolean NOT NULL DEFAULT true;

CREATE OR REPLACE VIEW public.v_lotes AS
SELECT
  l.id, l.corretora, l.importacao_id, l.data,
  (date_trunc('month', l.data::timestamp))::date AS mes_ref,
  (date_trunc('week', l.data::timestamp))::date  AS semana_ini,
  l.conta, l.id_cliente, l.id_assessor, l.assessor_nome, l.assessor_norm, l.filial,
  l.ativo, l.produto, l.modo, l.zeragem, l.qtd, l.plataforma, l.nome_cliente, l.tipo_pessoa,
  l.cliente_id, l.conta_id, l.tarifa, l.zeragem_rs, l.multiplicador, l.chave_incentivo,
  CASE WHEN l.zeragem THEN 0 ELSE l.qtd END AS lotes_operados,
  CASE WHEN l.zeragem THEN l.qtd ELSE 0 END AS lotes_zerados,
  CASE WHEN l.zeragem THEN l.qtd * l.zeragem_rs ELSE l.qtd * l.tarifa END AS receita,
  CASE WHEN l.zeragem THEN 0 ELSE l.qtd * l.multiplicador END AS pontos,
  COALESCE(c.nome, l.nome_cliente, 'Não cadastrado') AS cliente_nome,
  c.nome_norm AS cliente_norm,
  c.documento,
  (c.id IS NULL) AS nao_cadastrado,
  a.responsavel
FROM public.lotes l
LEFT JOIN public.clientes c ON c.id = l.cliente_id
LEFT JOIN public.assessores a ON a.corretora = l.corretora AND a.nome_norm = l.assessor_norm
WHERE l.conta_para_receita;

-- 3. Resumo mensal ignora o que não conta para receita --------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_lotes_mes(p_corretora text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.lotes_mes WHERE corretora = p_corretora;
  INSERT INTO public.lotes_mes (corretora, mes_ref, cliente_id, conta_id, conta, assessor_nome, assessor_norm, chave_incentivo, produto,
                                nome_export, filial, linhas, operados, zerados, receita, receita_corretagem, receita_zeragem, pontos,
                                primeiro_dia, ultimo_dia, ultimo_giro)
  SELECT l.corretora, date_trunc('month', l.data::timestamp)::date, l.cliente_id, l.conta_id, l.conta, l.assessor_nome, l.assessor_norm,
         l.chave_incentivo, l.produto,
         MAX(l.nome_cliente), MAX(l.filial), COUNT(*)::integer,
         SUM(CASE WHEN l.zeragem THEN 0 ELSE l.qtd END),
         SUM(CASE WHEN l.zeragem THEN l.qtd ELSE 0 END),
         SUM(CASE WHEN l.zeragem THEN l.qtd * l.zeragem_rs ELSE l.qtd * l.tarifa END),
         SUM(CASE WHEN l.zeragem THEN 0 ELSE l.qtd * l.tarifa END),
         SUM(CASE WHEN l.zeragem THEN l.qtd * l.zeragem_rs ELSE 0 END),
         SUM(CASE WHEN l.zeragem THEN 0 ELSE l.qtd * l.multiplicador END),
         MIN(l.data), MAX(l.data),
         MAX(l.data) FILTER (WHERE NOT l.zeragem AND l.qtd > 0)
  FROM public.lotes l
  WHERE l.corretora = p_corretora AND l.conta_para_receita
  GROUP BY l.corretora, 2, l.cliente_id, l.conta_id, l.conta, l.assessor_nome, l.assessor_norm, l.chave_incentivo, l.produto;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- 4. Recalcular lotes: marca o que vem antes da migração (quando a corretora paga só a partir dela)
CREATE OR REPLACE FUNCTION public.recalcular_lotes(p_corretora text, p_importacao_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n integer; v_modo text; v_zeragem_padrao numeric; v_desde date; v_tem_faixas boolean; v_desde_migracao boolean;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  v_modo := upper(COALESCE(NULLIF(public.param(p_corretora, 'modo_zeragem'), ''), 'ZERAGEM'));
  v_zeragem_padrao := COALESCE(NULLIF(public.param(p_corretora, 'zeragem_padrao'), '')::numeric, 0);
  v_tem_faixas := EXISTS (SELECT 1 FROM public.zeragem_faixas(p_corretora));
  v_desde := NULLIF(public.param(p_corretora, 'zeragem_faixas_desde'), '')::date;
  v_desde_migracao := upper(COALESCE(public.param(p_corretora, 'receita_desde_migracao'), 'NAO')) = 'SIM';
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
  ),
  migra AS MATERIALIZED (
    SELECT vc.cliente_id, vc.data_migracao FROM public.v_cliente_corretora vc WHERE vc.corretora = p_corretora
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
    END,
    conta_para_receita = NOT (v_desde_migracao AND mg.data_migracao IS NOT NULL AND l2.data < mg.data_migracao)
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
  LEFT JOIN migra mg ON mg.cliente_id = l2.cliente_id
  WHERE l.id = l2.id
    AND l2.corretora = p_corretora
    AND (p_importacao_id IS NULL OR l2.importacao_id = p_importacao_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- 5. Setembro/26 conforme o fechamento ---------------------------------------------------
-- 5a. Data de migração que o BTG usou para os três primeiros clientes
UPDATE public.cliente_corretora m SET data_migracao = DATE '2026-09-17', updated_at = now()
FROM public.clientes c
WHERE m.corretora = 'BTG' AND m.cliente_id = c.id AND c.documento IN ('30272323802', '93428855515', '31479765805');

-- 5b. Tarifa do Edevaldo Alves (R$ 0,33 por lote, pelo fechamento)
INSERT INTO public.tarifas_cliente (corretora, cliente_id, vigencia, corretagem, observacao)
SELECT 'BTG', c.id, DATE '2026-09-01', 0.33, 'Fechamento BTG set/26: R$ 0,33 por lote'
FROM public.clientes c WHERE c.documento = '31479765805'
ON CONFLICT (corretora, cliente_id, vigencia) DO UPDATE SET corretagem = EXCLUDED.corretagem, observacao = EXCLUDED.observacao;

-- 5c. Lançamentos pagos pelo BTG que não vieram no relatório importado
DO $$
DECLARE v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.importacoes WHERE corretora = 'BTG' AND tipo = 'lotes' AND nome_arquivo = 'Fechamento BTG set/26 (ajuste)') THEN
    INSERT INTO public.importacoes (corretora, tipo, nome_arquivo, linhas, linhas_novas, linhas_ignoradas, data_min, data_max, criado_por_nome, detalhes)
    VALUES ('BTG', 'lotes', 'Fechamento BTG set/26 (ajuste)', 6, 6, 0, DATE '2026-09-23', DATE '2026-09-29', 'S31',
            '{"origem": "Artur Fonseca_Setembro 26.xlsx", "motivo": "dias pagos pelo BTG que faltavam no relatório de lotes"}'::jsonb)
    RETURNING id INTO v_id;
    INSERT INTO public.lotes (corretora, importacao_id, data, conta, documento, nome_cliente, ativo, produto, modo, zeragem, qtd, plataforma, assessor_nome, assessor_norm)
    SELECT 'BTG', v_id, v.data, v.conta, v.documento, v.nome, 'WINV26', 'WIN', 'FECHAMENTO', false, v.qtd, 'NELOGICA', v.assessor, public.norm_texto(v.assessor)
    FROM (VALUES
      (DATE '2026-09-23', '5831484',  '93428855515', 'Pablo Pedrinni de Oliveira Castro', 40,  'Artur'),
      (DATE '2026-09-28', '5184171',  '30272323802', 'Nilson Caglia',                     240, 'Artur'),
      (DATE '2026-09-28', '5831484',  '93428855515', 'Pablo Pedrinni de Oliveira Castro', 14,  'Artur'),
      (DATE '2026-09-29', '5184171',  '30272323802', 'Nilson Caglia',                     106, 'Artur'),
      (DATE '2026-09-29', '33892860', '08244284986', 'Marcos Alexandre Wojciechowski',    32,  'Lucas'),
      (DATE '2026-09-29', '40367179', '09886028423', 'Jose Robson Vilarim Da Silva',      16,  'Artur')
    ) AS v(data, conta, documento, nome, qtd, assessor);
    PERFORM public.vincular_lotes('BTG', v_id);
  END IF;
END $$;

-- 5d. Recalcula o BTG inteiro (tarifas, zeragem, flag da migração; o resumo acompanha pelo gatilho)
SELECT public.recalcular_lotes('BTG', NULL) AS linhas_recalculadas;

NOTIFY pgrst, 'reload schema';

-- 6. Conferência: setembro/26 do BTG por cliente e a cadeia do fechamento --------------------
--    Esperado (planilha): bruta 978,03 · líquida 912,99 · comissão 684,74 · Delta 205,42 ·
--    comissão do escritório 479,32 · imposto 79,09 · comissão líquida 400,23 (só corretagem)
WITH cli AS (
  SELECT c.nome, SUM(lm.operados) AS lotes, ROUND(SUM(lm.receita), 2) AS receita
  FROM public.lotes_mes lm JOIN public.clientes c ON c.id = lm.cliente_id
  WHERE lm.corretora = 'BTG' AND lm.mes_ref = DATE '2026-09-01'
  GROUP BY c.nome
),
tot AS (SELECT SUM(receita) AS receita FROM cli),
cadeia AS (
  SELECT receita,
         receita / (1 - 0.0965) AS bruta,
         receita / (1 - 0.0965) * (1 - 0.0665) AS liquida,
         receita / (1 - 0.0965) * (1 - 0.0665) * 0.75 AS comissao
  FROM tot
)
SELECT nome, lotes, receita, NULL::numeric AS bruta, NULL::numeric AS liquida, NULL::numeric AS comissao, NULL::numeric AS delta, NULL::numeric AS imposto, NULL::numeric AS comissao_liquida FROM cli
UNION ALL
SELECT 'TOTAL SET/26', NULL, ROUND(receita, 2), ROUND(bruta, 2), ROUND(liquida, 2), ROUND(comissao, 2),
       ROUND(comissao * 0.30, 2), ROUND(comissao * 0.70 * 0.165, 2), ROUND(comissao * 0.70 * (1 - 0.165), 2)
FROM cadeia
ORDER BY lotes DESC NULLS LAST;
