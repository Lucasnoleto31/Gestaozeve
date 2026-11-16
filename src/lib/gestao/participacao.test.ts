import { describe, expect, it } from 'vitest'
import {
  lerParceirosReceita, medirLote, nomesComRegra, planilhaReceita, receitaDoMes, regraDoMes, regrasDoParceiro, somarMeses, textoDaRegra, textoParceirosReceita,
  type LoteBruto, type RegraReceita,
} from './participacao'

const FABIO: RegraReceita = { nome: 'Fabio PTAX', pctCorretagem: 100, pctZeragem: 100, pctIncentivo: 50, desde: '2026-11-01' }
const lote = (x: Partial<LoteBruto>): LoteBruto => ({
  data: '2026-11-10', chave_incentivo: 'DOC:1', cliente_id: 'c1', conta: '100', nome_cliente: 'CLIENTE UM',
  qtd: 100, tarifa: 0.25, zeragem_rs: 0, multiplicador: 1, zeragem: false, posicao: false, acoes: false, ...x,
})
const inc = (chave: string, pontos: number, valor: number, x: { nome?: string; cliente_id?: string | null; faixa_min?: number; pontos_faltantes?: number | null } = {}) =>
  ({ chave, nome: x.nome ?? '', cliente_id: x.cliente_id ?? null, pontos, faixa_min: x.faixa_min ?? 0, valor_incentivo: valor, pontos_faltantes: x.pontos_faltantes ?? null })

describe('lerParceirosReceita', () => {
  it('lê nome, os três percentuais e o mês de início', () => {
    expect(lerParceirosReceita('Fabio PTAX:100:100:50:2026-11')).toEqual([FABIO])
  })
  it('aceita vírgula no percentual, o mês como MM/AAAA e mais de um parceiro', () => {
    expect(lerParceirosReceita(' Fabio PTAX : 65,35 : 65,35 : 50 : 11/2026 ; Outro:10:0:0:2027-01;')).toEqual([
      { nome: 'Fabio PTAX', pctCorretagem: 65.35, pctZeragem: 65.35, pctIncentivo: 50, desde: '2026-11-01' },
      { nome: 'Outro', pctCorretagem: 10, pctZeragem: 0, pctIncentivo: 0, desde: '2027-01-01' },
    ])
  })
  it('o mesmo parceiro pode ter outra regra a partir de outro mês', () => {
    expect(lerParceirosReceita('Fabio PTAX:100:100:50:2026-11;fabio ptax:100:100:60:2027-01')).toHaveLength(2)
  })
  it('devolve vazio quando falta campo, o percentual passa de 100, o mês é inválido ou a regra se repete', () => {
    expect(lerParceirosReceita('')).toEqual([])
    expect(lerParceirosReceita('Fabio PTAX:100:100:50')).toEqual([])
    expect(lerParceirosReceita('Fabio PTAX:100:100:150:2026-11')).toEqual([])
    expect(lerParceirosReceita('Fabio PTAX:100:100:50:2026-13')).toEqual([])
    expect(lerParceirosReceita(':100:100:50:2026-11')).toEqual([])
    expect(lerParceirosReceita('Fabio PTAX:100:100:50:2026-11;FABIO PTAX:90:90:50:2026-11')).toEqual([])
  })
  it('grava na forma canônica, por parceiro e por mês de início', () => {
    const regras = lerParceirosReceita('Zeta:1:2:3:2027-01;Fabio PTAX:100:100:60:01/2027;Fabio PTAX:100:100:50:2026-11')
    expect(textoParceirosReceita(regras)).toBe('Fabio PTAX:100:100:50:2026-11;Fabio PTAX:100:100:60:2027-01;Zeta:1:2:3:2027-01')
    expect(lerParceirosReceita(textoParceirosReceita(regras))).toHaveLength(3)
  })
})

describe('regras do parceiro', () => {
  const regras = lerParceirosReceita('Fabio PTAX:100:100:60:2027-01;Outro:10:10:10:2026-01;Fabio PTAX:100:100:50:2026-11')
  it('junta as regras do parceiro sem ligar para acento e caixa, da mais antiga para a mais nova', () => {
    expect(regrasDoParceiro(regras, 'fábio ptax').map(r => r.desde)).toEqual(['2026-11-01', '2027-01-01'])
    expect(regrasDoParceiro(regras, 'Ninguém')).toEqual([])
  })
  it('em cada mês vale a regra de início mais recente; antes da primeira, nenhuma', () => {
    const dele = regrasDoParceiro(regras, 'Fabio PTAX')
    expect(regraDoMes(dele, '2026-10-01')).toBeNull()
    expect(regraDoMes(dele, '2026-11-01')?.pctIncentivo).toBe(50)
    expect(regraDoMes(dele, '2026-12-01')?.pctIncentivo).toBe(50)
    expect(regraDoMes(dele, '2027-03-01')?.pctIncentivo).toBe(60)
  })
  it('lista cada nome uma vez e descreve a regra por extenso', () => {
    expect(nomesComRegra(regras).sort()).toEqual(['Fabio PTAX', 'Outro'])
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
  it('a regra do Fabio PTAX: metade da corretagem, da zeragem e do incentivo (R$ 200 de incentivo viram R$ 100)', () => {
    const lotes = [lote({ qtd: 1154, multiplicador: 2 }), lote({ zeragem: true, qtd: 10, zeragem_rs: 20.75 })].map(medirLote)
    const m = receitaDoMes('2026-11-01', lotes, [inc('DOC:1', 2308, 200)], lerParceirosReceita('Fabio PTAX:50:50:50:2026-11')[0])
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
