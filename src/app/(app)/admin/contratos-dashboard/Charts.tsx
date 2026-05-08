'use client'

import {
  LineChart, Line, BarChart, Bar, ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { DiarioProdutoRow, EvolucaoMensalRow, AcuracidadePonto } from './actions'

const fmtNum = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

const PRODUTO_COLOR: Record<string, string> = {
  WIN: '#1764f4',
  WDO: '#16a34a',
  BIT: '#f59e0b',
  IND: '#a855f7',
  DOL: '#dc2626',
  WSP: '#06b6d4',
  CCM: '#84cc16',
  SOL: '#ec4899',
  OUTRO: '#64748b',
}
const colorFor = (p: string) => PRODUTO_COLOR[p] ?? '#64748b'

// ===========================================================
// Tooltip premium (dark) — usado em todos os gráficos
// ===========================================================
function PremiumTooltip({ active, payload, label, formatter, labelFormatter }: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>
  label?: string | number
  formatter?: (v: number) => string
  labelFormatter?: (l: string | number) => string
}) {
  if (!active || !payload || !payload.length) return null
  const fmt = formatter ?? fmtNum
  return (
    <div className="rounded-xl px-3 py-2.5 text-xs"
      style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.2)',
               boxShadow: '0 10px 25px rgba(0,0,0,0.3)', color: '#e2e8f0' }}>
      <p className="font-bold text-white mb-1.5">
        {labelFormatter ? labelFormatter(label!) : label}
      </p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300 mr-2">{p.name}:</span>
          <span className="font-semibold tabular-nums" style={{ color: p.color }}>
            {p.value != null ? fmt(p.value) : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

// ===========================================================
// Média móvel (mesma fórmula do antigo, agora pra Recharts)
// ===========================================================
function rollingMean(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = []
  let acc = 0
  let count = 0
  for (let i = 0; i < values.length; i++) {
    acc += values[i]; count++
    if (i >= window) { acc -= values[i - window]; count-- }
    out.push(i >= window - 1 ? Math.round((acc / count) * 100) / 100 : null)
  }
  return out
}

// ===========================================================
// 1. WIN vs WDO diário com média móvel 7d
// ===========================================================
export function WinVsWdoChart({ data, onClickDia }:
  { data: DiarioProdutoRow[]; onClickDia: (data: string) => void }
) {
  // Pivot por dia: { data, WIN, WDO, ... }
  const byDay = new Map<string, Record<string, number>>()
  data.forEach(r => {
    if (!byDay.has(r.data)) byDay.set(r.data, { data: 0 } as Record<string, number>)
    byDay.get(r.data)![r.produto] = r.lotes_operados
  })
  const dias = Array.from(byDay.keys()).sort()

  // Quais produtos plotar (apenas os que tiveram volume no período)
  const produtos = new Set<string>()
  data.forEach(r => { if (r.lotes_operados > 0) produtos.add(r.produto) })
  const principais = ['WIN', 'WDO'].filter(p => produtos.has(p))

  // Monta linha do tempo + médias móveis 7d das duas séries principais
  const winSeries = dias.map(d => byDay.get(d)?.WIN ?? 0)
  const wdoSeries = dias.map(d => byDay.get(d)?.WDO ?? 0)
  const winMM7 = rollingMean(winSeries, 7)
  const wdoMM7 = rollingMean(wdoSeries, 7)

  const chartData = dias.map((d, i) => ({
    dia: d.slice(5),       // MM-DD
    fullDate: d,
    WIN: byDay.get(d)?.WIN ?? null,
    WDO: byDay.get(d)?.WDO ?? null,
    'WIN MM7d': winMM7[i],
    'WDO MM7d': wdoMM7[i],
  }))

  if (chartData.length === 0) {
    return <p className="text-sm text-gray-400 py-4">Sem dados no período.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={chartData}
        margin={{ top: 10, right: 16, bottom: 0, left: 0 }}
        onClick={(e) => {
          const idx = (e?.activeTooltipIndex ?? -1) as number
          if (idx >= 0 && chartData[idx]) onClickDia(chartData[idx].fullDate)
        }}>
        <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
        <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={fmtNum} />
        <Tooltip content={<PremiumTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="rect" />
        {principais.includes('WIN') && (
          <>
            <Line type="monotone" dataKey="WIN" stroke={colorFor('WIN')} strokeWidth={2.5}
              dot={{ r: 2, fill: colorFor('WIN') }} activeDot={{ r: 5 }} animationDuration={400} />
            <Line type="monotone" dataKey="WIN MM7d" stroke={colorFor('WIN')} strokeWidth={1.5}
              strokeDasharray="4 3" dot={false} opacity={0.6} animationDuration={400} />
          </>
        )}
        {principais.includes('WDO') && (
          <>
            <Line type="monotone" dataKey="WDO" stroke={colorFor('WDO')} strokeWidth={2.5}
              dot={{ r: 2, fill: colorFor('WDO') }} activeDot={{ r: 5 }} animationDuration={400} />
            <Line type="monotone" dataKey="WDO MM7d" stroke={colorFor('WDO')} strokeWidth={1.5}
              strokeDasharray="4 3" dot={false} opacity={0.6} animationDuration={400} />
          </>
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ===========================================================
// 2. Evolução mensal — barras stacked (operados + zerados)
// ===========================================================
export function EvolucaoMensalChart({ data }: { data: EvolucaoMensalRow[] }) {
  if (data.length === 0) return <p className="text-sm text-gray-400 py-4">Sem dados.</p>

  const chartData = data.map(r => {
    const d = new Date(r.mes_data + 'T00:00:00')
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
      .replace('.', '').toLowerCase()
    return {
      mes: label,
      Operados: r.lotes_operados,
      Zerados: r.lotes_zerados,
    }
  })

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
        <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={fmtNum} />
        <Tooltip content={<PremiumTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="rect" />
        <Bar dataKey="Operados" stackId="a" fill="#1764f4" radius={[0, 0, 0, 0]} animationDuration={400} />
        <Bar dataKey="Zerados"  stackId="a" fill="#dc2626" radius={[6, 6, 0, 0]} animationDuration={400} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ===========================================================
// 3. Acuracidade — previsto vs realizado (composto: linha + linha)
// ===========================================================
export function AcuracidadeChart({ serie }: { serie: AcuracidadePonto[] }) {
  if (serie.length === 0) return null
  const chartData = serie.map(p => ({
    dia: p.data.slice(5),
    Previsto: p.previsto,
    Realizado: p.realizado,
    erro: p.erro,
  }))

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
        <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={fmtNum} />
        <Tooltip content={<PremiumTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="rect" />
        <Area type="monotone" dataKey="Previsto" stroke="#94a3b8" fill="rgba(148,163,184,0.15)"
          strokeWidth={1.5} strokeDasharray="4 3" animationDuration={400} />
        <Line type="monotone" dataKey="Realizado" stroke="#1764f4" strokeWidth={2.5}
          dot={{ r: 2, fill: '#1764f4' }} activeDot={{ r: 5 }} animationDuration={400} />
        <ReferenceLine y={0} stroke="#475569" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ===========================================================
// Skeleton — bloco placeholder enquanto carrega
// ===========================================================
export function BlockSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="rounded-2xl p-5 animate-pulse"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div className="h-4 w-48 rounded bg-slate-200 mb-2" />
      <div className="h-3 w-72 rounded bg-slate-100 mb-5" />
      <div className="rounded-xl bg-gradient-to-br from-slate-100 to-slate-50"
        style={{ height }} />
    </div>
  )
}

export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-xl p-4 animate-pulse"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="h-3 w-24 rounded bg-slate-200 mb-3" />
          <div className="h-7 w-32 rounded bg-slate-300 mb-2" />
          <div className="h-3 w-28 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  )
}
