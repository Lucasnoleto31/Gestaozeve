'use client'

// Ficha do lead. Refeita em 17/11/2026 (Lucas: "essas duas fichas estão confusas"): abre com uma frase
// dizendo em que pé o lead está e o primeiro bloco é o atendimento, que é o que se faz todo dia (status,
// responsável, registrar contato e histórico). Origem / parceiro vira lista (SelectOrigem) e o motivo da
// perda também (MotivoPerda). Os dados do formulário ficam recolhidos em uma linha; a data do fechamento e o
// motivo da perda só aparecem quando o lead está fechado ou já têm valor. O campo "Último contato" saiu: a
// data vem do histórico de contatos. Não mudam os botões "Registrar contato" e "Salvar" nem o que cada um
// grava (a tela é usada por automações diárias).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Trophy } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Field, Input } from '@/components/ui/Input'
import { Recolhido } from '@/components/ui/Recolhido'
import { useToast } from '@/components/ui/Toast'
import { SelectOrigem } from '@/components/gestao/SelectOrigem'
import { MotivoPerda } from '@/components/gestao/MotivoPerda'
import { dataCurta } from '@/components/gestao/Celulas'
import { excluirLead, salvarLead } from '@/lib/gestao/acoes'
import { retornoDoLead } from '@/lib/gestao/acoesLead'
import { linkTelefone } from '@/lib/gestao/fila'
import { OPCOES_ORIGEM_VAZIAS, type OpcoesOrigem } from '@/lib/gestao/origens'
import type { LeadCampos, LeadRow, StatusLead } from '@/lib/gestao/tipos'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum } from '@/lib/format'
import { mesmaPessoa } from '@/lib/texto'
import { ContatosLead } from './ContatosLead'

const CORRETORAS_OPERA = ['Genial', 'XP', 'BTG', 'Toro', 'Outra']
const JA_OPERA = ['Sim, já opero', 'Estou começando agora', 'Já operei e parei']
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

