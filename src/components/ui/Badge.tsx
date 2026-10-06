import { cn } from '@/lib/utils'

// Neutro por padrão (hairline + texto apagado). Cor só para estado que importa:
// gain (ativo, migrado, ganho), loss (perdido, recusou, crítico), warn (atenção).
export type BadgeVariant = 'neutral' | 'gain' | 'loss' | 'warn' | 'accent' | 'default' | 'success' | 'warning' | 'danger' | 'info'

const VARIANT: Record<BadgeVariant, string> = {
  neutral: 'border border-line-strong text-fg-muted',
  gain: 'bg-gain-soft text-gain',
  loss: 'bg-loss-soft text-loss',
  warn: 'bg-warn-soft text-warn',
  accent: 'bg-accent-soft text-accent',
  // nomes antigos (somem quando as telas migrarem)
  default: 'border border-line-strong text-fg-muted',
  success: 'bg-gain-soft text-gain',
  warning: 'bg-warn-soft text-warn',
  danger: 'bg-loss-soft text-loss',
  info: 'border border-line-strong text-fg-muted',
}

export function Badge({ children, variant = 'neutral', className }: {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}) {
  return (
    <span className={cn('inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-sm px-2 text-micro font-medium', VARIANT[variant], className)}>
      {children}
    </span>
  )
}
