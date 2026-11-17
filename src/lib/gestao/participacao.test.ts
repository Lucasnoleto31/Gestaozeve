import { describe, expect, it } from 'vitest'
import {
  inicioDasRegras, lerParceirosReceita, medirBaseBtg, medirLote, nomesComRegra, pctComum, planilhaReceita, receitaDoMes, regraDoMes, regrasComFichas, regrasDoParceiro, repassePorMes,
  somarMeses, textoDaRegra, textoDaRegraCom, textoParceirosReceita,
  type LoteBruto, type RegraReceita,
} from './participacao'
import { calcularRepasse } from './btg'

const FABIO: RegraReceita = { nome: 'Fabio Ferron', pctCorretagem: 100, pctZeragem: 100, pctIncentivo: 50, desde: '2026-11-01' }
const lote = (x: Partial<LoteBruto>): LoteBruto => ({
  data: '2026-11-10', chave_incentivo: 'DOC:1', cliente_id: 'c1', conta: '100', nome_cliente: 'CLIENTE UM',
  qtd: 100, tarifa: 0.25, zeragem_rs: 0, multiplicador: 1, zeragem: false, posicao: false, acoes: false, ...x,
})
const inc = (chave: string, pontos: number, valor: number, x: { nome?: string; cliente_id?: string | null; faixa_min?: number; pontos_faltantes?: number | null } = {}) =>
  ({ chave, nome: x.nome ?? '', cliente_id: x.cliente_id ?? null, pontos, faixa_min: x.faixa_min ?? 0, valor_incentivo: valor, pontos_faltantes: x.pontos_faltantes ?? null })

describe('lerParceirosReceita', () => {
  it('lê nome, os três percentuais e o mês de início', () => {
    expect(lerParceirosReceita('Fabio Ferron:100:100:50:2026-11')).toEqual([FABIO])
  })
  it('aceita vírgula no percentual, o mês como MM/AAAA e mais de um parceiro', () => {
    expect(lerParceirosReceita(' Fabio Ferron : 65,35 : 65,35 : 50 : 11/2026 ; Outro:10:0:0:2027-01;')).toEqual([
      { nome: 'Fabio Ferron', pctCorretagem: 65.35, pctZeragem: 65.35, pctIncentivo: 50, desde: '2026-11-01' },
      { nome: 'Outro', pctCorretagem: 10, pctZeragem: 0, pctIncentivo: 0, desde: '2027-01-01' },
    ])
  })
  it('o mesmo parceiro pode ter outra regra a partir de outro mês', () => {
    expect(lerParceirosReceita('Fabio Ferron:100:100:50:2026-11;fabio ferron:100:100:60:2027-01')).toHaveLength(2)
  })
  it('devolve vazio quando falta campo, o percentual passa de 100, o mês é inválido ou a regra se repete', () => {
    expect(lerParceirosReceita('')).toEqual([])
    expect(lerParceirosReceita('Fabio Ferron:100:100:50')).toEqual([])
    expect(lerParceirosReceita('Fabio Ferron:100:100:150:2026-11')).toEqual([])
    expect(lerParceirosReceita('Fabio Ferron:100:100:50:2026-13')).toEqual([])
    expect(lerParceirosReceita(':100:100:50:2026-11')).toEqual([])
    expect(lerParceirosReceita('Fabio Ferron:100:100:50:2026-11;FABIO FERRON:90:90:50:2026-11')).toEqual([])
  })
  it('grava na forma canônica, por parceiro e por mês de início', () => {
    const regras = lerParceirosReceita('Zeta:1:2:3:2027-01;Fabio Ferron:100:100:60:01/2027;Fabio Ferron:100:100:50:2026-11')
    expect(textoParceirosReceita(regras)).toBe('Fabio Ferron:100:100:50:2026-11;Fabio Ferron:100:100:60:2027-01;Zeta:1:2:3:2027-01')
    expect(lerParceirosReceita(textoParceirosReceita(regras))).toHaveLength(3)
  })
})

