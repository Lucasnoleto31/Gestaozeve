'use server'

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { CORRETORAS } from '@/lib/corretoras'

type Db = Awaited<ReturnType<typeof createClient>>

// -----------------------------------------------------------
// Tipos compartilhados com a View
// -----------------------------------------------------------
export type Periodo =
  | '30d'         // últimos 30 dias
  | '60d'         // últimos 60 dias
  | '90d'         // últimos 90 dias
  | 'ano'         // ano atual (1º jan → hoje)
  | 'tudo'
  | `custom:${string}:${string}`   // intervalo escolhido: 'custom:YYYY-MM-DD:YYYY-MM-DD'

export type DateRange = { inicio: string; fim: string } // 'YYYY-MM-DD'

export type DashboardKpis = {
  volume_operados: number
  volume_zerados: number
  num_clientes_ativos: number      // contas distintas que operaram no período
  num_dias_com_dado: number        // pregões com registro no período
  maior_dia_data: string | null
  maior_dia_lotes: number
  ultimo_dia_data: string | null
  ultimo_dia_lotes: number
  media_diaria: number             // lotes operados / pregão no período
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
  num_pregoes: number    // dias com registro no mês
  num_clientes: number   // contas distintas que operaram no mês
}

export type RetencaoMensalRow = {
  mes: string
  mes_seguinte: string
  ativos: number
  continuaram: number
  pararam: number
  churn_pct: number
  retencao_pct: number
  parcial: boolean
}

export type IncentivoMensalRow = {
  mes: string
  faixa_min: number       // 0 = "Resto" (não atingiu 1.000 pontos)
  valor_unitario: number
  num_clientes: number
  valor_total: number
}

export type IncentivoClienteRow = {
  conta: string
  cliente_nome: string
  pontos: number
  lotes_operados: number
  faixa_min: number
  valor_incentivo: number
  proxima_faixa: number | null
  pontos_faltantes: number | null
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
// Resolve preset → range de datas.
// "Hoje" é calculado no fuso America/Sao_Paulo: o servidor roda em UTC
// e viraria o dia às 21h de Brasília, zerando os cards à noite.
// -----------------------------------------------------------
function hojeBrasil(): Date {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()) // 'YYYY-MM-DD'
  return new Date(iso + 'T12:00:00') // meio-dia evita drift de DST ao somar/subtrair dias
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function resolvePeriodo(p: Periodo): Promise<DateRange> {
  const today = hojeBrasil()

  // intervalo personalizado: 'custom:YYYY-MM-DD:YYYY-MM-DD'
  if (p.startsWith('custom:')) {
    const [, inicio, fim] = p.split(':')
    const re = /^\d{4}-\d{2}-\d{2}$/
    if (re.test(inicio) && re.test(fim)) {
      // normaliza ordem caso venha invertido
      return inicio <= fim ? { inicio, fim } : { inicio: fim, fim: inicio }
    }
    // formato inválido → cai no fallback (últimos 30 dias)
    p = '30d'
  }

  const rolling = (dias: number) => {
    const i = new Date(today); i.setDate(i.getDate() - (dias - 1))
    return { inicio: fmtDate(i), fim: fmtDate(today) }
  }

  if (p === '30d') return rolling(30)
  if (p === '60d') return rolling(60)
  if (p === '90d') return rolling(90)
  if (p === 'ano') return { inicio: `${today.getFullYear()}-01-01`, fim: fmtDate(today) }
  // 'tudo' (e qualquer valor legado desconhecido vindo de URL antiga)
  return { inicio: '2000-01-01', fim: fmtDate(today) }
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

// Só envia p_excluir_cliente quando há cliente a excluir: as RPCs continuam
// funcionando com a assinatura antiga enquanto o supabase-s12 não é aplicado.
const exclusao = (excluir: string | null) =>
  excluir ? { p_excluir_cliente: excluir } : {}

// Idem para corretora e barra nas funções de receita: só manda o parâmetro quando
// há filtro, então tudo continua funcionando antes de aplicar o supabase-s13.
const filtroCorretora = (corretora: string | null) =>
  corretora ? { p_corretora: corretora } : {}
const filtroBarra = (barra: string | null) =>
  barra ? { p_barra: barra } : {}

// -----------------------------------------------------------
// Actions
// -----------------------------------------------------------
async function fetchKpis(supabase: Db, p: Periodo, barra: string | null = null, excluir: string | null = null, corretora: string | null = null): Promise<DashboardKpis> {
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_contratos_kpis', {
    p_inicio: inicio, p_fim: fim, p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora),
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
    ultimo_dia_data: str(r?.ultimo_dia_data),
    ultimo_dia_lotes: num(r?.ultimo_dia_lotes),
    media_diaria: num(r?.media_diaria),
    dataset_max: str(r?.dataset_max),
  }
}

