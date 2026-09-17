import type { ReactNode } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AlertTone = 'danger' | 'warning' | 'success' | 'info'

const TONE: Record<AlertTone, string> = {
  danger: 'border-danger/25 bg-danger-soft text-danger',
  warning: 'border-warning/25 bg-warning-soft text-warning',
  success: 'border-success/25 bg-success-soft text-success',
  info: 'border-accent/25 bg-accent-soft text-accent',
}

const ICON: Record<AlertTone, React.ElementType> = {
  danger: AlertCircle, warning: AlertTriangle, success: CheckCircle2, info: Info,
}

export function Alert({ tone = 'info', title, children, className }: {
  tone?: AlertTone
  title?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const Icon = ICON[tone]
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border px-4 py-3 text-[13px]', TONE[tone], className)} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'opacity-90')}>{children}</div>}
      </div>
    </div>
  )
}
