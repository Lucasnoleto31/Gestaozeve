// O Início: como está indo o escritório no mês, somando as corretoras que o usuário vê.
// Lucas, 16/11/2026: a página era uma fileira de números por corretora, "muito vaga"; "queremos algo mais
// intuitivo, para já enxergarmos como está indo o escritório". Agora ela abre com a resposta (uma frase e
// seis números do escritório), compara as corretoras numa tabela só, mostra o giro dia a dia e o que pede
// atenção. Aqui ficam as contas, em funções puras (testes em inicio.test.ts); quem lê o banco é a página.
import { CORRETORA_LABEL, type Corretora } from '@/lib/corretoras'
import { MESES_LONGOS } from '@/lib/format'
import { projetarMes } from './projecao'
import { somarDias, somarMeses } from './meses'
import type { GiroDiaRow, PainelKpis, PainelMensalRow } from './tipos'

export type LinhaInicio = {
  corretora: Corretora
  semDados: boolean                // sem cadastro nem lotes: a linha só aponta para Parâmetros e Importar
  ultimaData: string | null        // último dia lançado
  lotesDia: number                 // lotes do último dia lançado (0 quando ele não é do mês)
  mediaDia: number                 // média por dia com giro no mês
  parcial: boolean                 // mês em andamento, com dias úteis pela frente: vale a previsão
  lotes: number
  // o giro por dia só enxerga clientes cadastrados: a comparação com o mês anterior usa esta base nos dois lados
  lotesComparavel: number
  lotesMesmoPonto: number | null   // mês anterior até o mesmo ponto (o mês inteiro, quando este já fechou)
  lotesPrevisto: number            // onde o mês deve fechar (= lotes fora do mês em andamento)
  lotesAnterior: number | null     // mês anterior inteiro
  receita: number                  // receita do giro: lotes × tarifa + zeragem
  receitaComparavel: number
  receitaMesmoPonto: number | null
  receitaPrevista: number
  receitaAnterior: number | null   // mês anterior inteiro
  incentivo: number
  liquido: number | null           // comissão líquida do escritório no mês (só corretora com cadeia de repasse)
  ativos: number
  ativosAnterior: number | null
  contasNovas: number              // contas migradas no mês
  emRisco: number
  nuncaGiraram: number
  pendencias: number               // lançamentos sem cliente cadastrado
}

// A linha de uma corretora no mês do Início. Os números do mês vêm dos indicadores (todos os lançamentos);
// a comparação com o mês anterior e a previsão vêm do giro por dia, na mesma proporção.
export function linhaDaCorretora(d: {
  corretora: Corretora; mes: string; hoje: string; kpis: PainelKpis | null; giro: GiroDiaRow[]; mensal: PainelMensalRow[]; liquido?: number | null; maxMeses?: number
}): LinhaInicio {
  const k = d.kpis
  const ultima = k?.ultima_data ?? null
  const proj = projetarMes(d.giro, d.mes, ultima, d.hoje, { maxMeses: d.maxMeses ?? 24 })
  const doMes = d.giro.filter(x => x.dia.slice(0, 7) === d.mes.slice(0, 7) && x.lotes > 0)
  const lotes = k?.lotes_mes ?? 0, receita = k?.receita_mes ?? 0
  const semGiro = proj.metodo === 'sem-lotes'
  const mesAnterior = somarMeses(d.mes, -1)
  return {
    corretora: d.corretora,
    semDados: !k || (k.clientes_levados === 0 && !k.ultima_data),
    ultimaData: ultima,
    lotesDia: ultima ? doMes.find(x => x.dia === ultima)?.lotes ?? 0 : 0,
    mediaDia: doMes.length ? doMes.reduce((s, x) => s + x.lotes, 0) / doMes.length : 0,
    parcial: proj.parcial,
    lotes,
    lotesComparavel: proj.lotes.realizado,
    lotesMesmoPonto: semGiro ? null : proj.parcial ? proj.lotes.anteriorMesmoPonto : proj.lotes.anteriorTotal,
    lotesPrevisto: proj.parcial ? lotes * proj.fator.lotes : lotes,
    lotesAnterior: proj.lotes.anteriorTotal,
    receita,
    receitaComparavel: proj.receita.realizado,
    receitaMesmoPonto: semGiro ? null : proj.parcial ? proj.receita.anteriorMesmoPonto : proj.receita.anteriorTotal,
    receitaPrevista: proj.parcial ? receita * proj.fator.receita : receita,
    receitaAnterior: proj.receita.anteriorTotal,
    incentivo: k?.incentivo_mes ?? 0,
    liquido: d.liquido ?? null,
    ativos: k?.ativos_mes ?? 0,
    ativosAnterior: d.mensal.find(m => m.mes_ref === mesAnterior)?.clientes_ativos ?? null,
    contasNovas: d.mensal.find(m => m.mes_ref === d.mes)?.novas_migracoes ?? 0,
    emRisco: k?.em_risco ?? 0,
    nuncaGiraram: k?.migrados_sem_giro ?? 0,
    pendencias: k?.linhas_nao_cadastradas ?? 0,
  }
}