async function fetchPorProduto(supabase: Db, p: Periodo, barra: string | null = null, excluir: string | null = null, corretora: string | null = null): Promise<ProdutoRow[]> {
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_contratos_por_produto', {
    p_inicio: inicio, p_fim: fim, p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora),
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

async function fetchTopClientes(supabase: Db, p: Periodo, limit = 20, barra: string | null = null, excluir: string | null = null, corretora: string | null = null): Promise<TopClienteRow[]> {
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_contratos_top_clientes', {
    p_inicio: inicio, p_fim: fim, p_limit: limit, p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora),
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

async function fetchDiarioProduto(supabase: Db, p: Periodo, barra: string | null = null, excluir: string | null = null, corretora: string | null = null): Promise<DiarioProdutoRow[]> {
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_contratos_diario_produto', {
    p_inicio: inicio, p_fim: fim, p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora),
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    data: String(r.data),
    produto: String(r.produto ?? 'OUTRO'),
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
  }))
}

async function fetchHeatmapDow(supabase: Db, p: Periodo, barra: string | null = null): Promise<HeatmapCell[]> {
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

async function fetchEvolucaoMensal(supabase: Db, barra: string | null = null, excluir: string | null = null, corretora: string | null = null): Promise<EvolucaoMensalRow[]> {
  const { data, error } = await supabase.rpc('dashboard_contratos_evolucao_mensal', { p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora) })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    mes_data: String(r.mes_data),
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
    num_pregoes: num(r.num_pregoes),
    num_clientes: num(r.num_clientes),
  }))
}

async function fetchRetencaoMensal(supabase: Db, barra: string | null = null, excluir: string | null = null, corretora: string | null = null): Promise<RetencaoMensalRow[]> {
  const { data, error } = await supabase.rpc('dashboard_retencao_mensal', { p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora) })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    mes: String(r.mes),
    mes_seguinte: String(r.mes_seguinte),
    ativos: num(r.ativos),
    continuaram: num(r.continuaram),
    pararam: num(r.pararam),
    churn_pct: num(r.churn_pct),
    retencao_pct: num(r.retencao_pct),
    parcial: Boolean(r.parcial),
  }))
}

async function fetchIncentivoMensal(supabase: Db): Promise<IncentivoMensalRow[]> {
  const { data, error } = await supabase.rpc('dashboard_incentivo_mensal')
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    mes: String(r.mes),
    faixa_min: num(r.faixa_min),
    valor_unitario: num(r.valor_unitario),
    num_clientes: num(r.num_clientes),
    valor_total: num(r.valor_total),
  }))
}

async function fetchIncentivoClientes(supabase: Db, mes: string | null = null): Promise<IncentivoClienteRow[]> {
  const { data, error } = await supabase.rpc('dashboard_incentivo_clientes', { p_mes: mes })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    conta: String(r.conta ?? ''),
    cliente_nome: String(r.cliente_nome ?? 'Sem cliente'),
    pontos: num(r.pontos),
    lotes_operados: num(r.lotes_operados),
    faixa_min: num(r.faixa_min),
    valor_incentivo: num(r.valor_incentivo),
    proxima_faixa: r.proxima_faixa != null ? Number(r.proxima_faixa) : null,
    pontos_faltantes: r.pontos_faltantes != null ? Number(r.pontos_faltantes) : null,
  }))
}

