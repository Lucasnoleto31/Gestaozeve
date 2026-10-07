-- ============================================================================
-- S32 · Importação "completar", ajustes protegidos, lotes × ações × posição,
--       corretagem manual por operação e setembro/26 do BTG recomposto
-- Re-runnável. Rodar depois da S31.
--
-- O relatório novo do BTG (BASE_57_CLIENTES, importado no modo substituir) apagou os
-- lançamentos de ajuste de setembro e não trazia 28, 29 e 30/09; depois a importação foi
-- desfeita e o BTG ficou sem lançamentos. Ele também traz ações, cripto e posições. Aqui:
-- 1. importacoes.protegida: ajustes de fechamento não são apagados pelo modo substituir
-- 2. dias_com_lotes(): dias já lançados num período (modo "completar" do importador)
-- 3. Três categorias de linha, pelo MODO e pelo ativo:
--    · lote    = day trade em contrato futuro (WINV26, WDOX26…): conta como lote, receita = qtd × tarifa
--    · ações   = day trade fora de futuros (ITUB4, XRPBRL…): não é lote; receita = corretagem fixa
--                por operação (tarifa_acoes_daytrade, R$ 9,00 no BTG)
--    · posição = o que não é day trade nem zeragem: só a quantidade; rende apenas se a
--                corretagem for informada à mão
--    Genial não distingue (modo_daytrade vazio, lotes_apenas_futuros NAO): tudo continua lote.
-- 4. lotes.tarifa_manual: corretagem ajustada por operação (tela Giro diário → dia); vale
--    sobre o cadastro e sobrevive aos recálculos. operacoes_dia() lista o dia e
--    definir_corretagem_dia() grava os ajustes.
-- 5. setembro/26 do BTG: 23, 28, 29 e 30/09 numa importação protegida
-- 6. Gabriel e Sergio: migração no dia seguinte à operação que o BTG não pagou
-- Depois de rodar: importar o relatório do BTG de novo com o modo "Completar".
-- ============================================================================

-- 1. Importações protegidas -----------------------------------------------------------
ALTER TABLE public.importacoes ADD COLUMN IF NOT EXISTS protegida boolean NOT NULL DEFAULT false;

-- 2. Dias que já têm lançamento num período --------------------------------------------
CREATE OR REPLACE FUNCTION public.dias_com_lotes(p_corretora text, p_inicio date, p_fim date)
RETURNS TABLE(dia date)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT DISTINCT l.data
  FROM public.lotes l
  WHERE l.corretora = p_corretora AND l.data BETWEEN p_inicio AND p_fim AND public.acesso_ok()
  ORDER BY 1;
$$;

-- 3. Categorias: parâmetros, colunas, view, resumo e recálculo ----------------------------
INSERT INTO public.parametros (corretora, chave, valor, descricao) VALUES
  ('BTG', 'modo_daytrade', 'DAYTRADE', 'Texto no campo MODO que marca day trade; o que não é day trade nem zeragem vira posição (só quantidade; rende só com corretagem informada à mão). Vazio = tudo conta como lote'),
  ('GENIAL', 'modo_daytrade', '', 'Texto no campo MODO que marca day trade; o que não é day trade nem zeragem vira posição (só quantidade; rende só com corretagem informada à mão). Vazio = tudo conta como lote'),
  ('BTG', 'lotes_apenas_futuros', 'SIM', 'Só contratos futuros (WINV26, WDOX26…) contam como lotes (SIM/NAO); com SIM, day trade em ações/cripto vira operação de ações com a corretagem fixa'),
  ('GENIAL', 'lotes_apenas_futuros', 'NAO', 'Só contratos futuros (WINV26, WDOX26…) contam como lotes (SIM/NAO); com SIM, day trade em ações/cripto vira operação de ações com a corretagem fixa'),
  ('BTG', 'tarifa_acoes_daytrade', '9', 'Corretagem por operação de day trade em ações/cripto (R$ por linha do relatório); essas operações não contam como lotes'),
  ('GENIAL', 'tarifa_acoes_daytrade', '0', 'Corretagem por operação de day trade em ações/cripto (R$ por linha do relatório); essas operações não contam como lotes')
