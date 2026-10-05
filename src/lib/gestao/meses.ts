// Meses de referência ('YYYY-MM-01') sem passar por Date com fuso.
import { hojeBrasil } from '@/lib/periodo'
import { MESES_ABREV } from '@/lib/format'

export type MesRef = string // 'YYYY-MM-01'

export function mesDe(ano: number, mes1a12: number): MesRef {
  return `${ano}-${String(mes1a12).padStart(2, '0')}-01`
}

// Aceita 'YYYY-MM', 'YYYY-MM-DD'; devolve null quando inválido
export function parseMes(v: string | null | undefined): MesRef | null {
  if (!v) return null
  const m = v.match(/^(\d{4})-(\d{2})/)
  if (!m) return null
  const mes = parseInt(m[2], 10)
  if (mes < 1 || mes > 12) return null
  return `${m[1]}-${m[2]}-01`
}

export function mesAtual(): MesRef {
  const h = hojeBrasil()
  return mesDe(h.getFullYear(), h.getMonth() + 1)
}

export function somarMeses(mes: MesRef, n: number): MesRef {
  const ano = parseInt(mes.slice(0, 4), 10)
  const m = parseInt(mes.slice(5, 7), 10) - 1 + n
  const a = ano + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  return mesDe(a, mm + 1)
}

// Os N meses até `fim` (inclusive), do mais antigo pro mais recente
export function janelaMeses(fim: MesRef, n: number): MesRef[] {
  const out: MesRef[] = []
  for (let i = n - 1; i >= 0; i--) out.push(somarMeses(fim, -i))
  return out
}

// 'YYYY-MM-01' → 'set/26'
export function mesCurto(mes: MesRef): string {
  const m = parseInt(mes.slice(5, 7), 10)
  return `${(MESES_ABREV[m - 1] ?? '?').toLowerCase()}/${mes.slice(2, 4)}`
}

// 'YYYY-MM-01' → 'Set/2026'
export function mesLongo(mes: MesRef): string {
  const m = parseInt(mes.slice(5, 7), 10)
  return `${MESES_ABREV[m - 1] ?? '?'}/${mes.slice(0, 4)}`
}

// Para <input type="month">
export function mesInput(mes: MesRef): string {
  return mes.slice(0, 7)
}

// Primeiro e último dia do mês ('YYYY-MM-DD'); o mês corrente termina hoje
export function limitesDoMes(mes: MesRef): { inicio: string; fim: string } {
  const ano = parseInt(mes.slice(0, 4), 10)
  const m = parseInt(mes.slice(5, 7), 10)
  const ultimo = new Date(ano, m, 0, 12)
  const hoje = hojeBrasil()
  const fim = ultimo > hoje ? hoje : ultimo
  const f = `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, '0')}-${String(fim.getDate()).padStart(2, '0')}`
  return { inicio: mes, fim: f }
}

// 'YYYY-MM-DD' ± dias
export function somarDias(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function diasEntre(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
}

// Segunda-feira da semana de uma data
export function inicioSemana(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const dow = (d.getDay() + 6) % 7 // seg = 0
  return somarDias(iso, -dow)
}

export function ehIso(v: string | null | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)
}
