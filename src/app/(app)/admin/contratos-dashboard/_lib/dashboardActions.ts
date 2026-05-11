// Objeto agregador com todas as server actions do dashboard.
// Centralizado aqui pra cada View não precisar importar 17 nomes individualmente.
import {
  getKpis, getPorProduto, getTopClientes, getDiarioProduto,
  getHeatmapDow, getEvolucaoMensal, getDrilldownDia,
  getReceitaTotal, getReceitaPorAssessor, getReceitaProjecao,
  getMetaAnual, getAlertas, getAcuracidadeResumo, getAcuracidadeSerie,
  getBarrasAtivas,
  getCohortRetencao, getLtvClientes, getRankingAssessores, getBudgetZeragem,
  getProdutosDetalhados, getZeragemDistribuicao, getReceitaBrutaLiquida,
  getReceitaPorPlataforma, getReceitaPorClearing, getScoreQualidade,
  getMetasAssessor, getAlertasExecutivos,
  getFluxoOperacional, getIndiceSobrevivencia, getRiscoOperacional,
} from '../actions'
import type { DashboardActions } from './types'

export const ACTIONS: DashboardActions = {
  getKpis, getPorProduto, getTopClientes, getDiarioProduto,
  getHeatmapDow, getEvolucaoMensal, getDrilldownDia,
  getReceitaTotal, getReceitaPorAssessor, getReceitaProjecao,
  getMetaAnual, getAlertas, getAcuracidadeResumo, getAcuracidadeSerie,
  getBarrasAtivas,
  getCohortRetencao, getLtvClientes, getRankingAssessores, getBudgetZeragem,
  getProdutosDetalhados, getZeragemDistribuicao, getReceitaBrutaLiquida,
  getReceitaPorPlataforma, getReceitaPorClearing, getScoreQualidade,
  getMetasAssessor, getAlertasExecutivos,
  getFluxoOperacional, getIndiceSobrevivencia, getRiscoOperacional,
}