ON CONFLICT (corretora, chave) DO UPDATE SET descricao = EXCLUDED.descricao;

ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS posicao boolean NOT NULL DEFAULT false;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS acoes boolean NOT NULL DEFAULT false;
ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS tarifa_manual numeric(10,4);   -- NULL = usa o cadastro
ALTER TABLE public.lotes_mes ADD COLUMN IF NOT EXISTS posicao numeric NOT NULL DEFAULT 0;
ALTER TABLE public.lotes_mes ADD COLUMN IF NOT EXISTS acoes_operacoes integer NOT NULL DEFAULT 0;
ALTER TABLE public.lotes_mes ADD COLUMN IF NOT EXISTS receita_acoes numeric NOT NULL DEFAULT 0;

-- Lançamentos de ajuste da S31 vieram com MODO 'FECHAMENTO': são day trade
UPDATE public.lotes SET modo = 'DAYTRADE' WHERE corretora = 'BTG' AND upper(COALESCE(modo, '')) = 'FECHAMENTO';

-- v_lotes: posição e ações não são lotes; ações (e posição com corretagem informada) rendem a
-- tarifa fixa da linha. Colunas novas só no fim (CREATE OR REPLACE VIEW).
CREATE OR REPLACE VIEW public.v_lotes AS
SELECT
  l.id, l.corretora, l.importacao_id, l.data,
  (date_trunc('month', l.data::timestamp))::date AS mes_ref,
  (date_trunc('week', l.data::timestamp))::date  AS semana_ini,
  l.conta, l.id_cliente, l.id_assessor, l.assessor_nome, l.assessor_norm, l.filial,
  l.ativo, l.produto, l.modo, l.zeragem, l.qtd, l.plataforma, l.nome_cliente, l.tipo_pessoa,
  l.cliente_id, l.conta_id, l.tarifa, l.zeragem_rs, l.multiplicador, l.chave_incentivo,
  CASE WHEN l.zeragem OR l.posicao OR l.acoes THEN 0 ELSE l.qtd END AS lotes_operados,
  CASE WHEN l.zeragem THEN l.qtd ELSE 0 END AS lotes_zerados,
  CASE WHEN l.zeragem THEN l.qtd * l.zeragem_rs WHEN l.acoes OR l.posicao THEN l.tarifa ELSE l.qtd * l.tarifa END AS receita,
  CASE WHEN l.zeragem OR l.posicao OR l.acoes THEN 0 ELSE l.qtd * l.multiplicador END AS pontos,
  COALESCE(c.nome, l.nome_cliente, 'Não cadastrado') AS cliente_nome,
  c.nome_norm AS cliente_norm,
  c.documento,
  (c.id IS NULL) AS nao_cadastrado,
  a.responsavel,
  CASE WHEN l.posicao THEN l.qtd ELSE 0 END AS posicao_qtd,
  CASE WHEN l.acoes THEN 1 ELSE 0 END AS acoes_operacoes
FROM public.lotes l
LEFT JOIN public.clientes c ON c.id = l.cliente_id
LEFT JOIN public.assessores a ON a.corretora = l.corretora AND a.nome_norm = l.assessor_norm
WHERE l.conta_para_receita;

