import { describe, expect, it } from 'vitest'
import { faixasValidas, lerFaixasComissao, valorDaFaixa } from './comissao'

describe('faixas de comissão', () => {
  it('lê o formato mínimo:valor e ordena', () => {
    expect(lerFaixasComissao('10:30;0:20;5:25')).toEqual([{ minimo: 0, valor: 20 }, { minimo: 5, valor: 25 }, { minimo: 10, valor: 30 }])
    expect(lerFaixasComissao('0:80,50')).toEqual([{ minimo: 0, valor: 80.5 }])
    expect(lerFaixasComissao('')).toEqual([])
  })
  it('a faixa alcançada vale para todas as contas do mês', () => {
    const f = lerFaixasComissao('0:20;5:25;10:30;15:35')
    expect(valorDaFaixa(f, 1)).toBe(20)
    expect(valorDaFaixa(f, 5)).toBe(25)
    expect(valorDaFaixa(f, 12)).toBe(30)
    expect(valorDaFaixa(f, 40)).toBe(35)
    expect(valorDaFaixa([], 3)).toBe(0)
  })
  it('valida o texto antes de salvar', () => {
    expect(faixasValidas('0:100;3:120')).toBe(true)
    expect(faixasValidas('0:80')).toBe(true)
    expect(faixasValidas('abc')).toBe(false)
    expect(faixasValidas('0:100;x')).toBe(false)
    expect(faixasValidas('')).toBe(false)
  })
})
