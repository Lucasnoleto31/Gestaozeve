import { describe, expect, it } from 'vitest'
import { bankingPorMes, gruposDasLinhas, lerBankingDelta, lerBankingGravado, somarBanking } from './banking'
import type { AbaPlanilha } from './fechamento'

// A planilha "Artur Fonseca_DW_<mês>.xlsx" como o navegador a entrega (uma matriz por aba, sem linhas em branco)
const CAB = ['Data Receita', 'Conta', 'Cliente', 'Código Assessor', 'Assessor Principal', 'Categoria', 'Produto', 'Ativo', 'Código/CNPJ', 'Tipo Receita', 'Receita Bruta', 'Receita Líquida', 'Comissão']
const cartao = (data: string, conta: string, cliente: string, v: number) => [data, conta, cliente, '4110508', 'ASSESSOR', 'FEE TRANSACIONAL', 'CARTAO DE CREDITO', 'CARTAO DE CREDITO PF', 'CARTAO DE CREDITO BLACK', 'FEE', v, v, v]
const saldo = (data: string, conta: string, cliente: string, v: number) => [data, conta, cliente, '4110508', 'ASSESSOR', 'SALDO REMUNERADO', 'SALDO REMUNERADO TRANSACIONAL', 'SALDO REMUNERADO TRANSACIONAL', 'SALDO REMUNERADO TRANSACIONAL', 'Accrual', v, v, v]
const rodape = (rotulo: string, v: number) => [null, null, null, null, null, null, null, null, null, null, null, rotulo, v]
const BLOCO_CARTAO = [CAB, cartao('31/10/2026', '004030666', 'CLIENTE A', 0.4538), cartao('31/10/2026', '003660758', 'CLIENTE B', 1.4942), cartao('31/10/2026', '001979924', 'CLIENTE C', 0.2631), rodape('Comissão total', 2.2111), rodape('Comissão Artur', 0.66333)]
const BLOCO_SALDO = [CAB, saldo('13/10/2026', '002433115', 'CLIENTE D', 0.2), saldo('23/10/2026', '001979924', 'CLIENTE C', 0.1), saldo('07/10/2026', '001979924', 'CLIENTE C', 0.07122), rodape('Comissão total', 0.37122), rodape('Comissão Artur', 0.18561)]
const QUADRO = [
  ['DELTA WEALTH'],
  ['Produto', 'Comissão Assessor', 'Alíquota de Imposto 15%', 'Comissão Liquida'],
  ['Banking/PME', 0.66333, 0.0994995, 0.5638305],
  ['Saldo Remunerado', 0.18561, 0.0278415, 0.1577685],
  ['Comissão Total', null, null, 0.721599],
]
const planilha = (...linhas: unknown[][][]): AbaPlanilha[] => [{ nome: 'Artur Fonseca', linhas: linhas.flat() }]
const ok = (r: ReturnType<typeof lerBankingDelta>) => { if (!r.ok) throw new Error(r.erro); return r }

