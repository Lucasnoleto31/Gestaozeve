'use client'

// Lead ganho → cliente: assistente em etapas (corretora e situação → dados do cliente →
// comercial → revisão). No fim cria ou completa a ficha do cliente na corretora escolhida,
// fecha o lead como Ganho e liga os dois.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Field, Input, Select } from '@/components/ui/Input'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import { useToast } from '@/components/ui/Toast'
import { converterLeadEmCliente } from '@/lib/gestao/acoes'
import { numeroBR } from '@/lib/gestao/planilhas'
import { CORRETORA_LABEL, CORRETORA_SLUG, temListaPropria, type Corretora } from '@/lib/corretoras'
import type { AssessoresPorCorretora, LeadRow } from '@/lib/gestao/tipos'
import { cn } from '@/lib/utils'

const ETAPAS = ['Corretora', 'Cliente', 'Comercial', 'Revisão'] as const

// Linha da revisão (fora do componente: não remonta a cada render)
function Resumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-1.5 text-dense last:border-0">
      <span className="text-fg-muted">{rotulo}</span>
      <span className="text-right font-medium">{valor || '—'}</span>
    </div>
  )
}

// 'Genial' / 'XP' / 'BTG' do formulário → corretora do controle
function corretoraDoLead(v: string | null): Corretora | null {
  const t = (v ?? '').trim().toUpperCase()
  return t === 'GENIAL' || t === 'XP' || t === 'BTG' ? t : null
}

