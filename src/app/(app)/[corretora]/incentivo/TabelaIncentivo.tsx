'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { BarraCelula, TRACO, n0, r0 } from '@/components/gestao/Celulas'
import type { IncentivoRow } from '@/lib/gestao/tipos'
import { mesCurto, type MesRef } from '@/lib/gestao/meses'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

export function TabelaIncentivo({ linhas, base, mesRef }: { linhas: IncentivoRow[]; base: string; mesRef: MesRef }) {
  const [busca, setBusca] = useState('')
  const [soFaixa, setSoFaixa] = useState(false)
  const [limite, setLimite] = useState(100)
  const filtradas = useMemo(() => {
    const t = busca.trim().toUpperCase()
    return linhas.filter(l => (!soFaixa || l.valor_incentivo > 0) && (!t || l.nome.toUpperCase().includes(t) || l.chave.includes(t)))
  }, [linhas, busca, soFaixa])
  const visiveis = filtradas.slice(0, limite)
  const maxPontos = Math.max(0, ...filtradas.map(l => l.pontos))

  return (
    <Panel title={`Pontos por cliente · ${mesCurto(mesRef)}`} subtitle={`${fmtNum(filtradas.length)} clientes · chave = nome (consolidado), CPF/CNPJ ou conta`}
      action={
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-label text-fg-muted"><input type="checkbox" checked={soFaixa} onChange={e => setSoFaixa(e.target.checked)} />só com faixa</label>
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <input className="field-sm w-44 pl-8" placeholder="Filtrar" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Filtrar cliente" />
          </label>
        </div>
      }>
      <div className="tbl-wrap max-h-[70vh]">
        <table className="tbl tbl-dense">
          <thead>
            <tr>
              <th className="col-p3">Chave</th><th>Cliente</th><th className="num col-p3">Contas</th><th className="num">Pontos</th><th className="num col-p2">Lotes</th>
              <th className="num col-p3">WIN</th><th className="num col-p3">WDO</th><th className="num col-p3">DOL</th><th className="num col-p3">Demais</th>
              <th className="col-p2">Faixa</th><th className="num">Incentivo</th><th className="col-p2">Próxima faixa</th><th className="num col-p2">Faltam</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={13} className="py-10 text-center text-dense text-fg-subtle">Ninguém pontuando no mês.</td></tr>}
            {visiveis.map(l => (
              <tr key={l.chave}>
                <td className="num muted col-p3">{l.chave.replace(/^(NOME|DOC|CONTA):/, '')}{l.chave.startsWith('NOME:') && <span className="ml-1 text-micro text-fg-subtle">consolidado</span>}</td>
                <td className="max-w-[240px] truncate">{l.cliente_id ? <Link href={`${base}/clientes/${l.cliente_id}`} className="link">{l.nome}</Link> : <span className="text-warn" title="Conta não cadastrada">{l.nome}</span>}</td>
                <td className={cn('num col-p3', l.contas <= 1 && 'subtle')}>{l.contas}</td>
                <td className="num"><BarraCelula valor={l.pontos} max={maxPontos} largura={64} /></td>
                <td className="num col-p2">{n0(l.lotes)}</td>
                <td className={cn('num col-p3', !l.pontos_win && 'subtle')}>{n0(l.pontos_win)}</td>
                <td className={cn('num col-p3', !l.pontos_wdo && 'subtle')}>{n0(l.pontos_wdo)}</td>
                <td className={cn('num col-p3', !l.pontos_dol && 'subtle')}>{n0(l.pontos_dol)}</td>
                <td className={cn('num col-p3', !l.pontos_outros && 'subtle')}>{n0(l.pontos_outros)}</td>
                <td className="col-p2">{l.faixa_min > 0 ? <Badge variant="gain">Mais de {fmtNum(l.faixa_min)}</Badge> : <span className="text-fg-subtle">até {fmtNum(l.proxima_faixa ?? 0)}</span>}</td>
                <td className={cn('num font-semibold', !l.valor_incentivo && 'subtle')}>{r0(l.valor_incentivo)}</td>
                <td className="muted col-p2">{l.proxima_faixa != null ? `mais de ${fmtNum(l.proxima_faixa)}` : 'faixa máxima'}</td>
                <td className="num col-p2">{l.pontos_faltantes != null ? fmtNum(l.pontos_faltantes) : TRACO}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtradas.length > visiveis.length && (
        <div className="py-2 text-center">
          <button type="button" className="link text-label" onClick={() => setLimite(n => n + 200)}>mostrar mais ({fmtNum(filtradas.length - visiveis.length)} restantes)</button>
        </div>
      )}
    </Panel>
  )
}