describe('regras do parceiro', () => {
  const regras = lerParceirosReceita('Fabio Ferron:100:100:60:2027-01;Outro:10:10:10:2026-01;Fabio Ferron:100:100:50:2026-11')
  it('junta as regras do parceiro sem ligar para acento e caixa, da mais antiga para a mais nova', () => {
    expect(regrasDoParceiro(regras, 'fábio ferron').map(r => r.desde)).toEqual(['2026-11-01', '2027-01-01'])
    expect(regrasDoParceiro(regras, 'Ninguém')).toEqual([])
  })
  it('em cada mês vale a regra de início mais recente; antes da primeira, nenhuma', () => {
    const dele = regrasDoParceiro(regras, 'Fabio Ferron')
    expect(regraDoMes(dele, '2026-10-01')).toBeNull()
    expect(regraDoMes(dele, '2026-11-01')?.pctIncentivo).toBe(50)
    expect(regraDoMes(dele, '2026-12-01')?.pctIncentivo).toBe(50)
    expect(regraDoMes(dele, '2027-03-01')?.pctIncentivo).toBe(60)
  })
  it('lista cada nome uma vez e descreve a regra por extenso', () => {
    expect(nomesComRegra(regras).sort()).toEqual(['Fabio Ferron', 'Outro'])
    expect(textoDaRegra(FABIO)).toBe('100 % da corretagem, 100 % da zeragem e 50 % do incentivo')
    expect(textoDaRegra({ ...FABIO, pctCorretagem: 65.35 })).toContain('65,35 % da corretagem')
  })
})

describe('medirLote', () => {
  it('lote operado rende lotes × tarifa e pontua pelo multiplicador', () => {
    expect(medirLote(lote({ qtd: 200, tarifa: 0.25, multiplicador: 2 }))).toMatchObject({ mes: '2026-11-01', chave: 'DOC:1', lotes: 200, zerados: 0, corretagem: 50, zeragem: 0, pontos: 400 })
  })
  it('zeragem rende contratos × R$ da zeragem, sem lote nem ponto', () => {
    expect(medirLote(lote({ zeragem: true, qtd: 10, zeragem_rs: 20.75, tarifa: 0.25 }))).toMatchObject({ lotes: 0, zerados: 10, corretagem: 0, zeragem: 207.5, pontos: 0 })
  })
  it('ação e posição rendem a corretagem fixa da linha e não contam como lote', () => {
    expect(medirLote(lote({ acoes: true, qtd: 300, tarifa: 9 }))).toMatchObject({ lotes: 0, corretagem: 9, pontos: 0 })
    expect(medirLote(lote({ posicao: true, qtd: 5, tarifa: 0 }))).toMatchObject({ lotes: 0, corretagem: 0, pontos: 0 })
  })
  it('sem chave de incentivo usa a conta', () => {
    expect(medirLote(lote({ chave_incentivo: null, conta: '777' })).chave).toBe('CONTA:777')
  })
})

