import { describe, expect, it } from 'vitest'
import { ativacaoPorMes, concentracaoPorMes, fluxoDaCarteira, fraseDosGraficos, juntarPlataformas, nomeDaPlataforma, periodoDe, semanasDe, somarPorSemana } from './graficosTela'

describe('periodoDe', () => {
  it('3, 6 ou 12 meses; qualquer outra coisa cai no padrão (6)', () => {
    expect([periodoDe('3'), periodoDe('6'), periodoDe('12')]).toEqual([3, 6, 12])
    expect([periodoDe(undefined), periodoDe('9'), periodoDe('abc')]).toEqual([6, 6, 6])
  })
})

describe('semanasDe e somarPorSemana', () => {
  it('semanas de segunda a domingo cobrindo o intervalo', () => {
    // 01/11/2026 é domingo: a primeira semana começa na segunda 26/10
    expect(semanasDe('2026-11-01', '2026-11-16')).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'])
  })
  it('soma cada campo na semana do dia; dia fora das semanas fica de fora', () => {
    const dias = [{ dia: '2026-11-02', lotes: 10, receita: 2 }, { dia: '2026-11-08', lotes: 5, receita: 1 }, { dia: '2026-11-09', lotes: 7, receita: 3 }, { dia: '2026-10-01', lotes: 99, receita: 99 }]
    const r = somarPorSemana(dias, d => d.dia, semanasDe('2026-11-02', '2026-11-16'), { lotes: d => d.lotes, receita: d => d.receita })
    expect(r).toEqual([
      { label: '02/11', inicio: '2026-11-02', lotes: 15, receita: 3 },
      { label: '09/11', inicio: '2026-11-09', lotes: 7, receita: 3 },
      { label: '16/11', inicio: '2026-11-16', lotes: 0, receita: 0 },
    ])
  })
})

describe('ativacaoPorMes', () => {
  it('de quem migrou em cada mês, quem já operou e quem ainda não', () => {
    const c = (data_migracao: string | null, situacao: string, status = 'Migrado') => ({ status, situacao, data_migracao })
    const r = ativacaoPorMes([
      c('2026-10-05', 'Ativo'), c('2026-10-20', 'Inativo'), c('2026-10-28', 'Nunca girou'), c('2026-11-03', 'Nunca girou'),
      c('2026-11-04', 'Em processamento', 'Em processamento'), c(null, 'Ativo'), c('2026-08-01', 'Ativo'),
    ], ['2026-10-01', '2026-11-01'])
    expect(r).toEqual([{ mes: '2026-10-01', migraram: 3, operaram: 2, aindaNao: 1 }, { mes: '2026-11-01', migraram: 1, operaram: 0, aindaNao: 1 }])
  })
})

describe('fluxoDaCarteira e concentracaoPorMes', () => {
  const m = (cliente_id: string, mes_ref: string, lotes: number) => ({ cliente_id, mes_ref, lotes })
  const matriz = [
    m('a', '2026-09-01', 100), m('b', '2026-09-01', 50),
    m('a', '2026-10-01', 80), m('c', '2026-10-01', 20), m('b', '2026-10-01', 0),
    m('c', '2026-11-01', 10), m('d', '2026-11-01', 30), m('e', '2026-11-01', 60),
  ]
  it('começaram ou voltaram = operaram no mês e não no anterior; pararam = o contrário', () => {
    expect(fluxoDaCarteira(matriz, ['2026-10-01', '2026-11-01'])).toEqual([
      { mes: '2026-10-01', comecaram: 1, pararam: 1, operaram: 2 },   // c começou; b parou (zero lotes não conta)
      { mes: '2026-11-01', comecaram: 2, pararam: 1, operaram: 3 },   // d e e começaram; a parou
    ])
  })
  it('fatia dos lotes nos N maiores do mês', () => {
    expect(concentracaoPorMes(matriz, ['2026-09-01', '2026-11-01', '2026-12-01'], 1)).toEqual([
      { mes: '2026-09-01', pct: (100 / 150) * 100 }, { mes: '2026-11-01', pct: 60 }, { mes: '2026-12-01', pct: null },
    ])
    expect(concentracaoPorMes(matriz, ['2026-11-01'], 5)[0].pct).toBe(100)
  })
})

describe('juntarPlataformas', () => {
  it('o mesmo nome escrito de dois jeitos vira uma fatia só', () => {
    expect(nomeDaPlataforma('BTG_DESKTOP')).toBe('BTG DESKTOP')
    expect(nomeDaPlataforma(' profit-chart  pro ')).toBe('PROFIT CHART PRO')
    expect(juntarPlataformas([{ plataforma: 'BTG DESKTOP', lotes: 10 }, { plataforma: 'BTG_DESKTOP', lotes: 5 }, { plataforma: 'TRYD', lotes: 40 }, { plataforma: 'Zerada', lotes: 0 }]))
      .toEqual([{ nome: 'TRYD', valor: 40 }, { nome: 'BTG DESKTOP', valor: 15 }])
  })
})

describe('fraseDosGraficos', () => {
  it('captação, ativação e receita do período', () => {
    expect(fraseDosGraficos({ periodo: 6, leads: 1240, ganhos: 212, migraram: 180, operaram: 110, receita: 'R$ 850 mil', porLote: 'R$ 0,24' }))
      .toBe('Nos últimos 6 meses entraram 1.240 leads e 212 foram ganhos (17 %). Migraram 180 contas e 61 % delas já operaram. A receita somou R$ 850 mil, R$ 0,24 por lote.')
  })
  it('singular, sem leads e sem migrações', () => {
    expect(fraseDosGraficos({ periodo: 3, leads: 1, ganhos: 1, migraram: 1, operaram: 1, receita: 'R$ 884', porLote: null }))
      .toBe('Nos últimos 3 meses entrou 1 lead e 1 foi ganho (100 %). Migrou 1 conta e 100 % delas já operou. A receita somou R$ 884.')
    expect(fraseDosGraficos({ periodo: 3, leads: 0, ganhos: 0, migraram: 0, operaram: 0, receita: 'R$ 0', porLote: null }))
      .toBe('Nos últimos 3 meses não entrou nenhum lead. Nenhuma conta migrou no período. A receita somou R$ 0.')
  })
})
