// Movimento de clientes (quem parou, quem chegou, quem voltou) — tipo e
// mapeador compartilhados pelo painel do admin e pela visão do assessor.

export type TipoMovimento = 'parou' | 'novo' | 'voltou'

export type ClienteMovimentoRow = {
  tipo: TipoMovimento
  cliente_key: string
  cliente_nome: string
  conta: string | null
  documento: string | null
  corretora: string
  barra_nome: string
  lotes_atual: number
  lotes_anterior: number
  primeira_operacao: string | null
  ultima_operacao: string | null
  dias_sem_operar: number | null
}

const n = (v: unknown) => (v == null ? 0 : Number(v))
const s = (v: unknown) => (v == null ? null : String(v))

export function mapClienteMovimento(rows: unknown): ClienteMovimentoRow[] {
  return ((rows ?? []) as Record<string, unknown>[]).map(r => ({
    tipo: (r.tipo === 'novo' || r.tipo === 'voltou' ? r.tipo : 'parou') as TipoMovimento,
    cliente_key: String(r.cliente_key ?? ''),
    cliente_nome: String(r.cliente_nome ?? 'Sem cliente'),
    conta: s(r.conta),
    documento: s(r.documento),
    corretora: String(r.corretora ?? 'GENIAL'),
    barra_nome: String(r.barra_nome ?? 'Sem barra'),
    lotes_atual: n(r.lotes_atual),
    lotes_anterior: n(r.lotes_anterior),
    primeira_operacao: s(r.primeira_operacao),
    ultima_operacao: s(r.ultima_operacao),
    dias_sem_operar: r.dias_sem_operar == null ? null : Number(r.dias_sem_operar),
  }))
}
