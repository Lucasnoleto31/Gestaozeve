import { describe, expect, it } from 'vitest'
import { inclinacao, resumoPeriodo, serieDoPeriodo, situacaoAtual } from './giro'
import type { DiarioRow } from './tipos'

const d = (dia: string, lotes: number, p: Partial<DiarioRow> = {}): DiarioRow => ({ dia, lotes, zerados: 0, clientes: 1, operacoes: 1, receita: lotes / 10, ...p })

describe('inclinacao', () => {
  it('é o quanto a série ganha por dia; zero com menos de dois pontos', () => {
    expect(inclinacao([10, 20, 30, 40])).toBeCloseTo(10, 9)
    expect(inclinacao([30, 20, 10])).toBeCloseTo(-10, 9)
    expect(inclinacao([5, 5, 5])).toBe(0)
    expect(inclinacao([7])).toBe(0)
    expect(inclinacao([])).toBe(0)
  })
})

describe('resumoPeriodo', () => {
  it('soma, tira a média por dia com giro e compara as duas metades', () => {
    const r = resumoPeriodo([
      d('2026-10-01', 100, { zerados: 2, clientes: 3, operacoes: 4 }), d('2026-10-02', 300, { clientes: 5 }),
      d('2026-10-05', 500, { zerados: 1 }), d('2026-10-06', 700, { clientes: 9, operacoes: 6 }), d('2026-10-07', 900),
    ])
    expect(r).toMatchObject({ dias: 5, lotes: 2500, zerados: 3, operacoes: 13, media: 500, clientesMax: 9 })
    expect(r.receita).toBeCloseTo(250, 9)
    expect(r.melhor?.dia).toBe('2026-10-07')
    // 5 dias: a primeira metade fica com 3
    expect(r.metade1).toEqual({ dias: 3, media: 300 })
    expect(r.metade2).toEqual({ dias: 2, media: 800 })
    expect(r.varMetades).toBeCloseTo(166.67, 2)
    expect(r.inclinacao).toBeCloseTo(200, 9)
    expect(r.tendencia).toBe('Subindo')
    expect(r.clientesMedia).toBeCloseTo(3.8, 9)
  })

  it('tendência: só sobe ou cai quando a reta anda mais de 10% da média', () => {
    expect(resumoPeriodo([d('a', 1000), d('b', 1020), d('c', 1040)]).tendencia).toBe('Estável')
    expect(resumoPeriodo([d('a', 1000), d('b', 900), d('c', 800)]).tendencia).toBe('Caindo')
    expect(resumoPeriodo([d('a', 1000)]).tendencia).toBe('Estável')
  })

  it('período vazio não divide por zero', () => {
    const r = resumoPeriodo([])
    expect(r).toMatchObject({ dias: 0, lotes: 0, media: 0, melhor: null, varMetades: null, tendencia: 'Estável', clientesMedia: 0, clientesMax: 0 })
  })
})

describe('serieDoPeriodo', () => {
  it('traz a média móvel de 7 dias, o acumulado e o dia anterior', () => {
    const s = serieDoPeriodo([10, 20, 30, 40, 50, 60, 70, 80].map((v, i) => d(`2026-10-${String(i + 1).padStart(2, '0')}`, v)))
    expect(s.map(x => x.acumulado)).toEqual([10, 30, 60, 100, 150, 210, 280, 360])
    expect(s[0]).toMatchObject({ mm: 10, anteriorLotes: 0, acimaMedia: false })
    expect(s[2].mm).toBe(20)
    // do 8º dia em diante a janela anda: (20 + … + 80) / 7
    expect(s[7].mm).toBe(50)
    expect(s[7]).toMatchObject({ anteriorLotes: 70, acimaMedia: true })
  })
})

describe('situacaoAtual', () => {
  // out/26: 4 dias com giro; nov/26: 3 dias (03, 04 e a terça 10/11)
  const dias = [
    d('2026-10-01', 100), d('2026-10-02', 200), d('2026-10-27', 400), d('2026-10-28', 800, { clientes: 7 }),
    d('2026-11-03', 500, { clientes: 4 }), d('2026-11-04', 300, { zerados: 5 }), d('2026-11-10', 900, { clientes: 6 }),
  ]

  it('junta o último dia, a semana e o mês dele', () => {
    const s = situacaoAtual(dias, '2026-11-10')
    expect(s.dia?.lotes).toBe(900)
    // 10/11/26 é terça: a semana começa na segunda 09/11 e só a terça tem giro; a semana passada
    // conta de segunda 02/11 a terça 03/11
    expect(s.semana).toEqual({ inicio: '2026-11-09', lotes: 900, dias: 1, anterior: 500 })
    expect(s.mes).toMatchObject({ mes: '2026-11-01', lotes: 1700, zerados: 5, clientesMax: 6 })
    expect(s.mes.dias.map(x => x.dia)).toEqual(['2026-11-03', '2026-11-04', '2026-11-10'])
    expect(s.mes.media).toBeCloseTo(566.67, 2)
    expect(s.mes.melhor?.dia).toBe('2026-11-10')
  })

  it('compara com o mês anterior no mesmo número de dias com giro', () => {
    const s = situacaoAtual(dias, '2026-11-10')
    // 3 dias com giro em novembro contra os 3 primeiros de outubro
    expect(s.mesAnterior).toEqual({ mes: '2026-10-01', dias: 4, lotes: 1500, media: 375, noMesmoPonto: 700, diasNoPonto: 3 })
  })

  it('a semana passada conta só os mesmos dias da semana', () => {
    // quarta 04/11: semana de 02/11 a 04/11 contra 26/10 a 28/10
    const s = situacaoAtual(dias, '2026-11-04')
    expect(s.semana).toEqual({ inicio: '2026-11-02', lotes: 800, dias: 2, anterior: 1200 })
    expect(s.mes.lotes).toBe(800)
    expect(s.mesAnterior?.noMesmoPonto).toBe(300)
  })

  it('sem mês anterior nem semana passada devolve null', () => {
    const s = situacaoAtual([d('2026-11-10', 900)], '2026-11-10')
    expect(s.mesAnterior).toBeNull()
    expect(s.semana.anterior).toBeNull()
    expect(s.mes.media).toBe(900)
  })

  it('dia sem lote lançado devolve dia null e mês vazio', () => {
    const s = situacaoAtual([d('2026-10-28', 800)], '2026-11-10')
    expect(s.dia).toBeNull()
    expect(s.mes).toMatchObject({ lotes: 0, media: 0, melhor: null, clientesMax: 0 })
    expect(s.mesAnterior).toMatchObject({ dias: 1, noMesmoPonto: 0, diasNoPonto: 0 })
  })
})
