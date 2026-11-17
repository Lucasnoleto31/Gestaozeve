import { describe, expect, it } from 'vitest'
import {
  depoisDoPlano, emVigor, erroDaSoma, erroDoFormulario, listaDoMes, mesesDoFormulario, planoDeGravacao, resumoDaLista,
  type ParceiroDoCliente,
} from './parceirosCliente'

const NOV = '2026-11-01'
const linha = (x: Partial<ParceiroDoCliente>): ParceiroDoCliente => ({ id: 'a', cliente_id: 'c1', corretora: 'GENIAL', parceiro: 'Fabio Ferron', pct: 25, desde: '2026-09-01', ate: null, ...x })

describe('vigência da linha', () => {
  it('vale do mês de início em diante, até o mês final quando há', () => {
    expect(emVigor({ desde: '2026-09-01', ate: null }, '2026-08-01')).toBe(false)
    expect(emVigor({ desde: '2026-09-01', ate: null }, '2026-09-01')).toBe(true)
    expect(emVigor({ desde: '2026-09-01', ate: null }, '2027-03-01')).toBe(true)
    expect(emVigor({ desde: '2026-09-01', ate: '2026-10-01' }, '2026-10-01')).toBe(true)
    expect(emVigor({ desde: '2026-09-01', ate: '2026-10-01' }, NOV)).toBe(false)
  })
})

describe('listaDoMes', () => {
  const linhas = [
    linha({ id: '1', cliente_id: 'c1', parceiro: 'Fabio Ferron', pct: 25 }),
    linha({ id: '2', cliente_id: 'c1', parceiro: 'Yallon', pct: 15 }),
    linha({ id: '3', cliente_id: 'c1', parceiro: 'Atual Capital', pct: 10, desde: NOV }),
    linha({ id: '4', cliente_id: 'c2', parceiro: 'Yallon', pct: 40, ate: '2026-10-01' }),
  ]
  it('diz quem tem lista no mês, a soma de cada cliente e o percentual do parceiro pedido', () => {
    const out = listaDoMes(linhas, '2026-10-01', 'yallon')
    expect([...out.comLista].sort()).toEqual(['c1', 'c2'])
    expect(out.soma.get('c1')).toBe(40)
    expect(out.doParceiro.get('c1')).toBe(15)
    expect(out.doParceiro.get('c2')).toBe(40)
  })
  it('linha encerrada sai e linha que começou entra', () => {
    const nov = listaDoMes(linhas, NOV, 'Atual Capital')
    expect([...nov.comLista]).toEqual(['c1'])
    expect(nov.soma.get('c1')).toBe(50)
    expect(nov.doParceiro.get('c1')).toBe(10)
  })
  it('resume a lista do cliente no mês, do maior percentual para o menor', () => {
    expect(resumoDaLista(linhas.filter(l => l.cliente_id === 'c1'), NOV)).toBe('Fabio Ferron 25 % · Yallon 15 % · Atual Capital 10 %')
    expect(resumoDaLista(linhas.filter(l => l.cliente_id === 'c2'), NOV)).toBe('')
  })
})

describe('planoDeGravacao', () => {
  const VAZIO = { inserir: [], atualizar: [], apagar: [] }
  it('parceiro novo entra a partir do mês escolhido', () => {
    expect(planoDeGravacao([], [{ parceiro: ' Yallon ', pct: 15, desde: NOV }], [], NOV)).toEqual({ ...VAZIO, inserir: [{ parceiro: 'Yallon', pct: 15, desde: NOV }] })
  })
  it('nada mudou: nada a gravar', () => {
    expect(planoDeGravacao([linha({})], [{ parceiro: 'FABIO FERRON', pct: 25, desde: '2026-09-01' }], [], NOV)).toEqual(VAZIO)
  })
  it('mesmo começo e outro percentual: corrige a linha', () => {
    expect(planoDeGravacao([linha({})], [{ parceiro: 'Fabio Ferron', pct: 30, desde: '2026-09-01' }], [], NOV)).toEqual({ ...VAZIO, atualizar: [{ id: 'a', pct: 30 }] })
  })
  it('percentual novo a partir de um mês: a linha antiga termina no mês anterior e entra outra', () => {
    const existentes = [linha({})]
    const plano = planoDeGravacao(existentes, [{ parceiro: 'Fabio Ferron', pct: 30, desde: NOV }], [], NOV)
    expect(plano).toEqual({ inserir: [{ parceiro: 'Fabio Ferron', pct: 30, desde: NOV }], atualizar: [{ id: 'a', ate: '2026-10-01' }], apagar: [] })
    expect(depoisDoPlano(existentes, plano)).toEqual([
      { parceiro: 'Fabio Ferron', pct: 25, desde: '2026-09-01', ate: '2026-10-01' },
      { parceiro: 'Fabio Ferron', pct: 30, desde: NOV, ate: null },
    ])
  })
  it('parceiro tirado: a linha que já valeu em mês fechado termina no mês passado', () => {
    expect(planoDeGravacao([linha({})], [], [], NOV)).toEqual({ ...VAZIO, atualizar: [{ id: 'a', ate: '2026-10-01' }] })
  })
  it('parceiro tirado no mesmo mês em que entrou: a linha é apagada', () => {
    expect(planoDeGravacao([linha({ desde: NOV })], [], [], NOV)).toEqual({ ...VAZIO, apagar: ['a'] })
  })
  it('começo puxado para trás substitui o que começava depois', () => {
    const existentes = [linha({ id: 'velha', pct: 20, desde: '2026-07-01', ate: '2026-10-01' }), linha({ id: 'nova', pct: 30, desde: NOV })]
    const plano = planoDeGravacao(existentes, [{ parceiro: 'Fabio Ferron', pct: 25, desde: '2026-09-01' }], [], NOV)
    expect(plano).toEqual({ inserir: [{ parceiro: 'Fabio Ferron', pct: 25, desde: '2026-09-01' }], atualizar: [{ id: 'velha', ate: '2026-08-01' }], apagar: ['nova'] })
  })
  it('apagar de vez só vale para linha já encerrada', () => {
    const existentes = [linha({ id: 'encerrada', ate: '2026-10-01' }), linha({ id: 'aberta', parceiro: 'Yallon', desde: NOV })]
    const plano = planoDeGravacao(existentes, [{ parceiro: 'Yallon', pct: 25, desde: NOV }], ['encerrada', 'aberta', 'outra'], NOV)
    expect(plano).toEqual({ ...VAZIO, apagar: ['encerrada'] })
  })
  it('parceiro que volta depois de encerrado ganha uma linha nova e o histórico fica', () => {
    const existentes = [linha({ id: 'antiga', ate: '2026-10-01' })]
    const plano = planoDeGravacao(existentes, [{ parceiro: 'Fabio Ferron', pct: 10, desde: NOV }], [], NOV)
    expect(plano).toEqual({ ...VAZIO, inserir: [{ parceiro: 'Fabio Ferron', pct: 10, desde: NOV }] })
  })
  it('cada parceiro é tratado em separado', () => {
    const existentes = [linha({ id: 'f' }), linha({ id: 'y', parceiro: 'Yallon', pct: 15 })]
    const plano = planoDeGravacao(existentes, [{ parceiro: 'Yallon', pct: 15, desde: '2026-09-01' }, { parceiro: 'Atual Capital', pct: 10, desde: NOV }], [], NOV)
    expect(plano).toEqual({ inserir: [{ parceiro: 'Atual Capital', pct: 10, desde: NOV }], atualizar: [{ id: 'f', ate: '2026-10-01' }], apagar: [] })
  })
})