CREATE OR REPLACE FUNCTION public.atualizar_lotes_mes(p_corretora text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.lotes_mes WHERE corretora = p_corretora;
  INSERT INTO public.lotes_mes (corretora, mes_ref, cliente_id, conta_id, conta, assessor_nome, assessor_norm, chave_incentivo, produto,
                                nome_export, filial, linhas, operados, zerados, receita, receita_corretagem, receita_zeragem, pontos,
                                primeiro_dia, ultimo_dia, ultimo_giro, posicao, acoes_operacoes, receita_acoes)
  SELECT l.corretora, date_trunc('month', l.data::timestamp)::date, l.cliente_id, l.conta_id, l.conta, l.assessor_nome, l.assessor_norm,
         l.chave_incentivo, l.produto,
         MAX(l.nome_cliente), MAX(l.filial), COUNT(*)::integer,
         SUM(CASE WHEN l.zeragem OR l.posicao OR l.acoes THEN 0 ELSE l.qtd END),
         SUM(CASE WHEN l.zeragem THEN l.qtd ELSE 0 END),
         SUM(CASE WHEN l.zeragem THEN l.qtd * l.zeragem_rs WHEN l.acoes OR l.posicao THEN l.tarifa ELSE l.qtd * l.tarifa END),
         SUM(CASE WHEN l.zeragem OR l.posicao OR l.acoes THEN 0 ELSE l.qtd * l.tarifa END),
         SUM(CASE WHEN l.zeragem THEN l.qtd * l.zeragem_rs ELSE 0 END),
         SUM(CASE WHEN l.zeragem OR l.posicao OR l.acoes THEN 0 ELSE l.qtd * l.multiplicador END),
         MIN(l.data), MAX(l.data),
         MAX(l.data) FILTER (WHERE NOT l.zeragem AND NOT l.posicao AND NOT l.acoes AND l.qtd > 0),
         SUM(CASE WHEN l.posicao THEN l.qtd ELSE 0 END),
         COUNT(*) FILTER (WHERE l.acoes)::integer,
         SUM(CASE WHEN l.acoes OR l.posicao THEN l.tarifa ELSE 0 END)
  FROM public.lotes l
  WHERE l.corretora = p_corretora AND l.conta_para_receita
  GROUP BY l.corretora, 2, l.cliente_id, l.conta_id, l.conta, l.assessor_nome, l.assessor_norm, l.chave_incentivo, l.produto;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

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

-- 4. Operações do dia: lista e ajuste da corretagem por operação ----------------------------
--    Todas as linhas do dia (também as de antes da migração, que não contam), com a corretagem
--    em uso e a que o cadastro daria.
CREATE OR REPLACE FUNCTION public.operacoes_dia(p_corretora text, p_data date)
RETURNS TABLE(
  id uuid, conta text, cliente_id uuid, cliente_nome text, nao_cadastrado boolean, assessor_nome text,
  ativo text, produto text, modo text, plataforma text, tipo text, qtd numeric, tarifa numeric, tarifa_manual numeric,
  tarifa_padrao numeric, zeragem_rs numeric, conta_para_receita boolean, receita numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT l.id, l.conta, l.cliente_id, COALESCE(c.nome, l.nome_cliente, 'Não cadastrado'), (c.id IS NULL), l.assessor_nome,
         l.ativo, l.produto, l.modo, l.plataforma,
         CASE WHEN l.zeragem THEN 'zeragem' WHEN l.acoes THEN 'acoes' WHEN l.posicao THEN 'posicao' ELSE 'lote' END,
         l.qtd, l.tarifa, l.tarifa_manual,
         CASE
           WHEN l.acoes THEN COALESCE(replace(NULLIF(public.param(p_corretora, 'tarifa_acoes_daytrade'), ''), ',', '.')::numeric, 0)
           WHEN l.posicao THEN 0
           ELSE COALESCE(
             (SELECT t.corretagem FROM public.tarifas_cliente t
               WHERE t.corretora = l.corretora AND t.cliente_id = l.cliente_id AND t.vigencia <= l.data
               ORDER BY t.vigencia DESC LIMIT 1),
             a.corretagem, 0)
         END,
         l.zeragem_rs, l.conta_para_receita,
         CASE WHEN NOT l.conta_para_receita THEN 0
              WHEN l.zeragem THEN l.qtd * l.zeragem_rs
              WHEN l.acoes OR l.posicao THEN l.tarifa
              ELSE l.qtd * l.tarifa END
  FROM public.lotes l
  LEFT JOIN public.clientes c ON c.id = l.cliente_id
  LEFT JOIN public.assessores a ON a.corretora = l.corretora AND a.nome_norm = l.assessor_norm
  WHERE l.corretora = p_corretora AND l.data = p_data AND public.acesso_ok()
  ORDER BY 4, 7, 1;
$$;

-- p_itens = [{"id": "<uuid>", "tarifa": 9}, {"id": "<uuid>", "tarifa": null}]  (null = volta ao cadastro)
CREATE OR REPLACE FUNCTION public.definir_corretagem_dia(p_corretora text, p_itens jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.acesso_ok() THEN RAISE EXCEPTION 'não autorizado'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_itens, '[]'::jsonb)) x WHERE NULLIF(x->>'tarifa', '')::numeric < 0) THEN
    RAISE EXCEPTION 'corretagem negativa';
  END IF;
  UPDATE public.lotes l SET tarifa_manual = i.tarifa
  FROM (
    SELECT (x->>'id')::uuid AS id, NULLIF(x->>'tarifa', '')::numeric AS tarifa
    FROM jsonb_array_elements(COALESCE(p_itens, '[]'::jsonb)) x
  ) i
  WHERE l.id = i.id AND l.corretora = p_corretora AND l.tarifa_manual IS DISTINCT FROM i.tarifa;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN PERFORM public.recalcular_lotes(p_corretora, NULL); END IF;
  RETURN n;
