// As frases do Giro diário no celular (DESIGN.md §8): a tela abre pela conclusão em palavras, montada só
// com os números que a aba já calcula (nenhuma conta nova). Funções puras, com testes em frases.test.ts;
// servem também à tela de um dia, que é Client Component (por isso nada daqui lê o banco).
import { deltaPct, fmtNum } from '@/lib/format'
import { somarDias } from '@/lib/gestao/meses'
import type { Tendencia } from '@/lib/gestao/giro'

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const indiceDoDia = (iso: string) => new Date(iso + 'T12:00:00').getDay()
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const ddmmaa = (iso: string) => `${ddmm(iso)}/${iso.slice(2, 4)}`
// '23,6%': o mesmo formato da comparação dos cartões logo abaixo da frase
const pct = (v: number) => `${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const plural = (n: number, um: string, varios: string) => `${fmtNum(n)} ${n === 1 ? um : varios}`

// 'terça-feira', 'sábado'
export const diaSemanaLongo = (iso: string) => { const i = indiceDoDia(iso); return i >= 1 && i <= 5 ? `${DIAS[i]}-feira` : DIAS[i] }

// '21/08 a 18/11'; com o ano quando o período atravessa a virada ('20/11/26 a 17/02/27')
export const intervalo = (inicio: string, fim: string) =>
  (inicio.slice(0, 4) === fim.slice(0, 4) ? `${ddmm(inicio)} a ${ddmm(fim)}` : `${ddmmaa(inicio)} a ${ddmmaa(fim)}`)

// O nome do período escolhido, igual ao do atalho do seletor quando é um deles; senão, as datas
const ATALHOS: [string, number][] = [['30 dias', 29], ['60 dias', 59], ['90 dias', 89]]
export function nomeDoPeriodo(inicio: string, fim: string, hoje: string): string {
  if (fim === hoje) {
    const atalho = ATALHOS.find(([, dias]) => inicio === somarDias(hoje, -dias))
    if (atalho) return atalho[0]
    if (inicio === `${hoje.slice(0, 7)}-01`) return 'mês atual'
  }
  return intervalo(inicio, fim)
}

// '+12,3%' / '−4,0%' no formato da coluna "Var. dia ant." (componente Variacao); null sem dia anterior
export function variacaoTexto(atual: number, anterior: number): string | null {
  if (!anterior) return null
  const p = ((atual - anterior) / anterior) * 100
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

export type Frase = { frase: string; apoio: string | null }

type Lado = 'acima' | 'abaixo' | 'no nível'
// mesma folga do cartão (Kpi.tsx): menos de 0,05 % não é subida nem queda
function lado(atual: number, anterior: number | null): Lado | null {
  const p = anterior ? deltaPct(atual, anterior) : null
  return p == null ? null : p > 0.05 ? 'acima' : p < -0.05 ? 'abaixo' : 'no nível'
}

// Aba Agora: o último dia lançado contra a média do mês; embaixo, a semana e o mês em palavras (os
// percentuais ficam nos cartões). Com o dia em andamento não afirma "acima" nem "abaixo".
export function fraseAgora(a: {
  ultima: string
  lotes: number
  mediaDoMes: number | null                              // null = o mês só tem esse dia com giro
  semana: { lotes: number; anterior: number | null }     // anterior = os mesmos dias da semana passada
  mes: { lotes: number; noMesmoPonto: number | null }    // noMesmoPonto = o mês anterior com os mesmos dias com giro
  parcial: boolean
}): Frase {
  const quando = `${maiuscula(DIAS[indiceDoDia(a.ultima)])}, ${ddmm(a.ultima)}`
  const lotes = plural(a.lotes, 'lote', 'lotes')
  const p = a.mediaDoMes != null ? deltaPct(a.lotes, a.mediaDoMes) : null
  const frase = a.parcial ? `${quando}, até agora: ${lotes}. O dia ainda não fechou.`
    : p == null ? `${quando}: ${lotes}. É o primeiro dia com giro do mês.`
    : Math.abs(p) <= 0.05 ? `${quando}: ${lotes}, na média do mês.`
    : `${quando}: ${lotes}, ${pct(p)} ${p > 0 ? 'acima' : 'abaixo'} da média do mês.`

  const s = lado(a.semana.lotes, a.semana.anterior)
  const m = lado(a.mes.lotes, a.mes.noMesmoPonto)
  let apoio: string | null = null
  if (s && m) apoio = s === m ? `A semana e o mês estão ${s} dos anteriores no mesmo ponto.` : `A semana está ${s} da passada e o mês, ${m} do anterior, no mesmo ponto.`
  else if (s) apoio = `A semana está ${s} da passada no mesmo ponto.`
  else if (m) apoio = `O mês está ${m} do anterior no mesmo ponto.`
  if (apoio && a.parcial) apoio = `Até agora, ${minuscula(apoio)}`
  return { frase, apoio }
}

const RITMO: Record<Tendencia, string> = { Subindo: 'está subindo', 'Estável': 'ficou estável', Caindo: 'está caindo' }

// Aba Período: quanto girou contra o período anterior de mesma duração e, embaixo, o ritmo dentro do
// período (a palavra da tendência) com a média por dia. São duas comparações, cada uma com o seu nome.
export function frasePeriodo(a: {
  inicio: string
  fim: string
  duracao: number            // dias corridos do período
  lotes: number
  lotesAnteriores: number    // 0 = sem lotes no período anterior
  tendencia: Tendencia
  media: number              // lotes por dia com giro
}): Frase {
  const lotes = plural(a.lotes, 'lote', 'lotes')
  const antes = a.duracao === 1 ? 'no dia anterior' : `nos ${fmtNum(a.duracao)} dias anteriores`
  const p = a.lotesAnteriores ? deltaPct(a.lotes, a.lotesAnteriores) : null
  const frase = p == null ? `De ${intervalo(a.inicio, a.fim)}: ${lotes}. Não há lotes ${antes} para comparar.`
    : Math.abs(p) <= 0.05 ? `De ${intervalo(a.inicio, a.fim)}: ${lotes}, o mesmo que ${antes}.`
    : `De ${intervalo(a.inicio, a.fim)}: ${lotes}, ${pct(p)} ${p > 0 ? 'a mais' : 'a menos'} que ${antes}.`
  return { frase, apoio: `Dentro do período o ritmo ${RITMO[a.tendencia]}: ${fmtNum(Math.round(a.media))} lotes por dia, em média.` }
}

// Aba Dia a dia: o total do período (a linha "Período" da tabela) e a média que cada dia usa de régua
// (receita já formatada; null = período sem receita)
export function fraseDias(a: { inicio: string; fim: string; dias: number; lotes: number; media: number; receita: string | null }): Frase {
  return {
    frase: `De ${intervalo(a.inicio, a.fim)}: ${plural(a.lotes, 'lote', 'lotes')} em ${plural(a.dias, 'dia', 'dias')} com giro, média de ${fmtNum(Math.round(a.media))} por dia.`,
    apoio: `${a.receita ? `Receita de ${a.receita}. ` : ''}Cada dia diz se ficou acima ou abaixo dessa média.`,
  }
}

// Tela de um dia: quem operou e se alguma corretagem saiu do cadastro (lotes e receita ficam nos dois
// cartões logo abaixo). São os números dos cartões Operações, Clientes operando e Corretagens manuais.
export function fraseDoDia(a: {
  dia: string
  clientes: number           // com lotes ou ações no dia
  operacoes: number          // as que contam para a receita
  emAcoes: number
  foraDaReceita: number      // de antes da migração
  manuais: number
}): Frase {
  const quando = maiuscula(diaSemanaLongo(a.dia))
  const operacoes = plural(a.operacoes, 'operação', 'operações')
  const frase = a.clientes > 0
    ? `${quando}: ${plural(a.clientes, 'cliente operou', 'clientes operaram')}, em ${operacoes}.`
    : `${quando}: ${operacoes}, nenhuma com lotes ou ações.`
  const apoio = [
    a.emAcoes > 0 ? `${fmtNum(a.emAcoes)} em ações e cripto.` : null,
    a.foraDaReceita > 0 ? `${fmtNum(a.foraDaReceita)} de antes da migração, fora da receita.` : null,
    a.manuais > 0 ? `${plural(a.manuais, 'corretagem manual, diferente', 'corretagens manuais, diferentes')} do cadastro.` : 'Todas as corretagens pelo cadastro.',
  ].filter(Boolean).join(' ')
  return { frase, apoio }
}
