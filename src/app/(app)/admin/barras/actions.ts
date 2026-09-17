'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth/getProfile'
import { isCorretora } from '@/lib/corretoras'

async function adminOnly() {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Não autorizado')
}

export async function fetchBarras() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('barras')
    .select('nome, corretora, assessor_id, influenciador_id')
  return data ?? []
}

export async function criarBarra(nome: string, corretora: string, assessorId: string | null, influenciadorId: string | null) {
  await adminOnly()
  if (!isCorretora(corretora)) return { error: 'Corretora inválida' }
  const supabase = createAdminClient()
  const { error } = await supabase.from('barras').insert({
    nome: nome.trim(),
    corretora,
    assessor_id: assessorId || null,
    influenciador_id: influenciadorId || null,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/barras')
  return { ok: true }
}

export async function atualizarBarra(id: string, nome: string, corretora: string, assessorId: string | null, influenciadorId: string | null) {
  await adminOnly()
  if (!isCorretora(corretora)) return { error: 'Corretora inválida' }
  const supabase = createAdminClient()
  const { error } = await supabase.from('barras').update({
    nome: nome.trim(),
    corretora,
    assessor_id: assessorId || null,
    influenciador_id: influenciadorId || null,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/barras')
  return { ok: true }
}

export async function deletarBarra(id: string) {
  await adminOnly()
  const supabase = createAdminClient()
  const { error } = await supabase.from('barras').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/barras')
  return { ok: true }
}
