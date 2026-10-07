import { describe, expect, it } from 'vitest'
import { avaliarMetas, calcularRepasse, configBtg, diasUteis, lerFaixas, lerMetas, lerParticipacoes, numeroParam, preverMeta, repasseProgressivo, ritmosReceita, somarMesesData } from './btg'

const FAIXAS = lerFaixas('0:75;100000:80;250000:85')

describe('parâmetros do BTG', () => {
  it('lê números com vírgula, R$ e %', () => {
    expect(numeroParam('16,6')).toBe(16.6)
    expect(numeroParam('R$ 100.000')).toBe(100000)
    expect(numeroParam('30%')).toBe(30)
    expect(numeroParam('abc')).toBeNull()
  })
  it('lê faixas, participações e metas', () => {
    expect(FAIXAS).toEqual([{ de: 0, pct: 75 }, { de: 100000, pct: 80 }, { de: 250000, pct: 85 }])
    expect(lerFaixas('250000:85;0:75')).toEqual([{ de: 0, pct: 75 }, { de: 250000, pct: 85 }])
    expect(lerFaixas('0:75;x:80')).toEqual([])
    expect(lerParticipacoes('Lucas:50;Artur:50')).toEqual([{ nome: 'Lucas', pct: 50 }, { nome: 'Artur', pct: 50 }])
    expect(lerMetas('18:50000:50000:Upfront com devolução;9:110000:50000')).toEqual([
      { prazoMeses: 18, comissao: 50000, premio: 50000, observacao: 'Upfront com devolução' },
      { prazoMeses: 9, comissao: 110000, premio: 50000, observacao: '' },
    ])
  })
  it('monta a configuração a partir dos parâmetros', () => {
    const cfg = configBtg([
      { chave: 'modelo_incentivo', valor: 'ATP', descricao: null },
      { chave: 'repasse_faixas', valor: '0:75;100000:80;250000:85', descricao: null },
      { chave: 'imposto_pct', valor: '16.6', descricao: null },
      { chave: 'delta_pct', valor: '30', descricao: null },
      { chave: 'participacoes', valor: 'Lucas:50;Artur:50', descricao: null },
      { chave: 'atp_assinatura', valor: '2026-09-01', descricao: null },
      { chave: 'atp_metas', valor: '18:50000:50000', descricao: null },
    ])
    expect(cfg.modelo).toBe('ATP')
    expect(cfg.impostoPct).toBe(16.6)
    expect(cfg.atpAssinatura).toBe('2026-09-01')
    expect(cfg.atpMetas).toHaveLength(1)
    expect(configBtg([]).modelo).toBe('PONTOS')
    expect(configBtg([{ chave: 'atp_assinatura', valor: '01/09/2026', descricao: null }]).atpAssinatura).toBeNull()
  })
})

describe('repasse do BTG', () => {
  it('aplica cada faixa só sobre a parcela dentro dela', () => {
    expect(repasseProgressivo(100000, FAIXAS).valor).toBe(75000)
    expect(repasseProgressivo(150000, FAIXAS).valor).toBe(75000 + 40000)
    expect(repasseProgressivo(300000, FAIXAS).valor).toBe(75000 + 120000 + 42500)
    expect(repasseProgressivo(0, FAIXAS)).toEqual({ valor: 0, pctEfetivo: 0 })
  })
  it('reproduz o Painel da planilha (set/26)', () => {
    const r = calcularRepasse(1459.95, { faixas: FAIXAS, impostoPct: 16.6, deltaPct: 30, participacoes: lerParticipacoes('Lucas:50;Artur:50') })
    expect(r.pctEfetivo).toBeCloseTo(75, 6)
    expect(r.repasse).toBeCloseTo(1094.9625, 4)
    expect(r.retencao).toBeCloseTo(364.9875, 4)
    expect(r.imposto).toBeCloseTo(181.763775, 4)
    expect(r.delta).toBeCloseTo(273.9596175, 4)
    expect(r.liquido).toBeCloseTo(639.2391075, 4)
    expect(r.partes.map(p => p.nome)).toEqual(['Lucas', 'Artur'])
    expect(r.partes[0].valor).toBeCloseTo(319.61955375, 4)
  })
})

