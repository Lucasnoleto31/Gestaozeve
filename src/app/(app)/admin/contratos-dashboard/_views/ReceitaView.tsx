'use client'

import { useEffect } from 'react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { ReceitaBlock, MetaBlock } from '../View'
import { BlockSkeleton } from '../Charts'
import { ACTIONS } from '../_lib/dashboardActions'

export function ReceitaView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    receita: true, meta: true, kpis: true,
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

      {d.receitaTotal
        ? <ReceitaBlock total={d.receitaTotal} porAssessor={d.receitaPorAss} projecao={d.receitaProj} />
        : <BlockSkeleton height={400} />}

      <MetaBlock meta={d.meta} />
    </div>
  )
}
