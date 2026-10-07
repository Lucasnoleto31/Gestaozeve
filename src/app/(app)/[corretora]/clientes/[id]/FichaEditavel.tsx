'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { Field, Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { salvarCadastroCliente, salvarCamposCliente, salvarContasCliente, unificarClientes } from '@/lib/gestao/acoes'
import { CORRETORA_LABEL, CORRETORA_SLUG, isCorretora, temListaPropria, termosDaCorretora, type Corretora } from '@/lib/corretoras'
import type { ClienteCadastro, ClienteDuplicado } from '@/lib/gestao/tipos'

type Manuais = { data_entrada: string | null; parceiro: string | null; observacoes: string | null; motivo_recusa: string | null }
// Status manual (vazio = automático), responsável interno, assessor informado à mão e data de migração manual
type Manual = { status: string | null; responsavel: string | null; assessor: string | null; data_migracao: string | null }

export function FichaEditavel({ corretora, clienteId, admin, cadastro, manuais, manual, contas: contasIniciais, responsaveis, assessores, statusAutomatico, temConta, abrirInicial = false }: {
  corretora: Corretora
  clienteId: string
  admin: boolean
  cadastro: ClienteCadastro
  manuais: Manuais
  manual: Manual
  contas: { id: string; conta: string }[]   // contas do cliente nesta corretora (editáveis, até 10)
  responsaveis: string[]
  assessores: string[]              // assessores cadastrados na corretora
  statusAutomatico: string | null   // status que vale quando não há manual (pela conta da corretora)
  temConta: boolean                 // com conta no export, o assessor vem de lá
  abrirInicial?: boolean            // abre já editando (link "editar" da lista, ?editar=1)
}) {
  const router = useRouter()
  const { avisar } = useToast()
  const termos = termosDaCorretora(corretora)
  const listaPropria = temListaPropria(corretora)
  const [aberto, setAberto] = useState(abrirInicial)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // Outro cadastro que já tem o CPF/CNPJ digitado: dá para unificar os dois daqui
  const [duplicado, setDuplicado] = useState<ClienteDuplicado | null>(null)
  const [unificando, setUnificando] = useState(false)
  const [m, setM] = useState({
    data_entrada: manuais.data_entrada ?? '', parceiro: manuais.parceiro ?? '', observacoes: manuais.observacoes ?? '', motivo_recusa: manuais.motivo_recusa ?? '',
    status: manual.status ?? '', responsavel: manual.responsavel ?? '', assessor: manual.assessor ?? '', data_migracao: manual.data_migracao ?? '',
  })
  const [c, setC] = useState({ nome: cadastro.nome, documento: cadastro.documento ?? '', telefone: cadastro.telefone ?? '', email: cadastro.email ?? '' })
  const [contas, setContas] = useState<string[]>(contasIniciais.map(x => x.conta))
  const chaveContas = (xs: string[]) => [...new Set(xs.map(x => x.replace(/\D/g, '')).filter(Boolean))].sort().join(',')
  const opcoesResponsavel = [...new Set([...responsaveis, ...(manual.responsavel ? [manual.responsavel] : [])])]
  const opcoesAssessor = [...new Set([...assessores, ...(manual.assessor ? [manual.assessor] : [])])]

  // Ao fechar, tira o ?editar=1 da URL para não reabrir numa atualização
  const fechar = () => {
    setAberto(false)
    if (abrirInicial) router.replace(window.location.pathname)
  }

  const cadastro_ = () => ({ nome: c.nome, documento: c.documento || null, telefone: c.telefone || null, email: c.email || null })
  const unificar = async () => {
    if (!duplicado) return
    setUnificando(true); setErro(null)
    const r = await unificarClientes(clienteId, duplicado.id)
    if (!r.ok) { setErro(r.erro); setUnificando(false); return }
    avisar({ titulo: 'Cadastros unificados', detalhe: `${duplicado.nome} foi juntado a este cliente: ${r.dados.contas} conta(s), ${r.dados.lotes} lançamento(s) e ${r.dados.leads} lead(s).`, tom: 'gain' })
    setDuplicado(null)
    // agora o CPF está livre: salva o cadastro que tinha ficado pendente
    const r2 = await salvarCadastroCliente(clienteId, cadastro_())
    setUnificando(false)
    if (!r2.ok) { setErro(r2.erro); return }
    fechar()
    router.refresh()
  }

  const salvar = async () => {
    setSalvando(true); setErro(null); setDuplicado(null)
    const r1 = await salvarCamposCliente(corretora, clienteId, {
      data_entrada: m.data_entrada || null, parceiro: m.parceiro, observacoes: m.observacoes, motivo_recusa: m.motivo_recusa,
      status: m.status || null, responsavel: m.responsavel || null, data_migracao: m.data_migracao || null,
      ...(listaPropria ? {} : { assessor: m.assessor || null }),
    })
    if (!r1.ok) { setErro(r1.erro); setSalvando(false); return }
    if (chaveContas(contas) !== chaveContas(contasIniciais.map(x => x.conta))) {
      const rc = await salvarContasCliente(corretora, clienteId, contas)
      if (!rc.ok) { setErro(rc.erro); setSalvando(false); return }
    }
    if (admin) {
      const r2 = await salvarCadastroCliente(clienteId, cadastro_())
      if (!r2.ok) { setErro(r2.erro); setDuplicado('duplicado' in r2 ? r2.duplicado : null); setSalvando(false); return }
    }
    setSalvando(false)
    fechar()
    router.refresh()
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setAberto(true)}><Pencil className="h-3.5 w-3.5" />Editar</Button>
      <Modal open={aberto} onClose={fechar} title="Editar cliente" subtitle="Status, responsável e campos manuais do controle (e, para o administrador, o cadastro básico)." size="lg"
        footer={<><Button variant="secondary" onClick={fechar}>Cancelar</Button><Button onClick={salvar} loading={salvando}>Salvar</Button></>}>
        <div className="space-y-4">
          {erro && (
            <Alert tone="danger">
              {erro}
              {duplicado && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Link href={`/${CORRETORA_SLUG[isCorretora(duplicado.corretora) ? duplicado.corretora : corretora]}/clientes/${duplicado.id}`} className="link text-label" target="_blank">abrir a ficha de {duplicado.nome}</Link>
                  <Button size="sm" variant="danger" onClick={unificar} loading={unificando}>Unificar: trazer o cadastro de {duplicado.nome} para este</Button>
                </div>
              )}
            </Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Status" value={m.status} onChange={e => setM({ ...m, status: e.target.value })}
              hint={listaPropria ? 'Vem da lista de clientes; aqui você muda na hora' : 'Vazio segue a situação da conta no export da corretora'}>
              <option value="">{statusAutomatico ? `Automático · ${statusAutomatico}` : 'Automático'}</option>
              <option value="Migrado">Migrado</option>
              <option value="Em processamento">Em processamento</option>
              <option value="Recusou">Recusou</option>
            </Select>
            <Select label={termos.assessor === 'Responsável' ? 'Responsável' : 'Responsável interno'} value={m.responsavel} onChange={e => setM({ ...m, responsavel: e.target.value })}
              hint={listaPropria ? 'Quem cuida do cliente; os lotes seguem o responsável' : 'Vazio usa o responsável do assessor'}>
              <option value="">—</option>
              {opcoesResponsavel.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
            {!listaPropria && (
              <Select label={`Assessor na ${CORRETORA_LABEL[corretora]}`} value={m.assessor} onChange={e => setM({ ...m, assessor: e.target.value })}
                hint={temConta ? 'A conta no export já define o assessor; este só vale sem conta' : 'Vale até a conta aparecer no export'}>
                <option value="">—</option>
                {opcoesAssessor.map(a => <option key={a} value={a}>{a}</option>)}
              </Select>
            )}
            <Input label="Data de migração" type="date" value={m.data_migracao} onChange={e => setM({ ...m, data_migracao: e.target.value })} hint="Só conta com status Migrado" />
            <Input label="Data de entrada" type="date" value={m.data_entrada} onChange={e => setM({ ...m, data_entrada: e.target.value })} hint="Quando o cliente foi levado para a corretora" />
            <Input label="Parceiro" value={m.parceiro} onChange={e => setM({ ...m, parceiro: e.target.value })} placeholder="Direto, Aikon…" />
            <Input label="Motivo da recusa" value={m.motivo_recusa} onChange={e => setM({ ...m, motivo_recusa: e.target.value })} />
            <Field label="Observações" className="sm:col-span-2">
              <textarea rows={3} value={m.observacoes} onChange={e => setM({ ...m, observacoes: e.target.value })} />
            </Field>
          </div>
          <div className="border-t border-line pt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="label">Contas na {CORRETORA_LABEL[corretora]}</p>
              {contas.length < 10 && (
                <Button variant="secondary" size="sm" onClick={() => setContas([...contas, ''])}><Plus className="h-3.5 w-3.5" aria-hidden />Adicionar conta</Button>
              )}
            </div>
            {contas.length === 0 && <p className="mb-2 text-micro text-fg-subtle">Nenhuma conta ainda. Os lotes importados criam a conta sozinhos; aqui dá para incluir antes.</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              {contas.map((n, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="field-sm flex-1 tabular-nums" value={n} inputMode="numeric" placeholder="Número da conta" aria-label={`Conta ${i + 1}`}
                    onChange={e => setContas(contas.map((x, j) => (j === i ? e.target.value : x)))} />
                  <IconButton tone="danger" title="Tirar conta" aria-label={`Tirar conta ${n || i + 1}`} onClick={() => setContas(contas.filter((_, j) => j !== i))}><X className="h-4 w-4" aria-hidden /></IconButton>
                </div>
              ))}
            </div>
            <p className="mt-2 text-micro text-fg-subtle">Até 10 contas. Tirar uma conta desliga os lotes dela deste cliente; se o número já for de outro cliente, avisamos.</p>
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