END;
$$;

-- 5. Painel: posição e ações por mês e no mês de referência (colunas novas no fim) -----------
DROP FUNCTION IF EXISTS public.painel_mensal(text, date, integer);
CREATE OR REPLACE FUNCTION public.painel_mensal(p_corretora text, p_mes_ref date DEFAULT NULL, p_meses integer DEFAULT 12)
RETURNS TABLE(
  mes_ref date, migrados_acumulados integer, novas_migracoes integer, entradas integer, clientes_ativos integer,
  lotes numeric, zerados numeric, receita_corretagem numeric, receita_zeragem numeric, receita numeric,
  incentivo numeric, clientes_pontuando integer, clientes_com_faixa integer,
  posicao numeric, acoes_operacoes integer, receita_acoes numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref),
  meses AS MATERIALIZED (
    SELECT (cfg.mes_ref - (n || ' months')::interval)::date AS mes_ref
    FROM cfg, generate_series(0, GREATEST(p_meses, 1) - 1) AS n
  ),
  mig AS MATERIALIZED (
    SELECT vc.cliente_id, vc.data_migracao
    FROM public.v_cliente_corretora vc
    WHERE vc.corretora = p_corretora AND vc.status = 'Migrado' AND vc.data_migracao IS NOT NULL
  ),
  ent AS (
    SELECT date_trunc('month', m.data_entrada)::date AS mes_ref, COUNT(*)::integer AS n
    FROM public.cliente_corretora m WHERE m.corretora = p_corretora AND m.data_entrada IS NOT NULL
    GROUP BY 1
  ),
  giro AS (
    SELECT lm.mes_ref, COUNT(DISTINCT lm.cliente_id) FILTER (WHERE lm.operados > 0) AS ativos,
           SUM(lm.operados) AS lotes, SUM(lm.zerados) AS zerados,
           SUM(lm.receita_corretagem) AS rc, SUM(lm.receita_zeragem) AS rz,
           SUM(lm.posicao) AS posicao, SUM(lm.acoes_operacoes) AS acoes_op, SUM(lm.receita_acoes) AS r_ac
    FROM public.lotes_mes lm
    WHERE lm.corretora = p_corretora AND lm.mes_ref IN (SELECT m.mes_ref FROM meses m)
    GROUP BY lm.mes_ref
  ),
  inc AS (
    SELECT h.mes_ref, h.incentivo, h.clientes_pontuando, h.clientes_com_faixa
    FROM public.incentivo_historico(p_corretora, (SELECT mes_ref FROM cfg), p_meses) h
  )
  SELECT m.mes_ref,
    (SELECT COUNT(*) FROM mig WHERE mig.data_migracao < m.mes_ref + INTERVAL '1 month')::integer,
    (SELECT COUNT(*) FROM mig WHERE date_trunc('month', mig.data_migracao)::date = m.mes_ref)::integer,
    COALESCE(e.n, 0),
    COALESCE(g.ativos, 0)::integer,
    COALESCE(g.lotes, 0), COALESCE(g.zerados, 0),
    ROUND(COALESCE(g.rc, 0), 2), ROUND(COALESCE(g.rz, 0), 2), ROUND(COALESCE(g.rc, 0) + COALESCE(g.rz, 0) + COALESCE(g.r_ac, 0), 2),
    COALESCE(i.incentivo, 0), COALESCE(i.clientes_pontuando, 0), COALESCE(i.clientes_com_faixa, 0),
    COALESCE(g.posicao, 0), COALESCE(g.acoes_op, 0)::integer, ROUND(COALESCE(g.r_ac, 0), 2)
  FROM meses m
  LEFT JOIN giro g ON g.mes_ref = m.mes_ref
  LEFT JOIN inc i ON i.mes_ref = m.mes_ref
  LEFT JOIN ent e ON e.mes_ref = m.mes_ref
  WHERE public.acesso_ok()
  ORDER BY m.mes_ref;
