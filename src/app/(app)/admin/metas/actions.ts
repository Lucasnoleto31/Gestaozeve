'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { isEscopoMeta, type EscopoMeta } from '@/lib/corretoras'

// Uma meta por (ano, escopo). Escopo TOTAL = escritório inteiro; os demais são
// metas de cada corretora (supabase-s13).
export type MetaRow = {
  ano: number
  corretora: EscopoMeta
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
  const ordem: EscopoMeta[] = ['TOTAL', 'GENIAL', 'XP', 'BTG']
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({
      ano: Number(r.ano),
      corretora: isEscopoMeta(r.corretora) ? r.corretora : 'TOTAL',
      meta_lotes: Number(r.meta_lotes ?? 0),
      meta_receita: Number(r.meta_receita ?? 0),
      observacao: r.observacao ? String(r.observacao) : null,
      updated_at: String(r.updated_at ?? ''),
    }))
    .sort((a, b) => b.ano - a.ano || ordem.indexOf(a.corretora) - ordem.indexOf(b.corretora))
}

export async function saveMeta(input: MetaRow): Promise<{ ok: true }> {
  const supabase = await adminOnly()
  if (!isEscopoMeta(input.corretora)) throw new Error('Escopo inválido')
  const { error } = await supabase.from('metas_anuais').upsert({
    ano: input.ano,
    corretora: input.corretora,
    meta_lotes: input.meta_lotes,
    meta_receita: input.meta_receita,
    observacao: input.observacao,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'ano,corretora' })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/metas')
  return { ok: true }
}

export async function deleteMeta(ano: number, corretora: EscopoMeta): Promise<{ ok: true }> {
  const supabase = await adminOnly()
  const { error } = await supabase.from('metas_anuais').delete().eq('ano', ano).eq('corretora', corretora)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/metas')
  return { ok: true }
}
