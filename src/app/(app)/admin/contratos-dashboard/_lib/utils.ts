// Helpers compartilhados entre sub-rotas do dashboard.
// Mantidos isolados aqui pra evitar duplicação entre os Views.

export const fmtNum = (n: number) =>
  n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

export const fmtNum2 = (n: number) =>
  n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

export const fmtBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export const fmtBRL2 = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function fmtDataPt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
