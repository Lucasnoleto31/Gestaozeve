'use client'

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { CORRETORAS, CORRETORA_LABEL, isCorretora, type Corretora } from '@/lib/corretoras'
import type { EvolucaoCorretoraRow, EvolucaoBarraRow } from './actions'
import { fmtNum, labelMesCurto, nomeCurto } from '@/lib/format'
import { useChartColors } from '@/lib/theme'
import { ChartTooltip } from './Charts'

// A pílula da corretora mora em components/ui; reexportada aqui por compatibilidade.
export { CorretoraBadge } from '@/components/ui/CorretoraBadge'

const labelCorretora = (v: string) => CORRETORA_LABEL[v as Corretora] ?? v

// Lotes operados por mês, empilhados por corretora. Últimos `meses` meses.
export function EvolucaoCorretoraChart({ data, meses = 12 }: { data: EvolucaoCorretoraRow[]; meses?: number }) {
  const c = useChartColors()
  if (data.length === 0) return <p className="py-8 text-center text-sm text-fg-subtle">Sem dados.</p>

  // Pivot: mes → { GENIAL, XP, BTG }
  const byMes = new Map<string, Record<Corretora, number>>()
  data.forEach(r => {
    if (!byMes.has(r.mes_data)) byMes.set(r.mes_data, { GENIAL: 0, XP: 0, BTG: 0 })
    if (isCorretora(r.corretora)) byMes.get(r.mes_data)![r.corretora] += r.lotes_operados
  })
  const mesesOrdenados = Array.from(byMes.keys()).sort().slice(-meses)
  const chartData = mesesOrdenados.map((m, i) => ({
    mes: labelMesCurto(m) + (i === mesesOrdenados.length - 1 ? '*' : ''),
    ...byMes.get(m)!,
  }))
  // Só plota corretoras com volume no recorte (evita legenda vazia)
  const ativas = CORRETORAS.filter(k => chartData.some(d => d[k] > 0))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="mes" tick={{ fontSize: 11, fill: c.axis }} axisLine={{ stroke: c.grid }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: c.axis }} tickFormatter={fmtNum} axisLine={false} tickLine={false} width={48} />
        <Tooltip content={<ChartTooltip nameFormatter={labelCorretora} />} cursor={{ fill: c.grid }} />
        <Legend wrapperStyle={{ fontSize: 12, color: c.text }} iconType="circle" formatter={(v) => labelCorretora(String(v))} />
        {ativas.map((k, i) => (
          <Bar key={k} dataKey={k} stackId="lotes" fill={c.corretora[k]}
            radius={i === ativas.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} animationDuration={400} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// Lotes operados por mês das barras escolhidas (uma linha por barra).
export function EvolucaoBarrasChart({ data, barras }: { data: EvolucaoBarraRow[]; barras: string[] }) {
  const c = useChartColors()
  if (data.length === 0 || barras.length === 0) return <p className="py-8 text-center text-sm text-fg-subtle">Sem dados.</p>

  const chaves = barras.map(b => b.toUpperCase().trim())
  const byMes = new Map<string, Record<string, number>>()
  data.forEach(r => {
    const k = r.barra_nome.toUpperCase().trim()
    if (!chaves.includes(k)) return
    if (!byMes.has(r.mes_data)) byMes.set(r.mes_data, {})
    const row = byMes.get(r.mes_data)!
    row[k] = (row[k] ?? 0) + r.lotes_operados
  })
  const mesesOrdenados = Array.from(byMes.keys()).sort()
  const chartData = mesesOrdenados.map((m, i) => {
    const row: Record<string, number | string> = { mes: labelMesCurto(m) + (i === mesesOrdenados.length - 1 ? '*' : '') }
    chaves.forEach(k => { row[k] = byMes.get(m)![k] ?? 0 })
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="mes" tick={{ fontSize: 11, fill: c.axis }} axisLine={{ stroke: c.grid }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: c.axis }} tickFormatter={fmtNum} axisLine={false} tickLine={false} width={48} />
        <Tooltip content={<ChartTooltip nameFormatter={(n) => nomeCurto(n, 30)} />} cursor={{ stroke: c.axis, strokeDasharray: '3 3' }} />
        <Legend wrapperStyle={{ fontSize: 11, color: c.text }} iconType="plainline" formatter={(v) => nomeCurto(String(v), 22)} />
        {chaves.map((k, i) => (
          <Line key={k} type="monotone" dataKey={k} stroke={c.palette[i % c.palette.length]}
            strokeWidth={i === 0 ? 2.4 : 1.7} dot={{ r: 2, strokeWidth: 0, fill: c.palette[i % c.palette.length] }}
            activeDot={{ r: 4 }} animationDuration={400} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
