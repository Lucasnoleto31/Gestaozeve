// Projeção de fechamento do mês a partir do giro por dia de todo o histórico (S44).
//
// Cada mês completo do histórico vira uma curva: a fração do total do mês atingida ao fim de cada
// dia útil. No mês corrente, com k dos n dias úteis lançados, a projeção é
//   realizado ÷ mediana(fração que os meses do histórico tinham atingido em k/n)
// e a faixa vem dos quartis dessas frações. O ritmo linear (realizado ÷ k/n) fica como referência.
// Com menos de 3 meses de histórico a projeção é só o ritmo linear.
// Só funções puras (testes em projecao.test.ts). Dias úteis = segunda a sexta, sem feriados.
import { diasUteis } from './btg'
import { mesCurto, somarMeses, type MesRef } from './meses'
import type { Faixa, GiroDiaRow, IncentivoRow } from './tipos'

export const mesDoDia = (dia: string): MesRef => `${dia.slice(0, 7)}-01`

// Último dia do mês ('YYYY-MM-DD')
export function fimDoMes(mes: MesRef): string {
  const y = +mes.slice(0, 4), m = +mes.slice(5, 7)
  return `${mes.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}

// Quantil com interpolação linear (q em 0..1); 0 quando não há valores
export function quantil(valores: number[], q: number): number {
  if (!valores.length) return 0
  const v = [...valores].sort((a, b) => a - b)
  const pos = Math.max(0, Math.min(1, q)) * (v.length - 1)
  const i = Math.floor(pos), f = pos - i
  return i + 1 < v.length ? v[i] + f * (v[i + 1] - v[i]) : v[i]
}
export const mediana = (valores: number[]) => quantil(valores, 0.5)

// Curva de um mês completo: fração do total atingida ao fim de cada dia útil (índice 0 = 0, índice n = 1)
export type CurvaMes = { mes: MesRef; n: number; lotes: number[]; receita: number[] }

// Curvas dos meses completos anteriores a `ateMes` (os `maxMeses` mais recentes com lotes).
// O primeiro mês com lotes costuma estar pela metade (a importação começou no meio dele):
// se os 3 primeiros dias úteis dele estão vazios, fica de fora.
export function curvasMensais(dias: GiroDiaRow[], ateMes: MesRef, maxMeses = 24): CurvaMes[] {
  const porMes = new Map<MesRef, GiroDiaRow[]>()
  for (const d of dias) {
    const m = mesDoDia(d.dia)
    if (m >= ateMes) continue
    const lista = porMes.get(m)
    if (lista) lista.push(d); else porMes.set(m, [d])
  }
  const meses = [...porMes.keys()].sort()
  const out: CurvaMes[] = []
  for (const mes of meses) {
    const n = diasUteis(mes, fimDoMes(mes))
    if (n === 0) continue
    const lotes = new Array<number>(n + 1).fill(0), receita = new Array<number>(n + 1).fill(0)
    let totL = 0, totR = 0
    for (const d of porMes.get(mes)!) {
      // fim de semana cai no dia útil anterior (mínimo o primeiro)
      const k = Math.min(n, Math.max(1, diasUteis(mes, d.dia)))
      lotes[k] += d.lotes; receita[k] += d.receita; totL += d.lotes; totR += d.receita
    }
    if (totL <= 0) continue
    if (out.length === 0 && lotes[1] + lotes[2] + lotes[3] === 0) continue
    for (let k = 1; k <= n; k++) { lotes[k] += lotes[k - 1]; receita[k] += receita[k - 1] }
    out.push({ mes, n, lotes: lotes.map(v => v / totL), receita: totR > 0 ? receita.map(v => v / totR) : lotes.map(v => v / totL) })
  }
  return out.slice(-maxMeses)
}

// Fração da curva numa fração x (0..1) do mês, interpolando entre dias úteis
export function fracaoEm(curva: number[], x: number): number {
  const n = curva.length - 1
  if (n <= 0) return 1
  const pos = Math.max(0, Math.min(1, x)) * n
  const i = Math.floor(pos), f = pos - i
  if (i >= n) return 1
  return curva[i] + f * (curva[i + 1] - curva[i])
}

export type ProjecaoMedida = {
  realizado: number
  projetado: number                   // = realizado quando o mês está fechado ou sem lotes
  baixo: number                       // faixa: quartis das frações do histórico
  alto: number
  linear: number                      // ritmo linear: realizado ÷ (dias úteis lançados ÷ dias úteis do mês)
  anteriorMesmoPonto: number | null   // mês anterior até a mesma fração de dias úteis (null sem mês anterior)
  anteriorTotal: number | null        // mês anterior inteiro
}
export type MetodoProjecao = 'historico' | 'linear' | 'fechado' | 'sem-lotes'
export type ProjecaoMes = {
  mesRef: MesRef
  mesAnterior: MesRef
  ultimaData: string | null
  parcial: boolean                    // mês corrente, com dias úteis pela frente: a projeção vale
  metodo: MetodoProjecao
  diasDecorridos: number              // dias úteis lançados (0 sem lotes no mês)
  diasTotal: number                   // dias úteis do mês
  fracao: number                      // diasDecorridos ÷ diasTotal
  fracaoEsperada: number              // mediana da fração dos lotes que o histórico tinha neste ponto
  mesesHistorico: number
  lotes: ProjecaoMedida
  receita: ProjecaoMedida
  fator: { lotes: number; receita: number }   // multiplicador realizado → projetado (1 fora do mês parcial)
}

const somaAte = (dias: GiroDiaRow[], mes: MesRef, ateIndice: number | null) => {
  let lotes = 0, receita = 0
  for (const d of dias) {
    if (ateIndice != null && diasUteis(mes, d.dia) > ateIndice) continue
    lotes += d.lotes; receita += d.receita
  }
  return { lotes, receita }
}

// Projeção do mês de referência. `hoje` e `ultimaData` em 'YYYY-MM-DD'. Só projeta quando o mês de
// referência é o mês corrente, tem lotes e ainda tem dias úteis pela frente; fora disso devolve o
// realizado como projetado (metodo 'fechado' ou 'sem-lotes').
export function projetarMes(dias: GiroDiaRow[], mesRef: MesRef, ultimaData: string | null, hoje: string, opts: { minMeses?: number; maxMeses?: number } = {}): ProjecaoMes {
  const minMeses = opts.minMeses ?? 3, maxMeses = opts.maxMeses ?? 24
  const mesAnterior = somarMeses(mesRef, -1)
  const doMes = dias.filter(d => mesDoDia(d.dia) === mesRef)
  const doAnterior = dias.filter(d => mesDoDia(d.dia) === mesAnterior)
  const realizado = somaAte(doMes, mesRef, null)
  const anteriorTotal = doAnterior.length ? somaAte(doAnterior, mesAnterior, null) : null
  const n = diasUteis(mesRef, fimDoMes(mesRef))
  const temLotes = realizado.lotes > 0
  const noMes = !!ultimaData && mesDoDia(ultimaData) === mesRef
  const k = temLotes && noMes ? Math.min(n, Math.max(1, diasUteis(mesRef, ultimaData!))) : 0
  const mesCorrente = mesRef === mesDoDia(hoje)
  const parcial = mesCorrente && k > 0 && k < n
  const fracao = n > 0 ? k / n : 0

  const fechada = (m: { lotes: number; receita: number }, ant: { lotes: number; receita: number } | null, chave: 'lotes' | 'receita'): ProjecaoMedida => ({
    realizado: m[chave], projetado: m[chave], baixo: m[chave], alto: m[chave], linear: m[chave],
    anteriorMesmoPonto: ant ? ant[chave] : null, anteriorTotal: ant ? ant[chave] : null,
  })

  if (!parcial) {
    return {
      mesRef, mesAnterior, ultimaData, parcial: false, metodo: temLotes ? 'fechado' : 'sem-lotes',
      diasDecorridos: k, diasTotal: n, fracao: temLotes ? 1 : 0, fracaoEsperada: 1, mesesHistorico: 0,
      lotes: fechada(realizado, anteriorTotal, 'lotes'), receita: fechada(realizado, anteriorTotal, 'receita'),
      fator: { lotes: 1, receita: 1 },
    }
  }

  const x = k / n
  const curvas = curvasMensais(dias, mesRef, maxMeses)
  const nAnt = diasUteis(mesAnterior, fimDoMes(mesAnterior))
  const anteriorMesmoPonto = doAnterior.length ? somaAte(doAnterior, mesAnterior, Math.max(1, Math.round(x * nAnt))) : null
  const historico = curvas.length >= minMeses
  const medida = (chave: 'lotes' | 'receita'): { m: ProjecaoMedida; esperada: number; usouHistorico: boolean } => {
    const real = realizado[chave]
    const linear = real / x
    const base: ProjecaoMedida = {
      realizado: real, projetado: linear, baixo: linear, alto: linear, linear,
      anteriorMesmoPonto: anteriorMesmoPonto ? anteriorMesmoPonto[chave] : null, anteriorTotal: anteriorTotal ? anteriorTotal[chave] : null,
    }
    if (!historico) return { m: base, esperada: x, usouHistorico: false }
    const fracoes = curvas.map(c => fracaoEm(c[chave], x))
    const med = mediana(fracoes)
    // muito cedo no mês (quase nada atingido no histórico) o quociente explode: fica no linear
    if (med < 0.02) return { m: base, esperada: med, usouHistorico: false }
    const q1 = Math.max(quantil(fracoes, 0.25), 0.02), q3 = Math.max(quantil(fracoes, 0.75), med)
    return { m: { ...base, projetado: real / med, baixo: real / q3, alto: real / q1 }, esperada: med, usouHistorico: true }
  }
  const lotes = medida('lotes'), receita = medida('receita')
  return {
    mesRef, mesAnterior, ultimaData, parcial: true, metodo: lotes.usouHistorico ? 'historico' : 'linear',
    diasDecorridos: k, diasTotal: n, fracao, fracaoEsperada: lotes.esperada, mesesHistorico: curvas.length,
    lotes: lotes.m, receita: receita.m,
    fator: { lotes: realizado.lotes > 0 ? lotes.m.projetado / realizado.lotes : 1, receita: realizado.receita > 0 ? receita.m.projetado / realizado.receita : 1 },
  }
}

// Variação para o KpiCard: no mês parcial compara com o mesmo ponto do mês anterior (mesma fração
// de dias úteis); no mês fechado, com o mês anterior inteiro; sem lotes no mês não há comparação.
export function variacaoDe(p: ProjecaoMes, m: ProjecaoMedida, fmt?: (n: number) => string): { atual: number; anterior: number | null; rotulo: string; fmt?: (n: number) => string } {
  if (p.metodo === 'sem-lotes') return { atual: m.realizado, anterior: null, rotulo: `vs ${mesCurto(p.mesAnterior)}`, fmt }
  return p.parcial
    ? { atual: m.realizado, anterior: m.anteriorMesmoPonto, rotulo: `vs mesmo ponto de ${mesCurto(p.mesAnterior)}`, fmt }
    : { atual: m.realizado, anterior: m.anteriorTotal, rotulo: `vs ${mesCurto(p.mesAnterior)}`, fmt }
}

// Variação sem giro diário (incentivo, ficha): mês parcial contra mês inteiro fica sem cor (neutro)
export function variacaoMensal(atual: number, anterior: number | null | undefined, mesAnterior: MesRef, parcial: boolean, fmt?: (n: number) => string) {
  return { atual, anterior: anterior ?? null, rotulo: parcial ? `vs ${mesCurto(mesAnterior)} (mês parcial)` : `vs ${mesCurto(mesAnterior)}`, fmt, neutro: parcial }
}

// ── Incentivo por pontos (Genial/XP) ─────────────────────────────────────────
// Faixa = maior mínimo ultrapassado (pontos > pontos_min), como em incentivo_mes
export const faixaDe = (pontos: number, faixas: Faixa[]): Faixa | null =>
  [...faixas].filter(f => pontos > f.pontos_min).sort((a, b) => b.pontos_min - a.pontos_min)[0] ?? null

export type IncentivoItemProjetado = {
  chave: string; nome: string; cliente_id: string | null
  pontos: number; pontosProjetados: number
  faixaAtual: number | null; faixaProjetada: number | null
  valorAtual: number; valorProjetado: number
}
export type IncentivoProjetado = {
  total: number            // incentivo projetado do mês
  comFaixa: number         // clientes com faixa na projeção
  sobem: number            // clientes que ganham faixa (ou sobem) na projeção
  pontos: number           // pontos projetados
  itens: IncentivoItemProjetado[]
}

// Projeta os pontos de cada cliente pelo fator do mês e reenquadra nas faixas
export function projetarIncentivo(linhas: IncentivoRow[], fator: number, faixas: Faixa[]): IncentivoProjetado {
  const f = fator > 0 ? fator : 1
  const itens = linhas.map<IncentivoItemProjetado>(l => {
    const pontosProjetados = l.pontos * f
    const atual = faixaDe(l.pontos, faixas), proj = faixaDe(pontosProjetados, faixas)
    return {
      chave: l.chave, nome: l.nome, cliente_id: l.cliente_id, pontos: l.pontos, pontosProjetados,
      faixaAtual: atual?.pontos_min ?? null, faixaProjetada: proj?.pontos_min ?? null,
      valorAtual: atual?.valor ?? 0, valorProjetado: proj?.valor ?? 0,
    }
  })
  return {
    total: itens.reduce((s, i) => s + i.valorProjetado, 0),
    comFaixa: itens.filter(i => i.valorProjetado > 0).length,
    sobem: itens.filter(i => (i.faixaProjetada ?? -1) > (i.faixaAtual ?? -1)).length,
    pontos: itens.reduce((s, i) => s + i.pontosProjetados, 0),
    itens: itens.sort((a, b) => b.valorProjetado - a.valorProjetado || b.pontosProjetados - a.pontosProjetados),
  }
}
