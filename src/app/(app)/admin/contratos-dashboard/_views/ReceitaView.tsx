'use client'

import { useEffect } from 'react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { ReceitaBlock, MetaBlock, Block } from '../View'
import { BlockSkeleton } from '../Charts'
import { fmtBRL2 } from '../_lib/utils'
import { ACTIONS } from '../_lib/dashboardActions'

const CLASSE_INFO: Record<string, { label: string; color: string; descricao: string }> = {
  A: { label: 'A · Ultra lucrativos', color: '#10b981', descricao: 'Primeiros 70% da receita' },
  B: { label: 'B · Consistentes',     color: '#1764f4', descricao: '70-90% acumulado' },
  C: { label: 'C · Sobreviventes',    color: '#f59e0b', descricao: '90-99% acumulado' },
  D: { label: 'D · Marginais',        color: '#94a3b8', descricao: '>99% (cauda longa)' },
}

export function ReceitaView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    receita: true, meta: true, kpis: true, curvaAbc: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  // Agrupa por classe
  const abcAgg = ['A', 'B', 'C', 'D'].map(c => {
    const rows = d.abc.filter(r => r.classe === c)
    return {
      classe: c as 'A' | 'B' | 'C' | 'D',
      num: rows.length,
      receita: rows.reduce((s, r) => s + r.receita_estimada, 0),
      pct: rows.reduce((s, r) => s + r.pct_individual, 0),
    }
  })

  return (
    <div className="space-y-6">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      {d.receitaTotal
        ? <ReceitaBlock total={d.receitaTotal} porAssessor={d.receitaPorAss} projecao={d.receitaProj} />
        : <BlockSkeleton height={400} />}

      <MetaBlock meta={d.meta} />

      <Block title="Curva ABC de clientes"
        subtitle="Pareto da receita. A: primeiros 70%, B: 70-90%, C: 90-99%, D: cauda. Identifica concentração e dependência.">
        {d.abc.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <div className="space-y-4">
              {/* Resumo por classe */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {abcAgg.map(a => {
                  const info = CLASSE_INFO[a.classe]
                  return (
                    <div key={a.classe} className="rounded-xl p-4"
                      style={{ background: 'var(--surface)', border: `2px solid ${info.color}33`, borderLeft: `6px solid ${info.color}` }}>
                      <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: info.color }}>
                        {info.label}
                      </p>
                      <p className="text-2xl font-bold text-gray-700 tabular-nums mt-1">{a.num} clientes</p>
                      <p className="text-xs text-gray-500 mt-1 tabular-nums">{fmtBRL2(a.receita)} · {a.pct.toFixed(1)}%</p>
                      <p className="text-[10px] text-gray-400 mt-1">{info.descricao}</p>
                    </div>
                  )
                })}
              </div>

              {/* Tabela detalhada — top 30 */}
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
                      const info = CLASSE_INFO[r.classe]
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
                              style={{ background: `${info.color}20`, color: info.color }}>
                              {r.classe}
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
              {d.abc.length > 30 && (
                <p className="text-xs text-gray-400">Mostrando 30 de {d.abc.length}. Cauda completa visível na exportação.</p>
              )}
            </div>
          )}
      </Block>
    </div>
  )
}
