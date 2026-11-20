import { describe, expect, it } from 'vitest'
import {
  custosDoMes, emVigor, fraseDaCobertura, fraseDosCustos, lerCustosFixos, resultadoDepoisDosCustos, textoCustosFixos, validarCustosFixos,
  type CustoFixo,
} from './custos'

const LISTA_DO_LUCAS = 'Claude Artur:1100:2026-11;Claude Lucas:1.100:2026-11;Supabase:228,01:2026-11;Vercel:120:2026-11;Aikon:equipe:2026-11;Milena:equipe:2026-11'
const semEquipe = () => null
const n = (s: string) => s.replace(/ /g, ' ')

describe('lerCustosFixos', () => {
  it('lê custos mensais e equipe; aceita vírgula decimal e milhar com ponto', () => {
    expect(lerCustosFixos(LISTA_DO_LUCAS)).toEqual([
      { nome: 'Claude Artur', tipo: 'valor', valor: 1100, desde: '2026-11', ate: null },
      { nome: 'Claude Lucas', tipo: 'valor', valor: 1100, desde: '2026-11', ate: null },
      { nome: 'Supabase', tipo: 'valor', valor: 228.01, desde: '2026-11', ate: null },
      { nome: 'Vercel', tipo: 'valor', valor: 120, desde: '2026-11', ate: null },
      { nome: 'Aikon', tipo: 'equipe', valor: 0, desde: '2026-11', ate: null },
      { nome: 'Milena', tipo: 'equipe', valor: 0, desde: '2026-11', ate: null },
    ])
  })
  it('lê da direita para a esquerda: o nome pode ter ":"; o mês de fim é opcional', () => {
    expect(lerCustosFixos('Plano: Pro:99,90:2026-10:2026-12; Karen:equipe-btg:2026-11:')).toEqual([
      { nome: 'Plano: Pro', tipo: 'valor', valor: 99.9, desde: '2026-10', ate: '2026-12' },
      { nome: 'Karen', tipo: 'equipe-btg', valor: 0, desde: '2026-11', ate: null },
    ])
  })
  it('vazio ou inválido dá lista vazia', () => {
    expect(lerCustosFixos('')).toEqual([])
    expect(lerCustosFixos(null)).toEqual([])
    expect(lerCustosFixos('Supabase:228')).toEqual([])               // sem mês
    expect(lerCustosFixos('Supabase:muito:2026-11')).toEqual([])     // valor que não é número
    expect(lerCustosFixos('Supabase:228:2026-13')).toEqual([])       // mês que não existe
    expect(lerCustosFixos(':228:2026-11')).toEqual([])               // sem nome
    expect(lerCustosFixos('Vercel:120:2026-11;lixo')).toEqual([])    // um item ruim invalida tudo
  })
})

describe('textoCustosFixos', () => {
  it('forma canônica: custos mensais por nome, depois a equipe; ponto decimal e sem milhar', () => {
    const lista = lerCustosFixos('Milena:equipe:2026-11;Vercel:120:2026-11;Supabase:228,01:2026-11;Aikon:equipe:2026-11;Claude Lucas:1.100:2026-11;Claude Artur:1100:2026-11')
    expect(textoCustosFixos(lista)).toBe('Claude Artur:1100:2026-11;Claude Lucas:1100:2026-11;Supabase:228.01:2026-11;Vercel:120:2026-11;Aikon:equipe:2026-11;Milena:equipe:2026-11')
  })
  it('a mudança de valor fica em dois itens, em ordem de início, e volta igual na leitura', () => {
    const texto = 'Vercel:150:2027-02;Vercel:120:2026-11:2027-01'
    const canonico = textoCustosFixos(lerCustosFixos(texto))
    expect(canonico).toBe('Vercel:120:2026-11:2027-01;Vercel:150:2027-02')
    expect(textoCustosFixos(lerCustosFixos(canonico))).toBe(canonico)
  })
})

