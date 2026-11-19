// Tela Responsáveis (redesenho de nov/26): como está cada pessoa do time e quem precisa de ajuda.
// Lucas: "parece que jogou um monte de tabelão lá. Deixe mais intuitivo, informações realmente
// necessárias". Uma linha por pessoa (no BTG, o responsável; na Genial, o código do assessor, com a pessoa
// ligada a ele ao lado) com o que o mês dela diz. Funções puras, testes em responsaveisTela.test.ts.
import { MESES_LONGOS } from '@/lib/format'
import { arredondado } from './inicio'
import { somarMeses } from './meses'
import type { AssessorMensalRow, AssessorResumoRow } from './tipos'

export const SEM_ASSESSOR_NOME = 'Sem assessor'

export type PessoaDoTime = {
  nome: string                     // assessor_nome: o responsável (BTG) ou o código do assessor (Genial)
  pessoa: string | null            // quem do time está ligado ao código (Parâmetros › Assessores); null quando é o próprio nome
  clientesAtivos: number
  contasNovas: number              // clientes que migraram no mês
  lotes: number
  receita: number
  receitaAnterior: number          // mês anterior inteiro
  base: number | null              // com o que a receita é comparada: o mês anterior até o mesmo ponto (estimado) ou inteiro
  variacao: number | null          // % da receita contra a base
  pctReceita: number               // fatia da receita da corretora no mês
  tendencia: number[]              // receita mês a mês, na ordem de `meses`
  detalhe: AssessorResumoRow       // o que saiu da tabela principal: zerados, corretagem, zeragem, tarifa, 12 meses
}

type ClienteDaPessoa = { assessor_nome: string | null; data_migracao: string | null; status: string }

// Uma linha por pessoa, da que mais rendeu no mês para a que menos rendeu.
// `fracaoMesmoPonto` = a parte do mês anterior que a corretora já tinha feito neste mesmo ponto do mês
// (1 quando o mês está fechado; null quando não há mês anterior). Não existe giro por dia por pessoa:
// a comparação "no mesmo ponto" de cada uma é o mês anterior dela vezes essa fração, uma estimativa
// que, somada, fecha com a comparação da corretora inteira.
export function montarPessoas(d: {
  resumo: AssessorResumoRow[]; mensal: AssessorMensalRow[]; clientes: ClienteDaPessoa[]; meses: string[]; mesRef: string; fracaoMesmoPonto: number | null
}): PessoaDoTime[] {
  const total = d.resumo.reduce((s, a) => s + a.receita, 0)
  const mesAnterior = somarMeses(d.mesRef, -1)
  const receitaEm = new Map<string, number>()
  for (const m of d.mensal) receitaEm.set(`${m.assessor_nome}|${m.mes_ref.slice(0, 7)}`, m.receita)
  const novas = new Map<string, number>()
  for (const c of d.clientes) {
    if (c.status !== 'Migrado' || (c.data_migracao ?? '').slice(0, 7) !== d.mesRef.slice(0, 7)) continue
    const k = c.assessor_nome ?? SEM_ASSESSOR_NOME
    novas.set(k, (novas.get(k) ?? 0) + 1)
  }
  return d.resumo.map(a => {
    const receitaAnterior = receitaEm.get(`${a.assessor_nome}|${mesAnterior.slice(0, 7)}`) ?? 0
    const base = d.fracaoMesmoPonto == null ? null : receitaAnterior * d.fracaoMesmoPonto
    return {
      nome: a.assessor_nome,
      pessoa: a.responsavel && a.responsavel !== a.assessor_nome ? a.responsavel : null,
      clientesAtivos: a.clientes_ativos,
      contasNovas: novas.get(a.assessor_nome) ?? 0,
      lotes: a.lotes,
      receita: a.receita,
      receitaAnterior,
      base,
      variacao: base != null && base > 0 ? ((a.receita - base) / base) * 100 : null,
      pctReceita: total > 0 ? (a.receita / total) * 100 : 0,
      tendencia: d.meses.map(m => receitaEm.get(`${a.assessor_nome}|${m.slice(0, 7)}`) ?? 0),
      detalhe: a,
    }
  }).sort((a, b) => b.receita - a.receita || b.lotes - a.lotes || b.detalhe.receita_12m - a.detalhe.receita_12m || a.nome.localeCompare(b.nome))
}

// Celular: a lista abre só com quem pesa na receita, e o resto fica atrás de "ver os outros". Fica à vista
// quem tem 1 % ou mais da receita do mês, quem tinha 1 % ou mais da do mês anterior (quem caiu muito é
// justamente quem a tela quer mostrar) e a pessoa aberta. A ordem da lista não muda; é só o que aparece
// primeiro. Esconder uma ou duas linhas não vale um botão: com menos de 3 de fora, ficam todas.
const PESO_PARA_FICAR_A_VISTA = 0.01
export function pessoasAVista(pessoas: PessoaDoTime[], aberta = ''): Set<string> {
  const total = pessoas.reduce((s, p) => s + p.receita, 0)
  const totalAnterior = pessoas.reduce((s, p) => s + p.receitaAnterior, 0)
  const pesa = (valor: number, soma: number) => soma > 0 && valor >= soma * PESO_PARA_FICAR_A_VISTA
  const aVista = pessoas.filter(p => p.nome === aberta || pesa(p.receita, total) || pesa(p.receitaAnterior, totalAnterior))
  return new Set((aVista.length === 0 || pessoas.length - aVista.length < 3 ? pessoas : aVista).map(p => p.nome))
}

