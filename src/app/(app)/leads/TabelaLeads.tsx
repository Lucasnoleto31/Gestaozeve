'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneCall, Search, Trophy, XCircle } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button, IconButton } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { StatusLeadBadge, TRACO, dataCurta, n0 } from '@/components/gestao/Celulas'
import { marcarLeadPerdido, registrarContatoLead } from '@/lib/gestao/acoes'
import type { AssessoresPorCorretora, LeadRow, StatusLead } from '@/lib/gestao/tipos'
import { CORRETORA_SLUG, isCorretora, type Corretora } from '@/lib/corretoras'
import { fmtNum, labelMesCurto } from '@/lib/format'
import { expandir, type Compacto } from '@/lib/compacto'
import { mesBrasil } from '@/lib/periodo'
import { cn } from '@/lib/utils'
import { mesmaPessoa } from '@/lib/texto'
import { LeadForm } from './LeadForm'
import { GanhoWizard } from './GanhoWizard'

type Filtros = { busca: string; mes: string; status: string; responsavel: string; origem: string; corretora: string; alerta: boolean; clientes: string }

// Quem está atendendo o lead, em destaque: chip na tinta quando é outra pessoa (não chamar),
// contorno quando é você, "livre" quando ninguém assumiu. Fechado mostra só o nome.
function Atendimento({ responsavel, aberto, meu }: { responsavel: string | null; aberto: boolean; meu: boolean }) {
  if (!responsavel) return aberto ? <span className="inline-flex h-[22px] items-center rounded-sm border border-dashed border-line-strong px-2 text-micro font-medium text-fg-muted">livre</span> : <span className="text-fg-subtle">{TRACO}</span>
  if (!aberto) return <span className="muted">{responsavel}</span>
  return (
    <span
      className={cn('inline-flex h-[22px] max-w-full items-center gap-1.5 whitespace-nowrap rounded-sm px-2 text-micro font-semibold', meu ? 'border border-fg text-fg' : 'bg-fg text-bg')}
      title={meu ? 'Você está atendendo este lead' : `${responsavel} está atendendo este lead: não chamar`}
    >
      <span className={cn('inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold', meu ? 'bg-fg text-bg' : 'bg-bg text-fg')} aria-hidden>{responsavel.charAt(0).toUpperCase()}</span>
      {responsavel}{meu ? ' · você' : ' atende'}
    </span>
  )
}

