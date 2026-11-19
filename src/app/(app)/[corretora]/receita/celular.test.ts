import { describe, expect, it } from 'vitest'
import { fatiaDoTotal, fraseDosMaiores, notaDoGrafico } from './celular'

describe('fatiaDoTotal', () => {
  it('diz a fatia com uma casa, como a coluna "% do total"', () => {
    expect(fatiaDoTotal(5627, 63119)).toBe('8,9% do total')
    expect(fatiaDoTotal(51982, 63119)).toBe('82,4% do total')
  })
  it('fatia que arredonda para zero não vira 0,0%', () => {
    expect(fatiaDoTotal(3, 63119)).toBe('menos de 0,1%')
    expect(fatiaDoTotal(40, 63119)).toBe('0,1% do total')
  })
  it('sem valor ou sem total não há fatia', () => {
    expect(fatiaDoTotal(0, 63119)).toBeUndefined()
    expect(fatiaDoTotal(100, 0)).toBeUndefined()
  })
})

describe('fraseDosMaiores', () => {
  it('leva para a lista a conclusão do bloco dos 10 maiores', () => {
    expect(fraseDosMaiores(10, 52.4, '2026-11-01')).toBe('Os 10 maiores somam 52% da receita de nov/26.')
  })
  it('fica de fora quando os maiores são todos os que tiveram receita, ou quando é um só', () => {
    expect(fraseDosMaiores(4, 100, '2026-11-01')).toBeNull()
    expect(fraseDosMaiores(1, 100, '2026-11-01')).toBeNull()
    expect(fraseDosMaiores(0, 0, '2026-11-01')).toBeNull()
  })
})

describe('notaDoGrafico', () => {
  it('mês em andamento com incentivo: as duas coisas', () => {
    expect(notaDoGrafico({ incentivo: true, parcial: true, mesRef: '2026-11-01', ultimaData: '2026-11-17' }))
      .toBe('Cada barra soma a receita e o incentivo. A barra de nov/26 vai só até 17/11.')
  })
  it('sem incentivo (BTG) fica só o aviso do mês em andamento', () => {
    expect(notaDoGrafico({ incentivo: false, parcial: true, mesRef: '2026-11-01', ultimaData: '2026-11-17' })).toBe('A barra de nov/26 vai só até 17/11.')
  })
  it('mês fechado: só o incentivo, ou nada', () => {
    expect(notaDoGrafico({ incentivo: true, parcial: false, mesRef: '2026-10-01', ultimaData: '2026-11-17' })).toBe('Cada barra soma a receita e o incentivo.')
    expect(notaDoGrafico({ incentivo: false, parcial: false, mesRef: '2026-10-01', ultimaData: '2026-11-17' })).toBeNull()
  })
  it('último dia lançado fora do mês não vira aviso', () => {
    expect(notaDoGrafico({ incentivo: false, parcial: true, mesRef: '2026-11-01', ultimaData: '2026-10-30' })).toBeNull()
  })
})
