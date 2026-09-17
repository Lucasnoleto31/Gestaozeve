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
