import { describe, expect, it } from 'vitest'
import {
  COLUNAS_DA_VISAO, SEM_FILTRO_CLIENTES, VISOES_CLIENTES, chaveAlerta, etiquetasDosFiltros, passaFiltros, telefoneCurto, visaoClientes,
  type FiltrosClientes,
} from './listaClientes'

type Linha = Parameters<typeof passaFiltros>[0]
const c = (p: Partial<Linha> = {}): Linha => ({
  status: 'Migrado', situacao: 'Ativo', responsavel: 'Lucas', ativador: null, contatos: 0, assessor_nome: 'Artur', alertas: [], grupo_corretagem: 'Vinculado', risco: null, nivel: 'Alto', ...p,
})
const f = (p: Partial<FiltrosClientes> = {}): FiltrosClientes => ({ ...SEM_FILTRO_CLIENTES, ...p })

describe('passaFiltros', () => {
  it('sem filtro passa todo mundo', () => {
    expect(passaFiltros(c(), f())).toBe(true)
    expect(passaFiltros(c({ status: 'Recusou', situacao: 'Recusou', responsavel: null, nivel: null }), f())).toBe(true)
  })

  it('status, situação, responsável e assessor comparam o valor', () => {
    expect(passaFiltros(c(), f({ status: 'Migrado', situacao: 'Ativo', responsavel: 'Lucas', assessor: 'Artur' }))).toBe(true)
    expect(passaFiltros(c(), f({ status: 'Recusou' }))).toBe(false)
    expect(passaFiltros(c(), f({ situacao: 'Inativo' }))).toBe(false)
    expect(passaFiltros(c({ responsavel: null }), f({ responsavel: 'Lucas' }))).toBe(false)
    expect(passaFiltros(c({ assessor_nome: null }), f({ assessor: 'Artur' }))).toBe(false)
  })

  it('ativação: um atendente ou "sem atendente"', () => {
    expect(passaFiltros(c({ ativador: 'Milena' }), f({ ativacao: 'Milena' }))).toBe(true)
    expect(passaFiltros(c({ ativador: 'Karen' }), f({ ativacao: 'Milena' }))).toBe(false)
    expect(passaFiltros(c(), f({ ativacao: 'Milena' }))).toBe(false)
    expect(passaFiltros(c(), f({ ativacao: 'sem' }))).toBe(true)
    expect(passaFiltros(c({ ativador: 'Milena' }), f({ ativacao: 'sem' }))).toBe(false)
  })

  it('contato: já chamados ou ainda não chamados', () => {
    expect(passaFiltros(c({ contatos: 2 }), f({ contato: 'sim' }))).toBe(true)
    expect(passaFiltros(c(), f({ contato: 'sim' }))).toBe(false)
    expect(passaFiltros(c(), f({ contato: 'nao' }))).toBe(true)
    expect(passaFiltros(c({ contatos: 1 }), f({ contato: 'nao' }))).toBe(false)
  })

  it('alertas: qualquer um, um específico ou "mais de uma conta"', () => {
    const com = c({ alertas: ['3 contas', 'sem telefone'] })
    expect(passaFiltros(c(), f({ alerta: 'qualquer' }))).toBe(false)
    expect(passaFiltros(com, f({ alerta: 'qualquer' }))).toBe(true)
    expect(passaFiltros(com, f({ alerta: 'sem telefone' }))).toBe(true)
    expect(passaFiltros(com, f({ alerta: 'contas' }))).toBe(true)
    expect(passaFiltros(com, f({ alerta: 'migrado sem giro' }))).toBe(false)
    expect(chaveAlerta('12 contas')).toBe('contas')
    expect(chaveAlerta('sem telefone')).toBe('sem telefone')
  })

  it('grupo de corretagem, risco e nível aceitam o valor ou o "vazio"/"qualquer"', () => {
    expect(passaFiltros(c(), f({ grupo: 'Vinculado' }))).toBe(true)
    expect(passaFiltros(c(), f({ grupo: 'Bloqueado' }))).toBe(false)
    expect(passaFiltros(c({ grupo_corretagem: null }), f({ grupo: 'vazio' }))).toBe(true)
    expect(passaFiltros(c(), f({ grupo: 'vazio' }))).toBe(false)
    expect(passaFiltros(c({ risco: 'parou' }), f({ risco: 'qualquer' }))).toBe(true)
    expect(passaFiltros(c(), f({ risco: 'qualquer' }))).toBe(false)
    expect(passaFiltros(c({ risco: 'parou' }), f({ risco: 'em queda' }))).toBe(false)
    expect(passaFiltros(c(), f({ nivel: 'Alto' }))).toBe(true)
    expect(passaFiltros(c({ nivel: null }), f({ nivel: 'vazio' }))).toBe(true)
    expect(passaFiltros(c(), f({ nivel: 'vazio' }))).toBe(false)
  })

  it('o giro em outra corretora não é decidido aqui (a tabela confere com a leitura dela)', () => {
    expect(passaFiltros(c(), f({ fora: 'sim' }))).toBe(true)
  })

  it('pular deixa um filtro de fora (para contar as opções dele)', () => {
    const filtros = f({ situacao: 'Inativo', responsavel: 'Lucas' })
    expect(passaFiltros(c(), filtros)).toBe(false)
    expect(passaFiltros(c(), filtros, 'situacao')).toBe(true)
    // os outros filtros continuam valendo
    expect(passaFiltros(c({ responsavel: 'Artur' }), filtros, 'situacao')).toBe(false)
  })
})

