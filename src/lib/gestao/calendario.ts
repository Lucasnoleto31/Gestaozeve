// Calendário do mês (Funil › Calendário). Lucas, 17/11/2026: "adiciona o calendário de ganhos por dia e
// perdidos por dia e clientes que pararam de girar, ex. 1 dia". Cada dia mostra quatro números (os ativados
// entraram no mesmo dia, a pedido dele; ver mais abaixo):
//  - ganhos: leads fechados como Ganho, pela data de fechamento (os mesmos do cartão "Ganhos" da aba Mês);
//  - perdidos: leads fechados como Perdido, pela data de fechamento (os mesmos do cartão "Perdidos");
//  - pararam de girar: clientes cujo último dia com lote foi aquele e que não voltaram a operar. Só conta
//    quem já está há pelo menos N pregões sem operar (N = 1, 3 ou 5; pregão = dia com lote lançado na
//    corretora), para não chamar de parado quem só pulou o dia de hoje.
// Aqui ficam as contas, sem banco. As leituras estão em consultasCalendario.ts.
import type { Corretora } from '@/lib/corretoras'
import { somarDias, somarMeses, type MesRef } from './meses'

// Um lead fechado num dia (Ganho ou Perdido): o que a lista do dia mostra
export type FechadoDia = { id: string; dia: string; nome: string; whatsapp: string | null; responsavel: string | null; motivo: string | null }
// Um cliente que parou de girar: o dia é o último em que ele operou
export type ParouDia = { cliente_id: string; corretora: Corretora; dia: string; nome: string; responsavel: string | null; telefone: string | null; pregoes: number; lotes_12m: number }
export type DiaDoCalendario = { dia: string; ganhos: number; perdidos: number; ativados: number; pararam: number }

export const PREGOES_PARADO = [1, 3, 5] as const
export const pregoesParado = (v: string | null | undefined): number => (PREGOES_PARADO as readonly number[]).find(n => String(n) === v) ?? 1

// As semanas do mês, de domingo a sábado; null = dia de outro mês
export function semanasDoMes(mes: MesRef): (string | null)[][] {
  const fim = somarMeses(mes, 1)
  const semanas: (string | null)[][] = []
  let semana: (string | null)[] = Array(new Date(mes + 'T12:00:00').getDay()).fill(null)
  for (let dia = mes; dia < fim; dia = somarDias(dia, 1)) {
    semana.push(dia)
    if (semana.length === 7) { semanas.push(semana); semana = [] }
  }
  if (semana.length) semanas.push([...semana, ...Array(7 - semana.length).fill(null)])
  return semanas
}

// Quantos pregões vieram depois do último giro do cliente (pregoes = dias com lote na corretora)
export const pregoesDepois = (ultimoGiro: string, pregoes: string[]): number => pregoes.reduce((n, d) => (d > ultimoGiro ? n + 1 : n), 0)

// Quem parou de girar numa corretora: o último giro de cada cliente a partir de `desde`, para quem já está
// há pelo menos `minimo` pregões sem operar
export function quemParou(
  clientes: { cliente_id: string; nome: string; ultimo_giro: string | null; responsavel: string | null; telefone?: string | null; lotes_12m: number }[],
  corretora: Corretora, pregoes: string[], desde: string, minimo: number,
): ParouDia[] {
  const out: ParouDia[] = []
  for (const c of clientes) {
    if (!c.ultimo_giro || c.ultimo_giro < desde) continue
    const n = pregoesDepois(c.ultimo_giro, pregoes)
    if (n >= minimo) out.push({ cliente_id: c.cliente_id, corretora, dia: c.ultimo_giro, nome: c.nome, responsavel: c.responsavel, telefone: c.telefone ?? null, pregoes: n, lotes_12m: c.lotes_12m })
  }
  return out
}

