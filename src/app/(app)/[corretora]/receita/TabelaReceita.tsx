'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { BarraCelula, SituacaoBadge, StatusBadge, TRACO, dataCurta, n0, n2, r0 } from '@/components/gestao/Celulas'
import type { ClienteRow } from '@/lib/gestao/tipos'
import { mesCurto, type MesRef } from '@/lib/gestao/meses'
import { fmtNum } from '@/lib/format'

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
  const maxMes = Math.max(0, ...linhas.map(c => c.lotes_mes))
  const max12 = Math.max(0, ...linhas.map(c => c.lotes_12m))

  return (
    <Panel flush title="Receita e situação por cliente · mês de referência e janela 12 m" subtitle={`${fmtNum(linhas.length)} clientes`}
      action={
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-fg-muted"><input type="checkbox" checked={soComGiro} onChange={e => setSoComGiro(e.target.checked)} />só com giro em 12 m</label>
          <label className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
            <input className="field-sm w-44 pl-7" placeholder="Filtrar" value={busca} onChange={e => setBusca(e.target.value)} />
          </label>
        </div>
      }>
      <div className="tbl-wrap max-h-[75vh] rounded-none border-0">
        <table className="tbl tbl-dense">
          <thead>
            <tr>
              <th>Cliente</th><th>Resp.</th><th>Status</th><th>Migração</th><th className="num">Tarifa</th>
              <th className="num">Lotes · {mesCurto(mesRef)}</th><th className="num">Zerados</th><th className="num">Rec. corretagem</th><th className="num">Rec. zeragem</th><th className="num">Receita · mês</th>
              <th className="num">Lotes · 12 m</th><th className="num">Receita · 12 m</th><th>Último giro</th><th className="num">Meses s/ giro</th><th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={15} className="py-8 text-center text-sm text-fg-subtle">Nenhum cliente.</td></tr>}
            {visiveis.map(c => (
              <tr key={c.cliente_id}>
                <td className="max-w-[240px] truncate"><Link href={`${base}/clientes/${c.cliente_id}`} className="link">{c.nome}</Link></td>
                <td className="muted">{c.responsavel ?? TRACO}</td>
                <td><StatusBadge status={c.status} /></td>
                <td className="num">{dataCurta(c.data_migracao)}</td>
                <td className="num">{n2(c.tarifa)}</td>
                <td className="num"><BarraCelula valor={c.lotes_mes} max={maxMes} largura={56} /></td>
                <td className={`num ${!c.zerados_mes ? 'subtle' : ''}`}>{n0(c.zerados_mes)}</td>
                <td className="num">{r0(c.receita_corretagem_mes)}</td>
                <td className={`num ${!c.receita_zeragem_mes ? 'subtle' : ''}`}>{r0(c.receita_zeragem_mes)}</td>
                <td className="num font-semibold">{r0(c.receita_mes)}</td>
                <td className="num"><BarraCelula valor={c.lotes_12m} max={max12} tom="success" largura={56} /></td>
                <td className="num">{r0(c.receita_12m)}</td>
                <td className="num">{c.ultimo_mes_giro ? mesCurto(c.ultimo_mes_giro) : TRACO}</td>
                <td className={`num ${!c.meses_sem_giro ? 'subtle' : ''}`}>{c.meses_sem_giro ?? TRACO}</td>
                <td><SituacaoBadge situacao={c.situacao} mesesSemGiro={c.meses_sem_giro} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {linhas.length > visiveis.length && (
        <div className="border-t border-line px-4 py-2 text-center">
          <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => setLimite(n => n + 200)}>mostrar mais ({fmtNum(linhas.length - visiveis.length)} restantes)</button>
        </div>
      )}
    </Panel>
  )
}
