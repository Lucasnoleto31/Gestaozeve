import { describe, expect, it } from 'vitest'
import { MOMENTOS, MOMENTO_EXPLICA, MOMENTO_GRUPO, MOMENTO_RESUMO, dicaDoMomento, momentoDoCliente, rotuloMomento, tomDoMomento, type ClienteDoMomento } from './momentoCliente'

const c = (p: Partial<ClienteDoMomento> = {}): ClienteDoMomento => ({ situacao: 'Ativo', risco: null, dias_sem_giro: null, meses_sem_giro: null, ...p })

describe('momentoDoCliente', () => {
  it('cada situação cai em um grupo só', () => {
    expect(momentoDoCliente(c())).toBe('operando')
    expect(momentoDoCliente(c({ situacao: 'Inativo' }))).toBe('inativo')
    expect(momentoDoCliente(c({ situacao: 'Nunca girou' }))).toBe('nunca')
    expect(momentoDoCliente(c({ situacao: 'Em processamento' }))).toBe('abertura')
    expect(momentoDoCliente(c({ situacao: 'Recusou' }))).toBe('recusou')
  })
  it('o risco vem na frente da situação: ativo em queda e inativo que parou há pouco são "em risco"', () => {
    expect(momentoDoCliente(c({ risco: 'em queda' }))).toBe('risco')
    expect(momentoDoCliente(c({ situacao: 'Inativo', risco: 'parou', dias_sem_giro: 15 }))).toBe('risco')
  })
  it('situação que não existe ainda fica com quem não tem conta migrada', () => {
    expect(momentoDoCliente(c({ situacao: 'Em análise' }))).toBe('abertura')
  })
})

describe('rotuloMomento e tomDoMomento', () => {
  it('diz o estado em palavras, com o tempo quando tem', () => {
    expect(rotuloMomento(c())).toBe('Operando')
    expect(rotuloMomento(c({ risco: 'em queda' }))).toBe('Em queda')
    expect(rotuloMomento(c({ situacao: 'Inativo', risco: 'parou', dias_sem_giro: 15 }))).toBe('Parou há 15 dias')
    expect(rotuloMomento(c({ risco: 'parou', dias_sem_giro: 1 }))).toBe('Parou há 1 dia')
    expect(rotuloMomento(c({ risco: 'parou' }))).toBe('Parou')
    expect(rotuloMomento(c({ situacao: 'Inativo', meses_sem_giro: 5 }))).toBe('Inativo há 5 meses')
    expect(rotuloMomento(c({ situacao: 'Inativo', meses_sem_giro: 1 }))).toBe('Inativo há 1 mês')
    expect(rotuloMomento(c({ situacao: 'Inativo' }))).toBe('Inativo')
    expect(rotuloMomento(c({ situacao: 'Nunca girou' }))).toBe('Nunca operou')
    expect(rotuloMomento(c({ situacao: 'Em processamento' }))).toBe('Em abertura')
    expect(rotuloMomento(c({ situacao: 'Recusou' }))).toBe('Recusou')
  })
  it('cor só para quem opera, caiu ou parou', () => {
    expect(tomDoMomento(c())).toBe('gain')
    expect(tomDoMomento(c({ risco: 'em queda' }))).toBe('warn')
    expect(tomDoMomento(c({ risco: 'parou' }))).toBe('loss')
    for (const situacao of ['Inativo', 'Nunca girou', 'Em processamento', 'Recusou']) expect(tomDoMomento(c({ situacao }))).toBe('neutral')
  })
  it('a dica explica o estado; no risco, diz se parou ou caiu', () => {
    expect(dicaDoMomento(c())).toBe(MOMENTO_EXPLICA.operando)
    expect(dicaDoMomento(c({ risco: 'parou' }))).toContain('sem giro há dias')
    expect(dicaDoMomento(c({ risco: 'em queda' }))).toContain('abaixo da média')
  })
})

describe('textos dos grupos', () => {
  it('todo grupo tem nome, resumo e explicação', () => {
    for (const m of MOMENTOS) {
      expect(MOMENTO_GRUPO[m]).toBeTruthy()
      expect(MOMENTO_RESUMO[m]).toBeTruthy()
      expect(MOMENTO_EXPLICA[m].endsWith('.')).toBe(true)
    }
  })
})