// Um item por dia do mês, com quantos ganhos, perdidos, clientes ativados e clientes que pararam
export function diasDoCalendario(mes: MesRef, ganhos: { dia: string }[], perdidos: { dia: string }[], pararam: { dia: string }[], ativados: { dia: string }[] = []): DiaDoCalendario[] {
  const conta = (itens: { dia: string }[]) => { const m = new Map<string, number>(); for (const i of itens) m.set(i.dia, (m.get(i.dia) ?? 0) + 1); return m }
  const g = conta(ganhos), p = conta(perdidos), s = conta(pararam), a = conta(ativados)
  const fim = somarMeses(mes, 1)
  const out: DiaDoCalendario[] = []
  for (let dia = mes; dia < fim; dia = somarDias(dia, 1)) out.push({ dia, ganhos: g.get(dia) ?? 0, perdidos: p.get(dia) ?? 0, ativados: a.get(dia) ?? 0, pararam: s.get(dia) ?? 0 })
  return out
}

// Só os itens de um mês ('AAAA-MM-01')
export const doMes = <T extends { dia: string }>(itens: T[], mes: MesRef): T[] => itens.filter(i => i.dia.slice(0, 7) === mes.slice(0, 7))

// ── Ativados no dia ────────────────────────────────────────────────────────────
// Lucas, 17/11/2026: "faltou ativados no dia, por exemplo o cliente XYZ estava inativo e voltou a operar, ou
// trouxemos ele ontem e começou a operar hoje". É a mesma classificação do resultado do mês no banco
// (funil_resultado, abas Mês e Histórico), cliente a cliente, no dia da primeira operação dele no mês:
//  - novo: a conta migrou neste mês e ele nunca tinha operado;
//  - ativado: nunca tinha operado (1ª operação) e a conta migrou antes deste mês;
//  - reativado: voltou a operar depois de N meses sem girar (ou a conta já tinha N meses e nunca tinha operado).
// Quem operou no mês e não cai em nenhum dos três é carteira (já vinha girando) e não entra.
export const MESES_SEM_GIRO_REATIVA = 4
export type TipoAtivado = 'novo' | 'ativado' | 'reativado'
export type AtivadoDia = {
  cliente_id: string; corretora: Corretora; dia: string; nome: string; tipo: TipoAtivado
  ultimo_giro: string | null       // último giro antes deste mês; null = nunca tinha operado
  data_migracao: string | null
  responsavel: string | null; telefone: string | null; lotes_mes: number
}

const mesDoDia = (dia: string | null | undefined): MesRef | null => (dia ? `${dia.slice(0, 7)}-01` : null)

// O tipo de quem operou no mês, com as mesmas condições e na mesma ordem do banco
export function tipoDeQuemOperou(mes: MesRef, ultimoGiroAntes: string | null, dataMigracao: string | null, mesesInativo = MESES_SEM_GIRO_REATIVA): TipoAtivado | 'carteira' {
  const giro = mesDoDia(ultimoGiroAntes), migrou = mesDoDia(dataMigracao)
  if (!giro && migrou === mes) return 'novo'
  if (giro && mes >= somarMeses(giro, mesesInativo)) return 'reativado'
  if (!giro && migrou && mes >= somarMeses(migrou, mesesInativo)) return 'reativado'
  if (!giro) return 'ativado'
  return 'carteira'
}

// Quem operou no mês e é novo, ativado ou reativado (ainda sem o dia). `ultimoGiroAntes` = o último giro de
// cada cliente até o fim do mês anterior.
export function quemAtivou(
  clientes: { cliente_id: string; nome: string; lotes_mes: number; data_migracao: string | null; responsavel: string | null; telefone?: string | null }[],
  ultimoGiroAntes: ReadonlyMap<string, string | null>, corretora: Corretora, mes: MesRef, mesesInativo = MESES_SEM_GIRO_REATIVA,
): Omit<AtivadoDia, 'dia'>[] {
  const out: Omit<AtivadoDia, 'dia'>[] = []
  for (const c of clientes) {
    if (!(c.lotes_mes > 0)) continue
    const antes = ultimoGiroAntes.get(c.cliente_id) ?? null
    const tipo = tipoDeQuemOperou(mes, antes, c.data_migracao, mesesInativo)
    if (tipo !== 'carteira') out.push({ cliente_id: c.cliente_id, corretora, nome: c.nome, tipo, ultimo_giro: antes, data_migracao: c.data_migracao, responsavel: c.responsavel, telefone: c.telefone ?? null, lotes_mes: c.lotes_mes })
  }
  return out
}

