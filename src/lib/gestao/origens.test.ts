import { describe, expect, it } from 'vitest'
import { MOTIVOS_PERDA, OUTRO_MOTIVO, motivoNaLista, opcoesDeOrigem, origemNaLista } from './origens'

describe('opcoesDeOrigem', () => {
  const op = opcoesDeOrigem(
    ['Milena', 'Atual Capital', 'Fabio Ferron', 'atual capital', ' '],
    ['hero', 'hero', 'hero', 'hero', 'Instagram', 'Atual Capital', 'Direto', 'direto', 'Direto', null, '', 'TF ROBOS', 'TF ROBOS', 'fabio ferron'],
  )

  it('lista os parceiros uma vez só, em ordem alfabética', () => {
    expect(op.parceiros).toEqual(['Atual Capital', 'Fabio Ferron', 'Milena'])
  })

  it('tira os parceiros das origens e junta as grafias, da mais usada para a menos usada', () => {
    expect(op.origens).toEqual(['hero', 'Direto', 'TF ROBOS', 'Instagram'])
  })

  it('sem nada em uso, só os parceiros', () => {
    expect(opcoesDeOrigem(['Aikon'], [])).toEqual({ parceiros: ['Aikon'], origens: [] })
  })
})

describe('origemNaLista', () => {
  const op = { parceiros: ['Atual Capital', 'Fabio Ferron'], origens: ['hero', 'Direto'] }

  it('acha o parceiro sem acento nem caixa e devolve a grafia do cadastro', () => {
    expect(origemNaLista('atual capital', op)).toEqual({ grupo: 'parceiro', valor: 'Atual Capital' })
    expect(origemNaLista(' FABIO FERRON ', op)).toEqual({ grupo: 'parceiro', valor: 'Fabio Ferron' })
  })

  it('acha a origem em uso', () => {
    expect(origemNaLista('direto', op)).toEqual({ grupo: 'origem', valor: 'Direto' })
  })

  it('texto antigo que não está na lista continua valendo', () => {
    expect(origemNaLista('Fabrício (áudio do treinamento, 10/11)', op)).toEqual({ grupo: 'fora', valor: 'Fabrício (áudio do treinamento, 10/11)' })
  })

  it('vazio', () => {
    expect(origemNaLista(null, op)).toEqual({ grupo: 'vazio', valor: '' })
    expect(origemNaLista('  ', op)).toEqual({ grupo: 'vazio', valor: '' })
  })
})

describe('motivoNaLista', () => {
  it('reconhece o motivo da lista escrito de outro jeito', () => {
    expect(motivoNaLista('sem resposta')).toEqual({ escolha: 'Sem resposta', texto: '' })
    expect(motivoNaLista('Mesa proprietaria')).toEqual({ escolha: 'Mesa proprietária', texto: '' })
    expect(motivoNaLista('NUMERO INCORRETO')).toEqual({ escolha: 'Número incorreto', texto: '' })
  })

  it('o que não está na lista vira Outro com o texto', () => {
    expect(motivoNaLista('Opera em mesa proprietaria')).toEqual({ escolha: OUTRO_MOTIVO, texto: 'Opera em mesa proprietaria' })
  })

  it('vazio fica sem escolha', () => {
    expect(motivoNaLista('')).toEqual({ escolha: '', texto: '' })
    expect(motivoNaLista(null)).toEqual({ escolha: '', texto: '' })
  })

  it('a lista não tem o próprio Outro', () => {
    expect(MOTIVOS_PERDA).not.toContain(OUTRO_MOTIVO)
  })
})
