import { describe, expect, it } from 'vitest'
import { giraFora, juntarGiroFora, resumirGiroFora, rotuloGiroFora, textoGiroFora, type GiroFora } from './giroFora'

const l = (cliente_id: string, mes_ref: string, lotes: number) => ({ cliente_id, mes_ref, lotes })

describe('resumirGiroFora', () => {
  const linhas = [
    l('ativo', '2026-09-01', 1000), l('ativo', '2026-10-01', 2000), l('ativo', '2026-11-01', 316),
    l('parou', '2026-09-01', 500), l('parou', '2026-10-01', 40),
    l('zero', '2026-11-01', 0),
  ]

  it('soma por cliente e separa os lotes do mês de referência (o mais recente das linhas)', () => {
    const m = resumirGiroFora('GENIAL', linhas)
    expect(m.get('ativo')).toEqual({ corretora: 'GENIAL', mes: '2026-11-01', lotesMes: 316, lotesJanela: 3316, ultimoMes: '2026-11-01' })
    expect(m.get('parou')).toEqual({ corretora: 'GENIAL', mes: '2026-11-01', lotesMes: 0, lotesJanela: 540, ultimoMes: '2026-10-01' })
  })

  it('linha sem lotes não cria cliente nem define o mês de referência', () => {
    const m = resumirGiroFora('GENIAL', linhas)
    expect(m.has('zero')).toBe(false)
    expect(resumirGiroFora('BTG', [l('a', '2026-10-01', 10), l('b', '2026-11-01', 0)]).get('a')).toMatchObject({ mes: '2026-10-01', lotesMes: 10 })
    expect(resumirGiroFora('BTG', []).size).toBe(0)
  })
})

describe('juntarGiroFora', () => {
  const g = (p: Partial<GiroFora>): GiroFora => ({ corretora: 'GENIAL', mes: '2026-11-01', lotesMes: 0, lotesJanela: 0, ultimoMes: '2026-11-01', ...p })

  it('cliente em duas corretoras fica com a que mais gira no mês; no empate, a da janela maior', () => {
    const junto = juntarGiroFora([
      new Map([['a', g({ corretora: 'GENIAL', lotesMes: 100 })], ['b', g({ corretora: 'GENIAL', lotesJanela: 50, ultimoMes: '2026-10-01' })], ['c', g({ corretora: 'GENIAL', lotesMes: 7 })]]),
      new Map([['a', g({ corretora: 'XP', lotesMes: 900 })], ['b', g({ corretora: 'XP', lotesJanela: 20, ultimoMes: '2026-09-01' })]]),
    ])
    expect(junto.get('a')?.corretora).toBe('XP')
    expect(junto.get('b')?.corretora).toBe('GENIAL')
    expect(junto.get('c')?.lotesMes).toBe(7)
    expect(junto.size).toBe(3)
  })
})

describe('textos', () => {
  const ativo: GiroFora = { corretora: 'GENIAL', mes: '2026-11-01', lotesMes: 9316, lotesJanela: 30000, ultimoMes: '2026-11-01' }
  const parou: GiroFora = { corretora: 'BTG', mes: '2026-11-01', lotesMes: 0, lotesJanela: 540, ultimoMes: '2026-10-01' }

  it('gira agora ou girou há pouco', () => {
    expect(giraFora(ativo)).toBe(true)
    expect(giraFora(parou)).toBe(false)
    expect(giraFora(null)).toBe(false)
    expect(textoGiroFora(ativo)).toBe('gira na Genial (9.316 lotes em nov/26)')
    expect(textoGiroFora(parou)).toBe('girou na BTG em out/26')
    expect(rotuloGiroFora(ativo)).toBe('Genial · 9.316')
    expect(rotuloGiroFora(parou)).toBe('BTG · out/26')
  })
})