async function fetchDrilldownDia(supabase: Db, data: string, barra: string | null = null, excluir: string | null = null, corretora: string | null = null): Promise<DrilldownRow[]> {
  const { data: rows, error } = await supabase.rpc('dashboard_contratos_drilldown_dia', { p_data: data, p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora) })
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

export async function getDrilldownDia(data: string, barra: string | null = null, excluir: string | null = null, corretora: string | null = null): Promise<DrilldownRow[]> {
  return fetchDrilldownDia(await adminOnly(), data, barra, excluir, corretora)
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
- Média diária no período: ${ctx.kpis.media_diaria.toFixed(0)} lotes/pregão
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
  corretora: string
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
  corretora: string        // 'TOTAL' (escritório) ou a corretora
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

async function fetchReceitaTotal(supabase: Db, p: Periodo, corretora: string | null = null, barra: string | null = null, excluir: string | null = null): Promise<ReceitaTotal> {
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_contratos_receita_total', {
    p_inicio: inicio, p_fim: fim, ...filtroCorretora(corretora), ...filtroBarra(barra), ...exclusao(excluir),
  })
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

async function fetchReceitaPorAssessor(supabase: Db, p: Periodo, corretora: string | null = null, barra: string | null = null, excluir: string | null = null): Promise<ReceitaPorAssessor[]> {
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_contratos_receita_por_assessor', {
    p_inicio: inicio, p_fim: fim, ...filtroCorretora(corretora), ...filtroBarra(barra), ...exclusao(excluir),
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    corretora: String(r.corretora ?? 'GENIAL'),
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

async function fetchReceitaProjecao(supabase: Db, corretora: string | null = null): Promise<ReceitaProjecao> {
  const { data, error } = await supabase.rpc('dashboard_contratos_receita_mes_projecao', { ...filtroCorretora(corretora) })
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

async function fetchAlertas(supabase: Db, inativoDias = 30, barra: string | null = null, corretora: string | null = null): Promise<AlertaRow[]> {
  const { data, error } = await supabase.rpc('dashboard_contratos_alertas', {
    p_inativo_dias: inativoDias, p_barra: barra, ...filtroCorretora(corretora),
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

async function fetchAcuracidadeResumo(supabase: Db, lookbackDays = 60): Promise<AcuracidadeResumo> {
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

async function fetchAcuracidadeSerie(supabase: Db, lookbackDays = 60): Promise<AcuracidadePonto[]> {
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

export type BarraAtiva = { barra_nome: string; numero: string | null; corretora: string }

async function fetchBarrasAtivas(supabase: Db): Promise<BarraAtiva[]> {
  const { data, error } = await supabase
    .from('assessor_pricing')
    .select('barra_nome, numero, corretora')
    .eq('ativo', true)
    .order('barra_nome', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    barra_nome: String(r.barra_nome ?? ''),
    numero: r.numero ? String(r.numero) : null,
    corretora: String(r.corretora ?? 'GENIAL'),
  }))
}

export async function getBarrasAtivas(): Promise<BarraAtiva[]> {
  return fetchBarrasAtivas(await adminOnly())
}

// Lista de clientes (nome como veio da importação) pro filtro "excluir cliente".
// Vem da tabela contratos: um cliente com várias contas aparece uma vez só.
export type ClienteListaRow = {
  cliente_nome: string
  lotes_operados: number
  num_contas: number
}

async function fetchClientesLista(supabase: Db, corretora: string | null = null): Promise<ClienteListaRow[]> {
  const { data, error } = await supabase.rpc('dashboard_clientes_lista', { ...filtroCorretora(corretora) })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    cliente_nome: String(r.cliente_nome ?? ''),
    lotes_operados: num(r.lotes_operados),
    num_contas: num(r.num_contas),
  }))
}

// Opções dos filtros globais (barras + clientes) numa única action, carregada 1x no Shell.
// A lista de clientes depende do supabase-s12: se a RPC ainda não existir, o seletor
// fica vazio mas as barras carregam normalmente.
export type FiltrosOpcoes = {
  barras: BarraAtiva[]
  clientes: ClienteListaRow[]
}

export async function getFiltrosOpcoes(): Promise<FiltrosOpcoes> {
  const supabase = await adminOnly()
  const [barras, clientes] = await Promise.all([
    fetchBarrasAtivas(supabase),
    fetchClientesLista(supabase).catch(() => [] as ClienteListaRow[]),
  ])
  return { barras, clientes }
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
  corretora: string
}

async function fetchCohortRetencao(supabase: Db, meses = 12): Promise<CohortPonto[]> {
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

async function fetchLtvClientes(supabase: Db, limit = 50): Promise<LtvCliente[]> {
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

export type LotesPorPlataformaRow = {
  plataforma: string
  lotes_operados: number
  lotes_zerados: number
  num_clientes: number
  num_dias: number
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

async function fetchProdutosDetalhados(supabase: Db, p: Periodo, barra: string | null = null): Promise<ProdutoDetalhado[]> {
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

async function fetchZeragemDistribuicao(supabase: Db, p: Periodo, barra: string | null = null): Promise<ZeragemIntensidade[]> {
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

async function fetchReceitaBrutaLiquida(supabase: Db, p: Periodo, corretora: string | null = null, barra: string | null = null, excluir: string | null = null): Promise<ReceitaBrutaLiquida> {
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_receita_bruta_liquida', {
    p_inicio: inicio, p_fim: fim, ...filtroCorretora(corretora), ...filtroBarra(barra), ...exclusao(excluir),
  })
  if (error) throw new Error(error.message)
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  return {
    receita_bruta: num(r?.receita_bruta),
    receita_liquida: num(r?.receita_liquida),
    pct_repasse_medio: num(r?.pct_repasse_medio),
  }
}

// Lotes por plataforma — respeita período, barra e exclusão de cliente (supabase-s12)
async function fetchLotesPorPlataforma(supabase: Db, p: Periodo, barra: string | null = null, excluir: string | null = null, corretora: string | null = null): Promise<LotesPorPlataformaRow[]> {
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_lotes_por_plataforma', {
    p_inicio: inicio, p_fim: fim, p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora),
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    plataforma: String(r.plataforma ?? 'Sem plataforma'),
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
    num_clientes: num(r.num_clientes),
    num_dias: num(r.num_dias),
  }))
}

async function fetchReceitaPorClearing(supabase: Db, p: Periodo): Promise<ReceitaPorClearing[]> {
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

async function fetchScoreQualidade(supabase: Db, p: Periodo): Promise<ScoreQualidadeRow[]> {
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

async function fetchMetasAssessor(supabase: Db): Promise<MetaAssessorRow[]> {
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

async function fetchFluxoOperacional(supabase: Db, p: Periodo, barra: string | null = null): Promise<FluxoOperacional> {
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

async function fetchIndiceSobrevivencia(supabase: Db, p: Periodo, barra: string | null = null): Promise<IndiceSobrevivencia> {
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

async function fetchRiscoOperacional(supabase: Db, limit = 50, barra: string | null = null): Promise<RiscoOperacionalRow[]> {
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

async function fetchCurvaAbc(supabase: Db, p: Periodo, barra: string | null = null, excluir: string | null = null, corretora: string | null = null): Promise<CurvaAbcRow[]> {
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_curva_abc', {
    p_inicio: inicio, p_fim: fim, p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora),
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

async function fetchScoreCliente(supabase: Db, limit = 100): Promise<ScoreClienteRow[]> {
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

async function fetchClustersClientes(supabase: Db): Promise<ClusterCliente[]> {
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

async function fetchCorrelacoes(supabase: Db): Promise<CorrelacaoRow[]> {
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

async function fetchRiscoEscritorio(supabase: Db): Promise<RiscoEscritorio> {
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

async function fetchAlertasExecutivos(supabase: Db): Promise<AlertaExecutivo[]> {
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

async function fetchBudgetZeragem(supabase: Db, p: Periodo): Promise<BudgetZeragemRow[]> {
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

async function fetchRankingAssessores(supabase: Db, p: Periodo, corretora: string | null = null): Promise<RankingAssessorRow[]> {
  const { inicio, fim } = await resolvePeriodo(p)
  // Período anterior: mesma duração imediatamente antes.
  // T12:00 evita o off-by-one de new Date('YYYY-MM-DD') interpretar UTC.
  const inicioD = new Date(inicio + 'T12:00:00')
  const fimD = new Date(fim + 'T12:00:00')
  const dur = Math.round((fimD.getTime() - inicioD.getTime()) / 86400000)
  const fimAnt = new Date(inicioD); fimAnt.setDate(fimAnt.getDate() - 1)
  const inicioAnt = new Date(fimAnt); inicioAnt.setDate(inicioAnt.getDate() - dur)
  const f = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const { data, error } = await supabase.rpc('dashboard_ranking_assessores', {
    p_inicio: inicio, p_fim: fim,
    p_inicio_anterior: f(inicioAnt), p_fim_anterior: f(fimAnt),
    ...filtroCorretora(corretora),
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
    corretora: String(r.corretora ?? 'GENIAL'),
  }))
}

async function fetchMetaAnual(supabase: Db, corretora: string | null = null): Promise<MetaAnual> {
  const { data, error } = await supabase.rpc('dashboard_meta_anual', { ...filtroCorretora(corretora) })
  if (error) throw new Error(error.message)
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  return {
    corretora: String(r?.corretora ?? (corretora ?? 'TOTAL')),
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

// -----------------------------------------------------------
// Corretoras — resumo e evolução mensal por corretora (supabase-s13)
// -----------------------------------------------------------
export type ResumoCorretoraRow = {
  corretora: string
  lotes_operados: number
  lotes_zerados: number
  num_clientes: number
  num_dias: number
  receita_bruta: number
  receita_liquida: number
}

export type EvolucaoCorretoraRow = {
  mes_data: string
  corretora: string
  lotes_operados: number
  lotes_zerados: number
  num_clientes: number
}

async function fetchResumoCorretoras(supabase: Db, p: Periodo, barra: string | null = null, excluir: string | null = null): Promise<ResumoCorretoraRow[]> {
  const { inicio, fim } = await resolvePeriodo(p)
  const { data, error } = await supabase.rpc('dashboard_resumo_corretoras', {
    p_inicio: inicio, p_fim: fim, p_barra: barra, ...exclusao(excluir),
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    corretora: String(r.corretora ?? ''),
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
    num_clientes: num(r.num_clientes),
    num_dias: num(r.num_dias),
    receita_bruta: num(r.receita_bruta),
    receita_liquida: num(r.receita_liquida),
  }))
}

async function fetchEvolucaoCorretora(supabase: Db, barra: string | null = null, excluir: string | null = null): Promise<EvolucaoCorretoraRow[]> {
  const { data, error } = await supabase.rpc('dashboard_evolucao_mensal_corretora', { p_barra: barra, ...exclusao(excluir) })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    mes_data: String(r.mes_data),
    corretora: String(r.corretora ?? ''),
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
    num_clientes: num(r.num_clientes),
  }))
}

// -----------------------------------------------------------
// Carga agrupada do dashboard
// O Next executa Server Actions em FILA (uma de cada vez, mesmo dentro de
// Promise.all). Cada aba disparava 6-8 actions — todas com getUser + select
// em profiles + RPC — e o navegador as enfileirava. Agora a aba faz UMA
// chamada; o servidor checa o acesso uma vez e roda as RPCs em paralelo.
// -----------------------------------------------------------
export type DataFlags = {
  kpis?: boolean
  produtos?: boolean
  topClientes?: boolean
  diario?: boolean
  heatmap?: boolean
  evolucao?: boolean
  receita?: boolean      // total + por_assessor + projecao
  meta?: boolean
  alertas?: boolean
  acuracidade?: boolean  // resumo + serie
  barras?: boolean       // carregada à parte pelo hook (não muda com os filtros)
  cohort?: boolean
  ltv?: boolean
  rankingAssessores?: boolean
  budget?: boolean
  produtosDetalhados?: boolean
  zeragemDistribuicao?: boolean
  receitaBrutaLiquida?: boolean
  plataformas?: boolean
  receitaClearing?: boolean
  scoreQualidade?: boolean
  metasAssessor?: boolean
  alertasExecutivos?: boolean
  fluxoOperacional?: boolean
  indiceSobrevivencia?: boolean
  riscoOperacional?: boolean
  curvaAbc?: boolean
  scoreCliente?: boolean
  clustersClientes?: boolean
  correlacoes?: boolean
  riscoEscritorio?: boolean
  retencao?: boolean
  incentivo?: boolean
  incentivoClientes?: boolean
  corretoras?: boolean         // resumo por corretora (lotes + receita)
  evolucaoCorretora?: boolean  // mês × corretora
  metasCorretoras?: boolean    // meta anual de cada corretora
}

export type DashboardBundle = {
  kpis: DashboardKpis | null
  produtos: ProdutoRow[]
  topClientes: TopClienteRow[]
  diario: DiarioProdutoRow[]
  heatmap: HeatmapCell[]
  evolucao: EvolucaoMensalRow[]
  receitaTotal: ReceitaTotal | null
  receitaPorAss: ReceitaPorAssessor[]
  receitaProj: ReceitaProjecao | null
  meta: MetaAnual | null
  alertas: AlertaRow[]
  acuracidade: AcuracidadeResumo | null
  acuracidadeSerie: AcuracidadePonto[]
  cohort: CohortPonto[]
  ltv: LtvCliente[]
  ranking: RankingAssessorRow[]
  budget: BudgetZeragemRow[]
  produtosDetalhados: ProdutoDetalhado[]
  zeragemDist: ZeragemIntensidade[]
  receitaBL: ReceitaBrutaLiquida | null
  plataformas: LotesPorPlataformaRow[]
  receitaClear: ReceitaPorClearing[]
  score: ScoreQualidadeRow[]
  metasAss: MetaAssessorRow[]
  alertasExec: AlertaExecutivo[]
  fluxoOp: FluxoOperacional | null
  indiceSobr: IndiceSobrevivencia | null
  riscoOp: RiscoOperacionalRow[]
  abc: CurvaAbcRow[]
  scoreCli: ScoreClienteRow[]
  clusters: ClusterCliente[]
  correl: CorrelacaoRow[]
  riscoEsc: RiscoEscritorio | null
  retencao: RetencaoMensalRow[]
  incentivo: IncentivoMensalRow[]
  incentivoCli: IncentivoClienteRow[]
  corretoras: ResumoCorretoraRow[]
  evolucaoCorretora: EvolucaoCorretoraRow[]
  metasCorretoras: MetaAnual[]
  erros: string[]        // mensagens das RPCs que falharam (as demais chegam normalmente)
}

export async function getDashboardBundle(
  periodo: Periodo,
  barra: string | null,
  excluir: string | null,
  corretora: string | null,
  flags: DataFlags,
): Promise<DashboardBundle> {
  const supabase = await adminOnly()
  const erros: string[] = []
  // Cada chamada captura o próprio erro: uma RPC quebrada não descarta as demais.
  const safe = <T>(cond: boolean | undefined, call: () => Promise<T>, fallback: T): Promise<T> =>
    cond
      ? call().catch((e: Error) => { erros.push(e?.message ?? 'Falha ao carregar dados'); return fallback })
      : Promise.resolve(fallback)

  const [
    kpis, produtos, topClientes, diario, heatmap, evolucao,
    receitaTotal, receitaPorAss, receitaProj, meta,
    alertas, acuracidade, acuracidadeSerie,
    cohort, ltv, ranking, budget,
    produtosDetalhados, zeragemDist, receitaBL, plataformas, receitaClear,
    score, metasAss, alertasExec,
    fluxoOp, indiceSobr, riscoOp,
    abc, scoreCli, clusters, correl, riscoEsc,
    retencao, incentivo, incentivoCli,
    corretoras, evolucaoCorretora, metasCorretoras,
  ] = await Promise.all([
    safe(flags.kpis,        () => fetchKpis(supabase, periodo, barra, excluir, corretora),            null),
    safe(flags.produtos,    () => fetchPorProduto(supabase, periodo, barra, excluir, corretora),      []),
    safe(flags.topClientes, () => fetchTopClientes(supabase, periodo, 20, barra, excluir, corretora), []),
    safe(flags.diario,      () => fetchDiarioProduto(supabase, periodo, barra, excluir, corretora),   []),
    safe(flags.heatmap,     () => fetchHeatmapDow(supabase, periodo, barra),                          []),
    safe(flags.evolucao,    () => fetchEvolucaoMensal(supabase, barra, excluir, corretora),           []),
    safe(flags.receita,     () => fetchReceitaTotal(supabase, periodo, corretora, barra, excluir),    null),
    safe(flags.receita,     () => fetchReceitaPorAssessor(supabase, periodo, corretora, barra, excluir), []),
    safe(flags.receita,     () => fetchReceitaProjecao(supabase, corretora),                          null),
    safe(flags.meta,        () => fetchMetaAnual(supabase, corretora),                                null),
    safe(flags.alertas,     () => fetchAlertas(supabase, 30, barra, corretora),                       []),
    safe(flags.acuracidade, () => fetchAcuracidadeResumo(supabase, 60),                               null),
    safe(flags.acuracidade, () => fetchAcuracidadeSerie(supabase, 60),                                []),
    safe(flags.cohort,      () => fetchCohortRetencao(supabase, 12),                                  []),
    safe(flags.ltv,         () => fetchLtvClientes(supabase, 50),                                     []),
    safe(flags.rankingAssessores, () => fetchRankingAssessores(supabase, periodo, corretora),         []),
    safe(flags.budget,      () => fetchBudgetZeragem(supabase, periodo),                              []),
    safe(flags.produtosDetalhados,  () => fetchProdutosDetalhados(supabase, periodo, barra),                     []),
    safe(flags.zeragemDistribuicao, () => fetchZeragemDistribuicao(supabase, periodo, barra),                    []),
    safe(flags.receitaBrutaLiquida, () => fetchReceitaBrutaLiquida(supabase, periodo, corretora, barra, excluir), null),
    safe(flags.plataformas,         () => fetchLotesPorPlataforma(supabase, periodo, barra, excluir, corretora),  []),
    safe(flags.receitaClearing,     () => fetchReceitaPorClearing(supabase, periodo),                            []),
    safe(flags.scoreQualidade,      () => fetchScoreQualidade(supabase, periodo),                                []),
    safe(flags.metasAssessor,       () => fetchMetasAssessor(supabase),                                          []),
    safe(flags.alertasExecutivos,   () => fetchAlertasExecutivos(supabase),                                      []),
    safe(flags.fluxoOperacional,    () => fetchFluxoOperacional(supabase, periodo, barra),                       null),
    safe(flags.indiceSobrevivencia, () => fetchIndiceSobrevivencia(supabase, periodo, barra),                    null),
    safe(flags.riscoOperacional,    () => fetchRiscoOperacional(supabase, 50, barra),                            []),
    safe(flags.curvaAbc,            () => fetchCurvaAbc(supabase, periodo, barra, excluir, corretora),           []),
    safe(flags.scoreCliente,        () => fetchScoreCliente(supabase, 100),                                      []),
    safe(flags.clustersClientes,    () => fetchClustersClientes(supabase),                                       []),
    safe(flags.correlacoes,         () => fetchCorrelacoes(supabase),                                            []),
    safe(flags.riscoEscritorio,     () => fetchRiscoEscritorio(supabase),                                        null),
    safe(flags.retencao,            () => fetchRetencaoMensal(supabase, barra, excluir, corretora),              []),
    safe(flags.incentivo,           () => fetchIncentivoMensal(supabase),                                        []),
    safe(flags.incentivoClientes,   () => fetchIncentivoClientes(supabase, null),                                []),
    safe(flags.corretoras,          () => fetchResumoCorretoras(supabase, periodo, barra, excluir),              []),
    safe(flags.evolucaoCorretora,   () => fetchEvolucaoCorretora(supabase, barra, excluir),                      []),
    safe(flags.metasCorretoras,     () => Promise.all(CORRETORAS.map(c => fetchMetaAnual(supabase, c))),         []),
  ])

  return {
    kpis, produtos, topClientes, diario, heatmap, evolucao,
    receitaTotal, receitaPorAss, receitaProj, meta,
    alertas, acuracidade, acuracidadeSerie,
    cohort, ltv, ranking, budget,
    produtosDetalhados, zeragemDist, receitaBL, plataformas, receitaClear,
    score, metasAss, alertasExec,
    fluxoOp, indiceSobr, riscoOp,
    abc, scoreCli, clusters, correl, riscoEsc,
    retencao, incentivo, incentivoCli,
    corretoras, evolucaoCorretora, metasCorretoras,
    erros,
  }
}

// -----------------------------------------------------------
// Resumo da página inicial (/dashboard) — mês atual, tudo numa chamada.
// É chamado direto pelo Server Component da home (render no servidor,
// sem passar pelo cliente), com uma única checagem de acesso.
// -----------------------------------------------------------
export type ImportacaoResumo = {
  id: string
  nome_arquivo: string
  corretora: string
  total_linhas: number
  total_lotes_operados: number
  total_lotes_zerados: number
  created_at: string
}

export type ResumoContratos = {
  mes: DateRange                              // 1º dia do mês → hoje (Brasília)
  kpis: DashboardKpis | null
  receitaBL: ReceitaBrutaLiquida | null
  receitaProj: ReceitaProjecao | null
  meta: MetaAnual | null
  evolucao: EvolucaoMensalRow[]               // últimos 12 meses
  topClientes: TopClienteRow[]                // top 10 do mês
  produtos: ProdutoRow[]                      // mês atual
  plataformas: LotesPorPlataformaRow[] | null // null = RPC indisponível (supabase-s12 não aplicado)
  corretoras: ResumoCorretoraRow[] | null     // null = RPC indisponível (supabase-s13 não aplicado)
  importacoes: ImportacaoResumo[]             // últimas 5
  erros: string[]
}

async function fetchImportacoesRecentes(supabase: Db, limit: number): Promise<ImportacaoResumo[]> {
  const { data, error } = await supabase
    .from('contratos_importacoes')
    .select('id, nome_arquivo, corretora, total_linhas, total_lotes_operados, total_lotes_zerados, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    id: String(r.id),
    nome_arquivo: String(r.nome_arquivo ?? ''),
    corretora: String(r.corretora ?? 'GENIAL'),
    total_linhas: num(r.total_linhas),
    total_lotes_operados: num(r.total_lotes_operados),
    total_lotes_zerados: num(r.total_lotes_zerados),
    created_at: String(r.created_at ?? ''),
  }))
}

export async function getResumoContratos(): Promise<ResumoContratos> {
  const supabase = await adminOnly()
  const hoje = hojeBrasil()
  const mes: DateRange = {
    inicio: `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`,
    fim: fmtDate(hoje),
  }
  const periodo: Periodo = `custom:${mes.inicio}:${mes.fim}`
  const erros: string[] = []
  const safe = <T>(call: () => Promise<T>, fallback: T): Promise<T> =>
    call().catch((e: Error) => { erros.push(e?.message ?? 'Falha ao carregar dados'); return fallback })

  const [kpis, receitaBL, receitaProj, meta, evolucao, topClientes, produtos, plataformas, importacoes, corretoras] =
    await Promise.all([
      safe(() => fetchKpis(supabase, periodo),                null),
      safe(() => fetchReceitaBrutaLiquida(supabase, periodo), null),
      safe(() => fetchReceitaProjecao(supabase),              null),
      safe(() => fetchMetaAnual(supabase),                    null),
      safe(() => fetchEvolucaoMensal(supabase),               []),
      safe(() => fetchTopClientes(supabase, periodo, 10),     []),
      safe(() => fetchPorProduto(supabase, periodo),          []),
      // Depende do supabase-s12: sem a RPC, vira null e a home mostra um aviso (não um erro).
      fetchLotesPorPlataforma(supabase, periodo).catch(() => null),
      safe(() => fetchImportacoesRecentes(supabase, 5),       []),
      // Depende do supabase-s13: sem a RPC, vira null e a home esconde o bloco.
      fetchResumoCorretoras(supabase, periodo).catch(() => null),
    ])

  return {
    mes, kpis, receitaBL, receitaProj, meta,
    evolucao: evolucao.slice(-12),
    topClientes, produtos, plataformas, corretoras, importacoes, erros,
  }
}
