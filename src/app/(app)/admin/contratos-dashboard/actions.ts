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
// Sprint 4 — Insights via OpenAI
// -----------------------------------------------------------
export type InsightItem = {
  titulo: string
  descricao: string
  severidade: 'info' | 'positivo' | 'atencao' | 'critico'
}

export type InsightsResposta = {
  insights: InsightItem[]
  gerado_em: string
  modelo: string | null
  erro: string | null
}

// Cache em memória de processo (1 entrada por (período, hash dos KPIs))
const insightsCache = new Map<string, { data: InsightsResposta; expiresAt: number }>()
const INSIGHTS_TTL_MS = 10 * 60 * 1000

type ContextoInsights = {
  periodo: Periodo
  kpis: DashboardKpis
  receita: ReceitaTotal | null
  meta: MetaAnual | null
  topClientes: TopClienteRow[]
  alertas: AlertaRow[]
  porProduto: ProdutoRow[]
}

export async function getInsightsIA(ctx: ContextoInsights): Promise<InsightsResposta> {
  await adminOnly()
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return {
      insights: [],
      gerado_em: new Date().toISOString(),
      modelo: null,
      erro: 'OPENAI_API_KEY não configurada no servidor.',
    }
  }

  const chave = `${ctx.periodo}:${ctx.kpis.dataset_max}:${ctx.kpis.volume_operados}:${ctx.alertas.length}`
  const cached = insightsCache.get(chave)
  if (cached && cached.expiresAt > Date.now()) return cached.data

  const promptUsuario = `Você é um analista financeiro de um escritório de assessoria de investimentos brasileiro. Gere 3 a 5 insights curtos e acionáveis em PORTUGUÊS sobre os dados a seguir. Cada insight deve ter um título (até 8 palavras) e uma descrição (1 a 2 frases). Retorne APENAS um JSON válido no formato:
{"insights":[{"titulo":"...","descricao":"...","severidade":"info|positivo|atencao|critico"}]}

Dados (período: ${ctx.periodo}):
- Volume operado: ${ctx.kpis.volume_operados.toLocaleString('pt-BR')} lotes
- Volume zerado: ${ctx.kpis.volume_zerados.toLocaleString('pt-BR')} lotes
- Clientes ativos: ${ctx.kpis.num_clientes_ativos}
- Maior dia: ${ctx.kpis.maior_dia_data ?? '—'} (${ctx.kpis.maior_dia_lotes} lotes)
- Média 30d: ${ctx.kpis.media_30d.toFixed(0)} lotes/dia
${ctx.receita ? `- Receita total: R$ ${ctx.receita.receita_total.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} (operados ${ctx.receita.receita_operados.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} + zeragem ${ctx.receita.receita_zeragem.toLocaleString('pt-BR', { maximumFractionDigits: 2 })})` : ''}
${ctx.meta ? `- Meta anual: ${ctx.meta.pct_receita.toFixed(1)}% de R$ ${ctx.meta.meta_receita.toLocaleString('pt-BR')} batido. Faltam ${ctx.meta.dias_corridos_restantes} dias.` : ''}
- Top 5 clientes: ${ctx.topClientes.slice(0, 5).map(c => `${c.cliente_nome} (${c.lotes_operados} lotes)`).join(', ')}
- Alertas: ${ctx.alertas.length} (${ctx.alertas.filter(a => a.severidade === 'alta').length} altas)
- Produtos: ${ctx.porProduto.slice(0, 5).map(p => `${p.produto} ${p.lotes_operados.toLocaleString('pt-BR')}`).join(', ')}

Foque em: variações relevantes, oportunidades de cross-sell, riscos de concentração, ritmo vs meta, comportamento de zeragem.`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você é um analista financeiro. Responde sempre em JSON válido em português brasileiro.' },
          { role: 'user', content: promptUsuario },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 800,
      }),
    })
    if (!res.ok) {
      const txt = await res.text()
      return {
        insights: [], gerado_em: new Date().toISOString(), modelo: 'gpt-4o-mini',
        erro: `OpenAI ${res.status}: ${txt.slice(0, 200)}`,
      }
    }
    const json = await res.json() as { choices?: { message?: { content?: string } }[] }
    const content = json.choices?.[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(content) as { insights?: InsightItem[] }
    const resposta: InsightsResposta = {
      insights: Array.isArray(parsed.insights) ? parsed.insights.slice(0, 5) : [],
      gerado_em: new Date().toISOString(),
      modelo: 'gpt-4o-mini',
      erro: null,
    }
    insightsCache.set(chave, { data: resposta, expiresAt: Date.now() + INSIGHTS_TTL_MS })
    return resposta
  } catch (err) {
    return {
      insights: [], gerado_em: new Date().toISOString(), modelo: 'gpt-4o-mini',
      erro: (err as Error).message ?? 'Falha ao chamar OpenAI',
    }
  }
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