describe('receitaDoMes', () => {
  it('a regra do Fabio Ferron: metade da corretagem, da zeragem e do incentivo (R$ 200 de incentivo viram R$ 100)', () => {
    const lotes = [lote({ qtd: 1154, multiplicador: 2 }), lote({ zeragem: true, qtd: 10, zeragem_rs: 20.75 })].map(medirLote)
    const m = receitaDoMes('2026-11-01', lotes, [inc('DOC:1', 2308, 200)], lerParceirosReceita('Fabio Ferron:50:50:50:2026-11')[0])
    expect(m.clientes[0]).toMatchObject({ corretagem: 288.5, zeragem: 207.5, incentivo: 200, parteCorretagem: 144.25, parteZeragem: 103.75, parteIncentivo: 100, total: 348 })
    expect(m).toMatchObject({ corretagem: 288.5, zeragem: 207.5, incentivo: 200, parteCorretagem: 144.25, parteZeragem: 103.75, parteIncentivo: 100, total: 348 })
  })
  it('regra de 100 % da corretagem e da zeragem e 50 % do incentivo', () => {
    const lotes = [lote({ qtd: 1154, multiplicador: 2 }), lote({ zeragem: true, qtd: 10, zeragem_rs: 20.75 })].map(medirLote)
    const m = receitaDoMes('2026-11-01', lotes, [inc('DOC:1', 2308, 200, { nome: 'Cliente Um', cliente_id: 'c1', faixa_min: 1000, pontos_faltantes: 2692 })], FABIO)
    expect(m.clientes).toHaveLength(1)
    expect(m.clientes[0]).toMatchObject({
      nome: 'Cliente Um', cliente_id: 'c1', lotes: 1154, zerados: 10, corretagem: 288.5, zeragem: 207.5, pontos: 2308, pontosCliente: 2308,
      faixaMin: 1000, pontosFaltantes: 2692, incentivoCliente: 200, incentivo: 200, parteCorretagem: 288.5, parteZeragem: 207.5, parteIncentivo: 100, total: 596,
    })
    expect(m).toMatchObject({ mes: '2026-11-01', ativos: 1, comFaixa: 1, lotes: 1154, zerados: 10, corretagem: 288.5, zeragem: 207.5, incentivo: 200, parteIncentivo: 100, total: 596 })
  })
  it('soma vários clientes, ordena pelo que rendem ao parceiro e ignora lançamentos de outro mês', () => {
    const lotes = [
      lote({ chave_incentivo: 'DOC:1', cliente_id: 'c1', qtd: 400 }),                                        // R$ 100, sem faixa
      lote({ chave_incentivo: 'DOC:2', cliente_id: 'c2', nome_cliente: 'DOIS', qtd: 4000 }),                 // R$ 1.000 + faixa de R$ 200
      lote({ chave_incentivo: 'DOC:2', cliente_id: 'c2', data: '2026-10-30', qtd: 9999 }),                   // outubro: fora
    ].map(medirLote)
    const m = receitaDoMes('2026-11-01', lotes, [inc('DOC:1', 400, 0), inc('DOC:2', 4000, 200, { nome: 'Dois' })], FABIO)
    expect(m.clientes.map(c => c.nome)).toEqual(['Dois', 'CLIENTE UM'])
    expect(m.clientes.map(c => c.total)).toEqual([1100, 100])
    expect(m).toMatchObject({ ativos: 2, comFaixa: 1, lotes: 4400, corretagem: 1100, incentivo: 200, parteCorretagem: 1100, parteIncentivo: 100, total: 1200 })
  })
  it('aplica os percentuais da regra a cada parte', () => {
    const lotes = [lote({ qtd: 1000 }), lote({ zeragem: true, qtd: 4, zeragem_rs: 25 })].map(medirLote)
    const m = receitaDoMes('2026-11-01', lotes, [inc('DOC:1', 1000, 500)], { ...FABIO, pctCorretagem: 65.35, pctZeragem: 50, pctIncentivo: 30 })
    expect(m.clientes[0]).toMatchObject({ corretagem: 250, zeragem: 100, incentivo: 500, parteCorretagem: 163.38, parteZeragem: 50, parteIncentivo: 150, total: 363.38 })
  })
  it('cliente que também operou fora do código leva só a fração do incentivo dos pontos dele no código', () => {
    const m = receitaDoMes('2026-11-01', [medirLote(lote({ qtd: 3000 }))], [inc('DOC:1', 12000, 1000)], FABIO)   // 3.000 de 12.000 pontos
    expect(m.clientes[0]).toMatchObject({ pontos: 3000, pontosCliente: 12000, incentivoCliente: 1000, incentivo: 250, parteIncentivo: 125 })
  })
  it('sem linha de incentivo (só zeragem no mês) o cliente entra com o nome do relatório e incentivo zero', () => {
    const m = receitaDoMes('2026-11-01', [medirLote(lote({ zeragem: true, qtd: 2, zeragem_rs: 24.5, nome_cliente: 'SO ZERAGEM' }))], [], FABIO)
    expect(m.clientes[0]).toMatchObject({ nome: 'SO ZERAGEM', lotes: 0, zeragem: 49, incentivo: 0, total: 49 })
    expect(m).toMatchObject({ ativos: 0, comFaixa: 0, total: 49 })
  })
  it('fecha cada cliente em centavos e o total é a soma das linhas', () => {
    const lotes = [1, 2, 3].map(n => medirLote(lote({ chave_incentivo: `DOC:${n}`, cliente_id: `c${n}`, qtd: 333, tarifa: 0.1 })))   // 33,30 cada
    const m = receitaDoMes('2026-11-01', lotes, [], { ...FABIO, pctCorretagem: 33.33 })
    expect(m.clientes.map(c => c.parteCorretagem)).toEqual([11.1, 11.1, 11.1])
    expect(m.parteCorretagem).toBe(33.3)
    expect(m.total).toBe(m.clientes.reduce((s, c) => s + c.total, 0))
  })
  it('mês sem lançamento devolve zeros', () => {
    expect(receitaDoMes('2026-11-01', [], [], FABIO)).toMatchObject({ clientes: [], ativos: 0, total: 0 })
  })
})