describe('validarCustosFixos', () => {
  const item = (x: Partial<CustoFixo>): CustoFixo => ({ nome: 'Vercel', tipo: 'valor', valor: 120, desde: '2026-11', ate: null, ...x })
  it('a lista do Lucas está boa', () => {
    expect(validarCustosFixos(lerCustosFixos(LISTA_DO_LUCAS))).toBeNull()
    expect(validarCustosFixos([])).toBeNull()
  })
  it('recusa nome vazio, valor zero ou negativo, mês inválido e fim antes do início', () => {
    expect(validarCustosFixos([item({ nome: ' ' })])).toBe('Falta o nome de um dos custos.')
    expect(validarCustosFixos([item({ valor: 0 })])).toBe('O valor de Vercel tem de ser maior que zero.')
    expect(validarCustosFixos([item({ valor: -5 })])).toMatch(/maior que zero/)
    expect(validarCustosFixos([item({ desde: '2026-13' })])).toMatch(/início de Vercel/)
    expect(validarCustosFixos([item({ ate: '26-12' })])).toMatch(/fim de Vercel/)
    expect(validarCustosFixos([item({ ate: '2026-10' })])).toBe('Vercel termina (outubro/2026) antes de começar (novembro/2026).')
  })
  it('na equipe o valor não conta (vem de Comissões)', () => {
    expect(validarCustosFixos([item({ nome: 'Aikon', tipo: 'equipe', valor: 0 })])).toBeNull()
  })
  it('recusa o mesmo nome no mesmo grupo com períodos que se sobrepõem', () => {
    expect(validarCustosFixos([item({}), item({ valor: 150, desde: '2027-02' })])).toMatch(/Vercel aparece duas vezes/)
    expect(validarCustosFixos([item({ ate: '2027-01' }), item({ nome: 'vercel', valor: 150, desde: '2027-01' })])).toMatch(/aparece duas vezes/)
    // equipe e equipe-btg são o mesmo grupo
    expect(validarCustosFixos([item({ nome: 'Aikon', tipo: 'equipe' }), item({ nome: 'Aikon', tipo: 'equipe-btg' })])).toMatch(/Aikon aparece duas vezes/)
  })
  it('aceita a troca de valor sem sobreposição e o mesmo nome em grupos diferentes sem sobreposição', () => {
    expect(validarCustosFixos([item({ ate: '2027-01' }), item({ valor: 150, desde: '2027-02' })])).toBeNull()
    expect(validarCustosFixos([item({ nome: 'Aikon', valor: 1500, ate: '2026-10', desde: '2026-09' }), item({ nome: 'Aikon', tipo: 'equipe-btg' })])).toBeNull()
  })
  it('recusa custo mensal com o nome de quem está na Equipe no mesmo período (o fixo entraria duas vezes)', () => {
    expect(validarCustosFixos([item({ nome: 'Aikon', valor: 1500 }), item({ nome: 'aikon', tipo: 'equipe' })])).toMatch(/Aikon já entra pela Equipe/)
  })
})

describe('vigência', () => {
  const lista = lerCustosFixos('Vercel:120:2026-11:2027-01;Vercel:150:2027-02;Teste:50:2026-10:2026-11')
  const mensais = (mes: string) => custosDoMes(lista, mes, semEquipe).mensais
  it('começa no mês de início, termina no mês de fim (inclusivo) e muda de valor no meio', () => {
    expect(mensais('2026-09')).toBe(0)
    expect(mensais('2026-10')).toBe(50)
    expect(mensais('2026-11-01')).toBe(170)
    expect(mensais('2026-12')).toBe(120)
    expect(mensais('2027-01-01')).toBe(120)
    expect(mensais('2027-02')).toBe(150)
    expect(mensais('2030-06')).toBe(150)
  })
  it('emVigor aceita AAAA-MM e AAAA-MM-01', () => {
    expect(emVigor(lista[0], '2026-11')).toBe(true)
    expect(emVigor(lista[0], '2026-11-01')).toBe(true)
    expect(emVigor(lista[0], '2027-02-01')).toBe(false)
  })
})

