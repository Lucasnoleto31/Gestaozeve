// Fila do dia: o que cada atendente tem para fazer hoje, em ordem de prioridade, a partir dos leads e dos
// clientes: retorno combinado (para hoje ou atrasado), lead novo sem contato, cliente em risco sem contato
// recente (do que mais rendia para o que menos rendia), lead parado e conta da campanha de ativação ainda
// não chamada. Cada item traz o motivo em uma frase ("parou de girar há 19 dias, rendia R$ 1.200 por mês").
// Redesenho de nov/26 (Lucas: Fila e Oportunidades "parecem 2 páginas pra fazer a mesma coisa"): a ordem
// dos grupos mudou (clientes em risco antes dos leads parados), o risco ordena pelo que o cliente rendia e a
// tela conta o que já foi feito hoje. Só funções puras (testes em fila.test.ts); o banco é consultasFila.ts.
import { diasEntre } from './meses'
import { diaBrasil } from '@/lib/periodo'
import { mesmaPessoa } from '@/lib/texto'
import type { Nivel, Risco } from './tipos'

export type LeadFila = {
  id: string
  nome: string
  whatsapp: string | null
  responsavel: string | null
  status: string
  aberto: boolean                  // tipo do status (Aberto / Fechado)
  data_hora: string                // quando entrou (timestamptz)
  ultimo_contato: string | null
  proximo_contato: string | null   // S59
  corretora: string | null         // onde já opera (informativo)
  origem: string | null
}
export type ClienteFila = {
  cliente_id: string
  corretora: string
  nome: string
  telefone: string | null
  responsavel: string | null
  ativador: string | null          // atendente da campanha de ativação (S52)
  situacao: string
  risco: Risco | null
  nivel: Nivel | null
  dias_sem_giro: number | null
  lotes_media_3m: number
  rendia: number                   // receita média dos meses em que girou (receita de todo o histórico ÷ meses com lotes)
  contatos: number                 // contatos registrados na corretora
  ultimo_contato: string | null
  proximo_contato: string | null   // S59
}
export type MotivoFila = 'atrasado' | 'hoje' | 'novo' | 'parado' | 'risco' | 'campanha'
export type ItemFila = {
  chave: string                    // 'lead:<id>' · 'cliente:<corretora>:<id>'
  tipo: 'lead' | 'cliente'
  id: string
  corretora: string | null
  nome: string
  telefone: string | null
  quem: string | null              // de quem é a tarefa: responsável do lead · ativador ou responsável do cliente
  motivo: MotivoFila
  detalhe: string                  // por que está na fila, em uma frase ("parou de girar há 15 dias, rendia R$ 1.200 por mês; nenhum contato registrado")
  dias: number                     // atraso ou dias sem contato (ordenação)
  ultimo_contato: string | null
  proximo_contato: string | null
  status: string                   // lead: status · cliente: situação
}
export type ChaveSecao = 'agendados' | 'novos' | 'parados' | 'risco' | 'campanha'
export type SecaoFila = { chave: ChaveSecao; titulo: string; descricao: string; itens: ItemFila[] }
export type OpcoesFila = {
  hoje: string                     // 'YYYY-MM-DD'
  diasAlerta: number               // lead parado: sem contato há N dias (parâmetro dias_alerta_lead)
  diasRisco?: number               // cliente em risco: sem contato há N dias (padrão 14)
  quem?: string | null             // só as tarefas dessa pessoa (null = todas)
}

const reais = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
export const haDias = (n: number) => (n <= 0 ? 'hoje' : n === 1 ? 'ontem' : `há ${n} dias`)
const porNome = (a: ItemFila, b: ItemFila) => a.nome.localeCompare(b.nome, 'pt-BR')

// A clientes_lista do banco não traz os contatos com o cliente (vêm zerados): quem lê a lista junta aqui
// o resumo de cliente_contatos (quantos e o último), como a tela Clientes faz.
export function comContatos<T extends { cliente_id: string; contatos: number; ultimo_contato: string | null }>(
  clientes: T[], contatos: Map<string, { contatos: number; ultimo_contato: string }>,
): T[] {
  return clientes.map(c => { const x = contatos.get(c.cliente_id); return x ? { ...c, contatos: x.contatos, ultimo_contato: x.ultimo_contato } : c })
}

