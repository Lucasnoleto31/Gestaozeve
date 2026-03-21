'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth/getProfile'
// createClient removed — all operations use admin client to bypass RLS
import { calcularCHS } from '@/lib/chs/calculator'
import { CHSInput } from '@/types/cliente'
import { revalidatePath } from 'next/cache'

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

  // ── Atividade: última operação em contratos ──────────────────────────────
  const datasContratos = (contratos ?? [])
    .map((c) => c.data)
    .filter(Boolean)
    .sort() as string[]
  const ultimaOperacao = datasContratos.at(-1) ?? dados?.ultima_operacao ?? null

  // ── Volume: lotes do mês atual vs mês anterior ────────────────────────────
  const hoje = new Date()
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const mesAnteriorDate = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const mesAnterior = `${mesAnteriorDate.getFullYear()}-${String(mesAnteriorDate.getMonth() + 1).padStart(2, '0')}`

  const lotesPorMes: Record<string, { girados: number; zerados: number }> = {}
  for (const c of contratos ?? []) {
    if (!c.data) continue
    const mes = String(c.data).slice(0, 7)
    if (!lotesPorMes[mes]) lotesPorMes[mes] = { girados: 0, zerados: 0 }
    lotesPorMes[mes].girados += c.lotes_operados ?? 0
    lotesPorMes[mes].zerados += c.lotes_zerados ?? 0
  }

  const volumeAtual = lotesPorMes[mesAtual]?.girados ?? 0
  const volumeAnterior = lotesPorMes[mesAnterior]?.girados ?? 0
  const lotesGiradosMes = volumeAtual
  const lotesZeradosMes = lotesPorMes[mesAtual]?.zerados ?? 0

  // ── Receita: mês atual vs mês anterior ───────────────────────────────────
  const receitaPorMes: Record<string, number> = {}
  for (const r of receitas ?? []) {
    if (!r.data_receita) continue
    const mes = String(r.data_receita).slice(0, 7)
    receitaPorMes[mes] = (receitaPorMes[mes] ?? 0) + (r.receita_genial ?? 0)
  }

  const receitaAtual = receitaPorMes[mesAtual] ?? 0
  const receitaAnterior = receitaPorMes[mesAnterior] ?? 0

  // Dias operados no mês atual (dias distintos com contratos)
  const diasOperadosMes = new Set(
    (contratos ?? [])
      .filter((c) => String(c.data ?? '').startsWith(mesAtual))
      .map((c) => c.data)
  ).size

  const input: CHSInput = {
    ultima_operacao: ultimaOperacao,
    receita_periodo_atual: receitaAtual || dados?.receita_periodo_atual || 0,
    receita_periodo_anterior: receitaAnterior || dados?.receita_periodo_anterior || 0,
    volume_periodo_atual: volumeAtual || dados?.volume_periodo_atual || 0,
    volume_periodo_anterior: volumeAnterior || dados?.volume_periodo_anterior || 0,
    score_engajamento: dados?.score_engajamento ?? 50,
    comportamento_risco: dados?.comportamento_risco ?? 'segue_regras',
    data_primeiro_relacionamento: cliente?.created_at ?? new Date().toISOString(),
    score_anterior: scoreAnterior?.score_total ?? null,
  }

  const resultado = calcularCHS(input, capitalTotal)

  await supabase.from('cliente_scores').insert({
    cliente_id: clienteId,
    ...resultado,
    acoes: undefined,
  })

  // Snapshot mensal
  await supabase.from('cliente_historico_mensal').upsert({
    cliente_id: clienteId,
    mes: mesAtual,
    receita: receitaAtual,
    lotes_girados: lotesGiradosMes,
    lotes_zerados: lotesZeradosMes,
    dias_operados: diasOperadosMes,
    score: resultado.score_total,
  }, { onConflict: 'cliente_id,mes' })

  // Criar ações automáticas (apenas novas)
  for (const acao of resultado.acoes) {
    const { data: existente } = await supabase
      .from('cliente_acoes')
      .select('id')
      .eq('cliente_id', clienteId)
      .eq('titulo', acao.titulo)
      .eq('status', 'pendente')
      .single()

    if (!existente) {
      await supabase.from('cliente_acoes').insert({
        cliente_id: clienteId,
        ...acao,
      })
    }
  }

  revalidatePath(`/clientes/${clienteId}`)
  revalidatePath('/clientes')

  return resultado
}

export async function deletarClientes(ids: string[]) {
  const supabase = createAdminClient()
  await supabase.from('clientes').delete().in('id', ids)
  revalidatePath('/clientes')
}

export async function atualizarStatusClientes(ids: string[], status: string) {
  const supabase = createAdminClient()
  await supabase.from('clientes').update({ status }).in('id', ids)
  revalidatePath('/clientes')
}

export async function agendarFollowup(
  clienteId: string,
  agendadoPara: string,
  observacao: string | null,
) {
  const supabase = createAdminClient()
  const profile = await getProfile()

  await supabase.from('cliente_followups').insert({
    cliente_id: clienteId,
    agendado_para: agendadoPara,
    observacao: observacao || null,
    criado_por: profile?.id ?? null,
  })

  revalidatePath(`/clientes/${clienteId}`)
}

export async function atualizarFollowup(
  followupId: string,
  clienteId: string,
  status: 'realizado' | 'cancelado',
) {
  const supabase = createAdminClient()
  await supabase.from('cliente_followups').update({ status }).eq('id', followupId)
  revalidatePath(`/clientes/${clienteId}`)
}

export async function concluirAcao(acaoId: string, clienteId: string) {
  const supabase = createAdminClient()
  await supabase.from('cliente_acoes').update({ status: 'concluida' }).eq('id', acaoId)
  revalidatePath(`/clientes/${clienteId}`)
}

export async function adicionarNota(clienteId: string, conteudo: string) {
  const supabase = createAdminClient()
  const profile = await getProfile()

  await supabase.from('cliente_notas').insert({
    cliente_id: clienteId,
    autor_id: profile?.id ?? null,
    conteudo,
  })

  revalidatePath(`/clientes/${clienteId}`)
}