export type TotaisInicio = Pick<LinhaInicio,
  'parcial' | 'lotes' | 'lotesComparavel' | 'lotesMesmoPonto' | 'lotesPrevisto' | 'lotesAnterior' | 'receita' | 'receitaComparavel' | 'receitaMesmoPonto' | 'receitaPrevista' | 'receitaAnterior'
  | 'incentivo' | 'ativos' | 'ativosAnterior' | 'contasNovas' | 'emRisco' | 'nuncaGiraram' | 'pendencias'>

// soma o que existe; null só quando nenhuma corretora tem o valor (corretora nova entra como crescimento)
const somaOuNull = (xs: (number | null)[]) => (xs.some(x => x != null) ? xs.reduce<number>((s, x) => s + (x ?? 0), 0) : null)

// O escritório: a soma das corretoras. Cliente com conta em duas corretoras conta nas duas.
export function totaisDoEscritorio(linhas: LinhaInicio[]): TotaisInicio {
  const soma = (f: (l: LinhaInicio) => number) => linhas.reduce((s, l) => s + f(l), 0)
  return {
    parcial: linhas.some(l => l.parcial),
    lotes: soma(l => l.lotes), lotesComparavel: soma(l => l.lotesComparavel), lotesMesmoPonto: somaOuNull(linhas.map(l => l.lotesMesmoPonto)), lotesPrevisto: soma(l => l.lotesPrevisto), lotesAnterior: somaOuNull(linhas.map(l => l.lotesAnterior)),
    receita: soma(l => l.receita), receitaComparavel: soma(l => l.receitaComparavel), receitaMesmoPonto: somaOuNull(linhas.map(l => l.receitaMesmoPonto)), receitaPrevista: soma(l => l.receitaPrevista),
    receitaAnterior: somaOuNull(linhas.map(l => l.receitaAnterior)), incentivo: soma(l => l.incentivo),
    ativos: soma(l => l.ativos), ativosAnterior: somaOuNull(linhas.map(l => l.ativosAnterior)), contasNovas: soma(l => l.contasNovas),
    emRisco: soma(l => l.emRisco), nuncaGiraram: soma(l => l.nuncaGiraram), pendencias: soma(l => l.pendencias),
  }
}

// 709.867 → "710 mil"; 1.234.000 → "1,2 milhão"; abaixo de mil, o número
export function arredondado(v: number): string {
  if (v >= 1_000_000) { const m = Math.round(v / 100_000) / 10; return `${m.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${m < 2 ? 'milhão' : 'milhões'}` }
  if (v >= 10_000) return `${Math.round(v / 1000).toLocaleString('pt-BR')} mil`
  return Math.round(v).toLocaleString('pt-BR')
}
const nomeDoMes = (mes: string) => MESES_LONGOS[parseInt(mes.slice(5, 7), 10) - 1] ?? mes.slice(0, 7)
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Variação em % contra a base de comparação (null quando não há base)
export const variacaoPct = (atual: number, anterior: number | null) => (anterior ? ((atual - anterior) / anterior) * 100 : null)

const reais = (v: number) => `R$ ${arredondado(v)}`
// "11 % acima de outubro", "27 % abaixo", "no mesmo nível" (menos de 1 % de diferença)
const posicao = (v: number, de?: string) => {
  const quem = de ? ` de ${de}` : ''
  return Math.abs(v) < 1 ? `no mesmo nível${quem}` : `${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} % ${v > 0 ? 'acima' : 'abaixo'}${quem}`
}
const sentido = (v: number) => (Math.abs(v) < 1 ? 0 : Math.sign(v))

const lotesEReceita = (lotes: number, receita: number, rotulo: string) => `${arredondado(lotes)} lotes${receita > 0 ? ` e ${reais(receita)} de ${rotulo}` : ''}`

