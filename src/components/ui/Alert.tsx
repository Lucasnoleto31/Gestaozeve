import type { ReactNode } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AlertTone = 'loss' | 'warn' | 'gain' | 'neutral' | 'danger' | 'warning' | 'success' | 'info'

const TOM: Record<AlertTone, 'loss' | 'warn' | 'gain' | 'neutral'> = {
  loss: 'loss', warn: 'warn', gain: 'gain', neutral: 'neutral', danger: 'loss', warning: 'warn', success: 'gain', info: 'neutral',
}
// Semântica só no texto e no ícone; o fundo é o tom de card (ficha padrão)
const CLASSE = {
  loss: 'bg-surface text-loss',
  warn: 'bg-surface text-warn',
  gain: 'bg-surface text-gain',
  neutral: 'bg-surface text-fg-muted',
} as const
const ICON = { loss: AlertCircle, warn: AlertTriangle, gain: CheckCircle2, neutral: Info } as const

export function Alert({ tone = 'neutral', title, children, className }: {
  tone?: AlertTone
  title?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const t = TOM[tone]
  const Icon = ICON[t]
  return (
    <div className={cn('flex items-start gap-2.5 rounded-md px-4 py-3 text-dense', CLASSE[t], className)} role={t === 'loss' ? 'alert' : undefined}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'opacity-90')}>{children}</div>}
      </div>
    </div>
  )
}
