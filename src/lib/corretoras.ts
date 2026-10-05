// Corretoras atendidas pelo escritório. Cada uma tem o seu controle (painel,
// clientes, lotes, incentivo, leads…) sobre as mesmas tabelas, separadas pela
// coluna `corretora`.
export const CORRETORAS = ['GENIAL', 'XP', 'BTG'] as const
export type Corretora = (typeof CORRETORAS)[number]

export const CORRETORA_LABEL: Record<Corretora, string> = {
  GENIAL: 'Genial',
  XP: 'XP',
  BTG: 'BTG',
}

// Cor por corretora como variável CSS: muda com o tema (globals.css).
export const CORRETORA_COLOR: Record<Corretora, string> = {
  GENIAL: 'var(--c-genial)',
  XP: 'var(--c-xp)',
  BTG: 'var(--c-btg)',
}

// Cookie com a última corretora aberta (o menu usa fora das rotas de corretora)
export const CORRETORA_COOKIE = 'zeve-corretora'

// Segmento da URL: /genial/painel, /xp/clientes…
export const CORRETORA_SLUG: Record<Corretora, string> = {
  GENIAL: 'genial',
  XP: 'xp',
  BTG: 'btg',
}

export function isCorretora(v: unknown): v is Corretora {
  return typeof v === 'string' && (CORRETORAS as readonly string[]).includes(v)
}

export function corretoraDoSlug(slug: string | null | undefined): Corretora | null {
  const s = (slug ?? '').toLowerCase()
  return CORRETORAS.find(c => CORRETORA_SLUG[c] === s) ?? null
}

export function labelCorretora(v: string | null | undefined): string {
  if (!v) return '—'
  return isCorretora(v) ? CORRETORA_LABEL[v] : v
}

// Páginas do controle de cada corretora (ordem do menu)
export const PAGINAS_CORRETORA: { id: string; label: string; hint: string }[] = [
  { id: 'painel',     label: 'Painel',     hint: 'Indicadores do mês, base por status e alertas' },
  { id: 'clientes',   label: 'Clientes',   hint: 'Cadastro mestre: contas, status, tarifa, giro e situação' },
  { id: 'lotes',      label: 'Diário',     hint: 'Giro por dia, média móvel e tendência' },
  { id: 'assessores', label: 'Assessores', hint: 'Resumo, mapa de calor mensal e top clientes por assessor' },
  { id: 'receita',    label: 'Receita',    hint: 'Receita por cliente e situação (ativo, inativo, nunca girou)' },
  { id: 'incentivo',  label: 'Incentivo',  hint: 'Pontos, faixas e bônus pago pela corretora' },
  { id: 'leads',      label: 'Leads',      hint: 'Leads do formulário e trabalho da equipe' },
  { id: 'funil',      label: 'Funil',      hint: 'Funil mensal, por responsável e por origem' },
  { id: 'importar',   label: 'Importar',   hint: 'Exports da corretora: clientes, lotes e leads' },
  { id: 'parametros', label: 'Parâmetros', hint: 'Assessores, tarifas, faixas, multiplicadores e mapas' },
]
