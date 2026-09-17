import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type PageStat = { label: string; value: ReactNode; sub?: ReactNode }

// Cabeçalho de página: seção (eyebrow), título, descrição, ações à direita,
// indicadores rápidos e, opcionalmente, abas (PageTabs) coladas na borda.
export function PageHeader({ eyebrow, title, description, actions, stats, children, className }: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  stats?: PageStat[]
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('border-b border-line bg-surface', className)}>
      <div className="flex flex-col gap-4 px-4 pb-5 pt-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-fg">{title}</h1>
            {description && <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-fg-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>

        {stats && stats.length > 0 && (
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            {stats.map((s, i) => (
              <div key={i} className="min-w-0">
                <dt className="label">{s.label}</dt>
                <dd className="mt-0.5 text-lg font-semibold leading-tight tabular-nums text-fg">{s.value}</dd>
                {s.sub && <p className="text-[11px] text-fg-subtle">{s.sub}</p>}
              </div>
            ))}
          </dl>
        )}

        {children}
      </div>
    </div>
  )
}

// Área de conteúdo abaixo do cabeçalho
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-5 px-4 py-6 lg:px-8', className)}>{children}</div>
}
