import { CHSInput, CHSResult, Classificacao, SegmentoCliente, Tendencia } from '@/types/cliente'
import { differenceInDays } from '@/lib/utils'

// ─── Componentes do Score ───────────────────────────────────────────────────

function calcAtividade(ultimaOperacao: string | null): number {
  if (!ultimaOperacao) return 0
  const dias = differenceInDays(new Date(), new Date(ultimaOperacao))
  if (dias <= 30) return 100
  if (dias <= 60) return 70
  if (dias <= 90) return 40
  return 0
}

function calcReceita(atual: number, anterior: number): number {
  if (atual === 0 && anterior === 0) return 0
  if (anterior === 0) return 100
  const variacao = ((atual - anterior) / anterior) * 100
  if (variacao > 5) return 100
  if (variacao >= -5) return 70
  if (variacao >= -20) return 40
  return 0
}

function calcVolume(atual: number, anterior: number): number {
  if (atual === 0 && anterior === 0) return 0
  if (anterior === 0) return 100
  const variacao = ((atual - anterior) / anterior) * 100
  if (variacao > 5) return 100
  if (variacao >= -5) return 70
  if (variacao >= -20) return 40
  return 0
}

function calcTempo(dataPrimeiroRelacionamento: string): number {
  const dias = differenceInDays(new Date(), new Date(dataPrimeiroRelacionamento))
  if (dias < 30) return 40
  if (dias <= 90) return 70
  return 100
}

function calcRisco(comportamento: string): number {
  if (comportamento === 'segue_regras') return 100
  if (comportamento === 'oscila') return 60
  return 20
}

// ─── Tendência ───────────────────────────────────────────────────────────────

function calcTendencia(scoreAtual: number, scoreAnterior: number | null | undefined): Tendencia {
  if (scoreAnterior == null) return 'estavel'
  const diff = scoreAtual - scoreAnterior
  if (diff > 5) return 'subindo'
  if (diff < -5) return 'caindo'
  return 'estavel'
}

// ─── Penalidade/Bônus de tendência ──────────────────────────────────────────

function aplicarTendencia(score: number, tendencia: Tendencia): number {
  if (tendencia === 'caindo') return Math.max(0, score - 5)
  if (tendencia === 'subindo') return Math.min(100, score + 3)
  return score
}

// ─── Ações automáticas ───────────────────────────────────────────────────────

function gerarAcoes(
  classificacao: Classificacao,
  score: number,
  capitalTotal: number
): CHSResult['acoes'] {
  const acoes: CHSResult['acoes'] = []

  if (classificacao === 'risco') {
    acoes.push({
      tipo: 'tarefa',
      titulo: 'Contato urgente de reativação',
      descricao: `Cliente com score ${score.toFixed(0)} está em risco. Entre em contato imediatamente para entender a situação e propor reativação ou migração de produto.`,
      prioridade: 'alta',
    })
    if (capitalTotal > 50000) {
      acoes.push({
        tipo: 'tarefa',
        titulo: 'Prioridade máxima — capital alto em risco',
        descricao: `Cliente possui capital significativo (R$ ${capitalTotal.toLocaleString('pt-BR')}) e está inativo. Acionar gerência para plano de retenção.`,
        prioridade: 'alta',
      })
    }
  }

  if (classificacao === 'atencao') {
    acoes.push({
      tipo: 'nutricao',
      titulo: 'Inserir em fluxo de nutrição',
      descricao: `Cliente em atenção (score ${score.toFixed(0)}). Enviar conteúdos relevantes, convites para eventos e acompanhamento leve nas próximas semanas.`,
      prioridade: 'media',
    })
  }

  if (classificacao === 'saudavel') {
    acoes.push({
      tipo: 'upsell',
      titulo: 'Oportunidade de upsell',
      descricao: `Cliente saudável (score ${score.toFixed(0)}). Momento ideal para oferecer novos produtos, aumento de capital ou planos superiores.`,
      prioridade: 'media',
    })
  }

  return acoes
}

// ─── Calculadora principal ───────────────────────────────────────────────────

