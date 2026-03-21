'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

interface CarteiraPieProps {
  distribuicao: { saudavel: number; atencao: number; risco: number }
  total: number
}

const PIE_CONFIG = [
  { key: 'saudavel' as const, label: 'Saudável',     color: '#059669' },
  { key: 'atencao'  as const, label: 'Em atenção',   color: '#d97706' },
  { key: 'risco'    as const, label: 'Em risco',     color: '#dc2626' },
]

const tooltipStyle = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #D5E0F5',
  borderRadius: '8px',
  color: '#111827',
  fontSize: 12,
}

export function CarteiraPie({ distribuicao, total }: CarteiraPieProps) {
  const data = PIE_CONFIG
    .map(({ key, label, color }) => ({ name: label, value: distribuicao[key], color }))
    .filter((d) => d.value > 0)

  if (data.length === 0 || total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-sm text-gray-400">
        Nenhum score calculado ainda.
      </div>
    )
  }

  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={76}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number, name: string) => [
                `${value} cliente${value !== 1 ? 's' : ''} (${Math.round((value / total) * 100)}%)`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-gray-900">{total}</span>
          <span className="text-xs text-gray-500">clientes</span>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-2.5 mt-3">
        {PIE_CONFIG.map(({ key, label, color }) => {
          const count = distribuicao[key]
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div key={key} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-gray-600">{label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-gray-900">{count}</span>
                <span className="text-gray-400">({pct}%)</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
