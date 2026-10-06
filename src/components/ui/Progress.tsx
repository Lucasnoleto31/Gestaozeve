import { cn } from '@/lib/utils'
import { tomDe, type Tone } from './Kpi'

const FILL = { accent: 'bg-accent', gain: 'bg-gain', loss: 'bg-loss', warn: 'bg-warn', neutral: 'bg-fg-subtle' } as const
const TEXT = { accent: 'text-accent', gain: 'text-gain', loss: 'text-loss', warn: 'text-warn', neutral: 'text-fg-muted' } as const

// Tom de uma meta pelo % atingido
export function metaTone(pct: number): Tone {
  return pct >= 100 ? 'gain' : pct >= 75 ? 'accent' : pct >= 50 ? 'warn' : 'loss'
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
        className={cn('bar-fill', !color && FILL[tomDe(tone)])}
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
      <span className="bar-track h-1.5 shrink-0" style={{ width }} aria-hidden>
        <span className="bar-fill block opacity-70" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
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
      <div className="mb-1 flex items-center justify-between text-body">
        <span className="font-medium text-fg">{label}</span>
        <span className={cn('font-semibold tabular-nums', !color && TEXT[tomDe(tone)])} style={{ color }}>{pct.toFixed(1)}%</span>
      </div>
      <ProgressBar pct={pct} tone={tone} color={color} className="h-2" />
      <p className="mt-1 text-label tabular-nums text-fg-muted">{realizado} de {alvo}</p>
    </div>
  )
}
