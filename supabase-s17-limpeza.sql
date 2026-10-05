-- =============================================
-- ZeveAI — S17: limpeza total do sistema de gestão
-- Apaga TODAS as tabelas, views e funções do sistema de lotes/CRM antigo.
--
-- Mantém só a autenticação:
--   auth.* (usuários e senhas), public.profiles (nome, e-mail, perfil) e as
--   funções get_my_role(), get_my_profile_id() e set_updated_at().
--
-- NÃO toca nas tabelas de outro sistema que divide este projeto Supabase
-- (alerts, assets, campaigns, clients, contracts, daily_metrics, goals,
--  interactions, loss_reasons, origins, partners, platform_costs, platforms,
--  products, revenues, subproducts, user_roles).
--
-- Antes de rodar: cópia completa em Projetos/Zeve/backup-banco-gestao-2026-10-05.
-- Isto é irreversível.
-- =============================================

DROP VIEW IF EXISTS public.clientes_com_score CASCADE;

DROP TABLE IF EXISTS
  public.contratos_importacoes_log,
  public.contratos,
  public.contratos_importacoes,
  public.assessor_pricing_produto,
  public.assessor_pricing_zeragem_tier,
  public.assessor_pricing,
  public.metas_anuais,
  public.metas_assessor,
  public.barras,
  public.cliente_acoes,
  public.cliente_contas,
  public.cliente_dados_chs,
  public.cliente_followups,
  public.cliente_historico_mensal,
  public.cliente_notas,
  public.cliente_scores,
  public.plataformas,
  public.clientes,
  public.lead_historico,
  public.lead_notas,
  public.leads,
  public.scripts,
  public.funil_etapas,
  public.influenciadores,
  public.notificacoes_log,
  public.receitas,
  public.receitas_importacoes
CASCADE;

-- Funções do sistema antigo (todas as assinaturas de cada nome)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'assessor_acesso_ok', 'assessor_clientes_movimento', 'assessor_evolucao_mensal', 'assessor_minhas_barras',
        'assessor_resumo', 'assessor_top_clientes', 'brasil_hoje', 'clientes_classificacao_counts',
        'contratos_chaves_com_barra', 'contratos_conta_key', 'contratos_incentivo_key', 'contratos_inferir_barras',
        'contratos_por_assessor', 'contratos_por_cliente', 'contratos_por_mes', 'contratos_produto', 'contratos_resumo',
        'contratos_sobreposicao', 'dashboard_acesso_ok', 'dashboard_alertas_executivos', 'dashboard_barras_lista',
        'dashboard_budget_zeragem', 'dashboard_clientes_lista', 'dashboard_clientes_movimento',
        'dashboard_clientes_movimento_impl', 'dashboard_clusters_clientes', 'dashboard_cobertura_pregoes',
        'dashboard_cohort_retencao', 'dashboard_contratos_acuracidade', 'dashboard_contratos_acuracidade_resumo',
        'dashboard_contratos_alertas', 'dashboard_contratos_diario_produto', 'dashboard_contratos_drilldown_dia',
        'dashboard_contratos_evolucao_mensal', 'dashboard_contratos_heatmap_dow', 'dashboard_contratos_kpis',
        'dashboard_contratos_por_produto', 'dashboard_contratos_por_produto_detalhado',
        'dashboard_contratos_receita_mes_projecao', 'dashboard_contratos_receita_por_assessor',
        'dashboard_contratos_receita_total', 'dashboard_contratos_top_clientes', 'dashboard_correlacoes',
        'dashboard_curva_abc', 'dashboard_evolucao_mensal_barra', 'dashboard_evolucao_mensal_corretora',
        'dashboard_fluxo_operacional', 'dashboard_incentivo_clientes', 'dashboard_incentivo_mensal',
        'dashboard_indice_sobrevivencia', 'dashboard_lotes_por_plataforma', 'dashboard_ltv_clientes',
        'dashboard_meta_anual', 'dashboard_metas_anuais', 'dashboard_metas_assessor', 'dashboard_ranking_assessores',
        'dashboard_receita_bruta_liquida', 'dashboard_receita_por_clearing', 'dashboard_receita_por_plataforma',
        'dashboard_resumo_corretoras', 'dashboard_retencao_mensal', 'dashboard_risco_escritorio',
        'dashboard_risco_operacional', 'dashboard_score_cliente', 'dashboard_score_qualidade_barras',
        'dashboard_zeragem_distribuicao', 'get_my_influenciador_id', 'norm_barra', 'norm_corretora', 'norm_texto',
        'receitas_por_assessor', 'receitas_por_cliente', 'receitas_por_mes', 'receitas_resumo',
        'relatorio_churn_por_plataforma', 'relatorio_clientes_por_periodo', 'relatorio_cohort_contratos',
        'relatorio_contratos_por_mes', 'relatorio_lotes_comparativo', 'relatorio_plataformas_por_mes',
        'relatorio_receita_por_assessor', 'relatorio_receita_por_ativo', 'relatorio_receita_por_influenciador',
        'relatorio_receita_por_mes', 'relatorio_receita_por_plataforma', 'relatorio_top_clientes',
        'relatorio_top_clientes_risco', 'relatorio_top_influenciadores'
      ])
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', f.assinatura);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Conferência: deve sobrar só profiles entre as tabelas deste sistema
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;
