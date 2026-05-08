'use client'

import { useState } from 'react'
import { Save, Plus, Trash2, RefreshCw } from 'lucide-react'
import type { MetaRow } from './actions'

interface Actions {
  saveMeta: (m: MetaRow) => Promise<{ ok: true }>
  deleteMeta: (ano: number) => Promise<{ ok: true }>
}

const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtNum = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

export function MetasView({ initial, actions }: { initial: MetaRow[]; actions: Actions }) {
  const [rows, setRows] = useState<MetaRow[]>(initial)
  const [editing, setEditing] = useState<Record<number, Partial<MetaRow>>>({})
  const [saving, setSaving] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [novo, setNovo] = useState<MetaRow | null>(null)

  function patch(ano: number, key: keyof MetaRow, value: MetaRow[keyof MetaRow]) {
    setEditing(s => ({ ...s, [ano]: { ...s[ano], [key]: value } }))
  }

  function row(ano: number): MetaRow {
    const original = rows.find(r => r.ano === ano)!
    return { ...original, ...editing[ano] }
  }

  async function save(ano: number) {
    const r = row(ano)
    setSaving(ano); setErro(null)
    try {
      await actions.saveMeta(r)
      setRows(arr => arr.map(x => x.ano === ano ? r : x))
      setEditing(s => { const n = { ...s }; delete n[ano]; return n })
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSaving(null)
    }
  }

  async function remove(ano: number) {
    if (!confirm(`Remover meta de ${ano}?`)) return
    setErro(null)
    try {
      await actions.deleteMeta(ano)
      setRows(arr => arr.filter(x => x.ano !== ano))
    } catch (err) {
      setErro((err as Error).message)
    }
  }

  async function addNew() {
    if (!novo) return
    if (!novo.ano || novo.ano < 2000 || novo.ano > 2100) {
      setErro('Ano inválido'); return
    }
    if (rows.some(r => r.ano === novo.ano)) {
      setErro(`Já existe meta para ${novo.ano}`); return
    }
    setSaving(novo.ano); setErro(null)
    try {
      await actions.saveMeta(novo)
      setRows(arr => [novo, ...arr].sort((a, b) => b.ano - a.ano))
      setNovo(null)
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="px-6 lg:px-8 py-6 space-y-4">
      {erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {erro}
        </div>
      )}

      <div className="rounded-2xl p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Metas configuradas ({rows.length})</p>
          {!novo && (
            <button onClick={() => setNovo({ ano: new Date().getFullYear(), meta_lotes: 0, meta_receita: 0, observacao: null, updated_at: '' })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{ background: 'var(--blue)' }}>
              <Plus className="w-3.5 h-3.5" /> Novo ano
            </button>
          )}
        </div>

        {novo && (
          <div className="mb-3 p-3 rounded-xl" style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 items-end">
              <Field label="Ano">
                <input type="number" min={2000} max={2100} className="w-24 px-2 py-1 rounded text-sm tabular-nums" style={inputStyle}
                  value={novo.ano} onChange={e => setNovo(s => s ? { ...s, ano: Number(e.target.value) } : s)} />
              </Field>
              <Field label="Meta lotes">
                <input type="number" step="1" className="w-32 px-2 py-1 rounded text-sm tabular-nums text-right" style={inputStyle}
                  value={novo.meta_lotes} onChange={e => setNovo(s => s ? { ...s, meta_lotes: Number(e.target.value) } : s)} />
              </Field>
              <Field label="Meta receita (R$)">
                <input type="number" step="1" className="w-36 px-2 py-1 rounded text-sm tabular-nums text-right" style={inputStyle}
                  value={novo.meta_receita} onChange={e => setNovo(s => s ? { ...s, meta_receita: Number(e.target.value) } : s)} />
              </Field>
              <Field label="Observação" wide>
                <input className="w-full px-2 py-1 rounded text-sm" style={inputStyle}
                  value={novo.observacao ?? ''} onChange={e => setNovo(s => s ? { ...s, observacao: e.target.value || null } : s)} />
              </Field>
              <div className="flex gap-2">
                <button onClick={addNew} disabled={saving === novo.ano}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Save className="w-3.5 h-3.5" /> Salvar
                </button>
                <button onClick={() => setNovo(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100">Cancelar</button>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
          <table className="text-xs border-collapse min-w-max w-full">
            <thead style={{ background: 'var(--surface-2)' }}>
              <tr>
                {['Ano', 'Meta lotes', 'Meta receita', 'Observação', ''].map((h, i) => (
                  <th key={i} className="px-3 py-2 font-semibold text-gray-500 border-r text-left"
                    style={{ borderColor: 'var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Sem metas. Clique em &quot;Novo ano&quot; pra adicionar.</td></tr>
              )}
              {rows.map((orig, idx) => {
                const r = row(orig.ano)
                const dirty = !!editing[orig.ano]
                const bg = idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)'
                return (
                  <tr key={orig.ano} style={{ borderTop: '1px solid var(--border)', background: bg }}>
                    <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{r.ano}</td>
                    <td className="px-3 py-1.5">
                      <input type="number" step="1" className="w-32 px-2 py-1 rounded text-sm tabular-nums text-right" style={inputStyle}
                        value={r.meta_lotes} onChange={e => patch(orig.ano, 'meta_lotes', Number(e.target.value))} />
                      <span className="ml-2 text-[10px] text-gray-400">{fmtNum(r.meta_lotes)} lotes</span>
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="number" step="1" className="w-36 px-2 py-1 rounded text-sm tabular-nums text-right" style={inputStyle}
                        value={r.meta_receita} onChange={e => patch(orig.ano, 'meta_receita', Number(e.target.value))} />
                      <span className="ml-2 text-[10px] text-gray-400">{fmtBRL(r.meta_receita)}</span>
                    </td>
                    <td className="px-3 py-1.5">
                      <input className="w-64 px-2 py-1 rounded text-sm" style={inputStyle}
                        value={r.observacao ?? ''} onChange={e => patch(orig.ano, 'observacao', e.target.value || null)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => save(orig.ano)} disabled={!dirty || saving === orig.ano}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-white disabled:opacity-40"
                          style={{ background: 'var(--blue)' }}>
                          {saving === orig.ano ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          {saving === orig.ano ? 'Salvando…' : 'Salvar'}
                        </button>
                        <button onClick={() => remove(orig.ano)}
                          className="p-1.5 rounded text-red-500 hover:bg-red-50">
                          <Trash2 className="w-3 h-3" />
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
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--ink)',
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? 'col-span-2 lg:col-span-2' : ''}>
      <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-1">{label}</p>
      {children}
    </div>
  )
}