describe('totais e planilha', () => {
  const lotes = [lote({ qtd: 4000 }), lote({ chave_incentivo: 'DOC:2', cliente_id: 'c2', nome_cliente: 'DOIS', qtd: 400 })].map(medirLote)
  const nov = receitaDoMes('2026-11-01', lotes, [inc('DOC:1', 4000, 200, { nome: 'Um' })], FABIO)
  it('soma meses', () => {
    const t = somarMeses([nov, nov])
    expect(t).toMatchObject({ ativos: 4, lotes: 8800, corretagem: 2200, incentivo: 400, parteIncentivo: 200, total: 2400 })
  })
  it('monta cabeçalho, uma linha por cliente e o total', () => {
    const m = planilhaReceita(nov.clientes)
    expect(m).toHaveLength(4)
    expect(m[0][0]).toBe('Cliente')
    expect(m[1]).toEqual(['Um', 4000, 0, 1000, 0, 4000, 200, 1000, 0, 100, 1100])
    expect(m[3]).toEqual(['Total · 2 clientes', 4400, 0, 1100, 0, null, 200, 1100, 0, 100, 1200])
  })
  it('inclui a corretora quando pedido', () => {
    const m = planilhaReceita(nov.clientes.map(c => ({ ...c, corretora: 'Genial' })), true)
    expect(m[0][1]).toBe('Corretora')
    expect(m[1][1]).toBe('Genial')
    expect(m[3][1]).toBeNull()
  })
})

describe('repassePorMes (participação na comissão do BTG)', () => {
  // receita → ÷ (1 − 9,65 %) → − 6,65 % → comissão (% do fechamento ou faixas) → imposto 16,5 % → 50 % do parceiro
  const CFG = {
    faixas: [{ de: 0, pct: 75 }, { de: 100000, pct: 80 }], pctMes: { '2026-10': 80 }, parceiros: [{ nome: 'Atual Capital', pctParceiro: 50, pctEscritorio: 70 }],
    impostosEmbutidosPct: 9.65, impostoBtgPct: 6.65, deltaPct: 30, impostoPct: 16.5, participacoes: [],
  }
  const total = { '2026-09-01': 20000, '2026-10-01': 22727.41, '2026-11-01': 18000 }
  it('dá a parte do parceiro em cada mês com receita dos clientes dele, com o percentual do fechamento quando há', () => {
    const meses = repassePorMes(CFG, 'Atual Capital', total, { '2026-10-01': 1107.35, '2026-11-01': 1707.4, '2026-09-01': 0 })
    expect(meses.map(m => m.mes)).toEqual(['2026-10-01', '2026-11-01'])
    expect(meses[0]).toMatchObject({ receita: 1107.35, comissao: 915.29, imposto: 151.02, parte: 382.14, pct: 80, fechado: true })
    expect(meses[1]).toMatchObject({ receita: 1707.4, comissao: 1323.07, parte: 552.38, pct: 75, fechado: false })
  })
  it('só conta a partir do mês de início, quando informado', () => {
    const meses = repassePorMes(CFG, 'Atual Capital', total, { '2026-10-01': 1107.35, '2026-11-01': 1707.4 }, '2026-11-01')
    expect(meses.map(m => m.mes)).toEqual(['2026-11-01'])
  })
  it('parceiro que não está na configuração ou sem receita não gera mês', () => {
    expect(repassePorMes(CFG, 'Outro', total, { '2026-10-01': 500 })).toEqual([])
    expect(repassePorMes(CFG, 'Atual Capital', total, {})).toEqual([])
    expect(repassePorMes(CFG, 'Atual Capital', {}, { '2026-10-01': 500 })).toEqual([])
  })
})

