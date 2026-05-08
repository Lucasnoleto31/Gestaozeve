'use client'

import { useEffect } from 'react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { TopClientesParetoBlock, AlertasBlock } from '../View'
import { BlockSkeleton } from '../Charts'
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

export function ClientesView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    topClientes: true, alertas: true, kpis: true,
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

      {d.isPending && d.topClientes.length === 0
        ? <BlockSkeleton height={400} />
        : <TopClientesParetoBlock data={d.topClientes} onPickCliente={(id) => {
            if (id) window.location.href = `/clientes/${id}`
          }} />}

      <AlertasBlock data={d.alertas} onPickCliente={(id) => {
        if (id) window.location.href = `/clientes/${id}`
      }} />
    </div>
  )
}
