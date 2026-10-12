import { describe, expect, it } from 'vitest'
import { curvasMensais, faixaDe, fimDoMes, fracaoEm, mediana, projetarIncentivo, projetarMes, quantil, variacaoDe, variacaoMensal } from './projecao'
import { diasUteis } from './btg'
import type { GiroDiaRow, IncentivoRow } from './tipos'

// Dias úteis de um mês ('YYYY-MM-DD'), segunda a sexta
function diasUteisDoMes(mes: string): string[] {
  const y = +mes.slice(0, 4), m = +mes.slice(5, 7)
  const out: string[] = []
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(Date.UTC(y, m - 1, d))
    if (dt.getUTCMonth() !== m - 1) break
    const w = dt.getUTCDay()
    if (w !== 0 && w !== 6) out.push(`${mes.slice(0, 7)}-${String(d).padStart(2, '0')}`)
  }
  return out
}
// Mês inteiro com `lotes` por dia útil (ou uma função do índice do dia)
const mesUniforme = (mes: string, lotes: number | ((i: number, n: number) => number), tarifa = 2): GiroDiaRow[] => {
  const dias = diasUteisDoMes(mes)
  return dias.map((dia, i) => { const l = typeof lotes === 'number' ? lotes : lotes(i, dias.length); return { dia, lotes: l, receita: l * tarifa } })
}
// Primeiros `k` dias úteis do mês
const parcial = (mes: string, k: number, lotes: number, tarifa = 2): GiroDiaRow[] => mesUniforme(mes, lotes, tarifa).slice(0, k)

const HIST = [...mesUniforme('2026-07-01', 10), ...mesUniforme('2026-08-01', 10), ...mesUniforme('2026-09-01', 10)]

describe('utilitários', () => {
  it('fim do mês e quantis', () => {
    expect(fimDoMes('2026-02-01')).toBe('2026-02-28')
    expect(fimDoMes('2028-02-01')).toBe('2028-02-29')
    expect(fimDoMes('2026-10-01')).toBe('2026-10-31')
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([4, 1, 2, 3])).toBe(2.5)
    expect(quantil([1, 2, 3, 4, 5], 0.25)).toBe(2)
    expect(quantil([], 0.5)).toBe(0)
  })
  it('interpola a fração da curva', () => {
    const curva = [0, 0.25, 0.5, 0.75, 1]
    expect(fracaoEm(curva, 0)).toBe(0)
    expect(fracaoEm(curva, 0.5)).toBe(0.5)
    expect(fracaoEm(curva, 0.375)).toBeCloseTo(0.375, 6)
    expect(fracaoEm(curva, 1)).toBe(1)
    expect(fracaoEm([0], 0.5)).toBe(1)
  })
})

