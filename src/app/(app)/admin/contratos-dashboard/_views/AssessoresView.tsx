'use client'

import { useEffect } from 'react'
import { TrendingUp, TrendingDown, UserPlus, UserX } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { ReceitaBlock, Block } from '../View'
import { BlockSkeleton } from '../Charts'
import { fmtNum, fmtBRL } from '../_lib/utils'
import { ACTIONS } from '../_lib/dashboardActions'

export function AssessoresView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    receita: true, kpis: true, rankingAssessores: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  return (
    <div className="space-y-6">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      <Block title="Ranking expandido de barras"
        subtitle="Período atual vs anterior (mesma duração). Inclui clientes ativos, novos, churn, retenção e variação de receita.">
        {d.isPending && d.ranking.length === 0
          ? <p className="text-sm text-gray-400 py-4">Carregando…</p>
          : d.ranking.length === 0
          ? <p className="text-sm text-gray-400 py-4">Sem dados.</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {[
                      { l: '#', a: 'left' },
                      { l: 'Barra', a: 'left' },
                      { l: 'Nº', a: 'left' },
                      { l: 'Clientes', a: 'right' },
                      { l: 'Novos', a: 'right' },
                      { l: 'Churn', a: 'right' },
                      { l: 'Retenção', a: 'right' },
                      { l: 'Lotes op.', a: 'right' },
                      { l: '% zer.', a: 'right' },
                      { l: 'Receita', a: 'right' },
                      { l: 'Δ vs ant.', a: 'right' },
                    ].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${h.a === 'left' ? 'text-left' : 'text-right'}`}>
                        {h.l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.ranking.map((r) => {
                    const positivoDelta = r.delta_receita_pct >= 0
                    return (
                      <tr key={r.barra_nome + r.rank}
                        style={{ borderTop: '1px solid var(--border)',
                                 background: r.rank % 2 === 1 ? 'var(--surface)' : 'var(--surface-2)' }}>
                        <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{r.rank}</td>
                        <td className="px-3 py-1.5 font-medium text-gray-700">{r.barra_nome}</td>
                        <td className="px-3 py-1.5 text-gray-500 tabular-nums">{r.numero ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(r.clientes_ativos)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600">
                          <span className="inline-flex items-center gap-1">
                            <UserPlus className="w-3 h-3" />{fmtNum(r.clientes_novos)}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-rose-600">
                          <span className="inline-flex items-center gap-1">
                            <UserX className="w-3 h-3" />{fmtNum(r.clientes_churn)}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.taxa_retencao.toFixed(1)}%</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(r.lotes_operados)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.pct_zeragem.toFixed(1)}%</td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-emerald-700">{fmtBRL(r.receita_total)}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${positivoDelta ? 'text-emerald-600' : 'text-rose-600'}`}>
                          <span className="inline-flex items-center gap-1">
                            {positivoDelta ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
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

      {d.receitaTotal
        ? <ReceitaBlock total={d.receitaTotal} porAssessor={d.receitaPorAss} projecao={d.receitaProj} />
        : <BlockSkeleton height={300} />}
    </div>
  )
}
