import { describe, expect, it } from 'vitest'
import { MOMENTOS, MOMENTO_EXPLICA, MOMENTO_GRUPO, MOMENTO_RESUMO, contarPorMomento, dicaDoMomento, momentoDoCliente, rotuloMomento, somarPorMomento, tomDoMomento, type ClienteDoMomento } from './momentoCliente'

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
  it('começo do mês: quem ainda não girou nele, mas girou nos 3 meses anteriores e não entrou em risco, segue operando', () => {
    expect(momentoDoCliente(c({ situacao: 'Inativo', meses_sem_giro: 1, lotes_media_3m: 800 }))).toBe('operando')
    expect(rotuloMomento(c({ situacao: 'Inativo', meses_sem_giro: 1, lotes_media_3m: 800 }))).toBe('Operando')
    // sem giro nos 3 meses anteriores (ou sem a média informada): inativo de verdade
    expect(momentoDoCliente(c({ situacao: 'Inativo', meses_sem_giro: 5, lotes_media_3m: 0 }))).toBe('inativo')
    expect(momentoDoCliente(c({ situacao: 'Inativo', meses_sem_giro: 5 }))).toBe('inativo')
    // quando passa o prazo, o banco marca "parou" e o risco vem na frente
    expect(momentoDoCliente(c({ situacao: 'Inativo', risco: 'parou', dias_sem_giro: 12, lotes_media_3m: 800 }))).toBe('risco')
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

describe('a base por grupo', () => {
  const base = [
    c(), c(), c({ risco: 'em queda' }),                                              // 3 ativos: 2 operando, 1 em queda
    c({ situacao: 'Inativo', risco: 'parou', dias_sem_giro: 15 }), c({ situacao: 'Inativo' }),   // 2 inativos: 1 parou há pouco
    c({ situacao: 'Nunca girou' }), c({ situacao: 'Em processamento' }),
  ]
  it('conta cada cliente em um grupo só; os grupos somam a base', () => {
    const n = contarPorMomento(base)
    expect(n).toEqual({ total: 7, por: { operando: 2, risco: 2, inativo: 1, nunca: 1, abertura: 1, recusou: 0 }, pararam: 1, emQueda: 1, giraram: 3 })
    expect(Object.values(n.por).reduce((s, x) => s + x, 0)).toBe(n.total)
    expect(contarPorMomento([])).toEqual({ total: 0, por: { operando: 0, risco: 0, inativo: 0, nunca: 0, abertura: 0, recusou: 0 }, pararam: 0, emQueda: 0, giraram: 0 })
  })
  it('soma lotes e receita por grupo, só dos grupos que têm alguém, na ordem da tela', () => {
    const com = (p: Partial<ClienteDoMomento>, lotes: number, receita: number, mes: number) => ({ ...c(p), lotes_12m: lotes, receita_12m: receita, receita_mes: mes })
    const soma = somarPorMomento([
      com({ situacao: 'Nunca girou' }, 0, 0, 0), com({}, 100, 30, 5), com({ risco: 'parou' }, 50, 12, 0), com({}, 200, 60, 10), com({ situacao: 'Inativo', risco: 'parou' }, 10, 3, 0),
    ])
    expect(soma).toEqual([
      { momento: 'operando', clientes: 2, lotes12m: 300, receita12m: 90, receitaMes: 15 },
      { momento: 'risco', clientes: 2, lotes12m: 60, receita12m: 15, receitaMes: 0 },
      { momento: 'nunca', clientes: 1, lotes12m: 0, receita12m: 0, receitaMes: 0 },
    ])
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
