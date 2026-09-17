// Corretoras atendidas pelo escritório. A coluna `corretora` existe em
// contratos, importações, barras, tarifas e metas (supabase-s13-corretoras.sql).
export const CORRETORAS = ['GENIAL', 'XP', 'BTG'] as const
export type Corretora = (typeof CORRETORAS)[number]

// Escopo das metas anuais: o escritório inteiro ou uma corretora.
export type EscopoMeta = 'TOTAL' | Corretora
export const ESCOPOS_META: EscopoMeta[] = ['TOTAL', ...CORRETORAS]

export const CORRETORA_LABEL: Record<EscopoMeta, string> = {
  TOTAL: 'Escritório (total)',
  GENIAL: 'Genial',
  XP: 'XP',
  BTG: 'BTG',
}

// Cores fixas por corretora (gráficos e badges)
export const CORRETORA_COLOR: Record<Corretora, string> = {
  GENIAL: '#1764f4',
  XP: '#f59e0b',
  BTG: '#10b981',
}

export function isCorretora(v: unknown): v is Corretora {
  return typeof v === 'string' && (CORRETORAS as readonly string[]).includes(v)
}

export function isEscopoMeta(v: unknown): v is EscopoMeta {
  return v === 'TOTAL' || isCorretora(v)
}

export function labelCorretora(v: string | null | undefined): string {
  if (!v) return '—'
  return isEscopoMeta(v) ? CORRETORA_LABEL[v] : v
}