// -----------------------------------------------------------
// Sprint 3 — Análises avançadas: cohort, LTV, ranking expandido
// -----------------------------------------------------------
export type CohortPonto = {
  cohort_mes: string
  mes_offset: number
  clientes_ativos: number
  cohort_size: number
  retencao_pct: number
}

export type LtvCliente = {
  rank: number
  cliente_id: string | null
  cliente_nome: string
  assessor_nome: string | null
  primeira_op: string
  ultima_op: string
  meses_ativo: number
  lotes_operados: number
  lotes_zerados: number
  receita_estimada: number
  receita_media_mensal: number
}

export type RankingAssessorRow = {
  rank: number
  barra_nome: string
  numero: string | null
  clientes_ativos: number
  clientes_anterior: number
  clientes_novos: number
  clientes_churn: number
  taxa_retencao: number
  lotes_operados: number
  lotes_zerados: number
  pct_zeragem: number
  receita_total: number
  receita_anterior: number
  delta_receita_pct: number
}

export async function getCohortRetencao(meses = 12): Promise<CohortPonto[]> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('dashboard_cohort_retencao', { p_meses: meses })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    cohort_mes: String(r.cohort_mes),
    mes_offset: num(r.mes_offset),
    clientes_ativos: num(r.clientes_ativos),
    cohort_size: num(r.cohort_size),
    retencao_pct: num(r.retencao_pct),
  }))
}

export async function getLtvClientes(limit = 50): Promise<LtvCliente[]> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('dashboard_ltv_clientes', { p_limit: limit })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    rank: num(r.rank),
    cliente_id: str(r.cliente_id),
    cliente_nome: String(r.cliente_nome ?? 'Sem cliente'),
    assessor_nome: str(r.assessor_nome),
    primeira_op: String(r.primeira_op),
    ultima_op: String(r.ultima_op),
    meses_ativo: num(r.meses_ativo),
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
    receita_estimada: num(r.receita_estimada),
    receita_media_mensal: num(r.receita_media_mensal),
  }))
}

// -----------------------------------------------------------
// Sprint 6 — Executivo expandido
// -----------------------------------------------------------
export type ProdutoDetalhado = {
  produto: string
  lotes_dia: number
  lotes_mtd: number
  lotes_mes_anterior: number
  lotes_periodo: number
  media_diaria: number
  delta_pct_vs_mes_ant: number
}

export type ZeragemIntensidade = {
  intensidade: 'leve' | 'media' | 'alta' | 'total'
  num_eventos: number
  lotes_zerados: number
  pct_dos_zerados: number
}

export type ReceitaBrutaLiquida = {
  receita_bruta: number
  receita_liquida: number
  pct_repasse_medio: number
}

export type ReceitaPorPlataforma = {
  plataforma: string
  lotes_operados: number
  lotes_zerados: number
  num_clientes: number
}

export type ReceitaPorClearing = {
  clearing: string
  receita_total: number
  num_barras: number
  lotes_operados: number
}

export type ScoreQualidadeRow = {
  rank: number
  barra_nome: string
  numero: string | null
  lotes_operados: number
  lotes_zerados: number
  pct_zeragem: number
  receita_total: number
  score_qualidade: number
}

export type MetaAssessorRow = {
  barra_nome: string
  numero: string | null
  ano: number
  meta_receita: number
  realizado_receita: number
  pct_atingido: number
  status: 'ok' | 'atencao' | 'critico' | 'sem_meta'
}

export type AlertaExecutivo = {
  tipo: string
  severidade: 'alta' | 'media' | 'baixa'
  titulo: string
  descricao: string
  valor: number
}

export async function getProdutosDetalhados(p: Periodo, barra: string | null = null): Promise<ProdutoDetalhado[]> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_contratos_por_produto_detalhado', {
    p_inicio: inicio, p_fim: fim, p_barra: barra,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    produto: String(r.produto ?? 'OUTRO'),
    lotes_dia: num(r.lotes_dia),
    lotes_mtd: num(r.lotes_mtd),
    lotes_mes_anterior: num(r.lotes_mes_anterior),
    lotes_periodo: num(r.lotes_periodo),
    media_diaria: num(r.media_diaria),
    delta_pct_vs_mes_ant: num(r.delta_pct_vs_mes_ant),
  }))
}

