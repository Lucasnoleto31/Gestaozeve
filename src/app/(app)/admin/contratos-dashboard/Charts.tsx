'use client'

import {
  LineChart, Line, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { DiarioProdutoRow, EvolucaoMensalRow, CohortPonto } from './actions'

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
// 1. WIN vs WDO diário com média móvel configurável
// Dia de pregão sem volume do produto conta como 0 tanto na linha
// quanto na média móvel (antes a linha mostrava buraco e a MM despencava).
// ===========================================================
export function WinVsWdoChart({ data, onClickDia, mm = 7 }:
  { data: DiarioProdutoRow[]; onClickDia: (data: string) => void; mm?: number }
) {
  const winKey = `WIN MM${mm}`
  const wdoKey = `WDO MM${mm}`
  // Pivot por dia: { data, WIN, WDO, ... }
  const byDay = new Map<string, Record<string, number>>()
  data.forEach(r => {
    if (!byDay.has(r.data)) byDay.set(r.data, {})
    byDay.get(r.data)![r.produto] = r.lotes_operados
  })
  const dias = Array.from(byDay.keys()).sort()

  // Quais produtos plotar (apenas os que tiveram volume no período)
  const produtos = new Set<string>()
  data.forEach(r => { if (r.lotes_operados > 0) produtos.add(r.produto) })
  const principais = ['WIN', 'WDO'].filter(p => produtos.has(p))

  // Monta linha do tempo + médias móveis (período configurável) das duas séries principais
  const winSeries = dias.map(d => byDay.get(d)?.WIN ?? 0)
  const wdoSeries = dias.map(d => byDay.get(d)?.WDO ?? 0)
  const winMM = rollingMean(winSeries, mm)
  const wdoMM = rollingMean(wdoSeries, mm)

  const chartData = dias.map((d, i) => ({
    dia: `${d.slice(8, 10)}/${d.slice(5, 7)}`, // DD/MM
    fullDate: d,
    WIN: winSeries[i],
    WDO: wdoSeries[i],
    [winKey]: winMM[i],
    [wdoKey]: wdoMM[i],
  }))

  if (chartData.length === 0 || principais.length === 0) {
    return <p className="text-sm text-gray-400 py-4">Sem volume de WIN/WDO no período.</p>
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
            <Line type="monotone" dataKey={winKey} stroke={colorFor('WIN')} strokeWidth={1.5}
              strokeDasharray="4 3" dot={false} opacity={0.6} animationDuration={400} />
          </>
        )}
        {principais.includes('WDO') && (
          <>
            <Line type="monotone" dataKey="WDO" stroke={colorFor('WDO')} strokeWidth={2.5}
              dot={{ r: 2, fill: colorFor('WDO') }} activeDot={{ r: 5 }} animationDuration={400} />
            <Line type="monotone" dataKey={wdoKey} stroke={colorFor('WDO')} strokeWidth={1.5}
              strokeDasharray="4 3" dot={false} opacity={0.6} animationDuration={400} />
          </>
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ===========================================================
// 2. Evolução mensal — barras lado a lado (antes eram empilhadas e a
// altura total virava um número sem sentido) + linha de clientes ativos.
// ===========================================================
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function labelMes(iso: string): string {
  // 'YYYY-MM-DD' → 'mmm/AA' sem passar por Date (evita drift de fuso)
  const m = parseInt(iso.slice(5, 7), 10)
  return `${MESES_ABREV[m - 1] ?? iso.slice(5, 7)}/${iso.slice(2, 4)}`
}

export function EvolucaoMensalChart({ data }: { data: EvolucaoMensalRow[] }) {
  if (data.length === 0) return <p className="text-sm text-gray-400 py-4">Sem dados.</p>

  const chartData = data.map((r, i) => ({
    // último mês está em andamento — marca com *
    mes: labelMes(r.mes_data) + (i === data.length - 1 ? '*' : ''),
    Operados: r.lotes_operados,
    Zerados: r.lotes_zerados,
    Clientes: r.num_clientes,
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
        <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} />
        <YAxis yAxisId="lotes" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={fmtNum} />
        <YAxis yAxisId="clientes" orientation="right" tick={{ fontSize: 11, fill: '#a855f7' }} tickFormatter={fmtNum} />
        <Tooltip content={<PremiumTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="rect" />
        <Bar yAxisId="lotes" dataKey="Operados" fill="#1764f4" radius={[4, 4, 0, 0]} animationDuration={400} />
        <Bar yAxisId="lotes" dataKey="Zerados"  fill="#dc2626" radius={[4, 4, 0, 0]} animationDuration={400} />
        <Line yAxisId="clientes" type="monotone" dataKey="Clientes" stroke="#a855f7" strokeWidth={2}
          dot={{ r: 2, fill: '#a855f7' }} activeDot={{ r: 4 }} animationDuration={400} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ===========================================================
// 3. Cohort Heatmap — retenção por mês × offset
// ===========================================================
export function CohortHeatmap({ data }: { data: CohortPonto[] }) {
  if (data.length === 0) return <p className="text-sm text-gray-400 py-4">Sem dados de cohort.</p>

  // Pivot: cohort_mes → { mes_offset → retencao_pct }
  const cohorts = new Map<string, { size: number; cells: Map<number, number> }>()
  let maxOffset = 0
  data.forEach(p => {
    if (!cohorts.has(p.cohort_mes)) cohorts.set(p.cohort_mes, { size: p.cohort_size, cells: new Map() })
    cohorts.get(p.cohort_mes)!.cells.set(p.mes_offset, p.retencao_pct)
    if (p.mes_offset > maxOffset) maxOffset = p.mes_offset
  })
  const cohortList = Array.from(cohorts.keys()).sort().reverse()
  const offsets = Array.from({ length: maxOffset + 1 }, (_, i) => i)

  const fmtMes = (iso: string) => {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
      .replace('.', '').toLowerCase()
  }
  const colorFor = (pct: number | undefined) => {
    if (pct == null) return 'transparent'
    // Escala: 0 = cinza claro, 100 = azul forte
    const intensity = Math.min(1, pct / 100)
    const r = Math.round(241 - intensity * 218)
    const g = Math.round(245 - intensity * 145)
    const b = Math.round(249 - intensity * 5)
    return `rgb(${r},${g},${b})`
  }
  const textColorFor = (pct: number | undefined) => {
    if (pct == null) return '#94a3b8'
    return pct > 50 ? '#fff' : '#0f172a'
  }

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
      <table className="text-xs border-collapse min-w-max w-full">
        <thead style={{ background: 'var(--surface-2)' }}>
          <tr>
            <th className="px-2 py-2 font-semibold text-gray-500 text-left sticky left-0 z-10"
              style={{ background: 'var(--surface-2)' }}>Cohort</th>
            <th className="px-2 py-2 font-semibold text-gray-500 text-right">Tam.</th>
            {offsets.map(o => (
              <th key={o} className="px-2 py-2 font-semibold text-gray-500 text-center" style={{ minWidth: 56 }}>
                M{o}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohortList.map(cm => {
            const c = cohorts.get(cm)!
            return (
              <tr key={cm} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-2 py-1.5 font-medium text-gray-700 sticky left-0 z-10"
                  style={{ background: 'var(--surface)' }}>
                  {fmtMes(cm)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{c.size}</td>
                {offsets.map(o => {
                  const pct = c.cells.get(o)
                  return (
                    <td key={o} className="px-1 py-1 text-center tabular-nums font-semibold"
                      style={{
                        background: colorFor(pct),
                        color: textColorFor(pct),
                        borderLeft: '1px solid rgba(148,163,184,0.1)',
                      }}>
                      {pct != null ? `${pct.toFixed(0)}%` : ''}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
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
