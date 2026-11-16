// Participação de um parceiro na receita dos clientes dele: corretagem, zeragem e incentivo.
// Lucas, 16/11/2026: o parceiro Fabio PTAX é a ZEVE INVESTIMENTOS 5 na Genial; ele recebe a corretagem e a
// zeragem desses clientes e metade do incentivo que a corretora paga por eles ("cliente gerou R$ 200 de
// incentivo: R$ 100 para ele, R$ 100 para nós").
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
import { numeroParam } from './btg'
import type { Celula } from './extrato'
import type { IncentivoRow } from './tipos'

export const CHAVE_PARCEIROS_RECEITA = 'parceiros_receita'

export type RegraReceita = {
  nome: string
  pctCorretagem: number   // % da corretagem dos clientes dele
  pctZeragem: number      // % da zeragem
  pctIncentivo: number    // % do incentivo que a corretora paga por esses clientes
  desde: string           // primeiro mês em que vale ('AAAA-MM-01')
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

// 'Fabio PTAX:100:100:50:2026-11' → regras (vazio quando alguma linha é inválida)
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
  return [...regras]
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
export function receitaDoMes(mes: string, lotes: LoteMedido[], incentivo: IncentivoDoCliente[], regra: RegraReceita): MesReceita {
  const porChave = new Map<string, { chave: string; cliente_id: string | null; nome: string | null; lotes: number; zerados: number; corretagem: number; zeragem: number; pontos: number }>()
  for (const l of lotes) {
    if (l.mes !== mes) continue
    let a = porChave.get(l.chave)
    if (!a) { a = { chave: l.chave, cliente_id: l.cliente_id, nome: l.nome, lotes: 0, zerados: 0, corretagem: 0, zeragem: 0, pontos: 0 }; porChave.set(l.chave, a) }
    a.lotes += l.lotes; a.zerados += l.zerados; a.corretagem += l.corretagem; a.zeragem += l.zeragem; a.pontos += l.pontos
    a.cliente_id ??= l.cliente_id; a.nome ??= l.nome
  }
  const incPorChave = new Map(incentivo.map(i => [i.chave, i]))
  const clientes = [...porChave.values()].map<ClienteReceita>(a => {
    const i = incPorChave.get(a.chave)
    const pontosCliente = i ? Math.max(i.pontos, a.pontos) : a.pontos
    const incentivoCliente = i?.valor_incentivo ?? 0
    const fracao = pontosCliente > 0 ? Math.min(1, a.pontos / pontosCliente) : 0
    const corretagem = round2(a.corretagem), zeragem = round2(a.zeragem), inc = round2(incentivoCliente * fracao)
    const parteCorretagem = parteDe(corretagem, regra.pctCorretagem), parteZeragem = parteDe(zeragem, regra.pctZeragem), parteIncentivo = parteDe(inc, regra.pctIncentivo)
    return {
      chave: a.chave, cliente_id: a.cliente_id ?? i?.cliente_id ?? null, nome: i?.nome || a.nome || 'Não cadastrado',
      lotes: a.lotes, zerados: a.zerados, corretagem, zeragem, pontos: Math.round(a.pontos), pontosCliente: Math.round(pontosCliente),
      faixaMin: i?.faixa_min ?? 0, pontosFaltantes: i?.pontos_faltantes ?? null, incentivoCliente, incentivo: inc,
      parteCorretagem, parteZeragem, parteIncentivo, total: round2(parteCorretagem + parteZeragem + parteIncentivo),
    }
  }).sort((x, y) => y.total - x.total || y.lotes - x.lotes || x.nome.localeCompare(y.nome, 'pt-BR'))
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
export function pctComum(regras: RegraReceita[], parte: 'pctCorretagem' | 'pctZeragem' | 'pctIncentivo'): string {
  const valores = [...new Set(regras.map(r => r[parte]))]
  return valores.length === 1 ? pctTexto(valores[0]) : ''
}

// ── Planilha para enviar ao parceiro ───────────────────────────────────────────
export type LinhaPlanilhaReceita = ClienteReceita & { corretora?: string }
// Cabeçalho, uma linha por cliente e o total (a coluna Corretora só aparece quando informada)
export function planilhaReceita(linhas: LinhaPlanilhaReceita[], comCorretora = false): Celula[][] {
  const cor = <T,>(v: T): T[] => (comCorretora ? [v] : [])
  const cab: Celula[] = ['Cliente', ...cor('Corretora'), 'Lotes no mês', 'Contratos zerados', 'Corretagem (R$)', 'Zeragem (R$)', 'Pontos', 'Incentivo do cliente (R$)',
    'Parceiro: corretagem (R$)', 'Parceiro: zeragem (R$)', 'Parceiro: incentivo (R$)', 'Total do parceiro (R$)']
  const corpo = linhas.map<Celula[]>(c => [c.nome, ...cor(c.corretora ?? null), c.lotes, c.zerados, c.corretagem, c.zeragem, c.pontos, c.incentivo, c.parteCorretagem, c.parteZeragem, c.parteIncentivo, c.total])
  const t = somarReceita(linhas)
  const total: Celula[] = [`Total · ${linhas.length} ${linhas.length === 1 ? 'cliente' : 'clientes'}`, ...cor(null), t.lotes, t.zerados, t.corretagem, t.zeragem, null, t.incentivo, t.parteCorretagem, t.parteZeragem, t.parteIncentivo, t.total]
  return [cab, ...corpo, total]
}
