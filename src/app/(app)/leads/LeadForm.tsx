'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Field, Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { excluirLead, salvarLead } from '@/lib/gestao/acoes'
import type { LeadCampos, LeadRow, StatusLead } from '@/lib/gestao/tipos'

const CORRETORAS_OPERA = ['Genial', 'XP', 'BTG', 'Toro', 'Outra']
const JA_OPERA = ['Sim, já opero', 'Estou começando agora', 'Já operei e parei']

export function LeadForm({ lead, aberto, onClose, responsaveis, status, admin }: {
  lead: LeadRow | null
  aberto: boolean
  onClose: () => void
  responsaveis: string[]
  status: StatusLead[]
  admin: boolean
}) {
  const router = useRouter()
  const { avisar } = useToast()
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [f, setF] = useState<LeadCampos>(() => ({
    nome: lead?.nome ?? '', whatsapp: lead?.whatsapp ?? '', cpf: lead?.cpf ?? '', email: lead?.email ?? '', ja_opera: lead?.ja_opera ?? '', corretora: lead?.corretora ?? '',
    origem: lead?.origem ?? '', responsavel: lead?.responsavel ?? '', status: lead?.status ?? 'Novo', ultimo_contato: lead?.ultimo_contato ?? '',
    data_fechamento: lead?.data_fechamento ?? '', motivo_perda: lead?.motivo_perda ?? '', observacoes: lead?.observacoes ?? '',
  }))
  const set = (k: keyof LeadCampos, v: string) => setF(x => ({ ...x, [k]: v }))
  const fechado = status.find(s => s.status === f.status)?.tipo === 'Fechado'

  const salvar = async () => {
    setSalvando(true); setErro(null)
    const r = await salvarLead(lead?.id ?? null, f)
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: lead ? 'Lead atualizado' : 'Lead criado', detalhe: f.nome, tom: 'gain' })
    onClose()
    router.refresh()
  }
  const excluir = async () => {
    if (!lead || !confirm(`Excluir o lead ${lead.nome}?`)) return
    const r = await excluirLead(lead.id)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: 'Lead excluído', detalhe: lead.nome, tom: 'neutral' })
    onClose()
    router.refresh()
  }

  return (
    <Modal open={aberto} onClose={onClose} size="xl" title={lead ? lead.nome : 'Novo lead'} subtitle={lead ? `Recebido em ${new Date(lead.data_hora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}${lead.cliente_nome ? ` · já é cliente: ${lead.cliente_nome}` : ''}` : 'Cadastro manual (fora do formulário)'}
      footer={<>
        {lead && admin && <Button variant="ghost" onClick={excluir} className="mr-auto text-loss hover:text-loss"><Trash2 className="h-4 w-4" aria-hidden />Excluir</Button>}
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={salvar} loading={salvando}>Salvar</Button>
      </>}>
      <div className="space-y-6">
        {erro && <Alert tone="loss">{erro}</Alert>}
        <div>
          <p className="label mb-3">Dados do formulário</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Nome" value={f.nome} onChange={e => set('nome', e.target.value)} className="sm:col-span-2" />
            <Input label="WhatsApp" value={f.whatsapp ?? ''} onChange={e => set('whatsapp', e.target.value)} />
            <Input label="CPF" value={f.cpf ?? ''} onChange={e => set('cpf', e.target.value)} />
            <Input label="E-mail" value={f.email ?? ''} onChange={e => set('email', e.target.value)} />
            <Field label="Já opera?">
              <select value={f.ja_opera ?? ''} onChange={e => set('ja_opera', e.target.value)}>
                <option value="">—</option>{JA_OPERA.map(o => <option key={o}>{o}</option>)}{f.ja_opera && !JA_OPERA.includes(f.ja_opera) && <option>{f.ja_opera}</option>}
              </select>
            </Field>
            <Field label="Corretora onde já opera">
              <select value={f.corretora ?? ''} onChange={e => set('corretora', e.target.value)}>
                <option value="">—</option>{CORRETORAS_OPERA.map(o => <option key={o}>{o}</option>)}{f.corretora && !CORRETORAS_OPERA.includes(f.corretora) && <option>{f.corretora}</option>}
              </select>
            </Field>
          </div>
        </div>
        <div>
          <p className="label mb-3">Acompanhamento da equipe</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Origem / parceiro" value={f.origem ?? ''} onChange={e => set('origem', e.target.value)} placeholder="Instagram, Aikon, indicação…" />
            <Field label="Responsável">
              <select value={f.responsavel ?? ''} onChange={e => set('responsavel', e.target.value)}>
                <option value="">—</option>{responsaveis.map(r => <option key={r}>{r}</option>)}{f.responsavel && !responsaveis.includes(f.responsavel) && <option>{f.responsavel}</option>}
              </select>
            </Field>
            <Field label="Status">
              <select value={f.status} onChange={e => set('status', e.target.value)}>
                {status.map(s => <option key={s.status}>{s.status}</option>)}{!status.some(s => s.status === f.status) && <option>{f.status}</option>}
              </select>
            </Field>
            <Input label="Último contato" type="date" value={f.ultimo_contato ?? ''} onChange={e => set('ultimo_contato', e.target.value)} />
            <Input label="Data do fechamento" type="date" value={f.data_fechamento ?? ''} onChange={e => set('data_fechamento', e.target.value)} hint={fechado && !f.data_fechamento ? 'Preencha para o funil contar o fechamento no mês certo' : undefined} />
            <Input label="Motivo da perda" value={f.motivo_perda ?? ''} onChange={e => set('motivo_perda', e.target.value)} />
            <Field label="Observações" className="sm:col-span-2">
              <textarea rows={3} value={f.observacoes ?? ''} onChange={e => set('observacoes', e.target.value)} />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  )
}
