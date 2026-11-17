'use client'

// Ficha de ganho: o lead vira cliente. Refeita em 17/11/2026 (Lucas: "essas duas fichas estão confusas").
// Era um assistente de 4 etapas (Corretora, Cliente, Comercial, Revisão) com "Avançar" e "Voltar"; agora é
// uma tela só, em três blocos: para onde vai, quem é (os dados vêm do lead, numa linha, com "Corrigir") e
// quem cuida e de onde veio. A "Situação: Em processamento / Migrado" virou a pergunta "A conta já está
// aberta na corretora?" (grava o mesmo valor) e a etapa Revisão virou a frase do fim, que diz o que vai
// acontecer. O parceiro é escolhido na mesma lista da ficha do lead. O que é gravado não mudou: no fim cria
// ou completa a ficha do cliente na corretora escolhida, fecha o lead como Ganho e liga os dois.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Field, Input, Select } from '@/components/ui/Input'
import { Recolhido } from '@/components/ui/Recolhido'
import { Dica } from '@/components/ui/Dica'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import { useToast } from '@/components/ui/Toast'
import { SelectOrigem } from '@/components/gestao/SelectOrigem'
import { dataCurta } from '@/components/gestao/Celulas'
import { converterLeadEmCliente } from '@/lib/gestao/acoes'
import { numeroBR } from '@/lib/gestao/planilhas'
import { OPCOES_ORIGEM_VAZIAS, origemNaLista, type OpcoesOrigem } from '@/lib/gestao/origens'
import { CORRETORA_LABEL, CORRETORA_SLUG, temListaPropria, type Corretora } from '@/lib/corretoras'
import type { AssessoresPorCorretora, LeadRow } from '@/lib/gestao/tipos'
import { cn } from '@/lib/utils'

// 'Genial' / 'XP' / 'BTG' do formulário → corretora do controle
function corretoraDoLead(v: string | null): Corretora | null {
  const t = (v ?? '').trim().toUpperCase()
  return t === 'GENIAL' || t === 'XP' || t === 'BTG' ? t : null
}

// Botão de escolha (corretora; conta aberta ou não): o escolhido fica marcado
function Escolha({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={cn('inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-dense', ativo ? 'border-accent bg-accent-soft font-medium text-fg' : 'border-line-strong bg-surface text-fg-muted hover:bg-surface-2')}>
      {children}
    </button>
  )
}