export function TabelaLeads({ leads: compacto, responsaveis, responsaveisClientes, status, admin, filtrosIniciais, corretoras, assessores, hoje, usuario }: {
  leads: Compacto<LeadRow>
  responsaveis: string[]           // quem trabalha leads
  responsaveisClientes: string[]   // quem cuida de clientes (ficha do lead ganho)
  status: StatusLead[]
  admin: boolean
  filtrosIniciais: Filtros
  corretoras: Corretora[]          // corretoras que o usuário vê (destino do lead ganho)
  assessores: AssessoresPorCorretora
  hoje: string
  usuario: string                  // nome de quem está logado (destaca "você" nos leads que atende)
}) {
  const router = useRouter()
  const ehMeu = (responsavel: string | null) => mesmaPessoa(responsavel, usuario)
  const { avisar } = useToast()
  // a lista chega compacta (colunas + arrays) e vira objetos aqui
  const leads = useMemo(() => expandir(compacto), [compacto])
  const [f, setF] = useState<Filtros>(filtrosIniciais)
  const [limite, setLimite] = useState(100)
  const [editando, setEditando] = useState<LeadRow | null>(null)
  const [registrando, setRegistrando] = useState<string | null>(null)
  const [ganhando, setGanhando] = useState<LeadRow | null>(null)
  const [perdendo, setPerdendo] = useState<LeadRow | null>(null)
  const [motivo, setMotivo] = useState('')
  const [fechando, setFechando] = useState(false)
  const [erroPerda, setErroPerda] = useState<string | null>(null)

  const origens = useMemo(() => [...new Set(leads.map(l => l.origem ?? ''))].filter(Boolean).sort(), [leads])
  const corretorasOpera = useMemo(() => [...new Set(leads.map(l => l.corretora ?? ''))].filter(Boolean).sort(), [leads])
  const respOpcoes = useMemo(() => [...new Set([...responsaveis, ...leads.map(l => l.responsavel ?? '')])].filter(Boolean).sort(), [leads, responsaveis])
  // Mês de entrada de cada lead no fuso de Brasília (mesmo critério do funil)
  const mesPorLead = useMemo(() => new Map(leads.map(l => [l.id, mesBrasil(l.data_hora)])), [leads])
  const mesesOpcoes = useMemo(() => {
    const contagem = new Map<string, number>()
    for (const m of mesPorLead.values()) contagem.set(m, (contagem.get(m) ?? 0) + 1)
    if (f.mes && !contagem.has(f.mes)) contagem.set(f.mes, 0)   // mês vindo da URL sem leads continua selecionável
    return [...contagem.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [mesPorLead, f.mes])

  const filtrados = useMemo(() => {
    const t = f.busca.trim().toUpperCase()
    const dig = t.replace(/\D/g, '')
    return leads.filter(l => {
      if (f.mes && mesPorLead.get(l.id) !== f.mes) return false
      if (f.status && l.status !== f.status) return false
      if (f.responsavel === '__livre') { if (l.responsavel) return false }
      else if (f.responsavel && (l.responsavel ?? '') !== f.responsavel) return false
      if (f.origem && (l.origem ?? '') !== f.origem) return false
      if (f.corretora && (l.corretora ?? '') !== f.corretora) return false
      if (f.alerta && !l.alerta) return false
      if (f.clientes === 'sim' && !l.cliente_id) return false
      if (f.clientes === 'nao' && l.cliente_id) return false
      if (t) {
        if (dig.length >= 4 && dig.length === t.replace(/[.\-()\s+]/g, '').length) return (l.whatsapp ?? '').replace(/\D/g, '').includes(dig) || (l.cpf ?? '').replace(/\D/g, '').includes(dig)
        return l.nome.toUpperCase().includes(t) || (l.email ?? '').toUpperCase().includes(t) || (l.observacoes ?? '').toUpperCase().includes(t)
      }
      return true
    })
  }, [leads, f, mesPorLead])
  const visiveis = filtrados.slice(0, limite)
  const sel = (k: keyof Filtros, v: string | boolean) => setF(x => ({ ...x, [k]: v }))

  const contato = async (l: LeadRow) => {
    setRegistrando(l.id)
    const r = await registrarContatoLead(l.id, l.status === 'Novo' ? 'Em contato' : undefined)
    setRegistrando(null)
    if (!r.ok) { avisar({ titulo: 'Não consegui registrar o contato', detalhe: r.erro, tom: 'loss' }); return }
    avisar({ titulo: `Contato registrado · ${l.nome}`, detalhe: l.status === 'Novo' ? 'Status passou para Em contato.' : undefined, tom: 'gain' })
    router.refresh()
  }
  const perder = async () => {
    if (!perdendo) return
    setFechando(true); setErroPerda(null)
    const r = await marcarLeadPerdido(perdendo.id, motivo)
    setFechando(false)
    if (!r.ok) { setErroPerda(r.erro); return }
    avisar({ titulo: `Lead perdido · ${perdendo.nome}`, detalhe: motivo.trim() || undefined, tom: 'neutral' })
    setPerdendo(null); setMotivo('')
    router.refresh()
  }
  const fichaHref = (l: LeadRow) => (l.cliente_id && l.cliente_corretora && isCorretora(l.cliente_corretora) ? `/${CORRETORA_SLUG[l.cliente_corretora]}/clientes/${l.cliente_id}` : null)

  return (
    <Panel title={`${fmtNum(filtrados.length)} de ${fmtNum(leads.length)} leads`} subtitle="Clique na linha para editar tudo. Ícones: telefone registra contato hoje (Novo vira Em contato), troféu marca Ganho e abre o cadastro do cliente, X marca Perdido.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <input className="field-sm w-52 pl-8" placeholder="Nome, telefone, CPF, e-mail…" value={f.busca} onChange={e => sel('busca', e.target.value)} aria-label="Buscar" />
        </label>
        <select className="field-sm" value={f.mes} onChange={e => sel('mes', e.target.value)} aria-label="Mês de entrada"><option value="">Mês: todos</option>{mesesOpcoes.map(([m, n]) => <option key={m} value={m}>{labelMesCurto(m + '-01')} · {fmtNum(n)}</option>)}</select>
        <select className="field-sm" value={f.status} onChange={e => sel('status', e.target.value)} aria-label="Status"><option value="">Status: todos</option>{status.map(s => <option key={s.status}>{s.status}</option>)}</select>
        <select className="field-sm" value={f.responsavel} onChange={e => sel('responsavel', e.target.value)} aria-label="Responsável"><option value="">Responsável: todos</option><option value="__livre">livres (sem responsável)</option>{respOpcoes.map(r => <option key={r}>{r}</option>)}</select>
        <select className="field-sm" value={f.origem} onChange={e => sel('origem', e.target.value)} aria-label="Origem"><option value="">Origem: todas</option>{origens.map(o => <option key={o}>{o}</option>)}</select>
        <select className="field-sm" value={f.corretora} onChange={e => sel('corretora', e.target.value)} aria-label="Corretora onde opera"><option value="">Opera em: todas</option>{corretorasOpera.map(c => <option key={c}>{c}</option>)}</select>
        <select className="field-sm" value={f.clientes} onChange={e => sel('clientes', e.target.value)} aria-label="Já é cliente"><option value="">Base: todos</option><option value="sim">já são clientes</option><option value="nao">não são clientes</option></select>
        <label className="flex items-center gap-1.5 text-label text-fg-muted"><input type="checkbox" checked={f.alerta} onChange={e => sel('alerta', e.target.checked)} />só com alerta</label>
      </div>
      <div className="tbl-wrap max-h-[70vh]">
        <table className="tbl tbl-dense">
          <thead>
            <tr>
              <th className="col-p2">Recebido</th><th>Nome</th><th>WhatsApp</th><th className="col-p3">CPF</th><th className="col-p3">E-mail</th><th className="col-p3">Já opera?</th><th className="col-p2">Opera em</th>
              <th className="col-p3">Origem</th><th className="col-p2">Responsável</th><th>Status</th><th className="col-p2">Último contato</th><th className="col-p3">Fechamento</th><th className="col-p3">Motivo da perda</th><th className="col-p2">Cliente?</th><th className="num">Dias</th><th><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={16} className="py-10 text-center text-dense text-fg-subtle">Nenhum lead com esses filtros.</td></tr>}
            {visiveis.map(l => {
              const href = fichaHref(l)
              return (
                <tr key={l.id} className={cn('cursor-pointer', l.tipo_status === 'Aberto' && l.responsavel && !ehMeu(l.responsavel) && 'bg-accent-soft')} onClick={() => setEditando(l)}>
                  <td className="num whitespace-nowrap col-p2">{new Date(l.data_hora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="max-w-[200px] truncate font-medium">
                    {l.nome}
                    {l.tipo_status === 'Aberto' && l.responsavel && <div className="text-micro font-normal text-fg-muted md:hidden">{ehMeu(l.responsavel) ? 'você atende' : `${l.responsavel} atende`}</div>}
                  </td>
                  <td className="num whitespace-nowrap">{l.whatsapp ?? TRACO}</td>
                  <td className="num muted col-p3">{l.cpf ?? TRACO}</td>
                  <td className="max-w-[180px] truncate muted col-p3">{l.email ?? TRACO}</td>
                  <td className="max-w-[140px] truncate muted col-p3">{l.ja_opera ?? TRACO}</td>
                  <td className="muted col-p2">{l.corretora ?? TRACO}</td>
                  <td className="muted col-p3">{l.origem ?? TRACO}</td>
                  <td className="col-p2"><Atendimento responsavel={l.responsavel} aberto={l.tipo_status === 'Aberto'} meu={ehMeu(l.responsavel)} /></td>
                  <td><StatusLeadBadge status={l.status} tipo={l.tipo_status} /></td>
                  <td className="num col-p2">{dataCurta(l.ultimo_contato)}</td>
                  <td className="num col-p3">{dataCurta(l.data_fechamento)}</td>
                  <td className="max-w-[160px] truncate muted col-p3">{l.motivo_perda ?? TRACO}</td>
                  <td className="col-p2" onClick={e => e.stopPropagation()}>
                    {l.cliente_id ? (
                      <span className="inline-flex items-center gap-1.5 text-label">
                        <span className={l.girou ? 'text-gain' : 'text-fg-muted'}>{l.cliente_status ?? 'cliente'}{l.girou ? ` · ${n0(l.lotes_12m)} lotes` : ''}</span>
                        {href && <Link href={href} className="link">ficha</Link>}
                      </span>
                    ) : <span className="text-fg-subtle">{TRACO}</span>}
                  </td>
                  <td className={cn('num', l.alerta && 'font-semibold text-warn')} title={l.alerta ? 'Sem contato há mais tempo que o limite' : undefined}>{l.dias ?? TRACO}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5">
                      {l.tipo_status === 'Aberto' && (
                        <IconButton tone="success" aria-label={`Registrar contato hoje · ${l.nome}`} title="Registrar contato hoje" disabled={registrando === l.id} onClick={() => contato(l)}><PhoneCall className="h-4 w-4" aria-hidden /></IconButton>
                      )}
                      {l.status !== 'Ganho' && (
                        <IconButton tone="accent" aria-label={`Marcar ${l.nome} como ganho`} title="Ganho: cadastrar como cliente" onClick={() => setGanhando(l)}><Trophy className="h-4 w-4" aria-hidden /></IconButton>
                      )}
                      {l.tipo_status === 'Aberto' && (
                        <IconButton tone="danger" aria-label={`Marcar ${l.nome} como perdido`} title="Perdido" onClick={() => { setPerdendo(l); setMotivo(l.motivo_perda ?? ''); setErroPerda(null) }}><XCircle className="h-4 w-4" aria-hidden /></IconButton>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {filtrados.length > visiveis.length && (
        <div className="py-2 text-center">
          <button type="button" className="link text-label" onClick={() => setLimite(n => n + 200)}>mostrar mais ({fmtNum(filtrados.length - visiveis.length)} restantes)</button>
        </div>
      )}
      {editando && <LeadForm key={editando.id} lead={editando} aberto onClose={() => setEditando(null)} responsaveis={responsaveis} status={status} admin={admin} usuario={usuario} />}
      {ganhando && <GanhoWizard key={ganhando.id} lead={ganhando} aberto onClose={() => setGanhando(null)} corretoras={corretoras} responsaveis={responsaveisClientes} assessores={assessores} hoje={hoje} />}
      <Modal open={!!perdendo} onClose={() => setPerdendo(null)} title="Marcar como perdido" subtitle={perdendo?.nome}
        footer={<><Button variant="secondary" onClick={() => setPerdendo(null)}>Cancelar</Button><Button variant="danger" onClick={perder} loading={fechando}>Marcar perdido</Button></>}>
        {erroPerda && <Alert tone="danger" className="mb-3">{erroPerda}</Alert>}
        <Input label="Motivo da perda" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Sem interesse, outra corretora, não respondeu…" autoFocus hint="Fecha o lead hoje. Dá para reabrir editando o status na linha." />
      </Modal>
    </Panel>
  )
}
