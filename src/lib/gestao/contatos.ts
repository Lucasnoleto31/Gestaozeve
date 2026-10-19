// Contatos por lead (S47) e série diária de leads: média de contatos até converter, rótulos dos dias
// e o cálculo de reserva antes da S47. Sem dependência de React nem de servidor.
import type { AtivacaoAtendenteRow, GanhoDia, LeadDiaRow, LeadRow } from './tipos'
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

// ── Contatos realizados por atendente (Funil) ───────────────────────────────
export type ContatoLeve = { lead_id: string; data: string }
export type LeadLeve = { id: string; responsavel: string | null; status: string }
export type ResumoAtendente = {
  grupo: string            // responsável do lead ('Sem responsável' quando vazio)
  contatos: number         // contatos registrados no período
  leads: number            // leads distintos contatados no período
  dias: number             // dias distintos com contato
  ganhos: number           // desses leads, quantos estão como Ganho
  contatos_ganhos: number  // contatos de todo o atendimento desses ganhos (média até ganhar = contatos_ganhos / ganhos)
}

// Contatos feitos em [inicio, fimExclusivo) ('YYYY-MM-DD'), agrupados pelo responsável do lead, mais a
// linha de total (leads e dias distintos no conjunto todo, não a soma das linhas).
export function resumoContatosPorAtendente(contatos: ContatoLeve[], leads: LeadLeve[], inicio: string, fimExclusivo: string): { linhas: ResumoAtendente[]; total: ResumoAtendente } {
  const porLead = new Map(leads.map(l => [l.id, l]))
  const totalPorLead = new Map<string, number>()
  for (const c of contatos) totalPorLead.set(c.lead_id, (totalPorLead.get(c.lead_id) ?? 0) + 1)
  type Acc = { grupo: string; contatos: number; leads: Set<string>; dias: Set<string>; ganhos: Set<string>; contatos_ganhos: number }
  const novo = (grupo: string): Acc => ({ grupo, contatos: 0, leads: new Set(), dias: new Set(), ganhos: new Set(), contatos_ganhos: 0 })
  const grupos = new Map<string, Acc>()
  const total = novo('Total')
  const soma = (a: Acc, c: ContatoLeve, l: LeadLeve) => {
    a.contatos++; a.leads.add(c.lead_id); a.dias.add(c.data)
    if (l.status === 'Ganho' && !a.ganhos.has(c.lead_id)) { a.ganhos.add(c.lead_id); a.contatos_ganhos += totalPorLead.get(c.lead_id) ?? 0 }
  }
  for (const c of contatos) {
    if (c.data < inicio || c.data >= fimExclusivo) continue
    const l = porLead.get(c.lead_id)
    if (!l) continue
    const g = l.responsavel?.trim() || 'Sem responsável'
    let a = grupos.get(g)
    if (!a) { a = novo(g); grupos.set(g, a) }
    soma(a, c, l); soma(total, c, l)
  }
  const fechar = (a: Acc): ResumoAtendente => ({ grupo: a.grupo, contatos: a.contatos, leads: a.leads.size, dias: a.dias.size, ganhos: a.ganhos.size, contatos_ganhos: a.contatos_ganhos })
  return { linhas: [...grupos.values()].map(fechar).sort((a, b) => b.contatos - a.contatos || a.grupo.localeCompare(b.grupo)), total: fechar(total) }
}

// ── Campanha de ativação por atendente (Funil, S52) ─────────────────────────
// Linha de total do painel: a soma de cada coluna (cada conta tem um atendente só, então somar não repete conta)
export function somaAtivacoes(linhas: AtivacaoAtendenteRow[]): AtivacaoAtendenteRow {
  const t: AtivacaoAtendenteRow = { ativador: 'Total', contas: 0, contatos: 0, contas_contatadas: 0, operaram: 0, ativados: 0, reativados: 0, lotes: 0, receita: 0 }
  for (const l of linhas) {
    t.contas += l.contas; t.contatos += l.contatos; t.contas_contatadas += l.contas_contatadas; t.operaram += l.operaram
    t.ativados += l.ativados; t.reativados += l.reativados; t.lotes += l.lotes; t.receita += l.receita
  }
  return t
}

