'use client'

import Link from 'next/link'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ChevronRight, Search } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { MomentoBadge, NivelMarca, TRACO, dataCurta, n0, n2, r0, rCurto } from '@/components/gestao/Celulas'
import type { ReceitaLinha } from '@/lib/gestao/tipos'
import { expandir, type Compacto } from '@/lib/compacto'
import { mesCurto } from '@/lib/gestao/meses'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

// Receita por cliente, do que mais rendeu no mês para o que menos rendeu. Seis colunas; o resto do que a
// tabela antiga mostrava em 16 (tarifa, zerados, corretagem e zeragem, migração, meses em que operou,
// nível, receita de todo o histórico) abre no detalhe da linha.
type Ordem = 'receita_mes' | 'lotes_mes' | 'receita_12m'

function Item({ rotulo, className, children, apoio }: { rotulo: string; className?: string; children: ReactNode; apoio?: ReactNode }) {
  return (
    <div className={className}>
      <dt className="label">{rotulo}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-fg">{children}</dd>
      {apoio && <dd className="text-micro text-fg-muted">{apoio}</dd>}
    </div>
  )
}

export function TabelaReceita({ clientes: compacto, base }: { clientes: Compacto<ReceitaLinha>; base: string }) {
  // a lista chega compacta (colunas + arrays) e vira objetos aqui
  const clientes = useMemo(() => expandir(compacto), [compacto])
  const [busca, setBusca] = useState('')
  const [soQuemOperou, setSoQuemOperou] = useState(true)
  const [limite, setLimite] = useState(100)
  const [ordem, setOrdem] = useState<Ordem>('receita_mes')
  const [aberto, setAberto] = useState<string | null>(null)

  const linhas = useMemo(() => {
    const t = busca.trim().toUpperCase()
    return clientes
      // quem teve lotes ou receita na janela; ninguém com receita fica escondido
      .filter(c => (!soQuemOperou || c.lotes_12m > 0 || c.receita_12m > 0 || c.receita_mes > 0) && (!t || c.nome.toUpperCase().includes(t) || (c.responsavel ?? '').toUpperCase().includes(t)))
      .sort((a, b) => b[ordem] - a[ordem] || b.receita_mes - a.receita_mes || b.receita_12m - a.receita_12m || b.lotes_12m - a.lotes_12m || a.nome.localeCompare(b.nome))
  }, [clientes, busca, soQuemOperou, ordem])
  const visiveis = linhas.slice(0, limite)
  const total = useMemo(() => linhas.reduce((s, c) => ({ lotes: s.lotes + c.lotes_mes, mes: s.mes + c.receita_mes, doze: s.doze + c.receita_12m }), { lotes: 0, mes: 0, doze: 0 }), [linhas])

  // Cabeçalho que ordena (função, não componente: evita remontar a cada render)
  const ordenavel = (campo: Ordem, titulo: string, cls?: string) => (
    <th className={cn('num cursor-pointer select-none hover:text-fg', cls)} onClick={() => setOrdem(campo)} aria-sort={ordem === campo ? 'descending' : undefined}>
      <span className="inline-flex items-center gap-1">{titulo}{ordem === campo && <ArrowDown className="h-3 w-3" aria-hidden />}</span>
    </th>
  )

  return (
    <Panel title="Receita por cliente" subtitle={`${fmtNum(linhas.length)} clientes, do que mais rendeu para o que menos rendeu. Um clique na linha abre o detalhe.`}
      action={
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-label text-fg-muted"><input type="checkbox" checked={soQuemOperou} onChange={e => setSoQuemOperou(e.target.checked)} />só quem operou em 12 meses</label>
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <input className="field-sm w-52 pl-8" placeholder="Cliente ou responsável" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Filtrar por cliente ou responsável" />
          </label>
        </div>
      }>
      <div className="tbl-wrap max-h-[75vh]">
        <table className="tbl tbl-dense">
          <thead>
            <tr>
              <th>Cliente</th><th className="col-p2">Situação</th><th className="col-p3">Responsável</th>
              {ordenavel('lotes_mes', 'Lotes no mês', 'col-p2')}{ordenavel('receita_mes', 'Receita no mês')}{ordenavel('receita_12m', 'Receita 12 meses', 'col-p2')}
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-dense text-fg-subtle">Nenhum cliente.</td></tr>}
            {visiveis.map(c => {
              const aberta = aberto === c.cliente_id
              return (
                <Fragment key={c.cliente_id}>
                  <tr className={cn('cursor-pointer', aberta && 'bg-surface-2')} onClick={() => setAberto(aberta ? null : c.cliente_id)}>
                    <td className="max-w-[260px]">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <button type="button" className="-ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-subtle hover:text-fg" aria-expanded={aberta}
                          aria-label={`${aberta ? 'Fechar' : 'Ver'} o detalhe de ${c.nome}`} onClick={e => { e.stopPropagation(); setAberto(aberta ? null : c.cliente_id) }}>
                          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', aberta && 'rotate-90')} aria-hidden />
                        </button>
                        <Link href={`${base}/clientes/${c.cliente_id}`} className="link truncate" onClick={e => e.stopPropagation()}>{c.nome}</Link>
                      </span>
                      <span className="mt-1 block pl-6 md:hidden"><MomentoBadge cliente={c} /></span>
                    </td>
                    <td className="col-p2 whitespace-nowrap"><MomentoBadge cliente={c} /></td>
                    <td className="muted col-p3">{c.responsavel ?? TRACO}</td>
                    <td className={cn('num col-p2', !c.lotes_mes && 'subtle')}>{n0(c.lotes_mes)}</td>
                    <td className={cn('num font-semibold', !c.receita_mes && 'subtle')}>{r0(c.receita_mes)}</td>
                    <td className={cn('num col-p2', !c.receita_12m && 'subtle')}>{r0(c.receita_12m)}</td>
                  </tr>
                  {aberta && (
                    <tr className="bg-surface-2">
                      <td colSpan={6} className="!whitespace-normal">
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 py-2 pl-6 text-dense md:grid-cols-4 xl:grid-cols-5">
                          <Item rotulo="Responsável" className="xl:hidden">{c.responsavel ?? TRACO}</Item>
                          <Item rotulo="Lotes no mês" className="md:hidden">{n0(c.lotes_mes)}</Item>
                          <Item rotulo="Receita 12 meses" className="md:hidden">{r0(c.receita_12m)}</Item>
                          <Item rotulo="Corretagem no mês">{r0(c.receita_corretagem_mes)}</Item>
                          <Item rotulo="Zeragem no mês" apoio={c.zerados_mes ? `${fmtNum(c.zerados_mes)} contratos zerados` : 'nenhum contrato zerado'}>{r0(c.receita_zeragem_mes)}</Item>
                          <Item rotulo="Tarifa" apoio="R$ por lote">{n2(c.tarifa)}</Item>
                          <Item rotulo="Lotes em 12 meses" apoio={c.meses_ativos ? `em ${fmtNum(c.meses_ativos)} ${c.meses_ativos === 1 ? 'mês' : 'meses'} com operação` : undefined}>{n0(c.lotes_12m)}</Item>
                          <Item rotulo="Último mês com operação">{c.ultimo_mes_giro ? mesCurto(c.ultimo_mes_giro) : TRACO}</Item>
                          <Item rotulo="Migrou em">{dataCurta(c.data_migracao)}</Item>
                          <Item rotulo="Nível" apoio={c.lotes_media_3m ? `média de ${fmtNum(Math.round(c.lotes_media_3m))} lotes por mês` : undefined}>{c.nivel ? <NivelMarca nivel={c.nivel} media={c.lotes_media_3m} /> : TRACO}</Item>
                          <Item rotulo="Receita de todo o histórico">{r0(c.receita_total)}</Item>
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {linhas.length > 0 && (
              <tr className="total">
                <td>Total · {fmtNum(linhas.length)} clientes</td><td className="col-p2" /><td className="col-p3" />
                <td className="num col-p2">{n0(total.lotes)}</td><td className="num">{rCurto(total.mes)}</td><td className="num col-p2">{rCurto(total.doze)}</td>
              </tr>
            )}
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
