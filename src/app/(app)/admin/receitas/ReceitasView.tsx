'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Upload, Trash2 } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { ImportarReceitasModal } from './ImportarReceitasModal'
import { deletarImportacao, deletarReceitas } from './actions'

interface Resumo {
  total_liquido: number
  mes_atual: number
  num_meses: number
}

interface AggRow {
  mes?: string
  nome?: string
  total: number
}

interface Registro {
  id: string
  data_receita: string | null
  cliente_nome: string | null
  cpf_cnpj: string | null
  assessor_nome: string | null
  produto: string | null
  tipo_produto: string | null
  receita_genial: number
  valor_bruto_aai: number
  imposto: number
  valor_liquido_aai: number
  cliente?: { id: string; nome: string; influenciador?: { id: string; nome: string; codigo: string } | null } | null
  assessor?: { id: string; nome: string } | null
}

interface Importacao {
  id: string
  nome_arquivo: string
  total_linhas: number
  valor_liquido_total: number
  created_at: string
}

interface Props {
  resumo: Resumo
  porMes: AggRow[]
  porAssessor: AggRow[]
  porCliente: AggRow[]
  registros: Registro[]
  importacoes: Importacao[]
  assessores: { id: string; nome: string }[]
  influenciadores: { id: string; nome: string; codigo: string }[]
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)

const formatMonth = (mes: string) => {
  const [year, month] = mes.split('-')
  return new Date(Number(year), Number(month) - 1).toLocaleDateString('pt-BR', {
    month: 'short', year: '2-digit', timeZone: 'America/Sao_Paulo',
  })
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (active && payload?.length) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
        <p className="text-gray-500 mb-1">{label}</p>
        <p className="text-emerald-600 font-medium">{formatCurrency(payload[0].value)}</p>
      </div>
    )
  }
  return null
}

