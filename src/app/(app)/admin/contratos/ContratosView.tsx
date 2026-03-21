'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Upload, Trash2, Activity, TrendingUp, AlertTriangle, X } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { ImportarContratosModal } from './ImportarContratosModal'
import { deletarImportacaoContrato } from './actions'

interface Contrato {
  id: string
  importacao_id: string
  cliente_id: string | null
  assessor_id: string | null
  data: string | null
  numero_conta: string | null
  cpf: string | null
  cnpj: string | null
  cliente_nome: string | null
  assessor_nome: string | null
  ativo: string | null
  plataforma: string | null
  lotes_operados: number
  lotes_zerados: number
  cliente?: { id: string; nome: string } | null
}

interface Importacao {
  id: string
  nome_arquivo: string
  total_linhas: number
  total_lotes_operados: number
  total_lotes_zerados: number
  created_at: string
}

interface Props {
  contratos: Contrato[]
  importacoes: Importacao[]
}

const formatNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

const formatMonth = (mes: string) =>
  new Date(Number(mes.split('-')[0]), Number(mes.split('-')[1]) - 1)
    .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'America/Sao_Paulo' })

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (active && payload?.length) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs space-y-1">
        <p className="text-gray-400 font-medium mb-1">{label}</p>
        {payload.map((p) => (
          <p key={p.name} style={{ color: p.color }}>{p.name}: {formatNum(p.value)}</p>
        ))}
      </div>
    )
  }
  return null
}

const selectClass = "bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"

