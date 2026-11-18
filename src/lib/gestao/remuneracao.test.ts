import { describe, expect, it } from 'vitest'
import {
  NIVEIS_PADRAO, REGUA_PADRAO, baseDoMes, chaveMes, contaDaPessoa, donosDaBase, fatorGenial, fatoresBtg, faltaParaSubir, liquidoGenial,
  nivelDaMedia, niveisDaPessoa, permanenciasDoMes, pontosDoMes, valorDoMes, vigente,
  type DadosRemuneracao, type EventoComissao, type TabelaNiveis,
} from './remuneracao'

const ev = (pessoa: string, cliente_id: string, tipo: EventoComissao['tipo'], data: string, corretora = 'GENIAL', valor = 80): EventoComissao =>
  ({ pessoa, cliente_id, nome: `Cliente ${cliente_id}`, corretora, tipo, data, mes_ref: `${data.slice(0, 7)}-01`, valor })

describe('tabela e régua', () => {
  it('a versão em vigor é a mais recente até o mês; antes da primeira, a primeira', () => {
    const t2: TabelaNiveis = { ...NIVEIS_PADRAO, vigencia: '2027-02-01' }
    expect(vigente([t2, NIVEIS_PADRAO], '2026-12-01')).toBe(NIVEIS_PADRAO)
    expect(vigente([t2, NIVEIS_PADRAO], '2027-03-01')).toBe(t2)
    expect(vigente([t2, NIVEIS_PADRAO], '2026-08-01')).toBe(NIVEIS_PADRAO)
  })
  it('o nível de uma média: a partir de 0, 10, 30 e 60 pontos', () => {
    expect(nivelDaMedia(NIVEIS_PADRAO, 0).nivel).toBe(1)
    expect(nivelDaMedia(NIVEIS_PADRAO, 9.99).nivel).toBe(1)
    expect(nivelDaMedia(NIVEIS_PADRAO, 10).nivel).toBe(2)
    expect(nivelDaMedia(NIVEIS_PADRAO, 16.7).nivel).toBe(2)
    expect(nivelDaMedia(NIVEIS_PADRAO, 30).nivel).toBe(3)
    expect(nivelDaMedia(NIVEIS_PADRAO, 75).nivel).toBe(4)
    expect(faltaParaSubir(NIVEIS_PADRAO, 2, 16.7)?.faltam).toBeCloseTo(13.3)
    expect(faltaParaSubir(NIVEIS_PADRAO, 4, 80)).toBeNull()
  })
})

describe('líquido do cliente', () => {
  it('Genial: R$ 0,6427 por R$ 1, mais o incentivo, menos a plataforma e o parceiro', () => {
    expect(fatorGenial(REGUA_PADRAO)).toBeCloseTo(0.6427, 4)
    expect(liquidoGenial({ receita: 1000, lotes: 100, incentivo: 50, parteParceiro: 0 }, REGUA_PADRAO)).toBeCloseTo(642.7 + 50 - 2.1, 1)
    expect(liquidoGenial({ receita: 1000, lotes: 0, incentivo: 0, parteParceiro: 500 }, REGUA_PADRAO)).toBeCloseTo(142.7, 1)
  })
  it('BTG: o direto paga Delta e imposto; o de parceiro paga imposto, a parte dele e a de terceiros', () => {
    const f = fatoresBtg(0.5, { deltaPct: 20, impostoPct: 10, parceiros: [{ nome: 'Atual Capital', pctParceiro: 50, pctEscritorio: 70 }] })
    expect(f.direto).toBeCloseTo(0.5 * 0.8 * 0.9)
    expect(f.parceiros['Atual Capital']).toBeCloseTo(0.5 * 0.9 * 0.5 * 0.7)
  })
})