describe('lerBankingDelta', () => {
  it('lê os dois blocos, a parte do escritório de cada um e o imposto do quadro', () => {
    const r = ok(lerBankingDelta(planilha(BLOCO_CARTAO, BLOCO_SALDO, QUADRO)))
    expect(r.mes).toBe('2026-10-01')
    expect(r.avisos).toEqual([])
    expect(r.grupos.map(g => g.grupo)).toEqual(['Banking/PME', 'Saldo Remunerado'])
    expect(r.grupos[0]).toMatchObject({ linhas: 3, clientes: 3, bruta: 2.2111, comissao: 2.2111, pctEscritorio: 30, parte: 0.66333, impostoPct: 15 })
    expect(r.grupos[0].imposto).toBeCloseTo(0.0994995, 5)
    expect(r.grupos[0].liquida).toBeCloseTo(0.5638305, 5)
    expect(r.grupos[1]).toMatchObject({ linhas: 3, clientes: 2, comissao: 0.37122, pctEscritorio: 50, parte: 0.18561, impostoPct: 15 })
    expect(r.grupos[1].liquida).toBeCloseTo(0.1577685, 5)
    expect(r.total).toMatchObject({ linhas: 6, clientes: 4, comissao: 2.58232, parte: 0.84894 })
    expect(r.total.imposto).toBeCloseTo(0.127341, 5)
    expect(r.total.liquida).toBeCloseTo(0.721599, 5)
  })
  it('cada linha leva o grupo, a data em ISO e os valores', () => {
    const r = ok(lerBankingDelta(planilha(BLOCO_CARTAO, BLOCO_SALDO, QUADRO)))
    expect(r.itens).toHaveLength(6)
    expect(r.itens[0]).toEqual({ grupo: 'Banking/PME', data: '2026-10-31', conta: '004030666', cliente: 'CLIENTE A', categoria: 'FEE TRANSACIONAL', produto: 'CARTAO DE CREDITO', ativo: 'CARTAO DE CREDITO PF', tipo: 'FEE', bruta: 0.4538, liquida: 0.4538, comissao: 0.4538 })
    expect(r.itens[5]).toMatchObject({ grupo: 'Saldo Remunerado', data: '2026-10-07', tipo: 'Accrual', comissao: 0.07122 })
  })
  it('sem o quadro, o grupo ganha o nome da categoria e a líquida fica igual à parte do escritório, com aviso', () => {
    const r = ok(lerBankingDelta(planilha(BLOCO_CARTAO, BLOCO_SALDO)))
    expect(r.grupos.map(g => g.grupo)).toEqual(['Fee Transacional', 'Saldo Remunerado'])
    expect(r.grupos[0]).toMatchObject({ pctEscritorio: 30, parte: 0.66333, impostoPct: 0, imposto: 0, liquida: 0.66333 })
    expect(r.avisos.filter(a => a.includes('imposto'))).toHaveLength(2)
  })
  it('sem a linha "Comissão <assessor>", pega a parte do escritório do quadro pela ordem dos blocos', () => {
    const semRodape = (b: unknown[][]) => b.filter(l => l[11] !== 'Comissão Artur')
    const r = ok(lerBankingDelta(planilha(semRodape(BLOCO_CARTAO), semRodape(BLOCO_SALDO), QUADRO)))
    expect(r.grupos.map(g => [g.grupo, g.pctEscritorio, g.parte])).toEqual([['Banking/PME', 30, 0.66333], ['Saldo Remunerado', 50, 0.18561]])
    expect(r.avisos).toEqual([])
  })
  it('sem rodapé e sem quadro considera a comissão inteira e avisa', () => {
    const r = ok(lerBankingDelta(planilha(BLOCO_CARTAO.slice(0, 4))))
    expect(r.grupos[0]).toMatchObject({ pctEscritorio: 100, parte: 2.2111, liquida: 2.2111 })
    expect(r.avisos.some(a => a.includes('parte do escritório'))).toBe(true)
  })
  it('avisa quando a soma das linhas não bate com a "Comissão total" ou a líquida não bate com o quadro', () => {
    const errado = BLOCO_CARTAO.map(l => (l[11] === 'Comissão total' ? rodape('Comissão total', 9.99) : l))
    expect(ok(lerBankingDelta(planilha(errado, BLOCO_SALDO, QUADRO))).avisos.some(a => a.includes('Comissão total'))).toBe(true)
    const quadroErrado = QUADRO.map(l => (l[0] === 'Comissão Total' ? ['Comissão Total', null, null, 5] : l))
    expect(ok(lerBankingDelta(planilha(BLOCO_CARTAO, BLOCO_SALDO, quadroErrado))).avisos.some(a => a.includes('não bate com a "Comissão Total" do quadro'))).toBe(true)
  })
  it('linha de outro mês fica de fora, com aviso, e a parte do escritório acompanha', () => {
    const comNovembro = [...BLOCO_CARTAO.slice(0, 4), cartao('02/11/2026', '001', 'CLIENTE Z', 1), rodape('Comissão total', 3.2111), rodape('Comissão Artur', 0.96333)]
    const r = ok(lerBankingDelta(planilha(comNovembro)))
    expect(r.mes).toBe('2026-10-01')
    expect(r.itens).toHaveLength(3)
    expect(r.grupos[0]).toMatchObject({ comissao: 2.2111, pctEscritorio: 30, parte: 0.66333 })
    expect(r.avisos[0]).toContain('1 linha de outro mês')
  })
  it('recusa a planilha do fechamento de renda variável e a que não tem receita', () => {
    const rv = [CAB, ['31/10/2026', '1', 'CLIENTE A', '', '', 'RENDA VARIAVEL', 'BMF', 'WINZ26', '', 'Corretagem', 10, 9, 7]]
    const r1 = lerBankingDelta(planilha(rv))
    expect(r1.ok).toBe(false)
    expect(!r1.ok && r1.erro).toContain('renda variável')
    const r2 = lerBankingDelta(planilha([['qualquer', 'coisa']]))
    expect(!r2.ok && r2.erro).toContain('Não achei linhas de receita')
  })
})

describe('o que fica gravado', () => {
  const lido = ok(lerBankingDelta(planilha(BLOCO_CARTAO, BLOCO_SALDO, QUADRO)))
  it('refaz os grupos a partir das linhas e dos percentuais', () => {
    const grupos = gruposDasLinhas(lido.itens, lido.grupos.map(g => ({ grupo: g.grupo, pctEscritorio: g.pctEscritorio, impostoPct: g.impostoPct })))
    expect(grupos).toEqual(lido.grupos)
    expect(somarBanking(grupos, lido.itens)).toEqual(lido.total)
    expect(gruposDasLinhas(lido.itens, [{ grupo: 'Inexistente', pctEscritorio: 30, impostoPct: 15 }])).toEqual([])
  })
  it('lê de volta o que gravou e ignora o que não é um mês de Banking', () => {
    const gravado = JSON.parse(JSON.stringify({ mes: lido.mes, origem: 'Artur Fonseca_DW_Outubro 26.xlsx', grupos: lido.grupos, total: lido.total, itens: lido.itens }))
    const de = lerBankingGravado(gravado)
    expect(de).toMatchObject({ mes: '2026-10-01', origem: 'Artur Fonseca_DW_Outubro 26.xlsx' })
    expect(de?.grupos).toEqual(lido.grupos)
    expect(de?.total).toEqual(lido.total)
    expect(de?.itens).toHaveLength(6)
    expect(lerBankingGravado(null)).toBeNull()
    expect(lerBankingGravado({ mes: 'out/26', grupos: [] })).toBeNull()
    expect(lerBankingGravado({ mes: '2026-10-01' })).toBeNull()
  })
  it('fica com um registro por mês: o primeiro da lista', () => {
    const a = lerBankingGravado({ mes: '2026-10-01', origem: 'nova', grupos: lido.grupos })!
    const b = lerBankingGravado({ mes: '2026-10-01', origem: 'velha', grupos: [] })!
    const c = lerBankingGravado({ mes: '2026-09-01', origem: 'set', grupos: [] })!
    const m = bankingPorMes([a, b, c])
    expect([...m.keys()]).toEqual(['2026-10-01', '2026-09-01'])
    expect(m.get('2026-10-01')?.origem).toBe('nova')
  })
})
