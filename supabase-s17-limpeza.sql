-- =============================================
-- ZeveAI — S17: limpeza do projeto Supabase (menos a autenticação)
--
-- Apaga, por nome, as 27 tabelas do sistema de gestão antigo e as 17 tabelas
-- do outro sistema abandonado (nomes em inglês), a view e as funções do
-- sistema antigo.
--
-- Mantém a autenticação: auth.* (usuários e senhas), public.profiles (nome,
-- e-mail, perfil, políticas) e as funções get_my_role(), get_my_profile_id()
-- e set_updated_at().
--
-- Por que este formato:
--   • A primeira tentativa morreu em "deadlock detected": outra sessão segurava
--     uma tabela enquanto o DROP de 27 tabelas numa tacada só pedia lock em
--     todas. Agora cada DROP é uma transação própria (COMMIT depois de cada um),
--     com lock_timeout de 15 s, e as sessões que estiverem segurando essas
--     tabelas são encerradas antes.
--   • Se algum passo falhar, rode o arquivo de novo: tudo é IF EXISTS.
--
-- Backup completo em Projetos/Zeve/backup-banco-gestao-2026-10-05. Irreversível.
-- =============================================

SET lock_timeout = '15s';

-- 0. Encerra as sessões que estão segurando alguma das tabelas que vão cair
--    (app antigo ainda aberto em algum navegador, consultas penduradas).
SELECT DISTINCT pg_terminate_backend(l.pid)
FROM pg_locks l
JOIN pg_class c ON c.oid = l.relation
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND l.pid <> pg_backend_pid()
  AND c.relname IN (
    'contratos_importacoes_log', 'contratos', 'contratos_importacoes', 'assessor_pricing_produto',
    'assessor_pricing_zeragem_tier', 'assessor_pricing', 'metas_anuais', 'metas_assessor', 'cliente_acoes',
    'cliente_contas', 'cliente_dados_chs', 'cliente_followups', 'cliente_historico_mensal', 'cliente_notas',
    'cliente_scores', 'plataformas', 'clientes', 'clientes_com_score', 'lead_historico', 'lead_notas', 'leads',
    'scripts', 'funil_etapas', 'barras', 'influenciadores', 'notificacoes_log', 'receitas', 'receitas_importacoes',
    'alerts', 'assets', 'campaigns', 'clients', 'contracts', 'daily_metrics', 'goals', 'interactions',
    'loss_reasons', 'origins', 'partners', 'platform_costs', 'platforms', 'products', 'revenues', 'subproducts',
    'user_roles'
  );
COMMIT;

-- 1. View
DROP VIEW IF EXISTS public.clientes_com_score CASCADE;
COMMIT;

-- 2. Tabelas do sistema de gestão antigo (filhas antes das mães)
DROP TABLE IF EXISTS public.contratos_importacoes_log CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.contratos CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.contratos_importacoes CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.assessor_pricing_produto CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.assessor_pricing_zeragem_tier CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.assessor_pricing CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.metas_anuais CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.metas_assessor CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.cliente_acoes CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.cliente_contas CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.cliente_dados_chs CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.cliente_followups CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.cliente_historico_mensal CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.cliente_notas CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.cliente_scores CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.plataformas CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.clientes CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.lead_historico CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.lead_notas CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.leads CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.scripts CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.funil_etapas CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.barras CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.influenciadores CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.notificacoes_log CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.receitas CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.receitas_importacoes CASCADE;
COMMIT;

-- 3. Tabelas do outro sistema abandonado (confirmado como lixo em 05/10/2026)
DROP TABLE IF EXISTS public.alerts CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.assets CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.campaigns CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.clients CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.contracts CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.daily_metrics CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.goals CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.interactions CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.loss_reasons CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.origins CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.partners CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.platform_costs CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.platforms CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.products CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.revenues CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.subproducts CASCADE;
COMMIT;
DROP TABLE IF EXISTS public.user_roles CASCADE;
COMMIT;

-- 4. Funções do sistema de gestão antigo (todas as assinaturas de cada nome)
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
COMMIT;

NOTIFY pgrst, 'reload schema';

-- Conferência: deve sobrar profiles e, no máximo, funções/tipos do outro sistema
SELECT 'tabela' AS tipo, tablename AS nome FROM pg_tables WHERE schemaname = 'public'
UNION ALL
SELECT 'funcao', p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
UNION ALL
SELECT 'tipo', t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd')
ORDER BY 1, 2;
