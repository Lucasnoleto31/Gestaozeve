'use client'

import {
  LineChart, Line, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { DiarioProdutoRow, EvolucaoMensalRow } from './actions'
import { fmtNum, labelMesCurto } from '@/lib/format'
import { useChartColors } from '@/lib/theme'

// ===========================================================
// Tooltip compartilhado (HTML, segue o tema)
// ===========================================================
export function ChartTooltip({ active, payload, label, formatter, labelFormatter, nameFormatter }: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>
  label?: string | number
  formatter?: (v: number, name?: string) => string
  labelFormatter?: (l: string | number) => string
  nameFormatter?: (name: string) => string
}) {
  if (!active || !payload || !payload.length) return null
  const fmt = formatter ?? ((v: number) => fmtNum(v))
  return (
    <div className="panel px-3 py-2.5 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-fg">{labelFormatter ? labelFormatter(label!) : label}</p>
      {payload.map((p, i) => (
        <div key={i} className="mb-0.5 flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
          <span className="mr-2 text-fg-muted">{nameFormatter && p.name ? nameFormatter(p.name) : p.name}:</span>
          <span className="ml-auto font-semibold tabular-nums text-fg">
            {p.value != null ? fmt(p.value, p.name) : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

// ===========================================================
// Média móvel
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
// 1. WIN vs WDO diário com média móvel configurável
// Dia de pregão sem volume do produto conta como 0 tanto na linha
// quanto na média móvel.
// ===========================================================
export function WinVsWdoChart({ data, onClickDia, mm = 7 }:
  { data: DiarioProdutoRow[]; onClickDia: (data: string) => void; mm?: number }
) {
  const c = useChartColors()
  const winKey = `WIN MM${mm}`
  const wdoKey = `WDO MM${mm}`

  // Pivot por dia: { data, WIN, WDO, ... }
  const byDay = new Map<string, Record<string, number>>()
  data.forEach(r => {
    if (!byDay.has(r.data)) byDay.set(r.data, {})
    byDay.get(r.data)![r.produto] = r.lotes_operados
  })
  const dias = Array.from(byDay.keys()).sort()

  const produtos = new Set<string>()
  data.forEach(r => { if (r.lotes_operados > 0) produtos.add(r.produto) })
  const principais = ['WIN', 'WDO'].filter(p => produtos.has(p))

  const winSeries = dias.map(d => byDay.get(d)?.WIN ?? 0)
  const wdoSeries = dias.map(d => byDay.get(d)?.WDO ?? 0)
  const winMM = rollingMean(winSeries, mm)
  const wdoMM = rollingMean(wdoSeries, mm)

  const chartData = dias.map((d, i) => ({
    dia: `${d.slice(8, 10)}/${d.slice(5, 7)}`,
    fullDate: d,
    WIN: winSeries[i],
    WDO: wdoSeries[i],
    [winKey]: winMM[i],
    [wdoKey]: wdoMM[i],
  }))

  if (chartData.length === 0 || principais.length === 0) {
    return <p className="py-8 text-center text-sm text-fg-subtle">Sem volume de WIN/WDO no período.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={chartData}
        margin={{ top: 10, right: 16, bottom: 0, left: 0 }}
        onClick={(e) => {
          const idx = (e?.activeTooltipIndex ?? -1) as number
          if (idx >= 0 && chartData[idx]) onClickDia(chartData[idx].fullDate)
        }}>
        <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="dia" tick={{ fontSize: 11, fill: c.axis }} axisLine={{ stroke: c.grid }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: c.axis }} tickFormatter={fmtNum} axisLine={false} tickLine={false} width={48} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.axis, strokeDasharray: '3 3' }} />
        <Legend wrapperStyle={{ fontSize: 12, color: c.text }} iconType="plainline" />
        {principais.includes('WIN') && (
          <>
            <Line type="monotone" dataKey="WIN" stroke={c.produto.WIN} strokeWidth={2.2}
              dot={{ r: 2, fill: c.produto.WIN, strokeWidth: 0 }} activeDot={{ r: 5 }} animationDuration={400} />
            <Line type="monotone" dataKey={winKey} stroke={c.produto.WIN} strokeWidth={1.4}
              strokeDasharray="4 3" dot={false} opacity={0.6} animationDuration={400} />
          </>
        )}
        {principais.includes('WDO') && (
          <>
            <Line type="monotone" dataKey="WDO" stroke={c.produto.WDO} strokeWidth={2.2}
              dot={{ r: 2, fill: c.produto.WDO, strokeWidth: 0 }} activeDot={{ r: 5 }} animationDuration={400} />
            <Line type="monotone" dataKey={wdoKey} stroke={c.produto.WDO} strokeWidth={1.4}
              strokeDasharray="4 3" dot={false} opacity={0.6} animationDuration={400} />
          </>
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ===========================================================
// 2. Evolução mensal — barras lado a lado + linha de clientes ativos
// ===========================================================
export function EvolucaoMensalChart({ data }: { data: EvolucaoMensalRow[] }) {
  const c = useChartColors()
  if (data.length === 0) return <p className="py-8 text-center text-sm text-fg-subtle">Sem dados.</p>

  const chartData = data.map((r, i) => ({
    // último mês está em andamento — marca com *
    mes: labelMesCurto(r.mes_data) + (i === data.length - 1 ? '*' : ''),
    Operados: r.lotes_operados,
    Zerados: r.lotes_zerados,
    Clientes: r.num_clientes,
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="mes" tick={{ fontSize: 11, fill: c.axis }} axisLine={{ stroke: c.grid }} tickLine={false} />
        <YAxis yAxisId="lotes" tick={{ fontSize: 11, fill: c.axis }} tickFormatter={fmtNum} axisLine={false} tickLine={false} width={48} />
        <YAxis yAxisId="clientes" orientation="right" tick={{ fontSize: 11, fill: c.clientes }} tickFormatter={fmtNum} axisLine={false} tickLine={false} width={40} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: c.grid }} />
        <Legend wrapperStyle={{ fontSize: 12, color: c.text }} iconType="circle" />
        <Bar yAxisId="lotes" dataKey="Operados" fill={c.operados} radius={[3, 3, 0, 0]} animationDuration={400} />
        <Bar yAxisId="lotes" dataKey="Zerados" fill={c.zerados} radius={[3, 3, 0, 0]} animationDuration={400} />
        <Line yAxisId="clientes" type="monotone" dataKey="Clientes" stroke={c.clientes} strokeWidth={2}
          dot={{ r: 2, fill: c.clientes, strokeWidth: 0 }} activeDot={{ r: 4 }} animationDuration={400} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
