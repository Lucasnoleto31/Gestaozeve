'use client'

import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

interface ScorePoint { mes: string; score: number }
interface LotesPoint { mes: string; girados: number; zerados: number }
interface ReceitaPoint { mes: string; receita: number }

interface Props {
  scoreData: ScorePoint[]
  lotesData: LotesPoint[]
  receitaData: ReceitaPoint[]
}

function formatMes(mes: string) {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const [year, month] = mes.split('-')
  return `${meses[parseInt(month) - 1]}/${year.slice(2)}`
}

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

const tooltipStyle = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #D5E0F5',
  borderRadius: '8px',
  color: '#111827',
  fontSize: 12,
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-36 text-sm text-gray-400">
      Sem dados de {label} ainda.
    </div>
  )
}

export function ClienteCharts({ scoreData, lotesData, receitaData }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Score Evolution */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Evolução do Score</p>
        {scoreData.length < 2 ? (
          <EmptyChart label="score" />
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={scoreData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" />
              <XAxis dataKey="mes" tickFormatter={formatMes} tick={{ fontSize: 10, fill: '#6B7280' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#6B7280' }} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v) => [Math.round(Number(v)), 'Score']}
                labelFormatter={(l) => formatMes(String(l))}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#1764F4"
                strokeWidth={2}
                dot={{ fill: '#1764F4', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Lotes Mensais */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Lotes por Mês</p>
        {lotesData.length === 0 ? (
          <EmptyChart label="lotes" />
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={lotesData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" />
              <XAxis dataKey="mes" tickFormatter={formatMes} tick={{ fontSize: 10, fill: '#6B7280' }} />
              <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => formatMes(String(l))} />
              <Bar dataKey="girados" name="Girados" fill="#1764F4" radius={[3, 3, 0, 0]} />
              <Bar dataKey="zerados" name="Zerados" fill="#4A8FF8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Receita Mensal */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Receita Mensal</p>
        {receitaData.length === 0 ? (
          <EmptyChart label="receita" />
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={receitaData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" />
              <XAxis dataKey="mes" tickFormatter={formatMes} tick={{ fontSize: 10, fill: '#6B7280' }} />
              <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(l) => formatMes(String(l))}
                formatter={(v) => [formatBRL(Number(v)), 'Receita']}
              />
              <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