export function ContratosView({ contratos, importacoes }: Props) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Filtros globais (afetam cards, gráficos e tabela)
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroAssessor, setFiltroAssessor] = useState('')
  const [filtroAtivo, setFiltroAtivo] = useState('')
  const [filtroPeriodoInicio, setFiltroPeriodoInicio] = useState('')
  const [filtroPeriodoFim, setFiltroPeriodoFim] = useState('')
  const [filtroPlataforma, setFiltroPlataforma] = useState('')

  // Opções dinâmicas dos selects
  const assessores = useMemo(() => {
    const set = new Set(contratos.map((c) => c.assessor_nome).filter(Boolean))
    return Array.from(set).sort() as string[]
  }, [contratos])

  const ativos = useMemo(() => {
    const set = new Set(contratos.map((c) => c.ativo).filter(Boolean))
    return Array.from(set).sort() as string[]
  }, [contratos])

  const plataformas = useMemo(() => {
    const set = new Set(contratos.map((c) => c.plataforma).filter(Boolean))
    return Array.from(set).sort() as string[]
  }, [contratos])

  const clientes = useMemo(() => {
    const map = new Map<string, string>()
    contratos.forEach((c) => {
      const nome = c.cliente?.nome ?? c.cliente_nome
      if (nome) map.set(nome, nome)
    })
    return Array.from(map.keys()).sort()
  }, [contratos])

  const temFiltro = filtroCliente || filtroAssessor || filtroAtivo || filtroPeriodoInicio || filtroPeriodoFim || filtroPlataforma

  // Base filtrada usada em tudo
  const contratosFiltrados = useMemo(() => {
    return contratos.filter((c) => {
      if (filtroCliente) {
        const nome = c.cliente?.nome ?? c.cliente_nome ?? ''
        if (nome !== filtroCliente) return false
      }
      if (filtroAssessor && c.assessor_nome !== filtroAssessor) return false
      if (filtroAtivo && c.ativo !== filtroAtivo) return false
      if (filtroPlataforma && c.plataforma !== filtroPlataforma) return false
      if (filtroPeriodoInicio && c.data && c.data < filtroPeriodoInicio + '-01') return false
      if (filtroPeriodoFim && c.data && c.data > filtroPeriodoFim + '-31') return false
      return true
    })
  }, [contratos, filtroCliente, filtroAssessor, filtroAtivo, filtroPlataforma, filtroPeriodoInicio, filtroPeriodoFim])

  // Cards
  const totalOperados = useMemo(() => contratosFiltrados.reduce((s, c) => s + (c.lotes_operados || 0), 0), [contratosFiltrados])
  const totalZerados = useMemo(() => contratosFiltrados.reduce((s, c) => s + (c.lotes_zerados || 0), 0), [contratosFiltrados])
  const pctZerado = totalOperados > 0 ? ((totalZerados / totalOperados) * 100).toFixed(1) : '0'

  // Evolução mensal (linha)
  const porMes = useMemo(() => {
    const map = new Map<string, { operados: number; zerados: number }>()
    contratosFiltrados.forEach((c) => {
      if (!c.data) return
      const mes = c.data.substring(0, 7)
      const cur = map.get(mes) ?? { operados: 0, zerados: 0 }
      map.set(mes, {
        operados: cur.operados + (c.lotes_operados || 0),
        zerados: cur.zerados + (c.lotes_zerados || 0),
      })
    })
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, v]) => ({ mes, label: formatMonth(mes), ...v }))
  }, [contratosFiltrados])

  // Por barra
  const porAssessor = useMemo(() => {
    const map = new Map<string, { operados: number; zerados: number }>()
    contratosFiltrados.forEach((c) => {
      const nome = c.assessor_nome ?? 'Sem barra'
      const cur = map.get(nome) ?? { operados: 0, zerados: 0 }
      map.set(nome, {
        operados: cur.operados + (c.lotes_operados || 0),
        zerados: cur.zerados + (c.lotes_zerados || 0),
      })
    })
    return Array.from(map.entries())
      .sort(([, a], [, b]) => (b.operados + b.zerados) - (a.operados + a.zerados))
      .slice(0, 10)
      .map(([nome, v]) => ({ nome, ...v }))
  }, [contratosFiltrados])

  // Top clientes
  const porCliente = useMemo(() => {
    const map = new Map<string, { operados: number; zerados: number }>()
    contratosFiltrados.forEach((c) => {
      const nome = c.cliente?.nome ?? c.cliente_nome ?? 'Sem cliente'
      const cur = map.get(nome) ?? { operados: 0, zerados: 0 }
      map.set(nome, {
        operados: cur.operados + (c.lotes_operados || 0),
        zerados: cur.zerados + (c.lotes_zerados || 0),
      })
    })
    return Array.from(map.entries())
      .sort(([, a], [, b]) => (b.operados + b.zerados) - (a.operados + a.zerados))
      .slice(0, 10)
      .map(([nome, v]) => ({ nome, ...v }))
  }, [contratosFiltrados])

  function limparFiltros() {
    setFiltroCliente('')
    setFiltroAssessor('')
    setFiltroAtivo('')
    setFiltroPeriodoInicio('')
    setFiltroPeriodoFim('')
    setFiltroPlataforma('')
  }

  async function handleDeletar(id: string) {
    if (!confirm('Desfazer esta importação? Todos os contratos do lote serão removidos.')) return
    setDeletingId(id)
    await deletarImportacaoContrato(id)
    router.refresh()
    setDeletingId(null)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-end">
        <Button onClick={() => setModalOpen(true)}>
          <Upload className="w-4 h-4" />
          Importar Excel
        </Button>
      </div>

      {/* Filtros globais */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Cliente</label>
            <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} className={selectClass}>
              <option value="">Todos</option>
              {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Barra</label>
            <select value={filtroAssessor} onChange={(e) => setFiltroAssessor(e.target.value)} className={selectClass}>
              <option value="">Todas</option>
              {assessores.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Ativo</label>
            <select value={filtroAtivo} onChange={(e) => setFiltroAtivo(e.target.value)} className={selectClass}>
              <option value="">Todos</option>
              {ativos.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Plataforma</label>
            <select value={filtroPlataforma} onChange={(e) => setFiltroPlataforma(e.target.value)} className={selectClass}>
              <option value="">Todas</option>
              {plataformas.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Período — de</label>
            <input type="month" value={filtroPeriodoInicio} onChange={(e) => setFiltroPeriodoInicio(e.target.value)} className={selectClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">até</label>
            <input type="month" value={filtroPeriodoFim} onChange={(e) => setFiltroPeriodoFim(e.target.value)} className={selectClass} />
          </div>
          {temFiltro && (
            <button onClick={limparFiltros} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-400 pb-1.5">
              <X className="w-3.5 h-3.5" /> Limpar
            </button>
          )}
          <span className="ml-auto text-xs text-gray-500 pb-1.5">{contratosFiltrados.length} registros</span>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Activity className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">Total Lotes Operados</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatNum(totalOperados)}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <span className="text-sm text-gray-500">Total Lotes Zerados</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatNum(totalZerados)}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-amber-600" />
            </div>
            <span className="text-sm text-gray-500">% Zeramento</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{pctZerado}%</p>
        </div>
      </div>

      {/* Gráficos */}
      {porMes.length > 0 && (
        <>
          {/* Evolução mensal — gráfico de linhas */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Evolução Mensal</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={porMes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" />
                <XAxis dataKey="label" tick={{ fill: '#6B7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#6B7280' }} />
                <Line
                  type="monotone"
                  dataKey="operados"
                  name="Operados"
                  stroke="#1764F4"
                  strokeWidth={2}
                  dot={{ fill: '#1764F4', r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="zerados"
                  name="Zerados"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ fill: '#ef4444', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Por barra */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Por Barra</h3>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={porAssessor} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" />
                  <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 11 }} />
                  <YAxis dataKey="nome" type="category" width={80} tick={{ fill: '#6B7280', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#6B7280' }} />
                  <Bar dataKey="operados" name="Operados" fill="#1764F4" radius={[0, 3, 3, 0]} stackId="a" />
                  <Bar dataKey="zerados" name="Zerados" fill="#ef4444" radius={[0, 3, 3, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Top clientes */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Top 10 Clientes</h3>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={porCliente} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" />
                  <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 11 }} />
                  <YAxis dataKey="nome" type="category" width={120} tick={{ fill: '#6B7280', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#6B7280' }} />
                  <Bar dataKey="operados" name="Operados" fill="#1764F4" radius={[0, 3, 3, 0]} stackId="a" />
                  <Bar dataKey="zerados" name="Zerados" fill="#ef4444" radius={[0, 3, 3, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* Tabela */}
      <div className="bg-white border border-gray-200 rounded-2xl">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Lançamentos</h3>
          <span className="text-xs text-gray-500">{contratosFiltrados.length} registros</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Data</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Cliente</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Barra</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Ativo</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Plataforma</th>
                <th className="px-4 py-3 text-right text-xs text-gray-500 font-medium">Lotes Operados</th>
                <th className="px-4 py-3 text-right text-xs text-gray-500 font-medium">Lotes Zerados</th>
              </tr>
            </thead>
            <tbody>
              {contratosFiltrados.slice(0, 100).map((c) => (
                <tr key={c.id} className="border-t border-gray-200 hover:bg-gray-100">
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {c.data ? new Date(c.data + 'T12:00:00').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-700 text-xs font-medium truncate max-w-[150px]">
                      {c.cliente?.nome ?? c.cliente_nome ?? '-'}
                    </p>
                    <p className="text-gray-400 text-xs">{c.cpf ?? c.cnpj}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.assessor_nome ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.ativo ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.plataforma ?? '-'}</td>
                  <td className="px-4 py-3 text-right text-blue-600 text-xs font-medium">
                    {formatNum(c.lotes_operados)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-medium">
                    <span className={c.lotes_zerados > 0 ? 'text-red-500' : 'text-gray-400'}>
                      {formatNum(c.lotes_zerados)}
                    </span>
                  </td>
                </tr>
              ))}
              {contratosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                    Nenhum contrato encontrado.
                  </td>
                </tr>
              )}
              {contratosFiltrados.length > 100 && (
                <tr>
                  <td colSpan={7} className="px-4 py-3 text-center text-xs text-gray-400">
                    Exibindo os primeiros 100 de {contratosFiltrados.length} registros. Use os filtros para refinar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Histórico de importações */}
      {importacoes.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Histórico de Importações</h3>
          <div className="space-y-1">
            {importacoes.map((imp) => (
              <div key={imp.id} className="flex items-center justify-between py-2.5 border-b border-gray-200 last:border-0">
                <div>
                  <p className="text-sm text-gray-700">{imp.nome_arquivo}</p>
                  <p className="text-xs text-gray-500">
                    {imp.total_linhas} linhas ·{' '}
                    <span className="text-blue-600">{formatNum(imp.total_lotes_operados)} operados</span>
                    {' · '}
                    <span className="text-red-500">{formatNum(imp.total_lotes_zerados)} zerados</span>
                    {' · '}{new Date(imp.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                  </p>
                </div>
                <button
                  onClick={() => handleDeletar(imp.id)}
                  disabled={deletingId === imp.id}
                  className="p-1.5 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-40"
                  title="Desfazer importação"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <ImportarContratosModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); router.refresh() }}
      />
    </div>
  )
}