describe('custosDoMes', () => {
  const lista = lerCustosFixos(LISTA_DO_LUCAS)
  it('soma os custos mensais e o que a equipe gerou no mês', () => {
    const valores: Record<string, number> = { Aikon: 1976.12, Milena: 1995.01 }
    const c = custosDoMes(lista, '2026-11', nome => valores[nome] ?? null)
    expect(c).toMatchObject({ mes: '2026-11-01', mensais: 2548.01, equipe: 3971.13, total: 6519.14, temCusto: true, equipeIncompleta: false })
    expect(c.itens.map(i => `${i.nome}:${i.valor}`)).toEqual(['Claude Artur:1100', 'Claude Lucas:1100', 'Supabase:228.01', 'Vercel:120', 'Aikon:1976.12', 'Milena:1995.01'])
  })
  it('passa o tipo e o mês para quem dá o valor da equipe', () => {
    const pedidos: string[] = []
    custosDoMes(lerCustosFixos('Aikon:equipe-btg:2026-11'), '2026-12', (nome, tipo, mes) => { pedidos.push(`${nome}|${tipo}|${mes}`); return 10 })
    expect(pedidos).toEqual(['Aikon|equipe-btg|2026-12-01'])
  })
  it('pessoa sem valor fica de fora da soma e marca a equipe como incompleta', () => {
    const c = custosDoMes(lista, '2026-11', nome => (nome === 'Aikon' ? 1976.12 : null))
    expect(c).toMatchObject({ equipe: 1976.12, total: 4524.13, equipeIncompleta: true })
    expect(c.itens.find(i => i.nome === 'Milena')!.valor).toBeNull()
  })
  it('mês antes de tudo: sem custo', () => {
    expect(custosDoMes(lista, '2026-10-01', semEquipe)).toEqual({ mes: '2026-10-01', itens: [], mensais: 0, equipe: 0, total: 0, temCusto: false, equipeIncompleta: false })
  })
})

describe('resultadoDepoisDosCustos', () => {
  const custos = custosDoMes(lerCustosFixos('Claude Artur:1100:2026-11'), '2026-11', semEquipe)
  it('comissão líquida menos os custos, inclusive negativo', () => {
    expect(resultadoDepoisDosCustos(5000, custos)).toBe(3900)
    expect(resultadoDepoisDosCustos(600, custos)).toBe(-500)
  })
  it('sem custo é a própria comissão líquida', () => {
    expect(resultadoDepoisDosCustos(5000, null)).toBe(5000)
    expect(resultadoDepoisDosCustos(5000, custosDoMes([], '2026-11', semEquipe))).toBe(5000)
  })
})

