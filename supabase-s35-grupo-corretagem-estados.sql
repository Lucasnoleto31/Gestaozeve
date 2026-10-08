-- ============================================================================
-- S35 · Grupo de corretagem com quatro estados + carga do BTG
-- Re-runnável. Rodar depois da S33 (substitui a S34; se a S34 já rodou, esta acerta os estados).
--
-- cliente_corretora.grupo_corretagem deixa de ser Sim/Não e passa a texto:
--   'Vinculado'      = está no grupo de corretagem certo
--   'Não vinculado'  = ainda não foi colocado no grupo
--   'Bloqueado'      = o banco bloqueou a alteração do grupo por um período; é preciso pedir o
--                      desbloqueio para colocar no grupo certo
--   NULL             = não informado
-- Alertas na lista: 'fora do grupo de corretagem' (Não vinculado) e 'grupo de corretagem
-- bloqueado' (Bloqueado), só para cliente migrado.
-- Carga: os 7 da planilha GRUPO CORRETAGEM_BLOQUEADOS.xlsx (08/10/2026) → Bloqueado; demais
-- migrados do BTG sem informação → Vinculado (conforme a tarifa combinada). Recusou e Em
-- processamento ficam sem informação; quem já tem estado marcado não muda.
-- ============================================================================

-- 1. Coluna: boolean → texto (a view precisa sair do caminho para trocar o tipo) -------------
DROP VIEW IF EXISTS public.v_cliente_corretora;

ALTER TABLE public.cliente_corretora ADD COLUMN IF NOT EXISTS grupo_corretagem text;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'cliente_corretora' AND column_name = 'grupo_corretagem' AND data_type = 'boolean') THEN
    ALTER TABLE public.cliente_corretora ALTER COLUMN grupo_corretagem TYPE text
      USING CASE WHEN grupo_corretagem IS TRUE THEN 'Vinculado' WHEN grupo_corretagem IS FALSE THEN 'Não vinculado' END;
  END IF;
END $$;
ALTER TABLE public.cliente_corretora DROP CONSTRAINT IF EXISTS cliente_corretora_grupo_corretagem_check;
ALTER TABLE public.cliente_corretora ADD CONSTRAINT cliente_corretora_grupo_corretagem_check
  CHECK (grupo_corretagem IS NULL OR grupo_corretagem IN ('Vinculado', 'Não vinculado', 'Bloqueado'));

-- 2. View (igual à S33, com a coluna em texto) ----------------------------------------------
CREATE VIEW public.v_cliente_corretora AS
WITH contas_s AS (
  SELECT ct.corretora, ct.cliente_id, ct.conta, ct.situacao_conta, ct.assessor_nome, ct.assessor_norm,
         ct.data_habilitacao, ct.principal, m.status AS st
  FROM public.contas ct
  LEFT JOIN public.status_conta_mapa m ON m.corretora = ct.corretora AND m.situacao = upper(trim(COALESCE(ct.situacao_conta, '')))
  WHERE ct.cliente_id IS NOT NULL
),
por_cliente AS (
  SELECT corretora, cliente_id,
    COUNT(*)::integer AS n_contas,
    MAX(conta) FILTER (WHERE principal) AS conta_principal,
    MAX(situacao_conta) FILTER (WHERE principal) AS situacao_conta,
    MAX(st) FILTER (WHERE principal) AS status_conta,
    MAX(assessor_nome) FILTER (WHERE principal) AS assessor_nome,
    MAX(assessor_norm) FILTER (WHERE principal) AS assessor_norm,
    MIN(data_habilitacao) FILTER (WHERE st = 'Migrado') AS data_migracao
  FROM contas_s
  GROUP BY corretora, cliente_id
)
SELECT
  COALESCE(pc.corretora, m.corretora) AS corretora,
  COALESCE(pc.cliente_id, m.cliente_id) AS cliente_id,
  COALESCE(pc.n_contas, 0) AS n_contas,
  pc.conta_principal,
  pc.situacao_conta,
  -- manual (ficha / lista própria) > conta da corretora > padrão
  COALESCE(m.status, pc.status_conta, 'Em processamento') AS status,
  -- assessor: conta do export > informado à mão > responsável interno (BTG)
  COALESCE(pc.assessor_nome, m.assessor, m.responsavel) AS assessor_nome,
  COALESCE(pc.assessor_norm, public.norm_texto(m.assessor), public.norm_texto(m.responsavel)) AS assessor_norm,
  CASE WHEN COALESCE(m.status, pc.status_conta, 'Em processamento') = 'Migrado'
       THEN COALESCE(m.data_migracao, pc.data_migracao) END AS data_migracao,
  m.responsavel, m.data_entrada, m.parceiro, m.observacoes, m.motivo_recusa,
  m.grupo_corretagem
