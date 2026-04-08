'use client'

import { useState, useEffect } from 'react'
import { downloadExcel, downloadPDF, downloadReceitasPDF } from '@/lib/download'
import type { ReportResult, CohortItem } from './actions'
import {
  TrendingUp, Users, Link2, BarChart2, Monitor,
  FileStack, Award, AlertTriangle, UserCheck, ShieldAlert, Calendar,
  RefreshCw,
} from 'lucide-react'

type ReportFn = () => Promise<ReportResult>

interface ReportCard {
  id: string
  title: string
  description: string
  icon: React.ElementType
  iconColor: string
  iconBg: string
  filename: string
  action: ReportFn
  enhanced?: boolean
}

interface CategorySection {
  label: string
  reports: ReportCard[]
}

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
    getCohortContratosPorDia: () => Promise<CohortItem[]>
  }
}

function heatCell(pct: number | undefined): { bg: string; text: string } {
  if (pct === undefined) return { bg: 'transparent', text: '#9ca3af' }
  if (pct === 0) return { bg: '#f9fafb', text: '#d1d5db' }
  if (pct < 25) return { bg: '#f0fdf4', text: '#166534' }
  if (pct < 50) return { bg: '#fefce8', text: '#854d0e' }
  if (pct < 75) return { bg: '#fff7ed', text: '#9a3412' }
  return { bg: '#fef2f2', text: '#991b1b' }
}