// Link de WhatsApp a partir do telefone (55 + DDD + número); null quando não dá para ligar
export function linkTelefone(telefone: string | null | undefined): string | null {
  if (!telefone) return null
  const d = telefone.replace(/\D/g, '')
  if (d.length < 10) return null
  return `https://wa.me/${d.startsWith('55') && d.length >= 12 ? d : `55${d}`}`
}

export function montarFila(leads: LeadFila[], clientes: ClienteFila[], o: OpcoesFila): SecaoFila[] {
  const diasRisco = o.diasRisco ?? 14
  const futuro = (p: string | null) => !!p && p > o.hoje
  const agendados: ItemFila[] = [], novos: ItemFila[] = [], parados: ItemFila[] = [], risco: ItemFila[] = [], campanha: ItemFila[] = []
  const agendado = (base: Omit<ItemFila, 'motivo' | 'detalhe' | 'dias'>, proximo: string) => {
    const atraso = diasEntre(proximo, o.hoje)
    agendados.push({ ...base, motivo: atraso > 0 ? 'atrasado' : 'hoje', dias: atraso, detalhe: atraso > 0 ? `retorno marcado para ${ddmm(proximo)}, ${haDias(atraso)}` : 'retorno marcado para hoje' })
  }

  for (const l of leads) {
    const base = {
      chave: `lead:${l.id}`, tipo: 'lead' as const, id: l.id, corretora: l.corretora, nome: l.nome, telefone: l.whatsapp, quem: l.responsavel,
      ultimo_contato: l.ultimo_contato, proximo_contato: l.proximo_contato, status: l.status,
    }
    if (l.proximo_contato && l.proximo_contato <= o.hoje) { agendado(base, l.proximo_contato); continue }
    if (!l.aberto || futuro(l.proximo_contato)) continue
    if (!l.ultimo_contato) {
      const dias = diasEntre(diaBrasil(l.data_hora), o.hoje)
      novos.push({ ...base, motivo: 'novo', dias, detalhe: `entrou ${haDias(dias)} e ninguém fez contato` })
      continue
    }
    const dias = diasEntre(l.ultimo_contato, o.hoje)
    if (dias >= o.diasAlerta) parados.push({ ...base, motivo: 'parado', dias, detalhe: `em aberto, último contato ${haDias(dias)}` })
  }

  for (const c of clientes) {
    const base = {
      chave: `cliente:${c.corretora}:${c.cliente_id}`, tipo: 'cliente' as const, id: c.cliente_id, corretora: c.corretora, nome: c.nome, telefone: c.telefone,
      quem: c.ativador ?? c.responsavel, ultimo_contato: c.ultimo_contato, proximo_contato: c.proximo_contato, status: c.situacao,
    }
    if (c.proximo_contato && c.proximo_contato <= o.hoje) { agendado(base, c.proximo_contato); continue }
    if (futuro(c.proximo_contato)) continue
    const semContato = c.ultimo_contato ? diasEntre(c.ultimo_contato, o.hoje) : null
    if (c.ativador && c.contatos === 0) {
      campanha.push({ ...base, quem: c.ativador, motivo: 'campanha', dias: 0, detalhe: 'conta da campanha de ativação, ainda sem contato' })
      continue
    }
    if (c.risco && (semContato == null || semContato >= diasRisco)) {
      const giro = c.risco === 'parou' ? `parou de girar${c.dias_sem_giro != null ? ` ${haDias(c.dias_sem_giro)}` : ''}` : 'está girando bem menos'
      const contato = semContato == null ? 'nenhum contato registrado' : `último contato ${haDias(semContato)}`
      risco.push({ ...base, quem: c.responsavel, motivo: 'risco', dias: semContato ?? 9999, detalhe: `${giro}${c.rendia >= 1 ? `, rendia ${reais(c.rendia)} por mês` : ''}; ${contato}` })
    }
  }

  const minhas = (itens: ItemFila[]) => (o.quem ? itens.filter(i => mesmaPessoa(i.quem, o.quem)) : itens)
  const porDias = (a: ItemFila, b: ItemFila) => b.dias - a.dias || porNome(a, b)
  // em risco: do que mais rendia para o que menos rendia; sem histórico de receita, pelos lotes que girava
  const valorDe = new Map(clientes.map(c => [`cliente:${c.corretora}:${c.cliente_id}`, { rendia: c.rendia, media: c.lotes_media_3m }]))
  const peloQueRendia = (a: ItemFila, b: ItemFila) => {
    const x = valorDe.get(a.chave), y = valorDe.get(b.chave)
    return (y?.rendia ?? 0) - (x?.rendia ?? 0) || (y?.media ?? 0) - (x?.media ?? 0) || porNome(a, b)
  }
  // a ordem dos grupos é a ordem de prioridade do dia
  return [
    { chave: 'agendados', titulo: 'Retornos combinados', descricao: 'Retorno marcado para hoje ou já atrasado; os mais atrasados primeiro.', itens: minhas(agendados).sort(porDias) },
    { chave: 'novos', titulo: 'Leads novos sem contato', descricao: 'Entraram e ninguém registrou contato ainda; os mais antigos primeiro.', itens: minhas(novos).sort(porDias) },
    { chave: 'risco', titulo: 'Clientes em risco', descricao: `Pararam de girar ou caíram de ritmo e estão sem contato há ${diasRisco} dias ou mais; do que mais rendia para o que menos rendia.`, itens: minhas(risco).sort(peloQueRendia) },
    { chave: 'parados', titulo: 'Leads parados', descricao: `Em aberto e sem contato há ${o.diasAlerta} dias ou mais; os mais antigos primeiro.`, itens: minhas(parados).sort(porDias) },
    { chave: 'campanha', titulo: 'Contas da campanha', descricao: 'Atribuídas na campanha de ativação e ainda sem nenhum contato registrado.', itens: minhas(campanha).sort(porNome) },
  ]
}

