'use client'

import { useEffect } from 'react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { Block } from '../View'
import { BlockSkeleton, CohortHeatmap, LtvBarChart } from '../Charts'
import { fmtNum, fmtBRL2, fmtDataPt } from '../_lib/utils'
import { ACTIONS } from '../_lib/dashboardActions'

export function AnalisesView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    cohort: true, ltv: true, kpis: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  // Top 15 LTV
  const top15 = d.ltv.slice(0, 15)

  return (
    <div className="space-y-6">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      <Block title="Cohort de retenção"
        subtitle="Para cada mês de entrada (primeira operação), % de clientes que continuam operando nos meses seguintes. M0 = 100% por definição.">
        {d.isPending && d.cohort.length === 0
          ? <BlockSkeleton height={300} />
          : <CohortHeatmap data={d.cohort} />}
      </Block>

      <Block title="LTV — Top 15 clientes por receita estimada"
        subtitle="Receita acumulada life-to-date (futuros + zeragem aplicando pricing por barra). Barra cinza = média mensal.">
        {d.isPending && top15.length === 0
          ? <BlockSkeleton height={400} />
          : <LtvBarChart data={top15} />}
      </Block>

      <Block title="Top 50 clientes — detalhamento"
        subtitle="Mesma lista do LTV com colunas adicionais. Clique em um cliente pra abrir o perfil.">
        {d.isPending && d.ltv.length === 0
          ? <p className="text-sm text-gray-400 py-4">Carregando…</p>
          : d.ltv.length === 0
          ? <p className="text-sm text-gray-400 py-4">Sem dados.</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {[
                      { l: '#', a: 'left' },
                      { l: 'Cliente', a: 'left' },
                      { l: 'Barra', a: 'left' },
                      { l: 'Primeira op.', a: 'left' },
                      { l: 'Última op.', a: 'left' },
                      { l: 'Meses', a: 'right' },
                      { l: 'Lotes op.', a: 'right' },
                      { l: 'Lotes ze.', a: 'right' },
                      { l: 'Receita LTV', a: 'right' },
                      { l: 'Méd./mês', a: 'right' },
                    ].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${h.a === 'left' ? 'text-left' : 'text-right'}`}>
                        {h.l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.ltv.map((c) => (
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
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtNum(c.lotes_zerados)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-emerald-700">{fmtBRL2(c.receita_estimada)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{fmtBRL2(c.receita_media_mensal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Block>
    </div>
  )
}