export function ReceitasView({ resumo, porMes, porAssessor, porCliente, registros, importacoes, assessores, influenciadores }: Props) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [filtroMesInicio, setFiltroMesInicio] = useState('')
  const [filtroMesFim, setFiltroMesFim] = useState('')
  const [filtroAssessor, setFiltroAssessor] = useState('')
  const [filtroInfluenciador, setFiltroInfluenciador] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const mediaMensal = resumo.num_meses > 0
    ? resumo.total_liquido / Number(resumo.num_meses)
    : 0

  const chartMes = useMemo(() =>
    porMes.map((r) => ({ ...r, label: formatMonth(r.mes!) })),
    [porMes]
  )

  const registrosFiltrados = useMemo(() => {
    return registros.filter((r) => {
      const mes = r.data_receita?.slice(0, 7) ?? ''
      if (filtroMesInicio && mes && mes < filtroMesInicio) return false
      if (filtroMesFim && mes && mes > filtroMesFim) return false
      if (filtroAssessor) {
        const nome = r.assessor?.nome ?? r.assessor_nome ?? ''
        if (nome !== filtroAssessor) return false
      }
      if (filtroInfluenciador) {
        if (r.cliente?.influenciador?.id !== filtroInfluenciador) return false
      }
      return true
    })
  }, [registros, filtroMesInicio, filtroMesFim, filtroAssessor, filtroInfluenciador])

  const allSelected = registrosFiltrados.length > 0 && registrosFiltrados.every((r) => selected.has(r.id))

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelected((prev) => {
        const next = new Set(prev)
        registrosFiltrados.forEach((r) => next.add(r.id))
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        registrosFiltrados.forEach((r) => next.delete(r.id))
        return next
      })
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function limparFiltros() {
    setFiltroMesInicio('')
    setFiltroMesFim('')
    setFiltroAssessor('')
    setFiltroInfluenciador('')
  }

  function handleDeletarEmMassa() {
    if (!confirm(`Excluir ${selected.size} registro(s)? Esta ação não pode ser desfeita.`)) return
    startTransition(async () => {
      const result = await deletarReceitas(Array.from(selected))
      if (result?.error) { alert(`Erro ao excluir: ${result.error}`); return }
      setSelected(new Set())
      router.refresh()
    })
  }

  async function handleDeletar(id: string) {
    if (!confirm('Excluir este registro?')) return
    setDeletingId(id)
    await deletarReceitas([id])
    setDeletingId(null)
    router.refresh()
  }

  async function handleDeletarImportacao(id: string) {
    if (!confirm('Desfazer esta importação? Todas as receitas do lote serão removidas.')) return
    setDeletingId(id)
    await deletarImportacao(id)
    router.refresh()
    setDeletingId(null)
  }

  const temFiltro = filtroMesInicio || filtroMesFim || filtroAssessor || filtroInfluenciador

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setModalOpen(true)}>
          <Upload className="w-4 h-4" />
          Importar Excel
        </Button>
      </div>

      {/* Gráficos */}
      {chartMes.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Receita Líquida por Mês</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartMes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" />
                <XAxis dataKey="label" tick={{ fill: '#6B7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" fill="#1764F4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Receita por Assessor</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={porAssessor} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" />
                <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <YAxis dataKey="nome" type="category" width={100} tick={{ fill: '#6B7280', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" fill="#4A8FF8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {porCliente.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Top 10 Clientes por Receita Líquida</h3>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={porCliente} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF8" />
              <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <YAxis dataKey="nome" type="category" width={140} tick={{ fill: '#6B7280', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela */}
      <div className="space-y-2">
        {/* Barra de ações em massa */}
        {selected.size > 0 && (
          <div className="sticky top-2 z-30 flex items-center gap-3 bg-gray-900 text-white rounded-lg px-4 py-2.5 shadow-md">
            <span className="text-sm font-medium">{selected.size} selecionado(s)</span>
            <button
              onClick={handleDeletarEmMassa}
              disabled={isPending}
              className="flex items-center gap-1.5 text-sm bg-red-500 hover:bg-red-600 disabled:opacity-50 px-3 py-1 rounded-md transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir selecionados
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="ml-auto text-xs text-gray-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-2xl">
          {/* Filtros */}
          <div className="p-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-900">Lançamentos</h3>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">De</span>
              <input
                type="month"
                value={filtroMesInicio}
                onChange={(e) => setFiltroMesInicio(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Até</span>
              <input
                type="month"
                value={filtroMesFim}
                onChange={(e) => setFiltroMesFim(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <select
              value={filtroAssessor}
              onChange={(e) => setFiltroAssessor(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Todos os assessores</option>
              {assessores.map((a) => <option key={a.id} value={a.nome}>{a.nome}</option>)}
            </select>

            {influenciadores.length > 0 && (
              <select
                value={filtroInfluenciador}
                onChange={(e) => setFiltroInfluenciador(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Todos os influenciadores</option>
                {influenciadores.map((inf) => (
                  <option key={inf.id} value={inf.id}>@{inf.codigo} — {inf.nome}</option>
                ))}
              </select>
            )}

            {temFiltro && (
              <button onClick={limparFiltros} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                Limpar filtros
              </button>
            )}

            <span className="ml-auto text-xs text-gray-500">{registrosFiltrados.length} de {registros.length} registros</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Data</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Assessor / Influenciador</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">Produto</th>
                  <th className="px-4 py-3 text-right text-xs text-gray-500 font-medium">Rec. Genial</th>
                  <th className="px-4 py-3 text-right text-xs text-gray-500 font-medium">Bruto AAI</th>
                  <th className="px-4 py-3 text-right text-xs text-gray-500 font-medium">Imposto</th>
                  <th className="px-4 py-3 text-right text-xs text-gray-500 font-medium">Líquido AAI</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {registrosFiltrados.slice(0, 200).map((r) => (
                  <tr key={r.id} className={`border-t border-gray-200 hover:bg-gray-50 ${selected.has(r.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        className="rounded border-gray-300 text-blue-600 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {r.data_receita ? new Date(r.data_receita + 'T12:00:00').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700 text-xs font-medium truncate max-w-[150px]">
                        {r.cliente?.nome ?? r.cliente_nome ?? '-'}
                      </p>
                      <p className="text-gray-400 text-xs">{r.cpf_cnpj}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-500 text-xs">{r.assessor?.nome ?? r.assessor_nome ?? '-'}</p>
                      {r.cliente?.influenciador && (
                        <p className="text-blue-600 text-xs font-mono">@{r.cliente.influenciador.codigo}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-500 text-xs truncate max-w-[120px]">{r.produto ?? '-'}</p>
                      <p className="text-gray-400 text-xs">{r.tipo_produto}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs">{formatCurrency(r.receita_genial)}</td>
                    <td className="px-4 py-3 text-right text-blue-600 text-xs font-medium">{formatCurrency(r.valor_bruto_aai)}</td>
                    <td className="px-4 py-3 text-right text-red-500 text-xs">{formatCurrency(r.imposto)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 text-xs font-medium">{formatCurrency(r.valor_liquido_aai)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDeletar(r.id)}
                        disabled={deletingId === r.id}
                        className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {registrosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum lançamento encontrado.</td>
                  </tr>
                )}
                {registrosFiltrados.length > 200 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-3 text-center text-xs text-gray-400">
                      Exibindo 200 de {registrosFiltrados.length}. Use os filtros para refinar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
                    {imp.total_linhas} linhas · {formatCurrency(imp.valor_liquido_total)} ·{' '}
                    {new Date(imp.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                  </p>
                </div>
                <button
                  onClick={() => handleDeletarImportacao(imp.id)}
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

      <ImportarReceitasModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); router.refresh() }}
      />
    </div>
  )
}
