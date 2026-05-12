// KPI card compartilhado entre as views — padrão visual unico do dashboard.
// 3-5 desses no topo de cada aba, com sub label opcional e accent colorido.

import type { ElementType } from 'react'

export function KpiCard({ icon: Icon, label, value, sub, accent = '#1764f4', valueColor }: {
  icon?: ElementType
  label: string
  value: string | number
  sub?: string
  accent?: string
  valueColor?: string
}) {
  return (
    <div className="rounded-xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${accent}` }}>
      <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold inline-flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" style={{ color: accent }} />}
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: valueColor ?? '#1f2937' }}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

export function KpiRow({ children, cols = 4 }: { children: React.ReactNode; cols?: 3 | 4 | 5 }) {
  const grid = cols === 3 ? 'grid-cols-1 md:grid-cols-3' : cols === 5 ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-4'
  return <div className={`grid ${grid} gap-3`}>{children}</div>
}
