// Tela Incentivo (redesenho de nov/26): quanto falta para a próxima meta, quando bate e quanto de prêmio
// está em jogo. Lucas: "está muito confusa, não entendi nada". Aqui ficam a situação de cada meta em
// palavra (com folga, apertado, fora do prazo) e as frases do topo: a do BTG (ATP Turbo, metas de comissão
// acumulada) e a da Genial (pontos por cliente, que caem em faixas). As regras de cada programa continuam
// em btg.ts e projecao.ts; nada aqui muda conta. Testes em incentivoTela.test.ts.
import { MESES_LONGOS } from '@/lib/format'
import { mesCurto, somarMeses } from './meses'
import type { MetaAvaliada, Previsao } from './btg'

const inteiro = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`
const num = (v: number) => Math.round(v).toLocaleString('pt-BR')
const nomeDoMes = (mes: string) => MESES_LONGOS[parseInt(mes.slice(5, 7), 10) - 1] ?? mes.slice(0, 7)
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const plural = (n: number, um: string, varios: string) => `${num(n)} ${n === 1 ? um : varios}`

// ── BTG: metas do ATP Turbo ─────────────────────────────────────────────────
export type SituacaoMeta = 'atingida' | 'folga' | 'apertado' | 'fora' | 'vencida'
// "Apertado" = bate dentro do prazo, mas com menos de 3 meses de sobra no ritmo escolhido
export const FOLGA_MINIMA_MESES = 3
export const SITUACAO_META: Record<SituacaoMeta, { texto: string; tom: 'gain' | 'warn' | 'loss' | 'neutral' }> = {
  atingida: { texto: 'Atingida', tom: 'gain' },
  folga: { texto: 'Com folga', tom: 'gain' },
  apertado: { texto: 'Apertado', tom: 'warn' },
  fora: { texto: 'Fora do prazo', tom: 'loss' },
  vencida: { texto: 'Vencida', tom: 'neutral' },
}

export function situacaoDaMeta(m: Pick<MetaAvaliada, 'status'>, p: Previsao | undefined): SituacaoMeta {
  if (m.status === 'atingida') return 'atingida'
  if (m.status === 'vencida') return 'vencida'
  if (!p?.alcanca) return 'fora'
  return (p.folgaMeses ?? 0) >= FOLGA_MINIMA_MESES ? 'folga' : 'apertado'
}

// "15 meses antes do prazo" / "12 dias depois do prazo"
export function textoDaFolga(folga: number | null): string {
  const f = folga ?? 0
  if (Math.abs(f) < 1) {
    const d = Math.max(1, Math.round(Math.abs(f) * 30.4375))
    return `${plural(d, 'dia', 'dias')} ${f >= 0 ? 'antes' : 'depois'} do prazo`
  }
  return f > 0 ? `${plural(Math.round(f), 'mês', 'meses')} antes do prazo` : `${plural(Math.round(-f), 'mês', 'meses')} depois do prazo`
}

// Quando a meta bate no ritmo escolhido, em palavras: "bate em nov/26, 15 meses antes do prazo"
export function textoDaPrevisao(p: Previsao | undefined): string {
  if (!p?.dataPrevista) return 'não bate: falta receita no ritmo escolhido'
  if ((p.mesesParaAtingir ?? 0) > 120) return 'levaria mais de 10 anos'
  return `bate em ${mesCurto(`${p.dataPrevista.slice(0, 7)}-01`)}, ${textoDaFolga(p.folgaMeses)}`
}

// A frase do topo do BTG: quanto falta para a próxima meta, o prêmio dela e quando bate no ritmo da previsão
// (`noRitmo` = "No ritmo atual", o padrão, ou "No ritmo escolhido" quando a pessoa trocou o ritmo)
export function fraseDoAtp(metas: MetaAvaliada[], previsaoDaProxima: Previsao | undefined, noRitmo = 'No ritmo atual'): string {
  if (!metas.length) return 'O programa ainda não tem metas cadastradas.'
  const proxima = metas.find(m => m.status === 'em andamento')
  const atingidas = metas.filter(m => m.status === 'atingida')
  const premios = atingidas.reduce((s, m) => s + m.premio, 0)
  if (!proxima) {
    return atingidas.length === metas.length
      ? `Todas as ${num(metas.length)} metas foram atingidas: ${inteiro(premios)} em prêmios.`
      : `Não há meta em aberto: ${plural(atingidas.length, 'atingida', 'atingidas')}${premios ? ` (${inteiro(premios)} em prêmios)` : ''} e ${plural(metas.length - atingidas.length, 'vencida', 'vencidas')}.`
  }
  const abre = `Faltam ${inteiro(proxima.faltam)} para a próxima meta, com prêmio de ${inteiro(proxima.premio)}.`
  return `${abre} ${noRitmo} ${textoDaPrevisao(previsaoDaProxima)}.`
}

// ── Genial: pontos por cliente ──────────────────────────────────────────────
// A frase do topo da Genial: quanto o mês já garante, em quanto deve fechar e quanto pagou o mês anterior
export function fraseDoIncentivo(d: { mesRef: string; total: number; comFaixa: number; previsto: number | null; anterior: number | null; primeiraFaixa: number }): string {
  const atual = nomeDoMes(d.mesRef), anterior = nomeDoMes(somarMeses(d.mesRef, -1))
  const clientes = `${plural(d.comFaixa, 'cliente', 'clientes')} em alguma faixa`
  const antes = d.anterior != null && d.anterior > 0 ? `${anterior} pagou ${inteiro(d.anterior)}` : null
  if (d.previsto == null) {
    if (d.total <= 0) return `${maiuscula(atual)} não teve incentivo: ninguém passou de ${num(d.primeiraFaixa)} pontos.`
    return `${maiuscula(atual)} pagou ${inteiro(d.total)} de incentivo, com ${clientes}${antes ? `; ${antes}` : ''}.`
  }
  const fecha = `No ritmo atual fecha em ${inteiro(d.previsto)}${antes ? `; ${antes}` : ''}.`
  if (d.total <= 0) return `${maiuscula(atual)} ainda não garante incentivo: ninguém passou de ${num(d.primeiraFaixa)} pontos. ${fecha}`
  return `${maiuscula(atual)} já garante ${inteiro(d.total)} de incentivo, com ${clientes}. ${fecha}`
}

// Quem está mais perto de subir de faixa (menos pontos faltando)
export function maisPertoDeSubir<T extends { pontos_faltantes: number | null }>(linhas: T[]): T | null {
  return [...linhas].filter(l => l.pontos_faltantes != null && l.pontos_faltantes > 0).sort((a, b) => (a.pontos_faltantes ?? 0) - (b.pontos_faltantes ?? 0))[0] ?? null
}
