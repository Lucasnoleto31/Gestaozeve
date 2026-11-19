import { describe, expect, it } from 'vitest'
import { fraseDosMeses, frasesDaBase, frasesDoResumo, type DadosDoResumo } from './frases'

// Genial em 17/11/2026: os números da tela no dia em que as frases foram escritas
const genial: DadosDoResumo = {
  corretora: 'A Genial', mes: '2026-11-01', parcial: true, lotes: 332964, lotesComparavel: 332964, lotesBase: 349752,
  medida: 'receita total', medidaNaFrase: false, valor: 87719, valorAnterior: 196481, medidaPrevista: null, previsto: 150780, lotesPrevistos: 590491.4,
}
// o formatador de reais põe um espaço que não quebra entre o R$ e o número
const simples = (f: { frase: string; apoio: string | null }) => ({ frase: f.frase.replace(/ /g, ' '), apoio: f.apoio?.replace(/ /g, ' ') ?? null })

describe('frasesDoResumo', () => {
  it('mês em andamento: o esboço aprovado (quanto, com quantos lotes, contra o mesmo ponto, onde fecha)', () => {
    expect(simples(frasesDoResumo(genial))).toEqual({
      frase: 'A Genial gerou R$ 87.719 em novembro até agora, com 332.964 lotes: 4,8% abaixo de outubro no mesmo ponto do mês.',
      apoio: 'No ritmo atual o mês fecha perto de R$ 150.780 e 590.491 lotes.',
    })
  })
  it('no BTG a frase diz a medida, e a previsão diz que é só o giro', () => {
    const btg = simples(frasesDoResumo({ ...genial, corretora: 'O BTG', lotes: 88444, lotesComparavel: 88444, lotesBase: 29679, medida: 'comissão líquida', medidaNaFrase: true, valor: 9978, valorAnterior: 10742, medidaPrevista: 'comissão líquida do giro', previsto: 16118, lotesPrevistos: 142871 }))
    expect(btg.frase).toBe('O BTG gerou R$ 9.978 de comissão líquida em novembro até agora, com 88.444 lotes: 198,0% acima de outubro no mesmo ponto do mês.')
    expect(btg.apoio).toBe('No ritmo atual o mês fecha perto de R$ 16.118 de comissão líquida do giro e 142.871 lotes.')
  })
  it('sem mês anterior para comparar e sem previsão em reais, diz só o que há', () => {
    expect(simples(frasesDoResumo({ ...genial, lotesBase: null, previsto: null }))).toEqual({
      frase: 'A Genial gerou R$ 87.719 em novembro até agora, com 332.964 lotes.',
      apoio: 'No ritmo atual o mês fecha perto de 590.491 lotes.',
    })
  })
  it('mês fechado: quanto ficou e os lotes contra o mês anterior inteiro; a medida contra o mês anterior embaixo', () => {
    expect(simples(frasesDoResumo({ ...genial, mes: '2026-10-01', parcial: false, lotes: 591830, lotesComparavel: 591830, lotesBase: 624241, valor: 196481, valorAnterior: 182618, previsto: null, lotesPrevistos: null }))).toEqual({
      frase: 'A Genial gerou R$ 196.481 em outubro, com 591.830 lotes: 5,2% abaixo de setembro.',
      apoio: 'Receita total 7,6% acima de setembro.',
    })
  })
  it('sem lotes no mês, e lotes sem valor', () => {
    expect(frasesDoResumo({ ...genial, lotes: 0, lotesComparavel: 0 })).toEqual({ frase: 'Ainda não há lotes lançados em novembro.', apoio: null })
    expect(simples(frasesDoResumo({ ...genial, valor: 0, lotesBase: null, previsto: null, lotesPrevistos: null }))).toEqual({ frase: 'A Genial teve 332.964 lotes em novembro até agora.', apoio: null })
  })
})

describe('fraseDosMeses', () => {
  const meses = [{ mes: '2026-11-01', valor: 87719 }, { mes: '2026-10-01', valor: 196481 }, { mes: '2026-09-01', valor: 182618 }]
  // o formatador de reais põe um espaço que não quebra entre o R$ e o número
  const frase = (...a: Parameters<typeof fraseDosMeses>) => fraseDosMeses(...a)?.replace(/ /g, ' ') ?? null
  it('mês em andamento e os dois anteriores, com os valores da tabela', () => {
    expect(frase('receita total', meses, true)).toBe('Novembro, em andamento, está em R$ 87.719 de receita total; outubro fechou em R$ 196.481 e setembro em R$ 182.618.')
  })
  it('mês fechado não repete o verbo', () => {
    expect(frase('receita total', meses.slice(1), false)).toBe('Outubro fechou em R$ 196.481 de receita total; setembro em R$ 182.618.')
  })
  it('um mês só, mês sem valor e lista vazia', () => {
    expect(frase('comissão líquida do escritório', [{ mes: '2026-09-01', valor: 400 }], false)).toBe('Setembro fechou em R$ 400 de comissão líquida do escritório.')
    expect(frase('receita total', [{ mes: '2026-11-01', valor: 0 }, { mes: '2026-10-01', valor: 196481 }], true)).toBe('Ainda não há receita total em novembro; outubro fechou em R$ 196.481.')
    expect(frase('receita total', [], true)).toBeNull()
  })
})

describe('frasesDaBase', () => {
  it('quantos giraram, quantos estão em risco e quantos nunca operaram', () => {
    expect(frasesDaBase({ mes: '2026-11-01', ativos: 160, levados: 1667, emRisco: 170, riscoAlto: 34, nunca: 958 })).toEqual({
      frase: '160 dos 1.667 clientes giraram em novembro.',
      apoio: '170 estão em risco (34 de nível alto) e 958 nunca operaram.',
    })
  })
  it('singular e base sem risco', () => {
    expect(frasesDaBase({ mes: '2026-11-01', ativos: 1, levados: 12, emRisco: 1, riscoAlto: 0, nunca: 1 })).toEqual({ frase: '1 dos 12 clientes girou em novembro.', apoio: '1 está em risco e 1 nunca operou.' })
    expect(frasesDaBase({ mes: '2026-11-01', ativos: 5, levados: 12, emRisco: 0, riscoAlto: 0, nunca: 0 }).apoio).toBe('Nenhum está em risco.')
    expect(frasesDaBase({ mes: '2026-11-01', ativos: 0, levados: 0, emRisco: 0, riscoAlto: 0, nunca: 0 })).toEqual({ frase: 'Ainda não há clientes cadastrados.', apoio: null })
  })
})
