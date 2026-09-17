import { describe, expect, it } from 'vitest'
import { lerPlanilha, parseBrazilianNumber, parseExcelDate, sugerirCorretora } from './parse'

describe('parseBrazilianNumber', () => {
  it('aceita número puro', () => {
    expect(parseBrazilianNumber(1234)).toBe(1234)
    expect(parseBrazilianNumber(0)).toBe(0)
  })
  it('lê formato brasileiro e americano', () => {
    expect(parseBrazilianNumber('1.234,56')).toBe(1234.56)
    expect(parseBrazilianNumber('1,234.56')).toBe(1234.56)
    expect(parseBrazilianNumber('12,5')).toBe(12.5)
  })
  it('trata ponto como milhar só em grupos de três', () => {
    expect(parseBrazilianNumber('1.234')).toBe(1234)
    expect(parseBrazilianNumber('1.234.567')).toBe(1234567)
    expect(parseBrazilianNumber('10.5')).toBe(10.5)
  })
  it('ignora R$, espaços e vazios', () => {
    expect(parseBrazilianNumber('R$ 12,50')).toBe(12.5)
    expect(parseBrazilianNumber(' 1 000 ')).toBe(1000)
    expect(parseBrazilianNumber('')).toBe(0)
    expect(parseBrazilianNumber(null)).toBe(0)
    expect(parseBrazilianNumber('abc')).toBe(0)
  })
})

describe('parseExcelDate', () => {
  it('converte serial do Excel (descartando a hora)', () => {
    expect(parseExcelDate(45000)).toBe('2023-03-15')
    expect(parseExcelDate(45000.75)).toBe('2023-03-15')
  })
  it('lê dd/mm/yyyy com ou sem hora', () => {
    expect(parseExcelDate('17/09/2026')).toBe('2026-09-17')
    expect(parseExcelDate('5/1/2026 10:30')).toBe('2026-01-05')
  })
  it('lê ISO com ou sem hora', () => {
    expect(parseExcelDate('2026-09-17')).toBe('2026-09-17')
    expect(parseExcelDate('2026-09-17T00:00:00')).toBe('2026-09-17')
  })
  it('devolve vazio para o que não é data', () => {
    expect(parseExcelDate('')).toBe('')
    expect(parseExcelDate('ontem')).toBe('')
    expect(parseExcelDate(null)).toBe('')
  })
})

describe('sugerirCorretora', () => {
  it('reconhece pelo nome do arquivo', () => {
    expect(sugerirCorretora('Lotes_GENIAL_setembro.xlsx')).toBe('GENIAL')
    expect(sugerirCorretora('btg-2026-09.xlsx')).toBe('BTG')
    expect(sugerirCorretora('lotes xp setembro.xlsx')).toBe('XP')
  })
  it('não confunde xp dentro de outra palavra', () => {
    expect(sugerirCorretora('exportacao.xlsx')).toBeNull()
    expect(sugerirCorretora('relatorio.xlsx')).toBeNull()
  })
})

describe('lerPlanilha', () => {
  const cabecalho = ['Data Pregão', 'Conta', 'CPF', 'Cliente', 'Assessor', 'Ativo', 'Plataforma', 'Lotes Operados', 'Lotes Zerados']

  it('mapeia as variações de cabeçalho e converte números e datas', () => {
    const r = lerPlanilha([
      cabecalho,
      ['17/09/2026', '12345', '123.456.789-00', 'Fulano', 'ZEVE INVESTIMENTOS 1', 'WINV26', 'NELOGICA', '1.250', '12,5'],
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({
      data: '2026-09-17', numero_conta: '12345', cpf: '123.456.789-00', cliente_nome: 'Fulano',
      assessor_nome: 'ZEVE INVESTIMENTOS 1', ativo: 'WINV26', plataforma: 'NELOGICA',
      lotes_operados: 1250, lotes_zerados: 12.5,
    })
  })

  it('ignora linhas vazias e preenche colunas ausentes', () => {
    const r = lerPlanilha([
      ['data', 'lotes operados'],
      [45000, 10],
      [null, null],
      ['', ''],
      ['18/09/2026', '5'],
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]).toMatchObject({ data: '2023-03-15', lotes_operados: 10, lotes_zerados: 0, assessor_nome: '', cliente_nome: '' })
    expect(r.rows[1].data).toBe('2026-09-18')
  })

  it('recusa planilha sem as colunas obrigatórias', () => {
    const r = lerPlanilha([['Cliente', 'Lotes Zerados'], ['Fulano', 1]])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro).toContain('data e de lotes operados')
    expect(r.erro).toContain('cliente')
  })

  it('recusa planilha vazia', () => {
    expect(lerPlanilha([]).ok).toBe(false)
    expect(lerPlanilha([cabecalho]).ok).toBe(false)
  })
})
