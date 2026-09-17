import type { ElementType, ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { deltaPct, fmtDelta } from '@/lib/format'

export type Tone = 'accent' | 'success' | 'danger' | 'warning' | 'info' | 'violet' | 'neutral'

export const TONE_TEXT: Record<Tone, string> = {
  accent: 'text-accent', success: 'text-success', danger: 'text-danger', warning: 'text-warning',
  info: 'text-info', violet: 'text-violet', neutral: 'text-fg-muted',
}
export const TONE_SOFT: Record<Tone, string> = {
  accent: 'bg-accent-soft', success: 'bg-success-soft', danger: 'bg-danger-soft', warning: 'bg-warning-soft',
  info: 'bg-info-soft', violet: 'bg-violet-soft', neutral: 'bg-surface-3',
}

export type KpiDelta = {
  atual: number
  anterior: number | null | undefined
  // true quando "menor é melhor" (ex.: % zeragem): inverte a cor
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

export function DeltaPill({ delta }: { delta: KpiDelta }) {
  const pct = deltaPct(delta.atual, delta.anterior)
  const rotulo = delta.rotulo ?? 'vs período anterior'
  if (pct == null) return <span className="text-[11px] text-fg-subtle">sem base de comparação</span>
  const { positivo, negativo, bom, ruim } = classifica(pct, delta.menorMelhor)
  const Icon = positivo ? ArrowUpRight : negativo ? ArrowDownRight : Minus
  const anteriorTxt = delta.anterior != null ? (delta.fmt ?? String)(delta.anterior) : '—'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
        bom ? 'bg-success-soft text-success' : ruim ? 'bg-danger-soft text-danger' : 'bg-surface-3 text-fg-muted',
      )}
      title={`Anterior: ${anteriorTxt} · ${rotulo}`}
    >
      <Icon className="h-3 w-3" />
      {fmtDelta(pct)}
      <span className="font-normal opacity-75">{rotulo}</span>
    </span>
  )
}

// Variação inline (tabelas): só o número colorido, sem fundo
export function DeltaText({ pct, menorMelhor, icon }: { pct: number | null; menorMelhor?: boolean; icon?: boolean }) {
  if (pct == null) return <span className="text-fg-subtle">—</span>
  const { positivo, negativo, bom, ruim } = classifica(pct, menorMelhor)
  const Icon = positivo ? ArrowUpRight : negativo ? ArrowDownRight : null
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-semibold tabular-nums', bom ? 'text-success' : ruim ? 'text-danger' : 'text-fg-muted')}>
      {icon && Icon && <Icon className="h-3 w-3" />}
      {fmtDelta(pct)}
    </span>
  )
}

export function KpiCard({ icon: Icon, label, value, sub, tone = 'accent', delta, loading, className, valueClassName }: {
  icon?: ElementType
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: Tone
  delta?: KpiDelta | null
  loading?: boolean
  className?: string
  valueClassName?: string
}) {
  return (
    <div className={cn('panel min-w-0 p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="label truncate">{label}</p>
        {Icon && (
          <span className={cn('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md', TONE_SOFT[tone], TONE_TEXT[tone])}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      {loading ? (
        <div className="mt-3 space-y-2">
          <div className="skeleton h-7 w-28" />
          <div className="skeleton h-3 w-36" />
        </div>
      ) : (
        <>
          <p className={cn('mt-2 text-[26px] font-semibold leading-none tracking-tight tabular-nums text-fg', valueClassName)}>{value}</p>
          <div className="mt-2 flex min-h-[18px] flex-wrap items-center gap-x-2 gap-y-1">
            {delta && <DeltaPill delta={delta} />}
            {sub && <span className="text-xs text-fg-muted">{sub}</span>}
          </div>
        </>
      )}
    </div>
  )
}

export function KpiRow({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  const grid = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-3',
    4: 'grid-cols-2 xl:grid-cols-4',
    5: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5',
  }[cols]
  return <div className={cn('grid gap-3', grid)}>{children}</div>
}
