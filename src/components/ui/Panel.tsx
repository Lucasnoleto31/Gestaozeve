import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Card padrão do sistema: cabeçalho (título, subtítulo, ação) + corpo.
// flush = corpo sem padding, com overflow escondido (tabelas encostadas na borda).
export function Panel({ title, subtitle, action, icon: Icon, flush, className, bodyClassName, children }: {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  icon?: ElementType
  flush?: boolean
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  const temHeader = !!(title || action)
  return (
    <section className={cn('panel', flush && 'overflow-hidden', className)}>
      {temHeader && (
        <header className={cn('flex items-start justify-between gap-3 px-5 pt-4', flush ? 'border-b border-line pb-3' : 'pb-3')}>
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon && (
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                <Icon className="h-3.5 w-3.5" />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-sm font-semibold leading-5 text-fg">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn(!flush && 'px-5 pb-5', !flush && !temHeader && 'pt-5', bodyClassName)}>{children}</div>
    </section>
  )
}
