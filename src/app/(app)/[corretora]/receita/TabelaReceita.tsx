'use client'

import Link from 'next/link'
import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowDown, ChevronRight, Search, X } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { FolhaCelular } from '@/components/ui/FolhaCelular'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { MomentoBadge, NivelMarca, TRACO, dataCurta, n0, n2, r0, rCurto } from '@/components/gestao/Celulas'
import type { ReceitaLinha } from '@/lib/gestao/tipos'
import { expandir, type Compacto } from '@/lib/compacto'
import { mesCurto } from '@/lib/gestao/meses'
import { dicaDoMomento } from '@/lib/gestao/momentoCliente'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { fatiaDoTotal } from './celular'

// Receita por cliente, do que mais rendeu no mês para o que menos rendeu. Seis colunas; o resto do que a
// tabela antiga mostrava em 16 (tarifa, zerados, corretagem e zeragem, migração, meses em que operou,
// nível, receita de todo o histórico) abre no detalhe da linha.
// No celular (18/11/2026) a mesma tabela vira lista (DESIGN.md §8.6): o nome inteiro, o estado em palavras
// e o responsável na linha de apoio e um número só à direita, o da ordem escolhida, com o nome dele
// embaixo. A linha inteira abre o detalhe, que ganha a explicação do estado e o caminho para a ficha.
// Começa pelos 10 maiores (o bloco "os 10 maiores clientes" não aparece no celular) e abre de 30 em 30:
// sem a caixa com rolagem própria, as 100 linhas do computador seriam dez telas antes de "Análises".
type Ordem = 'receita_mes' | 'lotes_mes' | 'receita_12m'
const ORDENS: { campo: Ordem; nome: string }[] = [
  { campo: 'receita_mes', nome: 'Receita no mês' }, { campo: 'lotes_mes', nome: 'Lotes no mês' }, { campo: 'receita_12m', nome: 'Receita 12 meses' },
]
const FILTRO_OPEROU = 'só quem operou em 12 meses'
// Celular: lugar do número à direita, com a seta de abrir depois dele
const LISTA: CSSProperties = { '--lista-direita': '8.5rem' } as CSSProperties
const VALOR = 'cel-valor max-md:!right-6'
// Celular, linha de apoio: o nome do número vai escrito depois dele (data-sufixo da base), com espaços que
// não quebram, para a linha partir antes do número e não no meio de "em 12 meses"
const NBSP = String.fromCharCode(160)
const nb = (texto: string) => texto.replace(/ /g, NBSP)

function Item({ rotulo, className, children, apoio }: { rotulo: string; className?: string; children: ReactNode; apoio?: ReactNode }) {
  return (
    <div className={className}>
      <dt className="label">{rotulo}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-fg">{children}</dd>
      {apoio && <dd className="text-micro text-fg-muted">{apoio}</dd>}
    </div>
  )
}

