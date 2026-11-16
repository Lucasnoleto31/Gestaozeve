'use client'

import Link from 'next/link'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { BarraCelula, TRACO, n0, r0, rCurto } from '@/components/gestao/Celulas'
import type { IncentivoRow } from '@/lib/gestao/tipos'
import { mesCurto, type MesRef } from '@/lib/gestao/meses'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

// Pontos por cliente no mês (Genial): sete colunas. A chave do cliente, o número de contas e os pontos
// por produto (WIN, WDO, DOL e os demais), que antes ocupavam seis colunas, abrem no detalhe da linha.
function Item({ rotulo, className, children, apoio }: { rotulo: string; className?: string; children: ReactNode; apoio?: ReactNode }) {
  return (
    <div className={className}>
      <dt className="label">{rotulo}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-fg">{children}</dd>
      {apoio && <dd className="text-micro text-fg-muted">{apoio}</dd>}
    </div>
  )
}

export function TabelaIncentivo({ linhas, base, mesRef }: { linhas: IncentivoRow[]; base: string; mesRef: MesRef }) {
  const [busca, setBusca] = useState('')
  const [soFaixa, setSoFaixa] = useState(false)
  const [limite, setLimite] = useState(100)
  const [aberto, setAberto] = useState<string | null>(null)
  const filtradas = useMemo(() => {
    const t = busca.trim().toUpperCase()
    return linhas.filter(l => (!soFaixa || l.valor_incentivo > 0) && (!t || l.nome.toUpperCase().includes(t) || l.chave.includes(t)))
  }, [linhas, busca, soFaixa])
  const visiveis = filtradas.slice(0, limite)
  const maxPontos = Math.max(0, ...filtradas.map(l => l.pontos))
  const total = useMemo(() => filtradas.reduce((s, l) => ({ pontos: s.pontos + l.pontos, lotes: s.lotes + l.lotes, incentivo: s.incentivo + l.valor_incentivo }), { pontos: 0, lotes: 0, incentivo: 0 }), [filtradas])

  return (
    <Panel title={`Pontos por cliente em ${mesCurto(mesRef)}`} subtitle={`${fmtNum(filtradas.length)} clientes pontuando. Um clique na linha abre os pontos por produto.`}
      action={
        <div className="flex flex-wrap items-center gap-3">
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
              <th>Cliente</th><th className="num col-p2">Pontos</th><th className="num col-p3">Lotes</th><th className="col-p2">Faixa</th>
              <th className="num">Incentivo</th><th className="col-p3">Próxima faixa</th><th className="num col-p2">Faltam</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-dense text-fg-subtle">Ninguém pontuando no mês.</td></tr>}
            {visiveis.map(l => {
              const aberta = aberto === l.chave
              const faixa = l.faixa_min > 0 ? <Badge variant="gain">Mais de {fmtNum(l.faixa_min)}</Badge> : <span className="text-fg-subtle">até {fmtNum(l.proxima_faixa ?? 0)}</span>
              const proxima = l.proxima_faixa != null ? `mais de ${fmtNum(l.proxima_faixa)}` : 'faixa máxima'
              return (
                <Fragment key={l.chave}>
                  <tr className={cn('cursor-pointer', aberta && 'bg-surface-2')} onClick={() => setAberto(aberta ? null : l.chave)}>
                    <td className="max-w-[260px]">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <button type="button" className="-ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-subtle hover:text-fg" aria-expanded={aberta}
                          aria-label={`${aberta ? 'Fechar' : 'Ver'} o detalhe de ${l.nome}`} onClick={e => { e.stopPropagation(); setAberto(aberta ? null : l.chave) }}>
                          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', aberta && 'rotate-90')} aria-hidden />
                        </button>
                        {l.cliente_id
                          ? <Link href={`${base}/clientes/${l.cliente_id}`} className="link truncate" onClick={e => e.stopPropagation()}>{l.nome}</Link>
                          : <span className="truncate text-warn" title="Conta sem cliente cadastrado">{l.nome}</span>}
                      </span>
                    </td>
                    <td className="num col-p2"><BarraCelula valor={l.pontos} max={maxPontos} largura={56} /></td>
                    <td className="num col-p3">{n0(l.lotes)}</td>
                    <td className="col-p2 whitespace-nowrap">{faixa}</td>
                    <td className={cn('num font-semibold', !l.valor_incentivo && 'subtle')}>{r0(l.valor_incentivo)}</td>
                    <td className="muted col-p3">{proxima}</td>
                    <td className="num col-p2">{l.pontos_faltantes != null ? fmtNum(l.pontos_faltantes) : TRACO}</td>
                  </tr>
                  {aberta && (
                    <tr className="bg-surface-2">
                      <td colSpan={7} className="!whitespace-normal">
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 py-2 pl-6 text-dense md:grid-cols-4 xl:grid-cols-6">
                          <Item rotulo="Pontos" className="md:hidden">{n0(l.pontos)}</Item>
                          <Item rotulo="Faixa" className="md:hidden">{faixa}</Item>
                          <Item rotulo="Faltam para subir" className="md:hidden">{l.pontos_faltantes != null ? `${fmtNum(l.pontos_faltantes)} pontos` : TRACO}</Item>
                          <Item rotulo="Lotes" className="xl:hidden">{n0(l.lotes)}</Item>
                          <Item rotulo="Próxima faixa" className="xl:hidden">{proxima}</Item>
                          <Item rotulo="Pontos em WIN">{n0(l.pontos_win)}</Item>
                          <Item rotulo="Pontos em WDO">{n0(l.pontos_wdo)}</Item>
                          <Item rotulo="Pontos em DOL">{n0(l.pontos_dol)}</Item>
                          <Item rotulo="Pontos nos demais">{n0(l.pontos_outros)}</Item>
                          <Item rotulo="Contas">{l.contas}</Item>
                          <Item rotulo="Chave" apoio={l.chave.startsWith('NOME:') ? 'consolidado pelo nome' : l.chave.startsWith('DOC:') ? 'CPF ou CNPJ' : 'conta'}>{l.chave.replace(/^(NOME|DOC|CONTA):/, '')}</Item>
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {filtradas.length > 0 && (
              <tr className="total">
                <td>Total · {fmtNum(filtradas.length)} clientes</td><td className="num col-p2">{n0(total.pontos)}</td><td className="num col-p3">{n0(total.lotes)}</td><td className="col-p2" />
                <td className="num">{rCurto(total.incentivo)}</td><td className="col-p3" /><td className="col-p2" />
              </tr>
            )}
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
