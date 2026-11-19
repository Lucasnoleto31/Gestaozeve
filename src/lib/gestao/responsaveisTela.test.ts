import { describe, expect, it } from 'vitest'
import { evolucaoDoTime, fraseDoTime, montarPessoas, nomeDeFrase, pessoasAVista, seriesDaEvolucao } from './responsaveisTela'
import type { AssessorMensalRow, AssessorResumoRow } from './tipos'

const resumo = (assessor_nome: string, x: Partial<AssessorResumoRow> = {}): AssessorResumoRow => ({
  assessor_nome, responsavel: null, tarifa: 0.25, tipo_zeragem: null, clientes_ativos: 0, lotes: 0, zerados: 0,
  receita_corretagem: 0, receita_zeragem: 0, receita: 0, lotes_mes_anterior: 0, lotes_12m: 0, receita_12m: 0, ...x,
})
const mes = (assessor_nome: string, mes_ref: string, receita: number, lotes = receita * 4): AssessorMensalRow => ({ mes_ref, assessor_nome, lotes, receita, clientes: 1 })
const MESES = ['2026-09-01', '2026-10-01', '2026-11-01']

const time = () => montarPessoas({
  resumo: [
    resumo('Artur', { receita: 3000, lotes: 20000, clientes_ativos: 36, responsavel: 'Artur' }),
    resumo('Lucas', { receita: 6000, lotes: 40000, clientes_ativos: 20, responsavel: 'Lucas' }),
    resumo('ZEVE INVESTIMENTOS 18', { receita: 1000, lotes: 5000, clientes_ativos: 4, responsavel: 'Aikon' }),
  ],
  mensal: [mes('Lucas', '2026-09-01', 500), mes('Lucas', '2026-10-01', 8000), mes('Lucas', '2026-11-01', 6000), mes('Artur', '2026-10-01', 12000), mes('Artur', '2026-11-01', 3000), mes('ZEVE INVESTIMENTOS 18', '2026-11-01', 1000)],
  clientes: [
    { assessor_nome: 'Artur', data_migracao: '2026-11-03', status: 'Migrado' }, { assessor_nome: 'Artur', data_migracao: '2026-11-10', status: 'Migrado' },
    { assessor_nome: 'Artur', data_migracao: '2026-10-30', status: 'Migrado' }, { assessor_nome: 'Lucas', data_migracao: '2026-11-05', status: 'Em processamento' },
    { assessor_nome: null, data_migracao: '2026-11-05', status: 'Migrado' },
  ],
  meses: MESES, mesRef: '2026-11-01', fracaoMesmoPonto: 0.5,
})

describe('montarPessoas', () => {
  it('ordena pela receita do mês e calcula a fatia de cada pessoa', () => {
    const p = time()
    expect(p.map(x => x.nome)).toEqual(['Lucas', 'Artur', 'ZEVE INVESTIMENTOS 18'])
    expect(p.map(x => x.pctReceita)).toEqual([60, 30, 10])
  })
  it('compara com o mês anterior até o mesmo ponto: o mês anterior da pessoa vezes a fração da corretora', () => {
    const [lucas, artur, z18] = time()
    expect([lucas.receitaAnterior, lucas.base, lucas.variacao]).toEqual([8000, 4000, 50])
    expect([artur.receitaAnterior, artur.base, artur.variacao]).toEqual([12000, 6000, -50])
    expect([z18.receitaAnterior, z18.base, z18.variacao]).toEqual([0, 0, null])   // sem mês anterior não há variação
  })
  it('sem mês anterior na corretora (fração nula) ninguém tem comparação; mês fechado compara com o mês inteiro', () => {
    const base = { resumo: [resumo('Lucas', { receita: 6000 })], mensal: [mes('Lucas', '2026-10-01', 8000)], clientes: [], meses: MESES, mesRef: '2026-11-01' }
    expect(montarPessoas({ ...base, fracaoMesmoPonto: null })[0].variacao).toBeNull()
    expect(montarPessoas({ ...base, fracaoMesmoPonto: 1 })[0].variacao).toBe(-25)
  })
  it('contas novas = migradas no mês, pela conta do assessor; a pessoa ligada aparece só quando o nome é um código', () => {
    const [lucas, artur, z18] = time()
    expect([lucas.contasNovas, artur.contasNovas, z18.contasNovas]).toEqual([0, 2, 0])
    expect([lucas.pessoa, artur.pessoa, z18.pessoa]).toEqual([null, null, 'Aikon'])
  })
  it('a tendência segue os meses da janela, com zero onde não houve receita', () => {
    const [lucas, artur] = time()
    expect(lucas.tendencia).toEqual([500, 8000, 6000])
    expect(artur.tendencia).toEqual([0, 12000, 3000])
  })
})

describe('pessoasAVista', () => {
  // 100 mil no mês e 100 mil no mês anterior: 1 % = R$ 1.000
  const grande = (nome: string, receita: number, anterior: number) => ({ r: resumo(nome, { receita }), m: mes(nome, '2026-10-01', anterior) })
  const montar = (xs: { r: AssessorResumoRow; m: AssessorMensalRow }[]) =>
    montarPessoas({ resumo: xs.map(x => x.r), mensal: xs.map(x => x.m), clientes: [], meses: MESES, mesRef: '2026-11-01', fracaoMesmoPonto: 0.5 })
  const TIME = [grande('A', 60000, 50000), grande('B', 39000, 44000), grande('Caiu', 90, 5500), grande('P1', 500, 200), grande('P2', 300, 200), grande('P3', 110, 100), grande('Parado', 0, 0)]

  it('fica à vista quem pesa 1 % no mês ou pesava no mês anterior; quem caiu muito não some', () => {
    expect([...pessoasAVista(montar(TIME))]).toEqual(['A', 'B', 'Caiu'])
  })
  it('a pessoa aberta nunca fica escondida', () => {
    expect([...pessoasAVista(montar(TIME), 'Parado')]).toEqual(['A', 'B', 'Caiu', 'Parado'])
  })
  it('com menos de 3 de fora, ou sem receita nenhuma, ficam todas', () => {
    expect(pessoasAVista(montar(TIME.slice(0, 5))).size).toBe(5)
    expect(pessoasAVista(montar([grande('X', 0, 0), grande('Y', 0, 0), grande('Z', 0, 0), grande('W', 0, 0)])).size).toBe(4)
  })
})

