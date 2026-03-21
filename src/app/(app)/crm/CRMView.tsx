'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Lead, FunilEtapa } from '@/types'
import { Profile } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDate, cn } from '@/lib/utils'
import {
  atualizarStatusEmMassa,
  atribuirAssessorEmMassa,
  moverEtapaEmMassa,
  deletarLead,
  deletarLeadsEmMassa,
} from './actions'
import { NovoLeadButton } from './NovoLeadButton'
import { CRMKanban } from './CRMKanban'
import {
  Search, Eye, LayoutList, Kanban,
  Download, ChevronDown, X, Flame, Droplets, Wind, Trash2, Users,
} from 'lucide-react'

interface Props {
  leads: Lead[]
  etapas: FunilEtapa[]
  assessores: { id: string; nome: string }[]
  isAdmin: boolean
}

const statusConfig = {
  ativo: { label: 'Ativo', variant: 'warning' as const },
  convertido: { label: 'Convertido', variant: 'success' as const },
  perdido: { label: 'Perdido', variant: 'danger' as const },
}

const temperaturaConfig = {
  quente: { label: 'Quente', icon: Flame, color: 'text-red-500' },
  morno: { label: 'Morno', icon: Droplets, color: 'text-amber-600' },
  frio: { label: 'Frio', icon: Wind, color: 'text-blue-600' },
}