FROM por_cliente pc
FULL JOIN public.cliente_corretora m ON m.corretora = pc.corretora AND m.cliente_id = pc.cliente_id
WHERE pc.cliente_id IS NOT NULL OR m.status IS NOT NULL;

GRANT SELECT ON public.v_cliente_corretora TO service_role;

-- 3. Lista de clientes: grupo_corretagem em texto e os dois alertas ---------------------------
DROP FUNCTION IF EXISTS public.clientes_lista(text, date, uuid);
CREATE OR REPLACE FUNCTION public.clientes_lista(p_corretora text, p_mes_ref date DEFAULT NULL, p_cliente_id uuid DEFAULT NULL)
RETURNS TABLE(
  cliente_id uuid, nome text, documento text, telefone text, email text, uf text, perfil text, tipo_pessoa text,
  n_contas integer, conta_principal text, status text, situacao_conta text,
  assessor_nome text, responsavel text, tarifa numeric,
  data_migracao date, data_entrada date, dias_ate_migrar integer,
  lotes_total numeric, lotes_mes numeric, zerados_mes numeric, receita_mes numeric, receita_corretagem_mes numeric, receita_zeragem_mes numeric,
  lotes_12m numeric, receita_12m numeric, ultimo_giro date, ultimo_mes_giro date, meses_sem_giro integer,
  situacao text, alertas text[], parceiro text, observacoes text, motivo_recusa text,
  grupo_corretagem text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH cfg AS MATERIALIZED (
    SELECT COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) AS mes_ref,
           (COALESCE(p_mes_ref, public.mes_referencia(p_corretora)) - INTERVAL '12 months')::date AS mes_ini,
           COALESCE(NULLIF(public.param(p_corretora, 'meses_inativo'), '')::integer, 1) AS meses_inativo,
           public.brasil_hoje() AS hoje
  ),
  base AS MATERIALIZED (
    SELECT * FROM public.v_cliente_corretora vc
    WHERE vc.corretora = p_corretora AND (p_cliente_id IS NULL OR vc.cliente_id = p_cliente_id)
  )
  SELECT
    c.id, c.nome, c.documento, c.telefone, c.email, c.uf, c.perfil, c.tipo_pessoa,
    b.n_contas, b.conta_principal, b.status, b.situacao_conta,
    b.assessor_nome, COALESCE(b.responsavel, a.responsavel),
    COALESCE(tv.corretagem, a.corretagem, 0) AS tarifa,
    b.data_migracao, b.data_entrada,
    CASE WHEN b.data_migracao IS NOT NULL AND b.data_entrada IS NOT NULL THEN (b.data_migracao - b.data_entrada) END AS dias_ate_migrar,
    COALESCE(g.lotes_total, 0), COALESCE(g.lotes_mes, 0), COALESCE(g.zerados_mes, 0), ROUND(COALESCE(g.receita_mes, 0), 2),
    ROUND(COALESCE(g.rc_mes, 0), 2), ROUND(COALESCE(g.rz_mes, 0), 2),
    COALESCE(g.lotes_12m, 0), ROUND(COALESCE(g.receita_12m, 0), 2),
    g.ultimo_giro, g.ultimo_mes_giro,
    CASE WHEN g.ultimo_mes_giro IS NULL THEN NULL
         ELSE ((EXTRACT(YEAR FROM cfg.mes_ref) - EXTRACT(YEAR FROM g.ultimo_mes_giro)) * 12
              + EXTRACT(MONTH FROM cfg.mes_ref) - EXTRACT(MONTH FROM g.ultimo_mes_giro))::integer END AS meses_sem_giro,
    CASE
      WHEN b.status = 'Recusou' THEN 'Recusou'
      WHEN b.status <> 'Migrado' THEN 'Em processamento'
      WHEN g.ultimo_mes_giro IS NULL THEN 'Nunca girou'
      WHEN ((EXTRACT(YEAR FROM cfg.mes_ref) - EXTRACT(YEAR FROM g.ultimo_mes_giro)) * 12
            + EXTRACT(MONTH FROM cfg.mes_ref) - EXTRACT(MONTH FROM g.ultimo_mes_giro)) >= cfg.meses_inativo
        THEN 'Inativo'
      ELSE 'Ativo'
    END AS situacao,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN c.documento IS NULL THEN 'sem CPF/CNPJ' END,
      CASE WHEN c.telefone_digits IS NULL THEN 'sem telefone' END,
      CASE WHEN b.status = 'Migrado' AND b.data_migracao IS NULL THEN 'migrado sem data' END,
      CASE WHEN b.data_entrada IS NULL THEN 'sem data de entrada' END,
      CASE WHEN b.n_contas > 1 THEN b.n_contas || ' contas' END,
      CASE WHEN b.status = 'Migrado' AND g.ultimo_mes_giro IS NULL THEN 'migrado sem giro' END,
      CASE WHEN b.n_contas = 0 AND b.status = 'Migrado' THEN 'sem conta' END,
      CASE WHEN b.n_contas > 0 AND b.conta_principal IS NULL THEN 'sem conta principal' END,
      CASE WHEN b.assessor_norm IS NOT NULL AND a.id IS NULL THEN 'assessor não cadastrado' END,
      CASE WHEN b.status = 'Migrado' AND COALESCE(tv.corretagem, a.corretagem, 0) = 0
            AND COALESCE(a.tipo_zeragem, 'PADRAO') <> 'FIXA' THEN 'tarifa zero' END,
      CASE WHEN b.status = 'Migrado' AND b.grupo_corretagem = 'Não vinculado' THEN 'fora do grupo de corretagem' END,
      CASE WHEN b.status = 'Migrado' AND b.grupo_corretagem = 'Bloqueado' THEN 'grupo de corretagem bloqueado' END
    ], NULL) AS alertas,
    b.parceiro, b.observacoes, b.motivo_recusa,
    b.grupo_corretagem
  FROM base b
  JOIN public.clientes c ON c.id = b.cliente_id
  CROSS JOIN cfg
  LEFT JOIN LATERAL (
    SELECT SUM(lm.operados) AS lotes_total,
           SUM(lm.operados) FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS lotes_mes,
           SUM(lm.zerados)  FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS zerados_mes,
           SUM(lm.receita)  FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS receita_mes,
           SUM(lm.receita_corretagem) FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS rc_mes,
           SUM(lm.receita_zeragem)    FILTER (WHERE lm.mes_ref = cfg.mes_ref) AS rz_mes,
           SUM(lm.operados) FILTER (WHERE lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref) AS lotes_12m,
           SUM(lm.receita)  FILTER (WHERE lm.mes_ref > cfg.mes_ini AND lm.mes_ref <= cfg.mes_ref) AS receita_12m,
           MAX(lm.ultimo_giro) FILTER (WHERE lm.mes_ref <= cfg.mes_ref) AS ultimo_giro,
           MAX(lm.mes_ref) FILTER (WHERE lm.operados > 0 AND lm.mes_ref <= cfg.mes_ref) AS ultimo_mes_giro
    FROM public.lotes_mes lm
    WHERE lm.corretora = p_corretora AND lm.cliente_id = c.id
  ) g ON true
  LEFT JOIN public.assessores a ON a.corretora = p_corretora AND a.nome_norm = b.assessor_norm
  LEFT JOIN LATERAL (
    SELECT t.corretagem FROM public.tarifas_cliente t
    WHERE t.corretora = p_corretora AND t.cliente_id = c.id AND t.vigencia <= cfg.hoje
    ORDER BY t.vigencia DESC LIMIT 1
  ) tv ON true
  WHERE public.acesso_ok()
  ORDER BY COALESCE(g.lotes_12m, 0) DESC, c.nome;
