'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { calcularCHS } from '@/lib/chs/calculator'
import { CHSInput } from '@/types/cliente'
import { revalidatePath } from 'next/cache'

// Retorna a chave YYYY-MM para N meses atrás
function mesKey(hoje: Date, mesesAtras: number): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - mesesAtras, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Média dos valores de 3 meses consecutivos a partir de offsetInicio
function media3Meses(porMes: Record<string, number>, hoje: Date, offsetInicio: number): number {
  let soma = 0
  for (let i = offsetInicio; i < offsetInicio + 3; i++) {
    soma += porMes[mesKey(hoje, i)] ?? 0
  }
  return soma / 3
}

export async function recalcularScore(clienteId: string) {
  const supabase = createAdminClient()

  const [
    { data: cliente },
    { data: dados },
    { data: contas },
    { data: scoreAnterior },
    { data: contratos },
    { data: receitas },
  ] = await Promise.all([
    supabase.from('clientes').select('created_at').eq('id', clienteId).single(),
    supabase.from('cliente_dados_chs').select('*').eq('cliente_id', clienteId).single(),
    supabase.from('cliente_contas').select('capital_alocado').eq('cliente_id', clienteId),
    supabase.from('cliente_scores').select('score_total').eq('cliente_id', clienteId).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('contratos').select('data, lotes_operados, lotes_zerados').eq('cliente_id', clienteId),
    supabase.from('receitas').select('data_receita, receita_genial').eq('cliente_id', clienteId),
  ])

  const capitalTotal = (contas ?? []).reduce((acc, c) => acc + (c.capital_alocado ?? 0), 0)
  const hoje = new Date()
  const mesAtualKey = mesKey(hoje, 0)

  // Última operação = data mais recente em contratos
  const datasContratos = (contratos ?? []).map((c) => c.data).filter(Boolean).sort() as string[]
  const ultimaOperacao = datasContratos.at(-1) ?? dados?.ultima_operacao ?? null

  // Volume (lotes operados) por mês
  const lotesPorMes: Record<string, number> = {}
  const zeradosPorMes: Record<string, number> = {}
  for (const c of contratos ?? []) {
    if (!c.data) continue
    const mes = String(c.data).slice(0, 7)
    lotesPorMes[mes] = (lotesPorMes[mes] ?? 0) + (c.lotes_operados ?? 0)
    zeradosPorMes[mes] = (zeradosPorMes[mes] ?? 0) + (c.lotes_zerados ?? 0)
  }

  // Receita por mês
  const receitaPorMes: Record<string, number> = {}
  for (const r of receitas ?? []) {
    if (!r.data_receita) continue
    const mes = String(r.data_receita).slice(0, 7)
    receitaPorMes[mes] = (receitaPorMes[mes] ?? 0) + (r.receita_genial ?? 0)
  }

  // Médias dos últimos 3 meses vs 3 meses anteriores
  const volumeAtual   = media3Meses(lotesPorMes,   hoje, 0)
  const volumeAnterior = media3Meses(lotesPorMes,  hoje, 3)
  const receitaAtual   = media3Meses(receitaPorMes, hoje, 0)
  const receitaAnterior = media3Meses(receitaPorMes, hoje, 3)

  // Dias operados no mês atual (para snapshot)
  const diasOperadosMes = new Set(
    (contratos ?? []).filter((c) => String(c.data ?? '').startsWith(mesAtualKey)).map((c) => c.data)
  ).size

  const input: CHSInput = {
    ultima_operacao: ultimaOperacao,
    receita_periodo_atual:   receitaAtual  || dados?.receita_periodo_atual  || 0,
    receita_periodo_anterior: receitaAnterior || dados?.receita_periodo_anterior || 0,
    volume_periodo_atual:   volumeAtual   || dados?.volume_periodo_atual   || 0,
    volume_periodo_anterior: volumeAnterior || dados?.volume_periodo_anterior  || 0,
    score_engajamento:       dados?.score_engajamento ?? 50,
    comportamento_risco:     dados?.comportamento_risco ?? 'segue_regras',
    data_primeiro_relacionamento: cliente?.created_at ?? new Date().toISOString(),
    score_anterior: scoreAnterior?.score_total ?? null,
  }

  const resultado = calcularCHS(input, capitalTotal)
  const { acoes, ...scoreData } = resultado

  const { error: scoreError } = await supabase.from('cliente_scores').insert({
    cliente_id: clienteId,
    ...scoreData,
  })
  if (scoreError) throw new Error(`Erro ao salvar score: ${scoreError.message}`)

  // Snapshot mensal usa o valor real do mês atual (não média)
  await supabase.from('cliente_historico_mensal').upsert({
    cliente_id: clienteId,
    mes: mesAtualKey,
    receita:      receitaPorMes[mesAtualKey] ?? 0,
    lotes_girados: lotesPorMes[mesAtualKey]  ?? 0,
    lotes_zerados: zeradosPorMes[mesAtualKey] ?? 0,
    dias_operados: diasOperadosMes,
    score: resultado.score_total,
  }, { onConflict: 'cliente_id,mes' })

  // Criar ações automáticas (apenas novas)
  for (const acao of acoes) {
    const { data: existente } = await supabase
      .from('cliente_acoes')
      .select('id')
      .eq('cliente_id', clienteId)
      .eq('titulo', acao.titulo)
      .eq('status', 'pendente')
      .single()

    if (!existente) {
      await supabase.from('cliente_acoes').insert({ cliente_id: clienteId, ...acao })
    }
  }

  revalidatePath(`/clientes/${clienteId}`)
  revalidatePath('/clientes')

  return resultado
}

