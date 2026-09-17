export type DashboardTab = 'executivo' | 'barras' | 'clientes' | 'operacional' | 'receita' | 'fechamento' | 'incentivo'

export const TABS: { id: DashboardTab; label: string; href: string; hint: string }[] = [
  { id: 'executivo',   label: 'Executivo',   href: '/admin/contratos-dashboard',             hint: 'Visão geral: corretoras, barras, clientes e metas' },
  { id: 'barras',      label: 'Barras',      href: '/admin/contratos-dashboard/barras',      hint: 'Quem está girando: ranking por lotes ou receita' },
  { id: 'clientes',    label: 'Clientes',    href: '/admin/contratos-dashboard/clientes',    hint: 'Quem parou de operar, quem chegou e quem voltou' },
  { id: 'operacional', label: 'Operacional', href: '/admin/contratos-dashboard/operacional', hint: 'Pregão a pregão e produto a produto' },
  { id: 'receita',     label: 'Receita',     href: '/admin/contratos-dashboard/receita',     hint: 'Receita estimada, curva ABC e projeção' },
  { id: 'fechamento',  label: 'Fechamento',  href: '/admin/contratos-dashboard/fechamento',  hint: 'Fechamento mensal por barra: lotes, receita e repasse' },
  { id: 'incentivo',   label: 'Incentivo',   href: '/admin/contratos-dashboard/incentivo',   hint: 'Programa de pontos da Genial' },
]
