'use client'

import { useEffect, useState, useTransition } from 'react'
import { Layers, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react'
import type { PricingRow, SavePricingInput, ModeloZeragem, TierRow } from './actions'
import { CORRETORAS, CORRETORA_LABEL, type Corretora } from '@/lib/corretoras'
import { fmtBRL2 } from '@/lib/format'
import { Panel } from '@/components/ui/Panel'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { Button, IconButton } from '@/components/ui/Button'
import { Field } from '@/components/ui/Input'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'

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

const NOVA_LINHA: Partial<PricingRow> = {
  corretora: 'GENIAL', barra_nome: '', numero: '',
  preco_lote_futuros: 0, modelo_zeragem: 'tiered',
  preco_zeragem: 0, pct_volume_bovespa: 0.05, observacao: '',
}

const ordenar = (arr: PricingRow[]) =>
  [...arr].sort((a, b) =>
    CORRETORAS.indexOf(a.corretora) - CORRETORAS.indexOf(b.corretora)
    || a.barra_nome.localeCompare(b.barra_nome))

export function PricingView({ initial, actions }: { initial: PricingRow[]; actions: Actions }) {
  const [rows, setRows] = useState<PricingRow[]>(() => ordenar(initial))
  const [editing, setEditing] = useState<Record<string, Partial<PricingRow>>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [filtro, setFiltro] = useState<Corretora | ''>('')
  const [tierModalFor, setTierModalFor] = useState<PricingRow | null>(null)
  const [newRow, setNewRow] = useState<Partial<PricingRow>>(NOVA_LINHA)
  const [, startTransition] = useTransition()

  const visiveis = filtro ? rows.filter(r => r.corretora === filtro) : rows

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
        corretora: r.corretora,
        barra_nome: r.barra_nome,
        numero: r.numero,
        preco_lote_futuros: Number(r.preco_lote_futuros) || 0,
        modelo_zeragem: r.modelo_zeragem,
        preco_zeragem: Number(r.preco_zeragem) || 0,
        pct_volume_bovespa: Number(r.pct_volume_bovespa) || 0,
        observacao: r.observacao ?? null,
      })
      setRows(arr => ordenar(arr.map(x => x.id === id ? r : x)))
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
        const corretora = (newRow.corretora as Corretora) ?? 'GENIAL'
        const res = await actions.savePricing({
          corretora,
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
          corretora,
          barra_nome: newRow.barra_nome!.trim(),
          numero: (newRow.numero as string | null) || null,
          preco_lote_futuros: Number(newRow.preco_lote_futuros) || 0,
          modelo_zeragem: (newRow.modelo_zeragem as ModeloZeragem) ?? 'b2b',
          preco_zeragem: Number(newRow.preco_zeragem) || 0,
          pct_volume_bovespa: Number(newRow.pct_volume_bovespa) || 0,
          observacao: (newRow.observacao as string | null) || null,
          ativo: true, updated_at: new Date().toISOString(),
        }
        setRows(arr => ordenar([...arr, created]))
        setAdding(false)
        setNewRow(NOVA_LINHA)
      } catch (err) {
        setErro((err as Error).message)
      }
    })
  }

  return (
    <>
      {erro && <Alert tone="danger">{erro}</Alert>}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className="chip" data-active={filtro === ''} onClick={() => setFiltro('')}>
            Todas <span className="opacity-70">({rows.length})</span>
          </button>
          {CORRETORAS.map(c => (
            <button key={c} type="button" className="chip" data-active={filtro === c} onClick={() => setFiltro(c)}>
              {CORRETORA_LABEL[c]} <span className="opacity-70">({rows.filter(r => r.corretora === c).length})</span>
            </button>
          ))}
        </div>
        {!adding && (
          <Button size="sm" onClick={() => { setNewRow({ ...NOVA_LINHA, corretora: filtro || 'GENIAL' }); setAdding(true) }}>
            <Plus className="h-4 w-4" /> Nova tarifa
          </Button>
        )}
      </div>

      {adding && (
        <Panel title="Nova tarifa" subtitle="A mesma barra pode ter tarifas diferentes na Genial, na XP e no BTG.">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Field label="Corretora">
              <select value={newRow.corretora ?? 'GENIAL'}
                onChange={e => setNewRow(s => ({ ...s, corretora: e.target.value as Corretora }))}>
                {CORRETORAS.map(c => <option key={c} value={c}>{CORRETORA_LABEL[c]}</option>)}
              </select>
            </Field>
            <Field label="Nome da barra" className="col-span-2">
              <input value={newRow.barra_nome ?? ''} onChange={e => setNewRow(s => ({ ...s, barra_nome: e.target.value }))} placeholder="Como aparece na planilha" autoFocus />
            </Field>
            <Field label="Número">
              <input className="tabular-nums" value={(newRow.numero as string) ?? ''} onChange={e => setNewRow(s => ({ ...s, numero: e.target.value }))} />
            </Field>
            <Field label="R$ por lote operado">
              <input type="number" step="0.0001" className="tabular-nums" value={newRow.preco_lote_futuros ?? 0}
                onChange={e => setNewRow(s => ({ ...s, preco_lote_futuros: Number(e.target.value) }))} />
            </Field>
            <Field label="Modelo de zeragem">
              <select value={newRow.modelo_zeragem ?? 'tiered'}
                onChange={e => setNewRow(s => ({ ...s, modelo_zeragem: e.target.value as ModeloZeragem }))}>
                {MODELOS_ZERAGEM.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="R$ por zeragem (se fixo)">
              <input type="number" step="0.0001" className="tabular-nums" value={newRow.preco_zeragem ?? 0}
                disabled={newRow.modelo_zeragem !== 'fixo'}
                onChange={e => setNewRow(s => ({ ...s, preco_zeragem: Number(e.target.value) }))} />
            </Field>
            <Field label="% volume Bovespa">
              <input type="number" step="0.001" className="tabular-nums" value={newRow.pct_volume_bovespa ?? 0}
                onChange={e => setNewRow(s => ({ ...s, pct_volume_bovespa: Number(e.target.value) }))} />
            </Field>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={addNew}><Save className="h-4 w-4" /> Salvar</Button>
            <Button size="sm" variant="secondary" onClick={() => setAdding(false)}><X className="h-4 w-4" /> Cancelar</Button>
          </div>
        </Panel>
      )}

      <Panel flush>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Corretora</th>
                <th>Barra</th>
                <th>Nº</th>
                <th className="num">R$/lote</th>
                <th>Modelo de zeragem</th>
                <th className="num">R$/zeragem</th>
                <th className="num">% Bovespa</th>
                <th>Faixas</th>
                <th>Observação</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-fg-subtle">
                  {rows.length === 0 ? 'Sem tarifas cadastradas. Clique em "Nova tarifa" pra adicionar.' : 'Sem tarifas nesta corretora.'}
                </td></tr>
              )}
              {visiveis.map((orig) => {
                const r = row(orig.id)
                const dirty = !!editing[orig.id]
                return (
                  <tr key={orig.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <CorretoraBadge corretora={r.corretora} />
                        <select className="field-sm" value={r.corretora}
                          onChange={e => patch(orig.id, 'corretora', e.target.value as Corretora)}>
                          {CORRETORAS.map(c => <option key={c} value={c}>{CORRETORA_LABEL[c]}</option>)}
                        </select>
                      </div>
                    </td>
                    <td><input className="field-sm w-52" value={r.barra_nome} onChange={e => patch(orig.id, 'barra_nome', e.target.value)} /></td>
                    <td><input className="field-sm w-20 tabular-nums" value={r.numero ?? ''} onChange={e => patch(orig.id, 'numero', e.target.value)} /></td>
                    <td>
                      <input type="number" step="0.0001" className="field-sm w-24 text-right tabular-nums" value={r.preco_lote_futuros}
                        onChange={e => patch(orig.id, 'preco_lote_futuros', Number(e.target.value))} />
                    </td>
                    <td>
                      <select className="field-sm" value={r.modelo_zeragem}
                        onChange={e => patch(orig.id, 'modelo_zeragem', e.target.value as ModeloZeragem)}>
                        {MODELOS_ZERAGEM.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="number" step="0.0001" className="field-sm w-24 text-right tabular-nums"
                        disabled={r.modelo_zeragem !== 'fixo'} value={r.preco_zeragem}
                        onChange={e => patch(orig.id, 'preco_zeragem', Number(e.target.value))} />
                    </td>
                    <td>
                      <input type="number" step="0.001" className="field-sm w-20 text-right tabular-nums" value={r.pct_volume_bovespa}
                        onChange={e => patch(orig.id, 'pct_volume_bovespa', Number(e.target.value))} />
                    </td>
                    <td>
                      <Button size="xs" variant="secondary" disabled={r.modelo_zeragem !== 'tiered'} onClick={() => setTierModalFor(r)}>
                        <Layers className="h-3 w-3" /> Faixas
                      </Button>
                    </td>
                    <td><input className="field-sm w-56" value={r.observacao ?? ''} onChange={e => patch(orig.id, 'observacao', e.target.value)} /></td>
                    <td>
                      <div className="flex items-center gap-1">
                        <Button size="xs" onClick={() => save(orig.id)} disabled={!dirty} loading={saving === orig.id}>
                          {saving !== orig.id && <Save className="h-3 w-3" />} Salvar
                        </Button>
                        <IconButton tone="danger" title="Remover tarifa" onClick={() => remove(orig.id)} disabled={deleting === orig.id}>
                          {deleting === orig.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-fg-subtle">
          Faixas escalonadas (modelo &quot;escalonado&quot;) são aplicadas por <strong>volume diário de zeragem por cliente</strong>.
          Bovespa ainda não vira receita até integrarmos volume financeiro por cliente. Exemplo de tarifa por lote: {fmtBRL2(0.25)}/lote.
        </p>
      </Panel>

      {tierModalFor && (
        <TiersModal
          pricing={tierModalFor}
          listTiers={actions.listTiers}
          saveTiers={actions.saveTiers}
          onClose={() => setTierModalFor(null)}
        />
      )}
    </>
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
    <Modal open onClose={onClose} size="lg"
      title={<span className="inline-flex items-center gap-2">Faixas de zeragem · {pricing.barra_nome} <CorretoraBadge corretora={pricing.corretora} size="md" /></span>}
      subtitle="A faixa é aplicada por volume zerado diário, por cliente."
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={persist} loading={saving} disabled={loading || !tiers}>
            {!saving && <Save className="h-3.5 w-3.5" />} Salvar faixas
          </Button>
        </>
      }>
      {erro && <Alert tone="danger" className="mb-3">{erro}</Alert>}

      {loading || !tiers ? (
        <p className="py-8 text-center text-sm text-fg-subtle">Carregando faixas…</p>
      ) : (
        <>
          <div className="tbl-wrap mb-3">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Volume mín.</th>
                  <th>Volume máx. (vazio = ∞)</th>
                  <th>R$/zeragem</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {tiers.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-fg-subtle">Sem faixas. Clique em &quot;Adicionar faixa&quot;.</td></tr>
                )}
                {tiers.map((t, i) => (
                  <tr key={i}>
                    <td>
                      <input type="number" min={0} className="field-sm w-24 text-right tabular-nums"
                        value={t.volume_min} onChange={e => update(i, 'volume_min', Number(e.target.value))} />
                    </td>
                    <td>
                      <input type="number" min={0} className="field-sm w-24 text-right tabular-nums"
                        value={t.volume_max ?? ''}
                        onChange={e => update(i, 'volume_max', e.target.value === '' ? null : Number(e.target.value))} />
                    </td>
                    <td>
                      <input type="number" step="0.01" className="field-sm w-24 text-right tabular-nums"
                        value={t.preco_zeragem} onChange={e => update(i, 'preco_zeragem', Number(e.target.value))} />
                    </td>
                    <td>
                      <IconButton tone="danger" title="Remover faixa" onClick={() => removeLine(i)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button size="sm" variant="secondary" onClick={addLine}><Plus className="h-3.5 w-3.5" /> Adicionar faixa</Button>
        </>
      )}
    </Modal>
  )
}