export function calcularCHS(input: CHSInput, capitalTotal = 0): CHSResult {
  const sAtividade = calcAtividade(input.ultima_operacao)
  const sReceita = calcReceita(input.receita_periodo_atual, input.receita_periodo_anterior)
  const sVolume = calcVolume(input.volume_periodo_atual, input.volume_periodo_anterior)
  const sEngajamento = input.score_engajamento
  const sTempo = calcTempo(input.data_primeiro_relacionamento)
  const sRisco = calcRisco(input.comportamento_risco)

  const scoreBruto =
    sAtividade * 0.3 +
    sReceita * 0.25 +
    sVolume * 0.15 +
    sEngajamento * 0.1 +
    sTempo * 0.1 +
    sRisco * 0.1

  const tendencia = calcTendencia(scoreBruto, input.score_anterior)
  const scoreTotal = aplicarTendencia(scoreBruto, tendencia)

  const classificacao: Classificacao =
    scoreTotal >= 80 ? 'saudavel' : scoreTotal >= 50 ? 'atencao' : 'risco'

  const acoes = gerarAcoes(classificacao, scoreTotal, capitalTotal)

  return {
    score_total: Math.round(scoreTotal * 100) / 100,
    score_atividade: sAtividade,
    score_receita: sReceita,
    score_volume: sVolume,
    score_engajamento: sEngajamento,
    score_tempo: sTempo,
    score_risco: sRisco,
    classificacao,
    tendencia,
    acoes,
  }
}

// ─── Segmento do cliente ─────────────────────────────────────────────────────

export function calcularSegmento({
  ultimaOperacao,
  receitaAtual,
  receitaAnterior,
  dataCriacao,
}: {
  ultimaOperacao: string | null
  receitaAtual: number
  receitaAnterior: number
  dataCriacao: string
}): SegmentoCliente {
  const diasRelacionamento = differenceInDays(new Date(), new Date(dataCriacao))
  if (diasRelacionamento < 90) return 'iniciante'

  const diasSemOperar = ultimaOperacao
    ? differenceInDays(new Date(), new Date(ultimaOperacao))
    : 999
  if (diasSemOperar > 60) return 'inativo'

  if (receitaAnterior > 0 && receitaAtual < receitaAnterior * 0.5) return 'perdeu_dinheiro'

  return 'ativo'
}

export function getSegmentoConfig(segmento: SegmentoCliente) {
  return {
    ativo: { label: 'Ativo', bg: 'bg-emerald-900/30', border: 'border-emerald-700/50', text: 'text-emerald-400' },
    iniciante: { label: 'Iniciante', bg: 'bg-blue-900/30', border: 'border-blue-700/50', text: 'text-blue-400' },
    inativo: { label: 'Inativo', bg: 'bg-gray-800/50', border: 'border-gray-600/50', text: 'text-gray-400' },
    perdeu_dinheiro: { label: 'Perdeu Dinheiro', bg: 'bg-red-900/30', border: 'border-red-700/50', text: 'text-red-400' },
  }[segmento]
}

// ─── Risco de Churn ──────────────────────────────────────────────────────────

export function calcularRiscoChurn(
  score: number | null,
  ultimaOperacao: string | null,
  tendencia: Tendencia | null,
): { nivel: 'alto' | 'medio' | 'baixo'; percentual: number } {
  if (score === null) return { nivel: 'alto', percentual: 85 }

  let risco = score < 50 ? 65 : score < 65 ? 40 : score < 80 ? 18 : 8

  if (ultimaOperacao) {
    const dias = differenceInDays(new Date(), new Date(ultimaOperacao))
    if (dias > 90) risco = Math.min(95, risco + 25)
    else if (dias > 60) risco = Math.min(95, risco + 15)
    else if (dias > 30) risco = Math.min(95, risco + 5)
  } else {
    risco = Math.min(95, risco + 20)
  }

  if (tendencia === 'caindo') risco = Math.min(95, risco + 10)
  else if (tendencia === 'subindo') risco = Math.max(5, risco - 10)

  const nivel = risco >= 60 ? 'alto' : risco >= 30 ? 'medio' : 'baixo'
  return { nivel, percentual: Math.round(risco) }
}

export function getClassificacaoConfig(classificacao: Classificacao) {
  return {
    saudavel: { label: 'Saudável', color: '#10b981', bg: 'bg-emerald-900/30', border: 'border-emerald-700/50', text: 'text-emerald-400' },
    atencao: { label: 'Atenção', color: '#f59e0b', bg: 'bg-amber-900/30', border: 'border-amber-700/50', text: 'text-amber-400' },
    risco: { label: 'Risco', color: '#ef4444', bg: 'bg-red-900/30', border: 'border-red-700/50', text: 'text-red-400' },
  }[classificacao]
}
