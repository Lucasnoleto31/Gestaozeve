'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'

export type MetaRow = {
  ano: number
  meta_lotes: number
  meta_receita: number
  observacao: string | null
  updated_at: string
}

async function adminOnly() {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Não autorizado')
  return await createClient()
}

export async function listMetas(): Promise<MetaRow[]> {
  const supabase = await adminOnly()
  const { data, error } = await supabase
    .from('metas_anuais')
    .select('*')
    .order('ano', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ano: Number(r.ano),
    meta_lotes: Number(r.meta_lotes ?? 0),
    meta_receita: Number(r.meta_receita ?? 0),
    observacao: r.observacao ? String(r.observacao) : null,
    updated_at: String(r.updated_at ?? ''),
  }))
}

export async function saveMeta(input: MetaRow): Promise<{ ok: true }> {
  const supabase = await adminOnly()
  const { error } = await supabase.from('metas_anuais').upsert({
    ano: input.ano,
    meta_lotes: input.meta_lotes,
    meta_receita: input.meta_receita,
    observacao: input.observacao,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'ano' })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/metas')
  return { ok: true }
}

export async function deleteMeta(ano: number): Promise<{ ok: true }> {
  const supabase = await adminOnly()
  const { error } = await supabase.from('metas_anuais').delete().eq('ano', ano)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/metas')
  return { ok: true }
}