// ── S61 · vários parceiros por cliente, cada um com o seu percentual ───────────
describe('receitaDoMes com lista de parceiros na ficha', () => {
  const REGRA: RegraReceita = { nome: 'Fabio Ferron', pctCorretagem: 50, pctZeragem: 50, pctIncentivo: 50, desde: '2026-11-01' }
  // c1 opera no código do Fabio; c2 está em outro código nosso, com o Fabio a 25 % na ficha
  const doCodigo = [medirLote(lote({ qtd: 400 }))]
  const deFora = [
    medirLote(lote({ cliente_id: 'c2', chave_incentivo: 'DOC:2', nome_cliente: 'CLIENTE DOIS', qtd: 1000 })),
    medirLote(lote({ cliente_id: 'c2', chave_incentivo: 'DOC:2', nome_cliente: 'CLIENTE DOIS', zeragem: true, qtd: 10, zeragem_rs: 4 })),
  ]
  const fichas = (pct: number) => ({ comLista: new Set(['c2']), doParceiro: new Map([['c2', pct]]), lotes: deFora })

  it('cliente de outro código entra com o percentual da ficha sobre a corretagem, a zeragem e o incentivo', () => {
    const m = receitaDoMes('2026-11-01', doCodigo, [inc('DOC:2', 1000, 200)], REGRA, fichas(25))
    expect(m.clientes.find(c => c.cliente_id === 'c2')).toMatchObject({ corretagem: 250, zeragem: 40, incentivo: 200, parteCorretagem: 62.5, parteZeragem: 10, parteIncentivo: 50, total: 122.5, pctFicha: 25 })
    const c1 = m.clientes.find(c => c.cliente_id === 'c1')
    expect(c1).toMatchObject({ corretagem: 100, parteCorretagem: 50, total: 50 })
    expect(c1?.pctFicha).toBeUndefined()
    expect(m.total).toBe(172.5)
  })
  it('o incentivo só entra pela ficha quando a regra do parceiro tem incentivo', () => {
    const m = receitaDoMes('2026-11-01', [], [inc('DOC:2', 1000, 200)], { ...REGRA, pctIncentivo: 0 }, fichas(25))
    expect(m.clientes[0]).toMatchObject({ parteCorretagem: 62.5, parteZeragem: 10, parteIncentivo: 0, total: 72.5 })
  })
  it('cliente do código que tem lista na ficha segue só a lista', () => {
    // a ficha de c1 só tem outro parceiro: nada para o Fabio, mesmo c1 estando no código dele
    const semEle = receitaDoMes('2026-11-01', doCodigo, [], REGRA, { comLista: new Set(['c1']), doParceiro: new Map(), lotes: [] })
    expect(semEle.clientes).toEqual([])
    expect(semEle.total).toBe(0)
    // com o Fabio na lista a 30 %, valem os 30 % (e não os 50 % do código)
    const comEle = receitaDoMes('2026-11-01', doCodigo, [], REGRA, { comLista: new Set(['c1']), doParceiro: new Map([['c1', 30]]), lotes: doCodigo })
    expect(comEle.clientes).toHaveLength(1)
    expect(comEle.clientes[0]).toMatchObject({ parteCorretagem: 30, total: 30, pctFicha: 30 })
  })
  it('parceiro que só entra pela lista das fichas não recebe nada dos códigos nem do incentivo', () => {
    const soFicha: RegraReceita = { nome: 'Atual Capital', pctCorretagem: 0, pctZeragem: 0, pctIncentivo: 0, desde: '2026-11-01', soFicha: true }
    const m = receitaDoMes('2026-11-01', doCodigo, [inc('DOC:2', 1000, 200)], soFicha, fichas(10))
    expect(m.clientes).toHaveLength(1)
    expect(m.clientes[0]).toMatchObject({ cliente_id: 'c2', parteCorretagem: 25, parteZeragem: 4, parteIncentivo: 0, total: 29, pctFicha: 10 })
  })
  it('sem lista nada muda', () => {
    expect(receitaDoMes('2026-11-01', doCodigo, [], REGRA, null)).toEqual(receitaDoMes('2026-11-01', doCodigo, [], REGRA))
    expect(receitaDoMes('2026-11-01', doCodigo, [], REGRA, { comLista: new Set(), doParceiro: new Map(), lotes: [] })).toEqual(receitaDoMes('2026-11-01', doCodigo, [], REGRA))
  })
  it('o percentual comum some quando algum cliente entra com outro percentual, e a planilha ganha a coluna', () => {
    const m = receitaDoMes('2026-11-01', doCodigo, [], REGRA, fichas(25))
    expect(pctComum([REGRA], 'pctCorretagem', [])).toBe('50 %')
    expect(pctComum([REGRA], 'pctCorretagem', m.clientes)).toBe('')
    expect(pctComum([REGRA], 'pctIncentivo', m.clientes)).toBe('')
    const planilha = planilhaReceita(m.clientes)
    expect(planilha[0][1]).toBe('Percentual pela ficha (%)')
    expect(planilha.map(l => l.length)).toEqual([planilha[0].length, planilha[0].length, planilha[0].length, planilha[0].length])
    expect(planilhaReceita(receitaDoMes('2026-11-01', doCodigo, [], REGRA).clientes)[0][1]).toBe('Lotes no mês')
  })
})

