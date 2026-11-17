// Calendário do mês (Funil › Calendário). Lucas, 17/11/2026: "adiciona o calendário de ganhos por dia e
// perdidos por dia e clientes que pararam de girar, ex. 1 dia". Cada dia mostra três números:
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
export type ParouDia = { cliente_id: string; corretora: Corretora; dia: string; nome: string; responsavel: string | null; pregoes: number; lotes_12m: number }
export type DiaDoCalendario = { dia: string; ganhos: number; perdidos: number; pararam: number }

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
  clientes: { cliente_id: string; nome: string; ultimo_giro: string | null; responsavel: string | null; lotes_12m: number }[],
  corretora: Corretora, pregoes: string[], desde: string, minimo: number,
): ParouDia[] {
  const out: ParouDia[] = []
  for (const c of clientes) {
    if (!c.ultimo_giro || c.ultimo_giro < desde) continue
    const n = pregoesDepois(c.ultimo_giro, pregoes)
    if (n >= minimo) out.push({ cliente_id: c.cliente_id, corretora, dia: c.ultimo_giro, nome: c.nome, responsavel: c.responsavel, pregoes: n, lotes_12m: c.lotes_12m })
  }
  return out
}

// Um item por dia do mês, com quantos ganhos, perdidos e clientes que pararam
export function diasDoCalendario(mes: MesRef, ganhos: { dia: string }[], perdidos: { dia: string }[], pararam: { dia: string }[]): DiaDoCalendario[] {
  const conta = (itens: { dia: string }[]) => { const m = new Map<string, number>(); for (const i of itens) m.set(i.dia, (m.get(i.dia) ?? 0) + 1); return m }
  const g = conta(ganhos), p = conta(perdidos), s = conta(pararam)
  const fim = somarMeses(mes, 1)
  const out: DiaDoCalendario[] = []
  for (let dia = mes; dia < fim; dia = somarDias(dia, 1)) out.push({ dia, ganhos: g.get(dia) ?? 0, perdidos: p.get(dia) ?? 0, pararam: s.get(dia) ?? 0 })
  return out
}

// Só os itens de um mês ('AAAA-MM-01')
export const doMes = <T extends { dia: string }>(itens: T[], mes: MesRef): T[] => itens.filter(i => i.dia.slice(0, 7) === mes.slice(0, 7))
