import { describe, expect, it } from 'vitest'
import { arredondado, fraseDoFechamento, fraseDoMes, fraseDoRendimento, giroPorDia, linhaDaCorretora, rotuloCorretoras, totaisDoEscritorio, type LinhaInicio, type TotaisInicio } from './inicio'
import type { GiroDiaRow, PainelKpis, PainelMensalRow } from './tipos'

const kpis = (x: Partial<PainelKpis>): PainelKpis => ({
  mes_ref: '2026-11-01', clientes_levados: 100, total_contas: 110, migrados: 90, em_processamento: 5, recusaram: 5, ativos_mes: 40, lotes_mes: 0, zerados_mes: 0, receita_mes: 0,
  incentivo_mes: 0, clientes_com_faixa: 0, migrados_sem_giro: 20, inativos: 10, com_alertas: 3, migrados_sem_data: 0, multi_conta: 0, linhas_nao_cadastradas: 7, lotes_nao_cadastrados: 0,
  ultima_data: '2026-11-13', lotes_12m: 0, receita_12m: 0, posicao_mes: 0, acoes_operacoes_mes: 0, receita_acoes_mes: 0, em_risco: 6, ...x,
})
const mensal = (mes: string, x: Partial<PainelMensalRow>): PainelMensalRow => ({
  mes_ref: mes, migrados_acumulados: 0, novas_migracoes: 0, entradas: 0, clientes_ativos: 0, lotes: 0, zerados: 0, receita_corretagem: 0, receita_zeragem: 0, receita: 0, incentivo: 0,
  clientes_pontuando: 0, clientes_com_faixa: 0, posicao: 0, acoes_operacoes: 0, receita_acoes: 0, ...x,
})
// dias úteis de um mês com o mesmo giro por dia
const uteis = (mes: string, ateDia: number, lotes: number, receita: number): GiroDiaRow[] => {
  const out: GiroDiaRow[] = []
  for (let d = 1; d <= ateDia; d++) {
    const dia = `${mes}-${String(d).padStart(2, '0')}`
    const w = new Date(`${dia}T12:00:00Z`).getUTCDay()
    if (w !== 0 && w !== 6) out.push({ dia, lotes, receita })
  }
  return out
}
// outubro inteiro a 1.000 lotes por dia útil (22 dias) e novembro até 13/11 a 1.500 (10 dias úteis)
const GIRO = [...uteis('2026-10', 31, 1000, 250), ...uteis('2026-11', 13, 1500, 375)]

describe('linhaDaCorretora', () => {
  const l = linhaDaCorretora({
    corretora: 'GENIAL', mes: '2026-11-01', hoje: '2026-11-16', kpis: kpis({ lotes_mes: 15000, receita_mes: 3750, incentivo_mes: 800 }), giro: GIRO,
    mensal: [mensal('2026-10-01', { clientes_ativos: 50 }), mensal('2026-11-01', { clientes_ativos: 40, novas_migracoes: 4 })],
  })
  it('traz o mês, o último dia e a média por dia com giro', () => {
    expect(l).toMatchObject({ corretora: 'GENIAL', semDados: false, ultimaData: '2026-11-13', lotesDia: 1500, mediaDia: 1500, parcial: true, lotes: 15000, lotesComparavel: 15000, receita: 3750, receitaComparavel: 3750, incentivo: 800 })
  })
  it('compara com o mês anterior no mesmo ponto e projeta o fechamento na mesma proporção', () => {
    // 10 de 21 dias úteis de novembro ≈ 48 % → 10 ou 11 dos 22 dias úteis de outubro
    expect(l.lotesMesmoPonto).toBeGreaterThanOrEqual(10000)
    expect(l.lotesMesmoPonto).toBeLessThanOrEqual(11000)
    expect(l.lotesAnterior).toBe(22000)
    expect(l.receitaAnterior).toBe(5500)
    expect(l.lotesPrevisto).toBeCloseTo(15000 * (21 / 10), -2)     // sem histórico suficiente: ritmo linear dos dias úteis
    expect(l.receitaPrevista).toBeCloseTo(3750 * (21 / 10), -2)
  })
  it('traz a base: ativos contra o mês anterior, contas novas, risco e pendências', () => {
    expect(l).toMatchObject({ ativos: 40, ativosAnterior: 50, contasNovas: 4, emRisco: 6, nuncaGiraram: 20, pendencias: 7, liquido: null })
  })
  it('mês fechado: sem previsão, compara com o mês anterior inteiro', () => {
    const f = linhaDaCorretora({ corretora: 'BTG', mes: '2026-10-01', hoje: '2026-11-16', kpis: kpis({ mes_ref: '2026-10-01', lotes_mes: 22000, receita_mes: 5500, ultima_data: '2026-11-13' }), giro: [...uteis('2026-09', 30, 500, 100), ...GIRO], mensal: [], liquido: 2600 })
    expect(f).toMatchObject({ parcial: false, lotes: 22000, lotesPrevisto: 22000, lotesMesmoPonto: 11000, lotesAnterior: 11000, liquido: 2600, lotesDia: 0 })
  })
  it('corretora sem cadastro nem lotes fica marcada como sem dados', () => {
    const v = linhaDaCorretora({ corretora: 'XP', mes: '2026-11-01', hoje: '2026-11-16', kpis: kpis({ clientes_levados: 0, ultima_data: null, ativos_mes: 0, em_risco: 0, migrados_sem_giro: 0, linhas_nao_cadastradas: 0 }), giro: [], mensal: [] })
    expect(v).toMatchObject({ semDados: true, lotes: 0, lotesMesmoPonto: null, lotesAnterior: null, parcial: false })
    expect(linhaDaCorretora({ corretora: 'XP', mes: '2026-11-01', hoje: '2026-11-16', kpis: null, giro: [], mensal: [] }).semDados).toBe(true)
  })
})