describe('regrasComFichas', () => {
  const regras = lerParceirosReceita('Fabio Ferron:50:50:50:2026-11')
  it('sem linha de ficha devolve as mesmas regras', () => {
    expect(regrasComFichas(regras, [])).toBe(regras)
  })
  it('parceiro que só está em fichas ganha uma regra só-ficha desde o primeiro mês da lista', () => {
    const r = regrasComFichas(regras, [{ parceiro: 'Atual Capital', desde: '2026-12-01' }, { parceiro: 'Atual Capital', desde: '2026-11-01' }])
    expect(r).toHaveLength(2)
    expect(r[1]).toEqual({ nome: 'Atual Capital', pctCorretagem: 0, pctZeragem: 0, pctIncentivo: 0, desde: '2026-11-01', soFicha: true })
    expect(nomesComRegra(r).sort()).toEqual(['Atual Capital', 'Fabio Ferron'])
  })
  it('quem já tem regra só ganha a só-ficha quando a lista começa antes dela', () => {
    expect(regrasComFichas(regras, [{ parceiro: 'Fabio Ferron', desde: '2026-11-01' }])).toHaveLength(1)
    const dele = regrasDoParceiro(regrasComFichas(regras, [{ parceiro: 'FABIO FERRON', desde: '2026-09-01' }]), 'Fabio Ferron')
    expect(regraDoMes(dele, '2026-10-01')?.soFicha).toBe(true)
    expect(regraDoMes(dele, '2026-11-01')?.soFicha).toBeUndefined()
    expect(inicioDasRegras(dele)).toBe('2026-11-01')
  })
  it('a regra só-ficha não vai para o parâmetro e tem a própria frase', () => {
    const r = regrasComFichas(regras, [{ parceiro: 'Atual Capital', desde: '2026-11-01' }])
    expect(textoParceirosReceita(r)).toBe('Fabio Ferron:50:50:50:2026-11')
    expect(textoDaRegraCom(r[0], 'dos clientes dele na Genial')).toBe('50 % da corretagem, 50 % da zeragem e 50 % do incentivo dos clientes dele na Genial')
    expect(textoDaRegraCom(r[1], 'dos clientes dele na Genial')).toContain('na ficha de cada cliente')
    expect(inicioDasRegras([r[1]])).toBeNull()
  })
})