describe('base ativa', () => {
  it('a conta é de quem fez o último movimento; no mesmo dia a ativação vence a abertura', () => {
    const eventos = [ev('Aikon', 'a', 'abertura', '2026-08-10'), ev('Milena', 'a', 'ativacao', '2026-10-05'), ev('Karen', 'b', 'abertura', '2026-10-02'), ev('Aikon', 'b', 'ativacao', '2026-10-02')]
    const ate_set = donosDaBase(eventos, '2026-09-30')
    expect(ate_set.get('a|GENIAL')?.pessoa).toBe('Aikon')
    expect(ate_set.has('b|GENIAL')).toBe(false)
    const ate_out = donosDaBase(eventos, '2026-10-31')
    expect(ate_out.get('a|GENIAL')?.pessoa).toBe('Milena')
    expect(ate_out.get('b|GENIAL')?.pessoa).toBe('Aikon')
  })
  it('só entra quem girou no mês; bônus cheio nos 12 meses depois do movimento', () => {
    const donos = donosDaBase([ev('Aikon', 'a', 'ativacao', '2025-10-20'), ev('Aikon', 'b', 'ativacao', '2025-12-03'), ev('Aikon', 'c', 'ativacao', '2026-11-03')], '2026-11-30')
    const liquido = new Map([[chaveMes('a', 'GENIAL', '2026-11-01'), 300], [chaveMes('b', 'GENIAL', '2026-11-01'), 200]])
    const base = baseDoMes('Aikon', '2026-11-01', donos, liquido, REGUA_PADRAO)
    expect(base.map(b => [b.cliente_id, b.cheio])).toEqual([['a', false], ['b', true]])   // out/25 → nov/26 = 13 meses; dez/25 = 11
  })
})

describe('pontos e valor', () => {
  it('1 ponto por ativação, por reativação e por R$ 1.000 de base; abertura não pontua', () => {
    const eventos = [ev('Milena', 'x', 'ativacao', '2026-11-04', 'BTG'), ev('Milena', 'y', 'reativacao', '2026-11-05'), ev('Milena', 'z', 'abertura', '2026-11-06')]
    const base = [{ cliente_id: 'k', nome: 'K', corretora: 'BTG', ultimoMovimento: '2026-10-20', tipoMovimento: 'ativacao' as const, liquido: 2500, cheio: true }]
    const p = pontosDoMes(eventos, base, REGUA_PADRAO)
    expect(p.total).toBeCloseTo(4.5)
    expect(p.porCorretora).toEqual({ BTG: 3.5, GENIAL: 1 })
  })
  it('o valor segue o nível e o fixo se divide pelos pontos de cada corretora', () => {
    const n2 = NIVEIS_PADRAO.niveis[1]
    const eventos = [ev('Milena', 'x', 'ativacao', '2026-11-04', 'BTG'), ev('Milena', 'z', 'abertura', '2026-11-06')]
    const base = [{ cliente_id: 'k', nome: 'K', corretora: 'BTG', ultimoMovimento: '2026-10-20', tipoMovimento: 'ativacao' as const, liquido: 2000, cheio: true },
      { cliente_id: 'j', nome: 'J', corretora: 'GENIAL', ultimoMovimento: '2024-01-10', tipoMovimento: 'ativacao' as const, liquido: 1000, cheio: false }]
    const v = valorDoMes(n2, eventos, [], base, { BTG: 3, GENIAL: 1 })
    // fixo 1.500 + abertura 15 + ativação 25 + 5 % de 2.000 + 2,5 % de 1.000
    expect(v.total).toBeCloseTo(1500 + 15 + 25 + 100 + 25)
    expect(v.porCorretora.BTG.fixo).toBeCloseTo(1125)
    expect(v.porCorretora.GENIAL.fixo).toBeCloseTo(375)
    expect(v.porCorretora.BTG.variavel).toBeCloseTo(25 + 100)
    expect(v.porCorretora.GENIAL.variavel).toBeCloseTo(15 + 25)
  })
  it('sem pontos o fixo fica na Genial', () => {
    const v = valorDoMes(NIVEIS_PADRAO.niveis[0], [], [], [], {})
    expect(v.porCorretora).toEqual({ GENIAL: { fixo: 1000, variavel: 0, total: 1000, pontos: 0 } })
  })
  it('a segunda metade da reativação: só a feita no modelo, com o cliente girando 3 meses depois', () => {
    const eventos = [ev('Aikon', 'a', 'reativacao', '2026-08-12'), ev('Aikon', 'b', 'reativacao', '2026-11-12'), ev('Aikon', 'c', 'reativacao', '2026-11-20')]
    const girou = new Set([chaveMes('a', 'GENIAL', '2026-11-01'), chaveMes('b', 'GENIAL', '2027-02-01')])
    expect(permanenciasDoMes(eventos, 'Aikon', '2026-11-01', '2026-11-01', girou, REGUA_PADRAO)).toEqual([])   // ago/26 é de antes do modelo
    expect(permanenciasDoMes(eventos, 'Aikon', '2027-02-01', '2026-11-01', girou, REGUA_PADRAO).map(e => e.cliente_id)).toEqual(['b'])
  })
})

