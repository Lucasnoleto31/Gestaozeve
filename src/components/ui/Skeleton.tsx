import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

// Esqueleto de tabela enquanto um bloco carrega pela primeira vez
export function TableSkeleton({ linhas = 6, colunas = 5 }: { linhas?: number; colunas?: number }) {
  return (
    <div className="overflow-hidden rounded-md border border-line" aria-hidden>
      <div className="px-3 py-3">
        <div className="skeleton h-3 w-1/3" />
      </div>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex gap-3 border-t border-line px-3 py-3">
          {Array.from({ length: colunas }).map((_, j) => (
            <div key={j} className="skeleton h-3" style={{ width: j === 0 ? '28%' : '14%' }} />
          ))}
        </div>
      ))}
    </div>
  )
}

// Faixa de KPIs em carga
export function KpiSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <div className="panel grid grid-cols-2 overflow-hidden md:grid-cols-4" aria-hidden>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="px-5 py-4">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton mt-3 h-7 w-28" />
          <div className="skeleton mt-2 h-3 w-32" />
        </div>
      ))}
    </div>
  )
}

// Placeholder de gráfico
export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return <div className="skeleton w-full" style={{ height }} aria-hidden />
}

// Página inteira em carga: cabeçalho + KPIs + tabela (usado pelos loading.tsx)
export function PageSkeleton({ kpis = 4, linhas = 8 }: { kpis?: number; linhas?: number }) {
  return (
    <div className="px-4 pt-6 lg:px-8" aria-busy="true" aria-label="Carregando">
      <div className="skeleton h-3 w-32" />
      <div className="skeleton mt-3 h-6 w-56" />
      <div className="skeleton mt-2 h-3 w-96 max-w-full" />
      <div className="mt-8"><KpiSkeleton cols={kpis} /></div>
      <div className="mt-8"><TableSkeleton linhas={linhas} /></div>
    </div>
  )
}

// Estado vazio padrão: frase curta e, se houver, a próxima ação
export function Empty({ loading, icon: Icon = Inbox, action, children }: {
  loading?: boolean
  icon?: React.ElementType
  action?: ReactNode
  children?: ReactNode
}) {
  if (loading) return <TableSkeleton />
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Icon className="h-5 w-5 text-fg-subtle" aria-hidden />
      <p className="text-dense text-fg-subtle">{children ?? 'Nada por aqui ainda.'}</p>
      {action}
    </div>
  )
}
