'use client'

import { useEffect, useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { Layers, TrendingUp, TrendingDown, UserPlus, UserX, DollarSign, Users } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { Block } from '../_lib/Blocks'
import { fmtNum, fmtBRL, fmtBRL2 } from '../_lib/utils'
import { KpiCard, KpiRow } from '../_lib/Kpi'
import { ACTIONS } from '../_lib/dashboardActions'

export function AssessoresView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    kpis: true, rankingAssessores: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  // KPIs agregados
  const numBarras = d.ranking.length
  const receitaTotal = d.ranking.reduce((s, r) => s + r.receita_total, 0)
  const clientesAtivosMedio = numBarras > 0 ? d.ranking.reduce((s, r) => s + r.clientes_ativos, 0) / numBarras : 0
  // Ponderada pelos lotes de cada barra (média simples deixava barra minúscula distorcer)
  const totalOp = d.ranking.reduce((s, r) => s + r.lotes_operados, 0)
  const totalZe = d.ranking.reduce((s, r) => s + r.lotes_zerados, 0)
  const pctZerMedio = totalOp > 0 ? (totalZe / totalOp) * 100 : 0

  // Gráfico: barras horizontais por receita_total (top 10)
  const chartData = useMemo(() => d.ranking.slice(0, 10).map(r => ({
    barra: r.barra_nome.replace('ZEVE INVESTIMENTOS ', 'ZV ').slice(0, 18),
    Receita: r.receita_total,
  })), [d.ranking])

  return (
    <div className="space-y-5">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      {/* 4 KPIs do grupo */}
      <KpiRow>
        <KpiCard icon={Layers} label="Barras ativas" value={fmtNum(numBarras)}
          sub="com operação no período" accent="#1764f4" />
        <KpiCard icon={DollarSign} label="Receita consolidada" value={fmtBRL2(receitaTotal)}
          sub="todas as barras" accent="#10b981" />
        <KpiCard icon={Users} label="Clientes/barra (méd.)"
          value={clientesAtivosMedio.toFixed(1)}
          sub="média de ativos" accent="#a855f7" />
        <KpiCard icon={TrendingDown} label="% zeragem média"
          value={`${pctZerMedio.toFixed(1)}%`}
          sub="ponderada pelos lotes" accent="#f59e0b" />
      </KpiRow>

      {barra && (
        <p className="text-xs text-gray-500">
          Esta aba compara <strong>todas as barras</strong> entre si — o filtro de barra não se aplica aqui.
        </p>
      )}

      {/* 1 gráfico — top 10 barras por receita */}
      <Block title="Top 10 barras por receita"
        subtitle="Comparativo simples. Tabela completa com retenção/churn/delta abaixo.">
        {chartData.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 32)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => 'R$' + (v/1000).toFixed(0) + 'k'} />
                <YAxis type="category" dataKey="barra" tick={{ fontSize: 11, fill: '#94a3b8' }} width={140} />
                <Tooltip
                  contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }}
                  formatter={(v) => fmtBRL2(v as number)} />
                <Bar dataKey="Receita" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
      </Block>

      {/* Tabela: ranking expandido */}
      <Block title="Ranking expandido"
        subtitle="Período atual vs anterior (mesma duração). Inclui novos, churn, retenção e variação de receita.">
        {d.ranking.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['#', 'Barra', 'Nº', 'Clientes', 'Novos', 'Churn', 'Retenção', 'Lotes op.', '% zer.', 'Receita', 'Δ ant.'].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${i <= 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.ranking.map(r => {
                    const positivo = r.delta_receita_pct >= 0
                    return (
                      <tr key={r.barra_nome + r.rank}
                        style={{ borderTop: '1px solid var(--border)',
                                 background: r.rank % 2 === 1 ? 'var(--surface)' : 'var(--surface-2)' }}>
                        <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{r.rank}</td>
                        <td className="px-3 py-1.5 font-medium text-gray-700">{r.barra_nome}</td>
                        <td className="px-3 py-1.5 text-gray-500 tabular-nums">{r.numero ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(r.clientes_ativos)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600">
                          <span className="inline-flex items-center gap-1 justify-end">
                            <UserPlus className="w-3 h-3" />{fmtNum(r.clientes_novos)}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-rose-600">
                          <span className="inline-flex items-center gap-1 justify-end">
                            <UserX className="w-3 h-3" />{fmtNum(r.clientes_churn)}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.taxa_retencao.toFixed(1)}%</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(r.lotes_operados)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.pct_zeragem.toFixed(1)}%</td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-emerald-700">{fmtBRL(r.receita_total)}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${positivo ? 'text-emerald-600' : 'text-rose-600'}`}>
                          <span className="inline-flex items-center gap-1 justify-end">
                            {positivo ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {r.delta_receita_pct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Block>

      {d.isPending && (
        <div className="text-xs text-gray-400 flex items-center gap-2 justify-end">
          <Layers className="w-3 h-3 animate-pulse" /> atualizando…
        </div>
      )}
    </div>
  )
}
