'use client'

import { useEffect } from 'react'
import { Users, UserPlus, UserX, Activity, Layers } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { Block } from '../_lib/Blocks'
import { CohortHeatmap, BlockSkeleton } from '../Charts'
import { fmtNum, fmtBRL2, fmtDataPt } from '../_lib/utils'
import { KpiCard, KpiRow } from '../_lib/Kpi'
import { ACTIONS } from '../_lib/dashboardActions'

export function ClientesView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    topClientes: true, kpis: true, ltv: true, cohort: true, rankingAssessores: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  // Agregado: clientes novos + churn total (soma do ranking expandido).
  // O ranking não recebe o filtro de barra — quando há barra selecionada,
  // esses dois cards continuam sendo do escritório inteiro (indicado no sub).
  const novosTotal = d.ranking.reduce((s, r) => s + r.clientes_novos, 0)
  const churnTotal = d.ranking.reduce((s, r) => s + r.clientes_churn, 0)
  const escopoNota = barra ? ' · escritório todo' : ''
  const lotesPorCliente = d.kpis && d.kpis.num_clientes_ativos > 0
    ? d.kpis.volume_operados / d.kpis.num_clientes_ativos
    : null

  return (
    <div className="space-y-5">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      {/* 4 KPIs de base de clientes */}
      <KpiRow>
        <KpiCard icon={Users} label="Clientes ativos"
          value={d.kpis ? fmtNum(d.kpis.num_clientes_ativos) : '—'}
          sub="contas que operaram no período" accent="#1764f4" />
        <KpiCard icon={UserPlus} label="Novos"
          value={fmtNum(novosTotal)}
          sub={`vs período anterior${escopoNota}`} accent="#10b981" />
        <KpiCard icon={UserX} label="Churn"
          value={fmtNum(churnTotal)}
          sub={`pararam de operar${escopoNota}`} accent="#dc2626" />
        <KpiCard icon={Activity} label="Lotes por cliente"
          value={lotesPorCliente != null ? fmtNum(lotesPorCliente) : '—'}
          sub="volume operado ÷ clientes ativos" accent="#a855f7" />
      </KpiRow>

      {/* 1 gráfico principal — Cohort heatmap */}
      <Block title="Cohort de retenção"
        subtitle="Cada linha = mês de entrada do cliente. Colunas = % que continuam operando nos meses seguintes. Histórico completo — não segue os filtros acima.">
        {d.isPending && d.cohort.length === 0
          ? <BlockSkeleton height={300} />
          : <CohortHeatmap data={d.cohort} />}
      </Block>

      {/* Tabela: Top 50 LTV */}
      <Block title="Top 50 clientes — LTV"
        subtitle="Receita estimada acumulada desde a primeira operação (só WIN/WDO). Histórico completo — não segue os filtros acima. Clique pra abrir o perfil.">
        {d.ltv.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['#', 'Cliente', 'Barra', 'Primeira op.', 'Última op.', 'Meses', 'Lotes op.', 'Receita LTV', 'Méd./mês'].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${i <= 4 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.ltv.map(c => (
                    <tr key={`${c.cliente_id ?? c.cliente_nome}-${c.rank}`}
                      onClick={() => { if (c.cliente_id) window.location.href = `/clientes/${c.cliente_id}` }}
                      className={c.cliente_id ? 'cursor-pointer hover:bg-blue-50' : ''}
                      style={{ borderTop: '1px solid var(--border)',
                               background: c.rank % 2 === 1 ? 'var(--surface)' : 'var(--surface-2)' }}>
                      <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{c.rank}</td>
                      <td className="px-3 py-1.5 font-medium text-gray-700">{c.cliente_nome}</td>
                      <td className="px-3 py-1.5 text-gray-500">{c.assessor_nome ?? '—'}</td>
                      <td className="px-3 py-1.5 text-gray-500 tabular-nums">{fmtDataPt(c.primeira_op)}</td>
                      <td className="px-3 py-1.5 text-gray-500 tabular-nums">{fmtDataPt(c.ultima_op)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{c.meses_ativo}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(c.lotes_operados)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-emerald-700">{fmtBRL2(c.receita_estimada)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{fmtBRL2(c.receita_media_mensal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Block>

      {/* Top clientes do período — tabela simples */}
      <Block title="Top 20 clientes do período"
        subtitle="Ordenado por volume operado. Pareto rápido para identificar dependências.">
        {d.topClientes.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['#', 'Cliente', 'Assessor', 'Lotes op.', 'Lotes ze.', '% ze', '% acum.'].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${i <= 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.topClientes.map(c => {
                    const pctZe = c.lotes_operados > 0 ? (c.lotes_zerados / c.lotes_operados) * 100 : 0
                    return (
                      <tr key={`${c.cliente_id ?? c.cliente_nome}-${c.rank}`}
                        onClick={() => { if (c.cliente_id) window.location.href = `/clientes/${c.cliente_id}` }}
                        className={c.cliente_id ? 'cursor-pointer hover:bg-blue-50' : ''}
                        style={{ borderTop: '1px solid var(--border)',
                                 background: c.rank % 2 === 1 ? 'var(--surface)' : 'var(--surface-2)' }}>
                        <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{c.rank}</td>
                        <td className="px-3 py-1.5 font-medium text-gray-700">{c.cliente_nome}</td>
                        <td className="px-3 py-1.5 text-gray-500">{c.assessor_nome ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(c.lotes_operados)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtNum(c.lotes_zerados)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{pctZe.toFixed(1)}%</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{c.pct_acumulado.toFixed(1)}%</td>
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