describe('soma dos percentuais', () => {
  it('aceita até 100 % em cada mês', () => {
    expect(erroDaSoma([{ pct: 60, desde: '2026-09-01', ate: null }, { pct: 40, desde: NOV, ate: null }])).toBeNull()
    expect(erroDaSoma([])).toBeNull()
  })
  it('avisa o mês em que passa de 100 %', () => {
    expect(erroDaSoma([{ pct: 60, desde: '2026-09-01', ate: null }, { pct: 50, desde: NOV, ate: null }])).toBe('A soma dos percentuais passa de 100 % em nov/26: dá 110 %.')
  })
  it('linha encerrada não soma depois do fim', () => {
    expect(erroDaSoma([{ pct: 60, desde: '2026-09-01', ate: '2026-10-01' }, { pct: 50, desde: NOV, ate: null }])).toBeNull()
  })
})

describe('erroDoFormulario', () => {
  const PERMITIDOS = ['Atual Capital', 'Fabio Ferron', 'Yallon']
  it('lista em ordem passa', () => {
    expect(erroDoFormulario([{ parceiro: 'fabio ferron', pct: 25, desde: NOV }, { parceiro: 'Yallon', pct: 12.5, desde: '2026-09-01' }], NOV, PERMITIDOS)).toBeNull()
    expect(erroDoFormulario([], NOV, PERMITIDOS)).toBeNull()
  })
  it('recusa parceiro vazio, sem cadastro ou repetido', () => {
    expect(erroDoFormulario([{ parceiro: ' ', pct: 25, desde: NOV }], NOV, PERMITIDOS)).toContain('Escolha o parceiro')
    expect(erroDoFormulario([{ parceiro: 'hero', pct: 25, desde: NOV }], NOV, PERMITIDOS)).toContain('não tem participação cadastrada')
    expect(erroDoFormulario([{ parceiro: 'Yallon', pct: 25, desde: NOV }, { parceiro: 'YALLON', pct: 10, desde: NOV }], NOV, PERMITIDOS)).toContain('duas vezes')
  })
  it('recusa percentual fora de 0 a 100 ou com mais de duas casas, e começo inválido ou no futuro', () => {
    expect(erroDoFormulario([{ parceiro: 'Yallon', pct: 0, desde: NOV }], NOV, PERMITIDOS)).toContain('entre 0 e 100')
    expect(erroDoFormulario([{ parceiro: 'Yallon', pct: 100.5, desde: NOV }], NOV, PERMITIDOS)).toContain('entre 0 e 100')
    expect(erroDoFormulario([{ parceiro: 'Yallon', pct: Number.NaN, desde: NOV }], NOV, PERMITIDOS)).toContain('entre 0 e 100')
    expect(erroDoFormulario([{ parceiro: 'Yallon', pct: 12.345, desde: NOV }], NOV, PERMITIDOS)).toContain('duas casas')
    expect(erroDoFormulario([{ parceiro: 'Yallon', pct: 10, desde: '2026-11-15' }], NOV, PERMITIDOS)).toContain('desde quando')
    expect(erroDoFormulario([{ parceiro: 'Yallon', pct: 10, desde: '2026-12-01' }], NOV, PERMITIDOS)).toContain('ainda não chegou')
  })
  it('oferece o mês corrente e os 24 anteriores', () => {
    const meses = mesesDoFormulario(NOV)
    expect(meses).toHaveLength(25)
    expect(meses[0]).toBe(NOV)
    expect(meses[24]).toBe('2024-11-01')
  })
})
