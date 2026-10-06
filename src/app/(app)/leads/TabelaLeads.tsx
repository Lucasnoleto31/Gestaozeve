'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneCall, Search } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { IconButton } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { StatusLeadBadge, TRACO, dataCurta, n0 } from '@/components/gestao/Celulas'
import { registrarContatoLead } from '@/lib/gestao/acoes'
import type { LeadRow, StatusLead } from '@/lib/gestao/tipos'
import { CORRETORA_SLUG, isCorretora } from '@/lib/corretoras'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { LeadForm } from './LeadForm'

type Filtros = { busca: string; status: string; responsavel: string; origem: string; corretora: string; alerta: boolean; clientes: string }

export function TabelaLeads({ leads, responsaveis, status, admin, filtrosIniciais }: {
  leads: LeadRow[]
  responsaveis: string[]
  status: StatusLead[]
  admin: boolean
  filtrosIniciais: Filtros
}) {
  const router = useRouter()
  const { avisar } = useToast()
  const [f, setF] = useState<Filtros>(filtrosIniciais)
  const [limite, setLimite] = useState(100)
  const [editando, setEditando] = useState<LeadRow | null>(null)
  const [registrando, setRegistrando] = useState<string | null>(null)

  const origens = useMemo(() => [...new Set(leads.map(l => l.origem ?? ''))].filter(Boolean).sort(), [leads])
  const corretoras = useMemo(() => [...new Set(leads.map(l => l.corretora ?? ''))].filter(Boolean).sort(), [leads])
  const respOpcoes = useMemo(() => [...new Set([...responsaveis, ...leads.map(l => l.responsavel ?? '')])].filter(Boolean).sort(), [leads, responsaveis])

  const filtrados = useMemo(() => {
    const t = f.busca.trim().toUpperCase()
    const dig = t.replace(/\D/g, '')
    return leads.filter(l => {
      if (f.status && l.status !== f.status) return false
      if (f.responsavel && (l.responsavel ?? '') !== f.responsavel) return false
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
  }, [leads, f])
  const visiveis = filtrados.slice(0, limite)
  const sel = (k: keyof Filtros, v: string | boolean) => setF(x => ({ ...x, [k]: v }))

  const contato = async (l: LeadRow) => {
    setRegistrando(l.id)
    const r = await registrarContatoLead(l.id, l.status === 'Novo' ? 'Em contato' : undefined)
    setRegistrando(null)
    if (!r.ok) { avisar({ titulo: 'Não consegui registrar o contato', detalhe: r.erro, tom: 'loss' }); return }
    avisar({ titulo: `Contato registrado · ${l.nome}`, tom: 'gain' })
    router.refresh()
  }
  const fichaHref = (l: LeadRow) => (l.cliente_id && l.cliente_corretora && isCorretora(l.cliente_corretora) ? `/${CORRETORA_SLUG[l.cliente_corretora]}/clientes/${l.cliente_id}` : null)

  return (
    <Panel title={`${fmtNum(filtrados.length)} de ${fmtNum(leads.length)} leads`} subtitle="Clique na linha para editar; o telefone registra um contato hoje.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <input className="field-sm w-52 pl-8" placeholder="Nome, telefone, CPF, e-mail…" value={f.busca} onChange={e => sel('busca', e.target.value)} aria-label="Buscar" />
        </label>
        <select className="field-sm" value={f.status} onChange={e => sel('status', e.target.value)} aria-label="Status"><option value="">Status: todos</option>{status.map(s => <option key={s.status}>{s.status}</option>)}</select>
        <select className="field-sm" value={f.responsavel} onChange={e => sel('responsavel', e.target.value)} aria-label="Responsável"><option value="">Responsável: todos</option>{respOpcoes.map(r => <option key={r}>{r}</option>)}</select>
        <select className="field-sm" value={f.origem} onChange={e => sel('origem', e.target.value)} aria-label="Origem"><option value="">Origem: todas</option>{origens.map(o => <option key={o}>{o}</option>)}</select>
        <select className="field-sm" value={f.corretora} onChange={e => sel('corretora', e.target.value)} aria-label="Corretora onde opera"><option value="">Opera em: todas</option>{corretoras.map(c => <option key={c}>{c}</option>)}</select>
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
                <tr key={l.id} className="cursor-pointer" onClick={() => setEditando(l)}>
                  <td className="num whitespace-nowrap col-p2">{new Date(l.data_hora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="max-w-[200px] truncate font-medium">{l.nome}</td>
                  <td className="num whitespace-nowrap">{l.whatsapp ?? TRACO}</td>
                  <td className="num muted col-p3">{l.cpf ?? TRACO}</td>
                  <td className="max-w-[180px] truncate muted col-p3">{l.email ?? TRACO}</td>
                  <td className="max-w-[140px] truncate muted col-p3">{l.ja_opera ?? TRACO}</td>
                  <td className="muted col-p2">{l.corretora ?? TRACO}</td>
                  <td className="muted col-p3">{l.origem ?? TRACO}</td>
                  <td className="col-p2">{l.responsavel ?? <span className="text-fg-subtle">{TRACO}</span>}</td>
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
                    {l.tipo_status === 'Aberto' && (
                      <IconButton tone="success" aria-label="Registrar contato hoje" title="Registrar contato hoje" disabled={registrando === l.id} onClick={() => contato(l)}><PhoneCall className="h-4 w-4" aria-hidden /></IconButton>
                    )}
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
      {editando && <LeadForm key={editando.id} lead={editando} aberto onClose={() => setEditando(null)} responsaveis={responsaveis} status={status} admin={admin} />}
    </Panel>
  )
}