export function CRMView({ leads, etapas, assessores, isAdmin }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [view, setView] = useState<'table' | 'kanban'>('table')
  const [busca, setBusca] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroAssessor, setFiltroAssessor] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dropdown, setDropdown] = useState<'status' | 'etapa' | 'assessor' | null>(null)

  // Stats
  const stats = useMemo(() => {
    const total = leads.length
    const ativos = leads.filter((l) => l.status === 'ativo').length
    const convertidos = leads.filter((l) => l.status === 'convertido').length
    const perdidos = leads.filter((l) => l.status === 'perdido').length
    const taxa = total > 0 ? Math.round((convertidos / total) * 100) : 0
    return { total, ativos, convertidos, perdidos, taxa }
  }, [leads])

  // Filtros
  const leadsFiltrados = useMemo(() => {
    return leads.filter((l) => {
      if (busca) {
        const q = busca.toLowerCase()
        const match = l.nome.toLowerCase().includes(q) ||
          (l.email ?? '').toLowerCase().includes(q) ||
          (l.telefone ?? '').toLowerCase().includes(q)
        if (!match) return false
      }
      if (filtroEtapa && l.etapa_id !== filtroEtapa) return false
      if (filtroStatus && l.status !== filtroStatus) return false
      if (filtroAssessor && l.vendedor_id !== filtroAssessor) return false
      return true
    })
  }, [leads, busca, filtroEtapa, filtroStatus, filtroAssessor])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === leadsFiltrados.length) setSelected(new Set())
    else setSelected(new Set(leadsFiltrados.map((l) => l.id)))
  }

  function exportarCSV() {
    const rows = [
      ['Nome', 'E-mail', 'Telefone', 'Etapa', 'Status', 'Temperatura', 'Origem', 'Assessor', 'Data'],
      ...leadsFiltrados.map((l) => [
        l.nome,
        l.email ?? '',
        l.telefone ?? '',
        l.etapa?.nome ?? '',
        l.status,
        l.temperatura ?? '',
        l.influenciador ? `@${l.influenciador.codigo}` : (l.origem ?? ''),
        l.vendedor?.nome ?? '',
        formatDate(l.created_at),
      ]),
    ]
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleMudarStatus(status: string) {
    startTransition(async () => {
      await atualizarStatusEmMassa(Array.from(selected), status)
      setSelected(new Set())
      setDropdown(null)
    })
  }

  async function handleMoverEtapa(etapaId: string) {
    startTransition(async () => {
      await moverEtapaEmMassa(Array.from(selected), etapaId)
      setSelected(new Set())
      setDropdown(null)
    })
  }

  async function handleAtribuirAssessor(assessorId: string) {
    startTransition(async () => {
      await atribuirAssessorEmMassa(Array.from(selected), assessorId)
      setSelected(new Set())
      setDropdown(null)
    })
  }

  async function handleDeletarLead(id: string) {
    if (!confirm('Excluir este lead? Esta ação não pode ser desfeita.')) return
    startTransition(async () => {
      const result = await deletarLead(id)
      if (result?.error) alert(`Erro: ${result.error}`)
    })
  }

  async function handleDeletarEmMassa() {
    if (!confirm(`Excluir ${selected.size} lead(s)? Esta ação não pode ser desfeita.`)) return
    startTransition(async () => {
      const result = await deletarLeadsEmMassa(Array.from(selected))
      if (result?.error) alert(`Erro: ${result.error}`)
      else setSelected(new Set())
    })
  }

  const SELECT_CLASS = 'rounded-lg text-sm focus:outline-none'

  return (
    <div className="p-6 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-900' },
          { label: 'Em negociação', value: stats.ativos, color: 'text-amber-600' },
          { label: 'Convertidos', value: stats.convertidos, color: 'text-emerald-600' },
          { label: 'Perdidos', value: stats.perdidos, color: 'text-red-500' },
          { label: 'Taxa de conversão', value: `${stats.taxa}%`, color: 'text-blue-600' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl px-4 py-3 animate-fade-up" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail ou telefone..."
            className="w-full rounded-lg pl-9 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}
          />
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <select value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)} className={SELECT_CLASS}>
            <option value="">Todas as etapas</option>
            {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className={SELECT_CLASS}>
            <option value="">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="convertido">Convertido</option>
            <option value="perdido">Perdido</option>
          </select>
          {isAdmin && (
            <select value={filtroAssessor} onChange={(e) => setFiltroAssessor(e.target.value)} className={SELECT_CLASS}>
              <option value="">Todos os assessores</option>
              {assessores.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          )}

          <Button variant="secondary" size="sm" onClick={exportarCSV}>
            <Download className="w-4 h-4" />
            Exportar
          </Button>

          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
            <button
              onClick={() => setView('table')}
              className={`px-3 py-2 text-sm transition-colors ${view === 'table' ? 'text-slate-900 bg-white/10' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('kanban')}
              className={`px-3 py-2 text-sm transition-colors ${view === 'kanban' ? 'text-slate-900 bg-white/10' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Kanban className="w-4 h-4" />
            </button>
          </div>

          <NovoLeadButton />
        </div>
      </div>

      {/* Ações em massa */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-30 flex items-center gap-3 rounded-lg px-4 py-2.5 animate-fade-down shadow-md" style={{ background: 'var(--blue-dim)', border: '1px solid var(--blue-glow)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--blue-light)' }}>{selected.size} selecionado(s)</span>
          <div className="flex gap-2 ml-auto flex-wrap">

            {/* Mover etapa */}
            <div className="relative">
              <Button variant="secondary" size="sm" onClick={() => setDropdown(dropdown === 'etapa' ? null : 'etapa')}>
                Mover etapa <ChevronDown className="w-3 h-3" />
              </Button>
              {dropdown === 'etapa' && (
                <div className="absolute top-full mt-1 right-0 rounded-lg py-1 z-10 min-w-44 animate-fade-down" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
                  {etapas.map((e) => (
                    <button key={e.id} onClick={() => handleMoverEtapa(e.id)} className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-100 transition-colors">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: e.cor }} />
                      {e.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mudar status */}
            <div className="relative">
              <Button variant="secondary" size="sm" onClick={() => setDropdown(dropdown === 'status' ? null : 'status')}>
                Mudar status <ChevronDown className="w-3 h-3" />
              </Button>
              {dropdown === 'status' && (
                <div className="absolute top-full mt-1 right-0 rounded-lg py-1 z-10 min-w-36 animate-fade-down" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
                  {['ativo', 'convertido', 'perdido'].map((s) => (
                    <button key={s} onClick={() => handleMudarStatus(s)} className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-100 transition-colors capitalize">{s}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Atribuir assessor */}
            {isAdmin && (
              <div className="relative">
                <Button variant="secondary" size="sm" onClick={() => setDropdown(dropdown === 'assessor' ? null : 'assessor')}>
                  Atribuir assessor <ChevronDown className="w-3 h-3" />
                </Button>
                {dropdown === 'assessor' && (
                  <div className="absolute top-full mt-1 right-0 rounded-lg py-1 z-10 min-w-44 animate-fade-down" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
                    {assessores.map((a) => (
                      <button key={a.id} onClick={() => handleAtribuirAssessor(a.id)} className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-100 transition-colors">{a.nome}</button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button variant="danger" size="sm" onClick={handleDeletarEmMassa} loading={isPending}>
              <Trash2 className="w-4 h-4" />
              Excluir
            </Button>

            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Conteúdo */}
      {view === 'kanban' ? (
        <CRMKanban leads={leadsFiltrados.filter(l => l.status === 'ativo')} etapas={etapas} />
      ) : (
        <div className="rounded-xl overflow-hidden animate-fade-up" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === leadsFiltrados.length && leadsFiltrados.length > 0}
                      onChange={toggleAll}
                      className="rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Lead</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Contato</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Etapa</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Temp.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Origem</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Assessor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Data</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {leadsFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center" style={{ color: 'var(--muted)' }}>
                      <div className="flex flex-col items-center gap-2">
                        <Users className="w-8 h-8 opacity-30" />
                        <p className="text-sm">Nenhum lead encontrado.</p>
                      </div>
                    </td>
                  </tr>
                )}
                {leadsFiltrados.map((lead) => {
                  const tempConfig = lead.temperatura ? temperaturaConfig[lead.temperatura] : null
                  const TempIcon = tempConfig?.icon
                  return (
                    <tr
                      key={lead.id}
                      className={cn('transition-colors', selected.has(lead.id) ? 'bg-blue-500/5' : 'hover:bg-blue-50/50')}
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(lead.id)}
                          onChange={() => toggleSelect(lead.id)}
                          className="rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
                            style={{ background: 'linear-gradient(135deg, var(--blue) 0%, var(--blue-dark) 100%)' }}
                          >
                            {lead.nome.trim().split(' ').map((p: string) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900">{lead.nome}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-500">{lead.email || '—'}</p>
                        <p className="text-xs text-gray-500">{lead.telefone || ''}</p>
                      </td>
                      <td className="px-4 py-3">
                        {lead.etapa && (
                          <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: lead.etapa.cor }}>
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: lead.etapa.cor }} />
                            {lead.etapa.nome}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusConfig[lead.status]?.variant ?? 'default'}>
                          {statusConfig[lead.status]?.label ?? lead.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {tempConfig && TempIcon ? (
                          <span className={`inline-flex items-center gap-1 text-xs ${tempConfig.color}`}>
                            <TempIcon className="w-3.5 h-3.5" />
                            {tempConfig.label}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {lead.influenciador ? (
                          <span className="text-blue-600">@{lead.influenciador.codigo}</span>
                        ) : (lead.origem || '—')}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{lead.vendedor?.nome ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(lead.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/crm/${lead.id}`}
                            title="Ver detalhes"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors inline-flex items-center"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <button
                            title="Excluir lead"
                            onClick={() => handleDeletarLead(lead.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
