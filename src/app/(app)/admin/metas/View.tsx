'use client'

import { useState } from 'react'
import { Plus, Save, Trash2, X } from 'lucide-react'
import type { MetaRow } from './actions'
import { ESCOPOS_META, CORRETORA_LABEL, type EscopoMeta } from '@/lib/corretoras'
import { fmtBRL, fmtNum } from '@/lib/format'
import { Panel } from '@/components/ui/Panel'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Field } from '@/components/ui/Input'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'

interface Actions {
  saveMeta: (m: MetaRow) => Promise<{ ok: true }>
  deleteMeta: (ano: number, corretora: EscopoMeta) => Promise<{ ok: true }>
}

const chave = (m: { ano: number; corretora: EscopoMeta }) => `${m.ano}|${m.corretora}`

function EscopoLabel({ escopo }: { escopo: EscopoMeta }) {
  if (escopo === 'TOTAL') return <Badge>Escritório (total)</Badge>
  return <CorretoraBadge corretora={escopo} size="md" />
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
    <>
      {erro && <Alert tone="danger">{erro}</Alert>}

      <div className="flex items-center justify-end">
        {!novo && (
          <Button size="sm" onClick={() => setNovo({ ano: new Date().getFullYear(), corretora: 'TOTAL', meta_lotes: 0, meta_receita: 0, observacao: null, updated_at: '' })}>
            <Plus className="h-4 w-4" /> Nova meta
          </Button>
        )}
      </div>

      {novo && (
        <Panel title="Nova meta" subtitle="Escolha o ano e o escopo (escritório inteiro ou uma corretora).">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Field label="Ano">
              <input type="number" min={2000} max={2100} className="tabular-nums" value={novo.ano}
                onChange={e => setNovo(s => s ? { ...s, ano: Number(e.target.value) } : s)} />
            </Field>
            <Field label="Escopo">
              <select value={novo.corretora} onChange={e => setNovo(s => s ? { ...s, corretora: e.target.value as EscopoMeta } : s)}>
                {ESCOPOS_META.map(e => <option key={e} value={e}>{CORRETORA_LABEL[e]}</option>)}
              </select>
            </Field>
            <Field label="Meta de lotes">
              <input type="number" step="1" className="text-right tabular-nums" value={novo.meta_lotes}
                onChange={e => setNovo(s => s ? { ...s, meta_lotes: Number(e.target.value) } : s)} />
            </Field>
            <Field label="Meta de receita (R$)">
              <input type="number" step="1" className="text-right tabular-nums" value={novo.meta_receita}
                onChange={e => setNovo(s => s ? { ...s, meta_receita: Number(e.target.value) } : s)} />
            </Field>
            <Field label="Observação">
              <input value={novo.observacao ?? ''} onChange={e => setNovo(s => s ? { ...s, observacao: e.target.value || null } : s)} />
            </Field>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={addNew} loading={saving === chave(novo)}>
              {saving !== chave(novo) && <Save className="h-4 w-4" />} Salvar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setNovo(null)}><X className="h-4 w-4" /> Cancelar</Button>
          </div>
        </Panel>
      )}

      <Panel flush>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ano</th>
                <th>Escopo</th>
                <th>Meta de lotes</th>
                <th>Meta de receita</th>
                <th>Observação</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-fg-subtle">Sem metas. Clique em &quot;Nova meta&quot; pra adicionar.</td></tr>
              )}
              {rows.map((orig) => {
                const k = chave(orig)
                const r = row(k)
                const dirty = !!editing[k]
                return (
                  <tr key={k}>
                    <td className="font-semibold tabular-nums">{r.ano}</td>
                    <td><EscopoLabel escopo={r.corretora} /></td>
                    <td>
                      <div className="flex items-center gap-2">
                        <input type="number" step="1" className="field-sm w-32 text-right tabular-nums" value={r.meta_lotes}
                          onChange={e => patch(k, 'meta_lotes', Number(e.target.value))} />
                        <span className="subtle whitespace-nowrap text-[11px] tabular-nums">{fmtNum(r.meta_lotes)} lotes</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <input type="number" step="1" className="field-sm w-36 text-right tabular-nums" value={r.meta_receita}
                          onChange={e => patch(k, 'meta_receita', Number(e.target.value))} />
                        <span className="subtle whitespace-nowrap text-[11px] tabular-nums">{fmtBRL(r.meta_receita)}</span>
                      </div>
                    </td>
                    <td><input className="field-sm w-64" value={r.observacao ?? ''} onChange={e => patch(k, 'observacao', e.target.value || null)} /></td>
                    <td>
                      <div className="flex items-center gap-1">
                        <Button size="xs" onClick={() => save(k)} disabled={!dirty} loading={saving === k}>
                          {saving !== k && <Save className="h-3 w-3" />} Salvar
                        </Button>
                        <IconButton tone="danger" title="Remover meta" onClick={() => remove(orig)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}
