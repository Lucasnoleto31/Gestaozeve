import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

// Esqueleto de tabela enquanto um bloco carrega pela primeira vez
export function TableSkeleton({ linhas = 6, colunas = 5 }: { linhas?: number; colunas?: number }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-line">
      <div className="bg-surface-2 px-3 py-2.5">
        <div className="skeleton h-3 w-1/3" />
      </div>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex gap-3 border-t border-line px-3 py-2.5">
          {Array.from({ length: colunas }).map((_, j) => (
            <div key={j} className="skeleton h-3" style={{ width: j === 0 ? '28%' : '14%' }} />
          ))}
        </div>
      ))}
    </div>
  )
}

// Placeholder de gráfico
export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return <div className="skeleton w-full rounded-lg" style={{ height }} />
}

// Estado vazio padrão dos blocos
export function Empty({ loading, children }: { loading?: boolean; children?: React.ReactNode }) {
  if (loading) return <TableSkeleton />
  return <p className="py-8 text-center text-sm text-fg-subtle">{children ?? 'Sem dados no período.'}</p>
}
