'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function fetchBarras() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('barras')
    .select('nome, assessor_id, influenciador_id')
  return data ?? []
}

export async function criarBarra(nome: string, assessorId: string | null, influenciadorId: string | null) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('barras').insert({
    nome: nome.trim(),
    assessor_id: assessorId || null,
    influenciador_id: influenciadorId || null,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/barras')
  return { ok: true }
}

export async function atualizarBarra(id: string, nome: string, assessorId: string | null, influenciadorId: string | null) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('barras').update({
    nome: nome.trim(),
    assessor_id: assessorId || null,
    influenciador_id: influenciadorId || null,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/barras')
  return { ok: true }
}

export async function deletarBarra(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('barras').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/barras')
  return { ok: true }
}