export async function getZeragemDistribuicao(p: Periodo, barra: string | null = null): Promise<ZeragemIntensidade[]> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_zeragem_distribuicao', {
    p_inicio: inicio, p_fim: fim, p_barra: barra,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    intensidade: r.intensidade as ZeragemIntensidade['intensidade'],
    num_eventos: num(r.num_eventos),
    lotes_zerados: num(r.lotes_zerados),
    pct_dos_zerados: num(r.pct_dos_zerados),
  }))
}

export async function getReceitaBrutaLiquida(p: Periodo): Promise<ReceitaBrutaLiquida> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_receita_bruta_liquida', { p_inicio: inicio, p_fim: fim })
  if (error) throw new Error(error.message)
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  return {
    receita_bruta: num(r?.receita_bruta),
    receita_liquida: num(r?.receita_liquida),
    pct_repasse_medio: num(r?.pct_repasse_medio),
  }
}

export async function getReceitaPorPlataforma(p: Periodo): Promise<ReceitaPorPlataforma[]> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_receita_por_plataforma', { p_inicio: inicio, p_fim: fim })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    plataforma: String(r.plataforma ?? 'Sem plataforma'),
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
    num_clientes: num(r.num_clientes),
  }))
}

export async function getReceitaPorClearing(p: Periodo): Promise<ReceitaPorClearing[]> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_receita_por_clearing', { p_inicio: inicio, p_fim: fim })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    clearing: String(r.clearing ?? 'Genial'),
    receita_total: num(r.receita_total),
    num_barras: num(r.num_barras),
    lotes_operados: num(r.lotes_operados),
  }))
}

export async function getScoreQualidade(p: Periodo): Promise<ScoreQualidadeRow[]> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_score_qualidade_barras', { p_inicio: inicio, p_fim: fim })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    rank: num(r.rank),
    barra_nome: String(r.barra_nome ?? ''),
    numero: r.numero ? String(r.numero) : null,
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
    pct_zeragem: num(r.pct_zeragem),
    receita_total: num(r.receita_total),
    score_qualidade: num(r.score_qualidade),
  }))
}

export async function getMetasAssessor(): Promise<MetaAssessorRow[]> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('dashboard_metas_assessor')
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    barra_nome: String(r.barra_nome ?? ''),
    numero: r.numero ? String(r.numero) : null,
    ano: num(r.ano),
    meta_receita: num(r.meta_receita),
    realizado_receita: num(r.realizado_receita),
    pct_atingido: num(r.pct_atingido),
    status: (r.status ?? 'sem_meta') as MetaAssessorRow['status'],
  }))
}

// -----------------------------------------------------------
// Sprint 7 — Operacional expandido
// -----------------------------------------------------------
export type FluxoOperacional = {
  num_sessoes: number
  num_dias_corridos: number
  taxa_atividade: number
  num_clientes_ativos: number
  sessoes_por_cliente: number
  lotes_por_sessao: number
  ticket_medio_diario: number
}

export type IndiceSobrevivencia = {
  num_clientes_total: number
  num_sobreviventes: number
  num_zerados: number
  indice: number
  pct_sobreviventes: number
  classificacao: 'saudavel' | 'atencao' | 'alto_risco'
}

export type RiscoOperacionalRow = {
  rank: number
  cliente_id: string | null
  cliente_nome: string
  assessor_nome: string | null
  score_risco: number
  dias_atual: number
  dias_anterior: number
  lotes_atual: number
  lotes_anterior: number
  pct_ze_atual: number
  pct_ze_anterior: number
  eventos_zer_atual: number
  eventos_zer_anterior: number
  motivo: string
}

export async function getFluxoOperacional(p: Periodo, barra: string | null = null): Promise<FluxoOperacional> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_fluxo_operacional', {
    p_inicio: inicio, p_fim: fim, p_barra: barra,
  })
  if (error) throw new Error(error.message)
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  return {
    num_sessoes: num(r?.num_sessoes),
    num_dias_corridos: num(r?.num_dias_corridos),
    taxa_atividade: num(r?.taxa_atividade),
    num_clientes_ativos: num(r?.num_clientes_ativos),
    sessoes_por_cliente: num(r?.sessoes_por_cliente),
    lotes_por_sessao: num(r?.lotes_por_sessao),
    ticket_medio_diario: num(r?.ticket_medio_diario),
  }
}

