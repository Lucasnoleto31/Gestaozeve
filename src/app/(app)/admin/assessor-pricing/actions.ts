'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { isCorretora, type Corretora } from '@/lib/corretoras'
import { normalizarBarra } from '@/lib/texto'

export type ModeloZeragem = 'b2b' | 'fixo' | 'mesmo_operado' | 'tiered'

export type PricingRow = {
  id: string
  barra_id: string | null
  corretora: Corretora
  barra_nome: string
  numero: string | null
  preco_lote_futuros: number
  modelo_zeragem: ModeloZeragem
  preco_zeragem: number
  pct_volume_bovespa: number
  observacao: string | null
  ativo: boolean
  updated_at: string
}

export type TierRow = {
  id?: string
  pricing_id: string
  volume_min: number
  volume_max: number | null
  preco_zeragem: number
  ordem: number
}

async function adminOnly() {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Não autorizado')
  return await createClient()
}

export async function listPricing(): Promise<PricingRow[]> {
  const supabase = await adminOnly()
  const { data, error } = await supabase
    .from('assessor_pricing')
    .select('*')
    .order('corretora', { ascending: true })
    .order('barra_nome', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    barra_id: r.barra_id ? String(r.barra_id) : null,
    corretora: isCorretora(r.corretora) ? r.corretora : 'GENIAL',
    barra_nome: String(r.barra_nome ?? ''),
    numero: r.numero ? String(r.numero) : null,
    preco_lote_futuros: Number(r.preco_lote_futuros ?? 0),
    modelo_zeragem: (r.modelo_zeragem ?? 'b2b') as ModeloZeragem,
    preco_zeragem: Number(r.preco_zeragem ?? 0),
    pct_volume_bovespa: Number(r.pct_volume_bovespa ?? 0),
    observacao: r.observacao ? String(r.observacao) : null,
    ativo: Boolean(r.ativo),
    updated_at: String(r.updated_at ?? ''),
  }))
}

export type SavePricingInput = {
  id?: string
  corretora: Corretora
  barra_nome: string
  numero: string | null
  preco_lote_futuros: number
  modelo_zeragem: ModeloZeragem
  preco_zeragem: number
  pct_volume_bovespa: number
  observacao: string | null
}

export async function savePricing(input: SavePricingInput): Promise<{ ok: true; id: string }> {
  const supabase = await adminOnly()
  if (!isCorretora(input.corretora)) throw new Error('Corretora inválida')
  const payload = {
    corretora: input.corretora,
    clearing: input.corretora, // coluna antiga, mantida em sincronia
    barra_nome: input.barra_nome.trim(),
    numero: input.numero?.trim() || null,
    preco_lote_futuros: input.preco_lote_futuros,
    modelo_zeragem: input.modelo_zeragem,
    preco_zeragem: input.preco_zeragem,
    pct_volume_bovespa: input.pct_volume_bovespa,
    observacao: input.observacao?.trim() || null,
    updated_at: new Date().toISOString(),
  }
  if (input.id) {
    const { error } = await supabase.from('assessor_pricing').update(payload).eq('id', input.id)
    if (error) throw new Error(error.message)
    revalidatePath('/admin/assessor-pricing')
    return { ok: true, id: input.id }
  }
  const { data, error } = await supabase.from('assessor_pricing')
    .insert({ ...payload, ativo: true })
    .select('id').single()
  if (error) throw new Error(error.message)
  revalidatePath('/admin/assessor-pricing')
  return { ok: true, id: String((data as { id: string }).id) }
}

export async function deletePricing(id: string): Promise<{ ok: true }> {
  const supabase = await adminOnly()
  const { error } = await supabase.from('assessor_pricing').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/assessor-pricing')
  return { ok: true }
}

// -----------------------------------------------------------
// Faixas de zeragem (modelo 'tiered')
// -----------------------------------------------------------
export async function listTiers(pricingId: string): Promise<TierRow[]> {
  const supabase = await adminOnly()
  const { data, error } = await supabase
    .from('assessor_pricing_zeragem_tier')
    .select('*')
    .eq('pricing_id', pricingId)
    .order('ordem', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id ? String(r.id) : undefined,
    pricing_id: String(r.pricing_id),
    volume_min: Number(r.volume_min ?? 0),
    volume_max: r.volume_max == null ? null : Number(r.volume_max),
    preco_zeragem: Number(r.preco_zeragem ?? 0),
    ordem: Number(r.ordem ?? 0),
  }))
}

