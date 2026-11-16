import { describe, expect, it } from 'vitest'
import { fraseDoAtp, fraseDoIncentivo, maisPertoDeSubir, situacaoDaMeta, textoDaFolga, textoDaPrevisao } from './incentivoTela'
import type { MetaAvaliada, Previsao } from './btg'

const meta = (x: Partial<MetaAvaliada> = {}): MetaAvaliada => ({
  indice: 1, prazoMeses: 18, comissao: 50000, premio: 50000, observacao: '', prazoFim: '2028-03-01', acumulado: 41866, atingidaEm: null,
  status: 'em andamento', faltam: 8134, mesesRestantes: 15.5, ritmoMensal: 525, ...x,
})
const prev = (x: Partial<Previsao> = {}): Previsao => ({ mesesParaAtingir: 0.3, dataPrevista: '2026-11-25', folgaMeses: 15.2, alcanca: true, ...x })

describe('situacaoDaMeta', () => {
  it('com folga, apertado e fora do prazo saem da previsão no ritmo escolhido', () => {
    expect(situacaoDaMeta(meta(), prev())).toBe('folga')
    expect(situacaoDaMeta(meta(), prev({ folgaMeses: 2.9 }))).toBe('apertado')
    expect(situacaoDaMeta(meta(), prev({ folgaMeses: -4, alcanca: false }))).toBe('fora')
    expect(situacaoDaMeta(meta(), prev({ dataPrevista: null, mesesParaAtingir: null, folgaMeses: null, alcanca: false }))).toBe('fora')
    expect(situacaoDaMeta(meta(), undefined)).toBe('fora')
  })
  it('meta atingida ou vencida não depende da previsão', () => {
    expect(situacaoDaMeta(meta({ status: 'atingida' }), prev({ alcanca: false }))).toBe('atingida')
    expect(situacaoDaMeta(meta({ status: 'vencida' }), prev())).toBe('vencida')
  })
})

describe('textoDaFolga e textoDaPrevisao', () => {
  it('meses quando passa de um mês, dias quando é menos', () => {
    expect(textoDaFolga(15.2)).toBe('15 meses antes do prazo')
    expect(textoDaFolga(1)).toBe('1 mês antes do prazo')
    expect(textoDaFolga(-10.4)).toBe('10 meses depois do prazo')
    expect(textoDaFolga(0.4)).toBe('12 dias antes do prazo')
    expect(textoDaFolga(-0.03)).toBe('1 dia depois do prazo')
  })
  it('diz quando bate, ou por que não bate', () => {
    expect(textoDaPrevisao(prev())).toBe('bate em nov/26, 15 meses antes do prazo')
    expect(textoDaPrevisao(prev({ mesesParaAtingir: 130, dataPrevista: '2037-09-01', folgaMeses: -110, alcanca: false }))).toBe('levaria mais de 10 anos')
    expect(textoDaPrevisao(prev({ dataPrevista: null, mesesParaAtingir: null }))).toBe('não bate: falta receita no ritmo escolhido')
  })
})

describe('fraseDoAtp', () => {
  it('quanto falta, o prêmio e quando bate', () => {
    expect(fraseDoAtp([meta(), meta({ indice: 2, comissao: 110000, faltam: 68134 })], prev()))
      .toBe('Faltam R$ 8.134 para a próxima meta, com prêmio de R$ 50.000. No ritmo atual bate em nov/26, 15 meses antes do prazo.')
  })
  it('a próxima é a primeira em andamento, não a primeira da lista', () => {
    const metas = [meta({ status: 'atingida', faltam: 0, atingidaEm: '2026-11-01' }), meta({ indice: 2, comissao: 110000, premio: 50000, faltam: 60000 })]
    expect(fraseDoAtp(metas, prev({ dataPrevista: '2027-08-10', folgaMeses: -2.3, alcanca: false })))
      .toBe('Faltam R$ 60.000 para a próxima meta, com prêmio de R$ 50.000. No ritmo atual bate em ago/27, 2 meses depois do prazo.')
    expect(fraseDoAtp(metas, prev({ dataPrevista: '2027-08-10', folgaMeses: -2.3, alcanca: false }), 'No ritmo escolhido')).toContain('No ritmo escolhido bate em ago/27')
  })
  it('sem metas, todas atingidas e nenhuma em aberto', () => {
    expect(fraseDoAtp([], undefined)).toBe('O programa ainda não tem metas cadastradas.')
    const feita = meta({ status: 'atingida', faltam: 0 })
    expect(fraseDoAtp([feita, { ...feita, indice: 2, premio: 100000 }], undefined)).toBe('Todas as 2 metas foram atingidas: R$ 150.000 em prêmios.')
    expect(fraseDoAtp([feita, meta({ indice: 2, status: 'vencida' })], undefined)).toBe('Não há meta em aberto: 1 atingida (R$ 50.000 em prêmios) e 1 vencida.')
  })
})

describe('fraseDoIncentivo', () => {
  const base = { mesRef: '2026-11-01', total: 15300, comFaixa: 31, previsto: 32800, anterior: 39600, primeiraFaixa: 1000 }
  it('mês em andamento: o que já garante, em quanto fecha e o mês anterior', () => {
    expect(fraseDoIncentivo(base)).toBe('Novembro já garante R$ 15.300 de incentivo, com 31 clientes em alguma faixa. No ritmo atual fecha em R$ 32.800; outubro pagou R$ 39.600.')
    expect(fraseDoIncentivo({ ...base, total: 0, comFaixa: 0, previsto: 1200, anterior: null })).toBe('Novembro ainda não garante incentivo: ninguém passou de 1.000 pontos. No ritmo atual fecha em R$ 1.200.')
  })
  it('mês fechado: o que pagou', () => {
    expect(fraseDoIncentivo({ ...base, mesRef: '2026-10-01', total: 39600, comFaixa: 1, previsto: null, anterior: 36600 })).toBe('Outubro pagou R$ 39.600 de incentivo, com 1 cliente em alguma faixa; setembro pagou R$ 36.600.')
    expect(fraseDoIncentivo({ ...base, total: 0, comFaixa: 0, previsto: null, anterior: null })).toBe('Novembro não teve incentivo: ninguém passou de 1.000 pontos.')
  })
})

describe('maisPertoDeSubir', () => {
  it('quem tem menos pontos faltando; quem está na faixa máxima não entra', () => {
    const linhas = [{ nome: 'A', pontos_faltantes: 900 }, { nome: 'B', pontos_faltantes: null }, { nome: 'C', pontos_faltantes: 120 }, { nome: 'D', pontos_faltantes: 0 }]
    expect(maisPertoDeSubir(linhas)?.nome).toBe('C')
    expect(maisPertoDeSubir([{ pontos_faltantes: null }])).toBeNull()
  })
})
