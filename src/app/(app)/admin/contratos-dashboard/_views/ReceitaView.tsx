'use client'

import { useEffect, useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { DollarSign, TrendingUp, Calendar, Layers } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { Block } from '../View'
import { fmtBRL, fmtBRL2 } from '../_lib/utils'
import { KpiCard, KpiRow } from '../_lib/Kpi'
import { ACTIONS } from '../_lib/dashboardActions'

const CLASSE_COLOR: Record<string, string> = {
  A: '#10b981', B: '#1764f4', C: '#f59e0b', D: '#94a3b8',
}
const CLASSE_LABEL: Record<string, string> = {
  A: 'A · Ultra lucrativos',
  B: 'B · Consistentes',
  C: 'C · Sobreviventes',
  D: 'D · Marginais',
}

export function ReceitaView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    receita: true, meta: true, kpis: true, curvaAbc: true, receitaBrutaLiquida: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  // Dados do gráfico ABC — top 20 clientes em barras + linha de % acumulado
  const chartData = useMemo(() => d.abc.slice(0, 20).map(r => ({
    nome: r.cliente_nome.slice(0, 18),
    receita: r.receita_estimada,
    acumulado: r.pct_acumulado,
  })), [d.abc])

  const abcAgg = ['A', 'B', 'C', 'D'].map(c => {
    const rows = d.abc.filter(r => r.classe === c)
    return { classe: c, num: rows.length, receita: rows.reduce((s, r) => s + r.receita_estimada, 0) }
  })

  return (
    <div className="space-y-5">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      {/* 4 KPIs financeiros */}
      <KpiRow>
        <KpiCard icon={DollarSign} label="Receita bruta"
          value={d.receitaBL ? fmtBRL2(d.receitaBL.receita_bruta) : '—'}
          sub="operados + zeragem" accent="#1764f4" />
        <KpiCard icon={DollarSign} label="Receita líquida"
          value={d.receitaBL ? fmtBRL2(d.receitaBL.receita_liquida) : '—'}
          sub={d.receitaBL ? `${d.receitaBL.pct_repasse_medio.toFixed(0)}% repasse médio` : undefined}
          accent="#10b981" />
        <KpiCard icon={TrendingUp} label="Projeção do mês"
          value={d.receitaProj ? fmtBRL(d.receitaProj.projecao_total) : '—'}
          sub={d.receitaProj ? `${d.receitaProj.dias_corridos_restantes}d restantes` : undefined}
          accent="#a855f7" />
        <KpiCard icon={Calendar} label="Ritmo necessário"
          value={d.meta && d.meta.meta_receita > 0 ? fmtBRL(d.meta.ritmo_receita_necessario) : '—'}
          sub={d.meta ? `meta ${d.meta.pct_receita.toFixed(1)}% atingida` : undefined}
          accent="#f59e0b" />
      </KpiRow>

      {/* 1 gráfico principal — curva ABC */}
      <Block title="Curva ABC — top 20 clientes"
        subtitle="Barras = receita individual · linha = % acumulado da receita total. Quando atinge ~70% = corte A→B.">
        {chartData.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 16, bottom: 60, left: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
                <XAxis dataKey="nome" tick={{ fontSize: 9, fill: '#94a3b8' }} angle={-30} textAnchor="end" interval={0} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => 'R$' + (v/1000).toFixed(0) + 'k'} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }}
                  formatter={(v, name) => name === 'receita' ? fmtBRL2(v as number) : `${(v as number).toFixed(1)}%`} />
                <Bar yAxisId="left" dataKey="receita" fill="#1764f4" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="acumulado" stroke="#dc2626" strokeWidth={2} dot={{ r: 3, fill: '#dc2626' }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
      </Block>

      {/* Tabela 1: ABC top 30 com classe colorida */}
      <Block title="Clientes por classe ABC"
        subtitle={`${abcAgg.map(a => `${a.classe}: ${a.num}`).join(' · ')}. Clique no cliente pra abrir o perfil.`}>
        {d.abc.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['#', 'Cliente', 'Barra', 'Classe', 'Receita', '%', '% acum.'].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${i <= 3 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.abc.slice(0, 30).map(r => {
                    const color = CLASSE_COLOR[r.classe]
                    return (
                      <tr key={`${r.cliente_id ?? r.cliente_nome}-${r.rank}`}
                        onClick={() => { if (r.cliente_id) window.location.href = `/clientes/${r.cliente_id}` }}
                        className={r.cliente_id ? 'cursor-pointer hover:bg-blue-50' : ''}
                        style={{ borderTop: '1px solid var(--border)',
                                 background: r.rank % 2 === 1 ? 'var(--surface)' : 'var(--surface-2)' }}>
                        <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{r.rank}</td>
                        <td className="px-3 py-1.5 font-medium text-gray-700">{r.cliente_nome}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.assessor_nome ?? '—'}</td>
                        <td className="px-3 py-1.5">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold"
                            style={{ background: `${color}20`, color }}>
                            {CLASSE_LABEL[r.classe]}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-emerald-700">{fmtBRL2(r.receita_estimada)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.pct_individual.toFixed(2)}%</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{r.pct_acumulado.toFixed(2)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Block>

      {/* Loading inline */}
      {d.isPending && (
        <div className="text-xs text-gray-400 flex items-center gap-2 justify-end">
          <Layers className="w-3 h-3 animate-pulse" /> atualizando…
        </div>
      )}
    </div>
  )
}
