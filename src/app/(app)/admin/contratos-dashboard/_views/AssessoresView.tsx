'use client'

import { useEffect } from 'react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { ReceitaBlock, Block } from '../View'
import { BlockSkeleton } from '../Charts'
import { fmtNum, fmtBRL } from '../_lib/utils'
import {
  getKpis, getPorProduto, getTopClientes, getDiarioProduto,
  getHeatmapDow, getEvolucaoMensal, getDrilldownDia,
  getReceitaTotal, getReceitaPorAssessor, getReceitaProjecao,
  getMetaAnual, getAlertas, getAcuracidadeResumo, getAcuracidadeSerie,
  getBarrasAtivas,
} from '../actions'

const ACTIONS = {
  getKpis, getPorProduto, getTopClientes, getDiarioProduto,
  getHeatmapDow, getEvolucaoMensal, getDrilldownDia,
  getReceitaTotal, getReceitaPorAssessor, getReceitaProjecao,
  getMetaAnual, getAlertas, getAcuracidadeResumo, getAcuracidadeSerie,
  getBarrasAtivas,
}

export function AssessoresView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    receita: true, kpis: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  // Ranking simples: barras ordenadas por receita_total
  const ranking = [...d.receitaPorAss].sort((a, b) => b.receita_total - a.receita_total)
  const totalReceita = ranking.reduce((s, r) => s + r.receita_total, 0)

  return (
    <div className="space-y-6">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      <Block title="Ranking de barras (período)"
        subtitle="Ordenado por receita total. Use o filtro acima pra ver período/barra específica.">
        {d.isPending && ranking.length === 0
          ? <p className="text-sm text-gray-400 py-4">Carregando…</p>
          : ranking.length === 0
          ? <p className="text-sm text-gray-400 py-4">Sem dados.</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['#', 'Barra', 'Nº', 'Lotes op.', 'Lotes ze.', '% zeragem', 'Receita', '% receita'].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 border-r last:border-r-0 ${i <= 2 ? 'text-left' : 'text-right'}`}
                        style={{ borderColor: 'var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => {
                    const pctZe = r.lotes_operados > 0 ? (r.lotes_zerados / r.lotes_operados) * 100 : 0
                    const pctRec = totalReceita > 0 ? (r.receita_total / totalReceita) * 100 : 0
                    return (
                      <tr key={r.barra_nome + i}
                        style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                        <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-1.5 font-medium text-gray-700">{r.barra_nome}</td>
                        <td className="px-3 py-1.5 text-gray-500 tabular-nums">{/* numero from receita action */}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(r.lotes_operados)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtNum(r.lotes_zerados)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{pctZe.toFixed(1)}%</td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-emerald-700">{fmtBRL(r.receita_total)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{pctRec.toFixed(1)}%</td>
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
