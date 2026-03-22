import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

const FROM_EMAIL = process.env.NOTIFICACOES_FROM ?? 'notificacoes@zeve.ai'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function diasDesde(data: string | null): number {
  if (!data) return 9999
  return Math.floor((Date.now() - new Date(data).getTime()) / (1000 * 60 * 60 * 24))
}

async function jaNotificouRecentemente(
  supabase: ReturnType<typeof createAdminClient>,
  tipo: string,
  clienteId: string,
  diasJanela: number,
): Promise<boolean> {
  const desde = new Date(Date.now() - diasJanela * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('notificacoes_log')
    .select('id')
    .eq('tipo', tipo)
    .eq('cliente_id', clienteId)
    .gte('enviado_em', desde)
    .limit(1)
    .single()
  return !!data
}

async function logNotificacao(
  supabase: ReturnType<typeof createAdminClient>,
  tipo: string,
  clienteId: string,
  assessorId: string,
) {
  await supabase.from('notificacoes_log').insert({
    tipo,
    cliente_id: clienteId,
    assessor_id: assessorId,
  })
}

async function enviarEmail(para: string, assunto: string, html: string) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[notificacoes] RESEND_API_KEY não configurado — e-mail ignorado')
    return
  }
  await getResend().emails.send({ from: FROM_EMAIL, to: para, subject: assunto, html })
}

// ─── Templates ───────────────────────────────────────────────────────────────

function templateRisco(assessorNome: string, clienteNome: string, score: number): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
      <div style="background:#ef4444;padding:24px 32px;border-radius:12px 12px 0 0">
        <p style="color:#fff;font-size:12px;margin:0;letter-spacing:2px;text-transform:uppercase">ZeveAI · Alerta de Risco</p>
        <h1 style="color:#fff;font-size:22px;margin:8px 0 0">Cliente em risco de churn</h1>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:28px 32px">
        <p style="margin:0 0 16px">Olá, <strong>${assessorNome}</strong>.</p>
        <p style="margin:0 0 20px">O cliente <strong>${clienteNome}</strong> entrou na classificação <span style="color:#ef4444;font-weight:600">Risco</span> com score <strong>${score}</strong>. É necessário contato imediato.</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin-bottom:24px">
          <p style="margin:0;font-size:14px;color:#b91c1c">⚠️ Clientes em risco têm alta probabilidade de encerrar operações nos próximos 30 dias sem intervenção.</p>
        </div>
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.zeve.ai'}/clientes" style="display:inline-block;background:#1764F4;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Ver carteira de clientes →</a>
        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">Você recebe este alerta porque é o assessor responsável por este cliente no ZeveAI.</p>
      </div>
    </div>
  `
}

function templateFollowupAtrasado(assessorNome: string, followups: { clienteNome: string; diasAtraso: number; observacao: string | null }[]): string {
  const lista = followups
    .map(f => `<li style="margin-bottom:8px"><strong>${f.clienteNome}</strong> — ${f.diasAtraso} dia${f.diasAtraso > 1 ? 's' : ''} em atraso${f.observacao ? ` · <em>${f.observacao}</em>` : ''}</li>`)
    .join('')
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
      <div style="background:#f59e0b;padding:24px 32px;border-radius:12px 12px 0 0">
        <p style="color:#fff;font-size:12px;margin:0;letter-spacing:2px;text-transform:uppercase">ZeveAI · Follow-ups Atrasados</p>
        <h1 style="color:#fff;font-size:22px;margin:8px 0 0">${followups.length} follow-up${followups.length > 1 ? 's' : ''} pendente${followups.length > 1 ? 's' : ''}</h1>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:28px 32px">
        <p style="margin:0 0 16px">Olá, <strong>${assessorNome}</strong>.</p>
        <p style="margin:0 0 16px">Você tem follow-ups agendados que ainda não foram realizados:</p>
        <ul style="padding-left:20px;margin:0 0 24px;font-size:14px;line-height:1.7">${lista}</ul>
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.zeve.ai'}/clientes" style="display:inline-block;background:#1764F4;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Ver meus clientes →</a>
        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">Você recebe este alerta porque é o assessor responsável por estes clientes no ZeveAI.</p>
      </div>
    </div>
  `
}

