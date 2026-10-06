'use client'

// Cadastro manual de um cliente (corretoras com lista própria, ex.: BTG). Mesmos campos da
// lista de clientes; passa pela rotina da importação, então quem já existe é completado.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { Field, Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { criarCliente } from '@/lib/gestao/acoes'
import { numeroBR } from '@/lib/gestao/planilhas'
import { CORRETORA_LABEL, type Corretora } from '@/lib/corretoras'

export function NovoClienteButton({ corretora, base, responsaveis, hoje }: { corretora: Corretora; base: string; responsaveis: string[]; hoje: string }) {
  const router = useRouter()
  const { avisar } = useToast()
  const vazio = {
    nome: '', documento: '', telefone: '', email: '', status: 'Em processamento', responsavel: responsaveis[0] ?? '', parceiro: '',
    corretagem: '0,25', data_entrada: hoje, data_migracao: '', conta: '', observacoes: '', motivo_recusa: '',
  }
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [f, setF] = useState(vazio)
  const campo = (k: keyof typeof vazio) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true); setErro(null)
    const r = await criarCliente(corretora, {
      nome: f.nome, documento: f.documento || null, telefone: f.telefone || null, email: f.email || null,
      status: f.status || null, responsavel: f.responsavel || null, parceiro: f.parceiro || null,
      corretagem: f.corretagem.trim() === '' ? null : numeroBR(f.corretagem),
      data_entrada: f.data_entrada || null, data_migracao: f.data_migracao || null, conta: f.conta || null,
      observacoes: f.observacoes || null, motivo_recusa: f.motivo_recusa || null,
    })
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    avisar(r.dados.novo
      ? { titulo: 'Cliente cadastrado', detalhe: f.nome.trim(), tom: 'gain' }
      : { titulo: 'Cliente já existia', detalhe: `Ligado pelo ${r.dados.casadoPor ?? 'cadastro'}; os campos informados foram completados.`, tom: 'neutral' })
    setAberto(false)
    setF(vazio)
    if (r.dados.clienteId) router.push(`${base}/clientes/${r.dados.clienteId}`)
    else router.refresh()
  }

  return (
    <>
      <Button size="sm" onClick={() => setAberto(true)}><Plus className="h-4 w-4" aria-hidden />Novo cliente</Button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Novo cliente" subtitle={`Cliente levado para a ${CORRETORA_LABEL[corretora]}. Se o CPF, a conta, o telefone ou o nome já existirem, o cadastro é completado em vez de duplicado.`} size="lg"
        footer={<><Button variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button><Button type="submit" form="form-novo-cliente" loading={salvando}>Cadastrar</Button></>}>
        <form id="form-novo-cliente" onSubmit={salvar} className="space-y-4">
          {erro && <Alert tone="danger">{erro}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input id="nc-nome" label="Nome" value={f.nome} onChange={campo('nome')} required autoFocus className="sm:col-span-2" />
            <Input id="nc-doc" label="CPF/CNPJ" value={f.documento} onChange={campo('documento')} inputMode="numeric" hint="Liga os lotes do relatório ao cliente" />
            <Input id="nc-tel" label="Telefone" value={f.telefone} onChange={campo('telefone')} inputMode="tel" placeholder="DDD + número" />
            <Select id="nc-status" label="Status" value={f.status} onChange={campo('status')}>
              <option value="Em processamento">Em processamento</option>
              <option value="Migrado">Migrado</option>
              <option value="Recusou">Recusou</option>
            </Select>
            <Select id="nc-resp" label="Responsável" value={f.responsavel} onChange={campo('responsavel')}>
              <option value="">—</option>
              {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
            <Input id="nc-entrada" label="Data de entrada" type="date" value={f.data_entrada} onChange={campo('data_entrada')} />
            <Input id="nc-migracao" label="Data de migração" type="date" value={f.data_migracao} onChange={campo('data_migracao')} hint="Só para status Migrado" />
            <Input id="nc-corretagem" label="Corretagem (R$/lote)" value={f.corretagem} onChange={campo('corretagem')} inputMode="decimal" hint="Vira a tarifa inicial do cliente" />
            <Input id="nc-conta" label={`Conta ${CORRETORA_LABEL[corretora]}`} value={f.conta} onChange={campo('conta')} inputMode="numeric" hint="Se já souber; senão vem do relatório de lotes" />
            <Input id="nc-parceiro" label="Parceiro" value={f.parceiro} onChange={campo('parceiro')} placeholder="Direto, Atual Capital…" />
            <Input id="nc-email" label="E-mail" type="email" value={f.email} onChange={campo('email')} />
            <Field label="Observações" className="sm:col-span-2">
              <textarea id="nc-obs" rows={2} value={f.observacoes} onChange={campo('observacoes')} />
            </Field>
            {f.status === 'Recusou' && <Input id="nc-recusa" label="Motivo da recusa" value={f.motivo_recusa} onChange={campo('motivo_recusa')} className="sm:col-span-2" />}
          </div>
        </form>
      </Modal>
    </>
  )
}
