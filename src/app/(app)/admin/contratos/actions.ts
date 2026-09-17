'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth/getProfile'
import { revalidatePath } from 'next/cache'
import { isCorretora, type Corretora } from '@/lib/corretoras'
import { normalizarBarra, normalizarNome, pareceNomeDePlataforma } from '@/lib/texto'
import type { ContratoRow } from '@/lib/importacao/parse'

type Admin = ReturnType<typeof createAdminClient>

async function adminOnly() {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Não autorizado')
  return profile
}

const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')
// Documento da linha: CPF ou CNPJ, só dígitos (vazio quando não há)
const documentoDe = (r: { cpf?: string | null; cnpj?: string | null }) => soDigitos(r.cpf) || soDigitos(r.cnpj)
const unicos = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)))
function lotes<T>(arr: T[], tamanho: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += tamanho) out.push(arr.slice(i, i + tamanho))
  return out
}

// Barra da linha como o sistema grava: normalizada; plataforma no lugar da barra = sem barra
function barraDaLinha(r: ContratoRow): { barra: string; ehPlataforma: boolean } {
  const bruta = normalizarBarra(r.assessor_nome)
  const ehPlataforma = !!bruta && pareceNomeDePlataforma(bruta)
  return { barra: ehPlataforma ? '' : bruta, ehPlataforma }
}

// Barras cadastradas (tabela barras + tarifas) de uma corretora, já normalizadas
async function barrasConhecidas(supabase: Admin, corretora: Corretora): Promise<Set<string>> {
  const [{ data: barras }, { data: tarifas }] = await Promise.all([
    supabase.from('barras').select('nome').eq('corretora', corretora).range(0, 9999),
    supabase.from('assessor_pricing').select('barra_nome').eq('corretora', corretora).eq('ativo', true).range(0, 9999),
  ])
  const set = new Set<string>()
  for (const b of barras ?? []) set.add(normalizarBarra(b.nome))
  for (const t of tarifas ?? []) set.add(normalizarBarra(t.barra_nome))
  return set
}

function periodoDasLinhas(rows: ContratoRow[]): { inicio: string | null; fim: string | null } {
  const datas = rows.map(r => r.data).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  return { inicio: datas[0] ?? null, fim: datas[datas.length - 1] ?? null }
}

// -----------------------------------------------------------
// Duplicidade: mesmo arquivo já importado / período já coberto
// -----------------------------------------------------------
export type SobreposicaoImportacao = {
  importacao_id: string
  nome_arquivo: string
  created_at: string
  linhas: number
  lotes_operados: number
  data_min: string | null
  data_max: string | null
}

export type Duplicidade = {
  mesmoArquivo: { id: string; created_at: string; total_linhas: number } | null
  // linhas já existentes da corretora dentro do período do arquivo
  sobreposicao: { linhas: number; lotes: number; importacoes: SobreposicaoImportacao[] } | null
}

async function checarDuplicidade(
  supabase: Admin, corretora: Corretora, nomeArquivo: string,
  periodo: { inicio: string | null; fim: string | null },
): Promise<Duplicidade> {
  const { data: mesmo } = await supabase
    .from('contratos_importacoes')
    .select('id, created_at, total_linhas')
    .eq('corretora', corretora)
    .eq('nome_arquivo', nomeArquivo)
    .order('created_at', { ascending: false })
    .limit(1)
  const m = (mesmo ?? [])[0] as { id: string; created_at: string; total_linhas: number } | undefined
  const mesmoArquivo = m ? { id: m.id, created_at: m.created_at, total_linhas: Number(m.total_linhas ?? 0) } : null

  let sobreposicao: Duplicidade['sobreposicao'] = null
  if (periodo.inicio && periodo.fim) {
    const { data, error } = await supabase.rpc('contratos_sobreposicao', {
      p_corretora: corretora, p_inicio: periodo.inicio, p_fim: periodo.fim,
    })
    if (!error) {
      const importacoes = ((data ?? []) as Record<string, unknown>[]).map(r => ({
        importacao_id: String(r.importacao_id),
        nome_arquivo: String(r.nome_arquivo ?? ''),
        created_at: String(r.created_at ?? ''),
        linhas: Number(r.linhas ?? 0),
        lotes_operados: Number(r.lotes_operados ?? 0),
        data_min: r.data_min ? String(r.data_min) : null,
        data_max: r.data_max ? String(r.data_max) : null,
      }))
      if (importacoes.length > 0) {
        sobreposicao = {
          linhas: importacoes.reduce((s, i) => s + i.linhas, 0),
          lotes: importacoes.reduce((s, i) => s + i.lotes_operados, 0),
          importacoes,
        }
      }
    } else {
      // Antes do supabase-s16: só conta as linhas no período
      const { count } = await supabase
        .from('contratos')
        .select('id', { count: 'exact', head: true })
        .eq('corretora', corretora)
        .gte('data', periodo.inicio)
        .lte('data', periodo.fim)
      if (count && count > 0) sobreposicao = { linhas: count, lotes: 0, importacoes: [] }
    }
  }
  return { mesmoArquivo, sobreposicao }
}

