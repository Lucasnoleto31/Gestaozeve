import { describe, expect, it } from 'vitest'
import {
  conhecidoAte, diasDoCalendario, diasEmDestaque, doMes, melhorEPiorDia, pregoesDepois, pregoesParado, primeiroDiaOperado, quemAtivou, quemParou, rankingDeGanhos, rotuloAtivado,
  semanasDoMes, tipoDeQuemOperou,
} from './calendario'

describe('semanasDoMes', () => {
  it('novembro de 2026 começa num domingo e tem cinco semanas', () => {
    const s = semanasDoMes('2026-11-01')
    expect(s).toHaveLength(5)
    expect(s[0]).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'])
    expect(s[4]).toEqual(['2026-11-29', '2026-11-30', null, null, null, null, null])
  })

  it('outubro de 2026 começa numa quinta: os dias de antes ficam vazios', () => {
    const s = semanasDoMes('2026-10-01')
    expect(s[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03'])
    expect(s.at(-1)).toEqual(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'])
    expect(s.flat().filter(Boolean)).toHaveLength(31)
  })
})

describe('pregoesDepois e quemParou', () => {
  const pregoes = ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16']
  const c = (id: string, ultimo: string | null) => ({ cliente_id: id, nome: `Cliente ${id}`, ultimo_giro: ultimo, responsavel: null, lotes_12m: 10 })

  it('conta só os dias com lote depois do último giro (fim de semana não entra)', () => {
    expect(pregoesDepois('2026-11-13', pregoes)).toBe(1)
    expect(pregoesDepois('2026-11-11', pregoes)).toBe(3)
    expect(pregoesDepois('2026-11-16', pregoes)).toBe(0)
  })

  it('quem operou no último pregão não parou; com mínimo 1, entra quem pulou um pregão', () => {
    const r = quemParou([c('a', '2026-11-16'), c('b', '2026-11-13'), c('c', '2026-11-11'), c('d', null), c('e', '2026-10-20')], 'BTG', pregoes, '2026-11-01', 1)
    expect(r.map(x => [x.cliente_id, x.dia, x.pregoes])).toEqual([['b', '2026-11-13', 1], ['c', '2026-11-11', 3]])
    expect(r[0].corretora).toBe('BTG')
  })

  it('com mínimo 3, só quem está há três pregões ou mais sem operar', () => {
    const r = quemParou([c('b', '2026-11-13'), c('c', '2026-11-11')], 'GENIAL', pregoes, '2026-11-01', 3)
    expect(r.map(x => x.cliente_id)).toEqual(['c'])
  })
})

describe('diasDoCalendario', () => {
  it('um item por dia do mês, com as quatro contagens', () => {
    const d = diasDoCalendario('2026-11-01', [{ dia: '2026-11-03' }, { dia: '2026-11-03' }], [{ dia: '2026-11-06' }], [{ dia: '2026-11-13' }, { dia: '2026-11-13' }, { dia: '2026-11-13' }], [{ dia: '2026-11-03' }])
    expect(d).toHaveLength(30)
    expect(d[2]).toEqual({ dia: '2026-11-03', ganhos: 2, perdidos: 0, ativados: 1, pararam: 0 })
    expect(d[5]).toEqual({ dia: '2026-11-06', ganhos: 0, perdidos: 1, ativados: 0, pararam: 0 })
    expect(d[12]).toEqual({ dia: '2026-11-13', ganhos: 0, perdidos: 0, ativados: 0, pararam: 3 })
  })
  it('sem os ativados informados, a contagem deles fica em zero', () => {
    expect(diasDoCalendario('2026-11-01', [], [], [])[0]).toEqual({ dia: '2026-11-01', ganhos: 0, perdidos: 0, ativados: 0, pararam: 0 })
  })
})

describe('doMes e pregoesParado', () => {
  it('filtra pelo mês', () => {
    expect(doMes([{ dia: '2026-10-31' }, { dia: '2026-11-01' }, { dia: '2026-11-30' }], '2026-11-01')).toEqual([{ dia: '2026-11-01' }, { dia: '2026-11-30' }])
  })

  it('aceita 1, 3 ou 5 pregões; o resto vira 1', () => {
    expect(pregoesParado('3')).toBe(3)
    expect(pregoesParado('5')).toBe(5)
    expect(pregoesParado('2')).toBe(1)
    expect(pregoesParado(null)).toBe(1)
  })
})

describe('ativados no dia', () => {
  const NOV = '2026-11-01'
  it('classifica quem operou no mês como o resultado do mês no banco', () => {
    // conta que migrou neste mês e nunca tinha operado
    expect(tipoDeQuemOperou(NOV, null, '2026-11-03')).toBe('novo')
    // nunca tinha operado e a conta migrou antes (menos de 4 meses)
    expect(tipoDeQuemOperou(NOV, null, '2026-10-26')).toBe('ativado')
    expect(tipoDeQuemOperou(NOV, null, null)).toBe('ativado')
    // voltou depois de 4 meses ou mais sem girar
    expect(tipoDeQuemOperou(NOV, '2026-06-19', '2021-10-02')).toBe('reativado')
    expect(tipoDeQuemOperou(NOV, '2026-07-31', null)).toBe('reativado')
    // conta antiga que nunca tinha operado conta como reativada, como no banco
    expect(tipoDeQuemOperou(NOV, null, '2022-06-28')).toBe('reativado')
    expect(tipoDeQuemOperou(NOV, null, '2026-07-10')).toBe('reativado')
    // girou há menos de 4 meses: já é da carteira
    expect(tipoDeQuemOperou(NOV, '2026-08-01', '2021-10-02')).toBe('carteira')
    expect(tipoDeQuemOperou(NOV, '2026-10-30', '2026-10-01')).toBe('carteira')
  })
  it('o número de meses sem girar pode ser outro', () => {
    expect(tipoDeQuemOperou(NOV, '2026-08-20', null, 3)).toBe('reativado')
    expect(tipoDeQuemOperou(NOV, '2026-08-20', null, 4)).toBe('carteira')
  })
  it('só entra quem operou no mês e não é carteira', () => {
    const c = (id: string, lotes: number, migrou: string | null) => ({ cliente_id: id, nome: `Cliente ${id}`, lotes_mes: lotes, data_migracao: migrou, responsavel: 'Aikon', telefone: '62999990000' })
    const antes = new Map<string, string | null>([['a', null], ['b', '2026-10-20'], ['c', '2026-05-29'], ['d', null]])
    const r = quemAtivou([c('a', 50, '2026-11-03'), c('b', 900, '2025-01-10'), c('c', 12, '2020-05-25'), c('d', 0, '2026-11-05'), c('e', 7, '2026-10-28')], antes, 'GENIAL', NOV)
    expect(r.map(x => [x.cliente_id, x.tipo, x.ultimo_giro])).toEqual([['a', 'novo', null], ['c', 'reativado', '2026-05-29'], ['e', 'ativado', null]])
    expect(r[0]).toMatchObject({ corretora: 'GENIAL', responsavel: 'Aikon', telefone: '62999990000', lotes_mes: 50 })
  })
  it('o dia é o da primeira operação de verdade: zeragem, posição e ação não contam', () => {
    const l = (cliente_id: string | null, data: string, x: Partial<{ qtd: number; zeragem: boolean; posicao: boolean; acoes: boolean }> = {}) => ({ cliente_id, data, qtd: 10, zeragem: false, posicao: false, acoes: false, ...x })
    const dias = primeiroDiaOperado([l('a', '2026-11-09'), l('a', '2026-11-04'), l('b', '2026-11-03', { zeragem: true }), l('b', '2026-11-05'), l('c', '2026-11-06', { acoes: true }), l('d', '2026-11-06', { qtd: 0 }), l(null, '2026-11-02')])
    expect([...dias.entries()].sort()).toEqual([['a', '2026-11-04'], ['b', '2026-11-05']])
  })
  it('diz em poucas palavras o que aconteceu com cada um', () => {
    expect(rotuloAtivado({ tipo: 'reativado', ultimo_giro: '2026-06-19', data_migracao: '2021-10-02' })).toEqual({ titulo: 'Voltou a operar', detalhe: 'último giro em 19/06/26' })
    expect(rotuloAtivado({ tipo: 'novo', ultimo_giro: null, data_migracao: '2026-11-03' })).toEqual({ titulo: 'Conta nova operou', detalhe: 'conta de 03/11/26' })
    expect(rotuloAtivado({ tipo: 'ativado', ultimo_giro: null, data_migracao: '2026-10-26' })).toEqual({ titulo: 'Primeira operação', detalhe: 'conta de 26/10/26' })
    expect(rotuloAtivado({ tipo: 'reativado', ultimo_giro: null, data_migracao: '2022-06-28' })).toEqual({ titulo: 'Primeira operação', detalhe: 'conta de 28/06/22, nunca tinha operado' })
    expect(rotuloAtivado({ tipo: 'ativado', ultimo_giro: null, data_migracao: null }).detalhe).toBe('sem data de migração')
  })
})

describe('ranking de ganhos', () => {
  it('conta por responsável, do maior para o menor, com os sem responsável por último', () => {
    const g = (responsavel: string | null) => ({ responsavel })
    expect(rankingDeGanhos([g('Artur'), g(null), g('Aikon'), g('Artur'), g(' '), g(null), g('Lucas'), g('Artur'), g('Aikon')])).toEqual([
      { nome: 'Artur', ganhos: 3 }, { nome: 'Aikon', ganhos: 2 }, { nome: 'Lucas', ganhos: 1 }, { nome: 'Sem responsável', ganhos: 3 },
    ])
    expect(rankingDeGanhos([])).toEqual([])
  })
  it('empate fica em ordem de nome', () => {
    expect(rankingDeGanhos([{ responsavel: 'Milena' }, { responsavel: 'Aikon' }]).map(x => x.nome)).toEqual(['Aikon', 'Milena'])
  })
})

describe('melhor e pior dia', () => {
  const d = (dia: number, ganhos: number, perdidos: number) => ({ dia: `2026-11-${String(dia).padStart(2, '0')}`, ganhos, perdidos, ativados: 0, pararam: 0 })
  // os dias de novembro de 2026 da tela do Lucas
  const dias = [d(1, 1, 2), d(3, 10, 4), d(4, 2, 1), d(5, 5, 4), d(6, 3, 13), d(7, 1, 2), d(8, 0, 2), d(9, 4, 2), d(10, 6, 7), d(11, 1, 3), d(12, 0, 9), d(13, 0, 1), d(16, 16, 8), d(17, 8, 4), d(22, 0, 1)]
  it('melhor é o dia com mais ganhos; pior é o dia em que os perdidos mais passaram dos ganhos', () => {
    const r = melhorEPiorDia(dias, '2026-11-17')
    expect(r.melhor?.dia).toBe('2026-11-16')
    expect(r.pior?.dia).toBe('2026-11-06')
  })
  it('dia que ainda não chegou não entra', () => {
    expect(melhorEPiorDia([d(3, 2, 1), d(22, 30, 0), d(25, 0, 40)], '2026-11-17')).toEqual({ melhor: d(3, 2, 1), pior: null })
  })
  it('lista os três melhores e os três mais difíceis, em ordem', () => {
    const r = diasEmDestaque(dias, '2026-11-17')
    expect(r.melhores.map(x => x.dia.slice(8))).toEqual(['16', '03', '17'])
    // 8/11 e 11/11 empatam no saldo (2 a menos): vem antes o de mais perdidos
    expect(r.dificeis.map(x => x.dia.slice(8))).toEqual(['06', '12', '11'])
    expect(diasEmDestaque(dias, '2026-11-17', 1).melhores).toHaveLength(1)
  })
  it('no empate de ganhos vale o melhor saldo; sem ganho nem perda, nada', () => {
    expect(melhorEPiorDia([d(3, 5, 4), d(4, 5, 1)], '2026-11-17').melhor?.dia).toBe('2026-11-04')
    expect(melhorEPiorDia([d(3, 0, 0)], '2026-11-17')).toEqual({ melhor: null, pior: null })
  })
})

describe('conhecidoAte', () => {
  const pregoes = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16']
  it('é o último pregão que já tem o mínimo de pregões depois dele', () => {
    expect(conhecidoAte(pregoes, 1)).toBe('2026-11-13')
    expect(conhecidoAte(pregoes, 3)).toBe('2026-11-11')
    expect(conhecidoAte(pregoes, 5)).toBe('2026-11-09')
  })
  it('sem pregões suficientes ainda não dá para saber', () => {
    expect(conhecidoAte(['2026-11-03'], 1)).toBeNull()
    expect(conhecidoAte([], 1)).toBeNull()
  })
})