// A resposta em uma frase: lotes e receita do giro contra o mês anterior, no mesmo ponto do mês. Lucas olha
// os dois: o giro pode subir com a receita caindo (menos zeragem), e a frase diz isso com um "mas".
export function fraseDoMes(t: TotaisInicio, mes: string): string {
  const atual = nomeDoMes(mes), anterior = nomeDoMes(somarMeses(mes, -1))
  if (t.lotes <= 0) return `Ainda não há lotes lançados em ${atual}.`
  const vLotes = variacaoPct(t.lotesComparavel, t.lotesMesmoPonto), vReceita = t.receita > 0 ? variacaoPct(t.receitaComparavel, t.receitaMesmoPonto) : null
  // "e" quando lotes e receita andam juntos, "mas" quando um sobe e o outro cai
  const contra = (receita: string) => (vLotes == null ? '' : vReceita == null ? `${posicao(vLotes, anterior)} em lotes`
    : `${posicao(vLotes, anterior)} em lotes${sentido(vLotes) * sentido(vReceita) < 0 ? ', mas' : ' e'} ${posicao(vReceita)} em ${receita}`)
  if (!t.parcial) { const c = contra('receita'); return `${maiuscula(atual)} fechou com ${lotesEReceita(t.lotes, t.receita, 'receita do giro')}${c ? `: ${c}` : ''}.` }
  const c = contra('receita do giro')
  return `${maiuscula(atual)} está ${c ? `${c}, no mesmo ponto do mês` : `com ${lotesEReceita(t.lotes, t.receita, 'receita do giro')} até agora`}.`
}

// Onde o mês deve fechar, contra o mês anterior inteiro (só com o mês em andamento)
export function fraseDoFechamento(t: TotaisInicio, mes: string): string | null {
  if (!t.parcial || t.lotes <= 0) return null
  const anterior = nomeDoMes(somarMeses(mes, -1))
  const antes = t.lotesAnterior ? `, contra ${arredondado(t.lotesAnterior)}${t.receita > 0 && t.receitaAnterior ? ` e ${reais(t.receitaAnterior)}` : ''} em ${anterior}` : ''
  return `No ritmo atual o mês fecha perto de ${lotesEReceita(t.lotesPrevisto, t.receita > 0 ? t.receitaPrevista : 0, 'receita')}${antes}.`
}

// Quando a receita não acompanha os lotes, o porquê em uma linha: quanto cada lote rendeu em média contra
// o mês anterior na mesma base (corretagem + zeragem ÷ lotes). Abaixo de 5 % de diferença não diz nada.
export function fraseDoRendimento(t: TotaisInicio, mes: string): string | null {
  if (!t.lotesComparavel || !t.lotesMesmoPonto || !t.receitaMesmoPonto || t.receitaComparavel <= 0) return null
  const agora = t.receitaComparavel / t.lotesComparavel, antes = t.receitaMesmoPonto / t.lotesMesmoPonto
  if (Math.abs(agora - antes) / antes < 0.05) return null
  const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const anterior = nomeDoMes(somarMeses(mes, -1))
  return `Cada lote rendeu em média ${brl(agora)} de receita, contra ${brl(antes)} ${t.parcial ? `no mesmo ponto de ${anterior}` : `em ${anterior}`}.`
}

// Lotes por dia das corretoras nos últimos N dias corridos até `ate`, para o gráfico empilhado: uma linha
// por dia com giro e uma coluna por corretora (a chave é o código da corretora)
export function giroPorDia(series: { corretora: Corretora; dias: GiroDiaRow[] }[], ate: string, dias = 30): Record<string, string | number>[] {
  const de = somarDias(ate, -(dias - 1))
  const porDia = new Map<string, Record<string, string | number>>()
  for (const s of series) {
    for (const d of s.dias) {
      if (d.dia < de || d.dia > ate || d.lotes <= 0) continue
      let linha = porDia.get(d.dia)
      if (!linha) { linha = { label: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}` }; for (const x of series) linha[x.corretora] = 0; porDia.set(d.dia, linha) }
      linha[s.corretora] = Number(linha[s.corretora]) + d.lotes
    }
  }
  return [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, l]) => l)
}

export const rotuloCorretoras = (linhas: LinhaInicio[], valor: (l: LinhaInicio) => number, fmt: (n: number) => string) =>
  linhas.filter(l => !l.semDados).map(l => `${CORRETORA_LABEL[l.corretora]} ${fmt(valor(l))}`).join(' · ')