// Quantas linhas sem barra vão ganhar barra pelo cliente (conta ou documento já conhecidos)
async function contarAtribuiveis(
  supabase: Admin, corretora: Corretora, rows: ContratoRow[],
): Promise<{ linhas: number; lotes: number } | null> {
  const semBarra = rows.filter(r => !barraDaLinha(r).barra)
  if (semBarra.length === 0) return { linhas: 0, lotes: 0 }
  const contas = unicos(semBarra.map(r => (r.numero_conta ?? '').trim()))
  const docs = unicos(semBarra.map(r => (r.cpf ?? '').trim() || (r.cnpj ?? '').trim()))
  const contasConhecidas = new Set<string>()
  const docsConhecidos = new Set<string>()
  const chunksContas = lotes(contas, 500)
  const chunksDocs = lotes(docs, 500)
  const n = Math.max(chunksContas.length, chunksDocs.length)
  for (let i = 0; i < n; i++) {
    const { data, error } = await supabase.rpc('contratos_chaves_com_barra', {
      p_corretora: corretora, p_contas: chunksContas[i] ?? [], p_docs: chunksDocs[i] ?? [],
    })
    if (error) return null   // RPC ainda não existe (supabase-s16)
    for (const r of (data ?? []) as { tipo: string; chave: string }[]) {
      if (r.tipo === 'conta') contasConhecidas.add(r.chave)
      else docsConhecidos.add(r.chave)
    }
  }
  let linhas = 0, lotesAtrib = 0
  for (const r of semBarra) {
    const conta = (r.numero_conta ?? '').trim()
    const doc = (r.cpf ?? '').trim() || (r.cnpj ?? '').trim()
    if ((conta && contasConhecidas.has(conta)) || (doc && docsConhecidos.has(doc))) {
      linhas++; lotesAtrib += r.lotes_operados || 0
    }
  }
  return { linhas, lotes: lotesAtrib }
}

export type ChecagemImportacao = {
  desconhecidas: { nome: string; linhas: number; lotes: number }[]   // barras que não existem no cadastro da corretora
  parecemPlataforma: string[]                                        // nomes de plataforma na coluna de assessor
  semBarra: {
    linhas: number
    lotes: number
    atribuiveis: { linhas: number; lotes: number } | null            // null = sem supabase-s16
  }
  periodo: { inicio: string | null; fim: string | null }
  duplicidade: Duplicidade
}

// Checagem antes de gravar: barras desconhecidas, plataforma no lugar da
// barra, linhas sem barra (e quantas ganham barra pelo cliente), duplicidade.
export async function checarImportacao(corretora: Corretora, nomeArquivo: string, rows: ContratoRow[]): Promise<ChecagemImportacao> {
  await adminOnly()
  if (!isCorretora(corretora)) throw new Error('Corretora inválida')
  const supabase = createAdminClient()
  const periodo = periodoDasLinhas(rows)

  const [conhecidas, duplicidade, atribuiveis] = await Promise.all([
    barrasConhecidas(supabase, corretora),
    checarDuplicidade(supabase, corretora, nomeArquivo, periodo),
    contarAtribuiveis(supabase, corretora, rows),
  ])

  const porBarra = new Map<string, { nome: string; linhas: number; lotes: number }>()
  const semBarra = { linhas: 0, lotes: 0 }
  const plataforma = new Set<string>()
  for (const r of rows) {
    const { barra, ehPlataforma } = barraDaLinha(r)
    if (ehPlataforma) plataforma.add(normalizarBarra(r.assessor_nome))
    if (!barra) { semBarra.linhas++; semBarra.lotes += r.lotes_operados || 0; continue }
    if (conhecidas.has(barra)) continue
    const acc = porBarra.get(barra) ?? { nome: barra, linhas: 0, lotes: 0 }
    acc.linhas++; acc.lotes += r.lotes_operados || 0
    porBarra.set(barra, acc)
  }
  return {
    desconhecidas: Array.from(porBarra.values()).sort((a, b) => b.lotes - a.lotes),
    parecemPlataforma: Array.from(plataforma),
    semBarra: { ...semBarra, atribuiveis },
    periodo,
    duplicidade,
  }
}

