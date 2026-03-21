'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth/getProfile'
import { revalidatePath } from 'next/cache'

export async function criarLead(form: {
  nome: string
  email: string
  telefone: string
  origem: string
  observacoes: string
}) {
  const supabase = await createClient()
  const profile = await getProfile()

  const { data: etapas } = await supabase
    .from('funil_etapas')
    .select('id')
    .order('ordem')
    .limit(1)

  await supabase.from('leads').insert({
    nome: form.nome,
    email: form.email || null,
    telefone: form.telefone || null,
    origem: form.origem || null,
    observacoes: form.observacoes || null,
    etapa_id: etapas?.[0]?.id ?? null,
    vendedor_id: profile?.id ?? null,
    status: 'ativo',
  })

  revalidatePath('/crm')
}

export async function moverEtapa(leadId: string, etapaId: string, observacao: string | null) {
  const supabase = await createClient()
  const profile = await getProfile()

  const { data: lead } = await supabase
    .from('leads')
    .select('etapa_id')
    .eq('id', leadId)
    .single()

  await supabase.from('leads').update({ etapa_id: etapaId }).eq('id', leadId)

  await supabase.from('lead_historico').insert({
    lead_id: leadId,
    etapa_anterior_id: lead?.etapa_id ?? null,
    etapa_nova_id: etapaId,
    vendedor_id: profile?.id ?? null,
    observacao: observacao || null,
  })

  revalidatePath('/crm')
  revalidatePath(`/crm/${leadId}`)
}

export async function marcarPerdido(leadId: string, motivo: string) {
  const supabase = await createClient()

  await supabase
    .from('leads')
    .update({ status: 'perdido', motivo_perda: motivo || null })
    .eq('id', leadId)

  revalidatePath('/crm')
  revalidatePath(`/crm/${leadId}`)
}

export async function atualizarTemperatura(leadId: string, temperatura: string | null) {
  const supabase = await createClient()
  await supabase.from('leads').update({ temperatura }).eq('id', leadId)
  revalidatePath(`/crm/${leadId}`)
  revalidatePath('/crm')
}

export async function adicionarNota(leadId: string, conteudo: string) {
  const supabase = await createClient()
  const profile = await getProfile()

  await supabase.from('lead_notas').insert({
    lead_id: leadId,
    autor_id: profile?.id ?? null,
    conteudo,
  })

  revalidatePath(`/crm/${leadId}`)
}

export async function atualizarStatusEmMassa(leadIds: string[], status: string) {
  const supabase = await createClient()
  await supabase.from('leads').update({ status }).in('id', leadIds)
  revalidatePath('/crm')
}

export async function atribuirAssessorEmMassa(leadIds: string[], assessorId: string) {
  const supabase = await createClient()
  await supabase.from('leads').update({ vendedor_id: assessorId }).in('id', leadIds)
  revalidatePath('/crm')
}

export async function moverEtapaEmMassa(leadIds: string[], etapaId: string) {
  const supabase = await createClient()
  const profile = await getProfile()

  for (const leadId of leadIds) {
    const { data: lead } = await supabase
      .from('leads')
      .select('etapa_id')
      .eq('id', leadId)
      .single()

    await supabase.from('leads').update({ etapa_id: etapaId }).eq('id', leadId)
    await supabase.from('lead_historico').insert({
      lead_id: leadId,
      etapa_anterior_id: lead?.etapa_id ?? null,
      etapa_nova_id: etapaId,
      vendedor_id: profile?.id ?? null,
      observacao: 'Movido em massa',
    })
  }

  revalidatePath('/crm')
}

export async function deletarLead(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/crm')
  return { ok: true }
}

export async function deletarLeadsEmMassa(ids: string[]) {
  if (!ids.length) return { error: 'Nenhum ID fornecido' }
  const supabase = createAdminClient()
  const BATCH = 100
  for (let i = 0; i < ids.length; i += BATCH) {
    const { error } = await supabase.from('leads').delete().in('id', ids.slice(i, i + BATCH))
    if (error) return { error: error.message }
  }
  revalidatePath('/crm')
  return { ok: true }
}

export async function converterParaCliente(
  leadId: string,
  cpf: string,
  assessorId: string | null,
) {
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (!lead) throw new Error('Lead não encontrado')

  const cpfLimpo = cpf.replace(/\D/g, '')
  if (cpfLimpo.length !== 11) throw new Error('CPF inválido')

  const { data: cliente, error } = await supabase
    .from('clientes')
    .insert({
      cpf: cpfLimpo,
      nome: lead.nome,
      email: lead.email || null,
      telefone: lead.telefone || null,
      assessor_id: assessorId || null,
      influenciador_id: lead.influenciador_id || null,
      status: 'ativo',
      observacoes: lead.observacoes || null,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message.includes('unique') ? 'Já existe um cliente com este CPF.' : error.message)

  await supabase.from('leads').update({ status: 'convertido' }).eq('id', leadId)

  revalidatePath('/crm')
  revalidatePath('/clientes')

  return cliente.id
}
