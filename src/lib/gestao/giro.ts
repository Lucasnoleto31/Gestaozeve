// Giro diário: as contas da página sobre a série por dia com giro (função `diario` do banco).
// Só funções puras (testes em giro.test.ts); quem lê o banco são as abas em [corretora]/lotes.
import { inicioSemana, somarDias, somarMeses } from './meses'
import type { DiarioRow } from './tipos'

const somaDe = (xs: DiarioRow[], k: 'lotes' | 'zerados' | 'receita' | 'operacoes') => xs.reduce((s, d) => s + d[k], 0)
const maior = (xs: DiarioRow[]) => xs.reduce<DiarioRow | null>((m, d) => (!m || d.lotes > m.lotes ? d : m), null)

export type Tendencia = 'Subindo' | 'Estável' | 'Caindo'
// Sobe ou cai quando a reta do período varia mais que isto da média por dia
export const LIMIAR_TENDENCIA = 0.10
export const MEDIA_MOVEL = 7

// Inclinação da reta de mínimos quadrados: quantos lotes/dia o giro ganha (ou perde) a cada dia com giro
export function inclinacao(valores: number[]): number {
  const n = valores.length
  if (n < 2) return 0
  const mx = (n - 1) / 2
  const my = valores.reduce((s, v) => s + v, 0) / n
  let num = 0, den = 0
  valores.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2 })
  return den ? num / den : 0
}

// ── Período ────────────────────────────────────────────────────────────────
export type ResumoPeriodo = {
  dias: number                 // dias com giro
  lotes: number
  zerados: number
  receita: number
  operacoes: number
  media: number                // lotes por dia com giro
  melhor: DiarioRow | null
  metade1: { dias: number; media: number }
  metade2: { dias: number; media: number }
  varMetades: number | null    // % da 2ª metade sobre a 1ª
  inclinacao: number
  tendencia: Tendencia
  clientesMedia: number
  clientesMax: number
}

export function resumoPeriodo(dias: DiarioRow[]): ResumoPeriodo {
  const lotes = somaDe(dias, 'lotes')
  const media = dias.length ? lotes / dias.length : 0
  const corte = Math.ceil(dias.length / 2)
  const m1 = dias.slice(0, corte), m2 = dias.slice(corte)
  const media1 = m1.length ? somaDe(m1, 'lotes') / m1.length : 0
  const media2 = m2.length ? somaDe(m2, 'lotes') / m2.length : 0
  const slope = inclinacao(dias.map(d => d.lotes))
  // quanto a reta anda do primeiro ao último dia, em fração da média
  const variacao = media && dias.length > 1 ? (slope * (dias.length - 1)) / media : 0
  return {
    dias: dias.length, lotes, zerados: somaDe(dias, 'zerados'), receita: somaDe(dias, 'receita'), operacoes: somaDe(dias, 'operacoes'),
    media, melhor: maior(dias),
    metade1: { dias: m1.length, media: media1 }, metade2: { dias: m2.length, media: media2 },
    varMetades: media1 ? ((media2 - media1) / media1) * 100 : null,
    inclinacao: slope,
    tendencia: variacao > LIMIAR_TENDENCIA ? 'Subindo' : variacao < -LIMIAR_TENDENCIA ? 'Caindo' : 'Estável',
    clientesMedia: dias.length ? dias.reduce((s, d) => s + d.clientes, 0) / dias.length : 0,
    clientesMax: Math.max(0, ...dias.map(d => d.clientes)),
  }
}

// Cada dia com a média móvel, o acumulado do período, o dia anterior e se ficou acima da média
export type DiaSerie = DiarioRow & { mm: number; acumulado: number; anteriorLotes: number; acimaMedia: boolean }

export function serieDoPeriodo(dias: DiarioRow[]): DiaSerie[] {
  const media = dias.length ? somaDe(dias, 'lotes') / dias.length : 0
  let acumulado = 0
  return dias.map((d, i) => {
    acumulado += d.lotes
    const janela = dias.slice(Math.max(0, i - MEDIA_MOVEL + 1), i + 1)
    return { ...d, mm: somaDe(janela, 'lotes') / janela.length, acumulado, anteriorLotes: i > 0 ? dias[i - 1].lotes : 0, acimaMedia: d.lotes >= media }
  })
}

// ── Agora: o último dia lançado, a semana e o mês dele ──────────────────────
export type SituacaoAtual = {
  ultima: string
  dia: DiarioRow | null                 // o último dia lançado
  semana: {
    inicio: string                      // a segunda-feira
    lotes: number
    dias: number
    anterior: number | null             // os mesmos dias da semana passada (null = sem giro neles)
  }
  mes: {
    mes: string                         // 'AAAA-MM-01'
    dias: DiarioRow[]                   // os dias com giro do mês, até o último lançado
    lotes: number
    zerados: number
    receita: number
    media: number
    melhor: DiarioRow | null
    clientesMax: number
  }
  // o mês anterior inteiro e o ponto dele com o mesmo número de dias com giro (null = sem giro nele)
  mesAnterior: { mes: string; dias: number; lotes: number; media: number; noMesmoPonto: number; diasNoPonto: number } | null
}

// `dias` = a série desde o primeiro dia do mês anterior ao de `ultima`, em ordem de data
export function situacaoAtual(dias: DiarioRow[], ultima: string): SituacaoAtual {
  const mes = `${ultima.slice(0, 7)}-01`
  const doMes = dias.filter(d => d.dia >= mes && d.dia <= ultima)
  const lotesMes = somaDe(doMes, 'lotes')

  const semIni = inicioSemana(ultima)
  const daSemana = dias.filter(d => d.dia >= semIni && d.dia <= ultima)
  const semanaPassada = dias.filter(d => d.dia >= somarDias(semIni, -7) && d.dia <= somarDias(ultima, -7))

  const mesAnt = somarMeses(mes, -1)
  const doAnterior = dias.filter(d => d.dia >= mesAnt && d.dia < mes)
  const noPonto = doAnterior.slice(0, doMes.length)

  return {
    ultima,
    dia: doMes.find(d => d.dia === ultima) ?? null,
    semana: { inicio: semIni, lotes: somaDe(daSemana, 'lotes'), dias: daSemana.length, anterior: semanaPassada.length ? somaDe(semanaPassada, 'lotes') : null },
    mes: {
      mes, dias: doMes, lotes: lotesMes, zerados: somaDe(doMes, 'zerados'), receita: somaDe(doMes, 'receita'),
      media: doMes.length ? lotesMes / doMes.length : 0, melhor: maior(doMes), clientesMax: Math.max(0, ...doMes.map(d => d.clientes)),
    },
    mesAnterior: doAnterior.length ? {
      mes: mesAnt, dias: doAnterior.length, lotes: somaDe(doAnterior, 'lotes'), media: somaDe(doAnterior, 'lotes') / doAnterior.length,
      noMesmoPonto: somaDe(noPonto, 'lotes'), diasNoPonto: noPonto.length,
    } : null,
  }
}
