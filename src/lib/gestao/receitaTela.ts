// Tela Receita (redesenho de 16/11/2026): quanto entrou no mês, de onde veio e em quanto vai fechar.
// Lucas: "parece que está um tabelão e eu não consigo entender nada". Aqui ficam a frase do topo e as
// contas do bloco "De onde vem" (funções puras, testes em receitaTela.test.ts). Os números são os de
// antes: só mudou a apresentação.
import { MESES_LONGOS } from '@/lib/format'
import { arredondado, variacaoPct } from './inicio'
import type { ProjecaoMes } from './projecao'

const nomeDoMes = (mes: string) => MESES_LONGOS[parseInt(mes.slice(5, 7), 10) - 1] ?? mes.slice(0, 7)
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const reais = (v: number) => `R$ ${arredondado(v)}`
const inteiro = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
// "45 % abaixo de outubro" / "no mesmo nível de outubro" (menos de 1 % de diferença)
const posicao = (v: number, de: string) =>
  (Math.abs(v) < 1 ? `no mesmo nível de ${de}` : `${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} % ${v > 0 ? 'acima' : 'abaixo'} de ${de}`)

// A frase do topo: quanto entrou, contra o mês anterior no mesmo ponto, e em quanto deve fechar.
// `receita` é a receita do mês que a tela sempre mostrou (soma dos clientes); a comparação e a previsão
// vêm da projeção (o mesmo perfil do Painel e do Início).
export function fraseDaReceita(p: ProjecaoMes, receita: number): string {
  const atual = nomeDoMes(p.mesRef), anterior = nomeDoMes(p.mesAnterior)
  if (receita <= 0) return `Ainda não há receita lançada em ${atual}.`
  const r = p.receita
  if (!p.parcial) {
    const v = variacaoPct(r.realizado, r.anteriorTotal)
    return `${maiuscula(atual)} fechou com ${reais(receita)} de receita${v == null ? '' : `, ${posicao(v, anterior)}`}.`
  }
  const v = variacaoPct(r.realizado, r.anteriorMesmoPonto)
  const ate = p.ultimaData ? ` até ${ddmm(p.ultimaData)}` : ''
  const compara = v == null ? '' : `, ${posicao(v, anterior)} no mesmo ponto do mês`
  const fecha = `No ritmo atual fecha perto de ${reais(r.projetado)}${r.anteriorTotal ? `, contra ${reais(r.anteriorTotal)} em ${anterior}` : ''}.`
  return `${maiuscula(atual)} tem ${reais(receita)} de receita${ate}${compara}. ${fecha}`
}

// A segunda linha: de que tipo veio a receita do mês (o incentivo da corretora vem à parte, não entra na soma)
export function apoioDaReceita(d: { corretagem: number; zeragem: number; outras?: number; incentivo?: number }): string | null {
  const partes = [
    d.corretagem > 0 ? `corretagem (${inteiro(d.corretagem)})` : null,
    d.zeragem > 0 ? `zeragem (${inteiro(d.zeragem)})` : null,
    (d.outras ?? 0) > 0 ? `receita fixa (${inteiro(d.outras ?? 0)})` : null,
  ].filter((x): x is string => x != null)
  const veio = partes.length === 0 ? '' : `Veio de ${partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`}.`
  const incentivo = (d.incentivo ?? 0) > 0 ? `O incentivo da corretora soma mais ${inteiro(d.incentivo ?? 0)}.` : ''
  return [veio, incentivo].filter(Boolean).join(' ') || null
}

// Tira os períodos vazios do começo de uma série (o BTG começou em set/26: os meses antes disso só
// ocupavam espaço). Buraco no meio da série fica, porque é informação.
export function doPrimeiroComDado<T>(itens: T[], tem: (x: T) => boolean): T[] {
  const i = itens.findIndex(tem)
  return i < 0 ? [] : itens.slice(i)
}

// Os maiores de uma lista por um valor (receita do mês, lotes…), com a fatia de cada um no total e a
// fatia dos N juntos. Quem está zerado não entra.
export function maiores<T>(itens: T[], valor: (x: T) => number, n = 10): { itens: (T & { valor: number; pct: number })[]; total: number; pctJuntos: number } {
  const total = itens.reduce((s, x) => s + Math.max(0, valor(x)), 0)
  const top = itens.filter(x => valor(x) > 0).sort((a, b) => valor(b) - valor(a)).slice(0, n)
    .map(x => ({ ...x, valor: valor(x), pct: total ? (valor(x) / total) * 100 : 0 }))
  return { itens: top, total, pctJuntos: total ? (top.reduce((s, x) => s + x.valor, 0) / total) * 100 : 0 }
}
