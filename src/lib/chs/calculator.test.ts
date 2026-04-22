import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { CHSInput } from '@/types/cliente'
import {
  calcularCHS,
  calcularSegmento,
  calcularRiscoChurn,
} from './calculator'

// ── Helpers ──────────────────────────────────────────────────────────────────

const HOJE = new Date('2026-04-22T12:00:00Z')
function diasAtras(n: number): string {
  const d = new Date(HOJE)
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function baseInput(overrides: Partial<CHSInput> = {}): CHSInput {
  return {
    ultima_operacao: diasAtras(5),
    receita_periodo_atual: 10_000,
    receita_periodo_anterior: 10_000,
    volume_periodo_atual: 500,
    volume_periodo_anterior: 500,
    score_engajamento: 80,
    comportamento_risco: 'segue_regras',
    data_primeiro_relacionamento: diasAtras(365),
    score_anterior: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(HOJE)
})

afterEach(() => {
  vi.useRealTimers()
})

// ── calcularCHS: classificação ───────────────────────────────────────────────

describe('calcularCHS — classificação', () => {
  it('cliente ativo, estável e antigo é saudável', () => {
    const r = calcularCHS(baseInput())
    expect(r.classificacao).toBe('saudavel')
    expect(r.score_total).toBeGreaterThanOrEqual(80)
  })

  it('cliente sem operação há 120 dias (mas com receita e volume estáveis) cai para atenção', () => {
    const r = calcularCHS(baseInput({ ultima_operacao: diasAtras(120) }))
    expect(r.score_atividade).toBe(0)
    expect(r.classificacao).toBe('atencao')
  })

  it('cliente em colapso (sem operar + receita/volume zerados + excesso de risco) cai para risco', () => {
    const r = calcularCHS(baseInput({
      ultima_operacao: null,
      receita_periodo_atual: 0,
      receita_periodo_anterior: 10_000,
      volume_periodo_atual: 0,
      volume_periodo_anterior: 500,
      score_engajamento: 30,
      comportamento_risco: 'excesso_risco',
    }))
    expect(r.classificacao).toBe('risco')
  })

  it('cliente com queda forte de receita cai pelo menos para atenção', () => {
    const r = calcularCHS(baseInput({
      receita_periodo_atual: 1_000,
      receita_periodo_anterior: 10_000,
      volume_periodo_atual: 50,
      volume_periodo_anterior: 500,
    }))
    expect(['atencao', 'risco']).toContain(r.classificacao)
  })

  it('comportamento excesso_risco derruba componente de risco', () => {
    const seguro = calcularCHS(baseInput({ comportamento_risco: 'segue_regras' }))
    const arriscado = calcularCHS(baseInput({ comportamento_risco: 'excesso_risco' }))
    expect(arriscado.score_risco).toBeLessThan(seguro.score_risco)
    expect(arriscado.score_total).toBeLessThan(seguro.score_total)
  })
})

// ── calcularCHS: tendência ───────────────────────────────────────────────────

describe('calcularCHS — tendência', () => {
  it('sem score anterior, tendência é estavel', () => {
    const r = calcularCHS(baseInput({ score_anterior: null }))
    expect(r.tendencia).toBe('estavel')
  })

  it('score maior que o anterior por mais de 5 pontos é "subindo"', () => {
    const r = calcularCHS(baseInput({ score_anterior: 50 }))
    expect(r.tendencia).toBe('subindo')
  })

  it('score menor que o anterior por mais de 5 pontos é "caindo"', () => {
    const r = calcularCHS(baseInput({
      ultima_operacao: diasAtras(120),
      receita_periodo_atual: 0,
      volume_periodo_atual: 0,
      comportamento_risco: 'excesso_risco',
      score_anterior: 90,
    }))
    expect(r.tendencia).toBe('caindo')
  })

  it('"subindo" aplica bônus de +3 no score final', () => {
    const r = calcularCHS(baseInput({ score_anterior: 10 }))
    expect(r.tendencia).toBe('subindo')
    // score_total é score_bruto+3, exceto se > 100 (clamp)
    expect(r.score_total).toBeLessThanOrEqual(100)
  })

  it('"caindo" aplica penalidade de -5 no score final', () => {
    const input = baseInput({
      ultima_operacao: diasAtras(100),
      score_anterior: 90,
    })
    const r = calcularCHS(input)
    expect(r.tendencia).toBe('caindo')
    expect(r.score_total).toBeGreaterThanOrEqual(0)
  })
})

// ── calcularCHS: ações ───────────────────────────────────────────────────────

describe('calcularCHS — ações automáticas', () => {
  const entradaRisco: CHSInput = {
    ultima_operacao: null,
    receita_periodo_atual: 0,
    receita_periodo_anterior: 10_000,
    volume_periodo_atual: 0,
    volume_periodo_anterior: 500,
    score_engajamento: 30,
    comportamento_risco: 'excesso_risco',
    data_primeiro_relacionamento: diasAtras(365),
    score_anterior: null,
  }

  it('cliente em risco gera tarefa de contato urgente', () => {
    const r = calcularCHS(entradaRisco)
    expect(r.classificacao).toBe('risco')
    const titulos = r.acoes.map((a) => a.titulo)
    expect(titulos).toContain('Contato urgente de reativação')
  })

  it('cliente em risco com capital > 50k gera ação de prioridade máxima', () => {
    const r = calcularCHS(entradaRisco, 100_000)
    const titulos = r.acoes.map((a) => a.titulo)
    expect(titulos).toContain('Prioridade máxima — capital alto em risco')
  })

  it('cliente em risco com capital baixo não gera ação de capital alto', () => {
    const r = calcularCHS(entradaRisco, 10_000)
    const titulos = r.acoes.map((a) => a.titulo)
    expect(titulos).not.toContain('Prioridade máxima — capital alto em risco')
  })

  it('cliente saudável gera ação de upsell', () => {
    const r = calcularCHS(baseInput())
    expect(r.classificacao).toBe('saudavel')
    expect(r.acoes.some((a) => a.tipo === 'upsell')).toBe(true)
  })
})

// ── calcularSegmento ─────────────────────────────────────────────────────────

describe('calcularSegmento', () => {
  it('relacionamento < 90 dias → iniciante', () => {
    expect(
      calcularSegmento({
        ultimaOperacao: diasAtras(5),
        receitaAtual: 1000,
        receitaAnterior: 1000,
        dataCriacao: diasAtras(30),
      })
    ).toBe('iniciante')
  })

  it('cliente antigo sem operar há 60+ dias → inativo', () => {
    expect(
      calcularSegmento({
        ultimaOperacao: diasAtras(75),
        receitaAtual: 0,
        receitaAnterior: 1000,
        dataCriacao: diasAtras(365),
      })
    ).toBe('inativo')
  })

  it('cliente antigo sem ultimaOperacao → inativo', () => {
    expect(
      calcularSegmento({
        ultimaOperacao: null,
        receitaAtual: 0,
        receitaAnterior: 0,
        dataCriacao: diasAtras(365),
      })
    ).toBe('inativo')
  })

  it('cliente que perdeu mais da metade da receita → perdeu_dinheiro', () => {
    expect(
      calcularSegmento({
        ultimaOperacao: diasAtras(10),
        receitaAtual: 300,
        receitaAnterior: 1000,
        dataCriacao: diasAtras(365),
      })
    ).toBe('perdeu_dinheiro')
  })

  it('cliente operando e com receita estável → ativo', () => {
    expect(
      calcularSegmento({
        ultimaOperacao: diasAtras(10),
        receitaAtual: 1000,
        receitaAnterior: 1000,
        dataCriacao: diasAtras(365),
      })
    ).toBe('ativo')
  })
})

// ── calcularRiscoChurn ───────────────────────────────────────────────────────

describe('calcularRiscoChurn', () => {
  it('score null → nível alto, ~85%', () => {
    const r = calcularRiscoChurn(null, diasAtras(10), 'estavel')
    expect(r.nivel).toBe('alto')
    expect(r.percentual).toBe(85)
  })

  it('score alto + operação recente + tendência subindo → baixo', () => {
    const r = calcularRiscoChurn(90, diasAtras(5), 'subindo')
    expect(r.nivel).toBe('baixo')
  })

  it('score baixo + sem operar há 100 dias → alto', () => {
    const r = calcularRiscoChurn(40, diasAtras(100), 'caindo')
    expect(r.nivel).toBe('alto')
  })

  it('sem última operação adiciona 20 ao risco', () => {
    const comOp = calcularRiscoChurn(70, diasAtras(5), 'estavel')
    const semOp = calcularRiscoChurn(70, null, 'estavel')
    expect(semOp.percentual).toBeGreaterThan(comOp.percentual)
  })

  it('risco nunca passa de 95', () => {
    const r = calcularRiscoChurn(10, null, 'caindo')
    expect(r.percentual).toBeLessThanOrEqual(95)
  })
})