export async function getIndiceSobrevivencia(p: Periodo, barra: string | null = null): Promise<IndiceSobrevivencia> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_indice_sobrevivencia', {
    p_inicio: inicio, p_fim: fim, p_barra: barra,
  })
  if (error) throw new Error(error.message)
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  return {
    num_clientes_total: num(r?.num_clientes_total),
    num_sobreviventes: num(r?.num_sobreviventes),
    num_zerados: num(r?.num_zerados),
    indice: num(r?.indice),
    pct_sobreviventes: num(r?.pct_sobreviventes),
    classificacao: (r?.classificacao ?? 'atencao') as IndiceSobrevivencia['classificacao'],
  }
}

export async function getRiscoOperacional(limit = 50, barra: string | null = null): Promise<RiscoOperacionalRow[]> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('dashboard_risco_operacional', {
    p_limit: limit, p_barra: barra,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    rank: num(r.rank),
    cliente_id: str(r.cliente_id),
    cliente_nome: String(r.cliente_nome ?? 'Sem cliente'),
    assessor_nome: str(r.assessor_nome),
    score_risco: num(r.score_risco),
    dias_atual: num(r.dias_atual),
    dias_anterior: num(r.dias_anterior),
    lotes_atual: num(r.lotes_atual),
    lotes_anterior: num(r.lotes_anterior),
    pct_ze_atual: num(r.pct_ze_atual),
    pct_ze_anterior: num(r.pct_ze_anterior),
    eventos_zer_atual: num(r.eventos_zer_atual),
    eventos_zer_anterior: num(r.eventos_zer_anterior),
    motivo: String(r.motivo ?? ''),
  }))
}

// -----------------------------------------------------------
// Sprint 8 — Analises avançadas (ABC, scores, clusters, correlações, risco escritório)
// -----------------------------------------------------------
export type CurvaAbcRow = {
  rank: number
  cliente_id: string | null
  cliente_nome: string
  assessor_nome: string | null
  receita_estimada: number
  pct_individual: number
  pct_acumulado: number
  classe: 'A' | 'B' | 'C' | 'D'
}

export type ScoreClienteRow = {
  rank: number
  cliente_id: string | null
  cliente_nome: string
  assessor_nome: string | null
  score_financeiro: number
  score_operacional: number
  score_emocional: number
  score_retencao: number
  score_total: number
  classificacao: 'premium' | 'solido' | 'medio' | 'fragil'
}

export type ClusterCliente = {
  cluster: 'scalper' | 'emocional' | 'consistente' | 'agressivo' | 'swing' | 'casual'
  num_clientes: number
  pct_base: number
  lotes_total: number
  pct_lotes: number
  lotes_medio_dia: number
  pct_zeragem_medio: number
  dias_medio_mes: number
}

export type CorrelacaoRow = {
  par: string
  descricao: string
  r: number
  forca: 'forte' | 'moderada' | 'fraca' | 'sem_relacao'
  direcao: 'positiva' | 'negativa' | 'nula'
  num_amostras: number
}

export type RiscoEscritorio = {
  indice: number
  classificacao: 'saudavel' | 'atencao' | 'critico'
  fator_concentracao: number
  fator_zeragem: number
  fator_inativos: number
  fator_metas: number
  detalhe_concentracao: string
  detalhe_zeragem: string
  detalhe_inativos: string
  detalhe_metas: string
}

export async function getCurvaAbc(p: Periodo, barra: string | null = null): Promise<CurvaAbcRow[]> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_curva_abc', {
    p_inicio: inicio, p_fim: fim, p_barra: barra,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    rank: num(r.rank),
    cliente_id: str(r.cliente_id),
    cliente_nome: String(r.cliente_nome ?? ''),
    assessor_nome: str(r.assessor_nome),
    receita_estimada: num(r.receita_estimada),
    pct_individual: num(r.pct_individual),
    pct_acumulado: num(r.pct_acumulado),
    classe: (r.classe ?? 'D') as CurvaAbcRow['classe'],
  }))
}

export async function getScoreCliente(limit = 100): Promise<ScoreClienteRow[]> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('dashboard_score_cliente', { p_limit: limit })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    rank: num(r.rank),
    cliente_id: str(r.cliente_id),
    cliente_nome: String(r.cliente_nome ?? ''),
    assessor_nome: str(r.assessor_nome),
    score_financeiro: num(r.score_financeiro),
    score_operacional: num(r.score_operacional),
    score_emocional: num(r.score_emocional),
    score_retencao: num(r.score_retencao),
    score_total: num(r.score_total),
    classificacao: (r.classificacao ?? 'medio') as ScoreClienteRow['classificacao'],
  }))
}

