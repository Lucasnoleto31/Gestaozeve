'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { CelulaCalor, TRACO, n0 } from '@/components/gestao/Celulas'
import { mesCurto, type MesRef } from '@/lib/gestao/meses'
import type { ClienteMesRow } from '@/lib/gestao/tipos'
import { fmtNum } from '@/lib/format'

type Linha = { id: string; nome: string; responsavel: string | null; valores: number[]; total: number }

export function HeatmapClientes({ meses, dados, base }: { meses: MesRef[]; dados: ClienteMesRow[]; base: string }) {
  const [busca, setBusca] = useState('')
  const [limite, setLimite] = useState(40)

  const linhas = useMemo<Linha[]>(() => {
    const idx = new Map(meses.map((m, i) => [m, i]))
    const m = new Map<string, Linha>()
    for (const d of dados) {
      let l = m.get(d.cliente_id)
      if (!l) { l = { id: d.cliente_id, nome: d.cliente_nome, responsavel: d.responsavel, valores: meses.map(() => 0), total: 0 }; m.set(d.cliente_id, l) }
      const i = idx.get(d.mes_ref)
      if (i != null) { l.valores[i] += d.lotes; l.total += d.lotes }
    }
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [dados, meses])

  const max = linhas.reduce((mx, l) => Math.max(mx, ...l.valores), 0)
  const termo = busca.trim().toUpperCase()
  const filtradas = termo ? linhas.filter(l => l.nome.toUpperCase().includes(termo)) : linhas
  const visiveis = filtradas.slice(0, limite)

  return (
    <Panel
      title="Lotes girados por cliente"
      subtitle={`${fmtNum(linhas.length)} clientes com giro na janela · ordenado pelo total de 12 meses`}
      flush
      action={
        <label className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
          <input className="field-sm w-44 pl-7" placeholder="Filtrar cliente" value={busca} onChange={e => setBusca(e.target.value)} />
        </label>
      }
    >
      <div className="tbl-wrap max-h-[560px] rounded-none border-0">
        <table className="tbl tbl-dense">
          <thead>
            <tr>
              <th className="sticky-col min-w-[220px]">Cliente</th>
              <th>Resp.</th>
              {meses.map(m => <th key={m} className="num">{mesCurto(m)}</th>)}
              <th className="num">Total 12 m</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={meses.length + 3} className="py-8 text-center text-sm text-fg-subtle">Nenhum cliente com giro.</td></tr>}
            {visiveis.map(l => (
              <tr key={l.id}>
                <td className="sticky-col"><Link href={`${base}/clientes/${l.id}`} className="link">{l.nome}</Link></td>
                <td className="muted">{l.responsavel ?? TRACO}</td>
                {l.valores.map((v, i) => <CelulaCalor key={i} valor={v} max={max} />)}
                <td className="num font-semibold">{n0(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtradas.length > visiveis.length && (
        <div className="border-t border-line px-4 py-2 text-center">
          <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => setLimite(n => n + 60)}>
            mostrar mais ({fmtNum(filtradas.length - visiveis.length)} restantes)
          </button>
        </div>
      )}
    </Panel>
  )
}
