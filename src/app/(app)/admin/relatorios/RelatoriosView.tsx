'use client'

import { useState, useEffect } from 'react'
import { downloadExcel, downloadPDF, downloadReceitasPDF } from '@/lib/download'
import type { ReportResult, CohortItem, ComparativoItem } from './actions'
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
    getLotesComparativo: () => Promise<ComparativoItem[]>
  }
}

function lotesHeatCell(value: number, max: number): { bg: string; text: string } {
  if (value === 0) return { bg: '#f9fafb', text: '#d1d5db' }
  const t = max > 0 ? value / max : 0
  if (t < 0.2) return { bg: '#eff6ff', text: '#3b82f6' }
  if (t < 0.4) return { bg: '#dbeafe', text: '#2563eb' }
  if (t < 0.6) return { bg: '#bfdbfe', text: '#1d4ed8' }
  if (t < 0.8) return { bg: '#93c5fd', text: '#1e40af' }
  return { bg: '#3b82f6', text: '#ffffff' }
}

function varTag(pct: number | null): { color: string; label: string } {
  if (pct === null) return { color: '#9ca3af', label: '—' }
  if (pct > 0) return { color: '#16a34a', label: `+${pct.toFixed(1)}%` }
  if (pct < 0) return { color: '#dc2626', label: `${pct.toFixed(1)}%` }
  return { color: '#6b7280', label: '0%' }
}

function mesLabel(offset: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - offset)
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')
}

function ExcelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 transition-colors">
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      </svg>
      Excel
    </button>
  )
}

function AsyncBlock<T>({
  action, children, label,
}: {
  action: () => Promise<T>
  children: (data: T, reload: () => void) => React.ReactNode
  label: string
}) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try { setData(await action()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Erro.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="flex items-center gap-2 py-8 text-sm text-gray-400">
      <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      Carregando {label}...
    </div>
  )
  if (error) return (
    <div className="py-6 text-sm text-red-500">
      {error}{' '}
      <button onClick={load} className="underline ml-1 hover:text-red-700">Tentar novamente</button>
    </div>
  )
  if (!data) return null
  return <>{children(data, load)}</>
}

