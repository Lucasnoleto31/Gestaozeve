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
    <Panel flush title={`Pontos e incentivo por cliente · ${mesCurto(mesRef)}`} subtitle={`${fmtNum(filtradas.length)} clientes · chave = nome (consolidado), CPF/CNPJ ou conta`}
      action={
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-fg-muted"><input type="checkbox" checked={soFaixa} onChange={e => setSoFaixa(e.target.checked)} />só com faixa</label>
          <label className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
            <input className="field-sm w-44 pl-7" placeholder="Filtrar" value={busca} onChange={e => setBusca(e.target.value)} />
          </label>
        </div>
      }>
      <div className="tbl-wrap max-h-[70vh] rounded-none border-0">
        <table className="tbl tbl-dense">
          <thead>
            <tr>
              <th>Chave</th><th>Cliente</th><th className="num">Contas</th><th className="num">Pontos</th><th className="num">Lotes operados</th>
              <th className="num">Pts WIN</th><th className="num">Pts WDO</th><th className="num">Pts DOL</th><th className="num">Pts demais</th>
              <th>Faixa alcançada</th><th className="num">Incentivo (R$)</th><th>Próxima faixa</th><th className="num">Faltam (pontos)</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={13} className="py-8 text-center text-sm text-fg-subtle">Ninguém pontuando no mês.</td></tr>}
            {visiveis.map(l => (
              <tr key={l.chave}>
                <td className="num muted">{l.chave.replace(/^(NOME|DOC|CONTA):/, '')}{l.chave.startsWith('NOME:') && <Badge className="ml-1">consolidado</Badge>}</td>
                <td className="max-w-[240px] truncate">{l.cliente_id ? <Link href={`${base}/clientes/${l.cliente_id}`} className="link">{l.nome}</Link> : <span className="text-warning" title="Conta não cadastrada">{l.nome}</span>}</td>
                <td className={`num ${l.contas <= 1 ? 'subtle' : ''}`}>{l.contas}</td>
                <td className="num"><BarraCelula valor={l.pontos} max={maxPontos} tom="violet" largura={64} /></td>
                <td className="num">{n0(l.lotes)}</td>
                <td className={`num ${!l.pontos_win ? 'subtle' : ''}`}>{n0(l.pontos_win)}</td>
                <td className={`num ${!l.pontos_wdo ? 'subtle' : ''}`}>{n0(l.pontos_wdo)}</td>
                <td className={`num ${!l.pontos_dol ? 'subtle' : ''}`}>{n0(l.pontos_dol)}</td>
                <td className={`num ${!l.pontos_outros ? 'subtle' : ''}`}>{n0(l.pontos_outros)}</td>
                <td>{l.faixa_min > 0 ? <Badge variant="success">Mais de {fmtNum(l.faixa_min)}</Badge> : <span className="text-fg-subtle">Até {fmtNum(l.proxima_faixa ?? 0)} (resto)</span>}</td>
                <td className="num font-semibold">{r0(l.valor_incentivo)}</td>
                <td className="muted">{l.proxima_faixa != null ? `Mais de ${fmtNum(l.proxima_faixa)}` : 'faixa máxima'}</td>
                <td className="num">{l.pontos_faltantes != null ? fmtNum(l.pontos_faltantes) : TRACO}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtradas.length > visiveis.length && (
        <div className="border-t border-line px-4 py-2 text-center">
          <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => setLimite(n => n + 200)}>mostrar mais ({fmtNum(filtradas.length - visiveis.length)} restantes)</button>
        </div>
      )}
    </Panel>
  )
}
