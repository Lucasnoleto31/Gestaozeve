// Períodos do painel (fuso de Brasília). Sem dependência de React nem de servidor.

export type Periodo =
  | '30d'         // últimos 30 dias
  | '60d'         // últimos 60 dias
  | '90d'         // últimos 90 dias
  | 'ano'         // ano atual (1º jan → hoje)
  | 'tudo'
  | `custom:${string}:${string}`   // intervalo escolhido: 'custom:YYYY-MM-DD:YYYY-MM-DD'

export type DateRange = { inicio: string; fim: string } // 'YYYY-MM-DD'

export function hojeBrasil(): Date {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()) // 'YYYY-MM-DD'
  return new Date(iso + 'T12:00:00') // meio-dia evita drift de DST ao somar/subtrair dias
}

export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function resolvePeriodo(p: Periodo): DateRange {
  const today = hojeBrasil()

  if (p.startsWith('custom:')) {
    const [, inicio, fim] = p.split(':')
    const re = /^\d{4}-\d{2}-\d{2}$/
    if (re.test(inicio) && re.test(fim)) {
      return inicio <= fim ? { inicio, fim } : { inicio: fim, fim: inicio }
    }
    p = '30d'
  }

  const rolling = (dias: number) => {
    const i = new Date(today); i.setDate(i.getDate() - (dias - 1))
    return { inicio: fmtDate(i), fim: fmtDate(today) }
  }

  if (p === '30d') return rolling(30)
  if (p === '60d') return rolling(60)
  if (p === '90d') return rolling(90)
  if (p === 'ano') return { inicio: `${today.getFullYear()}-01-01`, fim: fmtDate(today) }
  return { inicio: '2000-01-01', fim: fmtDate(today) }
}

// Período imediatamente anterior, com a mesma duração (pra variações).
// 'tudo' não tem período anterior que faça sentido.
export function periodoAnterior(p: Periodo): DateRange | null {
  if (p === 'tudo') return null
  const { inicio, fim } = resolvePeriodo(p)
  const ini = new Date(inicio + 'T12:00:00')
  const f = new Date(fim + 'T12:00:00')
  const dur = Math.round((f.getTime() - ini.getTime()) / 86400000)
  const fimAnt = new Date(ini); fimAnt.setDate(fimAnt.getDate() - 1)
  const iniAnt = new Date(fimAnt); iniAnt.setDate(iniAnt.getDate() - dur)
  return { inicio: fmtDate(iniAnt), fim: fmtDate(fimAnt) }
}

// Intervalo de um mês 'YYYY-MM' (o mês corrente termina hoje)
export function rangeDoMes(mes: string): DateRange {
  const [a, m] = mes.split('-').map(Number)
  const inicio = new Date(a, m - 1, 1, 12)
  const ultimo = new Date(a, m, 0, 12)
  const hoje = hojeBrasil()
  const fim = ultimo > hoje ? hoje : ultimo
  return { inicio: fmtDate(inicio), fim: fmtDate(fim) }
}

// Mês anterior a 'YYYY-MM'
export function mesAnteriorDe(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 2, 1, 12)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Últimos N meses como 'YYYY-MM', do mais recente pro mais antigo
export function ultimosMeses(n: number): string[] {
  const hoje = hojeBrasil()
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1, 12)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}
