'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { Field, Input, Select } from '@/components/ui/Input'
import { salvarCadastroCliente, salvarCamposCliente } from '@/lib/gestao/acoes'
import { temListaPropria, termosDaCorretora, type Corretora } from '@/lib/corretoras'
import type { ClienteCadastro } from '@/lib/gestao/tipos'

type Manuais = { data_entrada: string | null; parceiro: string | null; observacoes: string | null; motivo_recusa: string | null }
// Status manual (vazio = automático), responsável interno e data de migração manual
type Manual = { status: string | null; responsavel: string | null; data_migracao: string | null }

export function FichaEditavel({ corretora, clienteId, admin, cadastro, manuais, manual, responsaveis, statusAutomatico }: {
  corretora: Corretora
  clienteId: string
  admin: boolean
  cadastro: ClienteCadastro
  manuais: Manuais
  manual: Manual
  responsaveis: string[]
  statusAutomatico: string | null   // status que vale quando não há manual (pela conta da corretora)
}) {
  const router = useRouter()
  const termos = termosDaCorretora(corretora)
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [m, setM] = useState({
    data_entrada: manuais.data_entrada ?? '', parceiro: manuais.parceiro ?? '', observacoes: manuais.observacoes ?? '', motivo_recusa: manuais.motivo_recusa ?? '',
    status: manual.status ?? '', responsavel: manual.responsavel ?? '', data_migracao: manual.data_migracao ?? '',
  })
  const [c, setC] = useState({ nome: cadastro.nome, documento: cadastro.documento ?? '', telefone: cadastro.telefone ?? '', email: cadastro.email ?? '' })
  const opcoesResponsavel = [...new Set([...responsaveis, ...(manual.responsavel ? [manual.responsavel] : [])])]

  const salvar = async () => {
    setSalvando(true); setErro(null)
    const r1 = await salvarCamposCliente(corretora, clienteId, {
      data_entrada: m.data_entrada || null, parceiro: m.parceiro, observacoes: m.observacoes, motivo_recusa: m.motivo_recusa,
      status: m.status || null, responsavel: m.responsavel || null, data_migracao: m.data_migracao || null,
    })
    if (!r1.ok) { setErro(r1.erro); setSalvando(false); return }
    if (admin) {
      const r2 = await salvarCadastroCliente(clienteId, { nome: c.nome, documento: c.documento || null, telefone: c.telefone || null, email: c.email || null })
      if (!r2.ok) { setErro(r2.erro); setSalvando(false); return }
    }
    setSalvando(false)
    setAberto(false)
    router.refresh()
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setAberto(true)}><Pencil className="h-3.5 w-3.5" />Editar</Button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Editar cliente" subtitle="Status, responsável e campos manuais do controle (e, para o administrador, o cadastro básico)." size="lg"
        footer={<><Button variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button><Button onClick={salvar} loading={salvando}>Salvar</Button></>}>
        <div className="space-y-4">
          {erro && <Alert tone="danger">{erro}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Status" value={m.status} onChange={e => setM({ ...m, status: e.target.value })}
              hint={temListaPropria(corretora) ? 'Vem da lista de clientes; aqui você muda na hora' : 'Vazio segue a situação da conta no export da corretora'}>
              <option value="">{statusAutomatico ? `Automático · ${statusAutomatico}` : 'Automático'}</option>
              <option value="Migrado">Migrado</option>
              <option value="Em processamento">Em processamento</option>
              <option value="Recusou">Recusou</option>
            </Select>
            <Select label={termos.assessor === 'Responsável' ? 'Responsável' : 'Responsável interno'} value={m.responsavel} onChange={e => setM({ ...m, responsavel: e.target.value })}
              hint={temListaPropria(corretora) ? 'Quem cuida do cliente; os lotes seguem o responsável' : 'Vazio usa o responsável do assessor'}>
              <option value="">—</option>
              {opcoesResponsavel.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
            <Input label="Data de migração" type="date" value={m.data_migracao} onChange={e => setM({ ...m, data_migracao: e.target.value })} hint="Só conta com status Migrado" />
            <Input label="Data de entrada" type="date" value={m.data_entrada} onChange={e => setM({ ...m, data_entrada: e.target.value })} hint="Quando o cliente foi levado para a corretora" />
            <Input label="Parceiro" value={m.parceiro} onChange={e => setM({ ...m, parceiro: e.target.value })} placeholder="Direto, Aikon…" />
            <Input label="Motivo da recusa" value={m.motivo_recusa} onChange={e => setM({ ...m, motivo_recusa: e.target.value })} />
            <Field label="Observações" className="sm:col-span-2">
              <textarea rows={3} value={m.observacoes} onChange={e => setM({ ...m, observacoes: e.target.value })} />
            </Field>
          </div>
          {admin && (
            <div className="border-t border-line pt-4">
              <p className="label mb-3">Cadastro básico (administrador)</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Nome" value={c.nome} onChange={e => setC({ ...c, nome: e.target.value })} className="sm:col-span-2" />
                <Input label="CPF/CNPJ" value={c.documento} onChange={e => setC({ ...c, documento: e.target.value })} hint="Só dígitos; usado para juntar contas e cruzar leads" />
                <Input label="Telefone" value={c.telefone} onChange={e => setC({ ...c, telefone: e.target.value })} />
                <Input label="E-mail" type="email" value={c.email} onChange={e => setC({ ...c, email: e.target.value })} className="sm:col-span-2" />
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
