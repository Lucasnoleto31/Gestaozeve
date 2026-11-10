import { describe, expect, it } from 'vitest'
import { horaDoNome, linkWhatsApp, mensagemGiro, momentoDaSubida } from './mensagens'

const semNbsp = (s: string) => s.replace(/ /g, ' ')

describe('horaDoNome', () => {
  it('lê a hora que a equipe põe no nome do arquivo', () => {
    expect(horaDoNome('Lotes 05-11-2026 parcial 12h20.xlsx')).toBe('12h20')
    expect(horaDoNome('Lotes 03-11-2026 parcial 14h.xlsx')).toBe('14h')
    expect(horaDoNome('Lotes 04-11-2026 parcial 15H45.xlsx')).toBe('15h45')
    expect(horaDoNome('lotes 13:40.xlsx')).toBe('13h40')
  })
  it('ignora nomes sem hora e horas impossíveis', () => {
    expect(horaDoNome('Lotes 05-11-2026 parcial.xlsx')).toBeNull()
    expect(horaDoNome('Lotes 05-11-2026.xlsx')).toBeNull()
    expect(horaDoNome('parcial 25h10.xlsx')).toBeNull()
    expect(horaDoNome(null)).toBeNull()
  })
})

describe('momentoDaSubida', () => {
  const agora = new Date('2026-11-10T16:02:00-03:00')
  it('usa a hora do nome do arquivo', () => {
    expect(momentoDaSubida('Lotes 10-11-2026 parcial 13h40.xlsx', '2026-11-10', '2026-11-10', agora)).toBe('parcial 13h40')
  })
  it('sem hora no nome, usa a hora da subida', () => {
    expect(momentoDaSubida('Lotes 10-11-2026 parcial.xlsx', '2026-11-10', '2026-11-10', agora)).toBe('parcial, subida às 16:02')
  })
  it('depois do pregão é o dia completo; dia anterior não tem momento', () => {
    expect(momentoDaSubida('Lotes 10-11-2026.xlsx', '2026-11-10', '2026-11-10', new Date('2026-11-10T18:45:00-03:00'))).toBe('dia completo')
    expect(momentoDaSubida('Lotes 09-11-2026.xlsx', '2026-11-09', '2026-11-10', agora)).toBeNull()
  })
})

describe('mensagemGiro', () => {
  const base = {
    corretora: 'BTG', dia: '2026-11-10', momento: 'parcial 13h40', lotes: 1234, zerados: 12, clientes: 57, receita: 2345.4,
    ontem: { dia: '2026-11-09', lotes: 1500, receita: 2900 }, mes: { lotes: 12345, receita: 23456, ate: '2026-11-10' },
  }
  it('monta as linhas do giro, do dia anterior e do mês', () => {
    expect(semNbsp(mensagemGiro(base))).toBe([
      '*Giro BTG · ter 10/11* · parcial 13h40',
      'Lotes: 1.234 (12 zerados) · 57 contas',
      'Receita: R$ 2.345',
      'Ontem (seg 09/11): 1.500 lotes · R$ 2.900',
      'Mês até 10/11: 12.345 lotes · R$ 23.456',
    ].join('\n'))
  })
  it('chama de "último giro" quando o dia anterior com lotes não é a véspera (segunda-feira)', () => {
    const m = mensagemGiro({ ...base, dia: '2026-11-09', ontem: { dia: '2026-11-06', lotes: 900, receita: 1000 } })
    expect(semNbsp(m)).toContain('Último giro (sex 06/11): 900 lotes · R$ 1.000')
  })
  it('sem momento, sem zerados e sem comparações fica só o essencial', () => {
    expect(semNbsp(mensagemGiro({ ...base, momento: null, zerados: 0, clientes: 1, ontem: null, mes: null }))).toBe(
      '*Giro BTG · ter 10/11*\nLotes: 1.234 · 1 conta\nReceita: R$ 2.345',
    )
  })
})

describe('linkWhatsApp', () => {
  it('codifica o texto para o wa.me', () => {
    expect(linkWhatsApp('*Giro*\nR$ 1')).toBe('https://wa.me/?text=*Giro*%0AR%24%201')
  })
})