describe('participação na comissão do BTG com lista de parceiros na ficha', () => {
  const CFG = {
    faixas: [{ de: 0, pct: 75 }, { de: 100000, pct: 80 }], pctMes: { '2026-10': 80 },
    parceiros: [{ nome: 'Atual Capital', pctParceiro: 50, pctEscritorio: 70 }, { nome: 'Fabio Ferron', pctParceiro: 50, pctEscritorio: 70 }, { nome: 'Yallon', pctParceiro: 50, pctEscritorio: 70 }],
    impostosEmbutidosPct: 9.65, impostoBtgPct: 6.65, deltaPct: 30, impostoPct: 16.5, participacoes: [],
  }
  const total = { '2026-10-01': 22727.41 }
  // comissão líquida de imposto que o BTG paga por R$ 1.000 de receita de um cliente, em out/26
  const liquida = (1000 / (1 - 0.0965)) * (1 - 0.0665) * 0.8 * (1 - 0.165)

  it('sem ficha, a base é a receita da carteira com o percentual geral', () => {
    expect(medirBaseBtg({ padrao: 1107.35, fichas: [] }, 50)).toEqual({ receita: 1107.35, alocada: 1107.35, pct: 50 })
    expect(medirBaseBtg({ padrao: 0, fichas: [] }, 50)).toEqual({ receita: 0, alocada: 0, pct: 50 })
  })
  it('cliente só deste parceiro, a 25 %: a receita inteira no livro dele, com 25 %', () => {
    expect(medirBaseBtg({ padrao: 0, fichas: [{ receita: 1000, pct: 25, soma: 25 }] }, 50)).toEqual({ receita: 1000, alocada: 1000, pct: 25 })
  })
  it('mistura clientes sem lista (percentual geral) com clientes da ficha', () => {
    const m = medirBaseBtg({ padrao: 1000, fichas: [{ receita: 500, pct: 20, soma: 20 }] }, 50)
    expect(m.receita).toBe(1500)
    expect(m.alocada).toBe(1500)
    expect(m.pct).toBeCloseTo(40, 9)   // (1.000 × 50 % + 500 × 20 %) ÷ 1.500
  })
  it('cliente dividido entre três parceiros entra uma vez só na cadeia e cada um leva o seu percentual', () => {
    // o exemplo do Lucas: Fabio Ferron 25 %, Yallon 15 % e Atual Capital 10 % do que o cliente gerar
    const base = (pct: number) => medirBaseBtg({ padrao: 0, fichas: [{ receita: 1000, pct, soma: 50 }] }, 50)
    const f = base(25), y = base(15), a = base(10)
    expect(f.alocada + y.alocada + a.alocada).toBeCloseTo(1000, 9)
    const r = calcularRepasse(22727.41, CFG, '2026-10-01', { 'Fabio Ferron': f.alocada, Yallon: y.alocada, 'Atual Capital': a.alocada }, { 'Fabio Ferron': f.pct, Yallon: y.pct, 'Atual Capital': a.pct })
    const parte = (nome: string) => r.parceiros.find(p => p.nome === nome)?.parceiro ?? 0
    expect(parte('Fabio Ferron')).toBeCloseTo(liquida * 0.25, 6)
    expect(parte('Yallon')).toBeCloseTo(liquida * 0.15, 6)
    expect(parte('Atual Capital')).toBeCloseTo(liquida * 0.1, 6)
    // a comissão do cliente sai uma vez só dos diretos; do que sobra (50 %), o escritório fica com 70 %
    expect(r.parceiros.reduce((s, p) => s + p.liquido, 0)).toBeCloseTo(liquida, 6)
    expect(r.parceiros.reduce((s, p) => s + p.escritorio, 0)).toBeCloseTo(liquida * 0.5 * 0.7, 6)
    // sem a lista, com o cliente só da Atual Capital a 50 %, o escritório ficava com o mesmo
    const antes = calcularRepasse(22727.41, CFG, '2026-10-01', { 'Atual Capital': 1000 })
    expect(antes.parceiros[0].escritorio).toBeCloseTo(liquida * 0.5 * 0.7, 6)
    expect(r.liquido).toBeCloseTo(antes.liquido, 6)
  })
  it('sem o percentual por parceiro, calcularRepasse segue o geral do parâmetro', () => {
    const a = calcularRepasse(22727.41, CFG, '2026-10-01', { 'Atual Capital': 1107.35 })
    expect(calcularRepasse(22727.41, CFG, '2026-10-01', { 'Atual Capital': 1107.35 }, null)).toEqual(a)
    expect(calcularRepasse(22727.41, CFG, '2026-10-01', { 'Atual Capital': 1107.35 }, { 'Atual Capital': 50 })).toEqual(a)
    expect(calcularRepasse(22727.41, CFG, '2026-10-01', { 'Atual Capital': 1107.35 }, { 'Atual Capital': 25 }).parceiros[0].parceiro).toBeCloseTo(a.parceiros[0].parceiro / 2, 9)
  })
  it('repassePorMes aceita a base separada e dá o mesmo de antes quando ninguém tem lista', () => {
    const antes = repassePorMes(CFG, 'Atual Capital', total, { '2026-10-01': 1107.35 })
    expect(repassePorMes(CFG, 'Atual Capital', total, { '2026-10-01': { padrao: 1107.35, fichas: [] } })).toEqual(antes)
    expect(antes[0].parte).toBe(382.14)
  })
  it('a receita mostrada ao parceiro é a dos clientes dele por inteiro, e a parte é o percentual dele', () => {
    const meses = repassePorMes(CFG, 'Yallon', total, { '2026-10-01': { padrao: 0, fichas: [{ receita: 1000, pct: 15, soma: 50 }] } })
    expect(meses).toHaveLength(1)
    expect(meses[0]).toMatchObject({ receita: 1000, parte: 103.53, pct: 80, fechado: true })
  })
  it('a linha da ficha conta mesmo antes do início dos clientes sem lista', () => {
    const meses = repassePorMes(CFG, 'Atual Capital', total, { '2026-10-01': { padrao: 1107.35, fichas: [{ receita: 1000, pct: 10, soma: 10 }] } }, '2026-11-01')
    expect(meses).toHaveLength(1)
    expect(meses[0]).toMatchObject({ receita: 1000, parte: 69.02 })
  })
})