// -----------------------------------------------------------
// Clientes únicos por CPF/CNPJ: cria o que não existe e liga contas
// -----------------------------------------------------------
async function resolverClientes(supabase: Admin, corretora: Corretora, rows: ContratoRow[]) {
  const [{ data: clientes }, { data: contas }] = await Promise.all([
    supabase.from('clientes').select('id, nome, cpf').range(0, 49999),
    supabase.from('cliente_contas').select('cliente_id, numero_conta, corretora').range(0, 49999),
  ])

  const porDoc = new Map<string, string>()
  const porNome = new Map<string, string>()
  // conta → cliente: com corretora quando a coluna existe; '*' = conta antiga sem corretora
  const porConta = new Map<string, string>()
  for (const c of clientes ?? []) {
    const doc = soDigitos(c.cpf)
    if (doc) porDoc.set(doc, c.id)
    if (c.nome) porNome.set(String(c.nome).toLowerCase().trim(), c.id)
  }
  for (const conta of (contas ?? []) as { cliente_id: string; numero_conta: string; corretora?: string | null }[]) {
    if (!conta.numero_conta) continue
    porConta.set(`${conta.corretora ?? '*'}|${conta.numero_conta.trim()}`, conta.cliente_id)
  }

  // Clientes novos (documento com 11–14 dígitos que ainda não existe)
  const novos = new Map<string, { cpf: string; nome: string; corretora_origem: string }>()
  for (const r of rows) {
    const doc = documentoDe(r)
    if (!doc || doc.length < 11 || doc.length > 14 || porDoc.has(doc) || novos.has(doc)) continue
    const nome = normalizarNome(r.cliente_nome)
    if (!nome) continue
    novos.set(doc, { cpf: doc, nome, corretora_origem: corretora })
  }
  for (const chunk of lotes(Array.from(novos.values()), 500)) {
    const { data, error } = await supabase.from('clientes').insert(chunk).select('id, cpf')
    if (error) throw new Error(`Falha ao cadastrar clientes: ${error.message}`)
    for (const c of (data ?? []) as { id: string; cpf: string }[]) porDoc.set(soDigitos(c.cpf), c.id)
  }

  // Contas novas (conta + corretora) ligadas ao cliente do documento
  const novasContas = new Map<string, { cliente_id: string; numero_conta: string; corretora: string }>()
  for (const r of rows) {
    const conta = (r.numero_conta ?? '').trim()
    if (!conta) continue
    const chave = `${corretora}|${conta}`
    if (porConta.has(chave) || porConta.has(`*|${conta}`) || novasContas.has(chave)) continue
    const cid = porDoc.get(documentoDe(r))
    if (!cid) continue
    novasContas.set(chave, { cliente_id: cid, numero_conta: conta, corretora })
  }
  for (const chunk of lotes(Array.from(novasContas.values()), 500)) {
    let { error } = await supabase.from('cliente_contas').insert(chunk)
    if (error) {
      // Antes do supabase-s16 a coluna corretora não existe
      ;({ error } = await supabase.from('cliente_contas').insert(chunk.map(({ cliente_id, numero_conta }) => ({ cliente_id, numero_conta }))))
    }
    if (error) throw new Error(`Falha ao cadastrar contas: ${error.message}`)
    for (const c of chunk) porConta.set(`${c.corretora}|${c.numero_conta}`, c.cliente_id)
  }

  // Resolve: conta → documento → nome
  return (r: ContratoRow): string | null => {
    const conta = (r.numero_conta ?? '').trim()
    if (conta) {
      const id = porConta.get(`${corretora}|${conta}`) ?? porConta.get(`*|${conta}`)
      if (id) return id
    }
    const doc = documentoDe(r)
    if (doc && porDoc.has(doc)) return porDoc.get(doc)!
    return porNome.get(normalizarNome(r.cliente_nome).toLowerCase()) ?? null
  }
}

async function registrarLog(supabase: Admin, registro: {
  importacao_id: string; nome_arquivo: string; corretora: string
  total_linhas: number; total_lotes_operados: number
  acao: 'importou' | 'desfez'; usuario_id: string; usuario_nome: string
}) {
  // Tabela chega com o supabase-s16; sem ela, segue sem log
  await supabase.from('contratos_importacoes_log').insert(registro)
}

// -----------------------------------------------------------
// Importar
// -----------------------------------------------------------
export type OpcoesImportacao = {
  // true = importar mesmo com arquivo/período já importado (correção consciente)
  forcar?: boolean
}

