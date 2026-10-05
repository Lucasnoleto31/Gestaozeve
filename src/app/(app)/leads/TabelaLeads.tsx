'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, PhoneCall, Search } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/Button'
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
    await registrarContatoLead(l.id, l.status === 'Novo' ? 'Em contato' : undefined)
    setRegistrando(null)
    router.refresh()
  }
  const fichaHref = (l: LeadRow) => (l.cliente_id && l.cliente_corretora && isCorretora(l.cliente_corretora) ? `/${CORRETORA_SLUG[l.cliente_corretora]}/clientes/${l.cliente_id}` : null)

  return (
    <Panel flush title={`${fmtNum(filtrados.length)} de ${fmtNum(leads.length)} leads`} subtitle="Clique na linha para editar o acompanhamento. O telefone registra um contato hoje (e tira de Novo).">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
          <input className="field-sm w-52 pl-7" placeholder="Nome, telefone, CPF, e-mail…" value={f.busca} onChange={e => sel('busca', e.target.value)} />
        </label>
        <select className="field-sm" value={f.status} onChange={e => sel('status', e.target.value)}><option value="">Status: todos</option>{status.map(s => <option key={s.status}>{s.status}</option>)}</select>
        <select className="field-sm" value={f.responsavel} onChange={e => sel('responsavel', e.target.value)}><option value="">Responsável: todos</option>{respOpcoes.map(r => <option key={r}>{r}</option>)}</select>
        <select className="field-sm" value={f.origem} onChange={e => sel('origem', e.target.value)}><option value="">Origem: todas</option>{origens.map(o => <option key={o}>{o}</option>)}</select>
        <select className="field-sm" value={f.corretora} onChange={e => sel('corretora', e.target.value)}><option value="">Opera em: todas</option>{corretoras.map(c => <option key={c}>{c}</option>)}</select>
        <select className="field-sm" value={f.clientes} onChange={e => sel('clientes', e.target.value)}><option value="">Base: todos</option><option value="sim">já são clientes</option><option value="nao">não são clientes</option></select>
        <label className="flex items-center gap-1.5 text-xs text-fg-muted"><input type="checkbox" checked={f.alerta} onChange={e => sel('alerta', e.target.checked)} />só com alerta</label>
      </div>
      <div className="tbl-wrap max-h-[70vh] rounded-none border-0">
        <table className="tbl tbl-dense">
          <thead>
            <tr>
              <th>Data/hora</th><th>Nome</th><th>WhatsApp</th><th>CPF</th><th>E-mail</th><th>Já opera?</th><th>Opera em</th>
              <th>Origem / parceiro</th><th>Responsável</th><th>Status</th><th>Último contato</th><th>Fechamento</th><th>Motivo da perda</th><th>Já é cliente?</th><th className="num">Dias</th><th />
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={16} className="py-10 text-center text-sm text-fg-subtle">Nenhum lead com esses filtros.</td></tr>}
            {visiveis.map(l => {
              const href = fichaHref(l)
              return (
                <tr key={l.id} className={cn('cursor-pointer', l.alerta && 'bg-warning-soft/40')} onClick={() => setEditando(l)}>
                  <td className="num whitespace-nowrap">{new Date(l.data_hora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="max-w-[200px] truncate font-medium">{l.alerta && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-warning" />}{l.nome}</td>
                  <td className="num whitespace-nowrap">{l.whatsapp ?? TRACO}</td>
                  <td className="num muted">{l.cpf ?? TRACO}</td>
                  <td className="max-w-[180px] truncate muted">{l.email ?? TRACO}</td>
                  <td className="max-w-[140px] truncate muted">{l.ja_opera ?? TRACO}</td>
                  <td className="muted">{l.corretora ?? TRACO}</td>
                  <td className="muted">{l.origem ?? TRACO}</td>
                  <td>{l.responsavel ?? <span className="text-fg-subtle">{TRACO}</span>}</td>
                  <td><StatusLeadBadge status={l.status} tipo={l.tipo_status} /></td>
                  <td className="num">{dataCurta(l.ultimo_contato)}</td>
                  <td className="num">{dataCurta(l.data_fechamento)}</td>
                  <td className="max-w-[160px] truncate muted">{l.motivo_perda ?? TRACO}</td>
                  <td onClick={e => e.stopPropagation()}>
                    {l.cliente_id ? (
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <Badge variant={l.girou ? 'success' : 'info'}>{l.cliente_status ?? 'cliente'}{l.girou ? ` · ${n0(l.lotes_12m)} lotes` : ''}</Badge>
                        {href && <Link href={href} className="link text-xs">ficha</Link>}
                      </span>
                    ) : <span className="text-fg-subtle">{TRACO}</span>}
                  </td>
                  <td className={cn('num', l.alerta && 'font-semibold text-warning')}>{l.dias ?? TRACO}</td>
                  <td onClick={e => e.stopPropagation()}>
                    {l.tipo_status === 'Aberto' && (
                      <IconButton tone="success" aria-label="Registrar contato hoje" title="Registrar contato hoje" disabled={registrando === l.id} onClick={() => contato(l)}><PhoneCall className="h-3.5 w-3.5" /></IconButton>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {filtrados.length > visiveis.length && (
        <div className="border-t border-line px-4 py-2 text-center">
          <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => setLimite(n => n + 200)}>mostrar mais ({fmtNum(filtrados.length - visiveis.length)} restantes)</button>
        </div>
      )}
      {editando && <LeadForm key={editando.id} lead={editando} aberto onClose={() => setEditando(null)} responsaveis={responsaveis} status={status} admin={admin} />}
    </Panel>
  )
}