// totalMes = a receita do mês de todos os clientes, a base da fatia de cada um (a mesma do bloco dos 10
// maiores; não muda com a busca). resumoCelular = o subtítulo no celular.
export function TabelaReceita({ clientes: compacto, base, totalMes, resumoCelular }: { clientes: Compacto<ReceitaLinha>; base: string; totalMes: number; resumoCelular?: string | null }) {
  // a lista chega compacta (colunas + arrays) e vira objetos aqui
  const clientes = useMemo(() => expandir(compacto), [compacto])
  const [busca, setBusca] = useState('')
  const [soQuemOperou, setSoQuemOperou] = useState(true)
  const [limite, setLimite] = useState(100)
  const [limiteCel, setLimiteCel] = useState(10)
  const [ordem, setOrdem] = useState<Ordem>('receita_mes')
  const [aberto, setAberto] = useState<string | null>(null)

  const linhas = useMemo(() => {
    const t = busca.trim().toUpperCase()
    return clientes
      // quem teve lotes ou receita na janela; ninguém com receita fica escondido
      .filter(c => (!soQuemOperou || c.lotes_12m > 0 || c.receita_12m > 0 || c.receita_mes > 0) && (!t || c.nome.toUpperCase().includes(t) || (c.responsavel ?? '').toUpperCase().includes(t)))
      .sort((a, b) => b[ordem] - a[ordem] || b.receita_mes - a.receita_mes || b.receita_12m - a.receita_12m || b.lotes_12m - a.lotes_12m || a.nome.localeCompare(b.nome))
  }, [clientes, busca, soQuemOperou, ordem])
  // Quantas linhas o celular mostra: 10 e depois de 30 em 30; com busca digitada, todos os achados (até o
  // limite do computador). O corte é por classe, não pela largura da janela, que o servidor não conhece.
  const limCel = busca.trim() ? Math.max(limiteCel, limite) : limiteCel
  const visiveis = linhas.slice(0, Math.max(limite, limCel))
  const foraDaVista = (i: number) => cn(i >= limCel && 'max-md:!hidden', i >= limite && 'md:hidden')
  const total = useMemo(() => linhas.reduce((s, c) => ({ lotes: s.lotes + c.lotes_mes, mes: s.mes + c.receita_mes, doze: s.doze + c.receita_12m }), { lotes: 0, mes: 0, doze: 0 }), [linhas])

  // Cabeçalho que ordena (função, não componente: evita remontar a cada render)
  const ordenavel = (campo: Ordem, titulo: string, cls?: string) => (
    <th className={cn('num cursor-pointer select-none hover:text-fg', cls)} onClick={() => setOrdem(campo)} aria-sort={ordem === campo ? 'descending' : undefined}>
      <span className="inline-flex items-center gap-1">{titulo}{ordem === campo && <ArrowDown className="h-3 w-3" aria-hidden />}</span>
    </th>
  )
  // Celular: só a coluna da ordem escolhida aparece, à direita; as outras duas ficam no detalhe da linha
  const papel = (campo: Ordem, zerado: boolean) => (ordem === campo ? cn(VALOR, zerado && 'max-md:!text-fg-subtle') : undefined)

  return (
    <Panel title="Receita por cliente"
      subtitle={<>
        <span className="max-md:hidden">{`${fmtNum(linhas.length)} clientes, do que mais rendeu para o que menos rendeu. Um clique na linha abre o detalhe.`}</span>
        {resumoCelular && <span className="md:hidden">{resumoCelular}</span>}
      </>}
      action={
        // No celular a busca e o botão Filtros dividem uma linha na largura da tela (o cabeçalho do bloco dá
        // à ação só a largura do conteúdo); os campos de Filtros sobem numa folha e são os mesmos do computador.
        <div className="flex flex-wrap items-center gap-3 max-md:w-[calc(100vw-2rem)] max-md:flex-nowrap max-md:gap-2">
          <FolhaCelular ativos={soQuemOperou ? 1 : 0} className="md:contents" botaoClassName="shrink-0 max-md:!min-h-[44px]">
            {/* no computador a ordem troca pelo cabeçalho da coluna, que a lista do celular não tem */}
            <label className="text-label text-fg-muted md:hidden">Ordenar por
              <select value={ordem} onChange={e => setOrdem(e.target.value as Ordem)}>
                {ORDENS.map(o => <option key={o.campo} value={o.campo}>{o.nome}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-label text-fg-muted max-md:min-h-[44px] max-md:gap-3 max-md:text-dense max-md:text-fg max-md:[&>input]:h-5 max-md:[&>input]:w-5">
              <input type="checkbox" checked={soQuemOperou} onChange={e => setSoQuemOperou(e.target.checked)} />{FILTRO_OPEROU}
            </label>
          </FolhaCelular>
          <label className="relative max-md:order-first max-md:min-w-0 max-md:flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <input className="field-sm w-52 pl-8 max-md:min-h-[44px] max-md:w-full" placeholder="Cliente ou responsável" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Filtrar por cliente ou responsável" />
          </label>
        </div>
      }>
      {/* celular: o filtro ligado fica à vista, fora da folha, e sai com um toque; é ele que explica por
          que a lista tem menos clientes que a base */}
      {soQuemOperou && (
        <div className="mb-1 md:hidden">
          <button type="button" className="chip" data-active="true" aria-label={`Tirar o filtro: ${FILTRO_OPEROU}`} onClick={() => setSoQuemOperou(false)}>
            {FILTRO_OPEROU}<X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}
      <div className="tbl-wrap max-h-[75vh]">
        <table className="tbl tbl-dense tbl-lista" style={LISTA}>
          <thead>
            <tr>
              <th>Cliente</th><th className="col-p2">Situação</th><th className="col-p3">Responsável</th>
              {ordenavel('lotes_mes', 'Lotes no mês', 'col-p2')}{ordenavel('receita_mes', 'Receita no mês')}{ordenavel('receita_12m', 'Receita 12 meses', 'col-p2')}
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-dense text-fg-subtle">Nenhum cliente.</td></tr>}
            {visiveis.map((c, i) => {
              const aberta = aberto === c.cliente_id
              const ficha = `${base}/clientes/${c.cliente_id}`
              // celular: quem não rendeu no mês aparece pela receita de 12 meses (é ela que o põe na ordem):
              // vai escrita na linha de apoio, senão a linha é só o nome e um traço
              const dozeNoApoio = ordem === 'receita_mes' && !c.receita_mes && c.receita_12m > 0
              return (
                <Fragment key={c.cliente_id}>
                  <tr className={cn('cursor-pointer', aberta && 'bg-surface-2 max-md:!border-b-0 max-md:bg-transparent', foraDaVista(i))} onClick={() => setAberto(aberta ? null : c.cliente_id)}>
                    <td className="cel-titulo max-w-[260px]">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {/* celular: a seta vai para a direita da linha, depois do número, sem esticar a linha */}
                        <button type="button" className="-ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-subtle hover:text-fg max-md:!absolute max-md:right-0 max-md:top-1/2 max-md:ml-0 max-md:!min-h-0 max-md:-translate-y-1/2 max-md:justify-end" aria-expanded={aberta}
                          aria-label={`${aberta ? 'Fechar' : 'Ver'} o detalhe de ${c.nome}`} onClick={e => { e.stopPropagation(); setAberto(aberta ? null : c.cliente_id) }}>
                          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform max-md:h-4 max-md:w-4', aberta ? 'rotate-90 max-md:-rotate-90' : 'max-md:rotate-90')} aria-hidden />
                        </button>
                        {/* celular: o nome não é um segundo toque escondido; a ficha abre pelo botão do detalhe */}
                        <Link href={ficha} className="link truncate max-md:hidden" onClick={e => e.stopPropagation()}>{c.nome}</Link>
                        <span className="md:hidden">{c.nome}</span>
                      </span>
                    </td>
                    <td className="cel-sub col-p2 whitespace-nowrap"><MomentoBadge cliente={c} /></td>
                    <td className={cn('muted cel-sub col-p3', !c.responsavel && 'vazio')} data-rotulo="resp.">{c.responsavel ?? TRACO}</td>
                    <td className={cn('num col-p2', !c.lotes_mes && 'subtle', papel('lotes_mes', !c.lotes_mes))} data-rotulo="lotes no mês">{n0(c.lotes_mes)}</td>
                    <td className={cn('num font-semibold', !c.receita_mes && 'subtle', papel('receita_mes', !c.receita_mes))} data-rotulo={fatiaDoTotal(c.receita_mes, totalMes)}>
                      <span className="max-md:hidden">{r0(c.receita_mes)}</span><span className="md:hidden">{rCurto(c.receita_mes)}</span>
                    </td>
                    <td className={cn('num col-p2', !c.receita_12m && 'subtle', papel('receita_12m', !c.receita_12m), dozeNoApoio && 'cel-sub')} data-rotulo={ordem === 'receita_12m' ? 'em 12 meses' : undefined} data-sufixo={dozeNoApoio ? nb('em 12 meses') : undefined}>
                      <span className="max-md:hidden">{r0(c.receita_12m)}</span><span className="md:hidden">{rCurto(c.receita_12m)}</span>
                    </td>
                  </tr>
                  {aberta && (
                    <tr className={cn('bg-surface-2 max-md:!min-h-0 max-md:bg-transparent max-md:!pt-0', foraDaVista(i))}>
                      <td colSpan={6} className="!whitespace-normal">
                        <div className="max-md:rounded-lg max-md:bg-surface max-md:p-4">
                          {/* o que o estado quer dizer: no computador é a dica do selo; no toque ela não existe */}
                          <p className="mb-3 text-label text-fg-muted md:hidden">{dicaDoMomento(c)}</p>
                          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 py-2 pl-6 text-dense max-md:gap-x-4 max-md:p-0 md:grid-cols-4 xl:grid-cols-5">
                            <Item rotulo="Responsável" className="xl:hidden">{c.responsavel ?? TRACO}</Item>
                            <Item rotulo="Receita no mês" className="md:hidden">{r0(c.receita_mes)}</Item>
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
                          <Link href={ficha} className={cn(buttonClasses('secondary', 'md'), 'mt-4 h-11 w-full md:hidden')}>Abrir a ficha do cliente</Link>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {linhas.length > 0 && (
              // celular: a coluna da ordem escolhida é o número; as outras duas vão escritas na linha de apoio
              <tr className="total">
                {/* celular: com o filtro ligado, o total diz quem conta, como a etiqueta lá no alto: perto do
                    "148 clientes com receita" do bloco de cima, "566 clientes" sozinho parecia outra conta */}
                <td className="cel-titulo">Total · {fmtNum(linhas.length)} clientes{soQuemOperou && <span className="md:hidden">{linhas.length === 1 ? ' que operou' : ' que operaram'} em 12 meses</span>}</td><td className="col-p2" /><td className="col-p3" />
                <td className={cn('num col-p2', ordem === 'lotes_mes' ? VALOR : 'cel-sub')} data-rotulo={ordem === 'lotes_mes' ? 'lotes no mês' : undefined} data-sufixo={ordem !== 'lotes_mes' ? nb('lotes no mês') : undefined}>
                  {n0(total.lotes)}
                </td>
                <td className={cn('num', ordem === 'receita_mes' ? VALOR : 'cel-sub')} data-sufixo={ordem !== 'receita_mes' ? nb('no mês') : undefined}>
                  {rCurto(total.mes)}
                </td>
                <td className={cn('num col-p2', ordem === 'receita_12m' ? VALOR : 'cel-sub')} data-rotulo={ordem === 'receita_12m' ? 'em 12 meses' : undefined} data-sufixo={ordem !== 'receita_12m' ? nb('em 12 meses') : undefined}>
                  {rCurto(total.doze)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {linhas.length > limite && (
        <div className="py-2 text-center max-md:hidden">
          <button type="button" className="link text-label" onClick={() => setLimite(n => n + 200)}>mostrar mais ({fmtNum(linhas.length - limite)} restantes)</button>
        </div>
      )}
      {linhas.length > limCel && (
        <button type="button" className={cn(buttonClasses('secondary', 'md'), 'mt-3 h-11 w-full md:hidden')} onClick={() => setLimiteCel(limCel + 30)}>mostrar mais ({fmtNum(linhas.length - limCel)} restantes)</button>
      )}
    </Panel>
  )
}
