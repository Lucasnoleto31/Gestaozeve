'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth/getProfile'
import { revalidatePath } from 'next/cache'

export interface ReceitaRow {
  assessor_nome: string
  tipo_produto: string
  produto: string
  cod_sinacor: string
  cpf_cnpj: string
  cliente_nome: string
  data_receita: string
  receita_genial: number
  repasse_aai: number
  repasse_assessor: number
  valor_bruto_aai: number
  imposto: number
  valor_liquido_aai: number
  comissao_assessor: number
  descricao: string
}

export async function importarReceitas(nomeArquivo: string, rows: ReceitaRow[]) {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Não autorizado')

  const supabase = createAdminClient()

  // Busca clientes, contas e barras para matching
  const [{ data: clientes }, { data: contas }, { data: barras }] = await Promise.all([
    supabase.from('clientes').select('id, nome, cpf'),
    supabase.from('cliente_contas').select('cliente_id, numero_conta'),
    supabase.from('barras').select('nome, assessor_id, influenciador_id'),
  ])

  // Mapas para lookup rápido
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

  // Cria o lote de importação
  const valorTotal = rows.reduce((sum, r) => sum + (r.valor_liquido_aai || 0), 0)
  const { data: importacao, error: impError } = await supabase
    .from('receitas_importacoes')
    .insert({
      nome_arquivo: nomeArquivo,
      total_linhas: rows.length,
      valor_liquido_total: valorTotal,
      criado_por: profile.id,
    })
    .select('id')
    .single()

  if (impError) throw new Error(impError.message)

  // Mapeia cada linha e tenta vincular ao cliente/assessor do sistema
  const receitasToInsert = rows.map((row) => {
    const cpfLimpo = row.cpf_cnpj?.replace(/\D/g, '') ?? ''
    const codSinacor = row.cod_sinacor?.trim() ?? ''

    let clienteId: string | null = null
    // Prioridade: conta sinacor > CPF > nome
    if (codSinacor && contasByNumero.has(codSinacor)) {
      clienteId = contasByNumero.get(codSinacor)!
    } else if (cpfLimpo && clientesByCpf.has(cpfLimpo)) {
      clienteId = clientesByCpf.get(cpfLimpo)!
    } else {
      const nomeKey = row.cliente_nome?.toLowerCase().trim() ?? ''
      clienteId = clientesByNome.get(nomeKey) ?? null
    }

    // Resolve assessor/influenciador via barras (mesmo padrão da página de clientes)
    let assessorId: string | null = null
    if (row.assessor_nome) {
      const barra = barraMap.get(row.assessor_nome.toUpperCase().trim())
      if (barra) {
        assessorId = barra.assessor_id
      }
    }

    return {
      importacao_id: importacao.id,
      cliente_id: clienteId,
      assessor_id: assessorId,
      assessor_nome: row.assessor_nome || null,
      tipo_produto: row.tipo_produto || null,
      produto: row.produto || null,
      cod_sinacor: row.cod_sinacor || null,
      cpf_cnpj: row.cpf_cnpj || null,
      cliente_nome: row.cliente_nome || null,
      data_receita: row.data_receita || null,
      receita_genial: row.receita_genial || 0,
      repasse_aai: row.repasse_aai || 0,
      repasse_assessor: row.repasse_assessor || 0,
      valor_bruto_aai: row.valor_bruto_aai || 0,
      imposto: row.imposto || 0,
      valor_liquido_aai: row.valor_liquido_aai || 0,
      comissao_assessor: row.comissao_assessor || 0,
      descricao: row.descricao || null,
    }
  })

  const { error: insertError } = await supabase.from('receitas').insert(receitasToInsert)
  if (insertError) throw new Error(insertError.message)

  revalidatePath('/admin/receitas')
  return { ok: rows.length, importacaoId: importacao.id }
}

export async function deletarReceitas(ids: string[]) {
  if (!ids.length) return { error: 'Nenhum ID fornecido' }
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Não autorizado')
  const supabase = createAdminClient()
  const BATCH = 100
  for (let i = 0; i < ids.length; i += BATCH) {
    const { error } = await supabase.from('receitas').delete().in('id', ids.slice(i, i + BATCH))
    if (error) return { error: error.message }
  }
  revalidatePath('/admin/receitas')
  return { ok: true }
}

export async function deletarImportacao(importacaoId: string) {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Não autorizado')

  const supabase = createAdminClient()
  await supabase.from('receitas_importacoes').delete().eq('id', importacaoId)
  revalidatePath('/admin/receitas')
}
