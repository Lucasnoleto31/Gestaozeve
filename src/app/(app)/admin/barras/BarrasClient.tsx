'use client'

import { useState, useTransition } from 'react'
import { criarBarra, atualizarBarra, deletarBarra } from './actions'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Plus, Pencil, Trash2, Check, X, Building2 } from 'lucide-react'
import { CORRETORAS, CORRETORA_LABEL, type Corretora } from '@/lib/corretoras'
import { CorretoraBadge } from '@/app/(app)/admin/contratos-dashboard/ChartsCorretora'

interface Barra {
  id: string
  nome: string
  corretora: string
  assessor_id: string | null
  influenciador_id: string | null
  assessor: { nome: string } | null
  influenciador: { nome: string; codigo: string } | null
}

interface Props {
  barras: Barra[]
  assessores: { id: string; nome: string }[]
  influenciadores: { id: string; nome: string; codigo: string }[]
}

const SELECT_CLASS = 'w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'

function CorretoraSelect({ value, onChange }: { value: string; onChange: (v: Corretora) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Corretora)} className={SELECT_CLASS}>
      {CORRETORAS.map((c) => <option key={c} value={c}>{CORRETORA_LABEL[c]}</option>)}
    </select>
  )
}

export function BarrasClient({ barras, assessores, influenciadores }: Props) {
  const [isPending, startTransition] = useTransition()
  const [editId, setEditId] = useState<string | null>(null)
  const [showNova, setShowNova] = useState(false)
  const [filtro, setFiltro] = useState<Corretora | ''>('')

  const [novoNome, setNovoNome] = useState('')
  const [novaCorretora, setNovaCorretora] = useState<Corretora>('GENIAL')
  const [novoAssessor, setNovoAssessor] = useState('')
  const [novoInfluenciador, setNovoInfluenciador] = useState('')

  const [editNome, setEditNome] = useState('')
  const [editCorretora, setEditCorretora] = useState<Corretora>('GENIAL')
  const [editAssessor, setEditAssessor] = useState('')
  const [editInfluenciador, setEditInfluenciador] = useState('')

  const visiveis = filtro ? barras.filter((b) => b.corretora === filtro) : barras
  const contagem = CORRETORAS.map((c) => ({ c, n: barras.filter((b) => b.corretora === c).length }))

  function iniciarEdicao(b: Barra) {
    setEditId(b.id)
    setEditNome(b.nome)
    setEditCorretora((CORRETORAS as readonly string[]).includes(b.corretora) ? (b.corretora as Corretora) : 'GENIAL')
    setEditAssessor(b.assessor_id ?? '')
    setEditInfluenciador(b.influenciador_id ?? '')
  }

  function handleCriar() {
    if (!novoNome.trim()) return
    startTransition(async () => {
      const result = await criarBarra(novoNome, novaCorretora, novoAssessor || null, novoInfluenciador || null)
      if (result?.error) { alert(`Erro: ${result.error}`); return }
      setNovoNome(''); setNovoAssessor(''); setNovoInfluenciador('')
      setShowNova(false)
    })
  }

  function handleAtualizar(id: string) {
    startTransition(async () => {
      const result = await atualizarBarra(id, editNome, editCorretora, editAssessor || null, editInfluenciador || null)
      if (result?.error) { alert(`Erro: ${result.error}`); return }
      setEditId(null)
    })
  }

  function handleDeletar(id: string, nome: string) {
    if (!confirm(`Excluir a barra "${nome}"?`)) return
    startTransition(async () => {
      const result = await deletarBarra(id)
      if (result?.error) alert(`Erro: ${result.error}`)
    })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setFiltro('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${filtro === '' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
            Todas ({barras.length})
          </button>
          {contagem.map(({ c, n }) => (
            <button key={c} onClick={() => setFiltro(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${filtro === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
              {CORRETORA_LABEL[c]} ({n})
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowNova(true)}>
          <Plus className="w-4 h-4" />
          Nova Barra
        </Button>
      </div>

      {/* Form nova barra */}
      {showNova && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-blue-800">Nova barra</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Input
                label="Nome da barra (exatamente como aparece no Excel)"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Ex: ZEVE INVESTIMENTOS 1"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-600">Corretora</label>
              <CorretoraSelect value={novaCorretora} onChange={setNovaCorretora} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-600">Assessor responsável</label>
              <select value={novoAssessor} onChange={(e) => setNovoAssessor(e.target.value)} className={SELECT_CLASS}>
                <option value="">Nenhum</option>
                {assessores.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-600">Influenciador</label>
              <select value={novoInfluenciador} onChange={(e) => setNovoInfluenciador(e.target.value)} className={SELECT_CLASS}>
                <option value="">Nenhum</option>
                {influenciadores.map((i) => <option key={i.id} value={i.id}>{i.nome} (@{i.codigo})</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCriar} loading={isPending}>
              <Check className="w-4 h-4" /> Salvar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowNova(false)}>
              <X className="w-4 h-4" /> Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="rounded-xl overflow-hidden border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Nome da Barra</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Corretora</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Assessor</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Influenciador</th>
              <th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">
                  {barras.length === 0
                    ? 'Nenhuma barra cadastrada. Clique em "Nova Barra" para começar.'
                    : 'Nenhuma barra nesta corretora.'}
                </td>
              </tr>
            )}
            {visiveis.map((barra) => (
              <tr key={barra.id} className="border-b border-gray-100 hover:bg-gray-50">
                {editId === barra.id ? (
                  <>
                    <td className="px-4 py-2">
                      <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} />
                    </td>
                    <td className="px-4 py-2">
                      <CorretoraSelect value={editCorretora} onChange={setEditCorretora} />
                    </td>
                    <td className="px-4 py-2">
                      <select value={editAssessor} onChange={(e) => setEditAssessor(e.target.value)} className={SELECT_CLASS}>
                        <option value="">Nenhum</option>
                        {assessores.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select value={editInfluenciador} onChange={(e) => setEditInfluenciador(e.target.value)} className={SELECT_CLASS}>
                        <option value="">Nenhum</option>
                        {influenciadores.map((i) => <option key={i.id} value={i.id}>{i.nome} (@{i.codigo})</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => handleAtualizar(barra.id)} className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditId(null)} className="p-1.5 rounded text-gray-400 hover:bg-gray-100">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="font-medium text-gray-900">{barra.nome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><CorretoraBadge corretora={barra.corretora} size="md" /></td>
                    <td className="px-4 py-3 text-gray-600">{barra.assessor?.nome ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {barra.influenciador
                        ? <span>{barra.influenciador.nome} <span className="text-blue-600">@{barra.influenciador.codigo}</span></span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => iniciarEdicao(barra)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeletar(barra.id, barra.nome)} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