$$;

DROP FUNCTION IF EXISTS public.painel_kpis(text, date);
CREATE OR REPLACE FUNCTION public.painel_kpis(p_corretora text, p_mes_ref date DEFAULT NULL)
RETURNS TABLE(
  mes_ref date, clientes_levados integer, total_contas integer, migrados integer, em_processamento integer, recusaram integer,
  ativos_mes integer, lotes_mes numeric, zerados_mes numeric, receita_mes numeric, incentivo_mes numeric, clientes_com_faixa integer,
  migrados_sem_giro integer, inativos integer, com_alertas integer, migrados_sem_data integer, multi_conta integer,
  linhas_nao_cadastradas integer, lotes_nao_cadastrados numeric, ultima_data date,
  lotes_12m numeric, receita_12m numeric, posicao_mes numeric, acoes_operacoes_mes integer, receita_acoes_mes numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref),
  cl AS (SELECT * FROM public.clientes_lista(p_corretora, (SELECT mes_ref FROM cfg))),
  inc AS (
    SELECT COALESCE(SUM(valor_incentivo), 0) AS total, COUNT(*) FILTER (WHERE valor_incentivo > 0)::integer AS com_faixa
    FROM public.incentivo_mes(p_corretora, (SELECT mes_ref FROM cfg))
  ),
  nc AS (
    SELECT COUNT(*)::integer AS linhas, COALESCE(SUM(CASE WHEN zeragem OR posicao OR acoes THEN 0 ELSE qtd END), 0) AS lotes
    FROM public.lotes WHERE corretora = p_corretora AND cliente_id IS NULL AND conta_para_receita
  ),
  extra AS (
    SELECT COALESCE(SUM(lm.posicao), 0) AS posicao, COALESCE(SUM(lm.acoes_operacoes), 0)::integer AS acoes_op,
           ROUND(COALESCE(SUM(lm.receita_acoes), 0), 2) AS r_ac
    FROM public.lotes_mes lm, cfg
    WHERE lm.corretora = p_corretora AND lm.mes_ref = cfg.mes_ref
  )
  SELECT cfg.mes_ref,
    COUNT(cl.cliente_id)::integer,
    COALESCE(SUM(cl.n_contas), 0)::integer,
    COUNT(*) FILTER (WHERE cl.status = 'Migrado')::integer,
    COUNT(*) FILTER (WHERE cl.status = 'Em processamento')::integer,
    COUNT(*) FILTER (WHERE cl.status = 'Recusou')::integer,
    COUNT(*) FILTER (WHERE cl.lotes_mes > 0)::integer,
    COALESCE(SUM(cl.lotes_mes), 0), COALESCE(SUM(cl.zerados_mes), 0), COALESCE(SUM(cl.receita_mes), 0),
    (SELECT total FROM inc), (SELECT com_faixa FROM inc),
    COUNT(*) FILTER (WHERE cl.situacao = 'Nunca girou')::integer,
    COUNT(*) FILTER (WHERE cl.situacao = 'Inativo')::integer,
    COUNT(*) FILTER (WHERE array_length(cl.alertas, 1) > 0)::integer,
    COUNT(*) FILTER (WHERE cl.status = 'Migrado' AND cl.data_migracao IS NULL)::integer,
    COUNT(*) FILTER (WHERE cl.n_contas > 1)::integer,
    (SELECT linhas FROM nc), (SELECT lotes FROM nc),
    (SELECT MAX(data) FROM public.lotes WHERE corretora = p_corretora),
    COALESCE(SUM(cl.lotes_12m), 0), ROUND(COALESCE(SUM(cl.receita_12m), 0), 2),
    (SELECT posicao FROM extra), (SELECT acoes_op FROM extra), (SELECT r_ac FROM extra)
  FROM cfg LEFT JOIN cl ON true
  GROUP BY cfg.mes_ref;
