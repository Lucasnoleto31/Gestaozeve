'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { dataPt, r0, TRACO } from '@/components/gestao/Celulas'
import { excluirPagamentoComissao, salvarPagamentoComissao } from '@/lib/gestao/acoes'
import { numeroBR } from '@/lib/gestao/planilhas'
import { mesCurto, mesInput, mesAtual } from '@/lib/gestao/meses'
import { CORRETORAS, CORRETORA_LABEL, isCorretora } from '@/lib/corretoras'
import type { ComissaoPagamento } from '@/lib/gestao/tipos'

// Pagamentos feitos ao parceiro: lista e, para o admin, o lançamento (mês, corretora, valor, data, observação)
export function PagamentosComissao({ parceiro, pagamentos, admin }: { parceiro: string; pagamentos: ComissaoPagamento[]; admin: boolean }) {
  const router = useRouter()
  const { avisar } = useToast()
  const [novo, setNovo] = useState(false)
  const [form, setForm] = useState({ mes: mesInput(mesAtual()), corretora: '', valor: '', data_pagamento: '', observacao: '' })
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const total = pagamentos.reduce((s, p) => s + p.valor, 0)

  const salvar = async () => {
    setSalvando(true); setErro(null)
    const r = await salvarPagamentoComissao({ parceiro, corretora: form.corretora || null, mes: form.mes, valor: numeroBR(form.valor), data_pagamento: form.data_pagamento, observacao: form.observacao })
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    setNovo(false); setForm({ mes: mesInput(mesAtual()), corretora: '', valor: '', data_pagamento: '', observacao: '' })
    avisar({ titulo: 'Pagamento lançado', detalhe: `${parceiro} · ${r0(numeroBR(form.valor))}`, tom: 'gain' })
    router.refresh()
  }
  const excluir = async (p: ComissaoPagamento) => {
    if (!confirm(`Excluir o pagamento de ${r0(p.valor)} de ${mesCurto(p.mes_ref)}?`)) return
    const r = await excluirPagamentoComissao(p.id)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: 'Pagamento excluído', tom: 'neutral' })
    router.refresh()
  }

  return (
    <Panel variant="card" title="Pagamentos" subtitle={`${pagamentos.length} ${pagamentos.length === 1 ? 'lançamento' : 'lançamentos'} · ${r0(total)} pagos a ${parceiro}`}
      action={admin && !novo ? <Button variant="secondary" size="sm" onClick={() => setNovo(true)}><Plus className="h-4 w-4" aria-hidden />Pagamento</Button> : undefined}>
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      {novo && (
        <div className="mb-3 grid gap-2 rounded-lg bg-surface-2 p-3 sm:grid-cols-2">
          <Input label="Mês de referência" type="month" value={form.mes} onChange={e => setForm({ ...form, mes: e.target.value })} />
          <Select label="Corretora" value={form.corretora} onChange={e => setForm({ ...form, corretora: e.target.value })} hint="Vazio = pagamento geral">
            <option value="">Geral</option>
            {CORRETORAS.map(c => <option key={c} value={c}>{CORRETORA_LABEL[c]}</option>)}
          </Select>
          <Input label="Valor (R$)" inputMode="decimal" placeholder="0,00" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} />
          <Input label="Data do pagamento" type="date" value={form.data_pagamento} onChange={e => setForm({ ...form, data_pagamento: e.target.value })} />
          <Input label="Observação" value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} className="sm:col-span-2" />
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" onClick={salvar} loading={salvando}>Salvar pagamento</Button>
            <Button size="sm" variant="ghost" onClick={() => setNovo(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      <table className="tbl tbl-dense w-full">
        <thead><tr><th>Mês</th><th className="col-p2">Corretora</th><th className="num">Valor</th><th>Pago em</th><th className="col-p3">Observação</th>{admin && <th><span className="sr-only">Ações</span></th>}</tr></thead>
        <tbody>
          {pagamentos.length === 0 && <tr><td colSpan={admin ? 6 : 5} className="py-4 text-center text-label text-fg-subtle">Nenhum pagamento lançado.</td></tr>}
          {pagamentos.map(p => (
            <tr key={p.id}>
              <td className="num">{mesCurto(p.mes_ref)}</td>
              <td className="muted col-p2">{p.corretora && isCorretora(p.corretora) ? CORRETORA_LABEL[p.corretora] : 'Geral'}</td>
              <td className="num font-medium">{r0(p.valor)}</td>
              <td className="num">{dataPt(p.data_pagamento)}</td>
              <td className="muted col-p3">{p.observacao ?? TRACO}</td>
              {admin && <td className="text-right"><IconButton tone="danger" aria-label="Excluir pagamento" onClick={() => excluir(p)}><Trash2 className="h-4 w-4" aria-hidden /></IconButton></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}
