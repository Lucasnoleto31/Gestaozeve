'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { CORRETORAS, CORRETORA_COLOR, CORRETORA_LABEL, isCorretora, type Corretora } from '@/lib/corretoras'
import type { EvolucaoCorretoraRow } from './actions'

const fmtNum = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function labelMes(iso: string): string {
  const m = parseInt(iso.slice(5, 7), 10)
  return `${MESES_ABREV[m - 1] ?? iso.slice(5, 7)}/${iso.slice(2, 4)}`
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
        <Tooltip
          contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.2)',
                          borderRadius: 12, color: '#e2e8f0', fontSize: 12 }}
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