$$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('painel_mensal', 'painel_kpis', 'recalcular_lotes', 'atualizar_lotes_mes', 'dias_com_lotes', 'operacoes_dia', 'definir_corretagem_dia')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.assinatura);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.assinatura);
    IF f.proname = 'atualizar_lotes_mes' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.assinatura);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.assinatura);
    END IF;
  END LOOP;
END $$;

-- 6. Setembro/26 do BTG: os dias do fechamento, numa importação protegida ------------------
--    (23/09 completo, para o modo "completar" não misturar com o arquivo)
DO $$
DECLARE v_id uuid;
BEGIN
  DELETE FROM public.importacoes i
   WHERE i.corretora = 'BTG' AND i.tipo = 'lotes' AND i.nome_arquivo = 'Fechamento BTG set/26 (ajuste)'
     AND NOT EXISTS (SELECT 1 FROM public.lotes l WHERE l.importacao_id = i.id);
  IF NOT EXISTS (SELECT 1 FROM public.importacoes WHERE corretora = 'BTG' AND tipo = 'lotes' AND nome_arquivo = 'Fechamento BTG set/26 (ajuste)') THEN
    INSERT INTO public.importacoes (corretora, tipo, nome_arquivo, linhas, linhas_novas, linhas_ignoradas, data_min, data_max, criado_por_nome, protegida, detalhes)
    VALUES ('BTG', 'lotes', 'Fechamento BTG set/26 (ajuste)', 15, 15, 0, DATE '2026-09-23', DATE '2026-09-30', 'S32', true,
            '{"origem": "Artur Fonseca_Setembro 26.xlsx", "motivo": "dias do fechamento do BTG que faltavam no relatório de lotes (23, 28, 29 e 30/09)"}'::jsonb)
    RETURNING id INTO v_id;
    INSERT INTO public.lotes (corretora, importacao_id, data, conta, documento, nome_cliente, ativo, produto, modo, zeragem, qtd, plataforma, assessor_nome, assessor_norm)
    SELECT 'BTG', v_id, v.data, v.conta, v.documento, v.nome, v.ativo, public.produto_de(v.ativo), 'DAYTRADE', false, v.qtd, 'NELOGICA', v.assessor, public.norm_texto(v.assessor)
    FROM (VALUES
      (DATE '2026-09-23', '5184171',  '30272323802', 'Nilson Caglia',                     'WINV26', 88,  'Artur'),
      (DATE '2026-09-23', '5831484',  '93428855515', 'Pablo Pedrinni de Oliveira Castro', 'WINV26', 120, 'Artur'),
      (DATE '2026-09-23', '29897998', '10711061807', 'Sergio Carlos Martins',             'WINV26', 8,   'Artur'),
      (DATE '2026-09-28', '5184171',  '30272323802', 'Nilson Caglia',                     'WINV26', 240, 'Artur'),
      (DATE '2026-09-28', '5831484',  '93428855515', 'Pablo Pedrinni de Oliveira Castro', 'WINV26', 14,  'Artur'),
      (DATE '2026-09-29', '5184171',  '30272323802', 'Nilson Caglia',                     'WINV26', 106, 'Artur'),
      (DATE '2026-09-29', '33892860', '08244284986', 'Marcos Alexandre Wojciechowski',    'WINV26', 32,  'Lucas'),
      (DATE '2026-09-29', '40367179', '09886028423', 'Jose Robson Vilarim Da Silva',      'WINV26', 16,  'Artur'),
      (DATE '2026-09-30', '5184171',  '30272323802', 'Nilson Caglia',                     'WINV26', 240, 'Artur'),
      (DATE '2026-09-30', '2208791',  '14734581703', 'Yuri Dalto Gambarini',              'WINV26', 12,  'Lucas'),
      (DATE '2026-09-30', '5831484',  '93428855515', 'Pablo Pedrinni de Oliveira Castro', 'WINV26', 28,  'Artur'),
      (DATE '2026-09-30', '40367179', '09886028423', 'Jose Robson Vilarim Da Silva',      'WINV26', 24,  'Artur'),
      (DATE '2026-09-30', '33892860', '08244284986', 'Marcos Alexandre Wojciechowski',    'WINV26', 112, 'Lucas'),
      (DATE '2026-09-30', '3826567',  '10374904600', 'Danilo Campos Borges',              'WINV26', 8,   'Lucas'),
      (DATE '2026-09-30', '3826567',  '10374904600', 'Danilo Campos Borges',              'WDOX26', 4,   'Lucas')
    ) AS v(data, conta, documento, nome, ativo, qtd, assessor);
    PERFORM public.vincular_lotes('BTG', v_id);
  END IF;
