'use server'

// Visão do assessor: só as barras ligadas ao usuário logado (barras.assessor_id).
// As RPCs assessor_* (supabase-s16) resolvem o escopo pelo auth.uid(), então
// não há como um assessor pedir dados de outra barra.

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { resolvePeriodo, periodoAnterior, type Periodo, type DateRange } from '@/lib/periodo'
import { mapClienteMovimento, type ClienteMovimentoRow } from '@/lib/movimento'

export type AssessorBarraRow = {
  corretora: string
  barra_nome: string
  lotes_operados: number
  lotes_zerados: number
  num_clientes: number
  num_dias: number
}

export type AssessorEvolucaoRow = {
  mes_data: string
  lotes_operados: number
  lotes_zerados: number
  num_clientes: number
}

export type AssessorClienteRow = {
  cliente_nome: string
  conta: string | null
  corretora: string
  barra_nome: string
  lotes_operados: number
  lotes_zerados: number
}

export type AssessorResumo = {
  range: DateRange
  anterior: DateRange
  barras: AssessorBarraRow[]
  evolucao: AssessorEvolucaoRow[]
  topClientes: AssessorClienteRow[]
  movimento: ClienteMovimentoRow[]
  disponivel: boolean   // false = supabase-s16 ainda não aplicado
  erro: string | null
}

const n = (v: unknown) => (v == null ? 0 : Number(v))

export async function getAssessorResumo(periodo: Periodo): Promise<AssessorResumo> {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'vendedor' && profile.role !== 'admin')) throw new Error('Não autorizado')
  const supabase = await createClient()
  const range = resolvePeriodo(periodo)
  const anterior = periodoAnterior(periodo) ?? range

  const [b, e, t, m] = await Promise.all([
    supabase.rpc('assessor_resumo', { p_inicio: range.inicio, p_fim: range.fim }),
    supabase.rpc('assessor_evolucao_mensal'),
    supabase.rpc('assessor_top_clientes', { p_inicio: range.inicio, p_fim: range.fim, p_limit: 15 }),
    supabase.rpc('assessor_clientes_movimento', {
      p_inicio: range.inicio, p_fim: range.fim, p_inicio_anterior: anterior.inicio, p_fim_anterior: anterior.fim,
    }),
  ])

  const faltaSql = [b, e, t, m].some(r => r.error?.code === 'PGRST202')
  const erro = [b, e, t, m].find(r => r.error && r.error.code !== 'PGRST202')?.error?.message ?? null

  return {
    range, anterior,
    barras: ((b.data ?? []) as Record<string, unknown>[]).map(r => ({
      corretora: String(r.corretora ?? 'GENIAL'), barra_nome: String(r.barra_nome ?? ''),
      lotes_operados: n(r.lotes_operados), lotes_zerados: n(r.lotes_zerados),
      num_clientes: n(r.num_clientes), num_dias: n(r.num_dias),
    })),
    evolucao: ((e.data ?? []) as Record<string, unknown>[]).map(r => ({
      mes_data: String(r.mes_data), lotes_operados: n(r.lotes_operados),
      lotes_zerados: n(r.lotes_zerados), num_clientes: n(r.num_clientes),
    })),
    topClientes: ((t.data ?? []) as Record<string, unknown>[]).map(r => ({
      cliente_nome: String(r.cliente_nome ?? 'Sem cliente'), conta: r.conta ? String(r.conta) : null,
      corretora: String(r.corretora ?? 'GENIAL'), barra_nome: String(r.barra_nome ?? ''),
      lotes_operados: n(r.lotes_operados), lotes_zerados: n(r.lotes_zerados),
    })),
    movimento: mapClienteMovimento(m.data),
    disponivel: !faltaSql,
    erro,
  }
}
