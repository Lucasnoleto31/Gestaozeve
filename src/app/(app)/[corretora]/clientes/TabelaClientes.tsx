'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Download, Search } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { SituacaoBadge, TRACO, dataCurta, n0, n2, r0 } from '@/components/gestao/Celulas'
import type { ClienteRow } from '@/lib/gestao/tipos'
import { mesCurto, type MesRef } from '@/lib/gestao/meses'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

type Filtros = { busca: string; status: string; situacao: string; responsavel: string; assessor: string; alerta: string }
type Ordem = { col: keyof ClienteRow; dir: 'asc' | 'desc' }

const SITUACOES = ['Ativo', 'Inativo', 'Nunca girou', 'Em processamento', 'Recusou']
const STATUS = ['Migrado', 'Em processamento', 'Recusou']

export function TabelaClientes({ clientes, base, mesRef, filtrosIniciais }: { clientes: ClienteRow[]; base: string; mesRef: MesRef; filtrosIniciais: Filtros }) {
  const [f, setF] = useState<Filtros>(filtrosIniciais)
  const [ordem, setOrdem] = useState<Ordem>({ col: 'lotes_12m', dir: 'desc' })
  const [limite, setLimite] = useState(100)

  const responsaveis = useMemo(() => [...new Set(clientes.map(c => c.responsavel ?? ''))].filter(Boolean).sort(), [clientes])
  const assessores = useMemo(() => [...new Set(clientes.map(c => c.assessor_nome ?? ''))].filter(Boolean).sort(), [clientes])
  const alertas = useMemo(() => [...new Set(clientes.flatMap(c => c.alertas.map(a => (/^\d+ contas$/.test(a) ? 'contas' : a))))].sort(), [clientes])

  const filtrados = useMemo(() => {
    const termo = f.busca.trim().toUpperCase()
    const dig = termo.replace(/\D/g, '')
    const soDig = dig.length >= 3 && dig.length === termo.replace(/[.\-\/\s]/g, '').length
    let out = clientes.filter(c => {
      if (f.status && c.status !== f.status) return false
      if (f.situacao && c.situacao !== f.situacao) return false
      if (f.responsavel && (c.responsavel ?? '') !== f.responsavel) return false
      if (f.assessor && (c.assessor_nome ?? '') !== f.assessor) return false
      if (f.alerta === 'qualquer' && c.alertas.length === 0) return false
      if (f.alerta && f.alerta !== 'qualquer' && !c.alertas.some(a => (f.alerta === 'contas' ? /^\d+ contas$/.test(a) : a === f.alerta))) return false
      if (termo) {
        if (soDig) return (c.documento ?? '').startsWith(dig) || (c.conta_principal ?? '').startsWith(dig) || (c.telefone ?? '').replace(/\D/g, '').includes(dig)
        return c.nome.toUpperCase().includes(termo) || (c.assessor_nome ?? '').toUpperCase().includes(termo) || (c.parceiro ?? '').toUpperCase().includes(termo)
      }
      return true
    })
    const { col, dir } = ordem
    out = [...out].sort((a, b) => {
      const va = a[col], vb = b[col]
      let cmp = 0
      if (va == null && vb == null) cmp = 0
      else if (va == null) cmp = 1
      else if (vb == null) cmp = -1
      else if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb
      else cmp = String(va).localeCompare(String(vb), 'pt-BR')
      return dir === 'asc' ? cmp : -cmp
    })
    return out
  }, [clientes, f, ordem])

  const visiveis = filtrados.slice(0, limite)

  const ordenar = (col: keyof ClienteRow) => setOrdem(o => (o.col === col ? { col, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: typeof clientes[0]?.[col] === 'number' ? 'desc' : 'asc' }))
  // Cabeçalho ordenável (função, não componente: evita remontar a cada render)
  const th = (col: keyof ClienteRow, titulo: React.ReactNode, opts: { num?: boolean; prio?: 'p2' | 'p3' } = {}) => (
    <th key={String(col)} className={cn(opts.num && 'num', opts.prio && `col-${opts.prio}`, 'cursor-pointer select-none hover:text-fg')} onClick={() => ordenar(col)} aria-sort={ordem.col === col ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <span className="inline-flex items-center gap-1">{titulo}{ordem.col === col && (ordem.dir === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}</span>
    </th>
  )

  const exportar = () => {
    const cab = ['Cliente', 'CPF/CNPJ', 'Conta principal', 'Contas', 'Status', 'Situação', 'Assessor', 'Responsável', 'Tarifa', 'Migração', 'Entrada', 'Parceiro', `Lotes ${mesCurto(mesRef)}`, `Receita ${mesCurto(mesRef)}`, 'Lotes 12m', 'Receita 12m', 'Último giro', 'Telefone', 'E-mail', 'Alertas']
    const linhas = filtrados.map(c => [c.nome, c.documento ?? '', c.conta_principal ?? '', c.n_contas, c.status, c.situacao, c.assessor_nome ?? '', c.responsavel ?? '', c.tarifa, c.data_migracao ?? '', c.data_entrada ?? '', c.parceiro ?? '', c.lotes_mes, c.receita_mes, c.lotes_12m, c.receita_12m, c.ultimo_giro ?? '', c.telefone ?? '', c.email ?? '', c.alertas.join('; ')])
    const csv = [cab, ...linhas].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `clientes-${mesRef.slice(0, 7)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const sel = (k: keyof Filtros, v: string) => setF(x => ({ ...x, [k]: v }))
  const temFiltro = !!(f.busca || f.status || f.situacao || f.responsavel || f.assessor || f.alerta)

  return (
    <Panel
      title={`Cadastro · ${fmtNum(filtrados.length)} de ${fmtNum(clientes.length)}`}
      subtitle="Clique no nome para abrir a ficha; no cabeçalho para ordenar."
      action={<Button variant="secondary" size="sm" onClick={exportar}><Download className="h-4 w-4" aria-hidden />CSV</Button>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <input className="field-sm w-56 pl-8" placeholder="Nome, CPF, conta, telefone…" value={f.busca} onChange={e => sel('busca', e.target.value)} aria-label="Buscar" />
        </label>
        <select className="field-sm" value={f.status} onChange={e => sel('status', e.target.value)} aria-label="Status">
          <option value="">Status: todos</option>{STATUS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="field-sm" value={f.situacao} onChange={e => sel('situacao', e.target.value)} aria-label="Situação">
          <option value="">Situação: todas</option>{SITUACOES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="field-sm" value={f.responsavel} onChange={e => sel('responsavel', e.target.value)} aria-label="Responsável">
          <option value="">Responsável: todos</option>{responsaveis.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="field-sm max-w-[220px]" value={f.assessor} onChange={e => sel('assessor', e.target.value)} aria-label="Assessor">
          <option value="">Assessor: todos</option>{assessores.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="field-sm" value={f.alerta} onChange={e => sel('alerta', e.target.value)} aria-label="Alertas">
          <option value="">Alertas: todos</option>
          <option value="qualquer">com algum alerta</option>
          {alertas.map(a => <option key={a} value={a}>{a === 'contas' ? 'mais de uma conta' : a}</option>)}
        </select>
        {temFiltro && <button type="button" className="link text-label" onClick={() => setF({ busca: '', status: '', situacao: '', responsavel: '', assessor: '', alerta: '' })}>limpar</button>}
      </div>
      <div className="tbl-wrap max-h-[70vh]">
        <table className="tbl tbl-dense">
          <thead>
            <tr>
              {th('nome', 'Cliente')}
              {th('documento', 'CPF/CNPJ', { prio: 'p2' })}
              {th('conta_principal', 'Conta', { prio: 'p2' })}
              {th('n_contas', 'Contas', { num: true, prio: 'p3' })}
              {th('status', 'Status', { prio: 'p2' })}
              {th('situacao', 'Situação')}
              {th('assessor_nome', 'Assessor', { prio: 'p2' })}
              {th('responsavel', 'Resp.', { prio: 'p3' })}
              {th('tarifa', 'Tarifa', { num: true, prio: 'p3' })}
              {th('data_migracao', 'Migração', { prio: 'p3' })}
              {th('data_entrada', 'Entrada', { prio: 'p3' })}
              {th('parceiro', 'Parceiro', { prio: 'p3' })}
              {th('lotes_mes', <>Lotes {mesCurto(mesRef)}</>, { num: true })}
              {th('receita_mes', <>Receita {mesCurto(mesRef)}</>, { num: true, prio: 'p2' })}
              {th('lotes_12m', 'Lotes 12 m', { num: true })}
              {th('receita_12m', 'Receita 12 m', { num: true, prio: 'p2' })}
              {th('ultimo_giro', 'Último giro', { prio: 'p3' })}
              <th className="col-p3">Alertas</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={18} className="py-10 text-center text-dense text-fg-subtle">Nenhum cliente com esses filtros.</td></tr>}
            {visiveis.map(c => (
              <tr key={c.cliente_id}>
                <td className="max-w-[240px] truncate"><Link href={`${base}/clientes/${c.cliente_id}`} className="link">{c.nome}</Link></td>
                <td className="num muted col-p2">{c.documento ?? TRACO}</td>
                <td className="num col-p2">{c.conta_principal ?? TRACO}</td>
                <td className={cn('num col-p3', c.n_contas <= 1 && 'subtle')}>{c.n_contas}</td>
                <td className={cn('col-p2', c.status === 'Recusou' ? 'text-loss' : c.status !== 'Migrado' && 'muted')}>{c.status}</td>
                <td><SituacaoBadge situacao={c.situacao} mesesSemGiro={c.meses_sem_giro} /></td>
                <td className="max-w-[180px] truncate muted col-p2">{c.assessor_nome ?? TRACO}</td>
                <td className="muted col-p3">{c.responsavel ?? TRACO}</td>
                <td className="num col-p3">{n2(c.tarifa)}</td>
                <td className="num col-p3">{dataCurta(c.data_migracao)}</td>
                <td className="num col-p3">{dataCurta(c.data_entrada)}</td>
                <td className="muted col-p3">{c.parceiro ?? TRACO}</td>
                <td className={cn('num', !c.lotes_mes && 'subtle')}>{n0(c.lotes_mes)}</td>
                <td className={cn('num col-p2', !c.receita_mes && 'subtle')}>{r0(c.receita_mes)}</td>
                <td className={cn('num font-medium', !c.lotes_12m && 'subtle')}>{n0(c.lotes_12m)}</td>
                <td className={cn('num col-p2', !c.receita_12m && 'subtle')}>{r0(c.receita_12m)}</td>
                <td className="num col-p3">{dataCurta(c.ultimo_giro)}</td>
                <td className="col-p3">
                  {c.alertas.length > 0
                    ? <span className={cn('text-label', c.alertas.some(a => a === 'migrado sem giro' || a === 'migrado sem data') ? 'text-warn' : 'text-fg-muted')} title={c.alertas.join(' · ')}>{c.alertas.length} {c.alertas.length === 1 ? 'alerta' : 'alertas'}</span>
                    : <span className="subtle">{TRACO}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtrados.length > visiveis.length && (
        <div className="py-2 text-center">
          <button type="button" className="link text-label" onClick={() => setLimite(n => n + 200)}>
            mostrar mais ({n0(filtrados.length - visiveis.length)} restantes)
          </button>
        </div>
      )}
    </Panel>
  )
}
