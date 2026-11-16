import { describe, expect, it } from 'vitest'
import { contaComRepasse, contaDaReceita, somaAte, type DadosContaRepasse } from './contaDoMes'
import { calcularRepasse, type ConfigRepasse } from './btg'
import type { TotaisBanking } from './banking'

// Os parâmetros do BTG em out/26: comissão de 80 % no fechamento, Delta 30 %, imposto 16,5 %, Atual Capital 50 / 70
const CFG: ConfigRepasse = {
  faixas: [{ de: 0, pct: 75 }, { de: 100000, pct: 80 }], pctMes: { '2026-10': 80 }, parceiros: [{ nome: 'Atual Capital', pctParceiro: 50, pctEscritorio: 70 }, { nome: 'Fabio PTAX', pctParceiro: 50, pctEscritorio: 70 }],
  impostosEmbutidosPct: 9.65, impostoBtgPct: 6.65, deltaPct: 30, impostoPct: 16.5, participacoes: [{ nome: 'Lucas', pct: 50 }, { nome: 'Artur', pct: 50 }],
}
const extra = (comissao: number, liquida: number): TotaisBanking => ({ linhas: 1, clientes: 1, bruta: comissao, comissao, parte: liquida / 0.835, imposto: liquida / 0.835 - liquida, liquida })
const dados = (x: Partial<DadosContaRepasse> = {}): DadosContaRepasse => ({
  corretora: 'BTG', repasse: calcularRepasse(22727.41, CFG, '2026-10-01', { 'Atual Capital': 1107.12 }), pctDoFechamento: true, deltaPct: 30, impostoPct: 16.5,
  fora: extra(67.11, 28.16), banking: extra(2.58, 0.72), participacoes: CFG.participacoes, comissaoParceiros: 1315, ...x,
})
const de = (linhas: ReturnType<typeof contaComRepasse>, rotulo: string) => linhas.find(l => l.rotulo.startsWith(rotulo))