export async function getClustersClientes(): Promise<ClusterCliente[]> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('dashboard_clusters_clientes')
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    cluster: (r.cluster ?? 'casual') as ClusterCliente['cluster'],
    num_clientes: num(r.num_clientes),
    pct_base: num(r.pct_base),
    lotes_total: num(r.lotes_total),
    pct_lotes: num(r.pct_lotes),
    lotes_medio_dia: num(r.lotes_medio_dia),
    pct_zeragem_medio: num(r.pct_zeragem_medio),
    dias_medio_mes: num(r.dias_medio_mes),
  }))
}

export async function getCorrelacoes(): Promise<CorrelacaoRow[]> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('dashboard_correlacoes')
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    par: String(r.par ?? ''),
    descricao: String(r.descricao ?? ''),
    r: num(r.r),
    forca: (r.forca ?? 'sem_relacao') as CorrelacaoRow['forca'],
    direcao: (r.direcao ?? 'nula') as CorrelacaoRow['direcao'],
    num_amostras: num(r.num_amostras),
  }))
}

export async function getRiscoEscritorio(): Promise<RiscoEscritorio> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('dashboard_risco_escritorio')
  if (error) throw new Error(error.message)
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  return {
    indice: num(r?.indice),
    classificacao: (r?.classificacao ?? 'atencao') as RiscoEscritorio['classificacao'],
    fator_concentracao: num(r?.fator_concentracao),
    fator_zeragem: num(r?.fator_zeragem),
    fator_inativos: num(r?.fator_inativos),
    fator_metas: num(r?.fator_metas),
    detalhe_concentracao: String(r?.detalhe_concentracao ?? ''),
    detalhe_zeragem: String(r?.detalhe_zeragem ?? ''),
    detalhe_inativos: String(r?.detalhe_inativos ?? ''),
    detalhe_metas: String(r?.detalhe_metas ?? ''),
  }
}

export async function getAlertasExecutivos(): Promise<AlertaExecutivo[]> {
  const supabase = await adminOnly()
  const { data, error } = await supabase.rpc('dashboard_alertas_executivos')
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    tipo: String(r.tipo ?? ''),
    severidade: (r.severidade ?? 'baixa') as AlertaExecutivo['severidade'],
    titulo: String(r.titulo ?? ''),
    descricao: String(r.descricao ?? ''),
    valor: num(r.valor),
  }))
}

export type BudgetZeragemRow = {
  barra_nome: string
  numero: string | null
  lotes_operados: number
  lotes_zerados: number
  pct_zeragem: number
  budget_pct: number
  consumo_pct: number
  status: 'ok' | 'atencao' | 'excedido'
}

export async function getBudgetZeragem(p: Periodo): Promise<BudgetZeragemRow[]> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_budget_zeragem', { p_inicio: inicio, p_fim: fim })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    barra_nome: String(r.barra_nome ?? ''),
    numero: r.numero ? String(r.numero) : null,
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
    pct_zeragem: num(r.pct_zeragem),
    budget_pct: num(r.budget_pct),
    consumo_pct: num(r.consumo_pct),
    status: (r.status ?? 'ok') as BudgetZeragemRow['status'],
  }))
}

export async function getRankingAssessores(p: Periodo): Promise<RankingAssessorRow[]> {
  const supabase = await adminOnly()
  const { inicio, fim } = await resolvePeriodo(p)
  // Período anterior: mesma duração imediatamente antes
  const inicioD = new Date(inicio)
  const fimD = new Date(fim)
  const dur = Math.round((fimD.getTime() - inicioD.getTime()) / 86400000)
  const fimAnt = new Date(inicioD); fimAnt.setDate(fimAnt.getDate() - 1)
  const inicioAnt = new Date(fimAnt); inicioAnt.setDate(inicioAnt.getDate() - dur)
  const f = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const { data, error } = await supabase.rpc('dashboard_ranking_assessores', {
    p_inicio: inicio, p_fim: fim,
    p_inicio_anterior: f(inicioAnt), p_fim_anterior: f(fimAnt),
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    rank: num(r.rank),
    barra_nome: String(r.barra_nome ?? ''),
    numero: r.numero ? String(r.numero) : null,
    clientes_ativos: num(r.clientes_ativos),
    clientes_anterior: num(r.clientes_anterior),
    clientes_novos: num(r.clientes_novos),
    clientes_churn: num(r.clientes_churn),
    taxa_retencao: num(r.taxa_retencao),
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
    pct_zeragem: num(r.pct_zeragem),
    receita_total: num(r.receita_total),
    receita_anterior: num(r.receita_anterior),
    delta_receita_pct: num(r.delta_receita_pct),
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
