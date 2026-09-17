'use server'

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'

type Db = Awaited<ReturnType<typeof createClient>>

// -----------------------------------------------------------
// Tipos compartilhados com as views
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

export type ProdutoDetalhado = {
  produto: string
  lotes_dia: number
  lotes_mtd: number
  lotes_mes_anterior: number
  lotes_periodo: number
  media_diaria: number
  delta_pct_vs_mes_ant: number
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
  pct_repasse: number      // fração da receita que fica com o escritório (supabase-s14)
  receita_liquida: number  // receita_total × pct_repasse
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

// Ranking de barras (período atual vs anterior, mesma duração)
export type BarraRankingRow = {
  rank: number
  corretora: string
  barra_nome: string
  numero: string | null
  clientes_ativos: number
  clientes_anterior: number
  clientes_novos: number
  clientes_churn: number
  taxa_retencao: number
  lotes_operados: number
  lotes_anterior: number | null       // null antes do supabase-s15
  delta_lotes_pct: number | null
  lotes_zerados: number
  pct_zeragem: number
  receita_total: number
  receita_anterior: number
  delta_receita_pct: number
}

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

export type ClienteListaRow = {
  cliente_nome: string
  lotes_operados: number
  num_contas: number
}

export type BarraLista = {
  corretora: string
  barra_nome: string
  numero: string | null
  lotes_operados: number
}

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

export type EvolucaoBarraRow = {
  mes_data: string
  corretora: string
  barra_nome: string
  lotes_operados: number
}

export type ImportacaoResumo = {
  id: string
  nome_arquivo: string
  corretora: string
  total_linhas: number
  total_lotes_operados: number
  total_lotes_zerados: number
  created_at: string
}

// -----------------------------------------------------------
// Datas: "hoje" no fuso America/Sao_Paulo (o servidor roda em UTC)
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

function resolvePeriodo(p: Periodo): DateRange {
  const today = hojeBrasil()

  if (p.startsWith('custom:')) {
    const [, inicio, fim] = p.split(':')
    const re = /^\d{4}-\d{2}-\d{2}$/
    if (re.test(inicio) && re.test(fim)) {
      return inicio <= fim ? { inicio, fim } : { inicio: fim, fim: inicio }
    }
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
  return { inicio: '2000-01-01', fim: fmtDate(today) }
}

// Período imediatamente anterior, com a mesma duração (pra variações).
// 'tudo' não tem período anterior que faça sentido.
function periodoAnterior(p: Periodo): DateRange | null {
  if (p === 'tudo') return null
  const { inicio, fim } = resolvePeriodo(p)
  const ini = new Date(inicio + 'T12:00:00')
  const f = new Date(fim + 'T12:00:00')
  const dur = Math.round((f.getTime() - ini.getTime()) / 86400000)
  const fimAnt = new Date(ini); fimAnt.setDate(fimAnt.getDate() - 1)
  const iniAnt = new Date(fimAnt); iniAnt.setDate(iniAnt.getDate() - dur)
  return { inicio: fmtDate(iniAnt), fim: fmtDate(fimAnt) }
}

// -----------------------------------------------------------
// Auth + helpers
// -----------------------------------------------------------
async function adminOnly() {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Não autorizado')
  return await createClient()
}

const num = (v: unknown) => (v == null ? 0 : Number(v))
const str = (v: unknown) => (v == null ? null : String(v))

// Parâmetros opcionais só vão quando há filtro: assim as RPCs continuam
// funcionando com a assinatura antiga se um SQL ainda não foi aplicado.
const exclusao = (excluir: string | null) => (excluir ? { p_excluir_cliente: excluir } : {})
const filtroCorretora = (corretora: string | null) => (corretora ? { p_corretora: corretora } : {})
const filtroBarra = (barra: string | null) => (barra ? { p_barra: barra } : {})

// -----------------------------------------------------------
// Fetchers (internos — recebem o client já autenticado)
// -----------------------------------------------------------
async function fetchKpis(supabase: Db, range: DateRange, barra: string | null, excluir: string | null, corretora: string | null): Promise<DashboardKpis> {
  const { data, error } = await supabase.rpc('dashboard_contratos_kpis', {
    p_inicio: range.inicio, p_fim: range.fim, p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora),
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

async function fetchPorProduto(supabase: Db, range: DateRange, barra: string | null, excluir: string | null, corretora: string | null): Promise<ProdutoRow[]> {
  const { data, error } = await supabase.rpc('dashboard_contratos_por_produto', {
    p_inicio: range.inicio, p_fim: range.fim, p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora),
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

async function fetchProdutosDetalhados(supabase: Db, range: DateRange, barra: string | null, excluir: string | null, corretora: string | null): Promise<ProdutoDetalhado[]> {
  const { data, error } = await supabase.rpc('dashboard_contratos_por_produto_detalhado', {
    p_inicio: range.inicio, p_fim: range.fim, p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora),
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

async function fetchTopClientes(supabase: Db, range: DateRange, limit: number, barra: string | null, excluir: string | null, corretora: string | null): Promise<TopClienteRow[]> {
  const { data, error } = await supabase.rpc('dashboard_contratos_top_clientes', {
    p_inicio: range.inicio, p_fim: range.fim, p_limit: limit, p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora),
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

async function fetchDiarioProduto(supabase: Db, range: DateRange, barra: string | null, excluir: string | null, corretora: string | null): Promise<DiarioProdutoRow[]> {
  const { data, error } = await supabase.rpc('dashboard_contratos_diario_produto', {
    p_inicio: range.inicio, p_fim: range.fim, p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora),
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    data: String(r.data),
    produto: String(r.produto ?? 'OUTRO'),
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
  }))
}

async function fetchEvolucaoMensal(supabase: Db, barra: string | null, excluir: string | null, corretora: string | null): Promise<EvolucaoMensalRow[]> {
  const { data, error } = await supabase.rpc('dashboard_contratos_evolucao_mensal', {
    p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora),
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    mes_data: String(r.mes_data),
    lotes_operados: num(r.lotes_operados),
    lotes_zerados: num(r.lotes_zerados),
    num_pregoes: num(r.num_pregoes),
    num_clientes: num(r.num_clientes),
  }))
}

async function fetchRetencaoMensal(supabase: Db, barra: string | null, excluir: string | null, corretora: string | null): Promise<RetencaoMensalRow[]> {
  const { data, error } = await supabase.rpc('dashboard_retencao_mensal', {
    p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora),
  })
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

async function fetchIncentivoClientes(supabase: Db, mes: string | null): Promise<IncentivoClienteRow[]> {
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

async function fetchDrilldownDia(supabase: Db, data: string, barra: string | null, excluir: string | null, corretora: string | null): Promise<DrilldownRow[]> {
  const { data: rows, error } = await supabase.rpc('dashboard_contratos_drilldown_dia', {
    p_data: data, p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora),
  })
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

async function fetchReceitaPorAssessor(supabase: Db, range: DateRange, corretora: string | null, barra: string | null, excluir: string | null): Promise<ReceitaPorAssessor[]> {
  const { data, error } = await supabase.rpc('dashboard_contratos_receita_por_assessor', {
    p_inicio: range.inicio, p_fim: range.fim, ...filtroCorretora(corretora), ...filtroBarra(barra), ...exclusao(excluir),
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
    // Antes do supabase-s14 essas colunas não existem: assume 50% de repasse
    pct_repasse: r.pct_repasse != null ? num(r.pct_repasse) : 0.5,
    receita_liquida: r.receita_liquida != null ? num(r.receita_liquida) : num(r.receita_total) * 0.5,
  }))
}

async function fetchReceitaProjecao(supabase: Db, corretora: string | null): Promise<ReceitaProjecao> {
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

const mapMeta = (r: Record<string, unknown>, fallbackEscopo: string): MetaAnual => ({
  corretora: String(r.corretora ?? fallbackEscopo),
  ano: num(r.ano),
  meta_lotes: num(r.meta_lotes),
  meta_receita: num(r.meta_receita),
  realizado_lotes: num(r.realizado_lotes),
  realizado_receita: num(r.realizado_receita),
  pct_lotes: num(r.pct_lotes),
  pct_receita: num(r.pct_receita),
  dias_corridos_restantes: num(r.dias_corridos_restantes),
  ritmo_lotes_necessario: num(r.ritmo_lotes_necessario),
  ritmo_receita_necessario: num(r.ritmo_receita_necessario),
})

async function fetchMetaAnual(supabase: Db, corretora: string | null): Promise<MetaAnual> {
  const { data, error } = await supabase.rpc('dashboard_meta_anual', { ...filtroCorretora(corretora) })
  if (error) throw new Error(error.message)
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  return mapMeta(r ?? {}, corretora ?? 'TOTAL')
}

// Metas do ano de todos os escopos (TOTAL + corretoras) numa única RPC (supabase-s14).
async function fetchMetasAnuais(supabase: Db, corretoraAtual: string | null): Promise<MetaAnual[]> {
  const { data, error } = await supabase.rpc('dashboard_metas_anuais')
  if (error) {
    // Antes do supabase-s14 a RPC não existe: calcula só o escopo em uso (mais lento).
    if (error.code === 'PGRST202') {
      const total = await fetchMetaAnual(supabase, null)
      if (!corretoraAtual) return [total]
      return [total, await fetchMetaAnual(supabase, corretoraAtual)]
    }
    throw new Error(error.message)
  }
  return ((data ?? []) as Record<string, unknown>[]).map(r => mapMeta(r, 'TOTAL'))
}

async function fetchRankingBarras(supabase: Db, range: DateRange, anterior: DateRange, corretora: string | null, excluir: string | null): Promise<BarraRankingRow[]> {
  const { data, error } = await supabase.rpc('dashboard_ranking_assessores', {
    p_inicio: range.inicio, p_fim: range.fim,
    p_inicio_anterior: anterior.inicio, p_fim_anterior: anterior.fim,
    ...filtroCorretora(corretora), ...exclusao(excluir),
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const lotes = num(r.lotes_operados)
    const lotesAnt = r.lotes_anterior != null ? num(r.lotes_anterior) : null
    return {
      rank: num(r.rank),
      corretora: String(r.corretora ?? 'GENIAL'),
      barra_nome: String(r.barra_nome ?? ''),
      numero: r.numero ? String(r.numero) : null,
      clientes_ativos: num(r.clientes_ativos),
      clientes_anterior: num(r.clientes_anterior),
      clientes_novos: num(r.clientes_novos),
      clientes_churn: num(r.clientes_churn),
      taxa_retencao: num(r.taxa_retencao),
      lotes_operados: lotes,
      lotes_anterior: lotesAnt,
      delta_lotes_pct: lotesAnt == null ? null : lotesAnt > 0 ? ((lotes - lotesAnt) / lotesAnt) * 100 : lotes > 0 ? 100 : 0,
      lotes_zerados: num(r.lotes_zerados),
      pct_zeragem: num(r.pct_zeragem),
      receita_total: num(r.receita_total),
      receita_anterior: num(r.receita_anterior),
      delta_receita_pct: num(r.delta_receita_pct),
    }
  })
}

async function fetchLotesPorPlataforma(supabase: Db, range: DateRange, barra: string | null, excluir: string | null, corretora: string | null): Promise<LotesPorPlataformaRow[]> {
  const { data, error } = await supabase.rpc('dashboard_lotes_por_plataforma', {
    p_inicio: range.inicio, p_fim: range.fim, p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora),
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

async function fetchCurvaAbc(supabase: Db, range: DateRange, barra: string | null, excluir: string | null, corretora: string | null): Promise<CurvaAbcRow[]> {
  const { data, error } = await supabase.rpc('dashboard_curva_abc', {
    p_inicio: range.inicio, p_fim: range.fim, p_barra: barra, ...exclusao(excluir), ...filtroCorretora(corretora),
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

async function fetchClientesLista(supabase: Db): Promise<ClienteListaRow[]> {
  const { data, error } = await supabase.rpc('dashboard_clientes_lista')
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    cliente_nome: String(r.cliente_nome ?? ''),
    lotes_operados: num(r.lotes_operados),
    num_contas: num(r.num_contas),
  }))
}

// Barras que existem nos lotes (supabase-s15). Antes disso, cai na lista de tarifas.
async function fetchBarrasLista(supabase: Db): Promise<BarraLista[]> {
  const { data, error } = await supabase.rpc('dashboard_barras_lista')
  if (!error) {
    return ((data ?? []) as Record<string, unknown>[]).map(r => ({
      corretora: String(r.corretora ?? 'GENIAL'),
      barra_nome: String(r.barra_nome ?? ''),
      numero: r.numero ? String(r.numero) : null,
      lotes_operados: num(r.lotes_operados),
    }))
  }
  if (error.code !== 'PGRST202') throw new Error(error.message)
  const { data: pricing, error: e2 } = await supabase
    .from('assessor_pricing')
    .select('barra_nome, numero, corretora')
    .eq('ativo', true)
    .order('barra_nome', { ascending: true })
  if (e2) throw new Error(e2.message)
  return ((pricing ?? []) as Record<string, unknown>[]).map(r => ({
    corretora: String(r.corretora ?? 'GENIAL'),
    barra_nome: String(r.barra_nome ?? ''),
    numero: r.numero ? String(r.numero) : null,
    lotes_operados: 0,
  }))
}

async function fetchResumoCorretoras(supabase: Db, range: DateRange, barra: string | null, excluir: string | null): Promise<ResumoCorretoraRow[]> {
  const { data, error } = await supabase.rpc('dashboard_resumo_corretoras', {
    p_inicio: range.inicio, p_fim: range.fim, p_barra: barra, ...exclusao(excluir),
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

async function fetchEvolucaoCorretora(supabase: Db, barra: string | null, excluir: string | null): Promise<EvolucaoCorretoraRow[]> {
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

async function fetchEvolucaoBarras(supabase: Db, corretora: string | null, excluir: string | null): Promise<EvolucaoBarraRow[]> {
  const { data, error } = await supabase.rpc('dashboard_evolucao_mensal_barra', {
    ...filtroCorretora(corretora), ...exclusao(excluir),
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    mes_data: String(r.mes_data),
    corretora: String(r.corretora ?? ''),
    barra_nome: String(r.barra_nome ?? 'Sem barra'),
    lotes_operados: num(r.lotes_operados),
  }))
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

// -----------------------------------------------------------
// Derivações (evitam RPCs que refaziam a mesma conta)
// -----------------------------------------------------------
function totalizarReceita(rows: ReceitaPorAssessor[]): ReceitaTotal {
  const soma = (f: (r: ReceitaPorAssessor) => number) => rows.reduce((acc, r) => acc + f(r), 0)
  return {
    receita_operados: soma(r => r.receita_operados),
    receita_zeragem: soma(r => r.receita_zeragem),
    receita_total: soma(r => r.receita_total),
    num_barras: rows.length,
    num_barras_sem_pricing: rows.filter(r => r.preco_lote_futuros === 0 && r.modelo_zeragem === 'b2b').length,
  }
}

function brutaLiquidaDe(rows: ReceitaPorAssessor[]): ReceitaBrutaLiquida {
  const bruta = rows.reduce((acc, r) => acc + r.receita_total, 0)
  const liquida = rows.reduce((acc, r) => acc + r.receita_liquida, 0)
  return {
    receita_bruta: Math.round(bruta * 100) / 100,
    receita_liquida: Math.round(liquida * 100) / 100,
    pct_repasse_medio: bruta > 0 ? Math.round((liquida / bruta) * 10000) / 100 : 0,
  }
}

// -----------------------------------------------------------
// Fila de concorrência + cache em memória
// O banco é pequeno: 14 consultas simultâneas faziam cada uma passar do
// statement_timeout. A fila limita a 4 por vez. O cache guarda o resultado
// por 10 min, com a "versão dos dados" (última importação) na chave: assim
// uma importação nova invalida tudo sem esperar o TTL.
// -----------------------------------------------------------
const MAX_RPC_SIMULTANEAS = 4
function criarFila(max: number) {
  let ativos = 0
  const espera: (() => void)[] = []
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (ativos >= max) await new Promise<void>(resolve => espera.push(resolve))
    ativos++
    try {
      return await fn()
    } finally {
      ativos--
      espera.shift()?.()
    }
  }
}

const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX_ENTRADAS = 80
const cache = new Map<string, { expira: number; valor: unknown }>()

function lerCache<T>(chave: string): T | null {
  const hit = cache.get(chave)
  if (!hit) return null
  if (hit.expira <= Date.now()) { cache.delete(chave); return null }
  return hit.valor as T
}

function gravarCache(chave: string, valor: unknown) {
  if (cache.size >= CACHE_MAX_ENTRADAS) {
    const primeira = cache.keys().next().value
    if (primeira !== undefined) cache.delete(primeira)
  }
  cache.set(chave, { expira: Date.now() + CACHE_TTL_MS, valor })
}

// Muda a cada importação (ou ao desfazer uma): última data + quantidade.
async function versaoDados(supabase: Db): Promise<string> {
  const { data, count } = await supabase
    .from('contratos_importacoes')
    .select('created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(1)
  return `${(data?.[0] as { created_at?: string } | undefined)?.created_at ?? ''}|${count ?? 0}`
}

// -----------------------------------------------------------
// Actions exportadas
// -----------------------------------------------------------
export async function getDrilldownDia(
  data: string, barra: string | null = null, excluir: string | null = null, corretora: string | null = null,
): Promise<DrilldownRow[]> {
  return fetchDrilldownDia(await adminOnly(), data, barra, excluir, corretora)
}

// Opções dos filtros globais (barras + clientes) numa única action, carregada 1x no Shell.
export type FiltrosOpcoes = {
  barras: BarraLista[]
  clientes: ClienteListaRow[]
}

export async function getFiltrosOpcoes(): Promise<FiltrosOpcoes> {
  const supabase = await adminOnly()
  const versao = await versaoDados(supabase)
  const chave = `filtros|${versao}`
  const hit = lerCache<FiltrosOpcoes>(chave)
  if (hit) return hit
  const [barras, clientes] = await Promise.all([
    fetchBarrasLista(supabase),
    fetchClientesLista(supabase).catch(() => [] as ClienteListaRow[]),
  ])
  const opcoes = { barras, clientes }
  gravarCache(chave, opcoes)
  return opcoes
}

export type DataFlags = {
  kpis?: boolean               // inclui o período anterior (pra variação)
  produtos?: boolean
  produtosDetalhados?: boolean
  topClientes?: boolean
  diario?: boolean
  evolucao?: boolean
  receita?: boolean            // receita por barra + total + projeção
  receitaBrutaLiquida?: boolean
  meta?: boolean
  metasCorretoras?: boolean
  ranking?: boolean            // ranking de barras (atual vs anterior)
  plataformas?: boolean
  retencao?: boolean
  incentivo?: boolean
  incentivoClientes?: boolean
  corretoras?: boolean
  evolucaoCorretora?: boolean
  evolucaoBarras?: boolean
  curvaAbc?: boolean
}

export type DashboardBundle = {
  range: DateRange
  kpis: DashboardKpis | null
  kpisAnterior: DashboardKpis | null
  produtos: ProdutoRow[]
  produtosDetalhados: ProdutoDetalhado[]
  topClientes: TopClienteRow[]
  diario: DiarioProdutoRow[]
  evolucao: EvolucaoMensalRow[]
  receitaTotal: ReceitaTotal | null
  receitaPorAss: ReceitaPorAssessor[]
  receitaProj: ReceitaProjecao | null
  receitaBL: ReceitaBrutaLiquida | null
  meta: MetaAnual | null
  metasCorretoras: MetaAnual[]
  ranking: BarraRankingRow[]
  plataformas: LotesPorPlataformaRow[]
  retencao: RetencaoMensalRow[]
  incentivo: IncentivoMensalRow[]
  incentivoCli: IncentivoClienteRow[]
  corretoras: ResumoCorretoraRow[]
  evolucaoCorretora: EvolucaoCorretoraRow[]
  evolucaoBarras: EvolucaoBarraRow[]
  abc: CurvaAbcRow[]
  erros: string[]        // mensagens das RPCs que falharam (as demais chegam normalmente)
}

// Uma única server action por carga de aba. O Next enfileira Server Actions
// (mesmo em Promise.all), então várias chamadas separadas rodavam em sequência.
export async function getDashboardBundle(
  periodo: Periodo,
  barra: string | null,
  excluir: string | null,
  corretora: string | null,
  flags: DataFlags,
): Promise<DashboardBundle> {
  const supabase = await adminOnly()
  const range = resolvePeriodo(periodo)
  const anterior = periodoAnterior(periodo)
  const escopo = corretora ?? 'TOTAL'

  const flagsAtivas = Object.entries(flags).filter(([, v]) => v).map(([k]) => k).sort().join(',')
  const versao = await versaoDados(supabase)
  const chave = `bundle|${versao}|${fmtDate(hojeBrasil())}|${periodo}|${corretora ?? ''}|${barra ?? ''}|${excluir ?? ''}|${flagsAtivas}`
  const hit = lerCache<DashboardBundle>(chave)
  if (hit) return hit

  const erros: string[] = []
  const fila = criarFila(MAX_RPC_SIMULTANEAS)
  // Cada chamada captura o próprio erro: uma RPC quebrada não descarta as demais.
  const safe = <T>(cond: boolean | undefined, call: () => Promise<T>, fallback: T): Promise<T> =>
    cond
      ? fila(call).catch((e: Error) => { erros.push(e?.message ?? 'Falha ao carregar dados'); return fallback })
      : Promise.resolve(fallback)

  const querReceita = !!(flags.receita || flags.receitaBrutaLiquida)
  const querMetas = !!(flags.meta || flags.metasCorretoras)
  // Ranking precisa de um período anterior; 'tudo' não tem — usa o mesmo intervalo.
  const rangeAnterior = anterior ?? range

  // As mais pesadas entram primeiro na fila
  const [
    metas, receitaPorAssTodas, ranking, receitaProj, kpis, kpisAnterior,
    corretoras, evolucao, evolucaoCorretora, evolucaoBarras,
    produtos, produtosDetalhados, topClientes, diario,
    plataformas, retencao, abc, incentivo, incentivoCli,
  ] = await Promise.all([
    safe(querMetas,           () => fetchMetasAnuais(supabase, corretora),                                  [] as MetaAnual[]),
    safe(querReceita,         () => fetchReceitaPorAssessor(supabase, range, corretora, barra, excluir),    [] as ReceitaPorAssessor[]),
    safe(flags.ranking,       () => fetchRankingBarras(supabase, range, rangeAnterior, corretora, excluir), [] as BarraRankingRow[]),
    safe(flags.receita,       () => fetchReceitaProjecao(supabase, corretora),                              null),
    safe(flags.kpis,          () => fetchKpis(supabase, range, barra, excluir, corretora),                  null),
    safe(!!flags.kpis && !!anterior, () => fetchKpis(supabase, anterior!, barra, excluir, corretora),       null),
    safe(flags.corretoras,    () => fetchResumoCorretoras(supabase, range, barra, excluir),                 []),
    safe(flags.evolucao,      () => fetchEvolucaoMensal(supabase, barra, excluir, corretora),               []),
    safe(flags.evolucaoCorretora, () => fetchEvolucaoCorretora(supabase, barra, excluir),                   []),
    safe(flags.evolucaoBarras, () => fetchEvolucaoBarras(supabase, corretora, excluir),                     []),
    safe(flags.produtos,      () => fetchPorProduto(supabase, range, barra, excluir, corretora),            []),
    safe(flags.produtosDetalhados, () => fetchProdutosDetalhados(supabase, range, barra, excluir, corretora), []),
    safe(flags.topClientes,   () => fetchTopClientes(supabase, range, 10, barra, excluir, corretora),       []),
    safe(flags.diario,        () => fetchDiarioProduto(supabase, range, barra, excluir, corretora),         []),
    safe(flags.plataformas,   () => fetchLotesPorPlataforma(supabase, range, barra, excluir, corretora),    []),
    safe(flags.retencao,      () => fetchRetencaoMensal(supabase, barra, excluir, corretora),               []),
    safe(flags.curvaAbc,      () => fetchCurvaAbc(supabase, range, barra, excluir, corretora),              []),
    safe(flags.incentivo,     () => fetchIncentivoMensal(supabase),                                         []),
    safe(flags.incentivoClientes, () => fetchIncentivoClientes(supabase, null),                             []),
  ])

  const bundle: DashboardBundle = {
    range,
    kpis, kpisAnterior,
    produtos, produtosDetalhados, topClientes, diario, evolucao,
    receitaPorAss: flags.receita ? receitaPorAssTodas : [],
    receitaTotal: flags.receita ? totalizarReceita(receitaPorAssTodas) : null,
    receitaProj,
    receitaBL: flags.receitaBrutaLiquida ? brutaLiquidaDe(receitaPorAssTodas) : null,
    meta: flags.meta ? (metas.find(m => m.corretora === escopo) ?? null) : null,
    metasCorretoras: flags.metasCorretoras ? metas.filter(m => m.corretora !== 'TOTAL') : [],
    ranking, plataformas, retencao, incentivo, incentivoCli,
    corretoras, evolucaoCorretora, evolucaoBarras, abc,
    erros,
  }
  // Só guarda cargas completas: um erro passageiro não pode ficar 10 min no cache.
  if (erros.length === 0) gravarCache(chave, bundle)
  return bundle
}

// -----------------------------------------------------------
// Resumo da página inicial (/dashboard) — mês atual, tudo numa chamada.
// É chamado direto pelo Server Component da home.
// -----------------------------------------------------------
export type ResumoContratos = {
  mes: DateRange                              // 1º dia do mês → hoje (Brasília)
  kpis: DashboardKpis | null
  receitaBL: ReceitaBrutaLiquida | null
  receitaProj: ReceitaProjecao | null
  meta: MetaAnual | null
  evolucao: EvolucaoMensalRow[]               // últimos 12 meses
  topClientes: TopClienteRow[]                // top 10 do mês
  topBarras: BarraRankingRow[]                // top 5 do mês (vs mês anterior)
  produtos: ProdutoRow[]                      // mês atual
  plataformas: LotesPorPlataformaRow[] | null // null = RPC indisponível (supabase-s12 não aplicado)
  corretoras: ResumoCorretoraRow[] | null     // null = RPC indisponível (supabase-s13 não aplicado)
  importacoes: ImportacaoResumo[]             // últimas 5
  erros: string[]
}

export async function getResumoContratos(): Promise<ResumoContratos> {
  const supabase = await adminOnly()
  const hoje = hojeBrasil()
  const mes: DateRange = {
    inicio: `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`,
    fim: fmtDate(hoje),
  }
  const periodo: Periodo = `custom:${mes.inicio}:${mes.fim}`
  const mesAnterior = periodoAnterior(periodo) ?? mes

  const versao = await versaoDados(supabase)
  const chave = `resumo|${versao}|${mes.fim}`
  const hit = lerCache<ResumoContratos>(chave)
  if (hit) return hit

  const erros: string[] = []
  const fila = criarFila(MAX_RPC_SIMULTANEAS)
  const safe = <T>(call: () => Promise<T>, fallback: T): Promise<T> =>
    fila(call).catch((e: Error) => { erros.push(e?.message ?? 'Falha ao carregar dados'); return fallback })

  const [metas, receitaPorAss, ranking, receitaProj, kpis, evolucao, topClientes, produtos, plataformas, importacoes, corretoras] =
    await Promise.all([
      safe(() => fetchMetasAnuais(supabase, null),                              [] as MetaAnual[]),
      safe(() => fetchReceitaPorAssessor(supabase, mes, null, null, null),      [] as ReceitaPorAssessor[]),
      safe(() => fetchRankingBarras(supabase, mes, mesAnterior, null, null),    [] as BarraRankingRow[]),
      safe(() => fetchReceitaProjecao(supabase, null),                          null),
      safe(() => fetchKpis(supabase, mes, null, null, null),                    null),
      safe(() => fetchEvolucaoMensal(supabase, null, null, null),               []),
      safe(() => fetchTopClientes(supabase, mes, 10, null, null, null),         []),
      safe(() => fetchPorProduto(supabase, mes, null, null, null),              []),
      // Depende do supabase-s12: sem a RPC, vira null e a home mostra um aviso (não um erro).
      fila(() => fetchLotesPorPlataforma(supabase, mes, null, null, null)).catch(() => null),
      safe(() => fetchImportacoesRecentes(supabase, 5),                         []),
      // Depende do supabase-s13: sem a RPC, vira null e a home esconde o bloco.
      fila(() => fetchResumoCorretoras(supabase, mes, null, null)).catch(() => null),
    ])

  const resumo: ResumoContratos = {
    mes, kpis,
    receitaBL: brutaLiquidaDe(receitaPorAss),
    receitaProj,
    meta: metas.find(m => m.corretora === 'TOTAL') ?? null,
    evolucao: evolucao.slice(-12),
    topClientes,
    topBarras: [...ranking].sort((a, b) => b.lotes_operados - a.lotes_operados).slice(0, 5),
    produtos, plataformas, corretoras, importacoes, erros,
  }
  if (erros.length === 0) gravarCache(chave, resumo)
  return resumo
}