export function GanhoWizard({ lead, aberto, onClose, corretoras, responsaveis, assessores, hoje, opcoesOrigem = OPCOES_ORIGEM_VAZIAS }: {
  lead: LeadRow
  aberto: boolean
  onClose: () => void
  corretoras: Corretora[]
  responsaveis: string[]
  assessores: AssessoresPorCorretora
  hoje: string
  opcoesOrigem?: OpcoesOrigem   // parceiros e origens em uso, para o campo Parceiro
}) {
  const router = useRouter()
  const { avisar } = useToast()
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
  const na = f.corretora === 'BTG' ? 'no' : 'na'
  const migrado = f.status === 'Migrado'
  const cpfInvalido = !!f.documento && ![11, 14].includes(f.documento.replace(/\D/g, '').length)
  // os dados vêm do lead: ficam numa linha e abrem para corrigir (ou sozinhos, quando falta o nome ou o CPF está errado)
  const [corrigindo, setCorrigindo] = useState(!lead.nome.trim() || cpfInvalido)

  const validar = (): string | null => {
    if (!f.nome.trim()) return 'Informe o nome do cliente'
    if (cpfInvalido) return 'CPF tem 11 dígitos e CNPJ tem 14'
    if (migrado && !f.data_migracao) return 'Informe a data em que a conta abriu'
    return null
  }

  const concluir = async () => {
    const e = validar()
    if (e) { setErro(e); if (!f.nome.trim() || cpfInvalido) setCorrigindo(true); return }
    setSalvando(true); setErro(null)
    const r = await converterLeadEmCliente(lead.id, f.corretora, {
      nome: f.nome, documento: f.documento || null, telefone: f.telefone || null, email: f.email || null,
      status: f.status, responsavel: f.responsavel || null, assessor: listaPropria ? null : (f.assessor || null), parceiro: f.parceiro || null,
      corretagem: f.corretagem.trim() === '' ? null : numeroBR(f.corretagem),
      data_entrada: f.data_entrada || null, data_migracao: migrado ? (f.data_migracao || null) : null,
      conta: f.conta || null, observacoes: f.observacoes || null, motivo_recusa: null,
    })
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: `Lead ganho · ${f.nome.trim()}`, detalhe: r.dados.novo ? `Cliente cadastrado ${na} ${label}.` : `Já existia no cadastro (ligado pelo ${r.dados.casadoPor ?? 'cadastro'}); a ficha ${na} ${label} foi completada.`, tom: 'gain' })
    onClose()
    if (r.dados.clienteId) router.push(`/${CORRETORA_SLUG[f.corretora]}/clientes/${r.dados.clienteId}`)
    else router.refresh()
  }

  const quem = [f.nome.trim() || 'sem nome', f.documento ? `CPF ${f.documento}` : 'sem CPF', f.telefone || 'sem telefone', f.email || 'sem e-mail'].join(' · ')
  const origem = origemNaLista(f.parceiro, opcoesOrigem)
  // A frase do fim faz o papel da antiga etapa Revisão: diz o que vai acontecer ao concluir
  const frase = [
    `${f.nome.trim() || 'O lead'} vira cliente ${na} ${label}, com a conta ${migrado ? `aberta${f.data_migracao ? ` em ${dataCurta(f.data_migracao)}` : ''}` : 'em abertura'}`,
    f.responsavel ? `${f.responsavel} como responsável` : 'sem responsável',
    origem.grupo === 'vazio' ? 'sem parceiro' : `${origem.grupo === 'parceiro' ? 'parceiro' : 'origem'} ${origem.valor}`,
  ].join(', ') + '. O lead fecha como Ganho hoje.'

  return (
    <Modal open={aberto} onClose={onClose} size="lg"
      title={<span className="inline-flex items-center gap-2">Lead ganho · {lead.nome}<Dica texto="A ficha do cliente é montada com estes dados. Depois disso os imports de lotes e de clientes cruzam com ele pelo CPF, pelo telefone ou pelo nome." /></span>}
      subtitle="O lead vira cliente na corretora escolhida. Confira e conclua."
      footer={<>
        <Button variant="ghost" onClick={onClose} className="mr-auto">Cancelar</Button>
        <Button onClick={concluir} loading={salvando}><Check className="h-4 w-4" aria-hidden />Concluir e cadastrar</Button>
      </>}>
      <div className="space-y-6">
        {erro && <Alert tone="danger">{erro}</Alert>}

        <div>
          <p className="label mb-3">Para onde vai</p>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Corretora para onde o cliente vai">
              {corretoras.map(c => <Escolha key={c} ativo={f.corretora === c} onClick={() => setF({ ...f, corretora: c, assessor: '' })}><CorretoraBadge corretora={c} /></Escolha>)}
            </div>
            <Field label="A conta já está aberta na corretora?">
              <div className="flex flex-wrap gap-2">
                <Escolha ativo={!migrado} onClick={() => setF({ ...f, status: 'Em processamento' })}>Ainda não, está em abertura</Escolha>
                <Escolha ativo={migrado} onClick={() => setF({ ...f, status: 'Migrado', data_migracao: f.data_migracao || hoje })}>Sim, já abriu</Escolha>
              </div>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              {migrado && <Input label="Abriu em" type="date" value={f.data_migracao} max={hoje} onChange={set('data_migracao')} />}
              <Input label="Data de entrada" type="date" value={f.data_entrada} onChange={set('data_entrada')} hint="Quando foi levado para a corretora" />
              <Input label={`Conta ${na} ${label}`} value={f.conta} onChange={set('conta')} inputMode="numeric" hint="Se já souber; senão vem do export ou dos lotes" />
            </div>
          </div>
        </div>

        <div>
          <p className="label mb-2">Quem é</p>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-dense">
            <span className="min-w-0 text-fg-muted">{quem}</span>
            {!corrigindo && <button type="button" className="link text-label" onClick={() => setCorrigindo(true)}>Corrigir</button>}
          </div>
          {!f.documento && <p className="mt-1 text-label text-warn">Sem CPF, os lotes e o export ligam ao cliente pelo telefone ou pelo nome.</p>}
          {corrigindo && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input label="Nome" value={f.nome} onChange={set('nome')} required className="sm:col-span-2" />
              <Input label="CPF/CNPJ" value={f.documento} onChange={set('documento')} inputMode="numeric" error={cpfInvalido ? 'CPF tem 11 dígitos e CNPJ tem 14' : undefined} />
              <Input label="Telefone" value={f.telefone} onChange={set('telefone')} inputMode="tel" />
              <Input label="E-mail" type="email" value={f.email} onChange={set('email')} className="sm:col-span-2" />
            </div>
          )}
        </div>

        <div>
          <p className="label mb-3">Quem cuida e de onde veio</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Responsável" value={f.responsavel} onChange={set('responsavel')}>
              <option value="">—</option>
              {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
            <SelectOrigem label="Parceiro / origem" valor={f.parceiro} onChange={v => setF(x => ({ ...x, parceiro: v }))} opcoes={opcoesOrigem} vazio="Sem parceiro" />
            {!listaPropria && (
              <Select label={`Assessor ${na} ${label}`} value={f.assessor} onChange={set('assessor')} hint="Vale até a conta aparecer no export">
                <option value="">—</option>
                {assessores[f.corretora].map(a => <option key={a} value={a}>{a}</option>)}
              </Select>
            )}
            <Input label="Corretagem (R$/lote)" value={f.corretagem} onChange={set('corretagem')} inputMode="decimal" hint={listaPropria ? 'Vira a tarifa inicial do cliente' : 'Vazio usa a tarifa do assessor'} />
          </div>
          <Recolhido tamanho="linha" titulo="Observações" resumo={f.observacoes.trim() ? 'vêm do lead' : 'nenhuma'} className="mt-2">
            <textarea rows={3} className="w-full" value={f.observacoes} onChange={set('observacoes')} aria-label="Observações" />
          </Recolhido>
        </div>

        <p className="rounded-md bg-surface-2 px-3 py-2.5 text-dense text-fg">{frase}</p>
      </div>
    </Modal>
  )
}