// O que já foi feito hoje: quantos leads e clientes tiveram contato registrado com a data de hoje.
// `quem` = a pessoa escolhida no seletor (null = a equipe inteira). `autor` = a quem o contato é creditado,
// pela regra do Funil › Equipe: o responsável do lead; no cliente, quem atendeu (consultasFila.ts).
export type ContatoDeHoje = { autor: string | null; alvo: string }   // alvo = 'lead:<id>' ou 'cliente:<corretora>:<id>'
export function feitasHoje(contatos: ContatoDeHoje[], quem: string | null): number {
  const alvos = new Set<string>()
  for (const c of contatos) if (!quem || mesmaPessoa(c.autor, quem)) alvos.add(c.alvo)
  return alvos.size
}

// A frase do topo da fila: quantas tarefas há para hoje e quantas já foram feitas
export function fraseDaFila(d: { total: number; feitas: number; quem: string | null; souEu: boolean }): string {
  const n = (v: number) => v.toLocaleString('pt-BR')
  const sujeito = d.souEu ? 'Você tem' : d.quem ? `${d.quem} tem` : 'A equipe tem'
  const fez = d.souEu ? 'você já fez' : d.quem ? `${d.quem} já fez` : 'a equipe já fez'
  if (d.total === 0) return d.feitas === 0 ? 'Nada pendente para hoje.' : `Tudo em dia: nenhuma tarefa pendente, e ${fez} ${n(d.feitas)} hoje.`
  const feitas = d.feitas === 0 ? 'nenhuma feita ainda' : d.feitas === 1 ? '1 já feita' : `${n(d.feitas)} já feitas`
  return `${sujeito} ${d.total === 1 ? '1 tarefa' : `${n(d.total)} tarefas`} para hoje, ${feitas}.`
}

export const totalDaFila = (secoes: SecaoFila[]) => secoes.reduce((s, x) => s + x.itens.length, 0)
