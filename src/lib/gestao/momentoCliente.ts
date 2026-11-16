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
}

// O risco vem na frente: "Em risco" aqui é o mesmo número do Painel e do Início (todo cliente com risco).
// Situação desconhecida cai em "Em abertura", que é onde fica quem ainda não tem conta migrada.
export function momentoDoCliente(c: ClienteDoMomento): Momento {
  if (c.risco) return 'risco'
  if (c.situacao === 'Ativo') return 'operando'
  if (c.situacao === 'Inativo') return 'inativo'
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
  operando: 'giram no ritmo normal', risco: 'caíram ou pararam há pouco', inativo: 'já giraram, parados há mais tempo',
  nunca: 'migraram e ainda não giraram', abertura: 'conta ainda não migrou', recusou: 'não quiseram migrar',
}
// O que é cada grupo e o que ele pede, em uma frase (subtítulo da lista com o grupo escolhido)
export const MOMENTO_EXPLICA: Record<Momento, string> = {
  operando: 'Giraram no mês e estão no ritmo normal.',
  risco: 'Giraram nos últimos 3 meses e pararam há dias, ou estão girando bem menos que o normal. São os primeiros a chamar.',
  inativo: 'Já giraram e estão parados há mais tempo.',
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

// A situação que vinha nos endereços antigos (?situacao=) e vale por um grupo inteiro. "Ativo" e "Inativo"
// não entram: incluíam quem está em risco, então não correspondem a um grupo só.
export const MOMENTO_DA_SITUACAO: Record<string, Momento> = { 'Nunca girou': 'nunca', 'Em processamento': 'abertura', Recusou: 'recusou' }