describe('nível por revisão', () => {
  const pessoa = { nome: 'Aikon', nivelDesde: '2026-11-01', trabalhaDesde: '2026-01-01' }
  it('a primeira revisão usa os 3 meses antes da entrada; o nível vale até a próxima', () => {
    const pts: Record<string, number> = { '2026-08-01': 12, '2026-09-01': 16, '2026-10-01': 23 }
    const n = niveisDaPessoa(pessoa, m => pts[m] ?? 0, [NIVEIS_PADRAO], [REGUA_PADRAO], '2027-01-01')
    expect(n.get('2026-11-01')).toMatchObject({ nivel: 2, revisao: '2026-11-01', proximaRevisao: '2027-02-01', primeira: true })
    expect(n.get('2026-11-01')?.media).toBeCloseTo(17)
    expect(n.get('2027-01-01')?.nivel).toBe(2)
  })
  it('só conta os meses trabalhados', () => {
    const milena = { nome: 'Milena', nivelDesde: '2026-11-01', trabalhaDesde: '2026-10-01' }
    const n = niveisDaPessoa(milena, m => (m === '2026-10-01' ? 13.35 : 0), [NIVEIS_PADRAO], [REGUA_PADRAO], '2026-11-01')
    expect(n.get('2026-11-01')).toMatchObject({ nivel: 2, mesesMedia: ['2026-10-01'] })
  })
  it('sobe na revisão em que passa do limite; desce só depois de duas revisões seguidas abaixo', () => {
    // revisões em nov, fev, mai e ago: médias 35 (N3), 12 (abaixo 1×), 11 (abaixo 2× → N2), 40 (N3)
    const media: Record<string, number> = { '2026-11-01': 35, '2027-02-01': 12, '2027-05-01': 11, '2027-08-01': 40 }
    const revisaoDe = (m: string) => Object.keys(media).filter(r => r > m).sort()[0]
    const n = niveisDaPessoa(pessoa, m => media[revisaoDe(m)] ?? 0, [NIVEIS_PADRAO], [REGUA_PADRAO], '2027-08-01')
    expect(n.get('2026-11-01')?.nivel).toBe(3)
    expect(n.get('2027-02-01')).toMatchObject({ nivel: 3, abaixo: 1 })
    expect(n.get('2027-05-01')).toMatchObject({ nivel: 2, abaixo: 0 })
    expect(n.get('2027-08-01')?.nivel).toBe(3)
  })
})

describe('a conta da pessoa', () => {
  it('antes do modelo vale a comissão por conta; no modelo, o nível', () => {
    const eventos = [
      ev('Aikon', 'a', 'ativacao', '2026-08-05'), ev('Aikon', 'b', 'ativacao', '2026-09-05'), ev('Aikon', 'c', 'ativacao', '2026-10-05'),
      ev('Aikon', 'd', 'ativacao', '2026-11-05'), ev('Aikon', 'e', 'abertura', '2026-11-06', 'GENIAL', 20),
    ]
    const liquido = new Map<string, number>()
    for (const m of ['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']) for (const c of ['a', 'b', 'c', 'd']) liquido.set(chaveMes(c, 'GENIAL', m), 4000)
    const d: DadosRemuneracao = {
      pessoas: [{ nome: 'Aikon', nivelDesde: '2026-11-01', trabalhaDesde: null }], tabelas: [NIVEIS_PADRAO], reguas: [REGUA_PADRAO],
      eventos, liquido, girou: new Set(liquido.keys()),
    }
    const [out, nov] = contaDaPessoa('Aikon', ['2026-10-01', '2026-11-01'], d)
    expect(out.noModelo).toBe(false)
    expect(out.valor.total).toBe(80)
    // pontos: ago 1 + 4 (a) = 5; set 1 + 8 (a, b) = 9; out 1 + 12 = 13 → média 9 → Nível 1
    expect(nov.nivel?.nivel).toBe(1)
    expect(nov.noModelo).toBe(true)
    // Nível 1: fixo 1.000 + abertura 10 + ativação 20 + 2,5 % de 16.000 (a, b, c, d giraram em nov)
    expect(nov.valor.total).toBeCloseTo(1000 + 10 + 20 + 400)
    expect(nov.eventos.map(e => e.valor)).toEqual([20, 10])
  })
})
