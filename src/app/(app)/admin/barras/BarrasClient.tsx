'use client'

import { useState, useTransition } from 'react'
import { criarBarra, atualizarBarra, deletarBarra } from './actions'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Plus, Pencil, Trash2, Check, X, Building2 } from 'lucide-react'

interface Barra {
  id: string
  nome: string
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

export function BarrasClient({ barras, assessores, influenciadores }: Props) {
  const [isPending, startTransition] = useTransition()
  const [editId, setEditId] = useState<string | null>(null)
  const [showNova, setShowNova] = useState(false)

  const [novoNome, setNovoNome] = useState('')
  const [novoAssessor, setNovoAssessor] = useState('')
  const [novoInfluenciador, setNovoInfluenciador] = useState('')

  const [editNome, setEditNome] = useState('')
  const [editAssessor, setEditAssessor] = useState('')
  const [editInfluenciador, setEditInfluenciador] = useState('')

  function iniciarEdicao(b: Barra) {
    setEditId(b.id)
    setEditNome(b.nome)
    setEditAssessor(b.assessor_id ?? '')
    setEditInfluenciador(b.influenciador_id ?? '')
  }

  function handleCriar() {
    if (!novoNome.trim()) return
    startTransition(async () => {
      const result = await criarBarra(novoNome, novoAssessor || null, novoInfluenciador || null)
      if (result?.error) { alert(`Erro: ${result.error}`); return }
      setNovoNome(''); setNovoAssessor(''); setNovoInfluenciador('')
      setShowNova(false)
    })
  }

  function handleAtualizar(id: string) {
    startTransition(async () => {
      const result = await atualizarBarra(id, editNome, editAssessor || null, editInfluenciador || null)
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{barras.length} barra(s) cadastrada(s)</p>
        <Button size="sm" onClick={() => setShowNova(true)}>
          <Plus className="w-4 h-4" />
          Nova Barra
        </Button>
      </div>

      {/* Form nova barra */}
      {showNova && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-blue-800">Nova barra</p>
          <Input
            label="Nome da barra (exatamente como aparece no Excel)"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Ex: ZEVE INVESTIMENTOS 1"
          />
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
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Assessor</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Influenciador</th>
              <th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {barras.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-sm text-gray-400">
                  Nenhuma barra cadastrada. Clique em "Nova Barra" para começar.
                </td>
              </tr>
            )}
            {barras.map((barra) => (
              <tr key={barra.id} className="border-b border-gray-100 hover:bg-gray-50">
                {editId === barra.id ? (
                  <>
                    <td className="px-4 py-2">
                      <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} />
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
