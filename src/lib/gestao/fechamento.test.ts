import { describe, expect, it } from 'vitest'
import {
  ativoDoSistema, chaveAtivo, cruzarFechamento, escolhasDoPlano, lerFechamentoBtg, pctMesComFechamento,
  type ContaSistema, type LinhaFechamento, type LoteSistema,
} from './fechamento'

const CAB = ['Data Receita', 'Conta', 'Cliente', 'Código Assessor', 'Assessor Principal', 'Categoria', 'Produto', 'Ativo', 'Código/CNPJ', 'Tipo Receita', 'Receita Bruta', 'Receita Líquida', 'Comissão']
const linha = (data: string, conta: string, cliente: string, produto: string, ativo: string, bruta: number) =>
  [data, conta, cliente, '4110508', 'ARTUR', produto === 'BMF' || produto === 'BOLSA' ? 'RENDA VARIAVEL' : 'OUTROS', produto, ativo, ativo, 'Corretagem', bruta, bruta * 0.9335, bruta * 0.9335 * 0.8]

describe('lerFechamentoBtg', () => {
  it('lê as abas, acha o mês e separa RV do resto; o bloco de resumo não entra', () => {
    const r = lerFechamentoBtg([
      { nome: 'Artur Fonseca', linhas: [CAB, linha('01/10/2026', '038427324', 'FELIPE', 'BMF', 'WINFV26', 7.17), linha('02/10/2026', '038427324', 'FELIPE', 'CDB', 'CDB', 10), [null, null, 'Rótulos de Linha', 'Soma'], [null, null, 'BMF', 21957.46]] },
      { nome: 'Zeve', linhas: [CAB, linha('26/10/2026', '039064589', 'LUAN', 'BMF', 'WINFZ26', 0.87), linha('26/09/2026', '039064589', 'LUAN', 'BMF', 'WINFU26', 5)] },
      { nome: 'Capa', linhas: [['Fechamento'], ['Outubro']] },
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.mes).toBe('2026-10-01')
    expect(r.linhas.map(l => [l.aba, l.data, l.conta_sz, l.produto])).toEqual([
      ['Artur Fonseca', '2026-10-01', '38427324', 'BMF'], ['Artur Fonseca', '2026-10-02', '38427324', 'CDB'], ['Zeve', '2026-10-26', '39064589', 'BMF'],
    ])
    expect(r.avisos).toEqual(['Aba "Capa" ignorada: não tem as colunas do fechamento.', '1 linha de outro mês ficou de fora (o fechamento é de 10/2026).'])
    expect(r.resumo.rv.bruta).toBe(8.04)
    expect(r.resumo.foraRv).toEqual([{ produto: 'CDB', linhas: 1, bruta: 10, liquida: 9.34, comissao: 7.47 }])
    expect(r.resumo.pctComissao).toBe(80)
    expect(r.resumo.porAba.map(a => [a.aba, a.linhas])).toEqual([['Artur Fonseca', 2], ['Zeve', 1]])
  })
  it('recusa planilha sem as colunas', () => {
    expect(lerFechamentoBtg([{ nome: 'x', linhas: [['a', 'b'], [1, 2]] }])).toEqual({ ok: false, erro: 'Não achei as colunas do fechamento (Data Receita, Conta, Cliente, Produto, Receita Bruta) em nenhuma aba.' })
  })
})

describe('chaveAtivo / ativoDoSistema', () => {
  it('agrupa futuros pelo radical e ações pelo código', () => {
    expect(chaveAtivo('WINFZ26')).toBe('FUT:WIN')
    expect(chaveAtivo('WINZ26')).toBe('FUT:WIN')
    expect(chaveAtivo('WDOX26')).toBe('FUT:WDO')
    expect(chaveAtivo('PETR4F')).toBe('ACAO:PETR4')
    expect(chaveAtivo('petr4')).toBe('ACAO:PETR4')
    expect(ativoDoSistema('WINFZ26')).toBe('WINZ26')
    expect(ativoDoSistema('WINZ26')).toBe('WINZ26')
  })
})

// ── cruzamento ───────────────────────────────────────────────────────────────
const FATOR = 1 - 0.0965
const CLI = 'c1', CLI2 = 'c2'
const contas: ContaSistema[] = [{ conta: '38427324', cliente_id: CLI }, { conta: '000111', cliente_id: CLI2 }]
const nomes = new Map([[CLI, 'Felipe'], [CLI2, 'Bruno']])
const fl = (data: string, conta: string, bruta: number, ativo = 'WINFV26', produto = 'BMF'): LinhaFechamento =>
  ({ aba: 'Artur Fonseca', linha: 2, data, conta, conta_sz: conta.replace(/^0+/, ''), cliente: 'X', categoria: 'RV', produto, ativo, tipo: 'Corretagem', bruta, liquida: bruta * 0.9335, comissao: bruta * 0.9335 * 0.8 })
const lote = (p: Partial<LoteSistema> & { id: string }): LoteSistema => ({
  data: '2026-10-01', cliente_id: CLI, conta: '38427324', ativo: 'WINV26', qtd: 10, zeragem: false, posicao: false, acoes: false, conta_para_receita: true,
  tarifa: 0.25, tarifa_manual: null, zeragem_rs: 16, ...p,
})
// bruta que o BTG cobra para a receita líquida `liquida` chegar ao sistema
const bruta = (liquida: number) => liquida / FATOR
const cfg = { fator: FATOR }
const MES = '2026-10-01'

describe('cruzarFechamento', () => {
  it('dia que bate não vira caso (inclusive quando a divisão entre WIN e WDO é outra)', () => {
    const p = cruzarFechamento(
      [fl('2026-10-01', '038427324', bruta(2.5)), fl('2026-10-02', '038427324', bruta(3), 'WINFV26'), fl('2026-10-02', '038427324', bruta(2), 'WDOFX26')],
      [lote({ id: 'a' }), lote({ id: 'b', data: '2026-10-02', qtd: 8 }), lote({ id: 'c', data: '2026-10-02', ativo: 'WDOX26', qtd: 12 })],
      contas, nomes, [], cfg, MES)
    expect(p.casos).toEqual([])
    expect(p.totais).toMatchObject({ btg: 7.5, sistema: 7.5, dif: 0 })
  })

  it('dia não pago: lotes a zero; preço diferente: corretagem manual = pago ÷ lotes', () => {
    const p = cruzarFechamento(
      [fl('2026-10-02', '038427324', bruta(9.5))],
      [lote({ id: 'a' }), lote({ id: 'b', data: '2026-10-02' })],
      contas, nomes, [], cfg, MES)
    expect(p.casos.map(c => [c.data, c.btg, c.sistema, c.dif, c.acao.tipo])).toEqual([['2026-10-01', 0, 2.5, -2.5, 'tarifa'], ['2026-10-02', 9.5, 2.5, 7, 'tarifa']])
    expect(p.casos[0].acao).toMatchObject({ itens: [{ id: 'a', tarifa: 0 }], resumo: '10 lotes sem pagamento do BTG: corretagem → 0' })
    expect(p.casos[1].acao).toMatchObject({ itens: [{ id: 'b', tarifa: 0.95 }], resumo: '10 lotes: corretagem 0,25 → 0,95' })
    expect(p.totais).toMatchObject({ aAjustar: 2, aInserir: 0, residuo: 0 })
  })

  it('dia pago sem lançamento: infere os lotes pela corretagem do cadastro ou pelo preço padrão', () => {
    const p = cruzarFechamento(
      [fl('2026-10-05', '038427324', bruta(1)), fl('2026-10-06', '000111', bruta(3.8))],
      [], contas, nomes, [{ cliente_id: CLI, vigencia: '2026-01-01', corretagem: 0.25 }], cfg, MES)
    const de = (cid: string) => p.casos.find(c => c.cliente_id === cid)!.acao
    expect(de(CLI)).toMatchObject({ tipo: 'inserir', lancamento: { cliente_id: CLI, conta: '38427324', data: '2026-10-05', ativo: 'WINV26', tipo: 'futuro', qtd: 4, tarifa_manual: null } })
    expect(de(CLI2)).toMatchObject({ tipo: 'inserir', lancamento: { cliente_id: CLI2, conta: '111', qtd: 4, tarifa_manual: 0.95 } })
    expect(p.casos.map(c => c.cliente)).toEqual(['Bruno', 'Felipe'])   // por nome
    expect(p.totais.aInserir).toBe(2)
  })

  it('quando cadastro e preço padrão dão lotes inteiros, vale o padrão se o cliente o paga em outro dia do mês', () => {
    // 0,19 × 10 = 1,90 e 0,95 × 2 = 1,90: as duas leituras fecham; no dia 02 o cliente já paga 0,95
    const tarifas = [{ cliente_id: CLI, vigencia: '2026-01-01', corretagem: 0.19 }]
    const soCadastro = cruzarFechamento([fl('2026-10-05', '038427324', bruta(1.9))], [], contas, nomes, tarifas, cfg, MES)
    expect(soCadastro.casos[0].acao).toMatchObject({ tipo: 'inserir', lancamento: { qtd: 10, tarifa_manual: null } })
    const comPadrao = cruzarFechamento([fl('2026-10-05', '038427324', bruta(1.9))], [lote({ id: 'p', data: '2026-10-02', tarifa: 0.95, tarifa_manual: 0.95 })], contas, nomes, tarifas, cfg, MES)
    expect(comPadrao.casos.find(c => c.data === '2026-10-05')!.acao).toMatchObject({ tipo: 'inserir', lancamento: { qtd: 2, tarifa_manual: 0.95 } })
  })

  it('zeragem não paga: sem a S60 fica como resíduo; com a S60 a zeragem vai a zero', () => {
    const lotes = [lote({ id: 'n', qtd: 100 }), lote({ id: 'z', zeragem: true, qtd: 10 })]   // 25 + 160 = 185 lançados; BTG pagou 0
    const sem = cruzarFechamento([], lotes, contas, nomes, [], cfg, MES)
    expect(sem.casos[0].acao).toMatchObject({ tipo: 'tarifa', itens: [{ id: 'n', tarifa: 0 }], residuo: 160 })
    expect(sem.totais.residuo).toBe(160)
    const com = cruzarFechamento([], lotes, contas, nomes, [], { ...cfg, zeragemManual: true }, MES)
    expect(com.casos[0].acao).toMatchObject({ tipo: 'tarifa', itens: [{ id: 'n', tarifa: 0 }, { id: 'z', tarifa: 0 }] })
    expect(com.totais.residuo).toBe(0)
    // só a zeragem lançada e nada pago
    const so = cruzarFechamento([], [lote({ id: 'z', zeragem: true, qtd: 10 })], contas, nomes, [], cfg, MES)
    expect(so.casos[0].acao).toMatchObject({ tipo: 'residuo', valor: 160 })
  })

  it('ações em day trade: corretagem fixa paga; conta desconhecida vai para a lista sem cadastro', () => {
    const p = cruzarFechamento(
      [fl('2026-10-03', '038427324', bruta(18), 'PETR4', 'BOLSA'), fl('2026-10-03', '999', 50, 'WINFV26')],
      [lote({ id: 'ac', data: '2026-10-03', ativo: 'PETR4', acoes: true, qtd: 100, tarifa: 9 })],
      contas, nomes, [], cfg, MES)
    expect(p.casos.map(c => [c.ativo, c.acao.tipo])).toEqual([['ACAO:PETR4', 'tarifa']])
    expect(p.casos[0].acao).toMatchObject({ itens: [{ id: 'ac', tarifa: 18 }], resumo: 'ações (day trade): corretagem fixa 9,00 → 18,00' })
    expect(p.semCadastro).toEqual([{ conta: '999', cliente: 'X', linhas: 1, bruta: 50 }])
  })

  it('escolhasDoPlano junta só os casos marcados', () => {
    const p = cruzarFechamento(
      [fl('2026-10-05', '038427324', bruta(1))],
      [lote({ id: 'a' })], contas, nomes, [{ cliente_id: CLI, vigencia: '2026-01-01', corretagem: 0.25 }], cfg, MES)
    const tudo = escolhasDoPlano(p, new Set(p.casos.map(c => c.chave)))
    expect(tudo.updates).toEqual([{ id: 'a', tarifa: 0 }])
    expect(tudo.inserts).toHaveLength(1)
    expect(escolhasDoPlano(p, new Set())).toEqual({ updates: [], inserts: [] })
  })
})

describe('pctMesComFechamento', () => {
  it('grava o mês por cima e mantém os outros em ordem', () => {
    expect(pctMesComFechamento({ '2026-09': 75 }, '2026-10-01', 80.004)).toBe('2026-09:75;2026-10:80')
    expect(pctMesComFechamento({ '2026-10': 75, '2026-08': 70 }, '2026-10-01', 80)).toBe('2026-08:70;2026-10:80')
  })
})
