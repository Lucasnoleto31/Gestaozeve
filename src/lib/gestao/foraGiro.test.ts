import { describe, expect, it } from 'vitest'
import { foraDoGiro, lerQuadroFechamento, type ContextoForaGiro } from './foraGiro'
import { lerExtraGravado } from './banking'
import type { AbaPlanilha, LinhaFechamento } from './fechamento'

// O quadro de resumo da aba do escritório, como o navegador o entrega (colunas C a F da planilha)
const linhaQuadro = (rotulo: string, liquida?: number, comissao?: number, parte?: number) => [null, null, rotulo, liquida ?? null, comissao ?? null, parte ?? null]
const QUADRO = [
  linhaQuadro('Rótulos de Linha').map((v, i) => (i === 3 ? 'Soma de Receita Líquida' : i === 4 ? 'Soma de Comissão' : i === 5 ? 'Comissão Artur' : v)),
  linhaQuadro('CRIPTOMOEDA', 0.33, 0.33),                 // categoria: sem a parte do escritório
  linhaQuadro('CRIPTOMOEDA', 0.33, 0.33, 0.165),
  linhaQuadro('RENDA FIXA - PASSIVO RF', 51.59, 51.59),
  linhaQuadro('CDB', 51.59, 51.59, 25.795),
  linhaQuadro('RENDA VARIAVEL', 22171.84, 17737.47),
  linhaQuadro('ALUGUEL', 2.75, 2.2, 1.54),
  linhaQuadro('BMF', 21957.46, 17565.97, 12296.179),
  linhaQuadro('Comissão Total', undefined, undefined, 12447.79),
  linhaQuadro('Alíquota de Imposto 16,5%', undefined, undefined, 2053.89),
  linhaQuadro('Comissão líquida', undefined, undefined, 10393.9),
]
const aba = (linhas: unknown[][], nome = 'Artur Fonseca'): AbaPlanilha => ({ nome, linhas })

const linha = (x: Partial<LinhaFechamento>): LinhaFechamento => ({
  aba: 'Artur Fonseca', linha: 2, data: '2026-10-15', conta: '000123', conta_sz: '123', cliente: 'CLIENTE A', categoria: 'RENDA FIXA - PASSIVO RF', produto: 'CDB', ativo: 'CDB XYZ', tipo: 'Accrual',
  bruta: 10, liquida: 10, comissao: 10, ...x,
})
const ctx = (x: Partial<ContextoForaGiro> = {}): ContextoForaGiro => ({
  contaParaCliente: new Map([['123', 'c1'], ['456', 'c2']]), parceiroDoCliente: new Map([['c2', 'atual capital']]),
  parceiros: [{ nome: 'Atual Capital', pctParceiro: 50, pctEscritorio: 70 }], deltaPct: 30, impostoPct: 16.5,
  quadro: lerQuadroFechamento([aba(QUADRO)]), ...x,
})

describe('lerQuadroFechamento', () => {
  it('lê a parte do escritório por produto e a alíquota de imposto', () => {
    const q = lerQuadroFechamento([aba([['Data Receita', 'Conta'], ['31/10/2026', '1'], ...QUADRO])])
    expect(q.impostoPct).toBe(16.5)
    expect(q.pctPorProduto).toEqual({ CRIPTOMOEDA: 50, CDB: 50, ALUGUEL: 70, BMF: 70 })
  })
  it('sem o quadro devolve vazio', () => {
    expect(lerQuadroFechamento([aba([['Data Receita', 'Conta'], ['31/10/2026', '1']])])).toEqual({ pctPorProduto: {}, impostoPct: null })
  })
  it('o quadro vale mesmo em outra aba e só o primeiro é lido', () => {
    const outro = QUADRO.map(l => (l[2] === 'CDB' ? linhaQuadro('CDB', 1, 100, 10) : l))
    expect(lerQuadroFechamento([aba([['nada']], 'Capa'), aba(QUADRO), aba(outro, 'Outra')]).pctPorProduto.CDB).toBe(50)
  })
})

