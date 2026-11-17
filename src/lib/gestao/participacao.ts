// Participação de um parceiro na receita dos clientes dele: corretagem, zeragem e incentivo.
// Lucas, 16/11/2026: o parceiro Fabio Ferron é a ZEVE INVESTIMENTOS 5 na Genial; ele recebe metade da
// corretagem, da zeragem e do incentivo que esses clientes geram ("GENIAL: CORRETAGEM 50% | ZERAGEM 50% |
// INCENTIVO 50%"; "cliente gerou R$ 200 de incentivo: R$ 100 para ele, R$ 100 para nós").
//
// A regra fica no parâmetro parceiros_receita da corretora:
//   "nome:% da corretagem:% da zeragem:% do incentivo:desde AAAA-MM", separados por ;
// (o mesmo parceiro pode ter outra linha com outro "desde" quando os percentuais mudarem). Os clientes são
// os dos códigos de assessor ligados ao parceiro (Parâmetros › Assessores, coluna Parceiro): entra o que
// foi operado enquanto a conta estava no código.
// Corretagem e zeragem são as do sistema (lotes × tarifa e contratos zerados × R$ da zeragem), antes do
// repasse da corretora e de impostos; o incentivo é o da tela Incentivo (pontos do cliente → faixa).
// Só funções puras (testes em participacao.test.ts); as leituras ficam em consultasParticipacao.ts.
import { normTexto } from '@/lib/texto'
import { calcularRepasse, numeroParam, type ConfigRepasse } from './btg'
import type { Celula } from './extrato'
import type { IncentivoRow } from './tipos'

export const CHAVE_PARCEIROS_RECEITA = 'parceiros_receita'

export type RegraReceita = {
  nome: string
  pctCorretagem: number   // % da corretagem dos clientes dele
  pctZeragem: number      // % da zeragem
  pctIncentivo: number    // % do incentivo que a corretora paga por esses clientes
  desde: string           // primeiro mês em que vale ('AAAA-MM-01')
  // Não vem do parâmetro: o parceiro só entra nesta corretora pela lista de parceiros da ficha de algum
  // cliente (S61), sem código de assessor e sem percentual geral. Percentuais 0: nada sai dos códigos.
  soFicha?: boolean
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100
// pct % de um valor, em centavos inteiros (meio centavo sobe; em ponto flutuante 250 × 65,35 % dava 163,37)
const parteDe = (valor: number, pct: number) => Math.round((Math.round(valor * 100) * Math.round(pct * 100)) / 10000) / 100
const pctOk = (v: number | null): v is number => v != null && v >= 0 && v <= 100

// '2026-11' ou '11/2026' → '2026-11-01'
function mesDoTexto(t: string): string | null {
  const iso = /^(\d{4})-(\d{2})$/.exec(t.trim()), br = /^(\d{2})\/(\d{4})$/.exec(t.trim())
  const [ano, mes] = iso ? [iso[1], iso[2]] : br ? [br[2], br[1]] : ['', '']
  return ano && Number(mes) >= 1 && Number(mes) <= 12 ? `${ano}-${mes}-01` : null
}

// 'Fabio Ferron:50:50:50:2026-11' → regras (vazio quando alguma linha é inválida)
export function lerParceirosReceita(s: string | null | undefined): RegraReceita[] {
  if (!s || !s.trim()) return []
  const out: RegraReceita[] = []
  for (const parte of s.split(';')) {
    if (!parte.trim()) continue
    const campos = parte.split(':')
    if (campos.length < 5) return []
    const desde = mesDoTexto(campos.pop() ?? ''), inc = numeroParam(campos.pop()), zer = numeroParam(campos.pop()), cor = numeroParam(campos.pop())
    const nome = campos.join(':').trim()
    if (!nome || !desde || !pctOk(cor) || !pctOk(zer) || !pctOk(inc)) return []
    if (out.some(r => r.desde === desde && normTexto(r.nome) === normTexto(nome))) return []   // duas regras do mesmo parceiro no mesmo mês
    out.push({ nome, pctCorretagem: cor, pctZeragem: zer, pctIncentivo: inc, desde })
  }
  return out
}

// A forma gravada: por parceiro e, dentro dele, da regra mais antiga para a mais nova
export function textoParceirosReceita(regras: RegraReceita[]): string {
  return regras.filter(r => !r.soFicha)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }) || a.desde.localeCompare(b.desde))
    .map(r => `${r.nome}:${r.pctCorretagem}:${r.pctZeragem}:${r.pctIncentivo}:${r.desde.slice(0, 7)}`).join(';')
}