describe('fraseDosCustos', () => {
  const custos = (mes = '2026-10') => custosDoMes(lerCustosFixos('Custos:6519:2026-01'), mes, semEquipe)
  it('mês fechado com sobra e mês fechado em que faltou', () => {
    expect(n(fraseDosCustos({ mes: '2026-10-01', parcial: false, liquido: 10713, custos: custos(), previsto: null })!))
      .toBe('Em outubro, depois de R$ 6.519 de custos, sobraram R$ 4.194 para dividir.')
    expect(n(fraseDosCustos({ mes: '2026-10-01', parcial: false, liquido: 6019, custos: custos(), previsto: null })!))
      .toBe('Em outubro os custos (R$ 6.519) passaram da comissão líquida: faltaram R$ 500.')
  })
  it('mês em andamento com previsão', () => {
    expect(n(fraseDosCustos({ mes: '2026-11-01', parcial: true, liquido: 3000, custos: custos('2026-11'), previsto: 15684 })!))
      .toBe('No ritmo atual, depois de R$ 6.519 de custos, sobram perto de R$ 9.165 no fim do mês.')
    expect(n(fraseDosCustos({ mes: '2026-11-01', parcial: true, liquido: 3000, custos: custos('2026-11'), previsto: 6019 })!))
      .toBe('No ritmo atual ainda faltam perto de R$ 500 para cobrir os custos do mês.')
  })
  it('mês em andamento com previsão e equipe nos custos: avisa que a equipe ainda cresce', () => {
    const comEquipe = custosDoMes(lerCustosFixos('Custos:6519:2026-01;Aikon:equipe:2026-11'), '2026-11', () => 0)
    expect(n(fraseDosCustos({ mes: '2026-11-01', parcial: true, liquido: 3000, custos: comEquipe, previsto: 15684 })!))
      .toBe('No ritmo atual, depois de R$ 6.519 de custos, sobram perto de R$ 9.165 no fim do mês. A equipe entra pelo valor de hoje e ainda cresce até o fim do mês.')
  })
  it('forma curta (celular): continua a frase do fechamento previsto, sem repetir o começo nem o aviso da equipe', () => {
    const comEquipe = custosDoMes(lerCustosFixos('Custos:6519:2026-01;Aikon:equipe:2026-11'), '2026-11', () => 0)
    expect(n(fraseDosCustos({ mes: '2026-11-01', parcial: true, liquido: 3000, custos: comEquipe, previsto: 15684, curta: true })!))
      .toBe('Depois de R$ 6.519 de custos, sobram perto de R$ 9.165.')
    expect(n(fraseDosCustos({ mes: '2026-11-01', parcial: true, liquido: 3000, custos: custos('2026-11'), previsto: 6019, curta: true })!))
      .toBe('Ainda faltam perto de R$ 500 para cobrir os custos do mês.')
    // mês fechado: a forma curta não muda nada
    expect(n(fraseDosCustos({ mes: '2026-10-01', parcial: false, liquido: 10713, custos: custos(), previsto: null, curta: true })!))
      .toBe('Em outubro, depois de R$ 6.519 de custos, sobraram R$ 4.194 para dividir.')
  })
  it('mês em andamento sem previsão fala do que há até agora', () => {
    expect(n(fraseDosCustos({ mes: '2026-11-01', parcial: true, liquido: 7019, custos: custos('2026-11'), previsto: null })!))
      .toBe('Até agora em novembro, depois de R$ 6.519 de custos, sobram R$ 500 para dividir.')
    expect(n(fraseDosCustos({ mes: '2026-11-01', parcial: true, liquido: 3000, custos: custos('2026-11'), previsto: null })!))
      .toBe('Até agora em novembro ainda faltam R$ 3.519 para cobrir os custos do mês.')
  })
  it('mês sem custo: nenhuma frase', () => {
    expect(fraseDosCustos({ mes: '2026-10-01', parcial: false, liquido: 10713, custos: null, previsto: null })).toBeNull()
    expect(fraseDosCustos({ mes: '2025-10-01', parcial: false, liquido: 10713, custos: custos('2025-10'), previsto: null })).toBeNull()
  })
})

describe('fraseDaCobertura', () => {
  it('fechados com sobra desde um mês', () => {
    expect(fraseDaCobertura([
      { mes: '2026-07-01', resultado: null, emAndamento: false },
      { mes: '2026-08-01', resultado: -200, emAndamento: false },
      { mes: '2026-09-01', resultado: 100, emAndamento: false },
      { mes: '2026-10-01', resultado: 4194, emAndamento: false },
      { mes: '2026-11-01', resultado: -3000, emAndamento: true },
    ])).toBe('Desde setembro a comissão líquida cobre os custos.')
  })
  it('último mês fechado negativo', () => {
    expect(n(fraseDaCobertura([
      { mes: '2026-09-01', resultado: 100, emAndamento: false },
      { mes: '2026-10-01', resultado: -500, emAndamento: false },
      { mes: '2026-11-01', resultado: 900, emAndamento: true },
    ])!)).toBe('Em outubro, faltaram R$ 500 para cobrir os custos.')
  })
  it('só o mês em andamento tem custo', () => {
    expect(fraseDaCobertura([
      { mes: '2026-10-01', resultado: null, emAndamento: false },
      { mes: '2026-11-01', resultado: -3000, emAndamento: true },
    ])).toBe('Os custos entram a partir de novembro, que ainda está em andamento.')
  })
  it('nenhum mês com custo', () => {
    expect(fraseDaCobertura([{ mes: '2026-10-01', resultado: null, emAndamento: false }])).toBeNull()
    expect(fraseDaCobertura([])).toBeNull()
  })
})
