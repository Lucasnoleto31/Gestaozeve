'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth/getProfile'
import { revalidatePath } from 'next/cache'

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

export async function importarContratos(nomeArquivo: string, rows: ContratoRow[]) {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Não autorizado')

  const supabase = createAdminClient()

  const [{ data: clientes }, { data: contas }, { data: barras }] = await Promise.all([
    supabase.from('clientes').select('id, nome, cpf').range(0, 49999),
    supabase.from('cliente_contas').select('cliente_id, numero_conta').range(0, 49999),
    supabase.from('barras').select('nome, assessor_id, influenciador_id').range(0, 49999),
  ])

  const clientesByCpf = new Map<string, string>()
  const clientesByNome = new Map<string, string>()
  const contasByNumero = new Map<string, string>()
  const barraMap = new Map<string, { assessor_id: string | null; influenciador_id: string | null }>()

  for (const c of clientes ?? []) {
    if (c.cpf) clientesByCpf.set(c.cpf.replace(/\D/g, ''), c.id)
    clientesByNome.set(c.nome.toLowerCase().trim(), c.id)
  }
  for (const conta of contas ?? []) {
    if (conta.numero_conta) contasByNumero.set(conta.numero_conta.trim(), conta.cliente_id)
  }
  for (const b of barras ?? []) {
    barraMap.set(b.nome.toUpperCase().trim(), { assessor_id: b.assessor_id, influenciador_id: b.influenciador_id })
  }

  const totalLotesOperados = rows.reduce((s, r) => s + (r.lotes_operados || 0), 0)
  const totalLotesZerados = rows.reduce((s, r) => s + (r.lotes_zerados || 0), 0)

  const { data: importacao, error: impError } = await supabase
    .from('contratos_importacoes')
    .insert({
      nome_arquivo: nomeArquivo,
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

    // Resolve cliente: conta sinacor > CPF > nome
    let clienteId: string | null = null
    if (numeroConta && contasByNumero.has(numeroConta)) {
      clienteId = contasByNumero.get(numeroConta)!
    } else if (cpfLimpo && clientesByCpf.has(cpfLimpo)) {
      clienteId = clientesByCpf.get(cpfLimpo)!
    } else {
      clienteId = clientesByNome.get(row.cliente_nome?.toLowerCase().trim() ?? '') ?? null
    }

    // Resolve assessor via barras
    let assessorId: string | null = null
    if (row.assessor_nome) {
      const barra = barraMap.get(row.assessor_nome.toUpperCase().trim())
      if (barra) assessorId = barra.assessor_id
    }

    return {
      importacao_id: importacao.id,
      cliente_id: clienteId,
      assessor_id: assessorId,
      data: row.data || null,
      numero_conta: row.numero_conta || null,
      cpf: row.cpf || null,
      cnpj: row.cnpj || null,
      cliente_nome: row.cliente_nome || null,
      assessor_nome: row.assessor_nome || null,
      ativo: row.ativo || null,
      plataforma: row.plataforma || null,
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
  return { ok: inseridos }
}

export async function deletarImportacaoContrato(importacaoId: string) {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Não autorizado')

  const supabase = createAdminClient()
  await supabase.from('contratos_importacoes').delete().eq('id', importacaoId)
  revalidatePath('/admin/contratos')
}
