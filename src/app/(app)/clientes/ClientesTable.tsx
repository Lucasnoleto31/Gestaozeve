'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Cliente } from '@/types/cliente'
import { ScoreBadge } from '@/components/chs/ScoreGauge'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatCPF, cn } from '@/lib/utils'
import { deletarClientes, atualizarStatusClientes, recalcularScoreTodos } from './actions'
import {
  Search, Plus, Download, Upload, Trash2,
  Eye, Edit, ChevronDown, X, Users,
  CheckCircle, AlertTriangle, AlertOctagon, Filter, RefreshCw,
} from 'lucide-react'
import { NovoClienteModal } from './NovoClienteModal'
import { ImportarClientesModal } from './ImportarClientesModal'

interface Props {
  clientes: (Cliente & { ultimo_score?: { score_total: number; classificacao: string; tendencia: string }[] })[]
  total: number
  kpis: { saudaveis: number; atencao: number; risco: number }
  assessores: { id: string; nome: string }[]
  filtros: { q?: string; status?: string; classificacao?: string }
  isAdmin: boolean
}

const statusConfig = {
  ativo: { label: 'Ativo', variant: 'success' as const },
  inativo: { label: 'Inativo', variant: 'danger' as const },
  em_transferencia: { label: 'Transferência', variant: 'warning' as const },
}

function Initials({ nome }: { nome: string }) {
  const parts = nome.trim().split(' ')
  const initials = parts.length >= 2
    ? parts[0][0] + parts[parts.length - 1][0]
    : parts[0]?.substring(0, 2) ?? '?'
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white select-none"
      style={{ background: 'linear-gradient(135deg, var(--blue) 0%, var(--blue-dark) 100%)' }}
    >
      {initials.toUpperCase()}
    </div>
  )
}

