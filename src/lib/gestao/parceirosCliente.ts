// Parceiros do cliente: a lista da ficha (tabela cliente_parceiros, S61). Lucas, 17/11/2026: um cliente
// pode estar em outro código nosso e ter o produto de um parceiro, e o mesmo cliente pode ter 3 ou 4
// parceiros dividindo o que ele gera ("Percentual por parceiro").
//
// Cada linha diz: neste cliente, nesta corretora, o parceiro leva pct % de tudo o que o cliente gerar, em
// qualquer código de assessor nosso, do mês `desde` ao mês `ate` (vazio = continua valendo). No mês em
// que o cliente tem lista em vigor, vale só a lista: o código do assessor (Genial) e o campo Parceiro da
// ficha (BTG) deixam de contar para ele. Sem lista, tudo como antes.
//
// Só funções puras (testes em parceirosCliente.test.ts). As leituras ficam em consultasParceirosCliente.ts
// e a gravação em acoesParceirosCliente.ts; a conta, em participacao.ts (Genial, XP) e btg.ts (BTG).
import { normTexto } from '@/lib/texto'
import { mesCurto, somarMeses } from './meses'

export type ParceiroDoCliente = {
  id: string
  cliente_id: string
  corretora: string
  parceiro: string
  pct: number          // % de tudo o que o cliente gerar na corretora
  desde: string        // primeiro mês em que vale ('AAAA-MM-01')
  ate: string | null   // último mês em que vale; null = continua valendo
}
type Vigencia = Pick<ParceiroDoCliente, 'desde' | 'ate'>