// O primeiro dia com lote operado de cada cliente (zeragem, posição e ação não são lote operado)
export function primeiroDiaOperado(lotes: { cliente_id: string | null; data: string; qtd: number; zeragem: boolean; posicao: boolean; acoes: boolean }[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const l of lotes) {
    if (!l.cliente_id || l.zeragem || l.posicao || l.acoes || !(l.qtd > 0)) continue
    const d = l.data.slice(0, 10), x = m.get(l.cliente_id)
    if (!x || d < x) m.set(l.cliente_id, d)
  }
  return m
}

const ddmmaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`
// O que dizer de cada ativado: "Voltou a operar · último giro em 19/06/26"
export function rotuloAtivado(a: Pick<AtivadoDia, 'tipo' | 'ultimo_giro' | 'data_migracao'>): { titulo: string; detalhe: string } {
  if (a.tipo === 'reativado' && a.ultimo_giro) return { titulo: 'Voltou a operar', detalhe: `último giro em ${ddmmaa(a.ultimo_giro)}` }
  const conta = a.data_migracao ? `conta de ${ddmmaa(a.data_migracao)}` : 'sem data de migração'
  if (a.tipo === 'novo') return { titulo: 'Conta nova operou', detalhe: conta }
  return { titulo: 'Primeira operação', detalhe: a.tipo === 'reativado' ? `${conta}, nunca tinha operado` : conta }
}

// ── Ranking de ganhos ──────────────────────────────────────────────────────────
// Quem mais teve leads ganhos (no mês ou num dia): por responsável do lead, do maior para o menor; os
// leads sem responsável ficam por último.
export const SEM_RESPONSAVEL = 'Sem responsável'
export type LinhaRanking = { nome: string; ganhos: number }
export function rankingDeGanhos(ganhos: { responsavel: string | null }[]): LinhaRanking[] {
  const m = new Map<string, number>()
  for (const g of ganhos) { const k = g.responsavel?.trim() || SEM_RESPONSAVEL; m.set(k, (m.get(k) ?? 0) + 1) }
  const fim = (n: string) => (n === SEM_RESPONSAVEL ? 1 : 0)
  return [...m.entries()].map(([nome, n]) => ({ nome, ganhos: n }))
    .sort((a, b) => fim(a.nome) - fim(b.nome) || b.ganhos - a.ganhos || a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
}

// ── Melhores dias e dias mais difíceis ─────────────────────────────────────────
// Melhores = os dias com mais ganhos (empate: o de melhor saldo, depois o mais antigo). Difíceis = os dias
// em que os perdidos mais passaram dos ganhos (empate: o de mais perdidos). Só dias até hoje.
export function diasEmDestaque(dias: DiaDoCalendario[], hoje: string, n = 3): { melhores: DiaDoCalendario[]; dificeis: DiaDoCalendario[] } {
  const ate = dias.filter(d => d.dia <= hoje)
  const saldo = (d: DiaDoCalendario) => d.ganhos - d.perdidos
  return {
    melhores: ate.filter(d => d.ganhos > 0).sort((a, b) => b.ganhos - a.ganhos || saldo(b) - saldo(a) || a.dia.localeCompare(b.dia)).slice(0, n),
    dificeis: ate.filter(d => saldo(d) < 0).sort((a, b) => saldo(a) - saldo(b) || b.perdidos - a.perdidos || a.dia.localeCompare(b.dia)).slice(0, n),
  }
}
// O melhor dia e o mais difícil (os primeiros de cada lista); sem dia que sirva, null
export function melhorEPiorDia(dias: DiaDoCalendario[], hoje: string): { melhor: DiaDoCalendario | null; pior: DiaDoCalendario | null } {
  const { melhores, dificeis } = diasEmDestaque(dias, hoje, 1)
  return { melhor: melhores[0] ?? null, pior: dificeis[0] ?? null }
}

// Até que dia já dá para dizer quem parou: o último pregão que já tem `minimo` pregões depois dele
// (quem girou pela última vez depois disso ainda não completou o tempo parado)
export function conhecidoAte(pregoes: string[], minimo: number): string | null {
  const p = [...pregoes].sort()
  return p.length > minimo ? p[p.length - 1 - minimo] : null
}
