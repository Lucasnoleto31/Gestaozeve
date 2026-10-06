-- ============================================================================
-- S23 · Status, responsável e data de migração editáveis na ficha do cliente
-- Re-runnável. Rodar depois da S22.
--
-- O que muda: o status manual (cliente_corretora.status, editado na ficha ou vindo da
-- lista própria) passa a valer sobre o status da conta da corretora. Sem status manual,
-- continua automático (SITUACAO_CONTA → mapa de Parâmetros). A data de migração manual
-- também tem prioridade. Mesmas colunas da view, então nenhuma função precisa mudar.
-- ============================================================================
CREATE OR REPLACE VIEW public.v_cliente_corretora AS
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
  COALESCE(pc.assessor_nome, m.responsavel) AS assessor_nome,
  COALESCE(pc.assessor_norm, public.norm_texto(m.responsavel)) AS assessor_norm,
  CASE WHEN COALESCE(m.status, pc.status_conta, 'Em processamento') = 'Migrado'
       THEN COALESCE(m.data_migracao, pc.data_migracao) END AS data_migracao,
  m.responsavel, m.data_entrada, m.parceiro, m.observacoes, m.motivo_recusa
FROM por_cliente pc
FULL JOIN public.cliente_corretora m ON m.corretora = pc.corretora AND m.cliente_id = pc.cliente_id
WHERE pc.cliente_id IS NOT NULL OR m.status IS NOT NULL;

GRANT SELECT ON public.v_cliente_corretora TO service_role;
NOTIFY pgrst, 'reload schema';

-- Conferência: a Genial não muda (ninguém tem status manual lá)
SELECT corretora, status, COUNT(*) FROM public.v_cliente_corretora GROUP BY 1, 2 ORDER BY 1, 2;