// Cada arquivo importado pertence a UMA corretora (escolhida no modal).
// A corretora vai para a importação e para cada linha de contratos.
export async function importarContratos(
  nomeArquivo: string, corretora: Corretora, rows: ContratoRow[], opcoes: OpcoesImportacao = {},
): Promise<{ ok: number; inferidas: number }> {
  const profile = await adminOnly()
  if (!isCorretora(corretora)) throw new Error('Escolha a corretora do arquivo (Genial, XP ou BTG).')
  if (rows.length === 0) throw new Error('Planilha sem linhas.')

  const supabase = createAdminClient()

  // Trava de duplicidade (a mesma checagem do modal, refeita aqui por segurança)
  const periodo = periodoDasLinhas(rows)
  const dup = await checarDuplicidade(supabase, corretora, nomeArquivo, periodo)
  if (!opcoes.forcar && (dup.mesmoArquivo || dup.sobreposicao)) {
    const motivo = dup.mesmoArquivo
      ? `o arquivo "${nomeArquivo}" já foi importado na ${corretora}`
      : `já existem ${dup.sobreposicao!.linhas} linhas da ${corretora} entre ${periodo.inicio} e ${periodo.fim}`
    throw new Error(`Importação bloqueada: ${motivo}. Se for uma correção, marque "importar mesmo assim".`)
  }

  const [resolverCliente, { data: barras }] = await Promise.all([
    resolverClientes(supabase, corretora, rows),
    supabase.from('barras').select('nome, corretora, assessor_id, influenciador_id').range(0, 49999),
  ])

  // Barras são de uma corretora só: a chave é (corretora, nome normalizado)
  const barraMap = new Map<string, { assessor_id: string | null; influenciador_id: string | null }>()
  for (const b of barras ?? []) {
    const corr = String(b.corretora ?? 'GENIAL').toUpperCase()
    barraMap.set(`${corr}|${normalizarBarra(b.nome)}`, { assessor_id: b.assessor_id, influenciador_id: b.influenciador_id })
  }

  const totalLotesOperados = rows.reduce((s, r) => s + (r.lotes_operados || 0), 0)
  const totalLotesZerados = rows.reduce((s, r) => s + (r.lotes_zerados || 0), 0)

  const { data: importacao, error: impError } = await supabase
    .from('contratos_importacoes')
    .insert({
      nome_arquivo: nomeArquivo,
      corretora,
      total_linhas: rows.length,
      total_lotes_operados: totalLotesOperados,
      total_lotes_zerados: totalLotesZerados,
      criado_por: profile.id,
    })
    .select('id')
    .single()

  if (impError) throw new Error(impError.message)

  const contratosToInsert = rows.map((row) => {
    const numeroConta = row.numero_conta?.trim() ?? ''
    const clienteNome = normalizarNome(row.cliente_nome)
    // Nome da barra limpo (acentos quebrados, espaços, maiúsculas) — é o que os
    // dashboards agrupam e o que casa com barras/tarifas. Plataforma na coluna
    // de assessor vira "Sem barra" (e preenche a plataforma se ela veio vazia).
    const { barra: barraNome, ehPlataforma } = barraDaLinha(row)
    const plataforma = (row.plataforma || '').trim().toUpperCase() || (ehPlataforma ? normalizarBarra(row.assessor_nome) : '')

    let assessorId: string | null = null
    if (barraNome) {
      const barra = barraMap.get(`${corretora}|${barraNome}`)
      if (barra) assessorId = barra.assessor_id
    }

    return {
      importacao_id: importacao.id,
      corretora,
      cliente_id: resolverCliente(row),
      assessor_id: assessorId,
      data: row.data || null,
      numero_conta: numeroConta || null,
      cpf: row.cpf || null,
      cnpj: row.cnpj || null,
      cliente_nome: clienteNome || null,
      assessor_nome: barraNome || null,
      ativo: (row.ativo || '').trim().toUpperCase() || null,
      plataforma: plataforma || null,
      lotes_operados: row.lotes_operados || 0,
      lotes_zerados: row.lotes_zerados || 0,
    }
  })

  // Insere em lotes para evitar estouro de payload/timeout
  const BATCH = 500
  let inseridos = 0
  for (let i = 0; i < contratosToInsert.length; i += BATCH) {
    const chunk = contratosToInsert.slice(i, i + BATCH)
    const { error: insertError } = await supabase.from('contratos').insert(chunk)
    if (insertError) {
      await supabase.from('contratos_importacoes').delete().eq('id', importacao.id)
      throw new Error(
        `Falha ao inserir linhas ${i + 1}-${i + chunk.length}: ${insertError.message}`
      )
    }
    inseridos += chunk.length
  }

  // Linhas sem barra ganham a barra do cliente (supabase-s16); sem a função, segue sem
  let inferidas = 0
  const { data: nInferidas, error: infError } = await supabase.rpc('contratos_inferir_barras', { p_importacao_id: importacao.id })
  if (!infError) inferidas = Number(nInferidas ?? 0)

  await registrarLog(supabase, {
    importacao_id: importacao.id, nome_arquivo: nomeArquivo, corretora,
    total_linhas: rows.length, total_lotes_operados: totalLotesOperados,
    acao: 'importou', usuario_id: profile.id, usuario_nome: profile.nome,
  })

  revalidatePath('/admin/contratos')
  revalidatePath('/dashboard')
  return { ok: inseridos, inferidas }
}