describe('ATP Turbo Receita', () => {
  it('soma meses mantendo o dia', () => {
    expect(somarMesesData('2026-09-01', 18)).toBe('2028-03-01')
    expect(somarMesesData('2026-01-31', 1)).toBe('2026-02-28')
    expect(somarMesesData('2026-11-15', 2)).toBe('2027-01-15')
  })
  it('avalia metas atingidas, em andamento e vencidas', () => {
    const metas = lerMetas('3:1000:500;1:5000:100;2:2000:200')
    const serie = [{ mes_ref: '2026-09-01', receita: 600 }, { mes_ref: '2026-10-01', receita: 600 }]
    const r = avaliarMetas(metas, '2026-09-01', serie, '2026-10-20')
    expect(r[0]).toMatchObject({ status: 'atingida', atingidaEm: '2026-10-01', faltam: 0, prazoFim: '2026-12-01' })
    expect(r[1]).toMatchObject({ status: 'vencida', prazoFim: '2026-10-01', acumulado: 1200 })
    expect(r[2]).toMatchObject({ status: 'em andamento', prazoFim: '2026-11-01', faltam: 800 })
    expect(r[2].ritmoMensal).toBeGreaterThan(800)
  })
  it('ignora receita anterior à assinatura', () => {
    const r = avaliarMetas(lerMetas('6:1000:100'), '2026-10-05', [{ mes_ref: '2026-09-01', receita: 900 }, { mes_ref: '2026-10-01', receita: 300 }], '2026-10-20')
    expect(r[0].acumulado).toBe(300)
    expect(r[0].status).toBe('em andamento')
  })
})

describe('previsão das metas (ATP)', () => {
  const serie = [{ mes_ref: '2026-08-01', receita: 1000 }, { mes_ref: '2026-09-01', receita: 1390 }, { mes_ref: '2026-10-01', receita: 2357 }]
  it('conta dias úteis', () => {
    expect(diasUteis('2026-10-01', '2026-10-06')).toBe(4)   // qui, sex, seg, ter
    expect(diasUteis('2026-10-01', '2026-10-31')).toBe(22)
    expect(diasUteis('2026-10-06', '2026-10-01')).toBe(0)
  })
  it('calcula os ritmos só com meses desde a assinatura', () => {
    const r = ritmosReceita(serie, '2026-09-01', '2026-10-06', '2026-10-07')
    expect(r.ultimo).toMatchObject({ valor: 1390, meses: 1, disponivel: true })
    expect(r['3m'].valor).toBe(1390)
    expect(r.tudo.valor).toBe(1390)
    expect(r.atual.valor).toBeCloseTo((2357 / 4) * 22, 2)
    expect(r.atual).toMatchObject({ disponivel: true, diasDecorridos: 4, diasTotal: 22, receitaParcial: 2357 })
    // sem lotes no mês corrente, o mês atual não serve de base
    expect(ritmosReceita(serie, '2026-09-01', '2026-09-30', '2026-10-07').atual.disponivel).toBe(false)
  })
  it('prevê quando cada meta seria atingida', () => {
    const [meta] = avaliarMetas(lerMetas('18:50000:50000'), '2026-09-01', serie.slice(1), '2026-10-07')
    expect(meta.faltam).toBe(50000 - 1390 - 2357)
    const boa = preverMeta(meta, 5000, '2026-10-07')
    expect(boa.alcanca).toBe(true)
    expect(boa.mesesParaAtingir).toBeCloseTo(46253 / 5000, 3)
    expect(boa.dataPrevista).toBe('2027-07-16')
    expect(boa.folgaMeses ?? 0).toBeGreaterThan(7)
    const ruim = preverMeta(meta, 1390, '2026-10-07')
    expect(ruim.alcanca).toBe(false)
    expect(ruim.dataPrevista?.startsWith('2029')).toBe(true)
    expect((ruim.folgaMeses ?? 0) < 0).toBe(true)
    expect(preverMeta(meta, 0, '2026-10-07')).toEqual({ mesesParaAtingir: null, dataPrevista: null, folgaMeses: null, alcanca: false })
  })
})
