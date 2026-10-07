import { describe, expect, it } from 'vitest'
import { compactar, expandir } from './compacto'

describe('lista compacta (servidor → navegador)', () => {
  const rows = [
    { id: 'a', nome: 'Ana', lotes: 10, alertas: ['sem CPF/CNPJ'], extra: 'não vai' },
    { id: 'b', nome: 'Bia', lotes: 0, alertas: [], extra: 'não vai' },
  ]
  it('leva só as colunas pedidas e volta aos mesmos objetos', () => {
    const c = compactar(rows, ['id', 'nome', 'lotes', 'alertas'])
    expect(c.colunas).toEqual(['id', 'nome', 'lotes', 'alertas'])
    expect(c.linhas).toEqual([['a', 'Ana', 10, ['sem CPF/CNPJ']], ['b', 'Bia', 0, []]])
    expect(expandir(c)).toEqual([
      { id: 'a', nome: 'Ana', lotes: 10, alertas: ['sem CPF/CNPJ'] },
      { id: 'b', nome: 'Bia', lotes: 0, alertas: [] },
    ])
  })
  it('é bem menor que os objetos quando há muitas linhas', () => {
    const muitos = Array.from({ length: 1000 }, (_, i) => ({ cliente_id: `id-${i}`, nome: `Cliente ${i}`, lotes_12m: i, receita_12m: i * 2.5, responsavel: null }))
    const bruto = JSON.stringify(muitos).length
    const compacto = JSON.stringify(compactar(muitos, ['cliente_id', 'nome', 'lotes_12m', 'receita_12m', 'responsavel'])).length
    expect(compacto).toBeLessThan(bruto * 0.5)
  })
  it('lista vazia', () => {
    expect(expandir(compactar([] as { x: number }[], ['x']))).toEqual([])
  })
})