describe('etiquetasDosFiltros', () => {
  it('só os filtros recolhidos viram etiqueta', () => {
    expect(etiquetasDosFiltros(f({ busca: 'ana', situacao: 'Ativo', risco: 'qualquer', alerta: 'qualquer', fora: 'sim' }))).toEqual([])
  })

  it('cada filtro ligado traz o texto pronto', () => {
    expect(etiquetasDosFiltros(f({ status: 'Migrado', responsavel: 'Lucas', ativacao: 'sem', contato: 'nao', assessor: 'Artur', alerta: 'contas', grupo: 'vazio', risco: 'parou', nivel: 'vazio' }))).toEqual([
      { chave: 'status', texto: 'Status: Migrado' },
      { chave: 'responsavel', texto: 'Responsável: Lucas' },
      { chave: 'ativacao', texto: 'Ativação: sem atendente' },
      { chave: 'contato', texto: 'Ainda não chamados' },
      { chave: 'assessor', texto: 'Assessor: Artur' },
      { chave: 'alerta', texto: 'Alerta: mais de uma conta' },
      { chave: 'grupo', texto: 'Grupo de corretagem: não informado' },
      { chave: 'risco', texto: 'Risco: parou' },
      { chave: 'nivel', texto: 'Sem giro nos 3 meses' },
    ])
    expect(etiquetasDosFiltros(f({ ativacao: 'Milena', contato: 'sim', grupo: 'Bloqueado', nivel: 'Alto' })).map(e => e.texto))
      .toEqual(['Ativação: Milena', 'Já chamados', 'Grupo de corretagem: bloqueado', 'Nível alto'])
  })
})

describe('visões de colunas', () => {
  it('valor desconhecido cai na visão de giro', () => {
    expect(visaoClientes('atendimento')).toBe('atendimento')
    expect(visaoClientes('xpto')).toBe('giro')
    expect(visaoClientes(null)).toBe('giro')
  })

  it('toda visão abre pelo nome, sem coluna repetida, e "Todas" tem todas as colunas das outras', () => {
    const todas = new Set(COLUNAS_DA_VISAO.todas.map(([id]) => id))
    for (const v of VISOES_CLIENTES) {
      const ids = COLUNAS_DA_VISAO[v].map(([id]) => id)
      expect(ids[0]).toBe('nome')
      expect(COLUNAS_DA_VISAO[v][0][1]).toBeUndefined()
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) expect(todas.has(id)).toBe(true)
    }
    expect(todas.size).toBe(25)
  })
})

describe('telefoneCurto', () => {
  it('formata celular e fixo, com ou sem o 55', () => {
    expect(telefoneCurto('5511988887777')).toBe('(11) 98888-7777')
    expect(telefoneCurto('(11) 98888-7777')).toBe('(11) 98888-7777')
    expect(telefoneCurto('1133334444')).toBe('(11) 3333-4444')
    expect(telefoneCurto('+1 202 555 0100 22')).toBe('+1 202 555 0100 22')
    expect(telefoneCurto(null)).toBeNull()
    expect(telefoneCurto('')).toBeNull()
  })
})
