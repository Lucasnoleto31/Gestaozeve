import { describe, expect, it } from 'vitest'
import { valorDoCliente, valorPorGrupo, valorPorSafra } from './derivados'
import type { ClienteRow } from './tipos'

const base: ClienteRow = {
  cliente_id: '', nome: '', documento: null, telefone: null, email: null, uf: null, perfil: null, tipo_pessoa: null,
  n_contas: 1, conta_principal: null, status: 'Migrado', situacao_conta: null, assessor_nome: null, responsavel: null, tarifa: 1,
  data_migracao: null, data_entrada: null, dias_ate_migrar: null, lotes_total: 0, lotes_mes: 0, zerados_mes: 0, receita_mes: 0,
  receita_corretagem_mes: 0, receita_zeragem_mes: 0, lotes_12m: 0, receita_12m: 0, ultimo_giro: null, ultimo_mes_giro: null, meses_sem_giro: null,
  situacao: 'Nunca girou', alertas: [], parceiro: null, observacoes: null, motivo_recusa: null, grupo_corretagem: null,
  receita_total: 0, primeiro_mes_giro: null, meses_ativos: 0, lotes_mes_anterior: 0, lotes_media_3m: 0, dias_sem_giro: null, risco: null, nivel: null, ativador: null,
}
const c = (p: Partial<ClienteRow>): ClienteRow => ({ ...base, ...p })

describe('valor do cliente', () => {
  const rows = [
    c({ nome: 'A', responsavel: 'Lucas', data_migracao: '2026-08-10', receita_total: 1000, lotes_total: 500, meses_ativos: 4 }),
    c({ nome: 'B', responsavel: 'Lucas', data_migracao: '2026-08-20', receita_total: 300, lotes_total: 100, meses_ativos: 2 }),
    c({ nome: 'C', responsavel: 'Artur', data_migracao: '2026-09-01', receita_total: 0, lotes_total: 0, meses_ativos: 0 }),
    c({ nome: 'D', responsavel: 'Artur', status: 'Em processamento', receita_total: 0 }),
    c({ nome: 'E', responsavel: 'Artur', status: 'Recusou', receita_total: 0 }),
  ]
  it('soma só os migrados e separa quem girou', () => {
    const v = valorDoCliente(rows)
    expect(v).toMatchObject({ migrados: 3, comGiro: 2, receitaTotal: 1300 })
    expect(v.ltvPorMigracao).toBeCloseTo(1300 / 3, 6)
    expect(v.receitaPorClienteComGiro).toBe(650)
    expect(v.medianaComGiro).toBe(650)
    expect(v.mesesAtivosMedio).toBe(3)
    expect(v.receitaPorMesAtivo).toBeCloseTo(1300 / 6, 6)
  })
  it('quem só rendeu zeragem ou avulsa conta como "com giro", mas não entra nos meses com lote', () => {
    const v = valorDoCliente([...rows, c({ nome: 'F', receita_total: 100, lotes_total: 0, meses_ativos: 0 })])
    expect(v).toMatchObject({ migrados: 4, comGiro: 3, receitaTotal: 1400 })
    expect(v.receitaPorClienteComGiro).toBeCloseTo(1400 / 3, 6)
    expect(v.receitaPorMesAtivo).toBeCloseTo(1300 / 6, 6)
    expect(v.mesesAtivosMedio).toBe(3)
  })
  it('lista vazia não divide por zero', () => {
    expect(valorDoCliente([])).toMatchObject({ migrados: 0, comGiro: 0, receitaTotal: 0, ltvPorMigracao: 0, receitaPorMesAtivo: 0, medianaComGiro: 0 })
  })
  it('agrupa por responsável e por safra', () => {
    const g = valorPorGrupo(rows, r => r.responsavel ?? 'Sem responsável')
    expect(g.map(x => x.grupo)).toEqual(['Lucas', 'Artur'])
    expect(g[0]).toMatchObject({ migrados: 2, comGiro: 2, receitaTotal: 1300 })
    expect(g[1]).toMatchObject({ migrados: 1, comGiro: 0, receitaTotal: 0, ltvPorMigracao: 0 })
    const s = valorPorSafra(rows)
    expect(s.map(x => x.safra)).toEqual(['2026-09-01', '2026-08-01'])
    expect(s[1]).toMatchObject({ migrados: 2, receitaTotal: 1300 })
    expect(valorPorSafra(rows, 1)).toHaveLength(1)
  })
})

describe('nível do cliente pela média de lotes dos 3 meses', async () => {
  const { nivelPelaMedia } = await import('./tipos')
  it('limites padrão: 1.000 alto, 100 médio, sem giro sem nível', () => {
    expect(nivelPelaMedia(0)).toBeNull()
    expect(nivelPelaMedia(0.4)).toBe('Baixo')
    expect(nivelPelaMedia(99.9)).toBe('Baixo')
    expect(nivelPelaMedia(100)).toBe('Médio')
    expect(nivelPelaMedia(999)).toBe('Médio')
    expect(nivelPelaMedia(1000)).toBe('Alto')
  })
})
