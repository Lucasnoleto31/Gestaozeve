'use client'

import { useState, useTransition } from 'react'
import { Building2, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { criarBarra, atualizarBarra, deletarBarra } from './actions'
import { Button, IconButton } from '@/components/ui/Button'
import { Field } from '@/components/ui/Input'
import { Panel } from '@/components/ui/Panel'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import { CORRETORAS, CORRETORA_LABEL, type Corretora } from '@/lib/corretoras'

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

function CorretoraSelect({ value, onChange, className }: { value: string; onChange: (v: Corretora) => void; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Corretora)} className={className}>
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
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className="chip" data-active={filtro === ''} onClick={() => setFiltro('')}>
            Todas <span className="opacity-70">({barras.length})</span>
          </button>
          {contagem.map(({ c, n }) => (
            <button key={c} type="button" className="chip" data-active={filtro === c} onClick={() => setFiltro(c)}>
              {CORRETORA_LABEL[c]} <span className="opacity-70">({n})</span>
            </button>
          ))}
        </div>
        {!showNova && (
          <Button size="sm" onClick={() => setShowNova(true)}>
            <Plus className="h-4 w-4" /> Nova barra
          </Button>
        )}
      </div>

      {/* Form nova barra */}
      {showNova && (
        <Panel title="Nova barra" subtitle="O nome precisa ser idêntico ao da planilha da corretora.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Nome da barra" className="sm:col-span-2">
              <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex: ZEVE INVESTIMENTOS 1" autoFocus />
            </Field>
            <Field label="Corretora">
              <CorretoraSelect value={novaCorretora} onChange={setNovaCorretora} />
            </Field>
            <Field label="Assessor responsável">
              <select value={novoAssessor} onChange={(e) => setNovoAssessor(e.target.value)}>
                <option value="">Nenhum</option>
                {assessores.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </Field>
            <Field label="Influenciador">
              <select value={novoInfluenciador} onChange={(e) => setNovoInfluenciador(e.target.value)}>
                <option value="">Nenhum</option>
                {influenciadores.map((i) => <option key={i.id} value={i.id}>{i.nome} (@{i.codigo})</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={handleCriar} loading={isPending} disabled={!novoNome.trim()}>
              <Check className="h-4 w-4" /> Salvar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowNova(false)}>
              <X className="h-4 w-4" /> Cancelar
            </Button>
          </div>
        </Panel>
      )}

      {/* Lista */}
      <Panel flush>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Nome da barra</th>
                <th>Corretora</th>
                <th>Assessor</th>
                <th>Influenciador</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-fg-subtle">
                    {barras.length === 0
                      ? 'Nenhuma barra cadastrada. Clique em "Nova barra" para começar.'
                      : 'Nenhuma barra nesta corretora.'}
                  </td>
                </tr>
              )}
              {visiveis.map((barra) => (
                <tr key={barra.id}>
                  {editId === barra.id ? (
                    <>
                      <td><input className="field-sm w-full min-w-[220px]" value={editNome} onChange={(e) => setEditNome(e.target.value)} /></td>
                      <td><CorretoraSelect className="field-sm" value={editCorretora} onChange={setEditCorretora} /></td>
                      <td>
                        <select value={editAssessor} onChange={(e) => setEditAssessor(e.target.value)} className="field-sm w-full min-w-[160px]">
                          <option value="">Nenhum</option>
                          {assessores.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={editInfluenciador} onChange={(e) => setEditInfluenciador(e.target.value)} className="field-sm w-full min-w-[160px]">
                          <option value="">Nenhum</option>
                          {influenciadores.map((i) => <option key={i.id} value={i.id}>{i.nome} (@{i.codigo})</option>)}
                        </select>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <IconButton tone="success" title="Salvar" onClick={() => handleAtualizar(barra.id)} disabled={isPending}><Check className="h-4 w-4" /></IconButton>
                          <IconButton title="Cancelar" onClick={() => setEditId(null)}><X className="h-4 w-4" /></IconButton>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <span className="inline-flex items-center gap-2 font-medium">
                          <Building2 className="h-4 w-4 shrink-0 text-fg-subtle" />
                          {barra.nome}
                        </span>
                      </td>
                      <td><CorretoraBadge corretora={barra.corretora} size="md" /></td>
                      <td className="muted">{barra.assessor?.nome ?? <span className="subtle">—</span>}</td>
                      <td className="muted">
                        {barra.influenciador
                          ? <span>{barra.influenciador.nome} <span className="text-accent">@{barra.influenciador.codigo}</span></span>
                          : <span className="subtle">—</span>}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <IconButton tone="accent" title="Editar" onClick={() => iniciarEdicao(barra)}><Pencil className="h-4 w-4" /></IconButton>
                          <IconButton tone="danger" title="Excluir" onClick={() => handleDeletar(barra.id, barra.nome)} disabled={isPending}><Trash2 className="h-4 w-4" /></IconButton>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}
