import { describe, expect, it } from 'vitest'
import { corrigirMojibake, normalizarBarra, normalizarNome, pareceNomeDePlataforma, semAcento } from './texto'

describe('corrigirMojibake', () => {
  it('desfaz UTF-8 lido como Mac Roman', () => {
    expect(corrigirMojibake('MARANH√ÉO')).toBe('MARANHÃO')
    expect(corrigirMojibake('JOS√â')).toBe('JOSÉ')
  })
  it('desfaz UTF-8 lido como Latin-1', () => {
    expect(corrigirMojibake('MARANHÃO')).toBe('MARANHÃO')
    expect(corrigirMojibake('SÃ£o Paulo')).toBe('São Paulo')
  })
  it('não mexe em texto correto', () => {
    expect(corrigirMojibake('MARANHÃO')).toBe('MARANHÃO')
    expect(corrigirMojibake('ZEVE INVESTIMENTOS 1')).toBe('ZEVE INVESTIMENTOS 1')
  })
})

describe('normalizarBarra', () => {
  it('maiúsculas, sem acento, espaços colapsados', () => {
    expect(normalizarBarra('  zeve  investimentos 1 ')).toBe('ZEVE INVESTIMENTOS 1')
    expect(normalizarBarra('José Ação')).toBe('JOSE ACAO')
  })
  it('remove sujeira de codificação', () => {
    expect(normalizarBarra('ARTUR AILTON FONSECA MARANH√ÉO')).toBe('ARTUR AILTON FONSECA MARANHAO')
  })
  it('vazio e nulo viram string vazia', () => {
    expect(normalizarBarra('')).toBe('')
    expect(normalizarBarra(null)).toBe('')
    expect(normalizarBarra(undefined)).toBe('')
  })
})

describe('normalizarNome / semAcento', () => {
  it('mantém maiúsculas e minúsculas, só limpa espaços e codificação', () => {
    expect(normalizarNome('  Fulano   de  Tal ')).toBe('Fulano de Tal')
    expect(semAcento('Ação Órfã')).toBe('Acao Orfa')
  })
})

describe('pareceNomeDePlataforma', () => {
  it('reconhece plataformas com e sem sublinhado', () => {
    expect(pareceNomeDePlataforma('Nelogica')).toBe(true)
    expect(pareceNomeDePlataforma('NELOGICA DT')).toBe(true)
    expect(pareceNomeDePlataforma('metatrader')).toBe(true)
    expect(pareceNomeDePlataforma('PROFIT PRO')).toBe(true)
  })
  it('não confunde barra com plataforma', () => {
    expect(pareceNomeDePlataforma('ZEVE INVESTIMENTOS 1')).toBe(false)
    expect(pareceNomeDePlataforma('')).toBe(false)
  })
})