function templateSemOperar(assessorNome: string, clientes: { nome: string; dias: number }[], janela: 30 | 60 | 90): string {
  const cor = janela === 30 ? '#f59e0b' : janela === 60 ? '#ef4444' : '#7f1d1d'
  const titulo = janela === 30 ? '⚠️ 30 dias sem operar' : janela === 60 ? '🔴 60 dias sem operar' : '🚨 90 dias sem operar — URGENTE'
  const lista = clientes
    .map(c => `<li style="margin-bottom:8px"><strong>${c.nome}</strong> — ${c.dias} dias sem operação</li>`)
    .join('')
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
      <div style="background:${cor};padding:24px 32px;border-radius:12px 12px 0 0">
        <p style="color:#fff;font-size:12px;margin:0;letter-spacing:2px;text-transform:uppercase">ZeveAI · Inatividade</p>
        <h1 style="color:#fff;font-size:22px;margin:8px 0 0">${titulo}</h1>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:28px 32px">
        <p style="margin:0 0 16px">Olá, <strong>${assessorNome}</strong>.</p>
        <p style="margin:0 0 16px">Os clientes abaixo estão há <strong>${janela} dias ou mais sem operação</strong>:</p>
        <ul style="padding-left:20px;margin:0 0 24px;font-size:14px;line-height:1.7">${lista}</ul>
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.zeve.ai'}/retencao" style="display:inline-block;background:#1764F4;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Ver painel de retenção →</a>
        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">Você recebe este alerta porque é o assessor responsável por estes clientes no ZeveAI.</p>
      </div>
    </div>
  `
}

// ─── Engine principal ─────────────────────────────────────────────────────────

export async function rodarEngineNotificacoes(): Promise<{
  enviados: number
  erros: number
  detalhes: string[]
}> {
  const supabase = createAdminClient()
  let enviados = 0
  let erros = 0
  const detalhes: string[] = []

  // Buscar todos os clientes ativos com assessor e última operação
  const [
    { data: clientes },
    { data: todosScores },
    { data: followupsPendentes },
    { data: todosContratos },
    { data: assessores },
  ] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, nome, assessor_id')
      .eq('status', 'ativo'),
    supabase
      .from('cliente_scores')
      .select('cliente_id, score_total, classificacao, created_at')
      .order('created_at', { ascending: false })
      .range(0, 99999),
    supabase
      .from('cliente_followups')
      .select('id, cliente_id, agendado_para, observacao, cliente:clientes(nome, assessor_id)')
      .eq('status', 'pendente')
      .lt('agendado_para', new Date().toISOString()),
    supabase
      .from('contratos')
      .select('cliente_id, data')
      .order('data', { ascending: false })
      .range(0, 99999),
    supabase
      .from('profiles')
      .select('id, nome, email')
      .in('role', ['admin', 'vendedor'])
      .eq('ativo', true),
  ])

  if (!clientes?.length || !assessores?.length) return { enviados, erros, detalhes }

  // Mapas auxiliares
  const assessorMap = new Map(assessores.map(a => [a.id, a]))

  // Última operação por cliente
  const ultimaOpMap = new Map<string, string>()
  for (const c of todosContratos ?? []) {
    if (!c.cliente_id || !c.data) continue
    if (!ultimaOpMap.has(c.cliente_id)) ultimaOpMap.set(c.cliente_id, c.data)
  }

  // Score mais recente por cliente
  const scoreMap = new Map<string, { score_total: number; classificacao: string }>()
  for (const s of todosScores ?? []) {
    if (!scoreMap.has(s.cliente_id)) scoreMap.set(s.cliente_id, s)
  }

  // ── GATILHO 1: Score em risco ─────────────────────────────────────────────
  // Agrupa por assessor para mandar um e-mail só com todos os clientes em risco
  const riscosPorAssessor = new Map<string, { clienteId: string; clienteNome: string; score: number }[]>()

  for (const cliente of clientes) {
    const score = scoreMap.get(cliente.id)
    if (!score || score.classificacao !== 'risco') continue
    if (!cliente.assessor_id) continue

    const jaNotificou = await jaNotificouRecentemente(supabase, 'risco', cliente.id, 7)
    if (jaNotificou) continue

    if (!riscosPorAssessor.has(cliente.assessor_id)) riscosPorAssessor.set(cliente.assessor_id, [])
    riscosPorAssessor.get(cliente.assessor_id)!.push({
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      score: score.score_total,
    })
  }

  for (const [assessorId, clsRisco] of riscosPorAssessor) {
    const assessor = assessorMap.get(assessorId)
    if (!assessor?.email) continue

    // Envia um e-mail por cliente em risco (mais impactante que lista)
    for (const cl of clsRisco) {
      try {
        await enviarEmail(
          assessor.email,
          `⚠️ Cliente em risco: ${cl.clienteNome} (score ${cl.score})`,
          templateRisco(assessor.nome, cl.clienteNome, cl.score),
        )
        await logNotificacao(supabase, 'risco', cl.clienteId, assessorId)
        enviados++
        detalhes.push(`risco: ${cl.clienteNome} → ${assessor.email}`)
      } catch (e) {
        erros++
        detalhes.push(`ERRO risco ${cl.clienteNome}: ${e}`)
      }
    }
  }

  // ── GATILHO 2: Follow-up atrasado ─────────────────────────────────────────
  const followupsPorAssessor = new Map<string, { clienteNome: string; diasAtraso: number; observacao: string | null; clienteId: string }[]>()

  for (const f of followupsPendentes ?? []) {
    const clienteData = f.cliente as { nome: string; assessor_id: string | null } | null
    if (!clienteData?.assessor_id) continue

    const diasAtraso = diasDesde(f.agendado_para)
    const jaNotificou = await jaNotificouRecentemente(supabase, 'followup_atrasado', f.cliente_id, 1)
    if (jaNotificou) continue

    const aid = clienteData.assessor_id
    if (!followupsPorAssessor.has(aid)) followupsPorAssessor.set(aid, [])
    followupsPorAssessor.get(aid)!.push({
      clienteNome: clienteData.nome,
      diasAtraso,
      observacao: f.observacao,
      clienteId: f.cliente_id,
    })
  }

  for (const [assessorId, fups] of followupsPorAssessor) {
    const assessor = assessorMap.get(assessorId)
    if (!assessor?.email) continue
    try {
      await enviarEmail(
        assessor.email,
        `📅 ${fups.length} follow-up${fups.length > 1 ? 's' : ''} atrasado${fups.length > 1 ? 's' : ''}`,
        templateFollowupAtrasado(assessor.nome, fups),
      )
      for (const f of fups) {
        await logNotificacao(supabase, 'followup_atrasado', f.clienteId, assessorId)
      }
      enviados++
      detalhes.push(`followup: ${fups.length} clientes → ${assessor.email}`)
    } catch (e) {
      erros++
      detalhes.push(`ERRO followup ${assessor.email}: ${e}`)
    }
  }

  // ── GATILHO 3: Dias sem operar (30 / 60 / 90) ────────────────────────────
  const janelasSemOperar: { dias: 30 | 60 | 90; tipo: string }[] = [
    { dias: 30, tipo: 'sem_operar_30' },
    { dias: 60, tipo: 'sem_operar_60' },
    { dias: 90, tipo: 'sem_operar_90' },
  ]

  for (const { dias, tipo } of janelasSemOperar) {
    const clientesPorAssessor = new Map<string, { nome: string; diasSemOperar: number; clienteId: string }[]>()

    for (const cliente of clientes) {
      if (!cliente.assessor_id) continue
      const ultimaOp = ultimaOpMap.get(cliente.id) ?? null
      const diasSemOperar = diasDesde(ultimaOp)

      // Janela: exatamente nessa faixa (ex: 30-59 dias para o gatilho de 30d)
      const limiteInferior = dias
      const limiteSuperior = dias === 30 ? 59 : dias === 60 ? 89 : 9999
      if (diasSemOperar < limiteInferior || diasSemOperar > limiteSuperior) continue

      const jaNotificou = await jaNotificouRecentemente(supabase, tipo, cliente.id, 25)
      if (jaNotificou) continue

      if (!clientesPorAssessor.has(cliente.assessor_id)) clientesPorAssessor.set(cliente.assessor_id, [])
      clientesPorAssessor.get(cliente.assessor_id)!.push({ nome: cliente.nome, diasSemOperar, clienteId: cliente.id })
    }

    for (const [assessorId, cls] of clientesPorAssessor) {
      const assessor = assessorMap.get(assessorId)
      if (!assessor?.email) continue
      try {
        await enviarEmail(
          assessor.email,
          `${dias === 90 ? '🚨' : '⏰'} ${cls.length} cliente${cls.length > 1 ? 's' : ''} sem operar há ${dias}+ dias`,
          templateSemOperar(assessor.nome, cls.map(c => ({ nome: c.nome, dias: c.diasSemOperar })), dias),
        )
        for (const c of cls) {
          await logNotificacao(supabase, tipo, c.clienteId, assessorId)
        }
        enviados++
        detalhes.push(`${tipo}: ${cls.length} clientes → ${assessor.email}`)
      } catch (e) {
        erros++
        detalhes.push(`ERRO ${tipo} ${assessor.email}: ${e}`)
      }
    }
  }

  return { enviados, erros, detalhes }
}
