import { describe, expect, it } from 'vitest'
import { deltaPct, fmtBRL, fmtDataPt, fmtDelta, fmtNum, labelMesAno, labelMesCurto, labelMesLongo, nomeCurto } from './format'

describe('variações', () => {
  it('deltaPct compara com o anterior', () => {
    expect(deltaPct(120, 100)).toBe(20)
    expect(deltaPct(80, 100)).toBe(-20)
    expect(deltaPct(0, 0)).toBe(0)
  })
  it('deltaPct sem base devolve null', () => {
    expect(deltaPct(10, 0)).toBeNull()
    expect(deltaPct(10, null)).toBeNull()
    expect(deltaPct(10, undefined)).toBeNull()
  })
  it('fmtDelta usa sinal e vírgula', () => {
    expect(fmtDelta(12.34)).toBe('+12,3%')
    expect(fmtDelta(-4)).toBe('−4,0%')
    expect(fmtDelta(0)).toBe('0,0%')
  })
})

describe('números e datas', () => {
  it('formata em pt-BR', () => {
    expect(fmtNum(1234567.8).replace(/ /g, ' ')).toBe('1.234.568')
    expect(fmtBRL(1500).replace(/ /g, ' ')).toBe('R$ 1.500')
  })
  it('datas ISO viram dd/mm/aaaa sem drift de fuso', () => {
    expect(fmtDataPt('2026-09-17')).toBe('17/09/2026')
    expect(fmtDataPt('2026-01-01')).toBe('01/01/2026')
    expect(fmtDataPt(null)).toBe('—')
  })
  it('rótulos de mês', () => {
    expect(labelMesAno('2026-09-01')).toBe('Set/2026')
    expect(labelMesCurto('2026-09-01')).toBe('set/26')
    expect(labelMesLongo('2026-09-01')).toBe('setembro de 2026')
  })
  it('nomeCurto encurta a barra', () => {
    expect(nomeCurto('ZEVE INVESTIMENTOS 12')).toBe('ZEVE 12')
    expect(nomeCurto('UM NOME MUITO COMPRIDO DE BARRA', 10)).toBe('UM NOME M…')
  })
})