export function LeadForm({ lead, aberto, onClose, responsaveis, status, admin, usuario, opcoesOrigem = OPCOES_ORIGEM_VAZIAS, onGanhar }: {
  lead: LeadRow | null
  aberto: boolean
  onClose: () => void
  responsaveis: string[]
  status: StatusLead[]
  admin: boolean
  usuario?: string
  opcoesOrigem?: OpcoesOrigem   // parceiros e origens em uso, para o campo Origem / parceiro
  onGanhar?: () => void         // abre a ficha de ganho deste lead (a lista fecha esta ficha e abre a outra)
}) {
  const router = useRouter()
  const { avisar } = useToast()
  const hoje = fmtDate(hojeBrasil())
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [f, setF] = useState<LeadCampos>(() => ({
    nome: lead?.nome ?? '', whatsapp: lead?.whatsapp ?? '', cpf: lead?.cpf ?? '', email: lead?.email ?? '', ja_opera: lead?.ja_opera ?? '', corretora: lead?.corretora ?? '',
    origem: lead?.origem ?? '', responsavel: lead?.responsavel ?? '', status: lead?.status ?? 'Novo', ultimo_contato: lead?.ultimo_contato ?? '',
    data_fechamento: lead?.data_fechamento ?? '', motivo_perda: lead?.motivo_perda ?? '', observacoes: lead?.observacoes ?? '',
  }))
  const set = (k: keyof LeadCampos, v: string) => setF(x => ({ ...x, [k]: v }))
  const tipoDe = (s: string) => status.find(x => x.status === s)?.tipo
  const fechado = tipoDe(f.status) === 'Fechado'

  // O que a frase do topo conta é o que está gravado: o status só acompanha o registro de contato (Novo vira
  // Em contato), não o que foi mexido no formulário e ainda não foi salvo
  const [statusSalvo, setStatusSalvo] = useState(lead?.status ?? 'Novo')
  const [contatos, setContatos] = useState(lead?.contatos ?? 0)
  const [retorno, setRetorno] = useState<string | null | undefined>(undefined)   // undefined = ainda lendo
  const leadId = lead?.id ?? null
  useEffect(() => {
    if (!leadId) return
    let ativo = true
    retornoDoLead(leadId).then(r => { if (ativo) setRetorno(r.ok ? r.dados : null) })
    return () => { ativo = false }
  }, [leadId])
  const relerRetorno = () => { if (leadId) void retornoDoLead(leadId).then(r => setRetorno(r.ok ? r.dados : null)) }

  // Fechar o lead já propõe a data de hoje (o funil conta o fechamento pelo dia); voltar para uma etapa em
  // aberto devolve a data que estava gravada
  const mudarStatus = (v: string) => setF(x => ({
    ...x, status: v,
    data_fechamento: tipoDe(v) === 'Fechado' ? (x.data_fechamento || hoje) : (lead?.data_fechamento ?? ''),
  }))

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

  // ── A frase do topo: em que pé o lead está ──
  const aberto_ = tipoDe(statusSalvo) !== 'Fechado'
  const meu = !!lead && mesmaPessoa(lead.responsavel, usuario)
  const frase = lead ? [
    statusSalvo,
    lead.responsavel ? `${meu ? 'você' : lead.responsavel} ${aberto_ ? 'atende' : 'atendeu'}` : 'sem responsável',
    contatos > 0 ? `${fmtNum(contatos)} ${contatos === 1 ? 'contato' : 'contatos'}${f.ultimo_contato ? `, o último em ${dataCurta(f.ultimo_contato)}` : ''}` : 'nenhum contato registrado',
    aberto_ && retorno !== undefined ? (retorno ? `retorno marcado para ${dataCurta(retorno)}` : 'sem retorno marcado') : null,
    `recebido em ${quando(lead.data_hora)}`,
    lead.cliente_nome ? `já é cliente: ${lead.cliente_nome}` : null,
  ].filter(Boolean).join(' · ') : 'Cadastro manual (fora do formulário)'

  const ganhoSemCliente = f.status === 'Ganho' && !lead?.cliente_id
  const mostraFechamento = fechado || !!f.data_fechamento
  const mostraMotivo = f.status === 'Perdido' || !!(f.motivo_perda ?? '').trim()
  const telefone = linkTelefone(lead?.whatsapp)
  const opera = f.corretora ? (f.corretora === 'Outra' ? 'opera em outra corretora' : `opera na ${f.corretora}`) : (f.ja_opera || null)
  const resumoDados = [f.whatsapp || 'sem telefone', f.cpf ? `CPF ${f.cpf}` : 'sem CPF', f.email || 'sem e-mail', opera].filter(Boolean).join(' · ')

  const dados = (
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
  )

  const atendimento = (
    <div>
      <p className="label mb-3">Atendimento</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status">
          <select value={f.status} onChange={e => mudarStatus(e.target.value)}>
            {status.map(s => <option key={s.status}>{s.status}</option>)}{!status.some(s => s.status === f.status) && <option>{f.status}</option>}
          </select>
        </Field>
        <Field label="Responsável">
          <select value={f.responsavel ?? ''} onChange={e => set('responsavel', e.target.value)}>
            <option value="">—</option>{responsaveis.map(r => <option key={r}>{r}</option>)}{f.responsavel && !responsaveis.includes(f.responsavel) && <option>{f.responsavel}</option>}
          </select>
        </Field>
        {mostraFechamento && (
          <Input label="Data do fechamento" type="date" value={f.data_fechamento ?? ''} onChange={e => set('data_fechamento', e.target.value)}
            hint={fechado && !f.data_fechamento ? 'Preencha para o funil contar o fechamento no mês certo' : undefined} />
        )}
        {mostraMotivo && (
          <MotivoPerda valor={f.motivo_perda ?? ''} onChange={v => set('motivo_perda', v)}
            hint={f.status === 'Perdido' && !(f.motivo_perda ?? '').trim() ? 'Escolha o motivo: ele aparece no funil' : undefined} />
        )}
      </div>
      {ganhoSemCliente && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-surface-2 px-3 py-2.5 text-dense text-fg-muted">
          <span className="min-w-0 flex-1">Ganho se marca pela ficha de ganho: ela cadastra o cliente na corretora e liga ao lead.{lead && onGanhar ? ' O que você mudou aqui e não salvou se perde.' : ' Salve com outro status e use o troféu na lista.'}</span>
          {lead && onGanhar && <Button size="sm" variant="secondary" onClick={onGanhar}><Trophy className="h-4 w-4" aria-hidden />Abrir ficha de ganho</Button>}
        </div>
      )}
    </div>
  )

  return (
    <Modal open={aberto} onClose={onClose} size="xl" title={lead ? lead.nome : 'Novo lead'} subtitle={frase}
      footer={<>
        {lead && admin && <Button variant="ghost" onClick={excluir} className="mr-auto text-loss hover:text-loss"><Trash2 className="h-4 w-4" aria-hidden />Excluir</Button>}
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={salvar} loading={salvando}>Salvar</Button>
      </>}>
      <div className="space-y-6">
        {lead && aberto_ && lead.responsavel && !meu && (
          <Alert tone="warn" title={`${lead.responsavel} está atendendo este lead`}>Combine com quem atende antes de entrar em contato.</Alert>
        )}
        {erro && <Alert tone="loss">{erro}</Alert>}
        {lead?.whatsapp && (
          <p className="text-dense">
            <span className="text-fg-muted">WhatsApp </span>
            {telefone
              ? <a href={telefone} target="_blank" rel="noopener noreferrer" className="link font-medium tabular-nums" title="Abrir a conversa no WhatsApp">{lead.whatsapp}</a>
              : <span className="font-medium tabular-nums">{lead.whatsapp}</span>}
          </p>
        )}
        {!lead && <div><p className="label mb-3">Dados do lead</p>{dados}</div>}
        {atendimento}
        {lead && (
          <ContatosLead leadId={lead.id} nome={lead.nome} status={f.status} aberto={lead.tipo_status === 'Aberto'}
            onLista={setContatos}
            onRegistrado={(data, novoStatus) => {
              setF(x => ({ ...x, ultimo_contato: !x.ultimo_contato || data > x.ultimo_contato ? data : x.ultimo_contato, status: novoStatus ?? x.status }))
              if (novoStatus) setStatusSalvo(novoStatus)
              relerRetorno()
            }}
            onExcluido={ultimo => { setF(x => ({ ...x, ultimo_contato: ultimo ?? '' })); relerRetorno() }} />
        )}
        <Field label="Observações">
          <textarea rows={3} value={f.observacoes ?? ''} onChange={e => set('observacoes', e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectOrigem label="Origem / parceiro" valor={f.origem ?? ''} onChange={v => set('origem', v)} opcoes={opcoesOrigem} />
        </div>
        {lead && (
          <Recolhido tamanho="linha" titulo="Dados do lead" resumo={resumoDados}>
            <div className="pt-1">{dados}</div>
          </Recolhido>
        )}
      </div>
    </Modal>
  )
}
