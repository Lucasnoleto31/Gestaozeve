'use client'

import { useEffect } from 'react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { AcuracidadeBlock } from '../View'
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

export function ForecastView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    acuracidade: true, kpis: true,
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

      <AcuracidadeBlock resumo={d.acuracidade} serie={d.acuracidadeSerie} />

      <div className="rounded-2xl p-5"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Próximas iterações</p>
        <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
          <li>Forecast Holt-Winters / Prophet pra prever receita do mês com sazonalidade semanal</li>
          <li>Insights automáticos via OpenAI (&quot;WIN acelerou 32%&quot;, &quot;3 clientes VIP esfriaram&quot;)</li>
          <li>Comparação previsto vs realizado por barra/produto</li>
          <li>Alertas preditivos (probabilidade de bater meta, intervalo de confiança)</li>
        </ul>
      </div>
    </div>
  )
}