const nomeDoMes = (mes: string) => MESES_LONGOS[parseInt(mes.slice(5, 7), 10) - 1] ?? mes.slice(0, 7)
const e = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`)
const pct0 = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} %`

// Nome para ler numa frase: o que está todo em maiúsculas ("ZEVE INVESTIMENTOS 5") vira "Zeve Investimentos 5"
export function nomeDeFrase(nome: string): string {
  if (nome !== nome.toUpperCase()) return nome
  return nome.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
}

// A frase do topo: quem traz a maior parte da receita e quem está abaixo do mês anterior (quem precisa de
// ajuda). Só entra na comparação quem tinha receita relevante no mês anterior (3 % da base do time ou mais):
// código com R$ 10 no mês passado não é notícia. O corte é exportado porque o celular o escreve no "i" da
// lista, que mostra também quem ficou fora da frase (e, sem isso, a frase parece contradizer a lista).
export const PESO_NA_FRASE = 0.03
export function fraseDoTime(pessoas: PessoaDoTime[], mesRef: string, parcial: boolean): string {
  const atual = nomeDoMes(mesRef), anterior = nomeDoMes(somarMeses(mesRef, -1))
  const comReceita = pessoas.filter(p => p.receita > 0)
  if (!comReceita.length) return `Ainda não há receita lançada em ${atual}.`
  const maior = comReceita[0]
  const abre = comReceita.length === 1
    ? `Toda a receita de ${atual} (R$ ${arredondado(maior.receita)}) vem de ${nomeDeFrase(maior.nome)}.`
    : `${nomeDeFrase(maior.nome)} responde por ${pct0(maior.pctReceita)} da receita de ${atual} (R$ ${arredondado(maior.receita)}).`
  const baseDoTime = pessoas.reduce((s, p) => s + (p.base ?? 0), 0)
  const comparaveis = pessoas.filter(p => p.variacao != null && p.base != null && baseDoTime > 0 && p.base >= baseDoTime * PESO_NA_FRASE)
  if (!comparaveis.length) return abre
  const ponto = parcial ? ' no mesmo ponto do mês' : ''
  const abaixo = comparaveis.filter(p => (p.variacao ?? 0) <= -10).sort((a, b) => (a.variacao ?? 0) - (b.variacao ?? 0))
  if (!abaixo.length) return `${abre} Ninguém está abaixo de ${anterior}${ponto}.`
  const quem = e(abaixo.slice(0, 2).map(p => `${nomeDeFrase(p.nome)} (${pct0(p.variacao ?? 0)})`))
  if (abaixo.length === 1) return `${abre} Abaixo de ${anterior}${ponto} está ${quem}.`
  return `${abre} ${abaixo.length} de ${comparaveis.length} estão abaixo de ${anterior}${ponto}; ${abaixo.length === 2 ? 'são' : 'os que mais caíram são'} ${quem}.`
}

// Evolução mês a mês por pessoa, para o gráfico empilhado e para a tabela de números: as `top` maiores
// (pela soma da medida na janela) e o resto em "Outros". Chaves p0, p1… porque o nome tem espaço e acento.
export type EvolucaoDoTime = {
  meses: string[]
  pessoas: { chave: string; nome: string; lotes: number[]; receita: number[] }[]   // todas, da maior para a menor receita na janela
}

export function evolucaoDoTime(mensal: AssessorMensalRow[], meses: string[], ordem: string[] = []): EvolucaoDoTime {
  const nomes = [...ordem]
  for (const m of mensal) if (!nomes.includes(m.assessor_nome)) nomes.push(m.assessor_nome)
  const em = new Map<string, AssessorMensalRow>()
  for (const m of mensal) em.set(`${m.assessor_nome}|${m.mes_ref.slice(0, 7)}`, m)
  const pessoas = nomes.map(nome => ({
    nome,
    lotes: meses.map(m => em.get(`${nome}|${m.slice(0, 7)}`)?.lotes ?? 0),
    receita: meses.map(m => em.get(`${nome}|${m.slice(0, 7)}`)?.receita ?? 0),
  })).filter(p => p.lotes.some(v => v > 0) || p.receita.some(v => v > 0))
    .sort((a, b) => b.receita.reduce((s, v) => s + v, 0) - a.receita.reduce((s, v) => s + v, 0))
    .map((p, i) => ({ chave: `p${i}`, ...p }))
  return { meses, pessoas }
}

// As séries do gráfico: as `top` maiores pela medida escolhida e "Outros" somando o resto
export function seriesDaEvolucao(ev: EvolucaoDoTime, medida: 'lotes' | 'receita', top = 6): { series: { key: string; nome: string }[]; valores: Record<string, number>[] } {
  const soma = (xs: number[]) => xs.reduce((s, v) => s + v, 0)
  const ordenadas = [...ev.pessoas].sort((a, b) => soma(b[medida]) - soma(a[medida]))
  const principais = ordenadas.slice(0, top), resto = ordenadas.slice(top)
  const series = principais.map(p => ({ key: p.chave, nome: p.nome }))
  if (resto.length) series.push({ key: 'outros', nome: `Outros (${resto.length})` })
  const valores = ev.meses.map((_, i) => {
    const linha: Record<string, number> = {}
    for (const p of principais) linha[p.chave] = p[medida][i]
    if (resto.length) linha.outros = resto.reduce((s, p) => s + p[medida][i], 0)
    return linha
  })
  return { series, valores }
}
