// Tela Leads (redesenho de nov/26): quem eu preciso chamar agora e em que pé está cada lead.
// Lucas: "muito confusa, melhore ela". A tela é usada por automações diárias: os filtros do endereço
// (?responsavel=…&status=…), o clique na linha, as ações da linha e os botões "Registrar contato" e "Salvar"
// não mudam. Aqui ficam só as contas novas da apresentação: as abas por etapa com contagem, os 4 cartões,
// a frase do topo, o "último contato há N dias" e as visões de colunas (como na tela Clientes).
// Funções puras, testes em leadsTela.test.ts.
import { MESES_LONGOS } from '@/lib/format'
import { diasEntre, somarMeses } from './meses'
import type { LeadRow, StatusLead } from './tipos'

// ── Visões de colunas (a escolha fica num cookie, não no endereço) ──────────
export const VISOES_LEADS = ['atendimento', 'cadastro', 'fechamento'] as const
export type VisaoLeads = (typeof VISOES_LEADS)[number]
export const VISAO_LEADS_ROTULO: Record<VisaoLeads, string> = { atendimento: 'Atendimento', cadastro: 'Cadastro', fechamento: 'Fechamento' }
export const COOKIE_VISAO_LEADS = 'zv_leads_visao'
export const visaoLeads = (v: string | null | undefined): VisaoLeads => VISOES_LEADS.find(x => x === v) ?? 'atendimento'

// ── Abas por etapa ──────────────────────────────────────────────────────────
// As etapas em aberto vêm primeiro (são as que pedem contato), na ordem de Parâmetros; depois as fechadas.
// A contagem de cada aba respeita os outros filtros (busca, responsável, origem…), não o da própria etapa.
export type AbaDeStatus = { status: string; aberto: boolean; leads: number; comAlerta: number }
export function abasDeStatus(status: StatusLead[], leads: Pick<LeadRow, 'status' | 'alerta'>[]): AbaDeStatus[] {
  const conta = new Map<string, { leads: number; comAlerta: number }>()
  for (const l of leads) {
    const c = conta.get(l.status) ?? { leads: 0, comAlerta: 0 }
    c.leads++
    if (l.alerta) c.comAlerta++
    conta.set(l.status, c)
  }
  const conhecidos = [...status].sort((a, b) => (a.tipo === b.tipo ? a.ordem - b.ordem : a.tipo === 'Aberto' ? -1 : 1))
  const abas: AbaDeStatus[] = conhecidos.map(s => ({ status: s.status, aberto: s.tipo === 'Aberto', ...(conta.get(s.status) ?? { leads: 0, comAlerta: 0 }) }))
  // etapa que está nos leads e saiu de Parâmetros continua com aba (senão os leads dela somem da tela)
  for (const [s, c] of conta) if (!abas.some(a => a.status === s)) abas.push({ status: s, aberto: false, ...c })
  return abas
}

// ── Último contato ──────────────────────────────────────────────────────────
// "hoje", "ontem", "há 9 dias"; sem contato registrado, "sem contato"
export function ultimoContatoTexto(ultimo: string | null, hoje: string): string {
  if (!ultimo) return 'sem contato'
  const d = diasEntre(ultimo, hoje)
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d.toLocaleString('pt-BR')} dias`
}

// ── Os números do topo ──────────────────────────────────────────────────────
type LeadDoResumo = Pick<LeadRow, 'status' | 'tipo_status' | 'alerta' | 'contatos' | 'ultimo_contato' | 'data_hora' | 'data_fechamento' | 'dias'>
export type ResumoLeads = {
  abertos: number
  comAlerta: number             // em aberto, sem contato há mais tempo que o limite
  novosSemContato: number       // em aberto e sem nenhum contato registrado
  ganhosMes: number             // fechados como Ganho no mês
  ganhosMesAnterior: number
  mediaFechar: number | null    // dias, em média, entre entrar e fechar (ganhos e perdidos)
  mediaAberto: number | null    // dias, em média, que os leads em aberto estão abertos
}
export function resumoDosLeads(leads: LeadDoResumo[], mes: string): ResumoLeads {
  const abertos = leads.filter(l => l.tipo_status === 'Aberto')
  const fechados = leads.filter(l => (l.status === 'Ganho' || l.status === 'Perdido') && l.data_fechamento && l.dias != null)
  const media = (xs: number[]) => (xs.length ? xs.reduce((s, d) => s + d, 0) / xs.length : null)
  const ganhosEm = (m: string) => leads.filter(l => l.status === 'Ganho' && (l.data_fechamento ?? '').slice(0, 7) === m.slice(0, 7)).length
  return {
    abertos: abertos.length,
    comAlerta: abertos.filter(l => l.alerta).length,
    novosSemContato: abertos.filter(l => !l.ultimo_contato && !l.contatos).length,
    ganhosMes: ganhosEm(mes),
    ganhosMesAnterior: ganhosEm(somarMeses(mes, -1)),
    mediaFechar: media(fechados.map(l => l.dias as number)),
    mediaAberto: media(abertos.filter(l => l.dias != null).map(l => l.dias as number)),
  }
}

const n = (v: number) => v.toLocaleString('pt-BR')
const nomeDoMes = (mes: string) => MESES_LONGOS[parseInt(mes.slice(5, 7), 10) - 1] ?? mes.slice(0, 7)

// A frase do topo: quem pede contato agora e quantos viraram cliente no mês
export function fraseDosLeads(r: ResumoLeads, mes: string, d: { diasAlerta: number; meus: boolean }): string {
  const dono = d.meus ? 'dos seus leads' : 'leads'
  const pedem = r.comAlerta === 0
    ? (d.meus ? 'Nenhum dos seus leads em aberto está' : 'Nenhum lead em aberto está') + ` sem contato há mais de ${d.diasAlerta} dias`
    : r.comAlerta === 1 ? `1 ${d.meus ? 'dos seus leads' : 'lead'} em aberto está sem contato há mais de ${d.diasAlerta} dias`
    : `${n(r.comAlerta)} ${dono} em aberto estão sem contato há mais de ${d.diasAlerta} dias`
  const novos = r.novosSemContato === 0 ? '' : r.novosSemContato === 1 ? ' e 1 ainda não foi chamado nenhuma vez' : ` e ${n(r.novosSemContato)} ainda não foram chamados nenhuma vez`
  const ganhos = r.ganhosMes === 0 ? `Em ${nomeDoMes(mes)} ainda não houve ganho.` : r.ganhosMes === 1 ? `Em ${nomeDoMes(mes)}, 1 virou cliente.` : `Em ${nomeDoMes(mes)}, ${n(r.ganhosMes)} viraram cliente.`
  return `${pedem}${novos}. ${ganhos}`
}
