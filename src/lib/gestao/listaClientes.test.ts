import { describe, expect, it } from 'vitest'
import {
  COLUNAS_DA_VISAO, SEM_FILTRO_CLIENTES, VISOES_CLIENTES, chaveAlerta, colunasDaVisao, etiquetasDosFiltros, filtrosClientesDe, ordemDoGrupo, ordenarClientes, passaFiltros, semGrupo, telefoneCurto, visaoClientes,
  type FiltrosClientes,
} from './listaClientes'

type Linha = Parameters<typeof passaFiltros>[0]
const c = (p: Partial<Linha> = {}): Linha => ({
  status: 'Migrado', situacao: 'Ativo', responsavel: 'Lucas', ativador: null, contatos: 0, assessor_nome: 'Artur', alertas: [], grupo_corretagem: 'Vinculado', risco: null, nivel: 'Alto', lotes_media_3m: 0, ...p,
})
const f = (p: Partial<FiltrosClientes> = {}): FiltrosClientes => ({ ...SEM_FILTRO_CLIENTES, ...p })

describe('passaFiltros', () => {
  it('sem filtro passa todo mundo', () => {
    expect(passaFiltros(c(), f())).toBe(true)
    expect(passaFiltros(c({ status: 'Recusou', situacao: 'Recusou', responsavel: null, nivel: null }), f())).toBe(true)
  })

  it('o grupo (cartão) separa quem opera, quem está em risco e o resto', () => {
    expect(passaFiltros(c(), f({ momento: 'operando' }))).toBe(true)
    expect(passaFiltros(c({ risco: 'em queda' }), f({ momento: 'operando' }))).toBe(false)
    expect(passaFiltros(c({ risco: 'em queda' }), f({ momento: 'risco' }))).toBe(true)
    expect(passaFiltros(c({ situacao: 'Inativo', risco: 'parou' }), f({ momento: 'inativo' }))).toBe(false)
    expect(passaFiltros(c({ situacao: 'Inativo' }), f({ momento: 'inativo' }))).toBe(true)
    expect(passaFiltros(c({ situacao: 'Nunca girou' }), f({ momento: 'nunca' }))).toBe(true)
    expect(passaFiltros(c({ status: 'Em processamento', situacao: 'Em processamento' }), f({ momento: 'abertura' }))).toBe(true)
    expect(passaFiltros(c({ status: 'Recusou', situacao: 'Recusou' }), f({ momento: 'recusou' }))).toBe(true)
  })

  it('dentro de "Em risco", o risco escolhe quem parou ou quem está em queda', () => {
    expect(passaFiltros(c({ risco: 'parou' }), f({ momento: 'risco', risco: 'parou' }))).toBe(true)
    expect(passaFiltros(c({ risco: 'em queda' }), f({ momento: 'risco', risco: 'parou' }))).toBe(false)
    expect(passaFiltros(c(), f({ risco: 'em queda' }))).toBe(false)
  })

  it('status, responsável e assessor comparam o valor', () => {
    expect(passaFiltros(c(), f({ status: 'Migrado', responsavel: 'Lucas', assessor: 'Artur' }))).toBe(true)
    expect(passaFiltros(c(), f({ status: 'Recusou' }))).toBe(false)
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

  it('grupo de corretagem e nível aceitam o valor ou o "vazio"', () => {
    expect(passaFiltros(c(), f({ grupo: 'Vinculado' }))).toBe(true)
    expect(passaFiltros(c(), f({ grupo: 'Bloqueado' }))).toBe(false)
    expect(passaFiltros(c({ grupo_corretagem: null }), f({ grupo: 'vazio' }))).toBe(true)
    expect(passaFiltros(c(), f({ grupo: 'vazio' }))).toBe(false)
    expect(passaFiltros(c(), f({ nivel: 'Alto' }))).toBe(true)
    expect(passaFiltros(c({ nivel: null }), f({ nivel: 'vazio' }))).toBe(true)
    expect(passaFiltros(c(), f({ nivel: 'vazio' }))).toBe(false)
  })

  it('o giro em outra corretora não é decidido aqui (a tabela confere com a leitura dela)', () => {
    expect(passaFiltros(c(), f({ fora: 'sim' }))).toBe(true)
  })

  it('semGrupo tira o cartão e o risco, para contar os cartões com os outros filtros valendo', () => {
    const filtros = f({ momento: 'risco', risco: 'parou', responsavel: 'Lucas' })
    expect(passaFiltros(c(), filtros)).toBe(false)
    expect(passaFiltros(c(), semGrupo(filtros))).toBe(true)
    expect(passaFiltros(c({ responsavel: 'Artur' }), semGrupo(filtros))).toBe(false)
  })
})

describe('filtrosClientesDe', () => {
  it('lê os filtros guardados e descarta opção que não existe', () => {
    expect(filtrosClientesDe({ busca: 'ana', momento: 'nunca', status: 'Migrado', nivel: 'Alto', fora: 'sim' })).toEqual(f({ busca: 'ana', momento: 'nunca', status: 'Migrado', nivel: 'Alto', fora: 'sim' }))
    expect(filtrosClientesDe({ momento: 'xpto', status: 'Outro', contato: 'talvez', grupo: 'x', nivel: 'y', fora: 'nao' })).toEqual(f())
    expect(filtrosClientesDe({})).toEqual(f())
  })
  it('endereços antigos continuam valendo: ?risco=qualquer é o grupo "Em risco"', () => {
    expect(filtrosClientesDe({ risco: 'qualquer' })).toEqual(f({ momento: 'risco' }))
    expect(filtrosClientesDe({ risco: 'parou' })).toEqual(f({ momento: 'risco', risco: 'parou' }))
    expect(filtrosClientesDe({ momento: 'risco', risco: 'em queda' })).toEqual(f({ momento: 'risco', risco: 'em queda' }))
  })
  it('a situação antiga vira o grupo quando vale por um grupo inteiro; ativo e inativo não', () => {
    expect(filtrosClientesDe({ situacao: 'Nunca girou' }).momento).toBe('nunca')
    expect(filtrosClientesDe({ situacao: 'Em processamento' }).momento).toBe('abertura')
    expect(filtrosClientesDe({ situacao: 'Recusou' }).momento).toBe('recusou')
    expect(filtrosClientesDe({ situacao: 'Ativo' }).momento).toBe('')
    expect(filtrosClientesDe({ situacao: 'Inativo' }).momento).toBe('')
  })
  it('o risco só vale dentro do grupo "Em risco"', () => {
    expect(filtrosClientesDe({ momento: 'operando', risco: 'parou' })).toEqual(f({ momento: 'operando' }))
  })
})

describe('etiquetasDosFiltros', () => {
  it('só os filtros recolhidos viram etiqueta', () => {
    expect(etiquetasDosFiltros(f({ busca: 'ana', momento: 'risco', risco: 'parou', fora: 'sim' }))).toEqual([])
  })

  it('cada filtro ligado traz o texto pronto', () => {
    expect(etiquetasDosFiltros(f({ status: 'Migrado', responsavel: 'Lucas', ativacao: 'sem', contato: 'nao', assessor: 'Artur', alerta: 'contas', grupo: 'vazio', nivel: 'vazio' }))).toEqual([
      { chave: 'status', texto: 'Status: Migrado' },
      { chave: 'responsavel', texto: 'Responsável: Lucas' },
      { chave: 'ativacao', texto: 'Ativação: sem atendente' },
      { chave: 'contato', texto: 'Ainda não chamados' },
      { chave: 'assessor', texto: 'Assessor: Artur' },
      { chave: 'alerta', texto: 'Alerta: mais de uma conta' },
      { chave: 'grupo', texto: 'Grupo de corretagem: não informado' },
      { chave: 'nivel', texto: 'Sem giro nos 3 meses' },
    ])
    expect(etiquetasDosFiltros(f({ ativacao: 'Milena', contato: 'sim', alerta: 'qualquer', grupo: 'Bloqueado', nivel: 'Alto' })).map(e => e.texto))
      .toEqual(['Ativação: Milena', 'Já chamados', 'Com algum alerta', 'Grupo de corretagem: bloqueado', 'Nível alto'])
  })
})

describe('visões de colunas', () => {
  it('valor desconhecido (e a antiga "Todas") cai no Resumo', () => {
    expect(visaoClientes('atendimento')).toBe('atendimento')
    expect(visaoClientes('todas')).toBe('resumo')
    expect(visaoClientes('xpto')).toBe('resumo')
    expect(visaoClientes(null)).toBe('resumo')
  })

  it('toda visão abre pelo nome, sem coluna repetida e com no máximo 11 colunas', () => {
    for (const v of VISOES_CLIENTES) {
      const ids = COLUNAS_DA_VISAO[v].map(([id]) => id)
      expect(ids[0]).toBe('nome')
      expect(COLUNAS_DA_VISAO[v][0][1]).toBeUndefined()
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids.length).toBeLessThanOrEqual(11)
    }
  })

  it('no celular (sem prioridade) cada visão mostra o nome e mais uma coluna; o estado nunca é coluna de celular', () => {
    for (const v of VISOES_CLIENTES) {
      expect(COLUNAS_DA_VISAO[v].filter(([, prio]) => !prio).length).toBe(2)
      for (const [id, prio] of COLUNAS_DA_VISAO[v]) if (id === 'momento') expect(prio).toBe('p2')
    }
    for (const m of ['risco', 'inativo']) expect(colunasDaVisao('resumo', m).find(([id]) => id === 'momento')?.[1]).toBe('p2')
    expect(COLUNAS_DA_VISAO.resumo.filter(([, prio]) => !prio).map(([id]) => id)).toEqual(['nome', 'lotes_mes'])
  })
})

describe('colunas e ordem por grupo', () => {
  it('no Resumo as colunas acompanham o grupo; nas outras visões não mudam', () => {
    expect(colunasDaVisao('resumo', '')).toBe(COLUNAS_DA_VISAO.resumo)
    expect(colunasDaVisao('resumo', 'xpto')).toBe(COLUNAS_DA_VISAO.resumo)
    expect(colunasDaVisao('resumo', 'nunca').map(([id]) => id)).toEqual(['nome', 'migracao', 'telefone', 'contato', 'ativador', 'assessor'])
    expect(colunasDaVisao('resumo', 'inativo').map(([id]) => id)).toContain('lotes_12m')
    expect(colunasDaVisao('cadastro', 'nunca')).toEqual(COLUNAS_DA_VISAO.cadastro)
    expect(colunasDaVisao('giro', 'risco')).toBe(COLUNAS_DA_VISAO.giro)
  })

  it('nas outras visões o estado também some quando o grupo inteiro tem o mesmo', () => {
    expect(colunasDaVisao('giro', '').some(([id]) => id === 'momento')).toBe(true)
    expect(colunasDaVisao('giro', 'operando').some(([id]) => id === 'momento')).toBe(false)
    expect(colunasDaVisao('atendimento', 'nunca').map(([id]) => id)).toEqual(['nome', 'telefone', 'contato', 'responsavel', 'ativador', 'outra', 'assessor', 'parceiro'])
  })

  it('o estado do cliente só aparece nos grupos em que ele varia de linha para linha', () => {
    const com = (m: string) => colunasDaVisao('resumo', m).some(([id]) => id === 'momento')
    expect([com(''), com('risco'), com('inativo')]).toEqual([true, true, true])
    expect([com('operando'), com('nunca'), com('abertura'), com('recusou')]).toEqual([false, false, false, false])
  })

  it('todo grupo abre pelo nome, com duas colunas no celular, e ordenado por uma coluna que está à mostra', () => {
    const campoDaColuna: Record<string, string> = { lotes_mes: 'lotes_mes', media_3m: 'lotes_media_3m', ultimo_giro: 'ultimo_giro', migracao: 'data_migracao', entrada: 'data_entrada', nome: 'nome' }
    for (const m of ['', 'operando', 'risco', 'inativo', 'nunca', 'abertura', 'recusou']) {
      const cols = colunasDaVisao('resumo', m)
      expect(cols[0]).toEqual(['nome'])
      expect(cols.filter(([, prio]) => !prio).length).toBe(2)
      expect(cols.map(([id]) => campoDaColuna[id])).toContain(ordemDoGrupo(m).col)
    }
  })

  it('cada grupo abre com o que mais importa primeiro', () => {
    expect(ordemDoGrupo('')).toEqual({ col: 'lotes_mes', dir: 'desc' })
    expect(ordemDoGrupo('risco')).toEqual({ col: 'lotes_media_3m', dir: 'desc' })
    expect(ordemDoGrupo('inativo')).toEqual({ col: 'ultimo_giro', dir: 'desc' })
    expect(ordemDoGrupo('nunca')).toEqual({ col: 'data_migracao', dir: 'desc' })
  })

  it('ordenar deixa quem não tem o valor no fim, nos dois sentidos, e não mexe na lista original', () => {
    const linhas = [{ nome: 'B', ultimo_giro: null }, { nome: 'A', ultimo_giro: '2026-11-10' }, { nome: 'C', ultimo_giro: '2026-10-01' }]
    expect(ordenarClientes(linhas, { col: 'ultimo_giro', dir: 'desc' }).map(l => l.nome)).toEqual(['A', 'C', 'B'])
    expect(ordenarClientes(linhas, { col: 'ultimo_giro', dir: 'asc' }).map(l => l.nome)).toEqual(['C', 'A', 'B'])
    expect(ordenarClientes(linhas, { col: 'nome', dir: 'asc' }).map(l => l.nome)).toEqual(['A', 'B', 'C'])
    expect(linhas.map(l => l.nome)).toEqual(['B', 'A', 'C'])
  })

  it('empate mantém a ordem em que a lista chegou', () => {
    const linhas = [{ nome: 'Maior em 12 meses', lotes_mes: 0 }, { nome: 'Menor em 12 meses', lotes_mes: 0 }, { nome: 'Girou', lotes_mes: 5 }]
    expect(ordenarClientes(linhas, { col: 'lotes_mes', dir: 'desc' }).map(l => l.nome)).toEqual(['Girou', 'Maior em 12 meses', 'Menor em 12 meses'])
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
