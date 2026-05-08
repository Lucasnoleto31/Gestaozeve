import type {
  Periodo, DashboardKpis, ProdutoRow, TopClienteRow,
  DiarioProdutoRow, HeatmapCell, EvolucaoMensalRow, DrilldownRow,
  ReceitaTotal, ReceitaPorAssessor, ReceitaProjecao, MetaAnual,
  AlertaRow, AcuracidadeResumo, AcuracidadePonto,
} from '../actions'

export type DashboardActions = {
  getKpis: (p: Periodo, barra?: string | null) => Promise<DashboardKpis>
  getPorProduto: (p: Periodo, barra?: string | null) => Promise<ProdutoRow[]>
  getTopClientes: (p: Periodo, limit?: number, barra?: string | null) => Promise<TopClienteRow[]>
  getDiarioProduto: (p: Periodo, barra?: string | null) => Promise<DiarioProdutoRow[]>
  getHeatmapDow: (p: Periodo, barra?: string | null) => Promise<HeatmapCell[]>
  getEvolucaoMensal: () => Promise<EvolucaoMensalRow[]>
  getDrilldownDia: (data: string) => Promise<DrilldownRow[]>
  getReceitaTotal: (p: Periodo) => Promise<ReceitaTotal>
  getReceitaPorAssessor: (p: Periodo) => Promise<ReceitaPorAssessor[]>
  getReceitaProjecao: () => Promise<ReceitaProjecao>
  getMetaAnual: () => Promise<MetaAnual>
  getAlertas: (inativoDias?: number, barra?: string | null) => Promise<AlertaRow[]>
  getAcuracidadeResumo: (lookbackDays?: number) => Promise<AcuracidadeResumo>
  getAcuracidadeSerie: (lookbackDays?: number) => Promise<AcuracidadePonto[]>
  getBarrasAtivas: () => Promise<{ barra_nome: string; numero: string | null }[]>
}

export type DashboardTab =
  | 'executivo'
  | 'operacional'
  | 'receita'
  | 'clientes'
  | 'assessores'
  | 'forecast'

export const TABS: { id: DashboardTab; label: string; href: string }[] = [
  { id: 'executivo',   label: 'Executivo',    href: '/admin/contratos-dashboard' },
  { id: 'operacional', label: 'Operacional',  href: '/admin/contratos-dashboard/operacional' },
  { id: 'receita',     label: 'Receita',      href: '/admin/contratos-dashboard/receita' },
  { id: 'clientes',    label: 'Clientes',     href: '/admin/contratos-dashboard/clientes' },
  { id: 'assessores',  label: 'Assessores',   href: '/admin/contratos-dashboard/assessores' },
  { id: 'forecast',    label: 'Forecast',     href: '/admin/contratos-dashboard/forecast' },
]