function CohortTable({ action }: { action: () => Promise<CohortItem[]> }) {
  return (
    <AsyncBlock action={action} label="cohort">
      {(data, reload) => {
        if (!data.length) return <p className="py-6 text-sm text-gray-400">Nenhum dado encontrado.</p>

        const cohortOrder = Array.from(new Set(data.map(r => r.cohort_mes))).sort((a, b) => {
          const [ma, ya] = a.split('/').map(Number)
          const [mb, yb] = b.split('/').map(Number)
          return ya !== yb ? ya - yb : ma - mb
        })
        const maxDay = Math.max(...data.map(r => r.dia_num))
        const days = Array.from({ length: maxDay }, (_, i) => i + 1)
        const maxLotes = Math.max(...data.map(r => r.lotes_operados))
        const lookup = new Map(data.map(r => [`${r.cohort_mes}-${r.dia_num}`, r]))

        function handleExcel() {
          const cols = ['Cohort', ...days.map(d => `Dia ${d}`)]
          const rows = cohortOrder.map(c => [c, ...days.map(d => lookup.get(`${c}-${d}`)?.lotes_operados ?? '')])
          downloadExcel(cols, rows, 'cohort-lotes-girados')
        }

        return (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500">Lotes girados por dia do mês — intensidade = volume relativo.</p>
              <div className="flex items-center gap-2">
                <button onClick={reload} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Recarregar">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <ExcelBtn onClick={handleExcel} />
              </div>
            </div>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              {[
                { label: 'Baixo', bg: '#eff6ff', text: '#3b82f6' },
                { label: '', bg: '#dbeafe', text: '#2563eb' },
                { label: '', bg: '#bfdbfe', text: '#1d4ed8' },
                { label: '', bg: '#93c5fd', text: '#1e40af' },
                { label: 'Alto', bg: '#3b82f6', text: '#fff' },
              ].map((l, i) => (
                <span key={i} className="flex items-center gap-1 text-xs">
                  <span className="w-4 h-3 rounded-sm inline-block border border-gray-200" style={{ background: l.bg }} />
                  {l.label && <span style={{ color: l.text }}>{l.label}</span>}
                </span>
              ))}
              <span className="text-xs text-gray-400 ml-1">= volume de lotes girados</span>
            </div>
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 sticky left-0 z-10 border-r"
                      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', minWidth: 90 }}>Cohort</th>
                    {days.map(d => (
                      <th key={d} className="px-2 py-2 text-center font-medium text-gray-500 border-r last:border-r-0"
                        style={{ borderColor: 'var(--border)', minWidth: 50 }}>Dia {d}</th>
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
                        const { bg, text } = lotesHeatCell(cell?.lotes_operados ?? 0, maxLotes)
                        return (
                          <td key={d} className="px-2 py-1.5 text-center border-r last:border-r-0 font-medium tabular-nums"
                            style={{ background: bg, color: text, borderColor: 'var(--border)' }}
                            title={cell ? `Zerados: ${cell.lotes_zerados} (${cell.pct_zeramento}%)` : undefined}>
                            {cell ? cell.lotes_operados : '—'}
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
      }}
    </AsyncBlock>
  )
}

function ComparativoTable({ action }: { action: () => Promise<ComparativoItem[]> }) {
  return (
    <AsyncBlock action={action} label="comparativo">
      {(data, reload) => {
        if (!data.length) return <p className="py-6 text-sm text-gray-400">Sem dados para comparativo.</p>

        const totalAtual = data.reduce((s, r) => s + r.lotes_mes_atual, 0)
        const totalMedia = data.reduce((s, r) => s + r.media_3m, 0)
        const varTotal = totalMedia > 0 ? ((totalAtual - totalMedia) / totalMedia * 100) : null
        const { color: varColor, label: varLabel } = varTag(varTotal)

        const m0 = mesLabel(0), m1 = mesLabel(1), m2 = mesLabel(2), m3 = mesLabel(3)

        function handleExcel() {
          const cols = ['Dia', m0, m1, m2, m3, 'Média 3M', 'Variação vs Média']
          const rows = data.map(r => {
            const { label } = varTag(r.variacao_pct)
            return [r.dia_num, r.lotes_mes_atual, r.lotes_m1, r.lotes_m2, r.lotes_m3, r.media_3m, label]
          })
          const { label: tl } = varTag(varTotal)
          rows.push(['Total', totalAtual, '', '', '',
            Math.round(totalMedia * 100) / 100, tl])
          downloadExcel(cols, rows, 'comparativo-lotes-por-dia')
        }

        return (
          <div>
            {/* Summary banner */}
            <div className="flex flex-wrap items-center gap-4 mb-4 p-3 rounded-xl"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-0.5">Acumulado {m0}</p>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{totalAtual.toLocaleString('pt-BR')}</p>
                <p className="text-xs text-gray-500">lotes girados</p>
              </div>
              <div className="w-px h-10 bg-gray-200 hidden sm:block" />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-0.5">Média mesmo período (3M)</p>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{Math.round(totalMedia).toLocaleString('pt-BR')}</p>
                <p className="text-xs text-gray-500">lotes (média)</p>
              </div>
              <div className="w-px h-10 bg-gray-200 hidden sm:block" />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-0.5">Variação</p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: varColor }}>{varLabel}</p>
                <p className="text-xs text-gray-500">vs média 3 meses</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={reload} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Recarregar">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <ExcelBtn onClick={handleExcel} />
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    {['Dia', m0, m1, m2, m3, 'Média 3M', 'Variação vs Média'].map((h, i) => (
                      <th key={i}
                        className={`px-3 py-2 font-semibold border-r last:border-r-0 ${i === 0 ? 'text-left text-gray-600 sticky left-0 z-10' : 'text-center text-gray-500'}`}
                        style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', minWidth: i === 0 ? 54 : 80 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((r, ri) => {
                    const { color, label } = varTag(r.variacao_pct)
                    const rowBg = ri % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)'
                    return (
                      <tr key={r.dia_num} style={{ borderTop: '1px solid var(--border)', background: rowBg }}>
                        <td className="px-3 py-1.5 font-semibold text-gray-700 sticky left-0 z-10 border-r tabular-nums"
                          style={{ background: rowBg, borderColor: 'var(--border)' }}>
                          {r.dia_num}
                        </td>
                        <td className="px-3 py-1.5 text-center font-semibold text-blue-700 border-r tabular-nums"
                          style={{ borderColor: 'var(--border)' }}>
                          {r.lotes_mes_atual > 0 ? r.lotes_mes_atual : <span className="text-gray-300">—</span>}
                        </td>
                        {[r.lotes_m1, r.lotes_m2, r.lotes_m3].map((v, i) => (
                          <td key={i} className="px-3 py-1.5 text-center text-gray-500 border-r tabular-nums"
                            style={{ borderColor: 'var(--border)' }}>
                            {v > 0 ? v : <span className="text-gray-300">—</span>}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-center text-gray-600 border-r tabular-nums"
                          style={{ borderColor: 'var(--border)' }}>
                          {r.media_3m > 0 ? r.media_3m : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-1.5 text-center font-semibold tabular-nums"
                          style={{ color }}>
                          {label}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Total row */}
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
                    <td className="px-3 py-2 font-bold text-gray-700 sticky left-0 z-10 border-r"
                      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>Total</td>
                    <td className="px-3 py-2 text-center font-bold text-blue-700 border-r tabular-nums"
                      style={{ borderColor: 'var(--border)' }}>{totalAtual.toLocaleString('pt-BR')}</td>
                    <td colSpan={3} className="border-r" style={{ borderColor: 'var(--border)' }} />
                    <td className="px-3 py-2 text-center font-bold text-gray-600 border-r tabular-nums"
                      style={{ borderColor: 'var(--border)' }}>{Math.round(totalMedia).toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2 text-center font-bold tabular-nums" style={{ color: varColor }}>{varLabel}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      }}
    </AsyncBlock>
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
            <>
              {/* Comparativo dia a dia vs últimos 3 meses */}
              <div className="mt-4 rounded-2xl p-5"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Lotes Girados — Mês Atual vs Últimos 3 Meses</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Compare cada dia do mês atual com o mesmo dia nos 3 meses anteriores. Dias abaixo da média indicam momento ideal para intensificar campanhas.
                    </p>
                  </div>
                </div>
                <ComparativoTable action={actions.getLotesComparativo} />
              </div>

              {/* Cohort por dia */}
              <div className="mt-4 rounded-2xl p-5"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                    <FileStack className="w-4 h-4 text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Cohort — Lotes Girados por Dia</p>
                    <p className="text-xs text-gray-500 mt-0.5">Cada linha é um mês (cohort); colunas são os dias. Intensidade = volume relativo de lotes girados.</p>
                  </div>
                </div>
                <CohortTable action={actions.getCohortContratosPorDia} />
              </div>
            </>
          )}
        </section>
      ))}
    </div>
  )
}
