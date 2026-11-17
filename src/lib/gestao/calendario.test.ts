import { describe, expect, it } from 'vitest'
import { diasDoCalendario, doMes, pregoesDepois, pregoesParado, quemParou, semanasDoMes } from './calendario'

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
  it('um item por dia do mês, com as três contagens', () => {
    const d = diasDoCalendario('2026-11-01', [{ dia: '2026-11-03' }, { dia: '2026-11-03' }], [{ dia: '2026-11-06' }], [{ dia: '2026-11-13' }, { dia: '2026-11-13' }, { dia: '2026-11-13' }])
    expect(d).toHaveLength(30)
    expect(d[2]).toEqual({ dia: '2026-11-03', ganhos: 2, perdidos: 0, pararam: 0 })
    expect(d[5]).toEqual({ dia: '2026-11-06', ganhos: 0, perdidos: 1, pararam: 0 })
    expect(d[12]).toEqual({ dia: '2026-11-13', ganhos: 0, perdidos: 0, pararam: 3 })
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