const linha = (x: Partial<LinhaInicio>): LinhaInicio => ({
  corretora: 'GENIAL', semDados: false, ultimaData: '2026-11-13', lotesDia: 0, mediaDia: 0, parcial: true, lotes: 0, lotesComparavel: 0, lotesMesmoPonto: null, lotesPrevisto: 0, lotesAnterior: null,
  receita: 0, receitaComparavel: 0, receitaMesmoPonto: null, receitaPrevista: 0, receitaAnterior: null, incentivo: 0, liquido: null, ativos: 0, ativosAnterior: null, contasNovas: 0, emRisco: 0, nuncaGiraram: 0, pendencias: 0, ...x,
})

describe('totaisDoEscritorio', () => {
  it('soma as corretoras; o que uma não tem entra como zero, e só fica vazio quando nenhuma tem', () => {
    const t = totaisDoEscritorio([
      linha({ lotes: 261318, lotesComparavel: 258000, lotesMesmoPonto: 277000, lotesPrevisto: 571828, lotesAnterior: 591830, receita: 47190, receitaMesmoPonto: 85000, receitaPrevista: 107191, receitaAnterior: 156881, incentivo: 15300, ativos: 152, ativosAnterior: 201, contasNovas: 13, emRisco: 163, nuncaGiraram: 941, pendencias: 3091 }),
      linha({ corretora: 'BTG', lotes: 72306, lotesComparavel: 72306, lotesMesmoPonto: null, lotesPrevisto: 138039, lotesAnterior: null, receita: 18020, receitaPrevista: 34401, ativos: 62, contasNovas: 27, emRisco: 18, nuncaGiraram: 75 }),
    ])
    expect(t).toMatchObject({ parcial: true, lotes: 333624, lotesComparavel: 330306, lotesMesmoPonto: 277000, lotesPrevisto: 709867, lotesAnterior: 591830, receita: 65210, receitaMesmoPonto: 85000, receitaPrevista: 141592, receitaAnterior: 156881, incentivo: 15300, ativos: 214, ativosAnterior: 201, contasNovas: 40, emRisco: 181, nuncaGiraram: 1016, pendencias: 3091 })
    expect(totaisDoEscritorio([linha({}), linha({ corretora: 'BTG' })])).toMatchObject({ lotesMesmoPonto: null, lotesAnterior: null, receitaAnterior: null, ativosAnterior: null })
  })
  it('lista os valores por corretora, sem as que não têm dados', () => {
    const ls = [linha({ lotes: 261318 }), linha({ corretora: 'BTG', lotes: 72306 }), linha({ corretora: 'XP', semDados: true })]
    expect(rotuloCorretoras(ls, l => l.lotes, n => n.toLocaleString('pt-BR'))).toBe('Genial 261.318 · BTG 72.306')
  })
})