// As regras de um parceiro, da mais antiga para a mais nova (nomes casam sem acento nem caixa)
export const regrasDoParceiro = (regras: RegraReceita[], nome: string): RegraReceita[] =>
  regras.filter(r => normTexto(r.nome) === normTexto(nome)).sort((a, b) => a.desde.localeCompare(b.desde))

// A regra que vale num mês ('AAAA-MM-01'): a de início mais recente até ele; antes da primeira, nenhuma
export function regraDoMes(regras: RegraReceita[], mes: string): RegraReceita | null {
  let atual: RegraReceita | null = null
  for (const r of [...regras].sort((a, b) => a.desde.localeCompare(b.desde))) if (r.desde <= mes) atual = r
  return atual
}

// Quem está na lista de parceiros de alguma ficha (S61) entra nas regras da corretora mesmo sem regra no
// parâmetro, ou antes de a regra dele começar: uma regra só-ficha, de percentuais 0, a partir do primeiro
// mês da lista. Assim ele aparece em Comissões e o mês dele é calculado; dos códigos não sai nada.
export function regrasComFichas(regras: RegraReceita[], linhas: { parceiro: string; desde: string }[]): RegraReceita[] {
  const primeiro = new Map<string, { nome: string; desde: string }>()
  for (const l of linhas) { const k = normTexto(l.parceiro), x = primeiro.get(k); if (!x || l.desde < x.desde) primeiro.set(k, { nome: l.parceiro, desde: l.desde }) }
  const extras: RegraReceita[] = []
  for (const [k, f] of primeiro) {
    const dele = regras.filter(r => normTexto(r.nome) === k).sort((a, b) => a.desde.localeCompare(b.desde))
    if (!dele.length || f.desde < dele[0].desde) extras.push({ nome: dele[0]?.nome ?? f.nome, pctCorretagem: 0, pctZeragem: 0, pctIncentivo: 0, desde: f.desde, soFicha: true })
  }
  return extras.length ? [...regras, ...extras] : regras
}

// Os nomes de quem tem regra, uma vez cada (a grafia da regra mais recente)
export function nomesComRegra(regras: RegraReceita[]): string[] {
  const porNorm = new Map<string, RegraReceita>()
  for (const r of regras) { const k = normTexto(r.nome), x = porNorm.get(k); if (!x || r.desde >= x.desde) porNorm.set(k, r) }
  return [...porNorm.values()].map(r => r.nome)
}

