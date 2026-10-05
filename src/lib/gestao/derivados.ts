// Agregações puras sobre a lista de clientes (clientes_lista): o que a planilha
// calcula com SOMASES/CONT.SES nas abas Painel, Clientes e Receita.
import type { ClienteRow, Situacao, StatusConta } from './tipos'

export const SEM_RESP = 'Sem responsável'
export const SEM_ASSESSOR = 'Sem assessor'

export function resumoClientes(rows: ClienteRow[]) {
  const levados = rows.length
  const contas = rows.reduce((s, r) => s + r.n_contas, 0)
  const migrados = rows.filter(r => r.status === 'Migrado').length
  const emProcessamento = rows.filter(r => r.status === 'Em processamento').length
  const recusaram = rows.filter(r => r.status === 'Recusou').length
  const ativos = rows.filter(r => r.lotes_mes > 0).length
  const lotesMes = rows.reduce((s, r) => s + r.lotes_mes, 0)
  const zeradosMes = rows.reduce((s, r) => s + r.zerados_mes, 0)
  const receitaMes = rows.reduce((s, r) => s + r.receita_mes, 0)
  const lotes12m = rows.reduce((s, r) => s + r.lotes_12m, 0)
  const receita12m = rows.reduce((s, r) => s + r.receita_12m, 0)
  const nuncaGiraram = rows.filter(r => r.situacao === 'Nunca girou').length
  const inativos = rows.filter(r => r.situacao === 'Inativo').length
  const ativosSit = rows.filter(r => r.situacao === 'Ativo').length
  const comAlertas = rows.filter(r => r.alertas.length > 0).length
  const migradosSemData = rows.filter(r => r.status === 'Migrado' && !r.data_migracao).length
  const multiConta = rows.filter(r => r.n_contas > 1).length
  const comReceita = rows.filter(r => r.receita_mes > 0).length
  const diasMigrar = rows.filter(r => r.dias_ate_migrar != null).map(r => r.dias_ate_migrar as number)
  const mediaDiasMigrar = diasMigrar.length ? diasMigrar.reduce((s, d) => s + d, 0) / diasMigrar.length : null
  return {
    levados, contas, migrados, emProcessamento, recusaram, ativos, lotesMes, zeradosMes, receitaMes, lotes12m, receita12m,
    nuncaGiraram, inativos, ativosSit, comAlertas, migradosSemData, multiConta, comReceita, mediaDiasMigrar,
    taxaMigracao: levados ? (migrados / levados) * 100 : 0,
    pctAtivosMigrados: migrados ? (ativos / migrados) * 100 : 0,
    pctAtivosLevados: levados ? (ativos / levados) * 100 : 0,
  }
}

export type GrupoClientes = {
  grupo: string
  responsavel: string | null
  levados: number
  migrados: number
  ativos: number
  lotesMes: number
  receitaMes: number
  lotes12m: number
  receita12m: number
  comReceita: number
}

function agrupar(rows: ClienteRow[], chave: (r: ClienteRow) => string): GrupoClientes[] {
  const m = new Map<string, GrupoClientes>()
  for (const r of rows) {
    const k = chave(r)
    let g = m.get(k)
    if (!g) { g = { grupo: k, responsavel: r.responsavel, levados: 0, migrados: 0, ativos: 0, lotesMes: 0, receitaMes: 0, lotes12m: 0, receita12m: 0, comReceita: 0 }; m.set(k, g) }
    g.levados++
    if (r.status === 'Migrado') g.migrados++
    if (r.lotes_mes > 0) g.ativos++
    if (r.receita_mes > 0) g.comReceita++
    g.lotesMes += r.lotes_mes; g.receitaMes += r.receita_mes; g.lotes12m += r.lotes_12m; g.receita12m += r.receita_12m
  }
  return [...m.values()].sort((a, b) => b.lotesMes - a.lotesMes || b.levados - a.levados)
}

export const porAssessor = (rows: ClienteRow[]) => agrupar(rows, r => r.assessor_nome ?? SEM_ASSESSOR)
export const porResponsavel = (rows: ClienteRow[]) => agrupar(rows, r => r.responsavel ?? SEM_RESP)

export const STATUS_ORDEM: StatusConta[] = ['Migrado', 'Em processamento', 'Recusou']
export const SITUACOES_MIGRADO: Situacao[] = ['Ativo', 'Inativo', 'Nunca girou']

// Base por status × responsável (colunas = responsáveis)
export function baseStatus(rows: ClienteRow[]) {
  const responsaveis = [...new Set(rows.map(r => r.responsavel ?? SEM_RESP))].sort((a, b) => (a === SEM_RESP ? 1 : b === SEM_RESP ? -1 : a.localeCompare(b)))
  const linhas = STATUS_ORDEM.map(status => {
    const doStatus = rows.filter(r => r.status === status)
    return { status, total: doStatus.length, porResponsavel: responsaveis.map(resp => doStatus.filter(r => (r.responsavel ?? SEM_RESP) === resp).length) }
  })
  return { responsaveis, linhas, total: rows.length, totalPorResponsavel: responsaveis.map(resp => rows.filter(r => (r.responsavel ?? SEM_RESP) === resp).length) }
}

// Situação da base migrada (Ativo / Inativo / Nunca girou)
export function situacaoMigrados(rows: ClienteRow[]) {
  const migrados = rows.filter(r => r.status === 'Migrado')
  return {
    total: migrados.length,
    linhas: SITUACOES_MIGRADO.map(s => ({ situacao: s, qtde: migrados.filter(r => r.situacao === s).length })),
  }
}

// Por situação (aba Receita): clientes, lotes 12m, receita 12m
export function porSituacao(rows: ClienteRow[]) {
  const ordem: Situacao[] = ['Ativo', 'Inativo', 'Nunca girou', 'Em processamento', 'Recusou']
  return ordem.map(s => {
    const do_ = rows.filter(r => r.situacao === s)
    return { situacao: s, clientes: do_.length, lotes12m: do_.reduce((a, r) => a + r.lotes_12m, 0), receita12m: do_.reduce((a, r) => a + r.receita_12m, 0), receitaMes: do_.reduce((a, r) => a + r.receita_mes, 0) }
  }).filter(l => l.clientes > 0)
}

export function mediana(valores: number[]): number {
  if (!valores.length) return 0
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}
