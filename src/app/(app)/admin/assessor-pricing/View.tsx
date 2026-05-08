'use client'

import { useEffect, useState, useTransition } from 'react'
import { Save, Plus, Trash2, RefreshCw, Layers, X } from 'lucide-react'
import type { PricingRow, SavePricingInput, ModeloZeragem, TierRow } from './actions'

interface Actions {
  savePricing: (input: SavePricingInput) => Promise<{ ok: true; id: string }>
  deletePricing: (id: string) => Promise<{ ok: true }>
  listTiers: (pricingId: string) => Promise<TierRow[]>
  saveTiers: (pricingId: string, tiers: TierRow[]) => Promise<{ ok: true }>
}

const MODELOS_ZERAGEM: { id: ModeloZeragem; label: string }[] = [
  { id: 'b2b', label: 'B2B (corretora absorve)' },
  { id: 'fixo', label: 'Valor fixo (R$ por zeragem)' },
  { id: 'mesmo_operado', label: 'Igual ao lote operado' },
  { id: 'tiered', label: 'Escalonado por volume diário' },
]

const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

export function PricingView({ initial, actions }: { initial: PricingRow[]; actions: Actions }) {
  const [rows, setRows] = useState<PricingRow[]>(initial)
  const [editing, setEditing] = useState<Record<string, Partial<PricingRow>>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [tierModalFor, setTierModalFor] = useState<PricingRow | null>(null)
  const [newRow, setNewRow] = useState<Partial<PricingRow>>({
    barra_nome: '', numero: '',
    preco_lote_futuros: 0, modelo_zeragem: 'tiered',
    preco_zeragem: 0, pct_volume_bovespa: 0.05, observacao: '',
  })
  const [, startTransition] = useTransition()

  function patch(id: string, key: keyof PricingRow, value: PricingRow[keyof PricingRow]) {
    setEditing(s => ({ ...s, [id]: { ...s[id], [key]: value } }))
  }

  function row(id: string): PricingRow {
    const original = rows.find(r => r.id === id)!
    return { ...original, ...editing[id] }
  }

  async function save(id: string) {
    const r = row(id)
    setSaving(id); setErro(null)
    try {
      await actions.savePricing({
        id,
        barra_nome: r.barra_nome,
        numero: r.numero,
        preco_lote_futuros: Number(r.preco_lote_futuros) || 0,
        modelo_zeragem: r.modelo_zeragem,
        preco_zeragem: Number(r.preco_zeragem) || 0,
        pct_volume_bovespa: Number(r.pct_volume_bovespa) || 0,
        observacao: r.observacao ?? null,
      })
      setRows(arr => arr.map(x => x.id === id ? r : x))
      setEditing(s => { const n = { ...s }; delete n[id]; return n })
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSaving(null)
    }
  }

  async function remove(id: string) {
    if (!confirm('Remover tarifa desta barra?')) return
    setDeleting(id); setErro(null)
    try {
      await actions.deletePricing(id)
      setRows(arr => arr.filter(x => x.id !== id))
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setDeleting(null)
    }
  }

  async function addNew() {
    if (!newRow.barra_nome?.trim()) { setErro('Nome da barra é obrigatório'); return }
    startTransition(async () => {
      try {
        const res = await actions.savePricing({
          barra_nome: newRow.barra_nome!.trim(),
          numero: (newRow.numero as string | null) || null,
          preco_lote_futuros: Number(newRow.preco_lote_futuros) || 0,
          modelo_zeragem: (newRow.modelo_zeragem as ModeloZeragem) ?? 'b2b',
          preco_zeragem: Number(newRow.preco_zeragem) || 0,
          pct_volume_bovespa: Number(newRow.pct_volume_bovespa) || 0,
          observacao: (newRow.observacao as string | null) || null,
        })
        const created: PricingRow = {
          id: res.id, barra_id: null,
          barra_nome: newRow.barra_nome!.trim(),
          numero: (newRow.numero as string | null) || null,
          preco_lote_futuros: Number(newRow.preco_lote_futuros) || 0,
          modelo_zeragem: (newRow.modelo_zeragem as ModeloZeragem) ?? 'b2b',
          preco_zeragem: Number(newRow.preco_zeragem) || 0,
          pct_volume_bovespa: Number(newRow.pct_volume_bovespa) || 0,
          observacao: (newRow.observacao as string | null) || null,
          ativo: true, updated_at: new Date().toISOString(),
        }
        setRows(arr => [...arr, created].sort((a, b) => a.barra_nome.localeCompare(b.barra_nome)))
        setAdding(false)
        setNewRow({ barra_nome: '', numero: '', preco_lote_futuros: 0, modelo_zeragem: 'tiered', preco_zeragem: 0, pct_volume_bovespa: 0.05, observacao: '' })
      } catch (err) {
        setErro((err as Error).message)
      }
    })
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
          <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Tarifas ativas ({rows.length})</p>
          {!adding && (
            <button onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
              style={{ background: 'var(--blue)' }}>
              <Plus className="w-3.5 h-3.5" /> Nova barra
            </button>
          )}
        </div>

        {adding && (
          <div className="mb-3 p-3 rounded-xl" style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}>
            <div className="grid grid-cols-2 lg:grid-cols-7 gap-2 items-end">
              <Field label="Nome da barra" wide>
                <input className="w-full px-2 py-1 rounded text-sm" style={inputStyle}
                  value={newRow.barra_nome ?? ''} onChange={e => setNewRow(s => ({ ...s, barra_nome: e.target.value }))} />
              </Field>
              <Field label="Número">
                <input className="w-full px-2 py-1 rounded text-sm tabular-nums" style={inputStyle}
                  value={(newRow.numero as string) ?? ''} onChange={e => setNewRow(s => ({ ...s, numero: e.target.value }))} />
              </Field>
              <Field label="R$/lote operado">
                <input type="number" step="0.0001" className="w-full px-2 py-1 rounded text-sm tabular-nums" style={inputStyle}
                  value={newRow.preco_lote_futuros ?? 0} onChange={e => setNewRow(s => ({ ...s, preco_lote_futuros: Number(e.target.value) }))} />
              </Field>
              <Field label="Modelo zeragem">
                <select className="w-full px-2 py-1 rounded text-sm" style={inputStyle}
                  value={newRow.modelo_zeragem ?? 'tiered'}
                  onChange={e => setNewRow(s => ({ ...s, modelo_zeragem: e.target.value as ModeloZeragem }))}>
                  {MODELOS_ZERAGEM.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </Field>
              <Field label="R$/zeragem (se fixo)">
                <input type="number" step="0.0001" className="w-full px-2 py-1 rounded text-sm tabular-nums" style={inputStyle}
                  value={newRow.preco_zeragem ?? 0} onChange={e => setNewRow(s => ({ ...s, preco_zeragem: Number(e.target.value) }))} />
              </Field>
              <Field label="% Vol Bovespa">
                <input type="number" step="0.001" className="w-full px-2 py-1 rounded text-sm tabular-nums" style={inputStyle}
                  value={newRow.pct_volume_bovespa ?? 0} onChange={e => setNewRow(s => ({ ...s, pct_volume_bovespa: Number(e.target.value) }))} />
              </Field>
              <div className="flex gap-2">
                <button onClick={addNew} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Save className="w-3.5 h-3.5" /> Salvar
                </button>
                <button onClick={() => setAdding(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100">Cancelar</button>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
          <table className="text-xs border-collapse min-w-max w-full">
            <thead style={{ background: 'var(--surface-2)' }}>
              <tr>
                {['Barra', 'Nº', 'R$/lote', 'Modelo zeragem', 'R$/zeragem', '% Vol Bovespa', 'Faixas', 'Observação', ''].map((h, i) => (
                  <th key={i} className="px-3 py-2 font-semibold text-gray-500 border-r text-left"
                    style={{ borderColor: 'var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">Sem tarifas cadastradas. Clique em &quot;Nova barra&quot; pra adicionar.</td></tr>
              )}
              {rows.map((orig, idx) => {
                const r = row(orig.id)
                const dirty = !!editing[orig.id]
                const bg = idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)'
                return (
                  <tr key={orig.id} style={{ borderTop: '1px solid var(--border)', background: bg }}>
                    <td className="px-3 py-1.5">
                      <input className="w-48 px-2 py-1 rounded text-sm" style={inputStyle}
                        value={r.barra_nome} onChange={e => patch(orig.id, 'barra_nome', e.target.value)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input className="w-20 px-2 py-1 rounded text-sm tabular-nums" style={inputStyle}
                        value={r.numero ?? ''} onChange={e => patch(orig.id, 'numero', e.target.value)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="number" step="0.0001" className="w-24 px-2 py-1 rounded text-sm tabular-nums text-right" style={inputStyle}
                        value={r.preco_lote_futuros}
                        onChange={e => patch(orig.id, 'preco_lote_futuros', Number(e.target.value))} />
                    </td>
                    <td className="px-3 py-1.5">
                      <select className="px-2 py-1 rounded text-sm" style={inputStyle}
                        value={r.modelo_zeragem}
                        onChange={e => patch(orig.id, 'modelo_zeragem', e.target.value as ModeloZeragem)}>
                        {MODELOS_ZERAGEM.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="number" step="0.0001" className="w-24 px-2 py-1 rounded text-sm tabular-nums text-right" style={inputStyle}
                        disabled={r.modelo_zeragem !== 'fixo'}
                        value={r.preco_zeragem}
                        onChange={e => patch(orig.id, 'preco_zeragem', Number(e.target.value))} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="number" step="0.001" className="w-20 px-2 py-1 rounded text-sm tabular-nums text-right" style={inputStyle}
                        value={r.pct_volume_bovespa}
                        onChange={e => patch(orig.id, 'pct_volume_bovespa', Number(e.target.value))} />
                    </td>
                    <td className="px-3 py-1.5">
                      <button disabled={r.modelo_zeragem !== 'tiered'}
                        onClick={() => setTierModalFor(r)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ background: 'rgba(59,130,246,0.1)', color: '#1d4ed8' }}>
                        <Layers className="w-3 h-3" /> Editar faixas
                      </button>
                    </td>
                    <td className="px-3 py-1.5">
                      <input className="w-64 px-2 py-1 rounded text-sm" style={inputStyle}
                        value={r.observacao ?? ''} onChange={e => patch(orig.id, 'observacao', e.target.value)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => save(orig.id)} disabled={!dirty || saving === orig.id}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-white disabled:opacity-40"
                          style={{ background: 'var(--blue)' }}>
                          {saving === orig.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          {saving === orig.id ? 'Salvando…' : 'Salvar'}
                        </button>
                        <button onClick={() => remove(orig.id)} disabled={deleting === orig.id}
                          className="p-1.5 rounded text-red-500 hover:bg-red-50 disabled:opacity-40">
                          {deleting === orig.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-gray-400 mt-3">
          As tarifas alimentam o cálculo de receita do dashboard. Faixas escalonadas (modelo &quot;tiered&quot;)
          são aplicadas por <strong>volume diário de zeragem por cliente</strong>. Bovespa ainda não vira
          receita até integrarmos volume financeiro por cliente.
        </p>
      </div>

      <p className="text-[11px] text-gray-500">Exemplo de tarifa por lote: <strong>{fmtBRL(0.25)}</strong>/lote.</p>

      {tierModalFor && (
        <TiersModal
          pricing={tierModalFor}
          listTiers={actions.listTiers}
          saveTiers={actions.saveTiers}
          onClose={() => setTierModalFor(null)}
        />
      )}
    </div>
  )
}

// ===========================================================
// Modal de edição de faixas
// ===========================================================
function TiersModal({ pricing, listTiers, saveTiers, onClose }: {
  pricing: PricingRow
  listTiers: (pricingId: string) => Promise<TierRow[]>
  saveTiers: (pricingId: string, tiers: TierRow[]) => Promise<{ ok: true }>
  onClose: () => void
}) {
  const [tiers, setTiers] = useState<TierRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Carrega faixas ao abrir
  useEffect(() => {
    let cancelled = false
    listTiers(pricing.id)
      .then(t => {
        if (cancelled) return
        setTiers(t.length ? t : defaultTiers(pricing.id))
      })
      .catch(err => { if (!cancelled) setErro((err as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [pricing.id, listTiers])

  function defaultTiers(pricingId: string): TierRow[] {
    return [
      { pricing_id: pricingId, volume_min: 1,    volume_max: 19,   preco_zeragem: 23, ordem: 1 },
      { pricing_id: pricingId, volume_min: 20,   volume_max: 499,  preco_zeragem: 22, ordem: 2 },
      { pricing_id: pricingId, volume_min: 500,  volume_max: 999,  preco_zeragem: 21, ordem: 3 },
      { pricing_id: pricingId, volume_min: 1000, volume_max: 4999, preco_zeragem: 20, ordem: 4 },
      { pricing_id: pricingId, volume_min: 5000, volume_max: null, preco_zeragem: 19, ordem: 5 },
    ]
  }

  function update(idx: number, key: keyof TierRow, value: TierRow[keyof TierRow]) {
    setTiers(t => t == null ? t : t.map((row, i) => i === idx ? { ...row, [key]: value } : row))
  }

  function addLine() {
    setTiers(t => {
      if (!t) return t
      const last = t[t.length - 1]
      const nextMin = last ? (last.volume_max ?? last.volume_min) + 1 : 1
      return [...t, { pricing_id: pricing.id, volume_min: nextMin, volume_max: null, preco_zeragem: 0, ordem: t.length + 1 }]
    })
  }

  function removeLine(idx: number) {
    setTiers(t => t == null ? t : t.filter((_, i) => i !== idx).map((row, i) => ({ ...row, ordem: i + 1 })))
  }

  async function persist() {
    if (!tiers) return
    setSaving(true); setErro(null)
    try {
      await saveTiers(pricing.id, tiers)
      onClose()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.7)' }}>
      <div className="rounded-2xl w-full max-w-2xl p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <header className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Faixas de zeragem</p>
            <h3 className="text-xl font-bold text-gray-900">{pricing.barra_nome}</h3>
            <p className="text-xs text-gray-500 mt-0.5">A faixa é aplicada por volume zerado <strong>diário, por cliente</strong>.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </header>

        {erro && (
          <div className="mb-3 rounded-xl px-3 py-2 text-xs"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
            {erro}
          </div>
        )}

        {loading || !tiers ? (
          <p className="text-sm text-gray-400 py-8 text-center">Carregando faixas…</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border mb-3" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['Volume mín.', 'Volume máx. (vazio = ∞)', 'R$/zeragem', ''].map((h, i) => (
                      <th key={i} className="px-3 py-2 font-semibold text-gray-500 border-r text-left"
                        style={{ borderColor: 'var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tiers.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Sem faixas. Clique em &quot;Adicionar faixa&quot;.</td></tr>
                  )}
                  {tiers.map((t, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                      <td className="px-3 py-1.5">
                        <input type="number" min={0} className="w-24 px-2 py-1 rounded text-sm tabular-nums text-right" style={inputStyle}
                          value={t.volume_min} onChange={e => update(i, 'volume_min', Number(e.target.value))} />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" min={0} className="w-24 px-2 py-1 rounded text-sm tabular-nums text-right" style={inputStyle}
                          value={t.volume_max ?? ''}
                          onChange={e => update(i, 'volume_max', e.target.value === '' ? null : Number(e.target.value))} />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" step="0.01" className="w-24 px-2 py-1 rounded text-sm tabular-nums text-right" style={inputStyle}
                          value={t.preco_zeragem} onChange={e => update(i, 'preco_zeragem', Number(e.target.value))} />
                      </td>
                      <td className="px-3 py-1.5">
                        <button onClick={() => removeLine(i)} className="p-1.5 rounded text-red-500 hover:bg-red-50">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <button onClick={addLine}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
                <Plus className="w-3.5 h-3.5" /> Adicionar faixa
              </button>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100">Cancelar</button>
                <button onClick={persist} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {saving ? 'Salvando…' : 'Salvar faixas'}
                </button>
              </div>
            </div>
          </>
        )}
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
