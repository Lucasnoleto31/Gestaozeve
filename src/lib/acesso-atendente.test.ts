import { describe, expect, it } from 'vitest'
import { mesmaPessoa } from './texto'

// O atendente só vê e mexe nos leads em que é o responsável: a regra é mesmaPessoa(responsável do lead, nome do usuário)
describe('acesso do atendente aos leads', () => {
  const karen = 'Karen Cristina Borges de Oliveira'
  it('o lead é dela quando o responsável é o primeiro nome dela, em qualquer caixa ou acento', () => {
    expect(mesmaPessoa('Karen', karen)).toBe(true)
    expect(mesmaPessoa('KAREN', karen)).toBe(true)
    expect(mesmaPessoa(' karen ', karen)).toBe(true)
  })
  it('lead de outra pessoa, sem responsável ou de nome parecido não é dela', () => {
    expect(mesmaPessoa('Milena', karen)).toBe(false)
    expect(mesmaPessoa('Karina', karen)).toBe(false)
    expect(mesmaPessoa(null, karen)).toBe(false)
    expect(mesmaPessoa('', karen)).toBe(false)
  })
  it('filtrar uma lista deixa só os leads dela', () => {
    const leads = [{ id: 1, responsavel: 'Karen' }, { id: 2, responsavel: 'Milena' }, { id: 3, responsavel: null }, { id: 4, responsavel: 'karen' }]
    expect(leads.filter(l => mesmaPessoa(l.responsavel, karen)).map(l => l.id)).toEqual([1, 4])
  })
})
