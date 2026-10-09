'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { dataPt } from '@/components/gestao/Celulas'
import { excluirRegraComissao, salvarRegraComissao } from '@/lib/gestao/acoes'
import { lerFaixasComissao } from '@/lib/gestao/comissao'
import { CORRETORAS, CORRETORA_LABEL, isCorretora } from '@/lib/corretoras'
import { fmtBRL2 } from '@/lib/format'
import type { ComissaoRegra } from '@/lib/gestao/tipos'

// "0:20;5:25" → "R$ 20,00 (a partir de 0) · R$ 25,00 (a partir de 5)"
function descreve(metas: string): string {
  const f = lerFaixasComissao(metas)
  if (!f.length) return '—'
  return f.map((x, i) => (i === 0 && x.minimo === 0 ? fmtBRL2(x.valor) : `${fmtBRL2(x.valor)} a partir de ${x.minimo}`)).join(' · ')
}

// Regras de valor por corretora, com vigência. A regra mais recente até a data do evento (abertura, ativação ou reativação) é a que vale.
export function RegrasComissao({ parceiro, regras, admin }: { parceiro: string; regras: ComissaoRegra[]; admin: boolean }) {
  const router = useRouter()
  const { avisar } = useToast()
  const [novo, setNovo] = useState(false)
  const [form, setForm] = useState({ corretora: 'BTG', vigencia: '', prazo: '60', reativacao: '4', metas_abertura: '0:20', metas_ativacao: '0:100' })
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const ordenadas = [...regras].sort((a, b) => a.corretora.localeCompare(b.corretora) || b.vigencia.localeCompare(a.vigencia))

  const salvar = async () => {
    setSalvando(true); setErro(null)
    const r = await salvarRegraComissao({ parceiro, corretora: form.corretora, vigencia: form.vigencia, prazo_ativacao_dias: Number(form.prazo), reativacao_meses: Number(form.reativacao), metas_abertura: form.metas_abertura, metas_ativacao: form.metas_ativacao })
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    setNovo(false)
    avisar({ titulo: 'Regra salva', detalhe: `${parceiro} · ${CORRETORA_LABEL[form.corretora as keyof typeof CORRETORA_LABEL] ?? form.corretora}`, tom: 'gain' })
    router.refresh()
  }
  const excluir = async (r: ComissaoRegra) => {
    if (!confirm(`Excluir a regra da ${r.corretora} vigente desde ${dataPt(r.vigencia)}?`)) return
    const res = await excluirRegraComissao(r.id)
    if (!res.ok) { setErro(res.erro); return }
    avisar({ titulo: 'Regra excluída', tom: 'neutral' })
    router.refresh()
  }

  return (
    <Panel variant="card" title="Regras" subtitle="Valor por conta em faixas pela quantidade do mês: mínimo:R$ separado por ponto e vírgula. A faixa alcançada vale para todas as contas do mês."
      action={admin && !novo ? <Button variant="secondary" size="sm" onClick={() => setNovo(true)}><Plus className="h-4 w-4" aria-hidden />Regra</Button> : undefined}>
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      {novo && (
        <div className="mb-3 grid gap-2 rounded-lg bg-surface-2 p-3 sm:grid-cols-2">
          <Select label="Corretora" value={form.corretora} onChange={e => setForm({ ...form, corretora: e.target.value })}>
            {CORRETORAS.map(c => <option key={c} value={c}>{CORRETORA_LABEL[c]}</option>)}
          </Select>
          <Input label="Vigência" type="date" value={form.vigencia} onChange={e => setForm({ ...form, vigencia: e.target.value })} hint="Vale para abertura, ativação e reativação a partir desta data (pela data do evento)" />
          <Input label="Prazo da ativação (dias)" inputMode="numeric" value={form.prazo} onChange={e => setForm({ ...form, prazo: e.target.value })} />
          <Input label="Reativação: meses sem operar" inputMode="numeric" value={form.reativacao} onChange={e => setForm({ ...form, reativacao: e.target.value })} hint="Cliente parado esse tempo que volta a operar conta como ativação" />
          <Input label="Abertura: faixas (mínimo no mês:R$)" value={form.metas_abertura} onChange={e => setForm({ ...form, metas_abertura: e.target.value })} placeholder="0:20;5:25;10:30" />
          <Input label="Ativação: faixas (mínimo no mês:R$)" value={form.metas_ativacao} onChange={e => setForm({ ...form, metas_ativacao: e.target.value })} placeholder="0:100;3:120;6:140" />
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" onClick={salvar} loading={salvando}>Salvar regra</Button>
            <Button size="sm" variant="ghost" onClick={() => setNovo(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      <table className="tbl tbl-dense w-full">
        <thead><tr><th>Corretora</th><th>Vigência</th><th className="num col-p3">Prazo</th><th className="num col-p3">Reativação</th><th>Abertura</th><th>Ativação</th>{admin && <th><span className="sr-only">Ações</span></th>}</tr></thead>
        <tbody>
          {ordenadas.length === 0 && <tr><td colSpan={admin ? 7 : 6} className="py-4 text-center text-label text-fg-subtle">Nenhuma regra: nada é pago até cadastrar.</td></tr>}
          {ordenadas.map(r => (
            <tr key={r.id}>
              <td className="font-medium">{isCorretora(r.corretora) ? CORRETORA_LABEL[r.corretora] : r.corretora}</td>
              <td className="num">{dataPt(r.vigencia)}</td>
              <td className="num col-p3">{r.prazo_ativacao_dias} d</td>
              <td className="num col-p3">{r.reativacao_meses} m</td>
              <td className="whitespace-normal">{descreve(r.metas_abertura)}</td>
              <td className="whitespace-normal">{descreve(r.metas_ativacao)}</td>
              {admin && <td className="text-right"><IconButton tone="danger" aria-label="Excluir regra" onClick={() => excluir(r)}><Trash2 className="h-4 w-4" aria-hidden /></IconButton></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}
