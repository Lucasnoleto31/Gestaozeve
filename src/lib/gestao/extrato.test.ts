import { describe, expect, it } from 'vitest'
import { linhasPlanilha, nomeArquivoExtrato, totaisExtrato } from './extrato'
import type { ExtratoParceiroRow } from './tipos'

const linha = (p: Partial<ExtratoParceiroRow>): ExtratoParceiroRow => ({
  cliente_id: 'c1', nome: 'Cliente Um', corretora: 'BTG', conta: '123', status: 'Migrado', origem: 'lead', assessor_nome: null,
  data_abertura: '2026-09-10', lotes_mes: 0, zerados_mes: 0, receita_mes: 0, lotes_12m: 0, receita_12m: 0, ultimo_mes_giro: null, ...p,
})
const carteira = [
  linha({ lotes_mes: 120, zerados_mes: 3, receita_mes: 45.5, lotes_12m: 900, receita_12m: 300.25, ultimo_mes_giro: '2026-10-01' }),
  linha({ cliente_id: 'c2', nome: 'Cliente Dois', corretora: 'GENIAL', conta: null, status: 'Em processamento', data_abertura: null }),
]

describe('totaisExtrato', () => {
  it('soma lotes e receita e conta quem girou', () => {
    expect(totaisExtrato(carteira)).toEqual({ contas: 2, giraram: 1, lotes_mes: 120, zerados_mes: 3, receita_mes: 45.5, lotes_12m: 900, receita_12m: 300.25 })
  })
})

describe('linhasPlanilha', () => {
  it('monta cabeçalho, uma linha por conta e o total, com receita', () => {
    const m = linhasPlanilha(carteira, true)
    expect(m).toHaveLength(4)
    expect(m[0]).toEqual(['Cliente', 'Corretora', 'Conta', 'Situação', 'Abertura', 'Lotes no mês', 'Zerados no mês', 'Receita bruta no mês (R$)', 'Lotes em 12 meses', 'Receita bruta em 12 meses (R$)', 'Último mês com giro'])
    expect(m[1]).toEqual(['Cliente Um', 'BTG', '123', 'Migrado', '10/09/2026', 120, 3, 45.5, 900, 300.25, 'Out/2026'])
    expect(m[2]).toEqual(['Cliente Dois', 'Genial', null, 'Em processamento', null, 0, 0, 0, 0, 0, null])
    expect(m[3][0]).toBe('Total · 2 contas · 1 giraram no mês')
    expect(m[3].slice(5)).toEqual([120, 3, 45.5, 900, 300.25, null])
  })
  it('sem receita tira as duas colunas', () => {
    const m = linhasPlanilha(carteira, false)
    expect(m[0]).toHaveLength(9)
    expect(m[0]).not.toContain('Receita bruta no mês (R$)')
    expect(m[1]).toEqual(['Cliente Um', 'BTG', '123', 'Migrado', '10/09/2026', 120, 3, 900, 'Out/2026'])
  })
})

describe('nomeArquivoExtrato', () => {
  it('usa o parceiro, a corretora e o mês', () => {
    expect(nomeArquivoExtrato('Aikon', '2026-10-01')).toBe('extrato-aikon-2026-10.xlsx')
    expect(nomeArquivoExtrato('João Vítor', '2026-10-01', 'BTG')).toBe('extrato-joao-vitor-btg-2026-10.xlsx')
  })
})
