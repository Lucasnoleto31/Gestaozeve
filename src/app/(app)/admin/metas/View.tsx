'use client'

import { useState } from 'react'
import { Save, Plus, Trash2, RefreshCw } from 'lucide-react'
import type { MetaRow } from './actions'
import { ESCOPOS_META, CORRETORA_LABEL, type EscopoMeta } from '@/lib/corretoras'
import { CorretoraBadge } from '@/app/(app)/admin/contratos-dashboard/ChartsCorretora'

interface Actions {
  saveMeta: (m: MetaRow) => Promise<{ ok: true }>
  deleteMeta: (ano: number, corretora: EscopoMeta) => Promise<{ ok: true }>
}

const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtNum = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const chave = (m: { ano: number; corretora: EscopoMeta }) => `${m.ano}|${m.corretora}`

function EscopoLabel({ escopo }: { escopo: EscopoMeta }) {
  if (escopo === 'TOTAL') {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">Escritório (total)</span>
  }
  return <CorretoraBadge corretora={escopo} />
}

export function MetasView({ initial, actions }: { initial: MetaRow[]; actions: Actions }) {
  const [rows, setRows] = useState<MetaRow[]>(initial)
  const [editing, setEditing] = useState<Record<string, Partial<MetaRow>>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [novo, setNovo] = useState<MetaRow | null>(null)

  function patch(k: string, key: keyof MetaRow, value: MetaRow[keyof MetaRow]) {
    setEditing(s => ({ ...s, [k]: { ...s[k], [key]: value } }))
  }

  function row(k: string): MetaRow {
    const original = rows.find(r => chave(r) === k)!
    return { ...original, ...editing[k] }
  }

  async function save(k: string) {
    const r = row(k)
    setSaving(k); setErro(null)
    try {
      await actions.saveMeta(r)
      setRows(arr => arr.map(x => chave(x) === k ? r : x))
      setEditing(s => { const n = { ...s }; delete n[k]; return n })
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSaving(null)
    }
  }

  async function remove(m: MetaRow) {
    if (!confirm(`Remover meta de ${m.ano} (${CORRETORA_LABEL[m.corretora]})?`)) return
    setErro(null)
    try {
      await actions.deleteMeta(m.ano, m.corretora)
      setRows(arr => arr.filter(x => chave(x) !== chave(m)))
    } catch (err) {
      setErro((err as Error).message)
    }
  }

  async function addNew() {
    if (!novo) return
    if (!novo.ano || novo.ano < 2000 || novo.ano > 2100) {
      setErro('Ano inválido'); return
    }
    if (rows.some(r => chave(r) === chave(novo))) {
      setErro(`Já existe meta de ${novo.ano} para ${CORRETORA_LABEL[novo.corretora]}`); return
    }
    setSaving(chave(novo)); setErro(null)
    try {
      await actions.saveMeta(novo)
      const ordem = ESCOPOS_META
      setRows(arr => [novo, ...arr].sort((a, b) => b.ano - a.ano || ordem.indexOf(a.corretora) - ordem.indexOf(b.corretora)))
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
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Metas configuradas ({rows.length})</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Uma meta para o escritório inteiro e, se quiser, uma por corretora. O dashboard mostra o progresso de cada escopo.
            </p>
          </div>
          {!novo && (
            <button onClick={() => setNovo({ ano: new Date().getFullYear(), corretora: 'TOTAL', meta_lotes: 0, meta_receita: 0, observacao: null, updated_at: '' })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{ background: 'var(--blue)' }}>
              <Plus className="w-3.5 h-3.5" /> Nova meta
            </button>
          )}
        </div>

        {novo && (
          <div className="mb-3 p-3 rounded-xl" style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 items-end">
              <Field label="Ano">
                <input type="number" min={2000} max={2100} className="w-24 px-2 py-1 rounded text-sm tabular-nums" style={inputStyle}
                  value={novo.ano} onChange={e => setNovo(s => s ? { ...s, ano: Number(e.target.value) } : s)} />
              </Field>
              <Field label="Escopo">
                <select className="w-full px-2 py-1 rounded text-sm" style={inputStyle}
                  value={novo.corretora} onChange={e => setNovo(s => s ? { ...s, corretora: e.target.value as EscopoMeta } : s)}>
                  {ESCOPOS_META.map(e => <option key={e} value={e}>{CORRETORA_LABEL[e]}</option>)}
                </select>
              </Field>
              <Field label="Meta lotes">
                <input type="number" step="1" className="w-32 px-2 py-1 rounded text-sm tabular-nums text-right" style={inputStyle}
                  value={novo.meta_lotes} onChange={e => setNovo(s => s ? { ...s, meta_lotes: Number(e.target.value) } : s)} />
              </Field>
              <Field label="Meta receita (R$)">
                <input type="number" step="1" className="w-36 px-2 py-1 rounded text-sm tabular-nums text-right" style={inputStyle}
                  value={novo.meta_receita} onChange={e => setNovo(s => s ? { ...s, meta_receita: Number(e.target.value) } : s)} />
              </Field>
              <Field label="Observação">
                <input className="w-full px-2 py-1 rounded text-sm" style={inputStyle}
                  value={novo.observacao ?? ''} onChange={e => setNovo(s => s ? { ...s, observacao: e.target.value || null } : s)} />
              </Field>
              <div className="flex gap-2">
                <button onClick={addNew} disabled={saving === chave(novo)}
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
                {['Ano', 'Escopo', 'Meta lotes', 'Meta receita', 'Observação', ''].map((h, i) => (
                  <th key={i} className="px-3 py-2 font-semibold text-gray-500 border-r text-left"
                    style={{ borderColor: 'var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Sem metas. Clique em &quot;Nova meta&quot; pra adicionar.</td></tr>
              )}
              {rows.map((orig, idx) => {
                const k = chave(orig)
                const r = row(k)
                const dirty = !!editing[k]
                const bg = idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)'
                return (
                  <tr key={k} style={{ borderTop: '1px solid var(--border)', background: bg }}>
                    <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{r.ano}</td>
                    <td className="px-3 py-1.5"><EscopoLabel escopo={r.corretora} /></td>
                    <td className="px-3 py-1.5">
                      <input type="number" step="1" className="w-32 px-2 py-1 rounded text-sm tabular-nums text-right" style={inputStyle}
                        value={r.meta_lotes} onChange={e => patch(k, 'meta_lotes', Number(e.target.value))} />
                      <span className="ml-2 text-[10px] text-gray-400">{fmtNum(r.meta_lotes)} lotes</span>
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="number" step="1" className="w-36 px-2 py-1 rounded text-sm tabular-nums text-right" style={inputStyle}
                        value={r.meta_receita} onChange={e => patch(k, 'meta_receita', Number(e.target.value))} />
                      <span className="ml-2 text-[10px] text-gray-400">{fmtBRL(r.meta_receita)}</span>
                    </td>
                    <td className="px-3 py-1.5">
                      <input className="w-64 px-2 py-1 rounded text-sm" style={inputStyle}
                        value={r.observacao ?? ''} onChange={e => patch(k, 'observacao', e.target.value || null)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => save(k)} disabled={!dirty || saving === k}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-white disabled:opacity-40"
                          style={{ background: 'var(--blue)' }}>
                          {saving === k ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          {saving === k ? 'Salvando…' : 'Salvar'}
                        </button>
                        <button onClick={() => remove(orig)}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-1">{label}</p>
      {children}
    </div>
  )
}