function CohortTable({ action }: { action: () => Promise<CohortItem[]> }) {
  const [data, setData] = useState<CohortItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setData(await action())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar cohort.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-gray-400">
        <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        Carregando cohort...
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-6 text-sm text-red-500">
        {error}{' '}
        <button onClick={load} className="underline ml-1 hover:text-red-700">Tentar novamente</button>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return <p className="py-6 text-sm text-gray-400">Nenhum dado de contratos encontrado.</p>
  }

  // Build pivot
  const cohortOrder: string[] = []
  const cohortSet = new Set<string>()
  data.forEach(r => {
    if (!cohortSet.has(r.cohort_mes)) {
      cohortSet.add(r.cohort_mes)
      cohortOrder.push(r.cohort_mes)
    }
  })
  // Sort chronologically (MM/YYYY)
  cohortOrder.sort((a, b) => {
    const [ma, ya] = a.split('/').map(Number)
    const [mb, yb] = b.split('/').map(Number)
    return ya !== yb ? ya - yb : ma - mb
  })

  const maxDay = Math.max(...data.map(r => r.dia_num))
  const days = Array.from({ length: maxDay }, (_, i) => i + 1)

  type CellData = { lotes_operados: number; lotes_zerados: number; pct_zeramento: number }
  const lookup = new Map<string, CellData>()
  data.forEach(r => {
    lookup.set(`${r.cohort_mes}-${r.dia_num}`, {
      lotes_operados: r.lotes_operados,
      lotes_zerados: r.lotes_zerados,
      pct_zeramento: r.pct_zeramento,
    })
  })

  function handleExcel() {
    const columns = ['Cohort', ...days.map(d => `Dia ${d}`)]
    const rows = cohortOrder.map(cohort => [
      cohort,
      ...days.map(d => {
        const cell = lookup.get(`${cohort}-${d}`)
        return cell ? `${cell.pct_zeramento}%` : ''
      }),
    ])
    downloadExcel(columns, rows, 'cohort-contratos-por-dia')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500 leading-snug">
          % zeramento por dia do mês — cada linha é um mês de operação (cohort).
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Recarregar"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Excel
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {[
          { label: '0%', bg: '#f9fafb', text: '#d1d5db' },
          { label: '< 25%', bg: '#f0fdf4', text: '#166534' },
          { label: '25–50%', bg: '#fefce8', text: '#854d0e' },
          { label: '50–75%', bg: '#fff7ed', text: '#9a3412' },
          { label: '≥ 75%', bg: '#fef2f2', text: '#991b1b' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1 text-xs">
            <span className="w-3 h-3 rounded-sm inline-block border border-gray-200" style={{ background: l.bg }} />
            <span style={{ color: l.text }}>{l.label}</span>
          </span>
        ))}
        <span className="text-xs text-gray-400 ml-1">= % lotes zerados</span>
      </div>

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
        <table className="text-xs border-collapse min-w-max w-full">
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              <th className="px-3 py-2 text-left font-semibold text-gray-600 sticky left-0 z-10 border-r"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', minWidth: 90 }}>
                Cohort
              </th>
              {days.map(d => (
                <th key={d} className="px-2 py-2 text-center font-medium text-gray-500 border-r last:border-r-0"
                  style={{ borderColor: 'var(--border)', minWidth: 52 }}>
                  Dia {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohortOrder.map((cohort, ri) => (
              <tr key={cohort} style={{ borderTop: '1px solid var(--border)', background: ri % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                <td className="px-3 py-1.5 font-medium text-gray-700 sticky left-0 z-10 border-r"
                  style={{ background: ri % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)', borderColor: 'var(--border)' }}>
                  {cohort}
                </td>
                {days.map(d => {
                  const cell = lookup.get(`${cohort}-${d}`)
                  const { bg, text } = heatCell(cell?.pct_zeramento)
                  return (
                    <td key={d} className="px-2 py-1.5 text-center border-r last:border-r-0 font-medium"
                      style={{ background: bg, color: text, borderColor: 'var(--border)' }}
                      title={cell ? `Operados: ${cell.lotes_operados} | Zerados: ${cell.lotes_zerados}` : undefined}
                    >
                      {cell ? `${cell.pct_zeramento}%` : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function RelatoriosView({ actions }: Props) {
  const [loading, setLoading] = useState<Record<string, 'excel' | 'pdf' | null>>({})

  const categories: CategorySection[] = [
    {
      label: 'Receitas',
      reports: [
        {
          id: 'receita-mes',
          title: 'Receita por Mês',
          description: 'Receita Genial, Bruto AAI, Imposto, Líquido AAI e Comissão consolidados por mês.',
          icon: TrendingUp,
          iconColor: 'text-emerald-600',
          iconBg: 'bg-emerald-50',
          filename: 'receita-por-mes',
          action: actions.getReceitaPorMes,
          enhanced: true,
        },
        {
          id: 'receita-assessor',
          title: 'Receita por Assessor',
          description: 'Receita líquida e comissão agrupadas por barra/assessor.',
          icon: Users,
          iconColor: 'text-blue-600',
          iconBg: 'bg-blue-50',
          filename: 'receita-por-assessor',
          action: actions.getReceitaPorAssessor,
          enhanced: true,
        },
        {
          id: 'receita-influenciador',
          title: 'Receita por Influenciador',
          description: 'Receita líquida gerada por clientes de cada influenciador.',
          icon: Link2,
          iconColor: 'text-violet-600',
          iconBg: 'bg-violet-50',
          filename: 'receita-por-influenciador',
          action: actions.getReceitaPorInfluenciador,
          enhanced: true,
        },
        {
          id: 'receita-ativo',
          title: 'Receita por Ativo',
          description: 'Receita líquida agrupada por produto/ativo negociado.',
          icon: BarChart2,
          iconColor: 'text-amber-600',
          iconBg: 'bg-amber-50',
          filename: 'receita-por-ativo',
          action: actions.getReceitaPorAtivo,
          enhanced: true,
        },
        {
          id: 'receita-plataforma',
          title: 'Receita por Plataforma',
          description: 'Receita líquida, lotes operados e zerados por plataforma.',
          icon: Monitor,
          iconColor: 'text-blue-600',
          iconBg: 'bg-blue-50',
          filename: 'receita-por-plataforma',
          action: actions.getReceitaPorPlataforma,
          enhanced: true,
        },
      ],
    },
    {
      label: 'Contratos',
      reports: [
        {
          id: 'contratos-mes',
          title: 'Contratos Girados e Zerados',
          description: 'Lotes operados e zerados por mês com percentual de zeramento.',
          icon: FileStack,
          iconColor: 'text-red-500',
          iconBg: 'bg-red-50',
          filename: 'contratos-girados-zerados',
          action: actions.getContratosGiradosZerados,
        },
      ],
    },
    {
      label: 'Plataformas',
      reports: [
        {
          id: 'plataformas-mes',
          title: 'Plataformas Mensais',
          description: 'Somatória do valor por plataforma agrupada por mês.',
          icon: Monitor,
          iconColor: 'text-indigo-600',
          iconBg: 'bg-indigo-50',
          filename: 'plataformas-mensais',
          action: actions.getPlataformasPorMes,
        },
      ],
    },
    {
      label: 'Clientes',
      reports: [
        {
          id: 'top-clientes',
          title: 'Top Clientes',
          description: 'Clientes ordenados por maior receita líquida gerada.',
          icon: Award,
          iconColor: 'text-yellow-600',
          iconBg: 'bg-yellow-50',
          filename: 'top-clientes',
          action: actions.getTopClientes,
        },
        {
          id: 'top-clientes-risco',
          title: 'Top Clientes por Risco',
          description: 'Clientes com menor score CHS — maior risco de churn.',
          icon: AlertTriangle,
          iconColor: 'text-red-500',
          iconBg: 'bg-red-50',
          filename: 'top-clientes-risco',
          action: actions.getTopClientesPorRisco,
        },
        {
          id: 'clientes-periodo',
          title: 'Clientes por Período',
          description: 'Novos clientes cadastrados por mês com status atual.',
          icon: Calendar,
          iconColor: 'text-cyan-600',
          iconBg: 'bg-cyan-50',
          filename: 'clientes-por-periodo',
          action: actions.getClientesPorPeriodo,
        },
      ],
    },
    {
      label: 'Influenciadores',
      reports: [
        {
          id: 'top-influenciadores',
          title: 'Top Influenciadores',
          description: 'Leads, conversões, % conversão e receita gerada por influenciador.',
          icon: UserCheck,
          iconColor: 'text-pink-600',
          iconBg: 'bg-pink-50',
          filename: 'top-influenciadores',
          action: actions.getTopInfluenciadores,
        },
      ],
    },
    {
      label: 'Análise de Risco',
      reports: [
        {
          id: 'churn-plataforma',
          title: 'Churn por Plataforma',
          description: 'Clientes com risco de churn alto, médio e baixo agrupados por plataforma.',
          icon: ShieldAlert,
          iconColor: 'text-orange-600',
          iconBg: 'bg-orange-50',
          filename: 'churn-por-plataforma',
          action: actions.getChurnPorPlataforma,
        },
      ],
    },
  ]

  async function handleDownload(report: ReportCard, format: 'excel' | 'pdf') {
    setLoading((prev) => ({ ...prev, [report.id]: format }))
    try {
      const { columns, rows } = await report.action()
      if (format === 'excel') {
        downloadExcel(columns, rows, report.filename)
      } else if (report.enhanced) {
        downloadReceitasPDF(columns, rows, report.title, report.filename)
      } else {
        downloadPDF(columns, rows, report.title, report.filename)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao gerar relatório.')
    } finally {
      setLoading((prev) => ({ ...prev, [report.id]: null }))
    }
  }

  return (
    <div className="p-6 space-y-8">
      {categories.map((cat) => (
        <section key={cat.label}>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
            {cat.label}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cat.reports.map((report) => {
              const Icon = report.icon
              const isLoading = loading[report.id]
              return (
                <div
                  key={report.id}
                  className="rounded-2xl p-5 flex flex-col gap-4 animate-fade-up transition-all duration-200 hover:translate-y-[-2px]"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${report.iconBg}`}>
                      <Icon className={`w-5 h-5 ${report.iconColor}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{report.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-snug">{report.description}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-auto">
                    <button
                      onClick={() => handleDownload(report, 'excel')}
                      disabled={!!isLoading}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading === 'excel' ? (
                        <span className="inline-block w-3 h-3 border border-emerald-700 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                      )}
                      Excel
                    </button>
                    <button
                      onClick={() => handleDownload(report, 'pdf')}
                      disabled={!!isLoading}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading === 'pdf' ? (
                        <span className="inline-block w-3 h-3 border border-red-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="12" y1="18" x2="12" y2="12" />
                          <polyline points="9 15 12 18 15 15" />
                        </svg>
                      )}
                      PDF
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {cat.label === 'Contratos' && (
            <div
              className="mt-4 rounded-2xl p-5"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                  <FileStack className="w-4 h-4 text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Análise Cohort — % Zeramento por Dia</p>
                  <p className="text-xs text-gray-500 mt-0.5">Cada cohort é um mês de operação; colunas são os dias do mês.</p>
                </div>
              </div>
              <CohortTable action={actions.getCohortContratosPorDia} />
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
