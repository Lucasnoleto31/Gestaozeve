import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { deltaPct, fmtDelta } from '@/lib/format'

// Tom de cor. Só gain/loss/warn pintam; o resto é neutro (DESIGN.md §1).
// Os nomes antigos continuam aceitos até as telas migrarem.
export type Tone = 'accent' | 'gain' | 'loss' | 'warn' | 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'violet'

const TOM: Record<Tone, 'accent' | 'gain' | 'loss' | 'warn' | 'neutral'> = {
  accent: 'accent', gain: 'gain', loss: 'loss', warn: 'warn', neutral: 'neutral',
  success: 'gain', danger: 'loss', warning: 'warn', info: 'neutral', violet: 'neutral',
}
export const TONE_TEXT: Record<Tone, string> = {
  accent: 'text-accent', gain: 'text-gain', loss: 'text-loss', warn: 'text-warn', neutral: 'text-fg-muted',
  success: 'text-gain', danger: 'text-loss', warning: 'text-warn', info: 'text-fg-muted', violet: 'text-fg-muted',
}
export const TONE_SOFT: Record<Tone, string> = {
  accent: 'bg-accent-soft', gain: 'bg-gain-soft', loss: 'bg-loss-soft', warn: 'bg-warn-soft', neutral: 'bg-surface-3',
  success: 'bg-gain-soft', danger: 'bg-loss-soft', warning: 'bg-warn-soft', info: 'bg-surface-3', violet: 'bg-surface-3',
}
export const tomDe = (t: Tone) => TOM[t]

export type KpiDelta = {
  atual: number
  anterior: number | null | undefined
  // true quando "menor é melhor": inverte a cor
  menorMelhor?: boolean
  // rótulo curto do que está sendo comparado (default: 'vs período anterior')
  rotulo?: string
  // formata o valor anterior no tooltip
  fmt?: (n: number) => string
}

function classifica(pct: number, menorMelhor?: boolean) {
  const positivo = pct > 0.05
  const negativo = pct < -0.05
  const bom = menorMelhor ? negativo : positivo
  const ruim = menorMelhor ? positivo : negativo
  return { positivo, negativo, bom, ruim }
}

// Variação: só o número com sinal, colorido (gain/loss). Sem seta: o sinal já diz.
export function DeltaPill({ delta }: { delta: KpiDelta }) {
  const pct = deltaPct(delta.atual, delta.anterior)
  const rotulo = delta.rotulo ?? 'vs período anterior'
  if (pct == null) return <span className="text-micro text-fg-subtle">sem base de comparação</span>
  const { bom, ruim } = classifica(pct, delta.menorMelhor)
  const anteriorTxt = delta.anterior != null ? (delta.fmt ?? String)(delta.anterior) : '—'
  return (
    <span
      className={cn('inline-flex items-baseline gap-1 text-micro font-semibold tabular-nums', bom ? 'text-gain' : ruim ? 'text-loss' : 'text-fg-muted')}
      title={`Anterior: ${anteriorTxt} · ${rotulo}`}
    >
      {fmtDelta(pct)}
      <span className="font-normal text-fg-subtle">{rotulo}</span>
    </span>
  )
}

// Variação inline (tabelas)
export function DeltaText({ pct, menorMelhor }: { pct: number | null; menorMelhor?: boolean; icon?: boolean }) {
  if (pct == null) return <span className="text-fg-subtle">—</span>
  const { bom, ruim } = classifica(pct, menorMelhor)
  return <span className={cn('font-semibold tabular-nums', bom ? 'text-gain' : ruim ? 'text-loss' : 'text-fg-muted')}>{fmtDelta(pct)}</span>
}

// Uma célula da faixa de KPIs: rótulo, valor grande, subtexto. Sem ícone, sem
// cor própria — só a variação e, quando pedido, o valor em gain/loss.
export function KpiCard({ label, value, sub, tone = 'neutral', delta, loading, destaque, className, valueClassName }: {
  icon?: ElementType
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: Tone
  delta?: KpiDelta | null
  loading?: boolean
  destaque?: boolean   // o card principal da página, na tinta (um por página)
  className?: string
  valueClassName?: string
}) {
  const tom = TOM[tone]
  return (
    <div className={cn('kpi min-w-0 px-5 py-4', destaque && 'bg-fg', className)}>
      <p className={cn('label', destaque && 'text-bg/70')}>{label}</p>
      {loading ? (
        <div className="mt-2 space-y-2">
          <div className="skeleton h-7 w-28" />
          <div className="skeleton h-3 w-36" />
        </div>
      ) : (
        <>
          <p className={cn('mt-1.5 truncate text-kpi font-bold tracking-tight tabular-nums', destaque ? 'text-bg' : tom === 'gain' ? 'text-gain' : tom === 'loss' ? 'text-loss' : tom === 'warn' ? 'text-warn' : 'text-fg', valueClassName)}>{value}</p>
          <div className="mt-1.5 flex min-h-[16px] flex-wrap items-center gap-x-2 gap-y-0.5">
            {delta && <DeltaPill delta={delta} />}
            {sub && <span className={cn('text-micro', destaque ? 'text-bg/70' : 'text-fg-muted')}>{sub}</span>}
          </div>
        </>
      )}
    </div>
  )
}

// Faixa única com divisórias (não N caixas). No mobile vira grade de 2 colunas.
export function KpiRow({ children, cols = 4, className }: { children: ReactNode; cols?: 2 | 3 | 4 | 5 | 6 | 7; className?: string }) {
  const grid = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
    5: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5',
    6: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6',
    7: 'grid-cols-2 md:grid-cols-4 2xl:grid-cols-7',
  }[cols]
  return <div className={cn('kpi-row panel grid overflow-hidden', grid, className)}>{children}</div>
}
