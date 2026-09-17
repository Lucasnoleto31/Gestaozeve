import { cn } from '@/lib/utils'
import type { Tone } from './Kpi'

const FILL: Record<Tone, string> = {
  accent: 'bg-accent', success: 'bg-success', danger: 'bg-danger', warning: 'bg-warning',
  info: 'bg-info', violet: 'bg-violet', neutral: 'bg-fg-subtle',
}
const TEXT: Record<Tone, string> = {
  accent: 'text-accent', success: 'text-success', danger: 'text-danger', warning: 'text-warning',
  info: 'text-info', violet: 'text-violet', neutral: 'text-fg-muted',
}

// Tom de uma meta pelo % atingido
export function metaTone(pct: number): Tone {
  return pct >= 100 ? 'success' : pct >= 75 ? 'accent' : pct >= 50 ? 'warning' : 'danger'
}

export function ProgressBar({ pct, tone = 'accent', color, className }: {
  pct: number
  tone?: Tone
  color?: string          // cor livre (ex.: cor da corretora)
  className?: string
}) {
  return (
    <div className={cn('bar-track', className)}>
      <div
        className={cn('bar-fill', !color && FILL[tone])}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
      />
    </div>
  )
}

// Barra de participação pra dentro de tabelas: trilho fixo + % ao lado
export function ShareBar({ pct, color, width = 64, className }: {
  pct: number
  color?: string
  width?: number
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center justify-end gap-2', className)}>
      <span className="bar-track h-1.5 shrink-0" style={{ width }}>
        <span className="bar-fill block opacity-80" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      </span>
      <span className="tabular-nums text-fg-muted">{pct.toFixed(1)}%</span>
    </span>
  )
}

// Progresso de meta: rótulo, %, barra e "realizado de alvo"
export function MetaProgress({ label, pct, realizado, alvo, color }: {
  label: string
  pct: number
  realizado: string
  alvo: string
  color?: string
}) {
  const tone = metaTone(pct)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-fg">{label}</span>
        <span className={cn('font-semibold tabular-nums', !color && TEXT[tone])} style={{ color }}>{pct.toFixed(1)}%</span>
      </div>
      <ProgressBar pct={pct} tone={tone} color={color} className="h-2" />
      <p className="mt-1 text-xs tabular-nums text-fg-muted">{realizado} de {alvo}</p>
    </div>
  )
}