// Substitui o conjunto inteiro de faixas — atomic via delete + insert na mesma chamada
export async function saveTiers(pricingId: string, tiers: TierRow[]): Promise<{ ok: true }> {
  const supabase = await adminOnly()
  const { error: delErr } = await supabase
    .from('assessor_pricing_zeragem_tier')
    .delete()
    .eq('pricing_id', pricingId)
  if (delErr) throw new Error(delErr.message)
  if (tiers.length === 0) {
    revalidatePath('/admin/assessor-pricing')
    return { ok: true }
  }
  const payload = tiers.map((t, i) => ({
    pricing_id: pricingId,
    volume_min: t.volume_min,
    volume_max: t.volume_max,
    preco_zeragem: t.preco_zeragem,
    ordem: t.ordem ?? i + 1,
  }))
  const { error } = await supabase.from('assessor_pricing_zeragem_tier').insert(payload)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/assessor-pricing')
  return { ok: true }
}

// -----------------------------------------------------------
// Tarifa por produto fora de WIN/WDO (supabase-s16)
// -----------------------------------------------------------
export type ProdutoPreco = { produto: string; preco_lote: number }

// [] também quando a tabela ainda não existe; `disponivel` diz se o S16 foi aplicado
export async function listPrecosProduto(pricingId: string): Promise<{ precos: ProdutoPreco[]; disponivel: boolean }> {
  const supabase = await adminOnly()
  const { data, error } = await supabase
    .from('assessor_pricing_produto')
    .select('produto, preco_lote')
    .eq('pricing_id', pricingId)
    .order('produto', { ascending: true })
  if (error) return { precos: [], disponivel: false }
  return {
    disponivel: true,
    precos: ((data ?? []) as Record<string, unknown>[]).map(r => ({
      produto: String(r.produto ?? ''), preco_lote: Number(r.preco_lote ?? 0),
    })),
  }
}

// Substitui o conjunto de tarifas por produto da barra (delete + insert)
export async function savePrecosProduto(pricingId: string, precos: ProdutoPreco[]): Promise<{ ok: true }> {
  const supabase = await adminOnly()
  const { error: delErr } = await supabase.from('assessor_pricing_produto').delete().eq('pricing_id', pricingId)
  if (delErr) throw new Error(delErr.message)
  const validos = precos
    .map(p => ({ pricing_id: pricingId, produto: p.produto.trim().toUpperCase(), preco_lote: Number(p.preco_lote) || 0 }))
    .filter(p => p.produto && p.preco_lote > 0)
  if (validos.length > 0) {
    const { error } = await supabase.from('assessor_pricing_produto').insert(validos)
    if (error) throw new Error(error.message)
  }
  revalidatePath('/admin/assessor-pricing')
  return { ok: true }
}

// -----------------------------------------------------------
// Barras que geram lotes mas não têm tarifa cadastrada
// -----------------------------------------------------------
export type BarraSemTarifa = { corretora: Corretora; barra_nome: string; lotes_operados: number }

export async function listBarrasSemTarifa(): Promise<BarraSemTarifa[]> {
  const supabase = await adminOnly()
  const [{ data: barras, error }, { data: pricing }] = await Promise.all([
    supabase.rpc('dashboard_barras_lista'),
    supabase.from('assessor_pricing').select('corretora, barra_nome').eq('ativo', true),
  ])
  if (error) return []   // supabase-s15 não aplicado
  const comTarifa = new Set(((pricing ?? []) as { corretora: string; barra_nome: string }[])
    .map(p => `${String(p.corretora).toUpperCase()}|${normalizarBarra(p.barra_nome)}`))
  return ((barras ?? []) as Record<string, unknown>[])
    .map(r => ({
      corretora: (isCorretora(r.corretora) ? r.corretora : 'GENIAL') as Corretora,
      barra_nome: String(r.barra_nome ?? ''),
      lotes_operados: Number(r.lotes_operados ?? 0),
    }))
    .filter(b => b.barra_nome && b.lotes_operados > 0 && !comTarifa.has(`${b.corretora}|${normalizarBarra(b.barra_nome)}`))
    .sort((a, b) => b.lotes_operados - a.lotes_operados)
}
