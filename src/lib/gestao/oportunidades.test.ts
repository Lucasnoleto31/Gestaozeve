import { describe, expect, it } from 'vitest'
import { classificar, mediaAtiva, type ClienteBase } from './oportunidades'
import type { GiroFora } from './giroFora'

const HOJE = '2026-11-10'
const c = (p: Partial<ClienteBase> & { cliente_id: string }): ClienteBase => ({
  nome: `Cliente ${p.cliente_id}`, telefone: null, responsavel: null, ativador: null, situacao: 'Ativo', data_migracao: null, data_entrada: null,
  lotes_12m: 0, receita_total: 0, meses_ativos: 0, meses_sem_giro: null, ultimo_giro: null, contatos: 0, ultimo_contato: null,
  patrimonio: null, lead_ja_opera: null, lead_corretora: null, fora: null, ...p,
})
// giro em outra corretora: no mês de referência de lá (lotesMes) ou só nos meses anteriores
const fora = (lotesMes: number, p: Partial<GiroFora> = {}): GiroFora => ({ corretora: 'GENIAL', mes: '2026-11-01', lotesMes, lotesJanela: lotesMes + 500, ultimoMes: lotesMes ? '2026-11-01' : '2026-10-01', ...p })

describe('classificar', () => {
  it('separa por situação e deixa de fora quem está ativo ou recusou', () => {
    const r = classificar([
      c({ cliente_id: 'ativo' }), c({ cliente_id: 'recusou', situacao: 'Recusou' }),
      c({ cliente_id: 'i', situacao: 'Inativo' }), c({ cliente_id: 'n', situacao: 'Nunca girou' }), c({ cliente_id: 'p', situacao: 'Em processamento' }),
    ], HOJE)
    expect([r.reativar.map(o => o.cliente_id), r.ativar.map(o => o.cliente_id), r.abertura.map(o => o.cliente_id)]).toEqual([['i'], ['n'], ['p']])
  })

  it('reativar: ordena pelo que rendia por mês ativo e soma o potencial', () => {
    const r = classificar([
      c({ cliente_id: 'pouco', situacao: 'Inativo', receita_total: 300, meses_ativos: 3, meses_sem_giro: 2 }),
      c({ cliente_id: 'muito', situacao: 'Inativo', receita_total: 9000, meses_ativos: 10, meses_sem_giro: 8, ativador: 'Milena', contatos: 2 }),
      c({ cliente_id: 'umMes', situacao: 'Inativo', receita_total: 500, meses_ativos: 0, meses_sem_giro: 1 }),
    ], HOJE)
    expect(r.reativar.map(o => [o.cliente_id, o.mediaAtiva])).toEqual([['muito', 900], ['umMes', 500], ['pouco', 100]])
    expect(r.resumo.reativar).toEqual({ contas: 3, potencialMes: 1500, recentes: 2, potencialRecentes: 600, foraDaCampanha: 2, contatados: 1, giramFora: 0, potencialGiramFora: 0 })
    expect(mediaAtiva({ receita_total: 500, meses_ativos: 0 })).toBe(500)
  })

  it('ativar: migração recente, lead que já opera e patrimônio somam pontos e viram o motivo', () => {
    const r = classificar([
      c({ cliente_id: 'frio', situacao: 'Nunca girou', data_migracao: '2024-01-10' }),
      c({ cliente_id: 'recente', situacao: 'Nunca girou', data_migracao: '2026-10-29' }),
      c({ cliente_id: 'quente', situacao: 'Nunca girou', data_migracao: '2026-11-05', lead_ja_opera: 'Sim, já opero', lead_corretora: 'XP', patrimonio: 1_500_000 }),
      c({ cliente_id: 'rico', situacao: 'Nunca girou', data_migracao: '2025-01-10', patrimonio: 400_000, lead_ja_opera: 'Já operei e parei', lead_corretora: 'Outra' }),
    ], HOJE)
    expect(r.ativar.map(o => [o.cliente_id, o.pontos])).toEqual([['quente', 7], ['recente', 3], ['rico', 2], ['frio', 0]])
    expect(r.ativar[0].motivos).toEqual(['migrou há 5 dias', 'já opera (XP)', 'patrimônio de R$ 1,5 mi'])
    expect(r.ativar[2].motivos).toEqual(['já operou em outra corretora', 'patrimônio de R$ 400 mil'])
    expect(r.resumo.ativar).toMatchObject({ contas: 4, recentes: 2, jaOperam: 1, prioridade: 2, foraDaCampanha: 4 })
  })

  it('abertura: quem já gira vem primeiro; depois, quem espera há mais tempo', () => {
    const r = classificar([
      c({ cliente_id: 'novo', situacao: 'Em processamento', data_entrada: '2026-11-08' }),
      c({ cliente_id: 'antigo', situacao: 'Em processamento', data_entrada: '2026-09-01' }),
      c({ cliente_id: 'gira', situacao: 'Em processamento', lotes_12m: 500 }),
      c({ cliente_id: 'semData', situacao: 'Em processamento' }),
    ], HOJE)
    expect(r.abertura.map(o => [o.cliente_id, o.diasEmAbertura])).toEqual([['gira', null], ['antigo', 70], ['novo', 2], ['semData', null]])
    expect(r.abertura[0].motivos).toEqual(['já gira: falta migrar a conta'])
    expect(r.resumo.abertura).toEqual({ contas: 4, jaGiram: 1, lotes12m: 500, semContato: 4, giramFora: 0 })
  })

  it('quem gira em outra corretora sobe para o topo de Ativar; quem girou lá há pouco vem logo depois', () => {
    const r = classificar([
      c({ cliente_id: 'recente', situacao: 'Nunca girou', data_migracao: '2026-10-29' }),
      c({ cliente_id: 'giraLa', situacao: 'Nunca girou', data_migracao: '2025-01-10', fora: fora(9316) }),
      c({ cliente_id: 'girouLa', situacao: 'Nunca girou', data_migracao: '2024-01-10', fora: fora(0, { corretora: 'XP' }) }),
    ], HOJE)
    expect(r.ativar.map(o => [o.cliente_id, o.pontos])).toEqual([['giraLa', 4], ['recente', 3], ['girouLa', 2]])
    expect(r.ativar[0].motivos).toEqual(['gira na Genial (9.316 lotes em nov/26)'])
    expect(r.ativar[2].motivos).toEqual(['girou na XP em out/26'])
    // só quem gira lá no mês entra na conta; ele e o recém-migrado contam como prioridade alta (3 pontos ou mais)
    expect(r.resumo.ativar).toMatchObject({ giramFora: 1, prioridade: 2 })
  })

  it('inativo que gira em outra corretora não está perdido: fica na lista, marcado, e a soma dele é contada à parte', () => {
    const r = classificar([
      c({ cliente_id: 'mudou', situacao: 'Inativo', receita_total: 9000, meses_ativos: 10, meses_sem_giro: 1, fora: fora(4000, { corretora: 'BTG' }) }),
      c({ cliente_id: 'parou', situacao: 'Inativo', receita_total: 300, meses_ativos: 3, meses_sem_giro: 2 }),
      c({ cliente_id: 'girouLa', situacao: 'Inativo', receita_total: 100, meses_ativos: 1, meses_sem_giro: 5, fora: fora(0) }),
    ], HOJE)
    expect(r.reativar.map(o => o.cliente_id)).toEqual(['mudou', 'parou', 'girouLa'])
    expect(r.reativar[0].fora?.corretora).toBe('BTG')
    expect(r.resumo.reativar).toMatchObject({ contas: 3, potencialMes: 1100, giramFora: 1, potencialGiramFora: 900 })
  })

  it('em abertura: depois de quem já gira aqui vem quem gira em outra corretora', () => {
    const r = classificar([
      c({ cliente_id: 'antigo', situacao: 'Em processamento', data_entrada: '2026-09-01' }),
      c({ cliente_id: 'giraLa', situacao: 'Em processamento', data_entrada: '2026-11-08', fora: fora(700) }),
      c({ cliente_id: 'giraAqui', situacao: 'Em processamento', lotes_12m: 50 }),
    ], HOJE)
    expect(r.abertura.map(o => o.cliente_id)).toEqual(['giraAqui', 'giraLa', 'antigo'])
    expect(r.abertura[1].motivos).toEqual(['gira na Genial (700 lotes em nov/26)'])
    expect(r.resumo.abertura.giramFora).toBe(1)
  })
})
