'use server'

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'

export type ReportResult = {
  columns: string[]
  rows: (string | number | null)[][]
}

export type CohortItem = {
  cohort_mes: string
  dia_num: number
  lotes_operados: number
  lotes_zerados: number
  pct_zeramento: number
}

export type ComparativoItem = {
  dia_num: number
  lotes_mes_atual: number
  lotes_m1: number
  lotes_m2: number
  lotes_m3: number
  media_3m: number
  variacao_pct: number | null
}

async function adminOnly() {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Não autorizado')
  return await createClient()
}

const brl = (v: unknown) =>
  v == null ? null : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export async function getReceitaPorMes(): Promise<ReportResult> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('relatorio_receita_por_mes')
  if (error) throw new Error(error.message)
  return {
    columns: ['Mês', 'Receita Genial (R$)', 'Bruto AAI (R$)', 'Imposto (R$)', 'Líquido AAI (R$)', 'Comissão Assessor (R$)'],
    rows: (data ?? []).map((r: Record<string, unknown>) => [r.mes, brl(r.receita_genial), brl(r.bruto_aai), brl(r.imposto), brl(r.liquido_aai), brl(r.comissao_assessor)]),
  }
}

export async function getReceitaPorAssessor(): Promise<ReportResult> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('relatorio_receita_por_assessor')
  if (error) throw new Error(error.message)
  return {
    columns: ['Assessor', 'Receita Genial (R$)', 'Bruto AAI (R$)', 'Imposto (R$)', 'Líquido AAI (R$)', 'Comissão (R$)'],
    rows: (data ?? []).map((r: Record<string, unknown>) => [r.assessor, brl(r.receita_genial), brl(r.bruto_aai), brl(r.imposto), brl(r.liquido_aai), brl(r.comissao_assessor)]),
  }
}

export async function getReceitaPorInfluenciador(): Promise<ReportResult> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('relatorio_receita_por_influenciador')
  if (error) throw new Error(error.message)
  return {
    columns: ['Influenciador', 'Nº Clientes', 'Receita Líquida (R$)'],
    rows: (data ?? []).map((r: Record<string, unknown>) => [r.influenciador, r.num_clientes, brl(r.liquido_aai)]),
  }
}

export async function getReceitaPorAtivo(): Promise<ReportResult> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('relatorio_receita_por_ativo')
  if (error) throw new Error(error.message)
  return {
    columns: ['Produto/Ativo', 'Tipo', 'Nº Operações', 'Receita Líquida (R$)'],
    rows: (data ?? []).map((r: Record<string, unknown>) => [r.produto, r.tipo_produto, r.num_operacoes, brl(r.liquido_aai)]),
  }
}

export async function getReceitaPorPlataforma(): Promise<ReportResult> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('relatorio_receita_por_plataforma')
  if (error) throw new Error(error.message)
  return {
    columns: ['Plataforma', 'Receita Líquida (R$)', 'Lotes Operados', 'Lotes Zerados', '% Zeramento'],
    rows: (data ?? []).map((r: Record<string, unknown>) => [r.plataforma, brl(r.liquido_aai), r.lotes_operados, r.lotes_zerados, r.pct_zeramento]),
  }
}

export async function getContratosGiradosZerados(): Promise<ReportResult> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('relatorio_contratos_por_mes')
  if (error) throw new Error(error.message)
  return {
    columns: ['Mês', 'Lotes Operados', 'Lotes Zerados', '% Zeramento'],
    rows: (data ?? []).map((r: Record<string, unknown>) => [r.mes, r.lotes_operados, r.lotes_zerados, r.pct_zeramento]),
  }
}

export async function getTopClientes(): Promise<ReportResult> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('relatorio_top_clientes')
  if (error) throw new Error(error.message)
  return {
    columns: ['Cliente', 'CPF', 'Assessor', 'Receita Líquida (R$)'],
    rows: (data ?? []).map((r: Record<string, unknown>) => [r.cliente, r.cpf, r.assessor, brl(r.liquido_aai)]),
  }
}

export async function getTopClientesPorRisco(): Promise<ReportResult> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('relatorio_top_clientes_risco')
  if (error) throw new Error(error.message)
  return {
    columns: ['Cliente', 'CPF', 'Assessor', 'Score CHS', 'Classificação', 'Dias sem Operar'],
    rows: (data ?? []).map((r: Record<string, unknown>) => [r.cliente, r.cpf, r.assessor, r.score, r.classificacao, r.dias_sem_operar ?? '—']),
  }
}

export async function getTopInfluenciadores(): Promise<ReportResult> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('relatorio_top_influenciadores')
  if (error) throw new Error(error.message)
  return {
    columns: ['Influenciador', 'Código', 'Total Leads', 'Convertidos', '% Conversão', 'Receita Gerada (R$)'],
    rows: (data ?? []).map((r: Record<string, unknown>) => [r.influenciador, r.codigo, r.total_leads, r.convertidos, r.pct_conversao, brl(r.receita_gerada)]),
  }
}

export async function getChurnPorPlataforma(): Promise<ReportResult> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('relatorio_churn_por_plataforma')
  if (error) throw new Error(error.message)
  return {
    columns: ['Plataforma', 'Total Clientes', 'Risco Alto', 'Risco Médio', 'Risco Baixo'],
    rows: (data ?? []).map((r: Record<string, unknown>) => [r.plataforma, r.total_clientes, r.risco_alto, r.risco_medio, r.risco_baixo]),
  }
}

export async function getClientesPorPeriodo(): Promise<ReportResult> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('relatorio_clientes_por_periodo')
  if (error) throw new Error(error.message)
  return {
    columns: ['Mês Cadastro', 'Total', 'Ativos', 'Inativos', 'Em Transferência'],
    rows: (data ?? []).map((r: Record<string, unknown>) => [r.mes, r.total, r.ativos, r.inativos, r.em_transferencia]),
  }
}

export async function getCohortContratosPorDia(): Promise<CohortItem[]> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('relatorio_cohort_contratos')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: Record<string, unknown>) => ({
    cohort_mes: String(r.cohort_mes),
    dia_num: Number(r.dia_num),
    lotes_operados: Number(r.lotes_operados),
    lotes_zerados: Number(r.lotes_zerados),
    pct_zeramento: Number(r.pct_zeramento),
  }))
}

export async function getLotesComparativo(): Promise<ComparativoItem[]> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('relatorio_lotes_comparativo')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: Record<string, unknown>) => ({
    dia_num: Number(r.dia_num),
    lotes_mes_atual: Number(r.lotes_mes_atual),
    lotes_m1: Number(r.lotes_m1),
    lotes_m2: Number(r.lotes_m2),
    lotes_m3: Number(r.lotes_m3),
    media_3m: Number(r.media_3m),
    variacao_pct: r.variacao_pct != null ? Number(r.variacao_pct) : null,
  }))
}

export async function getPlataformasPorMes(): Promise<ReportResult> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('relatorio_plataformas_por_mes')
  if (error) throw new Error(error.message)
  return {
    columns: ['Mês', 'Plataforma', 'Valor Total (R$)'],
    rows: (data ?? []).map((r: Record<string, unknown>) => [r.mes, r.plataforma, brl(r.valor_total)]),
  }
}
