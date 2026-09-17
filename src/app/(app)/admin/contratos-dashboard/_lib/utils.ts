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

// '12,3%' — sem sinal; use fmtDelta pra variações
export const fmtPct = (n: number, casas = 1) =>
  `${n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`

// Variação percentual entre dois valores. null quando não dá pra comparar.
export function deltaPct(atual: number, anterior: number | null | undefined): number | null {
  if (anterior == null) return null
  if (anterior === 0) return atual > 0 ? null : 0
  return ((atual - anterior) / anterior) * 100
}

// '+12,3%' / '−4,0%'
export const fmtDelta = (pct: number, casas = 1) =>
  `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`

export function fmtDataPt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Nome curto pra rótulos apertados (gráficos): 'ZEVE INVESTIMENTOS 12' → 'ZEVE 12'
export const nomeCurto = (barra: string, max = 18) => {
  const s = barra.replace(/^ZEVE INVESTIMENTOS\s+/i, 'ZEVE ')
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}