describe('fraseDoTime', () => {
  it('diz quem traz a maior parte e quem está abaixo do mês anterior', () => {
    expect(fraseDoTime(time(), '2026-11-01', true)).toBe('Lucas responde por 60 % da receita de novembro (R$ 6.000). Abaixo de outubro no mesmo ponto do mês está Artur (−50 %).')
  })
  it('mês fechado não fala em mesmo ponto; sem ninguém abaixo, diz isso', () => {
    const p = time().map(x => ({ ...x, variacao: x.variacao == null ? null : Math.abs(x.variacao) }))
    expect(fraseDoTime(p, '2026-11-01', false)).toBe('Lucas responde por 60 % da receita de novembro (R$ 6.000). Ninguém está abaixo de outubro.')
  })
  it('com vários abaixo, conta quantos e cita os dois que mais caíram, com o código legível', () => {
    const p = montarPessoas({
      resumo: [resumo('LUCAS GOMES NOLETO LOPES', { receita: 15000 }), resumo('ZEVE INVESTIMENTOS 5', { receita: 2000 }), resumo('ZEVE INVESTIMENTOS 2', { receita: 4000 }), resumo('ZEVE INVESTIMENTOS 22', { receita: 4 })],
      mensal: [mes('LUCAS GOMES NOLETO LOPES', '2026-10-01', 40000), mes('ZEVE INVESTIMENTOS 5', '2026-10-01', 20000), mes('ZEVE INVESTIMENTOS 2', '2026-10-01', 16000), mes('ZEVE INVESTIMENTOS 22', '2026-10-01', 100)],
      clientes: [], meses: MESES, mesRef: '2026-11-01', fracaoMesmoPonto: 0.5,
    })
    // o código com R$ 100 no mês anterior (menos de 3 % da base) caiu 92 %, mas não entra na frase
    expect(fraseDoTime(p, '2026-11-01', true)).toBe('Lucas Gomes Noleto Lopes responde por 71 % da receita de novembro (R$ 15 mil). 3 de 3 estão abaixo de outubro no mesmo ponto do mês; os que mais caíram são Zeve Investimentos 5 (−80 %) e Zeve Investimentos 2 (−50 %).')
  })
  it('sem receita no mês e com uma pessoa só', () => {
    expect(fraseDoTime([], '2026-11-01', true)).toBe('Ainda não há receita lançada em novembro.')
    const p = montarPessoas({ resumo: [resumo('Lucas', { receita: 884 })], mensal: [], clientes: [], meses: MESES, mesRef: '2026-09-01', fracaoMesmoPonto: null })
    expect(fraseDoTime(p, '2026-09-01', false)).toBe('Toda a receita de setembro (R$ 884) vem de Lucas.')
  })
})

describe('nomeDeFrase', () => {
  it('só mexe no que está todo em maiúsculas', () => {
    expect(nomeDeFrase('ZEVE INVESTIMENTOS 5')).toBe('Zeve Investimentos 5')
    expect(nomeDeFrase('ARTUR AILTON FONSECA MARANHÃO')).toBe('Artur Ailton Fonseca Maranhão')
    expect(nomeDeFrase('Lucas')).toBe('Lucas')
  })
})

describe('evolucaoDoTime e seriesDaEvolucao', () => {
  const mensal = [mes('A', '2026-10-01', 100, 900), mes('A', '2026-11-01', 50, 100), mes('B', '2026-11-01', 400, 200), mes('C', '2026-09-01', 30, 5000), mes('D', '2026-09-01', 0, 0)]
  it('uma linha por pessoa com dado na janela, da maior para a menor receita', () => {
    const ev = evolucaoDoTime(mensal, MESES, ['A', 'B', 'C', 'D'])
    expect(ev.pessoas.map(p => [p.chave, p.nome, p.receita])).toEqual([['p0', 'B', [0, 0, 400]], ['p1', 'A', [0, 100, 50]], ['p2', 'C', [30, 0, 0]]])
  })
  it('as maiores pela medida escolhida viram séries; o resto soma em Outros', () => {
    const ev = evolucaoDoTime(mensal, MESES)
    const r = seriesDaEvolucao(ev, 'receita', 2)
    expect(r.series).toEqual([{ key: 'p0', nome: 'B' }, { key: 'p1', nome: 'A' }, { key: 'outros', nome: 'Outros (1)' }])
    expect(r.valores).toEqual([{ p0: 0, p1: 0, outros: 30 }, { p0: 0, p1: 100, outros: 0 }, { p0: 400, p1: 50, outros: 0 }])
    // por lotes a ordem muda: C (5.000) e A (1.000) na frente, B em Outros
    expect(seriesDaEvolucao(ev, 'lotes', 2).series.map(s => s.nome)).toEqual(['C', 'A', 'Outros (1)'])
    expect(seriesDaEvolucao(ev, 'receita', 6).series.map(s => s.key)).toEqual(['p0', 'p1', 'p2'])
  })
})
