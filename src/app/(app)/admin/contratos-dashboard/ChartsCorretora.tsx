'use client'

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { CORRETORAS, CORRETORA_COLOR, CORRETORA_LABEL, isCorretora, type Corretora } from '@/lib/corretoras'
import type { EvolucaoCorretoraRow, EvolucaoBarraRow } from './actions'
import { nomeCurto } from './_lib/utils'

const fmtNum = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function labelMes(iso: string): string {
  const m = parseInt(iso.slice(5, 7), 10)
  return `${MESES_ABREV[m - 1] ?? iso.slice(5, 7)}/${iso.slice(2, 4)}`
}

const TOOLTIP_STYLE = {
  background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.2)',
  borderRadius: 12, color: '#e2e8f0', fontSize: 12,
}

// Pílula colorida com o nome da corretora (serve em Server e Client Components)
export function CorretoraBadge({ corretora, size = 'sm' }: { corretora: string; size?: 'sm' | 'md' }) {
  const c = isCorretora(corretora) ? corretora : null
  const color = c ? CORRETORA_COLOR[c] : '#64748b'
  const label = c ? CORRETORA_LABEL[c] : corretora
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ${size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'}`}
      style={{ background: `${color}1a`, color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

// Lotes operados por mês, empilhados por corretora. Últimos `meses` meses.
export function EvolucaoCorretoraChart({ data, meses = 12 }: { data: EvolucaoCorretoraRow[]; meses?: number }) {
  if (data.length === 0) return <p className="text-sm text-gray-400 py-4">Sem dados.</p>

  // Pivot: mes → { GENIAL, XP, BTG }
  const byMes = new Map<string, Record<Corretora, number>>()
  data.forEach(r => {
    if (!byMes.has(r.mes_data)) byMes.set(r.mes_data, { GENIAL: 0, XP: 0, BTG: 0 })
    if (isCorretora(r.corretora)) byMes.get(r.mes_data)![r.corretora] += r.lotes_operados
  })
  const mesesOrdenados = Array.from(byMes.keys()).sort().slice(-meses)
  const chartData = mesesOrdenados.map((m, i) => ({
    mes: labelMes(m) + (i === mesesOrdenados.length - 1 ? '*' : ''),
    ...byMes.get(m)!,
  }))
  // Só plota corretoras com volume no recorte (evita legenda vazia)
  const ativas = CORRETORAS.filter(c => chartData.some(d => d[c] > 0))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
        <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={fmtNum} />
        <Tooltip contentStyle={TOOLTIP_STYLE}
          formatter={(v, name) => [fmtNum(Number(v)), CORRETORA_LABEL[name as Corretora] ?? String(name)]} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="rect"
          formatter={(v) => CORRETORA_LABEL[v as Corretora] ?? String(v)} />
        {ativas.map((c, i) => (
          <Bar key={c} dataKey={c} stackId="lotes" fill={CORRETORA_COLOR[c]}
            radius={i === ativas.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} animationDuration={400} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// Paleta pras linhas das maiores barras
const PALETA_BARRAS = ['#1764f4', '#10b981', '#f59e0b', '#a855f7', '#dc2626', '#0891b2', '#64748b', '#ec4899']

// Lotes operados por mês das barras escolhidas (uma linha por barra).
export function EvolucaoBarrasChart({ data, barras }: { data: EvolucaoBarraRow[]; barras: string[] }) {
  if (data.length === 0 || barras.length === 0) return <p className="text-sm text-gray-400 py-4">Sem dados.</p>

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
    const row: Record<string, number | string> = { mes: labelMes(m) + (i === mesesOrdenados.length - 1 ? '*' : '') }
    chaves.forEach(k => { row[k] = byMes.get(m)![k] ?? 0 })
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
        <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={fmtNum} />
        <Tooltip contentStyle={TOOLTIP_STYLE}
          formatter={(v, name) => [fmtNum(Number(v)), nomeCurto(String(name), 30)]} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline"
          formatter={(v) => nomeCurto(String(v), 22)} />
        {chaves.map((k, i) => (
          <Line key={k} type="monotone" dataKey={k} stroke={PALETA_BARRAS[i % PALETA_BARRAS.length]}
            strokeWidth={i === 0 ? 2.5 : 1.8} dot={{ r: 2 }} activeDot={{ r: 4 }} animationDuration={400} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
