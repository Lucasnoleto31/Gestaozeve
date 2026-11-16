// Como está o cliente, em uma palavra: o mesmo vocabulário na lista de Clientes e na ficha.
// Lucas, 16/11/2026: "está bem confusa. Queremos deixar ela mais intuitiva [...] eu mesmo estou perdido
// com essas páginas, imagine a equipe". A lista respondia a mesma pergunta em três colunas (Status,
// Situação, Risco) e a ficha, em quatro selos. Agora cada cliente está em um grupo só, e o grupo diz o
// que fazer com ele. Só funções puras (testes em momentoCliente.test.ts).

// Na ordem em que aparecem na tela: do que gira ao que ainda não chegou
export const MOMENTOS = ['operando', 'risco', 'inativo', 'nunca', 'abertura', 'recusou'] as const
export type Momento = (typeof MOMENTOS)[number]

export type ClienteDoMomento = {
  situacao: string                       // Ativo · Inativo · Nunca girou · Em processamento · Recusou
  risco: string | null | undefined       // parou · em queda (só cliente migrado que girou nos últimos 3 meses)
  dias_sem_giro?: number | null
  meses_sem_giro?: number | null
  lotes_media_3m?: number | null         // média de lotes dos 3 meses anteriores: maior que zero = girou neles
}

// O risco vem na frente: "Em risco" aqui é o mesmo número do Painel e do Início (todo cliente com risco).
// Situação desconhecida cai em "Em abertura", que é onde fica quem ainda não tem conta migrada.
export function momentoDoCliente(c: ClienteDoMomento): Momento {
  if (c.risco) return 'risco'
  if (c.situacao === 'Ativo') return 'operando'
  // A situação vira "Inativo" assim que o mês troca e o cliente ainda não girou nele. Quem girou nos 3
  // meses anteriores e não entrou em risco está só no começo do mês: em poucos dias gira de novo ou vira
  // "parou". Continua operando; inativo é quem está sem giro há mais de 3 meses.
  if (c.situacao === 'Inativo') return (c.lotes_media_3m ?? 0) > 0 ? 'operando' : 'inativo'
  if (c.situacao === 'Nunca girou') return 'nunca'
  if (c.situacao === 'Recusou') return 'recusou'
  return 'abertura'
}

// O grupo, no plural (cartões da lista)
export const MOMENTO_GRUPO: Record<Momento, string> = {
  operando: 'Operando', risco: 'Em risco', inativo: 'Inativos', nunca: 'Nunca operaram', abertura: 'Em abertura', recusou: 'Recusaram',
}
// O que é cada grupo em poucas palavras (linha pequena do cartão)
export const MOMENTO_RESUMO: Record<Momento, string> = {
  operando: 'giram no ritmo normal', risco: 'caíram ou pararam há pouco', inativo: 'sem giro há mais de 3 meses',
  nunca: 'migraram e ainda não giraram', abertura: 'conta ainda não migrou', recusou: 'não quiseram migrar',
}
// O que é cada grupo e o que ele pede, em uma frase (subtítulo da lista com o grupo escolhido)
export const MOMENTO_EXPLICA: Record<Momento, string> = {
  operando: 'Estão girando no ritmo normal.',
  risco: 'Giraram nos últimos 3 meses e pararam há dias, ou estão girando bem menos que o normal. São os primeiros a chamar.',
  inativo: 'Já giraram e estão sem giro há mais de 3 meses.',
  nunca: 'A conta migrou e ainda não teve nenhum lote: é a lista da campanha de ativação.',
  abertura: 'A conta ainda não migrou: acompanhar a abertura.',
  recusou: 'Não quiseram migrar.',
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

// O estado de um cliente, do jeito que aparece na linha da lista e no alto da ficha
export function rotuloMomento(c: ClienteDoMomento): string {
  switch (momentoDoCliente(c)) {
    case 'operando': return 'Operando'
    case 'risco': return c.risco === 'parou' ? (c.dias_sem_giro ? `Parou há ${plural(c.dias_sem_giro, 'dia', 'dias')}` : 'Parou') : 'Em queda'
    case 'inativo': return c.meses_sem_giro ? `Inativo há ${plural(c.meses_sem_giro, 'mês', 'meses')}` : 'Inativo'
    case 'nunca': return 'Nunca operou'
    case 'abertura': return 'Em abertura'
    case 'recusou': return 'Recusou'
  }
}

// Cor só para o que está acontecendo agora: verde opera, âmbar caiu, vermelho parou. O resto fica neutro.
export type TomMomento = 'gain' | 'warn' | 'loss' | 'neutral'
export function tomDoMomento(c: ClienteDoMomento): TomMomento {
  const m = momentoDoCliente(c)
  if (m === 'operando') return 'gain'
  if (m === 'risco') return c.risco === 'parou' ? 'loss' : 'warn'
  return 'neutral'
}

// A dica do selo: o que o estado quer dizer
export function dicaDoMomento(c: ClienteDoMomento): string {
  const m = momentoDoCliente(c)
  if (m !== 'risco') return MOMENTO_EXPLICA[m]
  return c.risco === 'parou'
    ? 'Girou nos últimos 3 meses e está sem giro há dias (contados até o último dia lançado).'
    : 'No ritmo atual fecha o mês bem abaixo da média dos 3 meses anteriores.'
}

// ── A base inteira por grupo ────────────────────────────────────────────────
// Quantos clientes há em cada grupo; dentro de "Em risco", quantos pararam e quantos estão em queda; e
// quantos giraram no mês (a situação Ativo, que inclui quem girou e está em risco). É a conta do Painel,
// para ele mostrar os mesmos números dos cartões da tela Clientes.
export type ContagemDaBase = { total: number; por: Record<Momento, number>; pararam: number; emQueda: number; giraram: number }
export function contarPorMomento(rows: ClienteDoMomento[]): ContagemDaBase {
  const por: Record<Momento, number> = { operando: 0, risco: 0, inativo: 0, nunca: 0, abertura: 0, recusou: 0 }
  let pararam = 0, emQueda = 0, giraram = 0
  for (const c of rows) {
    por[momentoDoCliente(c)]++
    if (c.risco === 'parou') pararam++
    else if (c.risco) emQueda++
    if (c.situacao === 'Ativo') giraram++
  }
  return { total: rows.length, por, pararam, emQueda, giraram }
}

// Clientes, lotes e receita de cada grupo (tela Receita): só os grupos que têm alguém, na ordem da tela
export type SomaDoGrupo = { momento: Momento; clientes: number; lotes12m: number; receita12m: number; receitaMes: number }
export function somarPorMomento(rows: (ClienteDoMomento & { lotes_12m: number; receita_12m: number; receita_mes: number })[]): SomaDoGrupo[] {
  const por = new Map<Momento, SomaDoGrupo>()
  for (const c of rows) {
    const m = momentoDoCliente(c)
    const g = por.get(m) ?? { momento: m, clientes: 0, lotes12m: 0, receita12m: 0, receitaMes: 0 }
    g.clientes++; g.lotes12m += c.lotes_12m; g.receita12m += c.receita_12m; g.receitaMes += c.receita_mes
    por.set(m, g)
  }
  return MOMENTOS.flatMap(m => { const g = por.get(m); return g ? [g] : [] })
}

// A situação que vinha nos endereços antigos (?situacao=) e vale por um grupo inteiro. "Ativo" e "Inativo"
// não entram: incluíam quem está em risco, então não correspondem a um grupo só.
export const MOMENTO_DA_SITUACAO: Record<string, Momento> = { 'Nunca girou': 'nunca', 'Em processamento': 'abertura', Recusou: 'recusou' }
