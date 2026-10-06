'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { SituacaoBadge, TRACO, dataCurta, n0, n2, r0 } from '@/components/gestao/Celulas'
import type { ClienteRow } from '@/lib/gestao/tipos'
import { mesCurto, type MesRef } from '@/lib/gestao/meses'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

export function TabelaReceita({ clientes, base, mesRef }: { clientes: ClienteRow[]; base: string; mesRef: MesRef }) {
  const [busca, setBusca] = useState('')
  const [soComGiro, setSoComGiro] = useState(true)
  const [limite, setLimite] = useState(100)

  const linhas = useMemo(() => {
    const t = busca.trim().toUpperCase()
    return clientes
      .filter(c => (!soComGiro || c.lotes_12m > 0) && (!t || c.nome.toUpperCase().includes(t) || (c.responsavel ?? '').toUpperCase().includes(t)))
      .sort((a, b) => b.lotes_12m - a.lotes_12m || b.lotes_mes - a.lotes_mes)
  }, [clientes, busca, soComGiro])
  const visiveis = linhas.slice(0, limite)

  return (
    <Panel title="Receita por cliente" subtitle={`${fmtNum(linhas.length)} clientes · mês de referência e janela de 12 meses`}
      action={
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-label text-fg-muted"><input type="checkbox" checked={soComGiro} onChange={e => setSoComGiro(e.target.checked)} />só com giro em 12 m</label>
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <input className="field-sm w-44 pl-8" placeholder="Filtrar" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Filtrar cliente" />
          </label>
        </div>
      }>
      <div className="tbl-wrap max-h-[75vh]">
        <table className="tbl tbl-dense">
          <thead>
            <tr>
              <th>Cliente</th><th className="col-p3">Resp.</th><th className="col-p3">Status</th><th className="col-p3">Migração</th><th className="num col-p3">Tarifa</th>
              <th className="num">Lotes {mesCurto(mesRef)}</th><th className="num col-p3">Zerados</th><th className="num col-p2">Corretagem</th><th className="num col-p2">Zeragem</th><th className="num">Receita mês</th>
              <th className="num">Lotes 12 m</th><th className="num col-p2">Receita 12 m</th><th className="col-p2">Último giro</th><th className="num col-p3">Meses s/ giro</th><th className="col-p2">Situação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={15} className="py-10 text-center text-dense text-fg-subtle">Nenhum cliente.</td></tr>}
            {visiveis.map(c => (
              <tr key={c.cliente_id}>
                <td className="max-w-[240px] truncate"><Link href={`${base}/clientes/${c.cliente_id}`} className="link">{c.nome}</Link></td>
                <td className="muted col-p3">{c.responsavel ?? TRACO}</td>
                <td className={cn('col-p3', c.status !== 'Migrado' && 'muted')}>{c.status}</td>
                <td className="num col-p3">{dataCurta(c.data_migracao)}</td>
                <td className="num col-p3">{n2(c.tarifa)}</td>
                <td className={cn('num', !c.lotes_mes && 'subtle')}>{n0(c.lotes_mes)}</td>
                <td className={cn('num col-p3', !c.zerados_mes && 'subtle')}>{n0(c.zerados_mes)}</td>
                <td className={cn('num col-p2', !c.receita_corretagem_mes && 'subtle')}>{r0(c.receita_corretagem_mes)}</td>
                <td className={cn('num col-p2', !c.receita_zeragem_mes && 'subtle')}>{r0(c.receita_zeragem_mes)}</td>
                <td className={cn('num font-semibold', !c.receita_mes && 'subtle')}>{r0(c.receita_mes)}</td>
                <td className={cn('num', !c.lotes_12m && 'subtle')}>{n0(c.lotes_12m)}</td>
                <td className={cn('num col-p2', !c.receita_12m && 'subtle')}>{r0(c.receita_12m)}</td>
                <td className="num col-p2">{c.ultimo_mes_giro ? mesCurto(c.ultimo_mes_giro) : TRACO}</td>
                <td className={cn('num col-p3', !c.meses_sem_giro && 'subtle')}>{c.meses_sem_giro ?? TRACO}</td>
                <td className="col-p2"><SituacaoBadge situacao={c.situacao} mesesSemGiro={c.meses_sem_giro} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {linhas.length > visiveis.length && (
        <div className="py-2 text-center">
          <button type="button" className="link text-label" onClick={() => setLimite(n => n + 200)}>mostrar mais ({fmtNum(linhas.length - visiveis.length)} restantes)</button>
        </div>
      )}
    </Panel>
  )
}