export function GanhoWizard({ lead, aberto, onClose, corretoras, responsaveis, assessores, hoje }: {
  lead: LeadRow
  aberto: boolean
  onClose: () => void
  corretoras: Corretora[]
  responsaveis: string[]
  assessores: AssessoresPorCorretora
  hoje: string
}) {
  const router = useRouter()
  const { avisar } = useToast()
  const [etapa, setEtapa] = useState(0)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [f, setF] = useState({
    corretora: (corretoraDoLead(lead.corretora) && corretoras.includes(corretoraDoLead(lead.corretora)!) ? corretoraDoLead(lead.corretora)! : corretoras[0]) as Corretora,
    status: 'Em processamento', data_entrada: hoje, data_migracao: '', conta: '',
    nome: lead.nome, documento: lead.cpf ?? '', telefone: lead.whatsapp ?? '', email: lead.email ?? '',
    responsavel: lead.responsavel && responsaveis.includes(lead.responsavel) ? lead.responsavel : (responsaveis[0] ?? ''),
    assessor: '', parceiro: lead.origem ?? '', corretagem: '0,25', observacoes: lead.observacoes ?? '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const listaPropria = temListaPropria(f.corretora)
  const label = CORRETORA_LABEL[f.corretora]

  const validar = (): string | null => {
    if (etapa === 1 && !f.nome.trim()) return 'Informe o nome do cliente'
    if (etapa === 1 && f.documento && ![11, 14].includes(f.documento.replace(/\D/g, '').length)) return 'CPF tem 11 dígitos e CNPJ tem 14'
    if (etapa === 0 && f.status === 'Migrado' && !f.data_migracao) return 'Informe a data de migração'
    return null
  }
  const avancar = () => {
    const e = validar()
    if (e) { setErro(e); return }
    setErro(null)
    setEtapa(n => Math.min(n + 1, ETAPAS.length - 1))
  }

  const concluir = async () => {
    setSalvando(true); setErro(null)
    const r = await converterLeadEmCliente(lead.id, f.corretora, {
      nome: f.nome, documento: f.documento || null, telefone: f.telefone || null, email: f.email || null,
      status: f.status, responsavel: f.responsavel || null, assessor: listaPropria ? null : (f.assessor || null), parceiro: f.parceiro || null,
      corretagem: f.corretagem.trim() === '' ? null : numeroBR(f.corretagem),
      data_entrada: f.data_entrada || null, data_migracao: f.status === 'Migrado' ? (f.data_migracao || null) : null,
      conta: f.conta || null, observacoes: f.observacoes || null, motivo_recusa: null,
    })
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: `Lead ganho · ${f.nome.trim()}`, detalhe: r.dados.novo ? `Cliente cadastrado na ${label}.` : `Já existia no cadastro (ligado pelo ${r.dados.casadoPor ?? 'cadastro'}); a ficha na ${label} foi completada.`, tom: 'gain' })
    onClose()
    if (r.dados.clienteId) router.push(`/${CORRETORA_SLUG[f.corretora]}/clientes/${r.dados.clienteId}`)
    else router.refresh()
  }

  return (
    <Modal open={aberto} onClose={onClose} size="lg" title={`Lead ganho · ${lead.nome}`} subtitle="Vamos montar a ficha do cliente. Depois disso os imports de lotes e de clientes cruzam com ele pelo CPF, telefone ou nome."
      footer={<>
        <Button variant="ghost" onClick={onClose} className="mr-auto">Cancelar</Button>
        {etapa > 0 && <Button variant="secondary" onClick={() => { setErro(null); setEtapa(etapa - 1) }}><ChevronLeft className="h-4 w-4" aria-hidden />Voltar</Button>}
        {etapa < ETAPAS.length - 1
          ? <Button onClick={avancar}>Avançar<ChevronRight className="h-4 w-4" aria-hidden /></Button>
          : <Button onClick={concluir} loading={salvando}><Check className="h-4 w-4" aria-hidden />Concluir e cadastrar</Button>}
      </>}>
      <ol className="mb-5 flex flex-wrap gap-x-5 gap-y-1 text-label" aria-label="Etapas">
        {ETAPAS.map((nome, i) => (
          <li key={nome} className={cn('inline-flex items-center gap-1.5', i === etapa ? 'text-fg' : i < etapa ? 'text-accent' : 'text-fg-subtle')}>
            <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full text-micro font-semibold', i === etapa ? 'bg-accent text-accent-fg' : i < etapa ? 'bg-accent-soft text-accent' : 'bg-surface-3')}>{i < etapa ? <Check className="h-3 w-3" aria-hidden /> : i + 1}</span>
            {nome}
          </li>
        ))}
      </ol>
      {erro && <Alert tone="danger" className="mb-3">{erro}</Alert>}

      {etapa === 0 && (
        <div className="space-y-4">
          <Field label="Corretora para onde o cliente vai">
            <div className="flex flex-wrap gap-2">
              {corretoras.map(c => (
                <button key={c} type="button" onClick={() => setF({ ...f, corretora: c, assessor: '' })}
                  className={cn('inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-dense', f.corretora === c ? 'border-accent bg-accent-soft text-fg' : 'border-line-strong bg-surface text-fg-muted hover:bg-surface-2')}
                  aria-pressed={f.corretora === c}>
                  <CorretoraBadge corretora={c} />
                </button>
              ))}
            </div>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Situação" value={f.status} onChange={set('status')} hint="Em processamento até a conta ser aberta">
              <option value="Em processamento">Em processamento</option>
              <option value="Migrado">Migrado (conta já aberta)</option>
            </Select>
            <Input label={`Conta na ${label}`} value={f.conta} onChange={set('conta')} inputMode="numeric" hint="Se já souber; senão vem do export ou dos lotes" />
            <Input label="Data de entrada" type="date" value={f.data_entrada} onChange={set('data_entrada')} hint="Quando foi levado para a corretora" />
            {f.status === 'Migrado' && <Input label="Data de migração" type="date" value={f.data_migracao} onChange={set('data_migracao')} />}
          </div>
        </div>
      )}

      {etapa === 1 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Nome" value={f.nome} onChange={set('nome')} required className="sm:col-span-2" />
          <Input label="CPF/CNPJ" value={f.documento} onChange={set('documento')} inputMode="numeric" hint="É o que liga os lotes e o export ao cliente" />
          <Input label="Telefone" value={f.telefone} onChange={set('telefone')} inputMode="tel" />
          <Input label="E-mail" type="email" value={f.email} onChange={set('email')} className="sm:col-span-2" />
        </div>
      )}

      {etapa === 2 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Responsável" value={f.responsavel} onChange={set('responsavel')} hint="Quem cuida do cliente no escritório">
            <option value="">—</option>
            {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
          </Select>
          {listaPropria
            ? <Input label="Corretagem (R$/lote)" value={f.corretagem} onChange={set('corretagem')} inputMode="decimal" hint="Vira a tarifa inicial do cliente" />
            : <Select label={`Assessor na ${label}`} value={f.assessor} onChange={set('assessor')} hint="Vale até a conta aparecer no export">
                <option value="">—</option>
                {assessores[f.corretora].map(a => <option key={a} value={a}>{a}</option>)}
              </Select>}
          {!listaPropria && <Input label="Corretagem (R$/lote)" value={f.corretagem} onChange={set('corretagem')} inputMode="decimal" hint="Vazio usa a tarifa do assessor" />}
          <Input label="Parceiro / origem" value={f.parceiro} onChange={set('parceiro')} placeholder="Direto, Instagram, indicação…" />
          <Field label="Observações" className="sm:col-span-2">
            <textarea rows={3} value={f.observacoes} onChange={set('observacoes')} />
          </Field>
        </div>
      )}

      {etapa === 3 && (
        <div>
          <Resumo rotulo="Corretora" valor={label} />
          <Resumo rotulo="Situação" valor={f.status} />
          {f.status === 'Migrado' && <Resumo rotulo="Data de migração" valor={f.data_migracao} />}
          <Resumo rotulo="Data de entrada" valor={f.data_entrada} />
          <Resumo rotulo="Conta" valor={f.conta} />
          <Resumo rotulo="Nome" valor={f.nome} />
          <Resumo rotulo="CPF/CNPJ" valor={f.documento} />
          <Resumo rotulo="Telefone" valor={f.telefone} />
          <Resumo rotulo="E-mail" valor={f.email} />
          <Resumo rotulo="Responsável" valor={f.responsavel} />
          {!listaPropria && <Resumo rotulo="Assessor" valor={f.assessor} />}
          <Resumo rotulo="Corretagem" valor={f.corretagem ? `R$ ${f.corretagem}/lote` : (listaPropria ? '' : 'tarifa do assessor')} />
          <Resumo rotulo="Parceiro" valor={f.parceiro} />
          <p className="mt-4 text-label text-fg-muted">O lead passa para Ganho com fechamento hoje e fica ligado à ficha do cliente.</p>
        </div>
      )}
    </Modal>
  )
}