// ── Clientes ganhos por dia e por mês (Funil) ───────────────────────────────
export type GanhosMes = {
  mes: string              // 'YYYY-MM-01'
  ganhos: number           // leads fechados como Ganho no mês (pela data de fechamento)
  contas_abertas: number   // contas migradas no mês (pela data de migração)
  dias_uteis: number       // dias úteis decorridos (seg–sex; feriados não entram)
  dias_com_ganho: number
  melhor_dia: string | null
  melhor_ganhos: number
}

export const ehDiaUtil = (iso: string) => { const d = new Date(iso + 'T12:00:00').getDay(); return d >= 1 && d <= 5 }

// Soma a série diária por mês, só dos meses a partir de `desde` ('YYYY-MM-01') e até hoje; do mais recente ao mais antigo
export function ganhosPorMes(serie: LeadDiaRow[], hoje: string, desde: string): GanhosMes[] {
  const porMes = new Map<string, GanhosMes>()
  for (const d of serie) {
    if (d.dia > hoje || d.dia < desde) continue
    const mes = `${d.dia.slice(0, 7)}-01`
    let m = porMes.get(mes)
    if (!m) { m = { mes, ganhos: 0, contas_abertas: 0, dias_uteis: 0, dias_com_ganho: 0, melhor_dia: null, melhor_ganhos: 0 }; porMes.set(mes, m) }
    m.ganhos += d.ganhos
    m.contas_abertas += d.contas_abertas
    if (ehDiaUtil(d.dia)) m.dias_uteis++
    if (d.ganhos > 0) m.dias_com_ganho++
    if (d.ganhos > m.melhor_ganhos) { m.melhor_ganhos = d.ganhos; m.melhor_dia = d.dia }
  }
  return [...porMes.values()].sort((a, b) => b.mes.localeCompare(a.mes))
}

// Os dias de um mês ('YYYY-MM-01') do dia 1 até o fim do mês ou hoje, com zero onde a série não tem o dia
export function diasDoMes(serie: LeadDiaRow[], mes: string, hoje: string): LeadDiaRow[] {
  const porDia = new Map(serie.map(d => [d.dia, d]))
  const ultimo = (() => { const a = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7)); const d = new Date(a, m, 0, 12); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  const fim = ultimo < hoje ? ultimo : hoje
  const out: LeadDiaRow[] = []
  for (let dia = mes; dia <= fim; dia = somarDias(dia, 1)) out.push(porDia.get(dia) ?? { dia, entraram: 0, contatos: 0, ganhos: 0, perdidos: 0, contas_abertas: 0 })
  return out
}

// Quem fechou em cada dia, por trás do "+N" da faixa e das barras de ganhos por dia: só os leads Ganho com
// fechamento a partir de `desde` (AAAA-MM-DD), no formato leve que a tabela do dia mostra
export function ganhosLeves(leads: Pick<LeadRow, 'id' | 'nome' | 'whatsapp' | 'responsavel' | 'status' | 'data_fechamento'>[], desde: string): GanhoDia[] {
  const out: GanhoDia[] = []
  for (const l of leads) {
    if (l.status !== 'Ganho' || !l.data_fechamento) continue
    const dia = l.data_fechamento.slice(0, 10)
    if (dia >= desde) out.push({ id: l.id, dia, nome: l.nome, whatsapp: l.whatsapp, responsavel: l.responsavel })
  }
  return out
}

// Os ganhos de um dia, em ordem alfabética
export const ganhosDoDia = (ganhos: GanhoDia[], dia: string): GanhoDia[] =>
  ganhos.filter(g => g.dia === dia).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