describe('fraseDoMes', () => {
  const t = (x: Partial<TotaisInicio>): TotaisInicio => ({
    parcial: true, lotes: 333624, lotesComparavel: 333624, lotesMesmoPonto: 379000, lotesPrevisto: 709867, lotesAnterior: 682939,
    receita: 65210, receitaComparavel: 65210, receitaMesmoPonto: 89451, receitaPrevista: 141592, receitaAnterior: 179608, incentivo: 0,
    ativos: 0, ativosAnterior: null, contasNovas: 0, emRisco: 0, nuncaGiraram: 0, pendencias: 0, ...x,
  })
  const semReceita = { receita: 0, receitaComparavel: 0, receitaMesmoPonto: null, receitaPrevista: 0, receitaAnterior: null }
  it('mês em andamento: lotes e receita contra o anterior no mesmo ponto, e onde deve fechar', () => {
    expect(fraseDoMes(t({}), '2026-11-01')).toBe('Novembro está 12 % abaixo de outubro em lotes e 27 % abaixo em receita do giro, no mesmo ponto do mês.')
    expect(fraseDoFechamento(t({}), '2026-11-01')).toBe('No ritmo atual o mês fecha perto de 710 mil lotes e R$ 142 mil de receita, contra 683 mil e R$ 180 mil em outubro.')
  })
  it('lotes para um lado e receita para o outro: diz "mas"', () => {
    expect(fraseDoMes(t({ lotesMesmoPonto: 300000 }), '2026-11-01')).toBe('Novembro está 11 % acima de outubro em lotes, mas 27 % abaixo em receita do giro, no mesmo ponto do mês.')
    expect(fraseDoMes(t({ lotesMesmoPonto: 334000 }), '2026-11-01')).toContain('está no mesmo nível de outubro em lotes e 27 % abaixo em receita do giro')
    expect(fraseDoMes(t({ receitaMesmoPonto: 65000 }), '2026-11-01')).toContain('12 % abaixo de outubro em lotes e no mesmo nível em receita do giro')
  })
  it('sem mês anterior para comparar diz só quanto girou e onde fecha', () => {
    const semAnterior = t({ lotesMesmoPonto: null, lotesAnterior: null, receitaMesmoPonto: null, receitaAnterior: null })
    expect(fraseDoMes(semAnterior, '2026-11-01')).toBe('Novembro está com 334 mil lotes e R$ 65 mil de receita do giro até agora.')
    expect(fraseDoFechamento(semAnterior, '2026-11-01')).toBe('No ritmo atual o mês fecha perto de 710 mil lotes e R$ 142 mil de receita.')
  })
  it('corretora sem receita cadastrada: a frase fica só nos lotes', () => {
    expect(fraseDoMes(t(semReceita), '2026-11-01')).toBe('Novembro está 12 % abaixo de outubro em lotes, no mesmo ponto do mês.')
    expect(fraseDoFechamento(t(semReceita), '2026-11-01')).toBe('No ritmo atual o mês fecha perto de 710 mil lotes, contra 683 mil em outubro.')
  })
  it('mês fechado e mês sem lotes: sem previsão', () => {
    const outubro = t({ parcial: false, lotes: 682939, lotesComparavel: 682939, lotesMesmoPonto: 627760, receita: 179608, receitaComparavel: 179608, receitaMesmoPonto: 146902 })
    expect(fraseDoMes(outubro, '2026-10-01')).toBe('Outubro fechou com 683 mil lotes e R$ 180 mil de receita do giro: 9 % acima de setembro em lotes e 22 % acima em receita.')
    expect(fraseDoFechamento(outubro, '2026-10-01')).toBeNull()
    expect(fraseDoMes(t({ parcial: false, lotes: 682939, lotesComparavel: 682939, lotesMesmoPonto: null, ...semReceita }), '2026-10-01')).toBe('Outubro fechou com 683 mil lotes.')
    expect(fraseDoMes(t({ lotes: 0 }), '2026-12-01')).toBe('Ainda não há lotes lançados em dezembro.')
    expect(fraseDoFechamento(t({ lotes: 0 }), '2026-12-01')).toBeNull()
  })
  it('quando a receita não acompanha os lotes, diz quanto cada lote rendeu', () => {
    expect(fraseDoRendimento(t({ lotesMesmoPonto: 300000 }), '2026-11-01')).toBe('Cada lote rendeu em média R$ 0,20 de receita, contra R$ 0,30 no mesmo ponto de outubro.')
    expect(fraseDoRendimento(t({ parcial: false, lotesMesmoPonto: 300000 }), '2026-11-01')).toBe('Cada lote rendeu em média R$ 0,20 de receita, contra R$ 0,30 em outubro.')
    // menos de 5 % de diferença no rendimento, ou sem base para comparar: não diz nada
    expect(fraseDoRendimento(t({ lotesMesmoPonto: 333624, receitaMesmoPonto: 66000 }), '2026-11-01')).toBeNull()
    expect(fraseDoRendimento(t({ lotesMesmoPonto: null, receitaMesmoPonto: null }), '2026-11-01')).toBeNull()
    expect(fraseDoRendimento(t(semReceita), '2026-11-01')).toBeNull()
  })
  it('arredonda para ler de relance', () => {
    expect([arredondado(709867), arredondado(1234000), arredondado(2650000), arredondado(9400), arredondado(812)]).toEqual(['710 mil', '1,2 milhão', '2,7 milhões', '9.400', '812'])
  })
})

describe('giroPorDia', () => {
  it('uma linha por dia com giro, uma coluna por corretora, só a janela pedida', () => {
    const dados = giroPorDia([
      { corretora: 'GENIAL', dias: [{ dia: '2026-10-01', lotes: 999, receita: 0 }, { dia: '2026-11-12', lotes: 30000, receita: 0 }, { dia: '2026-11-13', lotes: 20115, receita: 0 }] },
      { corretora: 'BTG', dias: [{ dia: '2026-11-13', lotes: 7000, receita: 0 }, { dia: '2026-11-14', lotes: 0, receita: 0 }, { dia: '2026-11-16', lotes: 4760, receita: 0 }] },
    ], '2026-11-16', 30)
    expect(dados).toEqual([
      { label: '12/11', GENIAL: 30000, BTG: 0 },
      { label: '13/11', GENIAL: 20115, BTG: 7000 },
      { label: '16/11', GENIAL: 0, BTG: 4760 },
    ])
  })
})
