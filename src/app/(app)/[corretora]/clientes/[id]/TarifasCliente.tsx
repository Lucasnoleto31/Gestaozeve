'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { excluirTarifa, salvarTarifa } from '@/lib/gestao/acoes'
import { dataPt, n2, TRACO } from '@/components/gestao/Celulas'
import type { Corretora } from '@/lib/corretoras'
import type { TarifaCliente } from '@/lib/gestao/tipos'
import { numeroBR } from '@/lib/gestao/planilhas'

export function TarifasCliente({ corretora, clienteId, tarifas, admin, tarifaAtual }: {
  corretora: Corretora
  clienteId: string
  tarifas: TarifaCliente[]
  admin: boolean
  tarifaAtual: number
}) {
  const router = useRouter()
  const { avisar } = useToast()
  const [novo, setNovo] = useState(false)
  const [form, setForm] = useState({ vigencia: '', corretagem: '', observacao: '' })
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const salvar = async () => {
    setSalvando(true); setErro(null)
    const r = await salvarTarifa(corretora, clienteId, { vigencia: form.vigencia, corretagem: numeroBR(form.corretagem), observacao: form.observacao })
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    setNovo(false); setForm({ vigencia: '', corretagem: '', observacao: '' })
    avisar({ titulo: 'Tarifa salva', detalhe: 'Os lotes do cliente foram recalculados.', tom: 'gain' })
    router.refresh()
  }
  const excluir = async (id: string) => {
    if (!confirm('Excluir esta tarifa? Os lotes voltam a usar a tarifa do assessor.')) return
    const r = await excluirTarifa(corretora, id)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: 'Tarifa excluída', tom: 'neutral' })
    router.refresh()
  }

  return (
    <Panel variant="card" title="Tarifas" subtitle={`Vigente hoje: ${n2(tarifaAtual)} R$/lote${tarifas.length ? '' : ' (do assessor)'}`}
      action={admin && !novo ? <Button variant="secondary" size="sm" onClick={() => setNovo(true)}><Plus className="h-4 w-4" aria-hidden />Tarifa</Button> : undefined}>
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      {novo && (
        <div className="mb-3 grid gap-2 rounded-md bg-surface-2 p-3 sm:grid-cols-3">
          <Input label="Vigência" type="date" value={form.vigencia} onChange={e => setForm({ ...form, vigencia: e.target.value })} />
          <Input label="Corretagem (R$/lote)" inputMode="decimal" placeholder="0,25" value={form.corretagem} onChange={e => setForm({ ...form, corretagem: e.target.value })} />
          <Input label="Observação" value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} />
          <div className="flex gap-2 sm:col-span-3">
            <Button size="sm" onClick={salvar} loading={salvando}>Salvar</Button>
            <Button size="sm" variant="ghost" onClick={() => setNovo(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      <table className="tbl tbl-dense w-full">
        <thead><tr><th>Vigência</th><th className="num">R$/lote</th><th>Observação</th>{admin && <th><span className="sr-only">Ações</span></th>}</tr></thead>
        <tbody>
          {tarifas.length === 0 && <tr><td colSpan={admin ? 4 : 3} className="py-4 text-center text-label text-fg-subtle">Sem tarifa cadastrada · usa a do assessor</td></tr>}
          {tarifas.map(t => (
            <tr key={t.id}>
              <td className="num">{dataPt(t.vigencia)}</td>
              <td className="num font-medium">{n2(t.corretagem)}</td>
              <td className="muted">{t.observacao ?? TRACO}</td>
              {admin && <td className="text-right"><IconButton tone="danger" aria-label="Excluir tarifa" onClick={() => excluir(t.id)}><Trash2 className="h-4 w-4" aria-hidden /></IconButton></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}
