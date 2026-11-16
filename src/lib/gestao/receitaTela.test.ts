import { describe, expect, it } from 'vitest'
import { apoioDaReceita, doPrimeiroComDado, fraseDaReceita, maiores } from './receitaTela'
import type { ProjecaoMes } from './projecao'

const medida = (realizado: number, x: Partial<ProjecaoMes['receita']> = {}): ProjecaoMes['receita'] =>
  ({ realizado, projetado: realizado, baixo: realizado, alto: realizado, linear: realizado, anteriorMesmoPonto: null, anteriorTotal: null, ...x })
const proj = (x: Partial<ProjecaoMes> = {}): ProjecaoMes => ({
  mesRef: '2026-11-01', mesAnterior: '2026-10-01', ultimaData: '2026-11-13', parcial: true, metodo: 'historico', diasDecorridos: 9, diasTotal: 21, fracao: 9 / 21, fracaoEsperada: 0.44,
  mesesHistorico: 10, lotes: medida(261318), receita: medida(47190, { projetado: 107191, anteriorMesmoPonto: 85097, anteriorTotal: 156881 }), fator: { lotes: 2.2, receita: 2.27 }, ...x,
})

describe('fraseDaReceita', () => {
  it('mês em andamento: quanto entrou, contra o mesmo ponto do mês anterior, e em quanto fecha', () => {
    expect(fraseDaReceita(proj(), 47190)).toBe('Novembro tem R$ 47 mil de receita até 13/11, 45 % abaixo de outubro no mesmo ponto do mês. No ritmo atual fecha perto de R$ 107 mil, contra R$ 157 mil em outubro.')
  })
  it('sem mês anterior para comparar, fica só o quanto entrou e a previsão', () => {
    expect(fraseDaReceita(proj({ receita: medida(884, { projetado: 2100 }) }), 884)).toBe('Novembro tem R$ 884 de receita até 13/11. No ritmo atual fecha perto de R$ 2.100.')
  })
  it('mês fechado: com quanto fechou e contra o mês anterior inteiro', () => {
    const fechado = proj({ mesRef: '2026-10-01', mesAnterior: '2026-09-01', parcial: false, metodo: 'fechado', receita: medida(156881, { anteriorMesmoPonto: 146018, anteriorTotal: 146018 }) })
    expect(fraseDaReceita(fechado, 156881)).toBe('Outubro fechou com R$ 157 mil de receita, 7 % acima de setembro.')
    expect(fraseDaReceita({ ...fechado, receita: medida(156881, { anteriorTotal: 156000 }) }, 156881)).toBe('Outubro fechou com R$ 157 mil de receita, no mesmo nível de setembro.')
  })
  it('mês sem receita', () => {
    expect(fraseDaReceita(proj({ parcial: false, metodo: 'sem-lotes', receita: medida(0) }), 0)).toBe('Ainda não há receita lançada em novembro.')
  })
})

describe('apoioDaReceita', () => {
  it('diz de que tipo veio e deixa o incentivo à parte', () => {
    expect(apoioDaReceita({ corretagem: 30816, zeragem: 16374, incentivo: 15300 })).toBe('Veio de corretagem (R$ 30.816) e zeragem (R$ 16.374). O incentivo da corretora soma mais R$ 15.300.')
    expect(apoioDaReceita({ corretagem: 9597.12, zeragem: 8640, outras: 18 })).toBe('Veio de corretagem (R$ 9.597), zeragem (R$ 8.640) e receita fixa (R$ 18).')
    expect(apoioDaReceita({ corretagem: 884, zeragem: 0 })).toBe('Veio de corretagem (R$ 884).')
    expect(apoioDaReceita({ corretagem: 0, zeragem: 0 })).toBeNull()
  })
})

describe('doPrimeiroComDado', () => {
  it('tira só os vazios do começo; buraco no meio fica', () => {
    const meses = [{ m: 'jul', v: 0 }, { m: 'ago', v: 0 }, { m: 'set', v: 3 }, { m: 'out', v: 0 }, { m: 'nov', v: 5 }]
    expect(doPrimeiroComDado(meses, x => x.v > 0).map(x => x.m)).toEqual(['set', 'out', 'nov'])
    expect(doPrimeiroComDado(meses, x => x.v > 99)).toEqual([])
  })
})

describe('maiores', () => {
  it('ordena, corta em N, deixa de fora quem está zerado e calcula a fatia de cada um e dos N juntos', () => {
    const r = maiores([{ nome: 'A', receita: 50 }, { nome: 'B', receita: 0 }, { nome: 'C', receita: 30 }, { nome: 'D', receita: 20 }], x => x.receita, 2)
    expect(r.itens.map(x => [x.nome, x.valor, x.pct])).toEqual([['A', 50, 50], ['C', 30, 30]])
    expect(r.total).toBe(100)
    expect(r.pctJuntos).toBe(80)
    expect(maiores([], () => 0)).toEqual({ itens: [], total: 0, pctJuntos: 0 })
  })
})
