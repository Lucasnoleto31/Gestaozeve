import { cn } from '@/lib/utils'

// Chip de estado. Sempre com o fio (hairline) e o fundo da página: a semântica fica só
// no texto — gain (Ativo, Migrado, Vinculado), loss (Recusou, Bloqueado), warn (Inativo,
// Não vinculado). "accent" é o chip na tinta (fundo --fg), para o que precisa saltar.
export type BadgeVariant = 'neutral' | 'gain' | 'loss' | 'warn' | 'accent' | 'default' | 'success' | 'warning' | 'danger' | 'info'

const VARIANT: Record<BadgeVariant, string> = {
  neutral: 'border border-line text-fg-muted',
  gain: 'border border-line text-gain',
  loss: 'border border-line text-loss',
  warn: 'border border-line text-warn',
  accent: 'bg-fg text-bg',
  // nomes antigos (somem quando as telas migrarem)
  default: 'border border-line text-fg-muted',
  success: 'border border-line text-gain',
  warning: 'border border-line text-warn',
  danger: 'border border-line text-loss',
  info: 'border border-line text-fg-muted',
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
