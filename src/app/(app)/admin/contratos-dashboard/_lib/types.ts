import type {
  Periodo, DashboardKpis, ProdutoRow, TopClienteRow,
  DiarioProdutoRow, HeatmapCell, EvolucaoMensalRow, DrilldownRow,
  ReceitaTotal, ReceitaPorAssessor, ReceitaProjecao, MetaAnual,
  AlertaRow, AcuracidadeResumo, AcuracidadePonto,
  CohortPonto, LtvCliente, RankingAssessorRow, BudgetZeragemRow,
  ProdutoDetalhado, ZeragemIntensidade, ReceitaBrutaLiquida,
  ReceitaPorPlataforma, ReceitaPorClearing, ScoreQualidadeRow,
  MetaAssessorRow, AlertaExecutivo,
  FluxoOperacional, IndiceSobrevivencia, RiscoOperacionalRow,
  CurvaAbcRow, ScoreClienteRow, ClusterCliente, CorrelacaoRow, RiscoEscritorio,
  RetencaoMensalRow, IncentivoMensalRow, IncentivoClienteRow,
} from '../actions'

export type DashboardActions = {
  getKpis: (p: Periodo, barra?: string | null) => Promise<DashboardKpis>
  getPorProduto: (p: Periodo, barra?: string | null) => Promise<ProdutoRow[]>
  getTopClientes: (p: Periodo, limit?: number, barra?: string | null) => Promise<TopClienteRow[]>
  getDiarioProduto: (p: Periodo, barra?: string | null) => Promise<DiarioProdutoRow[]>
  getHeatmapDow: (p: Periodo, barra?: string | null) => Promise<HeatmapCell[]>
  getEvolucaoMensal: (barra?: string | null) => Promise<EvolucaoMensalRow[]>
  getDrilldownDia: (data: string, barra?: string | null) => Promise<DrilldownRow[]>
  getRetencaoMensal: (barra?: string | null) => Promise<RetencaoMensalRow[]>
  getIncentivoMensal: () => Promise<IncentivoMensalRow[]>
  getIncentivoClientes: (mes?: string | null) => Promise<IncentivoClienteRow[]>
  getReceitaTotal: (p: Periodo) => Promise<ReceitaTotal>
  getReceitaPorAssessor: (p: Periodo) => Promise<ReceitaPorAssessor[]>
  getReceitaProjecao: () => Promise<ReceitaProjecao>
  getMetaAnual: () => Promise<MetaAnual>
  getAlertas: (inativoDias?: number, barra?: string | null) => Promise<AlertaRow[]>
  getAcuracidadeResumo: (lookbackDays?: number) => Promise<AcuracidadeResumo>
  getAcuracidadeSerie: (lookbackDays?: number) => Promise<AcuracidadePonto[]>
  getBarrasAtivas: () => Promise<{ barra_nome: string; numero: string | null }[]>
  getCohortRetencao: (meses?: number) => Promise<CohortPonto[]>
  getLtvClientes: (limit?: number) => Promise<LtvCliente[]>
  getRankingAssessores: (p: Periodo) => Promise<RankingAssessorRow[]>
  getBudgetZeragem: (p: Periodo) => Promise<BudgetZeragemRow[]>
  getProdutosDetalhados: (p: Periodo, barra?: string | null) => Promise<ProdutoDetalhado[]>
  getZeragemDistribuicao: (p: Periodo, barra?: string | null) => Promise<ZeragemIntensidade[]>
  getReceitaBrutaLiquida: (p: Periodo) => Promise<ReceitaBrutaLiquida>
  getReceitaPorPlataforma: (p: Periodo) => Promise<ReceitaPorPlataforma[]>
  getReceitaPorClearing: (p: Periodo) => Promise<ReceitaPorClearing[]>
  getScoreQualidade: (p: Periodo) => Promise<ScoreQualidadeRow[]>
  getMetasAssessor: () => Promise<MetaAssessorRow[]>
  getAlertasExecutivos: () => Promise<AlertaExecutivo[]>
  getFluxoOperacional: (p: Periodo, barra?: string | null) => Promise<FluxoOperacional>
  getIndiceSobrevivencia: (p: Periodo, barra?: string | null) => Promise<IndiceSobrevivencia>
  getRiscoOperacional: (limit?: number, barra?: string | null) => Promise<RiscoOperacionalRow[]>
  getCurvaAbc: (p: Periodo, barra?: string | null) => Promise<CurvaAbcRow[]>
  getScoreCliente: (limit?: number) => Promise<ScoreClienteRow[]>
  getClustersClientes: () => Promise<ClusterCliente[]>
  getCorrelacoes: () => Promise<CorrelacaoRow[]>
  getRiscoEscritorio: () => Promise<RiscoEscritorio>
}

export type DashboardTab =
  | 'executivo'
  | 'operacional'
  | 'incentivo'
  | 'receita'
  | 'clientes'
  | 'assessores'
  | 'analises'
  | 'forecast'

export const TABS: { id: DashboardTab; label: string; href: string }[] = [
  { id: 'executivo',   label: 'Executivo',    href: '/admin/contratos-dashboard' },
  { id: 'operacional', label: 'Operacional',  href: '/admin/contratos-dashboard/operacional' },
  { id: 'incentivo',   label: 'Incentivo',    href: '/admin/contratos-dashboard/incentivo' },
  { id: 'receita',     label: 'Receita',      href: '/admin/contratos-dashboard/receita' },
  { id: 'clientes',    label: 'Clientes',     href: '/admin/contratos-dashboard/clientes' },
  { id: 'assessores',  label: 'Assessores',   href: '/admin/contratos-dashboard/assessores' },
  { id: 'analises',    label: 'Análises',     href: '/admin/contratos-dashboard/analises' },
  { id: 'forecast',    label: 'Forecast',     href: '/admin/contratos-dashboard/forecast' },
]
