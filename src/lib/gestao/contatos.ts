// Contatos por lead (S47) e série diária de leads: média de contatos até converter, rótulos dos dias
// e o cálculo de reserva antes da S47. Sem dependência de React nem de servidor.
import type { LeadDiaRow, LeadRow } from './tipos'
import { diaBrasil } from '@/lib/periodo'
import { somarDias } from './meses'

export type MediaContatos = { media: number | null; n: number }

// Média de contatos entre os leads que têm pelo menos um contato registrado. Quem não tem
// histórico fica de fora: antes da S47 o contato não era contado, e zero puxaria a média para baixo.
export function mediaContatos(leads: Pick<LeadRow, 'contatos'>[]): MediaContatos {
  const com = leads.filter(l => l.contatos > 0)
  if (com.length === 0) return { media: null, n: 0 }
  return { media: com.reduce((s, l) => s + l.contatos, 0) / com.length, n: com.length }
}

// '3,2' (uma casa) ou null
export const fmtMedia = (v: number | null | undefined) => (v == null ? null : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))

// Os últimos N dias até `hoje` ('YYYY-MM-DD'), do mais antigo ao mais recente
export function ultimosDias(hoje: string, n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(somarDias(hoje, -i))
  return out
}

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
// 'hoje', 'ontem' ou 'qua 14/10'
export function rotuloDia(iso: string, hoje: string): string {
  if (iso === hoje) return 'hoje'
  if (iso === somarDias(hoje, -1)) return 'ontem'
  const d = new Date(iso + 'T12:00:00')
  return `${DIAS_SEMANA[d.getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

// Soma de uma coluna nos últimos N dias da série (a série vem do mais antigo ao mais recente)
export const somaUltimos = (serie: LeadDiaRow[], n: number, chave: keyof Omit<LeadDiaRow, 'dia'>) =>
  serie.slice(-n).reduce((s, d) => s + d[chave], 0)

// Antes da S47 (leads_diario ausente): a série vem da lista de leads. Entradas pelo dia de Brasília,
// ganhos e perdidos pela data de fechamento; contatos e contas abertas ficam em zero.
export function diarioPelaLista(leads: Pick<LeadRow, 'data_hora' | 'status' | 'data_fechamento'>[], hoje: string, dias: number): LeadDiaRow[] {
  const porDia = new Map<string, LeadDiaRow>(ultimosDias(hoje, dias).map(d => [d, { dia: d, entraram: 0, contatos: 0, ganhos: 0, perdidos: 0, contas_abertas: 0 }]))
  for (const l of leads) {
    const e = porDia.get(diaBrasil(l.data_hora))
    if (e) e.entraram++
    const f = l.data_fechamento ? porDia.get(l.data_fechamento) : undefined
    if (f && l.status === 'Ganho') f.ganhos++
    if (f && l.status === 'Perdido') f.perdidos++
  }
  return [...porDia.values()]
}
