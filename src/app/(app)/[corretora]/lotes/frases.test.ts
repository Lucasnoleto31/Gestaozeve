import { describe, expect, it } from 'vitest'
import { diaSemanaLongo, fraseAgora, fraseDias, fraseDoDia, frasePeriodo, intervalo, nomeDoPeriodo, variacaoTexto } from './frases'

describe('nomeDoPeriodo', () => {
  const hoje = '2026-11-18'
  it('usa o nome do atalho do seletor quando o período é um deles', () => {
    expect(nomeDoPeriodo('2026-10-20', hoje, hoje)).toBe('30 dias')
    expect(nomeDoPeriodo('2026-09-20', hoje, hoje)).toBe('60 dias')
    expect(nomeDoPeriodo('2026-08-21', hoje, hoje)).toBe('90 dias')
    expect(nomeDoPeriodo('2026-11-01', hoje, hoje)).toBe('mês atual')
  })
  it('fora dos atalhos, diz as datas; com o ano quando atravessa a virada', () => {
    expect(nomeDoPeriodo('2026-08-21', '2026-11-17', hoje)).toBe('21/08 a 17/11')
    expect(nomeDoPeriodo('2026-10-05', hoje, hoje)).toBe('05/10 a 18/11')
    expect(intervalo('2026-11-20', '2027-02-17')).toBe('20/11/26 a 17/02/27')
  })
})

describe('variacaoTexto', () => {
  it('segue o formato da coluna "Var. dia ant."', () => {
    expect(variacaoTexto(120, 100)).toBe('+20%')
    expect(variacaoTexto(819, 1000)).toBe('−18,1%')
    expect(variacaoTexto(100, 100)).toBe('0%')
    expect(variacaoTexto(100, 0)).toBeNull()
  })
})

describe('fraseAgora', () => {
  const base = { ultima: '2026-11-17', lotes: 23127, mediaDoMes: 30269, semana: { lotes: 71646, anterior: 57455 }, mes: { lotes: 332964, noMesmoPonto: 320774 }, parcial: false }
  it('diz o dia contra a média do mês e, embaixo, a semana e o mês em palavras', () => {
    expect(fraseAgora(base)).toEqual({
      frase: 'Terça, 17/11: 23.127 lotes, 23,6% abaixo da média do mês.',
      apoio: 'A semana e o mês estão acima dos anteriores no mesmo ponto.',
    })
  })
  it('separa a semana do mês quando apontam para lados diferentes', () => {
    expect(fraseAgora({ ...base, lotes: 40000, mes: { lotes: 300000, noMesmoPonto: 320774 } })).toEqual({
      frase: 'Terça, 17/11: 40.000 lotes, 32,1% acima da média do mês.',
      apoio: 'A semana está acima da passada e o mês, abaixo do anterior, no mesmo ponto.',
    })
  })
  it('sem base de comparação não afirma nada', () => {
    const f = fraseAgora({ ...base, mediaDoMes: null, semana: { lotes: 23127, anterior: null }, mes: { lotes: 23127, noMesmoPonto: null } })
    expect(f).toEqual({ frase: 'Terça, 17/11: 23.127 lotes. É o primeiro dia com giro do mês.', apoio: null })
    expect(fraseAgora({ ...base, semana: { lotes: 71646, anterior: null } }).apoio).toBe('O mês está acima do anterior no mesmo ponto.')
    expect(fraseAgora({ ...base, mes: { lotes: 332964, noMesmoPonto: null } }).apoio).toBe('A semana está acima da passada no mesmo ponto.')
  })
  it('com o dia em andamento não diz acima nem abaixo da média', () => {
    expect(fraseAgora({ ...base, parcial: true })).toEqual({
      frase: 'Terça, 17/11, até agora: 23.127 lotes. O dia ainda não fechou.',
      apoio: 'Até agora, a semana e o mês estão acima dos anteriores no mesmo ponto.',
    })
  })
})

describe('frasePeriodo', () => {
  const base = { inicio: '2026-08-21', fim: '2026-11-18', duracao: 90, lotes: 1759609, lotesAnteriores: 2083686, tendencia: 'Estável' as const, media: 29326.8 }
  it('compara com o período anterior e diz o ritmo dentro do período', () => {
    expect(frasePeriodo(base)).toEqual({
      frase: 'De 21/08 a 18/11: 1.759.609 lotes, 15,6% a menos que nos 90 dias anteriores.',
      apoio: 'Dentro do período o ritmo ficou estável: 29.327 lotes por dia, em média.',
    })
    expect(frasePeriodo({ ...base, lotesAnteriores: 1500000, tendencia: 'Caindo' })).toEqual({
      frase: 'De 21/08 a 18/11: 1.759.609 lotes, 17,3% a mais que nos 90 dias anteriores.',
      apoio: 'Dentro do período o ritmo está caindo: 29.327 lotes por dia, em média.',
    })
  })
  it('sem lotes no período anterior, diz que não há com o que comparar', () => {
    expect(frasePeriodo({ ...base, lotes: 183072, lotesAnteriores: 0, tendencia: 'Subindo', media: 4257.4 })).toEqual({
      frase: 'De 21/08 a 18/11: 183.072 lotes. Não há lotes nos 90 dias anteriores para comparar.',
      apoio: 'Dentro do período o ritmo está subindo: 4.257 lotes por dia, em média.',
    })
  })
})

describe('fraseDias', () => {
  it('é a linha de total da tabela, com a média que serve de régua', () => {
    expect(fraseDias({ inicio: '2026-08-21', fim: '2026-11-18', dias: 60, lotes: 1759609, media: 29326.8, receita: 'R$ 402.772' })).toEqual({
      frase: 'De 21/08 a 18/11: 1.759.609 lotes em 60 dias com giro, média de 29.327 por dia.',
      apoio: 'Receita de R$ 402.772. Cada dia diz se ficou acima ou abaixo dessa média.',
    })
  })
})

describe('fraseDoDia', () => {
  const base = { dia: '2026-11-17', clientes: 107, operacoes: 142, emAcoes: 0, foraDaReceita: 0, manuais: 0 }
  it('diz quem operou e como estão as corretagens', () => {
    expect(fraseDoDia(base)).toEqual({ frase: 'Terça-feira: 107 clientes operaram, em 142 operações.', apoio: 'Todas as corretagens pelo cadastro.' })
    expect(fraseDoDia({ ...base, clientes: 1, operacoes: 1, emAcoes: 3, foraDaReceita: 2, manuais: 1 })).toEqual({
      frase: 'Terça-feira: 1 cliente operou, em 1 operação.',
      apoio: '3 em ações e cripto. 2 de antes da migração, fora da receita. 1 corretagem manual, diferente do cadastro.',
    })
    expect(fraseDoDia({ ...base, manuais: 4 }).apoio).toBe('4 corretagens manuais, diferentes do cadastro.')
  })
  it('dia só com zeragem ou posição', () => {
    expect(fraseDoDia({ ...base, dia: '2026-11-14', clientes: 0, operacoes: 3 }).frase).toBe('Sábado: 3 operações, nenhuma com lotes ou ações.')
  })
  it('dia da semana por extenso', () => {
    expect(diaSemanaLongo('2026-11-16')).toBe('segunda-feira')
    expect(diaSemanaLongo('2026-11-15')).toBe('domingo')
  })
})