// Busca todas as linhas de uma tabela paginando em blocos de 1000
async function fetchAllRows<T>(
  fetcher: (from: number, to: number) => Promise<{ data: T[] | null }>
): Promise<T[]> {
  const PAGE = 1000
  let all: T[] = []
  let page = 0
  while (true) {
    const { data } = await fetcher(page * PAGE, (page + 1) * PAGE - 1)
    if (!data?.length) break
    all = all.concat(data)
    if (data.length < PAGE) break
    page++
  }
  return all
}

export async function recalcularScoreTodos(): Promise<{ ok: number; erros: number }> {
  const supabase = createAdminClient()
  const hoje = new Date()
  const mesAtualKey = mesKey(hoje, 0)

  // Tabelas pequenas: busca simples
  const [
    { data: clientes },
    { data: dadosCHS },
    { data: todasContas },
    { data: scoresAnteriores },
  ] = await Promise.all([
    supabase.from('clientes').select('id, created_at').range(0, 9999),
    supabase.from('cliente_dados_chs').select('*').range(0, 9999),
    supabase.from('cliente_contas').select('cliente_id, capital_alocado').range(0, 9999),
    supabase.from('cliente_scores').select('cliente_id, score_total, created_at').order('created_at', { ascending: false }).range(0, 99999),
  ])

  // Contratos e receitas podem ter muitas linhas — paginar
  const [todosContratos, todasReceitas] = await Promise.all([
    fetchAllRows<{ cliente_id: string; data: string; lotes_operados: number; lotes_zerados: number }>(
      (from, to) => supabase.from('contratos').select('cliente_id, data, lotes_operados, lotes_zerados').range(from, to) as any
    ),
    fetchAllRows<{ cliente_id: string; data_receita: string; receita_genial: number }>(
      (from, to) => supabase.from('receitas').select('cliente_id, data_receita, receita_genial').range(from, to) as any
    ),
  ])

  if (!clientes?.length) return { ok: 0, erros: 0 }

  const dadosMap = new Map((dadosCHS ?? []).map((d) => [d.cliente_id, d]))

  const contasMap = new Map<string, number>()
  for (const c of todasContas ?? []) {
    contasMap.set(c.cliente_id, (contasMap.get(c.cliente_id) ?? 0) + (c.capital_alocado ?? 0))
  }

  const scoreAnteriorMap = new Map<string, number>()
  for (const s of scoresAnteriores ?? []) {
    if (!scoreAnteriorMap.has(s.cliente_id)) scoreAnteriorMap.set(s.cliente_id, s.score_total)
  }

  // Agrupar contratos por cliente → por mês
  const contratosMap = new Map<string, Record<string, number>>()
  const zeradosMap   = new Map<string, Record<string, number>>()
  const ultimaOpMap  = new Map<string, string>()
  for (const c of todosContratos ?? []) {
    if (!c.cliente_id || !c.data) continue
    const mes = String(c.data).slice(0, 7)
    if (!contratosMap.has(c.cliente_id)) contratosMap.set(c.cliente_id, {})
    if (!zeradosMap.has(c.cliente_id))   zeradosMap.set(c.cliente_id, {})
    const lotes  = contratosMap.get(c.cliente_id)!
    const zerados = zeradosMap.get(c.cliente_id)!
    lotes[mes]  = (lotes[mes]  ?? 0) + (c.lotes_operados ?? 0)
    zerados[mes] = (zerados[mes] ?? 0) + (c.lotes_zerados ?? 0)
    const atual = ultimaOpMap.get(c.cliente_id)
    if (!atual || String(c.data) > atual) ultimaOpMap.set(c.cliente_id, String(c.data))
  }

  // Agrupar receitas por cliente → por mês
  const receitasMap = new Map<string, Record<string, number>>()
  for (const r of todasReceitas ?? []) {
    if (!r.cliente_id || !r.data_receita) continue
    const mes = String(r.data_receita).slice(0, 7)
    if (!receitasMap.has(r.cliente_id)) receitasMap.set(r.cliente_id, {})
    const rec = receitasMap.get(r.cliente_id)!
    rec[mes] = (rec[mes] ?? 0) + (r.receita_genial ?? 0)
  }

  let ok = 0, erros = 0
  const scoresToInsert:   Record<string, unknown>[] = []
  const historicoToUpsert: Record<string, unknown>[] = []

  for (const cliente of clientes) {
    try {
      const dados       = dadosMap.get(cliente.id)
      const capitalTotal = contasMap.get(cliente.id) ?? 0
      const lotesMes    = contratosMap.get(cliente.id) ?? {}
      const zeradosMes  = zeradosMap.get(cliente.id)   ?? {}
      const receitaMes  = receitasMap.get(cliente.id)  ?? {}

      const ultimaOperacao = ultimaOpMap.get(cliente.id) ?? dados?.ultima_operacao ?? null

      // Médias 3 meses vs 3 meses anteriores
      const volumeAtual    = media3Meses(lotesMes,   hoje, 0)
      const volumeAnterior  = media3Meses(lotesMes,   hoje, 3)
      const receitaAtual   = media3Meses(receitaMes,  hoje, 0)
      const receitaAnterior = media3Meses(receitaMes,  hoje, 3)

      const diasOperadosMes = new Set(
        (todosContratos ?? [])
          .filter((c) => c.cliente_id === cliente.id && String(c.data ?? '').startsWith(mesAtualKey))
          .map((c) => c.data)
      ).size

      const input: CHSInput = {
        ultima_operacao: ultimaOperacao,
        receita_periodo_atual:    receitaAtual   || dados?.receita_periodo_atual   || 0,
        receita_periodo_anterior: receitaAnterior || dados?.receita_periodo_anterior || 0,
        volume_periodo_atual:     volumeAtual    || dados?.volume_periodo_atual    || 0,
        volume_periodo_anterior:  volumeAnterior  || dados?.volume_periodo_anterior  || 0,
        score_engajamento:        dados?.score_engajamento ?? 50,
        comportamento_risco:      dados?.comportamento_risco ?? 'segue_regras',
        data_primeiro_relacionamento: cliente.created_at ?? new Date().toISOString(),
        score_anterior: scoreAnteriorMap.get(cliente.id) ?? null,
      }

      const resultado = calcularCHS(input, capitalTotal)
      const { acoes: _acoes, ...scoreData } = resultado

      scoresToInsert.push({ cliente_id: cliente.id, ...scoreData })
      historicoToUpsert.push({
        cliente_id:    cliente.id,
        mes:           mesAtualKey,
        receita:       receitaMes[mesAtualKey]  ?? 0,
        lotes_girados: lotesMes[mesAtualKey]    ?? 0,
        lotes_zerados: zeradosMes[mesAtualKey]  ?? 0,
        dias_operados: diasOperadosMes,
        score:         resultado.score_total,
      })
      ok++
    } catch {
      erros++
    }
  }

  // Clientes sem operação nos últimos 90 dias → inativo
  const idsParaInativar: string[] = []
  for (const cliente of clientes) {
    const ultimaOp = ultimaOpMap.get(cliente.id) ?? null
    const dias = ultimaOp
      ? Math.floor((hoje.getTime() - new Date(ultimaOp).getTime()) / (1000 * 60 * 60 * 24))
      : 999
    if (dias > 90) idsParaInativar.push(cliente.id)
  }

  const BATCH = 100
  for (let i = 0; i < scoresToInsert.length; i += BATCH) {
    const { error } = await supabase.from('cliente_scores').insert(scoresToInsert.slice(i, i + BATCH))
    if (error) throw new Error(`Erro ao inserir scores: ${error.message}`)
  }
  for (let i = 0; i < historicoToUpsert.length; i += BATCH) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from('cliente_historico_mensal').upsert(historicoToUpsert.slice(i, i + BATCH) as any, { onConflict: 'cliente_id,mes' })
  }
  for (let i = 0; i < idsParaInativar.length; i += BATCH) {
    await supabase.from('clientes').update({ status: 'inativo' }).in('id', idsParaInativar.slice(i, i + BATCH))
  }

  revalidatePath('/clientes')
  return { ok, erros, inativos: idsParaInativar.length }
}

export async function deletarClientes(ids: string[]) {
  if (!ids.length) return { error: 'Nenhum ID fornecido' }
  const supabase = createAdminClient()
  const BATCH = 100
  for (let i = 0; i < ids.length; i += BATCH) {
    const { error } = await supabase.from('clientes').delete().in('id', ids.slice(i, i + BATCH))
    if (error) return { error: error.message }
  }
  revalidatePath('/clientes')
  return { ok: true }
}

export async function atualizarStatusClientes(ids: string[], status: string) {
  const supabase = createAdminClient()
  await supabase.from('clientes').update({ status }).in('id', ids)
  revalidatePath('/clientes')
}