describe('contaComRepasse', () => {
  it('lê de cima para baixo: comissão, o que sai, líquido do giro, o que entra por fora e o total', () => {
    const linhas = contaComRepasse(dados())
    expect(linhas.map(l => `${l.tipo}:${l.rotulo}`)).toEqual([
      'titulo:Giro (lotes e zeragem)', 'base:Receita do giro', 'entrada:Comissão que o BTG paga', 'menos:Delta e terceiros', 'menos:Imposto', 'menos:Parceiros, a repassar',
      'subtotal:Líquido do giro', 'titulo:Fora dos lotes', 'mais:Fora do giro', 'mais:Banking', 'total:Comissão líquida do escritório', 'parte:Lucas (50 %)', 'parte:Artur (50 %)',
      'info:Comissão de parceiros por conta',
    ])
  })
  it('as contas fecham: comissão menos as saídas dá o líquido do giro; com o que entra por fora dá o total; os sócios somam o total', () => {
    const d = dados()
    const linhas = contaComRepasse(d)
    const liquido = de(linhas, 'Líquido do giro')!.valor!, total = de(linhas, 'Comissão líquida do escritório')!.valor!
    expect(somaAte(linhas, l => l.tipo === 'subtotal')).toBeCloseTo(liquido, 6)
    expect(liquido).toBeCloseTo(d.repasse.liquido, 6)
    expect(somaAte(linhas, l => l.tipo === 'total')).toBeCloseTo(total, 6)
    expect(total).toBeCloseTo(d.repasse.liquido + 28.16 + 0.72, 6)
    expect(linhas.filter(l => l.tipo === 'parte').reduce((s, l) => s + l.valor!, 0)).toBeCloseTo(total, 6)
  })
  it('explica cada passo: percentual do fechamento, Delta, imposto e quem recebe repasse (só parceiro com receita no mês)', () => {
    const linhas = contaComRepasse(dados())
    expect(de(linhas, 'Receita do giro')).toMatchObject({ valor: 22727.41, nota: 'lotes × tarifa + zeragem' })
    expect(de(linhas, 'Comissão que o BTG paga')!.nota).toMatch(/^80 % da receita líquida do BTG \(R\$\s23\.48\d,\d\d\), percentual do fechamento$/)
    expect(de(linhas, 'Delta e terceiros')!.nota).toBe('30 % da comissão dos clientes diretos e a parte de terceiros nos clientes de parceiros')
    expect(de(linhas, 'Imposto')!.nota).toBe('16,5 % sobre a comissão do escritório')
    expect(de(linhas, 'Parceiros, a repassar')!.nota).toBe('a parte de Atual Capital na comissão dos clientes deles')
    expect(de(linhas, 'Fora do giro')!.nota).toContain('comissão de R$')
  })
  it('sem parceiros, sem fora do giro e sem Banking a conta fica só com o giro', () => {
    const linhas = contaComRepasse(dados({ repasse: calcularRepasse(18020, CFG, '2026-11-01', {}), pctDoFechamento: false, fora: null, banking: null, comissaoParceiros: 0 }))
    // sem nada fora dos lotes não há subtotal: o líquido do giro já é a comissão líquida
    expect(linhas.map(l => l.rotulo)).toEqual(['Giro (lotes e zeragem)', 'Receita do giro', 'Comissão que o BTG paga', 'Delta', 'Imposto', 'Comissão líquida do escritório', 'Lucas (50 %)', 'Artur (50 %)'])
    expect(de(linhas, 'Comissão que o BTG paga')!.nota).toContain('75 % da receita líquida do BTG')
    expect(de(linhas, 'Comissão que o BTG paga')!.nota).toContain('pelas faixas')
    expect(de(linhas, 'Delta')!.nota).toBe('30 % da comissão dos clientes diretos')
    expect(somaAte(linhas, l => l.tipo === 'total')).toBeCloseTo(de(linhas, 'Comissão líquida do escritório')!.valor!, 6)
  })
  it('só Banking gravado: o bloco "Fora dos lotes" tem uma linha', () => {
    const linhas = contaComRepasse(dados({ fora: null }))
    expect(linhas.filter(l => l.tipo === 'mais').map(l => l.rotulo)).toEqual(['Banking'])
  })
  it('dois parceiros com receita aparecem os dois na nota', () => {
    const linhas = contaComRepasse(dados({ repasse: calcularRepasse(22727.41, CFG, '2026-10-01', { 'Atual Capital': 1000, 'Fabio PTAX': 500 }) }))
    expect(de(linhas, 'Parceiros, a repassar')!.nota).toBe('a parte de Atual Capital e Fabio PTAX na comissão dos clientes deles')
    expect(somaAte(linhas, l => l.tipo === 'subtotal')).toBeCloseTo(de(linhas, 'Líquido do giro')!.valor!, 6)
  })
})

describe('contaDaReceita', () => {
  it('corretora com incentivo: giro, incentivo e a receita total', () => {
    const linhas = contaDaReceita({ corretora: 'Genial', corretagem: 85801, zeragem: 71080, fixa: 0, receita: 156881, incentivo: 39600, clientesComFaixa: 54, comissaoParceiros: 200 })
    expect(linhas.map(l => `${l.tipo}:${l.rotulo}`)).toEqual([
      'titulo:Giro (lotes e zeragem)', 'mais:Corretagem', 'mais:Zeragem', 'subtotal:Receita do giro', 'titulo:Incentivo', 'mais:Incentivo Genial', 'total:Receita total', 'info:Comissão de parceiros por conta',
    ])
    expect(linhas.find(l => l.tipo === 'total')!.valor).toBe(196481)
    expect(somaAte(linhas, l => l.tipo === 'total')).toBe(196481)
    expect(linhas.find(l => l.rotulo === 'Incentivo Genial')!.nota).toBe('pontos por cliente · 54 clientes com faixa')
  })
  it('sem incentivo por pontos o total é a receita do giro; a corretagem fixa só aparece quando existe', () => {
    const linhas = contaDaReceita({ corretora: 'BTG', corretagem: 100, zeragem: 50, fixa: 9, receita: 159, incentivo: null, clientesComFaixa: 0, comissaoParceiros: 0 })
    expect(linhas.map(l => l.rotulo)).toEqual(['Giro (lotes e zeragem)', 'Corretagem', 'Zeragem', 'Corretagem fixa', 'Receita do giro'])
    expect(linhas.at(-1)).toMatchObject({ tipo: 'total', valor: 159 })
  })
})
