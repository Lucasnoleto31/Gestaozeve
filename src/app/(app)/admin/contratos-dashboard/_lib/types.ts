export type DashboardTab = 'executivo' | 'barras' | 'operacional' | 'receita' | 'incentivo'

export const TABS: { id: DashboardTab; label: string; href: string; hint: string }[] = [
  { id: 'executivo',   label: 'Executivo',   href: '/admin/contratos-dashboard',             hint: 'Visão geral: corretoras, barras, clientes e metas' },
  { id: 'barras',      label: 'Barras',      href: '/admin/contratos-dashboard/barras',      hint: 'Quem está girando: ranking por lotes ou receita' },
  { id: 'operacional', label: 'Operacional', href: '/admin/contratos-dashboard/operacional', hint: 'Pregão a pregão e produto a produto' },
  { id: 'receita',     label: 'Receita',     href: '/admin/contratos-dashboard/receita',     hint: 'Receita estimada, curva ABC e projeção' },
  { id: 'incentivo',   label: 'Incentivo',   href: '/admin/contratos-dashboard/incentivo',   hint: 'Programa de pontos da Genial' },
]
