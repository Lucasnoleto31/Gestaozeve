import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Bloco de página. Dois jeitos (DESIGN.md §3):
//  - section (padrão): título + respiro, sem caixa. A tabela/gráfico é o objeto visual.
//  - card: superfície destacada (KPI, ficha, bloco flutuante). flush = corpo sem padding.
export function Panel({ title, subtitle, action, icon: Icon, variant = 'section', flush, className, bodyClassName, children }: {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  icon?: ElementType
  variant?: 'section' | 'card'
  flush?: boolean
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  const temHeader = !!(title || action)
  const header = temHeader && (
    <header className={cn('flex items-start justify-between gap-3', variant === 'card' ? (flush ? 'border-b border-line px-5 py-4' : 'px-5 pb-3 pt-5') : 'mb-3')}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && (
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-accent-soft text-accent">
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          {title && <h2 className="text-section font-semibold text-fg">{title}</h2>}
          {subtitle && <p className="mt-0.5 text-dense text-fg-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  )

  if (variant === 'card') {
    return (
      <section className={cn('panel', flush && 'overflow-hidden', className)}>
        {header}
        <div className={cn(!flush && 'px-5 pb-5', !flush && !temHeader && 'pt-5', bodyClassName)}>{children}</div>
      </section>
    )
  }
  return (
    <section className={cn('min-w-0', className)}>
      {header}
      <div className={cn('min-w-0', bodyClassName)}>{children}</div>
    </section>
  )
}