export async function deletarImportacaoContrato(importacaoId: string) {
  const profile = await adminOnly()
  const supabase = createAdminClient()
  const { data: imp } = await supabase
    .from('contratos_importacoes')
    .select('id, nome_arquivo, corretora, total_linhas, total_lotes_operados')
    .eq('id', importacaoId)
    .single()
  const { error } = await supabase.from('contratos_importacoes').delete().eq('id', importacaoId)
  if (error) throw new Error(error.message)
  if (imp) {
    await registrarLog(supabase, {
      importacao_id: imp.id, nome_arquivo: imp.nome_arquivo, corretora: String(imp.corretora ?? ''),
      total_linhas: Number(imp.total_linhas ?? 0), total_lotes_operados: Number(imp.total_lotes_operados ?? 0),
      acao: 'desfez', usuario_id: profile.id, usuario_nome: profile.nome,
    })
  }
  revalidatePath('/admin/contratos')
  revalidatePath('/dashboard')
}

export type LogImportacao = {
  id: string
  importacao_id: string | null
  nome_arquivo: string
  corretora: string
  total_linhas: number
  total_lotes_operados: number
  acao: 'importou' | 'desfez'
  usuario_nome: string | null
  created_at: string
}

// Últimas ações de importação. [] quando a tabela ainda não existe (supabase-s16).
export async function listarLogImportacoes(limit = 30): Promise<LogImportacao[]> {
  await adminOnly()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('contratos_importacoes_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    id: String(r.id),
    importacao_id: r.importacao_id ? String(r.importacao_id) : null,
    nome_arquivo: String(r.nome_arquivo ?? ''),
    corretora: String(r.corretora ?? ''),
    total_linhas: Number(r.total_linhas ?? 0),
    total_lotes_operados: Number(r.total_lotes_operados ?? 0),
    acao: r.acao === 'desfez' ? 'desfez' : 'importou',
    usuario_nome: r.usuario_nome ? String(r.usuario_nome) : null,
    created_at: String(r.created_at ?? ''),
  }))
}

export interface ContratoExportRow {
  data: string | null
  corretora: string
  numero_conta: string | null
  cliente_nome: string | null
  assessor_nome: string | null
  ativo: string | null
  plataforma: string | null
  lotes_operados: number
  lotes_zerados: number
}

export async function exportarTodosContratos(): Promise<ContratoExportRow[]> {
  await adminOnly()
  const supabase = createAdminClient()

  const PAGE = 1000
  let from = 0
  const all: ContratoExportRow[] = []

  while (true) {
    const { data, error } = await supabase
      .from('contratos')
      .select('data, corretora, numero_conta, cliente_nome, assessor_nome, ativo, plataforma, lotes_operados, lotes_zerados, cliente:clientes(nome)')
      .order('data', { ascending: false })
      .range(from, from + PAGE - 1)

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break

    for (const c of data as Array<{
      data: string | null
      corretora: string | null
      numero_conta: string | null
      cliente_nome: string | null
      assessor_nome: string | null
      ativo: string | null
      plataforma: string | null
      lotes_operados: number
      lotes_zerados: number
      cliente: { nome: string } | { nome: string }[] | null
    }>) {
      const clienteRel = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente
      all.push({
        data: c.data,
        corretora: c.corretora ?? 'GENIAL',
        numero_conta: c.numero_conta,
        cliente_nome: clienteRel?.nome ?? c.cliente_nome,
        assessor_nome: c.assessor_nome,
        ativo: c.ativo,
        plataforma: c.plataforma,
        lotes_operados: Number(c.lotes_operados ?? 0),
        lotes_zerados: Number(c.lotes_zerados ?? 0),
      })
    }

    if (data.length < PAGE) break
    from += PAGE
  }

  return all
}