export function ClientesTable({ clientes, total, kpis, assessores, filtros, isAdmin }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState(filtros.q ?? '')
  const [novoOpen, setNovoOpen] = useState(false)
  const [importarOpen, setImportarOpen] = useState(false)
  const [acaoEmMassa, setAcaoEmMassa] = useState(false)
  const [recalculando, setRecalculando] = useState(false)
  const [recalcMsg, setRecalcMsg] = useState('')

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === clientes.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(clientes.map((c) => c.id)))
    }
  }

  function aplicarFiltro(key: string, value: string) {
    const params = new URLSearchParams()
    if (key !== 'q' && busca) params.set('q', busca)
    if (key !== 'status' && filtros.status) params.set('status', filtros.status)
    if (key !== 'classificacao' && filtros.classificacao) params.set('classificacao', filtros.classificacao)
    if (value) params.set(key, value)
    router.push(`/clientes?${params.toString()}`)
  }

  function handleBusca(e: React.FormEvent) {
    e.preventDefault()
    aplicarFiltro('q', busca)
  }

  async function handleRecalcularTodos() {
    if (!confirm(`Recalcular score de todos os ${total} clientes? Pode demorar alguns segundos.`)) return
    setRecalculando(true)
    setRecalcMsg('')
    try {
      const result = await recalcularScoreTodos()
      setRecalcMsg(
        `✓ ${result.ok} scores atualizados` +
        (result.inativos > 0 ? ` · ${result.inativos} marcado(s) como inativo` : '') +
        (result.erros > 0 ? ` (${result.erros} erros)` : '')
      )
      router.refresh()
    } catch (err) {
      setRecalcMsg(`Erro: ${err instanceof Error ? err.message : String(err)}`)
    }
    setRecalculando(false)
  }

  function exportarCSV() {
    const rows = [
      ['Nome', 'CPF', 'E-mail', 'Telefone', 'Status', 'Score', 'Classificação', 'Assessor'],
      ...clientes.map((c) => [
        c.nome,
        formatCPF(c.cpf),
        c.email ?? '',
        c.telefone ?? '',
        c.status,
        c.ultimo_score?.[0]?.score_total?.toString() ?? '',
        c.ultimo_score?.[0]?.classificacao ?? '',
        c.assessor?.nome ?? '',
      ]),
    ]
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clientes_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleDeletar() {
    if (!confirm(`Excluir ${selected.size} cliente(s)? Esta ação não pode ser desfeita.`)) return
    startTransition(async () => {
      try {
        const result = await deletarClientes(Array.from(selected))
        if (result?.error) {
          alert(`Erro ao excluir: ${result.error}`)
          return
        }
        setSelected(new Set())
      } catch (err) {
        alert(`Erro inesperado: ${err instanceof Error ? err.message : String(err)}`)
      }
    })
  }

  async function handleMudarStatus(status: string) {
    startTransition(async () => {
      await atualizarStatusClientes(Array.from(selected), status)
      setSelected(new Set())
      setAcaoEmMassa(false)
    })
  }

  const { saudaveis, atencao, risco } = kpis

  return (
    <div>

      {/* ── Hero institucional ── */}
      <div
        className="relative overflow-hidden px-8 pt-10 pb-8"
        style={{ background: 'linear-gradient(140deg, #0A1628 0%, #0F2550 50%, #1764F4 100%)' }}
      >
        {/* Grid texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* Glow */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 60% 80% at 80% 50%, rgba(23,100,244,0.3) 0%, transparent 70%)' }}
        />

        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4 mb-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300 mb-1.5">Gestão</p>
              <h1 className="text-2xl font-bold text-white tracking-tight">Carteira de Clientes</h1>
              <p className="text-sm text-blue-100/60 mt-1">
                {total} cliente{total !== 1 ? 's' : ''} cadastrado{total !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={handleRecalcularTodos}
                disabled={recalculando}
                title="Recalcular score de todos os clientes"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white/80 hover:text-white disabled:opacity-50 transition-colors"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${recalculando ? 'animate-spin' : ''}`} />
                {recalculando ? 'Calculando...' : 'Recalcular Scores'}
              </button>
              <button
                onClick={exportarCSV}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white/80 hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <Download className="w-3.5 h-3.5" />
                Exportar
              </button>
              <button
                onClick={() => setImportarOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white/80 hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <Upload className="w-3.5 h-3.5" />
                Importar
              </button>
              <button
                onClick={() => setNovoOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors"
                style={{ background: 'var(--blue)', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <Plus className="w-3.5 h-3.5" />
                Novo Cliente
              </button>
            </div>
          </div>
          {recalcMsg && (
            <p className="text-xs text-emerald-300 mt-2 text-right">{recalcMsg}</p>
          )}

          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: Users, label: 'Total', value: total, color: 'text-white', bg: 'rgba(255,255,255,0.1)' },
              { icon: CheckCircle, label: 'Saudáveis', value: saudaveis, color: 'text-emerald-300', bg: 'rgba(16,185,129,0.15)' },
              { icon: AlertTriangle, label: 'Em atenção', value: atencao, color: 'text-amber-300', bg: 'rgba(245,158,11,0.15)' },
              { icon: AlertOctagon, label: 'Em risco', value: risco, color: 'text-red-300', bg: 'rgba(239,68,68,0.15)' },
            ].map(({ icon: Icon, label, value, color, bg }) => (
              <div
                key={label}
                className="rounded-xl px-4 py-3"
                style={{ background: bg, border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-white/60">{label}</p>
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                </div>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="px-6 py-4 flex flex-col sm:flex-row gap-3" style={{ background: '#fff', borderBottom: '1px solid var(--border-subtle)' }}>
        <form onSubmit={handleBusca} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, CPF ou e-mail..."
              className="w-full rounded-lg pl-9 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none transition-all"
              style={{ background: 'var(--surface-3)', border: '1.5px solid var(--border)' }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--blue)'; e.target.style.boxShadow = '0 0 0 3px rgba(23,100,244,0.08)' }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = '' }}
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">Buscar</Button>
        </form>

        <div className="flex gap-2 items-center flex-wrap">
          <Filter className="w-3.5 h-3.5 text-gray-400 hidden sm:block" />
          <select
            value={filtros.status ?? ''}
            onChange={(e) => aplicarFiltro('status', e.target.value)}
            className="text-sm rounded-lg px-3 py-2 focus:outline-none cursor-pointer"
            style={{ background: 'var(--surface-3)', border: '1.5px solid var(--border)', color: 'var(--foreground)' }}
          >
            <option value="">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="em_transferencia">Transferência</option>
          </select>

          <select
            value={filtros.classificacao ?? ''}
            onChange={(e) => aplicarFiltro('classificacao', e.target.value)}
            className="text-sm rounded-lg px-3 py-2 focus:outline-none cursor-pointer"
            style={{ background: 'var(--surface-3)', border: '1.5px solid var(--border)', color: 'var(--foreground)' }}
          >
            <option value="">Todos os scores</option>
            <option value="saudavel">Saudável</option>
            <option value="atencao">Atenção</option>
            <option value="risco">Risco</option>
          </select>
        </div>
      </div>

      {/* ── Ações em massa ── */}
      {selected.size > 0 && (
        <div
          className="mx-6 mt-4 flex items-center gap-3 rounded-xl px-4 py-2.5 animate-fade-down"
          style={{ background: 'var(--blue-dim)', border: '1px solid var(--blue-glow)' }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--blue)' }}>{selected.size} selecionado(s)</span>
          <div className="flex gap-2 ml-auto">
            <div className="relative">
              <Button variant="secondary" size="sm" onClick={() => setAcaoEmMassa(!acaoEmMassa)}>
                Mudar status <ChevronDown className="w-3 h-3" />
              </Button>
              {acaoEmMassa && (
                <div
                  className="absolute top-full mt-1 right-0 rounded-xl py-1 z-10 min-w-36 shadow-lg animate-fade-down"
                  style={{ background: '#fff', border: '1px solid var(--border)' }}
                >
                  {['ativo', 'inativo', 'em_transferencia'].map((s) => (
                    <button
                      key={s}
                      onClick={() => handleMudarStatus(s)}
                      className="w-full text-left px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                    >
                      {statusConfig[s as keyof typeof statusConfig].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {isAdmin && (
              <Button variant="danger" size="sm" onClick={handleDeletar} loading={isPending}>
                <Trash2 className="w-4 h-4" />
                Excluir
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Tabela ── */}
      <div className="p-6">
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 8px rgba(23,100,244,0.06)' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--surface-3)', borderBottom: '1px solid var(--border)' }}>
                  <th className="px-5 py-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === clientes.length && clientes.length > 0}
                      onChange={toggleAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  {['Cliente', 'CPF', 'Contato', 'Status', 'Score CHS', 'Assessor', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientes.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center"
                          style={{ background: 'var(--surface-3)' }}
                        >
                          <Search className="w-5 h-5 text-gray-400" />
                        </div>
                        <p className="text-sm font-medium text-gray-500">Nenhum cliente encontrado.</p>
                        <p className="text-xs text-gray-400">Tente ajustar os filtros de busca.</p>
                      </div>
                    </td>
                  </tr>
                )}
                {clientes.map((cliente) => {
                  const score = cliente.ultimo_score?.[0]
                  return (
                    <tr
                      key={cliente.id}
                      className={cn(
                        'transition-colors group',
                        selected.has(cliente.id) ? 'bg-blue-50/60' : 'hover:bg-gray-50/80'
                      )}
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <td className="px-5 py-3.5">
                        <input
                          type="checkbox"
                          checked={selected.has(cliente.id)}
                          onChange={() => toggleSelect(cliente.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <Initials nome={cliente.nome} />
                          <div>
                            <p className="font-semibold text-gray-900">{cliente.nome}</p>
                            {cliente.tipo_operacao && (
                              <p className="text-xs capitalize text-gray-400 mt-0.5">{cliente.tipo_operacao.replace('_', ' ')}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-gray-400">{formatCPF(cliente.cpf)}</td>
                      <td className="px-4 py-3.5">
                        <p className="text-xs text-gray-600">{cliente.email ?? '—'}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{cliente.telefone ?? ''}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant={statusConfig[cliente.status]?.variant ?? 'default'}>
                          {statusConfig[cliente.status]?.label ?? cliente.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        {score ? (
                          <ScoreBadge score={score.score_total} classificacao={score.classificacao as any} />
                        ) : (
                          <span className="text-xs text-gray-400">Sem score</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-500">{cliente.assessor?.nome ?? '—'}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/clientes/${cliente.id}`}>
                            <button
                              title="Visualizar"
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </Link>
                          <Link href={`/clientes/${cliente.id}/editar`}>
                            <button
                              title="Editar"
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {clientes.length > 0 && (
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-3)' }}>
              <p className="text-xs text-gray-400">
                {total > clientes.length
                  ? `Exibindo ${clientes.length} de ${total} registros · use a busca para refinar`
                  : `${clientes.length} registro${clientes.length !== 1 ? 's' : ''}`}
              </p>
              {selected.size > 0 && (
                <p className="text-xs font-medium" style={{ color: 'var(--blue)' }}>{selected.size} selecionado{selected.size !== 1 ? 's' : ''}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <NovoClienteModal open={novoOpen} onClose={() => setNovoOpen(false)} assessores={assessores} />
      <ImportarClientesModal open={importarOpen} onClose={() => setImportarOpen(false)} />
    </div>
  )
}
