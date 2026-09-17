// KPI card compartilhado entre as views — padrão visual único do dashboard.
// 3-5 desses no topo de cada aba, com sub label, variação vs período anterior
// e estado de carregamento.

import type { ElementType } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { deltaPct, fmtDelta } from './utils'

export type KpiDelta = {
  atual: number
  anterior: number | null | undefined
  // true quando "menor é melhor" (ex.: lotes zerados): inverte a cor
  menorMelhor?: boolean
  // rótulo curto do que está sendo comparado (default: 'vs período anterior')
  rotulo?: string
  // formata o valor anterior no tooltip
  fmt?: (n: number) => string
}

function DeltaPill({ delta }: { delta: KpiDelta }) {
  const pct = deltaPct(delta.atual, delta.anterior)
  const rotulo = delta.rotulo ?? 'vs período anterior'
  if (pct == null) {
    return <span className="text-[11px] text-gray-400">sem base de comparação</span>
  }
  const positivo = pct > 0.05
  const negativo = pct < -0.05
  const bom = delta.menorMelhor ? negativo : positivo
  const ruim = delta.menorMelhor ? positivo : negativo
  const color = bom ? '#059669' : ruim ? '#dc2626' : '#6b7280'
  const bg = bom ? 'rgba(16,185,129,0.10)' : ruim ? 'rgba(239,68,68,0.10)' : 'rgba(107,114,128,0.10)'
  const Icon = positivo ? ArrowUpRight : negativo ? ArrowDownRight : Minus
  const anteriorTxt = delta.anterior != null ? (delta.fmt ?? String)(delta.anterior) : '—'
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums"
      style={{ color, background: bg }} title={`Anterior: ${anteriorTxt} · ${rotulo}`}>
      <Icon className="w-3 h-3" />
      {fmtDelta(pct)}
      <span className="font-normal opacity-70">{rotulo}</span>
    </span>
  )
}

export function KpiCard({ icon: Icon, label, value, sub, accent = '#1764f4', valueColor, delta, loading }: {
  icon?: ElementType
  label: string
  value: string | number
  sub?: string
  accent?: string
  valueColor?: string
  delta?: KpiDelta | null
  loading?: boolean
}) {
  return (
    <div className="rounded-xl p-4 min-w-0"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${accent}` }}>
      <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold inline-flex items-center gap-1.5 truncate max-w-full">
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: accent }} />}
        <span className="truncate">{label}</span>
      </p>
      {loading ? (
        <div className="mt-2 space-y-2">
          <div className="skeleton h-7 w-28" />
          <div className="skeleton h-3 w-36" />
        </div>
      ) : (
        <>
          <p className="text-2xl font-bold tabular-nums mt-1 leading-tight" style={{ color: valueColor ?? '#1f2937' }}>{value}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 min-h-[18px]">
            {delta && <DeltaPill delta={delta} />}
            {sub && <span className="text-xs text-gray-500">{sub}</span>}
          </div>
        </>
      )}
    </div>
  )
}

export function KpiRow({ children, cols = 4 }: { children: React.ReactNode; cols?: 3 | 4 | 5 }) {
  const grid = cols === 3 ? 'grid-cols-1 md:grid-cols-3' : cols === 5 ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5' : 'grid-cols-2 xl:grid-cols-4'
  return <div className={`grid ${grid} gap-3`}>{children}</div>
}

// Esqueleto de tabela enquanto a aba carrega pela primeira vez
export function TableSkeleton({ linhas = 6, colunas = 5 }: { linhas?: number; colunas?: number }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div className="px-3 py-2" style={{ background: 'var(--surface-2)' }}>
        <div className="skeleton h-3 w-1/3" />
      </div>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex gap-3 px-3 py-2" style={{ borderTop: '1px solid var(--border)' }}>
          {Array.from({ length: colunas }).map((_, j) => (
            <div key={j} className="skeleton h-3" style={{ width: j === 0 ? '28%' : '14%' }} />
          ))}
        </div>
      ))}
    </div>
  )
}

// Estado vazio padrão dos blocos
export function Vazio({ loading, children }: { loading?: boolean; children?: React.ReactNode }) {
  if (loading) return <TableSkeleton />
  return <p className="text-sm text-gray-400 py-6 text-center">{children ?? 'Sem dados no período.'}</p>
}
