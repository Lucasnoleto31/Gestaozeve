'use server'

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'

// -----------------------------------------------------------
// Tipos compartilhados com a View
// -----------------------------------------------------------
export type Periodo =
  | 'hoje'
  | 'semana'      // últimos 7 dias
  | '30d'         // últimos 30 dias
  | 'mes'         // mês atual
  | 'mes_anterior'
  | 'tudo'

export type DateRange = { inicio: string; fim: string } // 'YYYY-MM-DD'

export type DashboardKpis = {
  volume_operados: number
  volume_zerados: number
  num_clientes_ativos: number
  num_dias_com_dado: number
  maior_dia_data: string | null
  maior_dia_lotes: number
  volume_hoje: number
  media_30d: number
  dataset_max: string | null
}

export type ProdutoRow = {
  produto: string
  lotes_operados: number
  lotes_zerados: number
  num_clientes: number
  num_dias: number
}

export type TopClienteRow = {
  rank: number
  cliente_id: string | null
  cliente_nome: string
  assessor_nome: string | null
  lotes_operados: number
  lotes_zerados: number
  pct_acumulado: number
}

export type DiarioProdutoRow = {
  data: string
  produto: string
  lotes_operados: number
  lotes_zerados: number
}

export type HeatmapCell = {
  dow: number          // 0..6 (0 = dom)
  semana_mes: number   // 1..6
  num_dias: number
  lotes_operados: number
  lotes_zerados: number
  media_diaria: number
}

export type EvolucaoMensalRow = {
  mes_data: string
  lotes_operados: number
  lotes_zerados: number
  num_dias_uteis: number
  num_clientes: number
}

export type DrilldownRow = {
  tipo: 'totals' | 'top_girou' | 'top_zerou'
  rank: number
  cliente_id: string | null
  cliente_nome: string
  assessor_nome: string | null
  lotes_operados: number
  lotes_zerados: number
}

// -----------------------------------------------------------
// Resolve preset → range de datas (UTC + ISO date string)
// -----------------------------------------------------------
function todayStr(): string {
  // YYYY-MM-DD no fuso local — Supabase aceita
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function resolvePeriodo(p: Periodo): Promise<DateRange> {
  const today = new Date()
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  if (p === 'hoje')   return { inicio: fmt(today), fim: fmt(today) }

  if (p === 'semana') {
    const i = new Date(today); i.setDate(i.getDate() - 6)
    return { inicio: fmt(i), fim: fmt(today) }
  }
  if (p === '30d') {
    const i = new Date(today); i.setDate(i.getDate() - 29)
    return { inicio: fmt(i), fim: fmt(today) }
  }
  if (p === 'mes') {
    const i = new Date(today.getFullYear(), today.getMonth(), 1)
    return { inicio: fmt(i), fim: fmt(today) }
  }
  if (p === 'mes_anterior') {
    const i = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const f = new Date(today.getFullYear(), today.getMonth(), 0) // último dia do mês anterior
    return { inicio: fmt(i), fim: fmt(f) }
  }
  // tudo — usa o min/max do dataset, com fallback razoável
  return { inicio: '2000-01-01', fim: fmt(today) }
}

// -----------------------------------------------------------
// Auth + Supabase
// -----------------------------------------------------------
async function adminOnly() {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Não autorizado')
  return await createClient()
}

const num = (v: unknown) => (v == null ? 0 : Number(v))
const str = (v: unknown) => (v == null ? null : String(v))

// -----------------------------------------------------------
// Actions
// -----------------------------------------------------------
export async function getKpis(p: Periodo, barra: string | null = null): Promise<DashboardKpis> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_contratos_kpis', {
    p_inicio: inicio, p_fim: fim, p_barra: barra,
  })
  if (error) throw new Error(error.message)
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  return {
    volume_operados: num(r?.volume_operados),
    volume_zerados: num(r?.volume_zerados),
    num_clientes_ativos: num(r?.num_clientes_ativos),
    num_dias_com_dado: num(r?.num_dias_com_dado),
    maior_dia_data: str(r?.maior_dia_data),
    maior_dia_lotes: num(r?.maior_dia_lotes),
    volume_hoje: num(r?.volume_hoje),
    media_30d: num(r?.media_30d),
    dataset_max: str(r?.dataset_max),
  }
}

export async function getPorProduto(p: Periodo, barra: string | null = null): Promise<ProdutoRow[]> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_contratos_por_produto', {
    p_inicio: inicio, p_fim: fim, p_barra: barra,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    produto: String(r.produto ?? 'OUTRO'),
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
    num_clientes: num(r.num_clientes),
    num_dias: num(r.num_dias),
  }))
}

