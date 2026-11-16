import { describe, expect, it } from 'vitest'
import { abasDeStatus, fraseDosLeads, resumoDosLeads, ultimoContatoTexto, visaoLeads } from './leadsTela'
import type { StatusLead } from './tipos'

const STATUS: StatusLead[] = [
  { status: 'Ganho', tipo: 'Fechado', ordem: 3 }, { status: 'Novo', tipo: 'Aberto', ordem: 1 }, { status: 'Perdido', tipo: 'Fechado', ordem: 4 },
  { status: 'Em contato', tipo: 'Aberto', ordem: 2 }, { status: 'No grupo', tipo: 'Aberto', ordem: 5 },
]
const lead = (x: Partial<Parameters<typeof resumoDosLeads>[0][number]> = {}) => ({
  status: 'Em contato', tipo_status: 'Aberto' as const, alerta: false, contatos: 1, ultimo_contato: '2026-11-10', data_hora: '2026-11-01T12:00:00-03:00', data_fechamento: null, dias: 6, ...x,
})

describe('abasDeStatus', () => {
  it('as etapas em aberto vêm primeiro, na ordem de Parâmetros; depois as fechadas', () => {
    const abas = abasDeStatus(STATUS, [{ status: 'Novo', alerta: true }, { status: 'Novo', alerta: false }, { status: 'Ganho', alerta: false }])
    expect(abas.map(a => a.status)).toEqual(['Novo', 'Em contato', 'No grupo', 'Ganho', 'Perdido'])
    expect(abas.map(a => [a.leads, a.comAlerta])).toEqual([[2, 1], [0, 0], [0, 0], [1, 0], [0, 0]])
    expect(abas.map(a => a.aberto)).toEqual([true, true, true, false, false])
  })
  it('etapa que só existe nos leads (saiu de Parâmetros) continua com aba', () => {
    expect(abasDeStatus(STATUS, [{ status: 'Aguardando', alerta: false }]).map(a => a.status)).toContain('Aguardando')
  })
})

describe('ultimoContatoTexto', () => {
  it('hoje, ontem, há N dias e sem contato', () => {
    expect(ultimoContatoTexto('2026-11-16', '2026-11-16')).toBe('hoje')
    expect(ultimoContatoTexto('2026-11-15', '2026-11-16')).toBe('ontem')
    expect(ultimoContatoTexto('2026-11-07', '2026-11-16')).toBe('há 9 dias')
    expect(ultimoContatoTexto(null, '2026-11-16')).toBe('sem contato')
  })
})

describe('resumoDosLeads e fraseDosLeads', () => {
  const leads = [
    lead({ alerta: true }), lead({ alerta: true, dias: 20 }),
    lead({ status: 'Novo', contatos: 0, ultimo_contato: null, dias: 2 }),
    lead({ status: 'Ganho', tipo_status: 'Fechado', data_fechamento: '2026-11-12', dias: 10 }),
    lead({ status: 'Ganho', tipo_status: 'Fechado', data_fechamento: '2026-10-30', dias: 30 }),
    lead({ status: 'Perdido', tipo_status: 'Fechado', data_fechamento: '2026-11-03', dias: 20 }),
  ]
  it('conta quem pede contato, os novos sem contato, os ganhos do mês e o tempo até fechar', () => {
    const r = resumoDosLeads(leads, '2026-11-01')
    expect(r).toMatchObject({ abertos: 3, comAlerta: 2, novosSemContato: 1, ganhosMes: 1, ganhosMesAnterior: 1, mediaFechar: 20 })
    expect(r.mediaAberto).toBeCloseTo((6 + 20 + 2) / 3)
  })
  it('a frase diz quem pede contato agora e quantos viraram cliente no mês', () => {
    const r = resumoDosLeads(leads, '2026-11-01')
    expect(fraseDosLeads(r, '2026-11-01', { diasAlerta: 7, meus: false })).toBe('2 leads em aberto estão sem contato há mais de 7 dias e 1 ainda não foi chamado nenhuma vez. Em novembro, 1 virou cliente.')
    expect(fraseDosLeads({ ...r, comAlerta: 190, novosSemContato: 1097, ganhosMes: 62 }, '2026-11-01', { diasAlerta: 7, meus: true }))
      .toBe('190 dos seus leads em aberto estão sem contato há mais de 7 dias e 1.097 ainda não foram chamados nenhuma vez. Em novembro, 62 viraram cliente.')
    expect(fraseDosLeads({ ...r, comAlerta: 0, novosSemContato: 0, ganhosMes: 0 }, '2026-11-01', { diasAlerta: 7, meus: false })).toBe('Nenhum lead em aberto está sem contato há mais de 7 dias. Em novembro ainda não houve ganho.')
  })
})

describe('visaoLeads', () => {
  it('visão desconhecida cai em Atendimento', () => {
    expect([visaoLeads('cadastro'), visaoLeads('xyz'), visaoLeads(null)]).toEqual(['cadastro', 'atendimento', 'atendimento'])
  })
})
