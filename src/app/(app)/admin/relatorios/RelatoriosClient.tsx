'use client'

import dynamic from 'next/dynamic'
import type { ReportResult } from './actions'

type ReportFn = () => Promise<ReportResult>

interface Props {
  actions: {
    getReceitaPorMes: ReportFn
    getReceitaPorAssessor: ReportFn
    getReceitaPorInfluenciador: ReportFn
    getReceitaPorAtivo: ReportFn
    getReceitaPorPlataforma: ReportFn
    getContratosGiradosZerados: ReportFn
    getTopClientes: ReportFn
    getTopClientesPorRisco: ReportFn
    getTopInfluenciadores: ReportFn
    getChurnPorPlataforma: ReportFn
    getClientesPorPeriodo: ReportFn
    getPlataformasPorMes: ReportFn
  }
}

const RelatoriosView = dynamic(
  () => import('./RelatoriosView').then((m) => m.RelatoriosView),
  { ssr: false, loading: () => <div className="p-6 text-sm text-gray-500">Carregando...</div> }
)

export function RelatoriosClient({ actions }: Props) {
  return <RelatoriosView actions={actions} />
}