const pctTexto = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} %`
// "100 % da corretagem, 100 % da zeragem e 50 % do incentivo"
export const textoDaRegra = (r: RegraReceita) =>
  `${pctTexto(r.pctCorretagem)} da corretagem, ${pctTexto(r.pctZeragem)} da zeragem e ${pctTexto(r.pctIncentivo)} do incentivo`
// A regra com de quem ela é ("… dos clientes do código X"); quem só entra pela lista da ficha tem outra frase
export const TEXTO_SO_FICHA = 'o percentual marcado na ficha de cada cliente (Parceiros do cliente), sobre a corretagem e a zeragem dele'
export const textoDaRegraCom = (r: RegraReceita, deQuem: string) => (r.soFicha ? TEXTO_SO_FICHA : `${textoDaRegra(r)} ${deQuem}`)
// O primeiro mês de uma regra de verdade (as do parâmetro), sem contar a que só existe pela lista das fichas
export const inicioDasRegras = (regras: RegraReceita[]): string | null => regras.filter(r => !r.soFicha).map(r => r.desde).sort()[0] ?? null

// ── Lançamentos ────────────────────────────────────────────────────────────────
// Uma linha da tabela lotes (as colunas que a conta usa)
export type LoteBruto = {
  data: string; chave_incentivo: string | null; cliente_id: string | null; conta: string | null; nome_cliente: string | null
  qtd: number; tarifa: number; zeragem_rs: number; multiplicador: number
  zeragem: boolean; posicao: boolean; acoes: boolean
}
export type LoteMedido = {
  mes: string; chave: string; cliente_id: string | null; nome: string | null
  lotes: number; zerados: number; corretagem: number; zeragem: number; pontos: number
}

// A mesma conta do resumo mensal do banco (atualizar_lotes_mes): zeragem rende contratos × R$ da zeragem;
// o resto rende lotes × tarifa e pontua; ação e posição não são lotes e rendem a corretagem fixa da linha.
export function medirLote(l: LoteBruto): LoteMedido {
  const avulsa = l.posicao || l.acoes
  return {
    mes: `${l.data.slice(0, 7)}-01`, chave: l.chave_incentivo ?? `CONTA:${l.conta ?? '?'}`, cliente_id: l.cliente_id, nome: l.nome_cliente,
    lotes: l.zeragem || avulsa ? 0 : l.qtd,
    zerados: l.zeragem ? l.qtd : 0,
    corretagem: l.zeragem ? 0 : avulsa ? l.tarifa : l.qtd * l.tarifa,
    zeragem: l.zeragem ? l.qtd * l.zeragem_rs : 0,
    pontos: l.zeragem || avulsa ? 0 : l.qtd * l.multiplicador,
  }
}

// ── O mês de um parceiro ───────────────────────────────────────────────────────
export type ClienteReceita = {
  chave: string; cliente_id: string | null; nome: string
  lotes: number; zerados: number
  corretagem: number; zeragem: number   // receita bruta do que foi operado nos códigos do parceiro
  pontos: number                         // pontos nos códigos do parceiro
  pontosCliente: number                  // pontos do cliente na corretora inteira (definem a faixa)
  faixaMin: number
  pontosFaltantes: number | null         // para a próxima faixa (null na última)
  incentivoCliente: number               // incentivo que a corretora paga pelo cliente no mês
  incentivo: number                      // a parte dele que vem dos códigos do parceiro (proporcional aos pontos)
  parteCorretagem: number; parteZeragem: number; parteIncentivo: number; total: number   // o que vai para o parceiro
  // Cliente que entra pela lista de parceiros da ficha (S61): o percentual do parceiro nele, em qualquer
  // código. Vazio = cliente dos códigos do parceiro, pela regra geral.
  pctFicha?: number | null
}
export type TotaisReceita = {
  ativos: number      // clientes com lote operado
  comFaixa: number    // clientes com incentivo
  lotes: number; zerados: number; corretagem: number; zeragem: number; incentivo: number
  parteCorretagem: number; parteZeragem: number; parteIncentivo: number; total: number
}
export type MesReceita = TotaisReceita & { mes: string; regra: RegraReceita; clientes: ClienteReceita[] }

export const TOTAIS_VAZIOS: TotaisReceita = {
  ativos: 0, comFaixa: 0, lotes: 0, zerados: 0, corretagem: 0, zeragem: 0, incentivo: 0, parteCorretagem: 0, parteZeragem: 0, parteIncentivo: 0, total: 0,
}
export function somarReceita(linhas: Pick<ClienteReceita, keyof Omit<TotaisReceita, 'ativos' | 'comFaixa'>>[]): TotaisReceita {
  const t = linhas.reduce<TotaisReceita>((s, c) => ({
    ativos: s.ativos + (c.lotes > 0 ? 1 : 0), comFaixa: s.comFaixa + (c.incentivo > 0 ? 1 : 0),
    lotes: s.lotes + c.lotes, zerados: s.zerados + c.zerados, corretagem: s.corretagem + c.corretagem, zeragem: s.zeragem + c.zeragem, incentivo: s.incentivo + c.incentivo,
    parteCorretagem: s.parteCorretagem + c.parteCorretagem, parteZeragem: s.parteZeragem + c.parteZeragem, parteIncentivo: s.parteIncentivo + c.parteIncentivo, total: s.total + c.total,
  }), TOTAIS_VAZIOS)
  // cada cliente já vem em centavos: o arredondamento aqui só tira o ruído da soma em ponto flutuante
  return { ...t, corretagem: round2(t.corretagem), zeragem: round2(t.zeragem), incentivo: round2(t.incentivo), parteCorretagem: round2(t.parteCorretagem), parteZeragem: round2(t.parteZeragem), parteIncentivo: round2(t.parteIncentivo), total: round2(t.total) }
}
// Totais de vários meses (ou de várias corretoras no mesmo mês)
export const somarMeses = (meses: TotaisReceita[]): TotaisReceita => {
  const t = meses.reduce<TotaisReceita>((s, m) => ({
    ativos: s.ativos + m.ativos, comFaixa: s.comFaixa + m.comFaixa, lotes: s.lotes + m.lotes, zerados: s.zerados + m.zerados,
    corretagem: s.corretagem + m.corretagem, zeragem: s.zeragem + m.zeragem, incentivo: s.incentivo + m.incentivo,
    parteCorretagem: s.parteCorretagem + m.parteCorretagem, parteZeragem: s.parteZeragem + m.parteZeragem, parteIncentivo: s.parteIncentivo + m.parteIncentivo, total: s.total + m.total,
  }), TOTAIS_VAZIOS)
  return { ...t, corretagem: round2(t.corretagem), zeragem: round2(t.zeragem), incentivo: round2(t.incentivo), parteCorretagem: round2(t.parteCorretagem), parteZeragem: round2(t.parteZeragem), parteIncentivo: round2(t.parteIncentivo), total: round2(t.total) }
}

type IncentivoDoCliente = Pick<IncentivoRow, 'chave' | 'nome' | 'cliente_id' | 'pontos' | 'faixa_min' | 'valor_incentivo' | 'pontos_faltantes'>

// O que o parceiro recebe num mês: os lançamentos dos códigos dele (já medidos, só deste mês), o incentivo
// do mês por cliente (incentivo_mes da corretora) e a regra que vale no mês. Um cliente que também operou
// fora dos códigos do parceiro leva para a conta só a fração do incentivo que os pontos dele nos códigos
// representam. Cada valor fecha em centavos por cliente, para a tabela somar exatamente o total.
//
// fichas (S61) = os clientes com lista de parceiros na ficha neste mês. Quem tem lista sai da regra geral,
// mesmo estando num código do parceiro; e o cliente em que este parceiro está na lista entra com o
// percentual da linha dele sobre a corretagem e a zeragem de todos os códigos nossos. O incentivo entra com
// o mesmo percentual só quando a regra do parceiro tem incentivo.
type Agrupado = { chave: string; cliente_id: string | null; nome: string | null; lotes: number; zerados: number; corretagem: number; zeragem: number; pontos: number }
export type FichasDoMes = {
  comLista: ReadonlySet<string>             // clientes com lista em vigor no mês, de qualquer parceiro
  doParceiro: ReadonlyMap<string, number>   // clientes em que este parceiro está na lista → o percentual dele
  lotes: LoteMedido[]                       // os lançamentos desses clientes, em qualquer código nosso
}
export function receitaDoMes(mes: string, lotes: LoteMedido[], incentivo: IncentivoDoCliente[], regra: RegraReceita, fichas?: FichasDoMes | null): MesReceita {
  // soma os lançamentos do mês por grupo (null = fica fora)
  const agrupar = (ls: LoteMedido[], grupoDe: (l: LoteMedido) => string | null): Agrupado[] => {
    const por = new Map<string, Agrupado>()
    for (const l of ls) {
      if (l.mes !== mes) continue
      const k = grupoDe(l)
      if (k == null) continue
      let a = por.get(k)
      if (!a) { a = { chave: l.chave, cliente_id: l.cliente_id, nome: l.nome, lotes: 0, zerados: 0, corretagem: 0, zeragem: 0, pontos: 0 }; por.set(k, a) }
      a.lotes += l.lotes; a.zerados += l.zerados; a.corretagem += l.corretagem; a.zeragem += l.zeragem; a.pontos += l.pontos
      a.cliente_id ??= l.cliente_id; a.nome ??= l.nome
    }
    return [...por.values()]
  }
  const incPorChave = new Map(incentivo.map(i => [i.chave, i]))
  const linha = (a: Agrupado, pctCorretagem: number, pctZeragem: number, pctIncentivo: number, pctFicha: number | null): ClienteReceita => {
    const i = incPorChave.get(a.chave)
    const pontosCliente = i ? Math.max(i.pontos, a.pontos) : a.pontos
    const incentivoCliente = i?.valor_incentivo ?? 0
    const fracao = pontosCliente > 0 ? Math.min(1, a.pontos / pontosCliente) : 0
    const corretagem = round2(a.corretagem), zeragem = round2(a.zeragem), inc = round2(incentivoCliente * fracao)
    const parteCorretagem = parteDe(corretagem, pctCorretagem), parteZeragem = parteDe(zeragem, pctZeragem), parteIncentivo = parteDe(inc, pctIncentivo)
    return {
      chave: a.chave, cliente_id: a.cliente_id ?? i?.cliente_id ?? null, nome: i?.nome || a.nome || 'Não cadastrado',
      lotes: a.lotes, zerados: a.zerados, corretagem, zeragem, pontos: Math.round(a.pontos), pontosCliente: Math.round(pontosCliente),
      faixaMin: i?.faixa_min ?? 0, pontosFaltantes: i?.pontos_faltantes ?? null, incentivoCliente, incentivo: inc,
      parteCorretagem, parteZeragem, parteIncentivo, total: round2(parteCorretagem + parteZeragem + parteIncentivo),
      ...(pctFicha != null ? { pctFicha } : {}),
    }
  }
  const temLista = (l: LoteMedido) => !!l.cliente_id && !!fichas?.comLista.has(l.cliente_id)
  // pelos códigos do parceiro, com a regra geral (quem só entra pela lista das fichas não tem código)
  const dosCodigos = regra.soFicha ? [] : agrupar(lotes, l => (temLista(l) ? null : l.chave))
    .map(a => linha(a, regra.pctCorretagem, regra.pctZeragem, regra.pctIncentivo, null))
  // pela lista da ficha, com o percentual do parceiro naquele cliente
  const dasFichas = !fichas ? [] : agrupar(fichas.lotes, l => (l.cliente_id && fichas.doParceiro.has(l.cliente_id) ? `${l.cliente_id}|${l.chave}` : null))
    .map(a => { const p = fichas.doParceiro.get(a.cliente_id ?? '') ?? 0; return linha(a, p, p, regra.pctIncentivo > 0 ? p : 0, p) })
  const clientes = [...dosCodigos, ...dasFichas].sort((x, y) => y.total - x.total || y.lotes - x.lotes || x.nome.localeCompare(y.nome, 'pt-BR'))
  return { mes, regra, clientes, ...somarReceita(clientes) }
}

// ── Um parceiro em várias corretoras: o mês pedido e tudo desde o início ───────
export type LivroReceita = { corretora: string; meses: MesReceita[] }
export type LinhaReceita = ClienteReceita & { corretora: string }
export type ResumoReceita = {
  mes: TotaisReceita                             // o mês pedido, somando as corretoras
  linhas: LinhaReceita[]                         // os clientes do mês, cada um com a corretora
  regras: RegraReceita[]                         // as regras em vigor no mês (uma por corretora com lançamento)
  gerado: number                                 // tudo o que o parceiro gerou desde o início das regras
  porMes: { mes: string; t: TotaisReceita }[]    // meses com lançamento, em ordem
}
export function resumirReceita(livros: LivroReceita[], mesRef: string): ResumoReceita {
  const doMes = livros.flatMap(l => l.meses.filter(m => m.mes === mesRef).map(m => ({ corretora: l.corretora, m })))
  const linhas = doMes.flatMap(({ corretora, m }) => m.clientes.map(c => ({ ...c, corretora })))
    .sort((x, y) => y.total - x.total || y.lotes - x.lotes || x.nome.localeCompare(y.nome, 'pt-BR'))
  const todos = livros.flatMap(l => l.meses)
  const meses = [...new Set(todos.map(m => m.mes))].sort()
  return {
    mes: somarMeses(doMes.map(x => x.m)), linhas, regras: doMes.map(x => x.m.regra), gerado: somarMeses(todos).total,
    porMes: meses.map(mes => ({ mes, t: somarMeses(todos.filter(m => m.mes === mes)) })),
  }
}

// "100 %" quando todas as regras do mês usam o mesmo percentual naquela parte; vazio quando diferem
// (também quando algum cliente do mês entra pela lista da ficha com outro percentual)
export function pctComum(regras: RegraReceita[], parte: 'pctCorretagem' | 'pctZeragem' | 'pctIncentivo', linhas: Pick<ClienteReceita, 'pctFicha'>[] = []): string {
  const daFicha = linhas.flatMap(l => (l.pctFicha != null ? [l.pctFicha] : []))
  if (parte === 'pctIncentivo' && daFicha.length) return ''   // na ficha o incentivo depende de a regra do parceiro ter incentivo
  const valores = [...new Set([...regras.filter(r => !r.soFicha).map(r => r[parte]), ...daFicha])]
  return valores.length === 1 ? pctTexto(valores[0]) : ''
}

// ── Planilha para enviar ao parceiro ───────────────────────────────────────────
export type LinhaPlanilhaReceita = ClienteReceita & { corretora?: string }
// Cabeçalho, uma linha por cliente e o total (a coluna Corretora só aparece quando informada)
export function planilhaReceita(linhas: LinhaPlanilhaReceita[], comCorretora = false): Celula[][] {
  const cor = <T,>(v: T): T[] => (comCorretora ? [v] : [])
  // a coluna do percentual só aparece quando algum cliente entra pela lista de parceiros da ficha
  const comFicha = linhas.some(c => c.pctFicha != null)
  const fic = <T,>(v: T): T[] => (comFicha ? [v] : [])
  const cab: Celula[] = ['Cliente', ...cor('Corretora'), ...fic('Percentual pela ficha (%)'), 'Lotes no mês', 'Contratos zerados', 'Corretagem (R$)', 'Zeragem (R$)', 'Pontos', 'Incentivo do cliente (R$)',
    'Parceiro: corretagem (R$)', 'Parceiro: zeragem (R$)', 'Parceiro: incentivo (R$)', 'Total do parceiro (R$)']
  const corpo = linhas.map<Celula[]>(c => [c.nome, ...cor(c.corretora ?? null), ...fic(c.pctFicha ?? null), c.lotes, c.zerados, c.corretagem, c.zeragem, c.pontos, c.incentivo, c.parteCorretagem, c.parteZeragem, c.parteIncentivo, c.total])
  const t = somarReceita(linhas)
  const total: Celula[] = [`Total · ${linhas.length} ${linhas.length === 1 ? 'cliente' : 'clientes'}`, ...cor(null), ...fic(null), t.lotes, t.zerados, t.corretagem, t.zeragem, null, t.incentivo, t.parteCorretagem, t.parteZeragem, t.parteIncentivo, t.total]
  return [cab, ...corpo, total]
}

// ── Participação na comissão do BTG, mês a mês ─────────────────────────────────
// No BTG o parceiro (Atual Capital, Fabio Ferron) segue a cadeia do fechamento: a comissão que o BTG paga
// sobre os clientes dele paga o imposto do escritório e ele leva a parte dele (parâmetro repasse_parceiros).
// Aqui, o que isso dá em cada mês, para a página do parceiro em Comissões e para o saldo a pagar.
export type MesRepasseBtg = {
  mes: string
  receita: number    // receita (corretagem e zeragem) dos clientes do parceiro no mês
  comissao: number   // comissão do BTG sobre eles
  imposto: number
  parte: number      // o que vai para o parceiro, em centavos
  pct: number        // % de comissão do BTG usado no mês
  fechado: boolean   // o mês já tem o percentual do fechamento (senão é prévia pelas faixas)
}

// O que os clientes de um parceiro geraram no BTG num mês, separado por como entram na conta (S61):
// os que não têm lista de parceiros na ficha valem o percentual geral dele (repasse_parceiros); os que têm
// lista em que ele está valem o percentual da linha dele.
export type BaseBtgMes = {
  padrao: number                                               // receita dos clientes dele sem lista na ficha
  fichas: { receita: number; pct: number; soma: number }[]    // por cliente com lista: a receita do cliente, o % dele e a soma dos % da lista
}
export type MedidaBtg = {
  receita: number   // receita cheia dos clientes dele (a que a página dele mostra)
  alocada: number   // a parte dela que entra no livro dele na cadeia do BTG
  pct: number       // % dele sobre a comissão líquida do livro dele
}
// Um cliente dividido entre parceiros entra uma vez só na cadeia do BTG: a receita dele é repartida entre os
// livros dos parceiros na proporção do percentual de cada um, e cada livro paga ao parceiro a soma dos
// percentuais do cliente. Assim cada parceiro recebe o percentual dele sobre a comissão líquida do cliente
// e o que sobra segue a divisão de sempre (escritório, Delta e terceiros).
export function medirBaseBtg(b: BaseBtgMes, pctGeral: number): MedidaBtg {
  let receita = Math.max(0, b.padrao), alocada = receita, peso = receita * pctGeral
  for (const f of b.fichas) {
    if (f.receita <= 0 || f.pct <= 0) continue
    receita += f.receita
    alocada += (f.receita * f.pct) / Math.max(f.soma, f.pct)
    peso += f.receita * f.pct
  }
  return { receita, alocada, pct: alocada > 0 ? peso / alocada : pctGeral }
}

// receitaBtg: 'AAAA-MM-01' → R$. receitaDoParceiro: 'AAAA-MM-01' → a receita dos clientes dele (um número,
// quando ninguém tem lista na ficha) ou a base separada (BaseBtgMes). Só entram os meses em que os clientes
// do parceiro geraram receita. `desde` corta o começo dos clientes sem lista (quem também tem regra de
// participação na receita só conta o BTG a partir dela); a linha da ficha tem o próprio começo.
// A conta é a mesma do Painel (calcularRepasse).
export function repassePorMes(cfg: ConfigRepasse, nome: string, receitaBtg: Record<string, number>, receitaDoParceiro: Record<string, number | BaseBtgMes>, desde?: string | null): MesRepasseBtg[] {
  const pctGeral = cfg.parceiros?.find(p => p.nome === nome)?.pctParceiro ?? 0
  return Object.keys(receitaDoParceiro).sort().flatMap(mes => {
    const v = receitaDoParceiro[mes] ?? 0
    const base: BaseBtgMes = typeof v === 'number' ? { padrao: v, fichas: [] } : v
    const m = medirBaseBtg(desde && mes < desde ? { ...base, padrao: 0 } : base, pctGeral)
    if (m.alocada <= 0) return []
    const r = calcularRepasse(receitaBtg[mes] ?? 0, cfg, mes, { [nome]: m.alocada }, { [nome]: m.pct })
    const p = r.parceiros.find(x => x.nome === nome)
    if (!p) return []
    // na página do parceiro a receita e a comissão são as dos clientes dele por inteiro
    const cheia = m.receita / m.alocada
    return [{ mes, receita: round2(p.receita * cheia), comissao: round2(p.comissao * cheia), imposto: round2(p.imposto * cheia), parte: round2(p.parceiro), pct: r.pctEfetivo, fechado: cfg.pctMes?.[mes.slice(0, 7)] != null }]
  })
}