$$;

REVOKE ALL ON FUNCTION public.clientes_lista(text, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clientes_lista(text, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.clientes_lista(text, date, uuid) TO authenticated, service_role;

-- 4. Carga do BTG ------------------------------------------------------------------------------
-- 4a. Bloqueados pelo banco (planilha de 08/10/2026, casados pelo CPF/CNPJ)
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
SELECT c.id, 'BTG', 'Bloqueado'
FROM bloqueados b
JOIN public.clientes c ON c.documento = b.documento
ON CONFLICT (cliente_id, corretora) DO UPDATE SET grupo_corretagem = 'Bloqueado', updated_at = now();

-- 4b. Demais migrados do BTG ainda sem informação → Vinculado
INSERT INTO public.cliente_corretora (cliente_id, corretora, grupo_corretagem)
SELECT vc.cliente_id, vc.corretora, 'Vinculado'
FROM public.v_cliente_corretora vc
WHERE vc.corretora = 'BTG' AND vc.status = 'Migrado' AND vc.grupo_corretagem IS NULL
ON CONFLICT (cliente_id, corretora) DO UPDATE SET grupo_corretagem = 'Vinculado', updated_at = now()
WHERE cliente_corretora.grupo_corretagem IS NULL;

NOTIFY pgrst, 'reload schema';

-- 5. Conferência -------------------------------------------------------------------------------
SELECT c.nome, vc.status, vc.grupo_corretagem, vc.conta_principal
FROM public.v_cliente_corretora vc
JOIN public.clientes c ON c.id = vc.cliente_id
WHERE vc.corretora = 'BTG' AND c.documento IN ('18636659949', '02319270108', '54405309000190', '33337170854', '84320737172', '05807641175', '38857540880')
ORDER BY c.nome;

SELECT vc.corretora, vc.status, COALESCE(vc.grupo_corretagem, '(não informado)') AS grupo_corretagem, COUNT(*) AS clientes
FROM public.v_cliente_corretora vc
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
