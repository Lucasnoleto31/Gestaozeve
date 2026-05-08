export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { getProfile } from '@/lib/auth/getProfile'
import { ContratosDashboardView } from './View'
import {
  getKpis,
  getPorProduto,
  getTopClientes,
  getDiarioProduto,
  getHeatmapDow,
  getEvolucaoMensal,
  getDrilldownDia,
  getReceitaTotal,
  getReceitaPorAssessor,
  getReceitaProjecao,
  getMetaAnual,
  getAlertas,
  getAcuracidadeResumo,
  getAcuracidadeSerie,
} from './actions'

export default async function ContratosDashboardPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  return (
    <div>
      <Header title="Dashboard de Contratos" />

      <HeroBanner>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-2">
              Administração
            </p>
            <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard de Contratos</h1>
            <p className="text-blue-200/60 mt-1 text-sm">
              Visão analítica de lotes girados — por produto, cliente, dia e assessor
            </p>
          </div>
        </div>
      </HeroBanner>

      <ContratosDashboardView
        actions={{
          getKpis,
          getPorProduto,
          getTopClientes,
          getDiarioProduto,
          getHeatmapDow,
          getEvolucaoMensal,
          getDrilldownDia,
          getReceitaTotal,
          getReceitaPorAssessor,
          getReceitaProjecao,
          getMetaAnual,
          getAlertas,
          getAcuracidadeResumo,
          getAcuracidadeSerie,
        }}
      />
    </div>
  )
}