export async function getTopClientes(p: Periodo, limit = 20, barra: string | null = null): Promise<TopClienteRow[]> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_contratos_top_clientes', {
    p_inicio: inicio, p_fim: fim, p_limit: limit, p_barra: barra,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    rank: num(r.rank),
    cliente_id: str(r.cliente_id),
    cliente_nome: String(r.cliente_nome ?? 'Sem cliente'),
    assessor_nome: str(r.assessor_nome),
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
    pct_acumulado: num(r.pct_acumulado),
  }))
}

export async function getDiarioProduto(p: Periodo, barra: string | null = null): Promise<DiarioProdutoRow[]> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_contratos_diario_produto', {
    p_inicio: inicio, p_fim: fim, p_barra: barra,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    data: String(r.data),
    produto: String(r.produto ?? 'OUTRO'),
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
  }))
}

export async function getHeatmapDow(p: Periodo, barra: string | null = null): Promise<HeatmapCell[]> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_contratos_heatmap_dow', {
    p_inicio: inicio, p_fim: fim, p_barra: barra,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    dow: num(r.dow),
    semana_mes: num(r.semana_mes),
    num_dias: num(r.num_dias),
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
    media_diaria: num(r.media_diaria),
  }))
}

export async function getEvolucaoMensal(): Promise<EvolucaoMensalRow[]> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('dashboard_contratos_evolucao_mensal')
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    mes_data: String(r.mes_data),
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
    num_dias_uteis: num(r.num_dias_uteis),
    num_clientes: num(r.num_clientes),
  }))
}

export async function getDrilldownDia(data: string): Promise<DrilldownRow[]> {
  const supabase = await adminOnly()
  const { data: rows, error } = await supabase.rpc('dashboard_contratos_drilldown_dia', { p_data: data })
  if (error) throw new Error(error.message)
  return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
    tipo: r.tipo as DrilldownRow['tipo'],
    rank: num(r.rank),
    cliente_id: str(r.cliente_id),
    cliente_nome: String(r.cliente_nome ?? ''),
    assessor_nome: str(r.assessor_nome),
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
  }))
}

// Util só pra debug rápido em dev
export async function getToday(): Promise<string> {
  return todayStr()
}

// -----------------------------------------------------------
// Fase 2 — Receita & Meta
// -----------------------------------------------------------
export type ReceitaTotal = {
  receita_operados: number
  receita_zeragem: number
  receita_total: number
  num_barras: number
  num_barras_sem_pricing: number
}

export type ReceitaPorAssessor = {
  barra_nome: string
  numero: string | null
  preco_lote_futuros: number
  modelo_zeragem: 'b2b' | 'fixo' | 'mesmo_operado' | 'tiered'
  preco_zeragem: number
  lotes_operados: number
  lotes_zerados: number
  receita_operados: number
  receita_zeragem: number
  receita_total: number
}

export type ReceitaProjecao = {
  mes_data: string
  receita_consolidada: number
  num_dias_com_dado: number
  ritmo_diario: number
  dias_corridos_restantes: number
  projecao_complementar: number
  projecao_total: number
}

export type MetaAnual = {
  ano: number
  meta_lotes: number
  meta_receita: number
  realizado_lotes: number
  realizado_receita: number
  pct_lotes: number
  pct_receita: number
  dias_corridos_restantes: number
  ritmo_lotes_necessario: number
  ritmo_receita_necessario: number
}

export async function getReceitaTotal(p: Periodo): Promise<ReceitaTotal> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_contratos_receita_total', { p_inicio: inicio, p_fim: fim })
  if (error) throw new Error(error.message)
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  return {
    receita_operados: num(r?.receita_operados),
    receita_zeragem: num(r?.receita_zeragem),
    receita_total: num(r?.receita_total),
    num_barras: num(r?.num_barras),
    num_barras_sem_pricing: num(r?.num_barras_sem_pricing),
  }
}

export async function getReceitaPorAssessor(p: Periodo): Promise<ReceitaPorAssessor[]> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_contratos_receita_por_assessor', { p_inicio: inicio, p_fim: fim })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    barra_nome: String(r.barra_nome ?? 'Sem barra'),
    numero: r.numero ? String(r.numero) : null,
    preco_lote_futuros: num(r.preco_lote_futuros),
    modelo_zeragem: (r.modelo_zeragem ?? 'b2b') as ReceitaPorAssessor['modelo_zeragem'],
    preco_zeragem: num(r.preco_zeragem),
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
    receita_operados: num(r.receita_operados),
    receita_zeragem: num(r.receita_zeragem),
    receita_total: num(r.receita_total),
  }))
}