describe('foraDoGiro', () => {
  it('agrupa por produto com a parte do escritório do quadro e o imposto da planilha', () => {
    const r = foraDoGiro([
      linha({ produto: 'CDB', comissao: 40 }), linha({ produto: 'CDB', comissao: 11.59, conta: '000999', conta_sz: '999', cliente: 'SEM CADASTRO' }),
      linha({ produto: 'ALUGUEL', categoria: 'RENDA VARIAVEL', tipo: 'Comissão', bruta: 3.04, liquida: 2.75, comissao: 2.2 }),
      linha({ produto: 'BMF', categoria: 'RENDA VARIAVEL', comissao: 999 }),              // giro: fora daqui
      linha({ produto: 'CDB', data: '2026-09-30', comissao: 500 }),                        // outro mês
    ], '2026-10-01', ctx())
    expect(r.avisos).toEqual([])
    expect(r.grupos.map(g => g.grupo)).toEqual(['CDB', 'ALUGUEL'])
    expect(r.grupos[0]).toMatchObject({ linhas: 2, clientes: 2, comissao: 51.59, pctEscritorio: 50, parte: 25.795, impostoPct: 16.5 })
    expect(r.grupos[0].liquida).toBeCloseTo(21.538825, 5)
    expect(r.grupos[1]).toMatchObject({ linhas: 1, comissao: 2.2, pctEscritorio: 70, parte: 1.54 })
    expect(r.total).toMatchObject({ linhas: 3, comissao: 53.79, parte: 27.335 })
    expect(r.total.liquida).toBeCloseTo(27.335 * 0.835, 5)
    expect(r.repasse).toBe(0)
    expect(r.itens).toHaveLength(3)
    expect(r.itens[0]).toMatchObject({ grupo: 'CDB', data: '2026-10-15', conta: '000123', produto: 'CDB', comissao: 40 })
    expect(r.percentuais).toEqual([{ grupo: 'CDB', pctEscritorio: 50, impostoPct: 16.5 }, { grupo: 'ALUGUEL', pctEscritorio: 70, impostoPct: 16.5 }])
  })
  it('sem o quadro usa o que sobra da Delta na renda variável e 50 % no resto, com o imposto do parâmetro, e avisa', () => {
    const r = foraDoGiro([
      linha({ produto: 'SALDO REMUNERADO DIGITAL', categoria: 'SALDO REMUNERADO', comissao: 8 }),
      linha({ produto: 'ALUGUEL', categoria: 'RENDA VARIAVEL', comissao: 2 }),
    ], '2026-10-01', ctx({ quadro: { pctPorProduto: {}, impostoPct: null } }))
    expect(r.grupos.map(g => [g.grupo, g.pctEscritorio, g.impostoPct])).toEqual([['SALDO REMUNERADO DIGITAL', 50, 16.5], ['ALUGUEL', 70, 16.5]])
    expect(r.avisos).toHaveLength(2)
    expect(r.avisos[0]).toContain('ALUGUEL, SALDO REMUNERADO DIGITAL')
    expect(r.avisos[1]).toContain('alíquota')
  })
  it('cliente de parceiro com participação segue a divisão do parceiro e gera repasse', () => {
    const r = foraDoGiro([
      linha({ produto: 'SALDO REMUNERADO DIGITAL', categoria: 'SALDO REMUNERADO', comissao: 2, conta: '000456', conta_sz: '456', cliente: 'CLIENTE DO PARCEIRO' }),
      linha({ produto: 'SALDO REMUNERADO DIGITAL', categoria: 'SALDO REMUNERADO', comissao: 8 }),
    ], '2026-10-01', ctx({ quadro: { pctPorProduto: { 'SALDO REMUNERADO DIGITAL': 50 }, impostoPct: 16.5 } }))
    const doParceiro = r.grupos.find(g => g.parceiro)!
    // 2,00 → imposto 16,5 % → 1,67 → parceiro 50 % = 0,835 · escritório 70 % do resto = 0,5845
    expect(doParceiro).toMatchObject({ grupo: 'SALDO REMUNERADO DIGITAL · Atual Capital', parceiro: 'Atual Capital', pctParceiro: 50, pctEscritorio: 35, impostoPct: 16.5, comissao: 2, parte: 0.7, parteParceiro: 0.835 })
    expect(doParceiro.liquida).toBeCloseTo(0.5845, 6)
    expect(r.grupos.find(g => !g.parceiro)).toMatchObject({ grupo: 'SALDO REMUNERADO DIGITAL', pctEscritorio: 50, comissao: 8 })
    expect(r.repasse).toBe(0.835)
    expect(r.total.comissao).toBe(10)
  })
  it('parceiro na ficha que não tem participação na comissão conta como cliente direto', () => {
    const r = foraDoGiro([linha({ conta: '000456', conta_sz: '456' })], '2026-10-01', ctx({ parceiroDoCliente: new Map([['c2', 'Direto']]) }))
    expect(r.grupos).toHaveLength(1)
    expect(r.grupos[0]).toMatchObject({ grupo: 'CDB', pctEscritorio: 50 })
    expect(r.grupos[0].parceiro).toBeUndefined()
  })
  it('mês sem produto fora do giro devolve zeros', () => {
    const r = foraDoGiro([linha({ produto: 'BMF', categoria: 'RENDA VARIAVEL' })], '2026-10-01', ctx())
    expect(r).toMatchObject({ itens: [], grupos: [], repasse: 0, avisos: [] })
    expect(r.total).toMatchObject({ linhas: 0, comissao: 0, liquida: 0 })
  })
  it('o que é gravado em detalhes.fora_giro volta com o parceiro; detalhes.banking continua sendo Banking', () => {
    const r = foraDoGiro([linha({ conta: '000456', conta_sz: '456', comissao: 2 })], '2026-10-01', ctx())
    const gravado = JSON.parse(JSON.stringify({ fora_giro: { mes: '2026-10-01', origem: 'Artur Fonseca_Outubro 26.xlsx', grupos: r.grupos, total: r.total, itens: r.itens } }))
    const lido = lerExtraGravado(gravado)
    expect(lido?.fonte).toBe('fora_giro')
    expect(lido?.dados.grupos[0]).toMatchObject({ parceiro: 'Atual Capital', pctParceiro: 50, parteParceiro: 0.835 })
    expect(lerExtraGravado({ banking: { mes: '2026-10-01', grupos: [] } })?.fonte).toBe('banking')
    expect(lerExtraGravado({ fechamento: {} })).toBeNull()
    expect(lerExtraGravado(null)).toBeNull()
  })
})
