import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type PageStat = { label: string; value: ReactNode; sub?: ReactNode }

// Cabeçalho de página: seção (eyebrow), título, uma linha de descrição, ações à
// direita. Sem faixa própria: a hierarquia vem do tamanho e do espaço.
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
    <div className={cn('px-4 pb-2 pt-6 lg:px-8', className)}>
      {/* Título com largura mínima: quando as ações não cabem ao lado, descem para a linha de baixo */}
      <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between">
        <div className="min-w-0 md:min-w-[18rem] md:flex-1">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h1 className="text-title font-semibold tracking-tight text-fg">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-dense text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex min-w-0 flex-wrap items-center gap-2 md:ml-auto md:shrink-0">{actions}</div>}
      </div>

      {stats && stats.length > 0 && (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          {stats.map((s, i) => (
            <div key={i} className="min-w-0">
              <dt className="label">{s.label}</dt>
              <dd className="mt-0.5 text-section font-semibold leading-tight tabular-nums text-fg">{s.value}</dd>
              {s.sub && <p className="text-micro text-fg-subtle">{s.sub}</p>}
            </div>
          ))}
        </dl>
      )}

      {children}
    </div>
  )
}

// Área de conteúdo abaixo do cabeçalho
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-8 px-4 pb-10 pt-4 lg:px-8', className)}>{children}</div>
}
