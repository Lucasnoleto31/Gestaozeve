// Contexto comum das páginas de corretora (Server Components): valida o segmento
// da URL, resolve o mês de referência e lê os parâmetros de filtro.
import { notFound } from 'next/navigation'
import { CORRETORA_LABEL, CORRETORA_SLUG, corretoraDoSlug, podeVerCorretora, type Corretora } from '@/lib/corretoras'
import { equipe, falha } from './guard'
import { ehIso, parseMes, somarDias, type MesRef } from './meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'

export type Params = Promise<{ corretora: string; id?: string }>
export type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function mesReferencia(corretora: Corretora): Promise<MesRef> {
  const { db } = await equipe()
  const { data, error } = await db.rpc('mes_referencia', { p_corretora: corretora })
  if (error) falha(error, 'mes_referencia')
  return parseMes(String(data ?? '')) ?? parseMes(fmtDate(hojeBrasil()))!
}

export type Contexto = {
  corretora: Corretora
  slug: string
  label: string
  eyebrow: string
  base: string               // '/genial'
  mesRef: MesRef             // mês escolhido ou último mês com lotes
  mesEscolhido: boolean
  q: Record<string, string>  // demais parâmetros (string única)
}

export async function contexto(params: Params, searchParams?: SearchParams): Promise<Contexto> {
  const { corretora: slug } = await params
  const corretora = corretoraDoSlug(slug)
  if (!corretora) notFound()
  const { profile } = await equipe()
  if (!podeVerCorretora(profile, corretora)) notFound()
  const sp = searchParams ? await searchParams : {}
  const q: Record<string, string> = {}
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string') q[k] = v
  const escolhido = parseMes(q.mes)
  const mesRef = escolhido ?? await mesReferencia(corretora)
  return {
    corretora, slug: CORRETORA_SLUG[corretora], label: CORRETORA_LABEL[corretora],
    eyebrow: `${CORRETORA_LABEL[corretora]} · Controle de lotes`, base: `/${CORRETORA_SLUG[corretora]}`,
    mesRef, mesEscolhido: !!escolhido, q,
  }
}

// Período de datas vindo da URL (padrão: últimos N dias até hoje)
export function periodoDaUrl(q: Record<string, string>, diasPadrao = 60): { inicio: string; fim: string } {
  const hoje = fmtDate(hojeBrasil())
  let fim = ehIso(q.fim) ? q.fim : hoje
  let inicio = ehIso(q.inicio) ? q.inicio : somarDias(fim, -(diasPadrao - 1))
  if (inicio > fim) [inicio, fim] = [fim, inicio]
  return { inicio, fim }
}