export const emVigor = (l: Vigencia, mes: string) => l.desde <= mes && (l.ate == null || mes <= l.ate)
const mesmo = (a: string, b: string) => normTexto(a) === normTexto(b)
const pctTexto = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} %`

// A lista num mês: quem tem lista em vigor (de qualquer parceiro), a soma dos percentuais de cada cliente
// e, quando um parceiro é informado, o percentual dele em cada cliente.
export type ListaDoMes = { comLista: Set<string>; soma: Map<string, number>; doParceiro: Map<string, number> }
export function listaDoMes(linhas: ParceiroDoCliente[], mes: string, parceiro?: string | null): ListaDoMes {
  const comLista = new Set<string>(), soma = new Map<string, number>(), doParceiro = new Map<string, number>()
  for (const l of linhas) {
    if (!emVigor(l, mes)) continue
    comLista.add(l.cliente_id)
    soma.set(l.cliente_id, (soma.get(l.cliente_id) ?? 0) + l.pct)
    if (parceiro != null && mesmo(l.parceiro, parceiro)) doParceiro.set(l.cliente_id, (doParceiro.get(l.cliente_id) ?? 0) + l.pct)
  }
  return { comLista, soma, doParceiro }
}

// "Fabio Ferron 25 % · Yallon 15 %": quem está na lista do cliente no mês, do maior percentual para o menor
export function resumoDaLista(linhas: Pick<ParceiroDoCliente, 'parceiro' | 'pct' | 'desde' | 'ate'>[], mes: string): string {
  return linhas.filter(l => emVigor(l, mes)).sort((a, b) => b.pct - a.pct || a.parceiro.localeCompare(b.parceiro, 'pt-BR'))
    .map(l => `${l.parceiro} ${pctTexto(l.pct)}`).join(' · ')
}

// ── O formulário da ficha ──────────────────────────────────────────────────────
// Uma linha por parceiro que está valendo: parceiro, percentual e desde quando vale ESTE percentual.
export type LinhaForm = { parceiro: string; pct: number; desde: string }
// Meses que o campo "Desde" oferece: do mês corrente para trás (começo no futuro não entra: marca-se no mês)
export const MESES_PARA_TRAS = 24
export function mesesDoFormulario(mesAtual: string, n = MESES_PARA_TRAS): string[] {
  return Array.from({ length: n + 1 }, (_, i) => somarMeses(mesAtual, -i))
}

const ehMes = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(v)

// O que o formulário mandou está em ordem? Devolve a frase do problema, ou null. `permitidos` = os parceiros
// que podem entrar nesta corretora (quem tem participação cadastrada); o nome casa sem acento nem caixa.
export function erroDoFormulario(enviados: LinhaForm[], mesAtual: string, permitidos: string[]): string | null {
  const vistos = new Set<string>()
  for (const s of enviados) {
    const nome = s.parceiro.trim()
    if (!nome) return 'Escolha o parceiro em todas as linhas (ou tire a linha vazia).'
    if (!permitidos.some(p => mesmo(p, nome))) return `${nome} não tem participação cadastrada nesta corretora. Cadastre o parceiro em Parâmetros antes de colocar na ficha.`
    const k = normTexto(nome)
    if (vistos.has(k)) return `${nome} aparece duas vezes na lista.`
    vistos.add(k)
    if (!Number.isFinite(s.pct) || s.pct <= 0 || s.pct > 100) return `O percentual de ${nome} precisa ficar entre 0 e 100.`
    if (Math.abs(s.pct * 100 - Math.round(s.pct * 100)) > 1e-6) return `O percentual de ${nome} aceita até duas casas decimais.`
    if (!ehMes(s.desde)) return `Escolha desde quando vale o percentual de ${nome}.`
    if (s.desde > mesAtual) return `O começo de ${nome} não pode ser um mês que ainda não chegou.`
  }
  return null
}

export type PlanoParceiros = {
  inserir: LinhaForm[]
  atualizar: { id: string; pct?: number; ate?: string | null }[]
  apagar: string[]
}

// Da lista gravada para a lista enviada pelo formulário, sem reescrever o que já passou:
//  - parceiro tirado: a linha que começou antes deste mês termina no mês passado (fica como histórico);
//    a que começou neste mês é apagada (nunca valeu num mês fechado);
//  - mesmo começo, outro percentual: corrige a linha (vale para todos os meses dela);
//  - começo novo: desse mês em diante vale o que foi enviado; o que vinha de antes termina no mês anterior.
// `apagarIds` = linhas já encerradas que o administrador mandou apagar de vez (erro de lançamento).
export function planoDeGravacao(existentes: ParceiroDoCliente[], enviados: LinhaForm[], apagarIds: string[], mesAtual: string): PlanoParceiros {
  const apagar = new Set(apagarIds.filter(id => existentes.some(e => e.id === id && e.ate != null)))
  const vivos = existentes.filter(e => !apagar.has(e.id))
  const inserir: LinhaForm[] = []
  const atualizar = new Map<string, { id: string; pct?: number; ate?: string | null }>()
  const parceiros = new Set([...vivos.filter(e => e.ate == null).map(e => normTexto(e.parceiro)), ...enviados.map(s => normTexto(s.parceiro))])
  for (const k of parceiros) {
    const dele = vivos.filter(e => normTexto(e.parceiro) === k)
    const aberto = dele.find(e => e.ate == null) ?? null
    const s = enviados.find(x => normTexto(x.parceiro) === k) ?? null
    if (!s) {
      if (aberto) { if (aberto.desde >= mesAtual) apagar.add(aberto.id); else atualizar.set(aberto.id, { id: aberto.id, ate: somarMeses(mesAtual, -1) }) }
      continue
    }
    if (aberto && aberto.desde === s.desde) {
      if (aberto.pct !== s.pct) atualizar.set(aberto.id, { id: aberto.id, pct: s.pct })
      continue
    }
    for (const r of dele) {
      if (r.desde >= s.desde) apagar.add(r.id)
      else if (r.ate == null || r.ate >= s.desde) atualizar.set(r.id, { id: r.id, ate: somarMeses(s.desde, -1) })
    }
    inserir.push({ parceiro: s.parceiro.trim(), pct: s.pct, desde: s.desde })
  }
  return { inserir, atualizar: [...atualizar.values()], apagar: [...apagar] }
}

// Como a lista fica depois do plano (para conferir a soma antes de gravar)
export function depoisDoPlano(existentes: ParceiroDoCliente[], plano: PlanoParceiros): Pick<ParceiroDoCliente, 'parceiro' | 'pct' | 'desde' | 'ate'>[] {
  const apagar = new Set(plano.apagar), mudanca = new Map(plano.atualizar.map(a => [a.id, a]))
  return [
    ...existentes.filter(e => !apagar.has(e.id)).map(e => {
      const a = mudanca.get(e.id)
      return { parceiro: e.parceiro, pct: a?.pct ?? e.pct, desde: e.desde, ate: a && a.ate !== undefined ? a.ate : e.ate }
    }),
    ...plano.inserir.map(i => ({ ...i, ate: null })),
  ]
}

// A soma dos percentuais não pode passar de 100 % em nenhum mês (ela só sobe no começo de uma linha).
// Devolve a frase do problema, ou null.
export function erroDaSoma(linhas: Pick<ParceiroDoCliente, 'pct' | 'desde' | 'ate'>[]): string | null {
  for (const mes of [...new Set(linhas.map(l => l.desde))].sort()) {
    const soma = Math.round(linhas.filter(l => emVigor(l, mes)).reduce((s, l) => s + l.pct, 0) * 100) / 100
    if (soma > 100) return `A soma dos percentuais passa de 100 % em ${mesCurto(mes)}: dá ${pctTexto(soma)}.`
  }
  return null
}
