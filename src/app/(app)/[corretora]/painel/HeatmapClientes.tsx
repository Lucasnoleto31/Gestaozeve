'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { MostrarMais, alemDe } from '@/components/ui/MostrarMais'
import { TRACO, estiloCalor, n0 } from '@/components/gestao/Celulas'
import { mesCurto, type MesRef } from '@/lib/gestao/meses'
import type { ClienteMesRow } from '@/lib/gestao/tipos'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

type Linha = { id: string; nome: string; responsavel: string | null; valores: number[]; total: number }

// No celular a lista começa com estes; "mostrar mais" abre o resto (no computador começa com 40, como sempre)
const INICIO_CELULAR = 10
const alemDoInicio = alemDe(INICIO_CELULAR)

// No computador, o mapa de calor cliente × mês. No celular (DESIGN.md §8.6) a mesma tabela vira lista: o nome
// inteiro, o total de 12 meses à direita e os dois meses mais novos na linha de apoio; os outros meses
// estão na ficha do cliente, a um toque. A busca e o "mostrar mais" são os mesmos nos dois.
export function HeatmapClientes({ meses, dados, base, totalClientes, className }: { meses: MesRef[]; dados: ClienteMesRow[]; base: string; totalClientes?: number; className?: string }) {
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
  const colMes = (i: number) => (i < meses.length - 4 ? 'col-p2' : '')
  // os dois meses mais novos vão para a linha de apoio da lista, com o nome do mês na frente
  const noApoio = (i: number) => i >= meses.length - 2
  const mesesDoApoio = meses.slice(-2).map(mesCurto).join(' e ')
  const comGiro = totalClientes ?? linhas.length
  const soAlguns = !!totalClientes && totalClientes > linhas.length

  // a tabela e o "mostrar mais" de sempre (carrega mais 60); no celular este só aparece depois que o da
  // base abriu as linhas já carregadas
  const lista = (
    <>
      <div className="tbl-wrap max-h-[560px]">
        <table className="tbl tbl-dense tbl-lista lista-abre">
          <thead>
            <tr>
              <th className="sticky-col min-w-[180px]">Cliente</th>
              <th className="col-p3">Resp.</th>
              {meses.map((m, i) => <th key={m} className={cn('num', colMes(i))}>{mesCurto(m)}</th>)}
              <th className="num">12 m</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={meses.length + 3} className="py-10 text-center text-dense text-fg-subtle">Nenhum cliente com giro.</td></tr>}
            {visiveis.map((l, n) => {
              // cliente que parou nos dois meses mais novos: no celular a linha de apoio diz isso em palavras,
              // em vez de dois traços (é o caso que mais importa: cliente grande que deixou de girar)
              const parou = l.valores.every((v, i) => !noApoio(i) || !v)
              return (
              <tr key={l.id} className={alemDoInicio(n)}>
                <td className="sticky-col max-w-[220px] truncate cel-titulo">
                  <Link href={`${base}/clientes/${l.id}`} className="link">{l.nome}</Link>
                  {parou && <span className="block text-label font-normal text-fg-muted md:hidden">sem giro em {mesesDoApoio}</span>}
                </td>
                <td className="muted col-p3">{l.responsavel ?? TRACO}</td>
                {/* a célula do mapa de calor (a cor de fundo vem em linha: na lista do celular ela sai) */}
                {l.valores.map((v, i) => (
                  <td key={i} className={cn('num', !v && 'subtle', colMes(i), noApoio(i) && 'cel-sub max-md:bg-transparent!', noApoio(i) && !v && 'vazio')} style={estiloCalor(v, max)} data-rotulo={noApoio(i) ? mesCurto(meses[i]) : undefined}>{n0(v)}</td>
                ))}
                <td className="num font-semibold cel-valor" data-rotulo="12 meses">{n0(l.total)}</td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {filtradas.length > visiveis.length && (
        <div className="py-2 text-center max-md:group-data-[tudo=false]/mais:hidden">
          <button type="button" className="link text-label max-md:min-h-[44px]" onClick={() => setLimite(n => n + 60)}>
            mostrar mais ({fmtNum(filtradas.length - visiveis.length)} restantes)
          </button>
        </div>
      )}
    </>
  )

  return (
    <Panel
      className={className}
      title="Lotes girados por cliente"
      subtitle={<>
        <span className="max-md:hidden">{`${fmtNum(comGiro)} clientes com giro na janela${soAlguns ? ` · os ${fmtNum(linhas.length)} maiores aqui` : ''} · ordem pelo total de 12 meses`}</span>
        <span className="md:hidden">{soAlguns ? `Os ${fmtNum(linhas.length)} que mais giraram em 12 meses, de ${fmtNum(comGiro)}.` : `${fmtNum(linhas.length)} clientes com giro em 12 meses, do maior para o menor.`}</span>
      </>}
      action={
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <input className="field-sm w-44 pl-8" placeholder="Filtrar cliente" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Filtrar cliente" />
        </label>
      }
    >
      {/* no celular a lista começa com as primeiras linhas e o botão da base abre as já carregadas (DESIGN.md §8.7);
          com poucas linhas não há o que abrir. O número do botão é o que falta da lista inteira (o mesmo do
          subtítulo): ele abre as já carregadas e, se ainda faltar, o botão de baixo diz quantas restam */}
      {visiveis.length > INICIO_CELULAR
        ? <MostrarMais rotulo={`mostrar mais (${fmtNum(filtradas.length - INICIO_CELULAR)} restantes)`}>{lista}</MostrarMais>
        : lista}
    </Panel>
  )
}
