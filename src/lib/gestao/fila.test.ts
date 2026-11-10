import { describe, expect, it } from 'vitest'
import { linkTelefone, montarFila, totalDaFila, type ClienteFila, type LeadFila } from './fila'

const HOJE = '2026-11-10'
const lead = (p: Partial<LeadFila> & { id: string }): LeadFila => ({
  nome: `Lead ${p.id}`, whatsapp: null, responsavel: 'Karen', status: 'Em contato', aberto: true, data_hora: '2026-11-01T12:00:00-03:00',
  ultimo_contato: null, proximo_contato: null, corretora: null, origem: null, ...p,
})
const cliente = (p: Partial<ClienteFila> & { cliente_id: string }): ClienteFila => ({
  corretora: 'BTG', nome: `Cliente ${p.cliente_id}`, telefone: null, responsavel: 'Artur', ativador: null, situacao: 'Ativo', risco: null, nivel: null,
  dias_sem_giro: null, lotes_media_3m: 0, contatos: 0, ultimo_contato: null, proximo_contato: null, ...p,
})
const secao = (s: ReturnType<typeof montarFila>, chave: string) => s.find(x => x.chave === chave)!

describe('montarFila', () => {
  it('põe em Combinados o que tem próximo contato hoje ou atrasado, os mais atrasados primeiro', () => {
    const s = montarFila([
      lead({ id: 'a', proximo_contato: '2026-11-10' }),
      lead({ id: 'b', proximo_contato: '2026-11-07', status: 'Ganho', aberto: false }),   // fechado, mas combinado: entra
      lead({ id: 'c', proximo_contato: '2026-11-12' }),                                   // futuro: não incomoda
    ], [cliente({ cliente_id: 'x', proximo_contato: '2026-11-09', ativador: 'Milena' })], { hoje: HOJE, diasAlerta: 7 })
    const ag = secao(s, 'agendados')
    expect(ag.itens.map(i => [i.id, i.motivo, i.dias])).toEqual([['b', 'atrasado', 3], ['x', 'atrasado', 1], ['a', 'hoje', 0]])
    expect(ag.itens[0].detalhe).toBe('marcado para 07/11, há 3 dias')
    expect(ag.itens[1].quem).toBe('Milena')
    expect(totalDaFila(s)).toBe(3)
  })

  it('separa leads novos sem contato e leads parados pelo parâmetro de alerta', () => {
    const s = montarFila([
      lead({ id: 'novo', data_hora: '2026-11-08T09:00:00-03:00' }),
      lead({ id: 'parado', ultimo_contato: '2026-11-01' }),
      lead({ id: 'recente', ultimo_contato: '2026-11-06' }),
      lead({ id: 'fechado', status: 'Perdido', aberto: false }),
      lead({ id: 'marcado', ultimo_contato: '2026-10-20', proximo_contato: '2026-11-15' }),   // parado, mas com retorno combinado
    ], [], { hoje: HOJE, diasAlerta: 7 })
    expect(secao(s, 'novos').itens.map(i => i.id)).toEqual(['novo'])
    expect(secao(s, 'novos').itens[0].detalhe).toBe('entrou há 2 dias · nenhum contato registrado')
    expect(secao(s, 'parados').itens.map(i => i.id)).toEqual(['parado'])
    expect(secao(s, 'parados').itens[0].detalhe).toBe('último contato há 9 dias')
  })

  it('clientes: campanha sem contato e risco sem contato recente, por nível', () => {
    const s = montarFila([], [
      cliente({ cliente_id: 'camp', ativador: 'Milena', contatos: 0 }),
      cliente({ cliente_id: 'camp2', ativador: 'Milena', contatos: 2, ultimo_contato: '2026-11-09' }),   // já chamada: fora
      cliente({ cliente_id: 'baixo', risco: 'parou', nivel: 'Baixo', dias_sem_giro: 15, lotes_media_3m: 30 }),
      cliente({ cliente_id: 'alto', risco: 'em queda', nivel: 'Alto', lotes_media_3m: 1500, ultimo_contato: '2026-10-01', contatos: 1 }),
      cliente({ cliente_id: 'ok', risco: 'parou', nivel: 'Alto', ultimo_contato: '2026-11-05', contatos: 1 }),    // contato recente: fora
      cliente({ cliente_id: 'semrisco' }),
    ], { hoje: HOJE, diasAlerta: 7 })
    expect(secao(s, 'campanha').itens.map(i => i.id)).toEqual(['camp'])
    expect(secao(s, 'campanha').itens[0].detalhe).toBe('campanha de ativação com Milena · ainda sem contato')
    expect(secao(s, 'risco').itens.map(i => i.id)).toEqual(['alto', 'baixo'])
    expect(secao(s, 'risco').itens[0].detalhe).toBe('giro em queda · nível Alto · último contato há 40 dias')
    expect(secao(s, 'risco').itens[1].detalhe).toBe('parou de girar há 15 dias · nível Baixo · nenhum contato registrado')
  })

  it('filtra pelas tarefas de uma pessoa (responsável do lead, ativador ou responsável do cliente)', () => {
    const leads = [lead({ id: 'k', responsavel: 'Karen' }), lead({ id: 'm', responsavel: 'MILENA' })]
    const clientes = [
      cliente({ cliente_id: 'c1', ativador: 'Milena', contatos: 0 }),
      cliente({ cliente_id: 'c2', risco: 'parou', responsavel: 'Artur' }),
    ]
    const milena = montarFila(leads, clientes, { hoje: HOJE, diasAlerta: 7, quem: 'Milena' })
    expect(secao(milena, 'novos').itens.map(i => i.id)).toEqual(['m'])
    expect(secao(milena, 'campanha').itens.map(i => i.id)).toEqual(['c1'])
    expect(secao(milena, 'risco').itens).toEqual([])
    const artur = montarFila(leads, clientes, { hoje: HOJE, diasAlerta: 7, quem: 'Artur' })
    expect(secao(artur, 'risco').itens.map(i => i.id)).toEqual(['c2'])
    expect(totalDaFila(artur)).toBe(1)
  })
})

describe('linkTelefone', () => {
  it('monta o wa.me com 55 + DDD + número', () => {
    expect(linkTelefone('(62) 99999-1234')).toBe('https://wa.me/5562999991234')
    expect(linkTelefone('+55 62 99999-1234')).toBe('https://wa.me/5562999991234')
    expect(linkTelefone('1234')).toBeNull()
    expect(linkTelefone(null)).toBeNull()
  })
})
