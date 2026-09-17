'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth/getProfile'
import { revalidatePath } from 'next/cache'
import { isCorretora, type Corretora } from '@/lib/corretoras'
import { normalizarBarra, normalizarNome, pareceNomeDePlataforma } from '@/lib/texto'

export interface ContratoRow {
  data: string
  numero_conta: string
  cpf: string
  cnpj: string
  cliente_nome: string
  assessor_nome: string
  ativo: string
  plataforma: string
  lotes_operados: number
  lotes_zerados: number
}

async function adminOnly() {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Não autorizado')
  return profile
}

// Barras cadastradas (tabela barras + tarifas) de uma corretora, já normalizadas
async function barrasConhecidas(corretora: Corretora): Promise<Set<string>> {
  const supabase = createAdminClient()
  const [{ data: barras }, { data: tarifas }] = await Promise.all([
    supabase.from('barras').select('nome').eq('corretora', corretora).range(0, 9999),
    supabase.from('assessor_pricing').select('barra_nome').eq('corretora', corretora).eq('ativo', true).range(0, 9999),
  ])
  const set = new Set<string>()
  for (const b of barras ?? []) set.add(normalizarBarra(b.nome))
  for (const t of tarifas ?? []) set.add(normalizarBarra(t.barra_nome))
  return set
}

export type ChecagemImportacao = {
  desconhecidas: { nome: string; linhas: number; lotes: number }[]   // barras que não existem no cadastro da corretora
  parecemPlataforma: string[]                                        // nomes de plataforma na coluna de assessor
  semBarra: { linhas: number; lotes: number }                        // linhas sem assessor
}

// Checagem antes de gravar: barras desconhecidas, plataforma no lugar da barra, linhas sem barra.
export async function checarImportacao(corretora: Corretora, rows: ContratoRow[]): Promise<ChecagemImportacao> {
  await adminOnly()
  if (!isCorretora(corretora)) throw new Error('Corretora inválida')
  const conhecidas = await barrasConhecidas(corretora)

  const porBarra = new Map<string, { nome: string; linhas: number; lotes: number }>()
  const semBarra = { linhas: 0, lotes: 0 }
  const plataforma = new Set<string>()
  for (const r of rows) {
    const nome = normalizarBarra(r.assessor_nome)
    if (!nome) { semBarra.linhas++; semBarra.lotes += r.lotes_operados || 0; continue }
    if (pareceNomeDePlataforma(nome)) { plataforma.add(nome); continue }
    if (conhecidas.has(nome)) continue
    const acc = porBarra.get(nome) ?? { nome, linhas: 0, lotes: 0 }
    acc.linhas++; acc.lotes += r.lotes_operados || 0
    porBarra.set(nome, acc)
  }
  return {
    desconhecidas: Array.from(porBarra.values()).sort((a, b) => b.lotes - a.lotes),
    parecemPlataforma: Array.from(plataforma),
    semBarra,
  }
}

// Cada arquivo importado pertence a UMA corretora (escolhida no modal).
// A corretora vai para a importação e para cada linha de contratos.
export async function importarContratos(nomeArquivo: string, corretora: Corretora, rows: ContratoRow[]) {
  const profile = await adminOnly()
  if (!isCorretora(corretora)) throw new Error('Escolha a corretora do arquivo (Genial, XP ou BTG).')

  const supabase = createAdminClient()

  const [{ data: clientes }, { data: contas }, { data: barras }] = await Promise.all([
    supabase.from('clientes').select('id, nome, cpf').range(0, 49999),
    supabase.from('cliente_contas').select('cliente_id, numero_conta').range(0, 49999),
    supabase.from('barras').select('nome, corretora, assessor_id, influenciador_id').range(0, 49999),
  ])

  const clientesByCpf = new Map<string, string>()
  const clientesByNome = new Map<string, string>()
  const contasByNumero = new Map<string, string>()
  // Barras são de uma corretora só: a chave é (corretora, nome normalizado)
  const barraMap = new Map<string, { assessor_id: string | null; influenciador_id: string | null }>()

  for (const c of clientes ?? []) {
    if (c.cpf) clientesByCpf.set(c.cpf.replace(/\D/g, ''), c.id)
    clientesByNome.set(c.nome.toLowerCase().trim(), c.id)
  }
  for (const conta of contas ?? []) {
    if (conta.numero_conta) contasByNumero.set(conta.numero_conta.trim(), conta.cliente_id)
  }
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
    const cpfLimpo = row.cpf?.replace(/\D/g, '') ?? ''
    const numeroConta = row.numero_conta?.trim() ?? ''
    const clienteNome = normalizarNome(row.cliente_nome)
    // Nome da barra limpo (acentos quebrados, espaços, maiúsculas) — é o que os
    // dashboards agrupam e o que casa com barras/tarifas. Plataforma na coluna
    // de assessor vira "Sem barra" (e preenche a plataforma se ela veio vazia).
    const barraBruta = normalizarBarra(row.assessor_nome)
    const ehPlataforma = !!barraBruta && pareceNomeDePlataforma(barraBruta)
    const barraNome = ehPlataforma ? '' : barraBruta
    const plataforma = (row.plataforma || '').trim().toUpperCase() || (ehPlataforma ? barraBruta : '')

    // Resolve cliente: conta sinacor > CPF > nome
    let clienteId: string | null = null
    if (numeroConta && contasByNumero.has(numeroConta)) {
      clienteId = contasByNumero.get(numeroConta)!
    } else if (cpfLimpo && clientesByCpf.has(cpfLimpo)) {
      clienteId = clientesByCpf.get(cpfLimpo)!
    } else {
      clienteId = clientesByNome.get(clienteNome.toLowerCase()) ?? null
    }

    // Resolve assessor via barras da corretora do arquivo
    let assessorId: string | null = null
    if (barraNome) {
      const barra = barraMap.get(`${corretora}|${barraNome}`)
      if (barra) assessorId = barra.assessor_id
    }

    return {
      importacao_id: importacao.id,
      corretora,
      cliente_id: clienteId,
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

  revalidatePath('/admin/contratos')
  revalidatePath('/dashboard')
  return { ok: inseridos }
}

export async function deletarImportacaoContrato(importacaoId: string) {
  await adminOnly()
  const supabase = createAdminClient()
  await supabase.from('contratos_importacoes').delete().eq('id', importacaoId)
  revalidatePath('/admin/contratos')
  revalidatePath('/dashboard')
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