export async function getReceitaProjecao(): Promise<ReceitaProjecao> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('dashboard_contratos_receita_mes_projecao')
  if (error) throw new Error(error.message)
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  return {
    mes_data: String(r?.mes_data ?? ''),
    receita_consolidada: num(r?.receita_consolidada),
    num_dias_com_dado: num(r?.num_dias_com_dado),
    ritmo_diario: num(r?.ritmo_diario),
    dias_corridos_restantes: num(r?.dias_corridos_restantes),
    projecao_complementar: num(r?.projecao_complementar),
    projecao_total: num(r?.projecao_total),
  }
}

// -----------------------------------------------------------
// Fase 3 — Alertas & Acuracidade
// -----------------------------------------------------------
export type AlertaTipo = 'inativo' | 'esfriando' | 'zeragem_alta' | 'zeragem_concentrada'
export type AlertaSeveridade = 'alta' | 'media' | 'baixa'

export type AlertaRow = {
  tipo: AlertaTipo
  severidade: AlertaSeveridade
  cliente_id: string | null
  cliente_nome: string
  assessor_nome: string | null
  metric_label: string
  metric_value: string
  detalhe: string
}

export type AcuracidadeResumo = {
  num_dias: number
  mape: number
  vies: number
  vies_label: 'sem dados' | 'subestima' | 'superestima' | 'equilibrado'
}

export type AcuracidadePonto = {
  data: string
  previsto: number
  realizado: number
  erro: number
  pct_erro: number | null
}

export async function getAlertas(inativoDias = 30, barra: string | null = null): Promise<AlertaRow[]> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('dashboard_contratos_alertas', {
    p_inativo_dias: inativoDias, p_barra: barra,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    tipo: r.tipo as AlertaTipo,
    severidade: r.severidade as AlertaSeveridade,
    cliente_id: str(r.cliente_id),
    cliente_nome: String(r.cliente_nome ?? ''),
    assessor_nome: str(r.assessor_nome),
    metric_label: String(r.metric_label ?? ''),
    metric_value: String(r.metric_value ?? ''),
    detalhe: String(r.detalhe ?? ''),
  }))
}

export async function getAcuracidadeResumo(lookbackDays = 60): Promise<AcuracidadeResumo> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('dashboard_contratos_acuracidade_resumo', { p_lookback_days: lookbackDays })
  if (error) throw new Error(error.message)
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  return {
    num_dias: num(r?.num_dias),
    mape: num(r?.mape),
    vies: num(r?.vies),
    vies_label: (r?.vies_label ?? 'sem dados') as AcuracidadeResumo['vies_label'],
  }
}

export async function getAcuracidadeSerie(lookbackDays = 60): Promise<AcuracidadePonto[]> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('dashboard_contratos_acuracidade', { p_lookback_days: lookbackDays })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    data: String(r.data),
    previsto: num(r.previsto),
    realizado: num(r.realizado),
    erro: num(r.erro),
    pct_erro: r.pct_erro != null ? Number(r.pct_erro) : null,
  }))
}

export async function getBarrasAtivas(): Promise<{ barra_nome: string; numero: string | null }[]> {
  const supabase = await adminOnly()
  const { data, error } = await supabase
    .from('assessor_pricing')
    .select('barra_nome, numero')
    .eq('ativo', true)
    .order('barra_nome', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    barra_nome: String(r.barra_nome ?? ''),
    numero: r.numero ? String(r.numero) : null,
  }))
}

export async function getMetaAnual(): Promise<MetaAnual> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('dashboard_meta_anual')
  if (error) throw new Error(error.message)
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  return {
    ano: num(r?.ano),
    meta_lotes: num(r?.meta_lotes),
    meta_receita: num(r?.meta_receita),
    realizado_lotes: num(r?.realizado_lotes),
    realizado_receita: num(r?.realizado_receita),
    pct_lotes: num(r?.pct_lotes),
    pct_receita: num(r?.pct_receita),
    dias_corridos_restantes: num(r?.dias_corridos_restantes),
    ritmo_lotes_necessario: num(r?.ritmo_lotes_necessario),
    ritmo_receita_necessario: num(r?.ritmo_receita_necessario),
  }
}