END $$;

-- 7. Gabriel e Sergio operaram no dia da migração e o BTG não contou: migração no dia seguinte
UPDATE public.cliente_corretora m SET data_migracao = DATE '2026-09-23', updated_at = now()
FROM public.clientes c WHERE m.corretora = 'BTG' AND m.cliente_id = c.id AND c.documento = '06430904954' AND m.data_migracao < DATE '2026-09-23';
UPDATE public.cliente_corretora m SET data_migracao = DATE '2026-09-24', updated_at = now()
FROM public.clientes c WHERE m.corretora = 'BTG' AND m.cliente_id = c.id AND c.documento = '10711061807' AND m.data_migracao < DATE '2026-09-24';

-- 8. Recalcula as duas corretoras (o resumo acompanha pelo gatilho) ---------------------------
SELECT 'BTG' AS corretora, public.recalcular_lotes('BTG', NULL) AS linhas
UNION ALL
SELECT 'GENIAL', public.recalcular_lotes('GENIAL', NULL);

NOTIFY pgrst, 'reload schema';

-- 9. Conferência: setembro/26 do BTG por cliente (só os dias protegidos, antes de reimportar) ----
SELECT c.nome, SUM(lm.operados) AS lotes, ROUND(SUM(lm.receita), 2) AS receita,
       SUM(lm.posicao) AS posicao, SUM(lm.acoes_operacoes) AS operacoes_acoes, ROUND(SUM(lm.receita_acoes), 2) AS corretagem_fixa
FROM public.lotes_mes lm JOIN public.clientes c ON c.id = lm.cliente_id
WHERE lm.corretora = 'BTG' AND lm.mes_ref = DATE '2026-09-01'
GROUP BY c.nome
ORDER BY 2 DESC;
