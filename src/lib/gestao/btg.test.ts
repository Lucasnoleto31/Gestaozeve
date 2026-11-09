import { describe, expect, it } from 'vitest'
import { avaliarMetas, baseAtp, calcularRepasse, configBtg, diasUteis, lerFaixas, lerMetas, lerParceirosRepasse, lerParticipacoes, lerPctMes, numeroParam, preverMeta, repasseProgressivo, ritmosReceita, somarMesesData } from './btg'

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
      { chave: 'imposto_pct', valor: '16.5', descricao: null },
      { chave: 'impostos_embutidos_pct', valor: '9,65', descricao: null },
      { chave: 'imposto_btg_pct', valor: '6.65', descricao: null },
      { chave: 'atp_base', valor: 'comissao', descricao: null },
      { chave: 'delta_pct', valor: '30', descricao: null },
      { chave: 'participacoes', valor: 'Lucas:50;Artur:50', descricao: null },
      { chave: 'atp_assinatura', valor: '2026-09-01', descricao: null },
      { chave: 'atp_metas', valor: '18:50000:50000', descricao: null },
    ])
    expect(cfg.modelo).toBe('ATP')
    expect(cfg.impostoPct).toBe(16.5)
    expect(cfg.impostosEmbutidosPct).toBe(9.65)
    expect(cfg.impostoBtgPct).toBe(6.65)
    expect(cfg.atpBase).toBe('comissao')
    expect(cfg.atpAssinatura).toBe('2026-09-01')
    expect(cfg.atpMetas).toHaveLength(1)
    expect(cfg.pctMes).toEqual({})
    expect(configBtg([{ chave: 'repasse_pct_mes', valor: '2026-09:75;2026-10:80', descricao: null }]).pctMes).toEqual({ '2026-09': 75, '2026-10': 80 })
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
  // Fechamento do BTG de set/26 (planilha "Artur Fonseca"): bruta 978,03 → líquida 912,99 →
  // comissão 684,74 → Delta 30 % → 479,32 → imposto 16,5 % → 400,23. Nossa receita (lotes × tarifa): 883,75
  const CFG = { faixas: FAIXAS, impostosEmbutidosPct: 9.65, impostoBtgPct: 6.65, deltaPct: 30, impostoPct: 16.5, participacoes: lerParticipacoes('Lucas:50;Artur:50') }
  it('reproduz o fechamento do BTG (set/26)', () => {
    const r = calcularRepasse(883.75, CFG)
    expect(r.bruta).toBeCloseTo(978.14, 1)
    expect(r.impostoBtg).toBeCloseTo(65.05, 1)
    expect(r.liquida).toBeCloseTo(913.09, 1)
    expect(r.pctEfetivo).toBeCloseTo(75, 6)
    expect(r.comissao).toBeCloseTo(684.82, 1)
    expect(r.retencao).toBeCloseTo(228.27, 1)
    expect(r.delta).toBeCloseTo(205.45, 1)
    expect(r.comissaoEscritorio).toBeCloseTo(479.37, 1)
    expect(r.imposto).toBeCloseTo(79.10, 1)
    expect(r.liquido).toBeCloseTo(400.28, 1)
    expect(r.partes.map(p => p.nome)).toEqual(['Lucas', 'Artur'])
    expect(r.partes[0].valor).toBeCloseTo(200.14, 1)
  })
  it('escolhe a base das metas do ATP', () => {
    expect(baseAtp(883.75, { ...CFG, atpBase: 'receita' })).toBe(883.75)
    expect(baseAtp(883.75, { ...CFG, atpBase: 'bruta' })).toBeCloseTo(978.14, 1)
    expect(baseAtp(883.75, { ...CFG, atpBase: 'liquida' })).toBeCloseTo(913.09, 1)
    expect(baseAtp(883.75, { ...CFG, atpBase: 'comissao' })).toBeCloseTo(684.82, 1)
  })
  it('lê o percentual de comissão de cada mês fechado', () => {
    expect(lerPctMes('2026-09:75;2026-10:80')).toEqual({ '2026-09': 75, '2026-10': 80 })
    expect(lerPctMes('10/2026: 80')).toEqual({ '2026-10': 80 })
    expect(lerPctMes('')).toEqual({})
    expect(lerPctMes('2026-13:80')).toEqual({})
    expect(lerPctMes('2026-10:180')).toEqual({})
    expect(lerPctMes('outubro:80')).toEqual({})
  })
  // Fechamento do BTG de out/26: o BTG pagou 80 % sobre a líquida, embora as faixas dessem 75 % para esse volume
  it('usa o percentual do fechamento no mês que tem um registrado', () => {
    const cfg = { ...CFG, pctMes: lerPctMes('2026-10:80') }
    const out = calcularRepasse(22561.99, cfg, '2026-10-01')
    expect(out.pctEfetivo).toBe(80)
    expect(out.comissao).toBeCloseTo(out.liquida * 0.8, 6)
    expect(out.liquido).toBeCloseTo(out.liquida * 0.8 * 0.7 * 0.835, 6)
    expect(calcularRepasse(22561.99, cfg, '2026-11-01').pctEfetivo).toBeCloseTo(75, 6)
    expect(calcularRepasse(22561.99, cfg).pctEfetivo).toBeCloseTo(75, 6)
    expect(baseAtp(22561.99, { ...cfg, atpBase: 'comissao' }, '2026-10-01')).toBeCloseTo(out.comissao, 6)
  })
  it('lê os parceiros com participação na comissão', () => {
    expect(lerParceirosRepasse('Atual Capital:50:70')).toEqual([{ nome: 'Atual Capital', pctParceiro: 50, pctEscritorio: 70 }])
    expect(lerParceirosRepasse('Atual Capital:50:70; TF Robos:40:100')).toHaveLength(2)
    expect(lerParceirosRepasse('')).toEqual([])
    expect(lerParceirosRepasse('Atual Capital:50')).toEqual([])
    expect(lerParceirosRepasse('Atual Capital:150:70')).toEqual([])
    expect(configBtg([{ chave: 'repasse_parceiros', valor: 'Atual Capital:50:70', descricao: null }]).parceiros).toHaveLength(1)
    expect(configBtg([]).parceiros).toEqual([])
  })
  // Fechamento do BTG de out/26, aba "Zeve" (clientes do parceiro Atual Capital): comissão 915,43 → imposto 16,5 % →
  // 764,39 → parceiro 50 % = 382,19 · Artur 70 % da outra metade = 267,54 · Delta e Nathan = 114,66
  it('separa os clientes do parceiro com participação na comissão', () => {
    const cfg = { ...CFG, pctMes: lerPctMes('2026-10:80'), parceiros: lerParceirosRepasse('Atual Capital:50:70') }
    const receitaParceiro = (915.43 / 0.8 / 0.9335) * 0.9035
    const r = calcularRepasse(22561.99, cfg, '2026-10-01', { 'Atual Capital': receitaParceiro })
    const p = r.parceiros[0]
    expect(p.comissao).toBeCloseTo(915.43, 2)
    expect(p.liquido).toBeCloseTo(764.39, 1)
    expect(p.parceiro).toBeCloseTo(382.19, 1)
    expect(p.escritorio).toBeCloseTo(267.54, 1)
    expect(p.terceiros).toBeCloseTo(114.66, 1)
    expect(r.repasseParceiros).toBeCloseTo(382.19, 1)
    // os diretos seguem a cadeia de sempre sobre o que sobra da comissão
    expect(r.comissaoDireta).toBeCloseTo(r.comissao - 915.43, 2)
    expect(r.liquidoDireto).toBeCloseTo(r.comissaoDireta * 0.7 * 0.835, 6)
    expect(r.liquido).toBeCloseTo(r.liquidoDireto + p.escritorio, 6)
    expect(r.partes[0].valor).toBeCloseTo(r.liquido / 2, 6)
    // sem receita de parceiro, nada muda
    const s = calcularRepasse(22561.99, cfg, '2026-10-01')
    expect(s.parceiros).toEqual([])
    expect(s.comissaoDireta).toBe(s.comissao)
    expect(s.liquido).toBeCloseTo(s.comissao * 0.7 * 0.835, 6)
    // a receita do parceiro nunca passa da receita do mês
    expect(calcularRepasse(100, cfg, '2026-10-01', { 'Atual Capital': 500 }).comissaoDireta).toBeCloseTo(0, 6)
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