describe('curvas mensais', () => {
  it('monta uma curva por mês completo, normalizada', () => {
    const curvas = curvasMensais(HIST, '2026-10-01')
    expect(curvas.map(c => c.mes)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01'])
    const set = curvas[2]
    expect(set.n).toBe(22)
    expect(set.lotes[0]).toBe(0)
    expect(set.lotes[22]).toBeCloseTo(1, 9)
    expect(set.lotes[11]).toBeCloseTo(0.5, 9)
    expect(set.receita[11]).toBeCloseTo(0.5, 9)
  })
  it('ignora o mês de referência, os posteriores e meses sem lotes; respeita o máximo', () => {
    const dias = [...HIST, ...parcial('2026-10-01', 5, 10), ...mesUniforme('2026-06-01', 0)]
    expect(curvasMensais(dias, '2026-10-01').map(c => c.mes)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01'])
    expect(curvasMensais(dias, '2026-10-01', 2).map(c => c.mes)).toEqual(['2026-08-01', '2026-09-01'])
    expect(curvasMensais(dias, '2026-09-01').map(c => c.mes)).toEqual(['2026-07-01', '2026-08-01'])
  })
  it('descarta o mês mais antigo quando começa pela metade (importação iniciada no meio do mês)', () => {
    const meio = mesUniforme('2026-06-01', 10).slice(8) // junho só a partir do 9º dia útil
    expect(curvasMensais([...meio, ...HIST], '2026-10-01').map(c => c.mes)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01'])
    // um mês do meio do histórico com começo vazio (feriado, falha) continua valendo
    const julTarde = [...mesUniforme('2026-07-01', 10).slice(4), ...mesUniforme('2026-08-01', 10), ...mesUniforme('2026-09-01', 10)]
    expect(curvasMensais([...mesUniforme('2026-06-01', 10), ...julTarde], '2026-10-01')).toHaveLength(4)
  })
  it('lote no fim de semana conta no dia útil anterior', () => {
    const dias: GiroDiaRow[] = [{ dia: '2026-09-01', lotes: 10, receita: 20 }, { dia: '2026-09-04', lotes: 10, receita: 20 }, { dia: '2026-09-05', lotes: 10, receita: 20 }] // ter, sex e sáb
    const [c] = curvasMensais(dias, '2026-10-01')
    expect(c.lotes[diasUteis('2026-09-01', '2026-09-03')]).toBeCloseTo(1 / 3, 9)
    expect(c.lotes[diasUteis('2026-09-01', '2026-09-04')]).toBeCloseTo(1, 9)
  })
})

describe('projeção do mês', () => {
  it('projeta pelo histórico quando o mês corrente está parcial', () => {
    // outubro/26: 22 dias úteis; 10 lançados a 10 lotes/dia; histórico uniforme → projeção = 220
    const dias = [...HIST, ...parcial('2026-10-01', 10, 10)]
    const ultima = diasUteisDoMes('2026-10-01')[9]
    const p = projetarMes(dias, '2026-10-01', ultima, '2026-10-15')
    expect(p).toMatchObject({ parcial: true, metodo: 'historico', diasDecorridos: 10, diasTotal: 22, mesesHistorico: 3 })
    expect(p.fracao).toBeCloseTo(10 / 22, 9)
    expect(p.fracaoEsperada).toBeCloseTo(10 / 22, 9)
    expect(p.lotes.realizado).toBe(100)
    expect(p.lotes.projetado).toBeCloseTo(220, 6)
    expect(p.lotes.linear).toBeCloseTo(220, 6)
    expect(p.lotes.baixo).toBeCloseTo(220, 6)
    expect(p.lotes.alto).toBeCloseTo(220, 6)
    expect(p.receita.projetado).toBeCloseTo(440, 6)
    expect(p.fator.lotes).toBeCloseTo(2.2, 6)
    // mês anterior (set/26, 22 dias úteis) no mesmo ponto: 10 dias × 10 lotes
    expect(p.lotes.anteriorMesmoPonto).toBe(100)
    expect(p.lotes.anteriorTotal).toBe(220)
  })
  it('histórico concentrado no começo do mês projeta abaixo do ritmo linear', () => {
    // 75 % dos lotes na primeira metade de cada mês
    const frente = (i: number, n: number) => (i < n / 2 ? 30 : 10)
    const hist = [...mesUniforme('2026-07-01', frente), ...mesUniforme('2026-08-01', frente), ...mesUniforme('2026-09-01', frente)]
    const dias = [...hist, ...parcial('2026-10-01', 11, 30)]
    const p = projetarMes(dias, '2026-10-01', diasUteisDoMes('2026-10-01')[10], '2026-10-16')
    expect(p.metodo).toBe('historico')
    expect(p.lotes.linear).toBeCloseTo(660, 6)
    expect(p.lotes.projetado).toBeLessThan(p.lotes.linear)
    // jul (23 dias úteis), ago (21) e set (22) chegam a 73–75 % na metade: mediana ≈ 0,734 → 330 ÷ 0,734
    expect(p.lotes.projetado).toBeGreaterThan(440)
    expect(p.lotes.projetado).toBeLessThan(460)
    expect(p.lotes.baixo).toBeLessThanOrEqual(p.lotes.projetado)
    expect(p.lotes.alto).toBeGreaterThanOrEqual(p.lotes.projetado)
  })
  it('cai no ritmo linear com menos de 3 meses de histórico', () => {
    const dias = [...mesUniforme('2026-09-01', 10), ...parcial('2026-10-01', 11, 10)]
    const p = projetarMes(dias, '2026-10-01', diasUteisDoMes('2026-10-01')[10], '2026-10-16')
    expect(p).toMatchObject({ parcial: true, metodo: 'linear', mesesHistorico: 1 })
    expect(p.lotes.projetado).toBeCloseTo(220, 6)
    expect(p.lotes.baixo).toBe(p.lotes.projetado)
  })
  it('não projeta mês fechado, mês passado nem mês sem lotes', () => {
    const fechado = projetarMes(HIST, '2026-09-01', '2026-09-30', '2026-10-15')
    expect(fechado).toMatchObject({ parcial: false, metodo: 'fechado', fracao: 1 })
    expect(fechado.lotes.projetado).toBe(220)
    expect(fechado.lotes.anteriorTotal).toBe(210) // ago/26: 21 dias úteis
    expect(fechado.lotes.anteriorMesmoPonto).toBe(210)
    expect(fechado.fator.lotes).toBe(1)
    // mês corrente com todos os dias úteis lançados também está fechado
    const cheio = projetarMes([...HIST, ...mesUniforme('2026-10-01', 10)], '2026-10-01', '2026-10-30', '2026-10-30')
    expect(cheio.metodo).toBe('fechado')
    // sem lotes no mês
    const vazio = projetarMes(HIST, '2026-10-01', '2026-09-30', '2026-10-15')
    expect(vazio).toMatchObject({ parcial: false, metodo: 'sem-lotes', diasDecorridos: 0 })
    expect(vazio.lotes.realizado).toBe(0)
    expect(variacaoDe(vazio, vazio.lotes).anterior).toBeNull() // sem "−100 %" em vermelho
  })
  it('mesmo ponto do mês anterior respeita a quantidade de dias úteis de cada mês', () => {
    // nov/26 tem 21 dias úteis, out/26 tem 22: 7 de 21 (1/3) corresponde a 7 de 22 (arredondado)
    const dias = [...HIST, ...mesUniforme('2026-10-01', 10), ...parcial('2026-11-01', 7, 10)]
    const p = projetarMes(dias, '2026-11-01', diasUteisDoMes('2026-11-01')[6], '2026-11-12')
    expect(p).toMatchObject({ diasDecorridos: 7, diasTotal: 21, parcial: true })
    expect(p.lotes.anteriorMesmoPonto).toBe(70)
    expect(p.lotes.anteriorTotal).toBe(220)
    expect(p.lotes.projetado).toBeCloseTo(210, 6)
  })
  it('última data em fim de semana conta até a sexta', () => {
    const dias = [...HIST, ...parcial('2026-10-01', 7, 10)] // até sex 09/10
    const p = projetarMes(dias, '2026-10-01', '2026-10-10', '2026-10-11') // sáb 10/10
    expect(p).toMatchObject({ diasDecorridos: 7, parcial: true, metodo: 'historico' })
    expect(p.lotes.projetado).toBeCloseTo(220, 6)
  })
  it('muito cedo no mês fica no linear', () => {
    // histórico sem nada nos 5 primeiros dias úteis; 1 dia lançado em outubro
    const tarde = (i: number) => (i < 5 ? 0 : 10)
    const hist = [...mesUniforme('2026-07-01', tarde), ...mesUniforme('2026-08-01', tarde), ...mesUniforme('2026-09-01', tarde)].filter(d => d.lotes > 0)
    const p = projetarMes([...hist, ...parcial('2026-10-01', 1, 10)], '2026-10-01', '2026-10-01', '2026-10-02')
    expect(p.metodo).toBe('linear')
    expect(p.lotes.projetado).toBeCloseTo(220, 6)
  })
  it('monta as variações', () => {
    const dias = [...HIST, ...parcial('2026-10-01', 10, 10)]
    const p = projetarMes(dias, '2026-10-01', diasUteisDoMes('2026-10-01')[9], '2026-10-15')
    expect(variacaoDe(p, p.lotes)).toMatchObject({ atual: 100, anterior: 100, rotulo: 'vs mesmo ponto de set/26' })
    const f = projetarMes(HIST, '2026-09-01', '2026-09-30', '2026-10-15')
    expect(variacaoDe(f, f.lotes)).toMatchObject({ atual: 220, anterior: 210, rotulo: 'vs ago/26' })
    expect(variacaoMensal(50, 80, '2026-09-01', true)).toMatchObject({ atual: 50, anterior: 80, rotulo: 'vs set/26 (mês parcial)', neutro: true })
    expect(variacaoMensal(50, undefined, '2026-09-01', false)).toMatchObject({ anterior: null, neutro: false })
  })
})

describe('projeção do incentivo', () => {
  const FAIXAS = [{ pontos_min: 1000, valor: 500 }, { pontos_min: 3000, valor: 1500 }]
  const linha = (nome: string, pontos: number): IncentivoRow => ({
    chave: nome, nome, cliente_id: null, contas: 1, lotes: pontos, pontos, pontos_win: pontos, pontos_wdo: 0, pontos_dol: 0, pontos_outros: 0,
    faixa_min: faixaDe(pontos, FAIXAS)?.pontos_min ?? 0, valor_incentivo: faixaDe(pontos, FAIXAS)?.valor ?? 0, proxima_faixa: null, pontos_faltantes: null,
  })
  it('faixa é o maior mínimo ultrapassado', () => {
    expect(faixaDe(1000, FAIXAS)).toBeNull()
    expect(faixaDe(1001, FAIXAS)?.valor).toBe(500)
    expect(faixaDe(5000, FAIXAS)?.valor).toBe(1500)
    expect(faixaDe(10, [])).toBeNull()
  })
  it('reenquadra cada cliente nos pontos projetados', () => {
    const r = projetarIncentivo([linha('A', 600), linha('B', 1200), linha('C', 2000)], 2, FAIXAS)
    expect(r.pontos).toBe(7600)
    expect(r.total).toBe(500 + 500 + 1500)
    expect(r.comFaixa).toBe(3)
    expect(r.sobem).toBe(2) // A ganha faixa, C sobe
    expect(r.itens[0]).toMatchObject({ nome: 'C', faixaAtual: 1000, faixaProjetada: 3000, valorProjetado: 1500 })
    // fator 1 (mês fechado) não muda nada
    const igual = projetarIncentivo([linha('A', 600), linha('B', 1200)], 1, FAIXAS)
    expect(igual.total).toBe(500)
    expect(igual.sobem).toBe(0)
  })
})
