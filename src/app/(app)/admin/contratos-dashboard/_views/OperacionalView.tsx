'use client'

import { useEffect, useState } from 'react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import {
  PorProdutoBlock, WinVsWdoBlock, HeatmapBlock, EvolucaoMensalBlock,
  DrilldownModal,
} from '../View'
import { BlockSkeleton } from '../Charts'
import type { DrilldownRow } from '../actions'
import { getDrilldownDia } from '../actions'
import { ACTIONS } from '../_lib/dashboardActions'

export function OperacionalView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    produtos: true, diario: true, heatmap: true, evolucao: true, kpis: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  const [drillData, setDrillData] = useState<string | null>(null)
  const [drillRows, setDrillRows] = useState<DrilldownRow[]>([])
  function abrirDrilldown(dia: string) {
    setDrillData(dia); setDrillRows([])
    getDrilldownDia(dia).then(setDrillRows).catch(() => {})
  }

  return (
    <div className="space-y-6">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      {d.isPending && d.produtos.length === 0
        ? <BlockSkeleton height={140} />
        : <PorProdutoBlock data={d.produtos} />}

      {d.isPending && d.diario.length === 0
        ? <BlockSkeleton height={320} />
        : <WinVsWdoBlock data={d.diario} onClickDia={abrirDrilldown} />}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <HeatmapBlock data={d.heatmap} />
        <EvolucaoMensalBlock data={d.evolucao} />
      </div>

      {drillData && <DrilldownModal data={drillData} rows={drillRows} onClose={() => setDrillData(null)} />}
    </div>
  )
}
