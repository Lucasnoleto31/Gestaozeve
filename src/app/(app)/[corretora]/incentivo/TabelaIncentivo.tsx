'use client'

import Link from 'next/link'
import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
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

// No celular o incentivo sem centavos quando o valor é inteiro (R$ 1.000); valor de faixa com centavos
// continua com centavos, para não arredondar número
const rLista = (v: number) => (v && Number.isInteger(v) ? rCurto(v) : r0(v))
// Celular: a lista corre com a página (sem caixa com rolagem própria), então mostra 20 clientes e solta
// mais 40 a cada toque em "mostrar mais"; no computador continua a caixa com 100 e mais 200 por vez
const NO_CELULAR = 20
const MAIS_NO_CELULAR = 40

export function TabelaIncentivo({ linhas, base, mesRef }: { linhas: IncentivoRow[]; base: string; mesRef: MesRef }) {
  const [busca, setBusca] = useState('')
  const [soFaixa, setSoFaixa] = useState(false)
  const [limite, setLimite] = useState(100)
  const [limiteCelular, setLimiteCelular] = useState(NO_CELULAR)
  const [aberto, setAberto] = useState<string | null>(null)
  const filtradas = useMemo(() => {
    const t = busca.trim().toUpperCase()
    return linhas.filter(l => (!soFaixa || l.valor_incentivo > 0) && (!t || l.nome.toUpperCase().includes(t) || l.chave.includes(t)))
  }, [linhas, busca, soFaixa])
  const visiveis = filtradas.slice(0, limite)
  const maxPontos = Math.max(0, ...filtradas.map(l => l.pontos))
  const total = useMemo(() => filtradas.reduce((s, l) => ({ pontos: s.pontos + l.pontos, lotes: s.lotes + l.lotes, incentivo: s.incentivo + l.valor_incentivo }), { pontos: 0, lotes: 0, incentivo: 0 }), [filtradas])
  const restantesNoCelular = filtradas.length - Math.min(limiteCelular, filtradas.length)
  const maisNoCelular = () => {
    const n = limiteCelular + MAIS_NO_CELULAR
    setLimiteCelular(n)
    if (n > limite) setLimite(n)
  }

  return (
    <Panel title={`Pontos por cliente em ${mesCurto(mesRef)}`}
      subtitle={<>{fmtNum(filtradas.length)} clientes pontuando. <span className="max-md:hidden">Um clique na linha abre os pontos por produto.</span><span className="md:hidden">Toque no cliente para ver os pontos por produto.</span></>}
      action={
        // celular: a busca e o "só com faixa" numa linha só, na largura toda e no tamanho do dedo
        <div className="flex flex-wrap items-center gap-3 max-md:w-[calc(100vw-2rem)] max-md:flex-nowrap max-md:gap-2">
          <label className="flex items-center gap-1.5 text-label text-fg-muted max-md:order-last max-md:min-h-[44px] max-md:shrink-0 max-md:rounded-md max-md:bg-surface max-md:px-3 max-md:text-dense max-md:text-fg"><input type="checkbox" checked={soFaixa} onChange={e => setSoFaixa(e.target.checked)} />só com faixa</label>
          <label className="relative max-md:min-w-0 max-md:flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <input className="field-sm w-44 pl-8 max-md:w-full" placeholder="Filtrar" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Filtrar cliente" />
          </label>
        </div>
      }>
      <div className="tbl-wrap max-h-[70vh]">
        {/* celular (DESIGN.md §8.6): cada cliente vira um item. O nome em cima; embaixo a faixa e quanto falta
            para subir; à direita o incentivo. O toque abre o detalhe com o resto das colunas e a ficha. */}
        <table className="tbl tbl-dense tbl-lista" style={{ '--lista-direita': '6.5rem' } as CSSProperties}>
          <thead>
            <tr>
              <th>Cliente</th><th className="num col-p2">Pontos</th><th className="num col-p3">Lotes</th><th className="col-p2">Faixa</th>
              <th className="num">Incentivo</th><th className="col-p3">Próxima faixa</th><th className="num col-p2">Faltam</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-dense text-fg-subtle">Ninguém pontuando no mês.</td></tr>}
            {visiveis.map((l, i) => {
              const aberta = aberto === l.chave
              const faixa = l.faixa_min > 0 ? <Badge variant="gain">Mais de {fmtNum(l.faixa_min)}</Badge> : <span className="text-fg-subtle">até {fmtNum(l.proxima_faixa ?? 0)}</span>
              const proxima = l.proxima_faixa != null ? `mais de ${fmtNum(l.proxima_faixa)}` : 'faixa máxima'
              // celular: além dos primeiros, a linha espera o "mostrar mais" de baixo
              const alem = i >= limiteCelular && 'max-md:hidden!'
              return (
                <Fragment key={l.chave}>
                  {/* celular: aberta, só o detalhe ganha o fundo (na linha do nome o número encostava na borda do fundo) */}
                  {/* celular: a linha recua o que vem depois da seta (o "!" vence o padding da base) e o nome volta
                      com margem negativa, para a linha de apoio começar onde o nome começa e não embaixo da seta */}
                  <tr className={cn('cursor-pointer max-md:pl-[1.625rem]!', aberta && 'bg-surface-2 max-md:bg-transparent', alem)} onClick={() => setAberto(aberta ? null : l.chave)}>
                    <td className="cel-titulo max-w-[260px] max-md:-ml-[1.625rem]">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {/* no celular a seta não pede os 44 px de alvo: a linha inteira abre o detalhe, e a seta alta
                            abria um vão entre o nome e a linha de apoio */}
                        <button type="button" className="-ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-subtle hover:text-fg max-md:min-h-0! max-md:self-start" aria-expanded={aberta}
                          aria-label={`${aberta ? 'Fechar' : 'Ver'} o detalhe de ${l.nome}`} onClick={e => { e.stopPropagation(); setAberto(aberta ? null : l.chave) }}>
                          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', aberta && 'rotate-90')} aria-hidden />
                        </button>
                        {/* no celular o nome não é link: o toque em qualquer ponto da linha abre o detalhe, e a ficha
                            fica no botão "Abrir ficha do cliente" lá dentro (antes o polegar caía no nome e saía da tela) */}
                        {l.cliente_id
                          ? <><Link href={`${base}/clientes/${l.cliente_id}`} className="link truncate max-md:hidden" onClick={e => e.stopPropagation()}>{l.nome}</Link><span className="md:hidden">{l.nome}</span></>
                          : <span className="truncate text-warn max-md:whitespace-normal" title="Conta sem cliente cadastrado">{l.nome}</span>}
                      </span>
                    </td>
                    <td className="num col-p2"><BarraCelula valor={l.pontos} max={maxPontos} largura={56} /></td>
                    <td className="num col-p3">{n0(l.lotes)}</td>
                    {/* celular: a linha de apoio diz a faixa (só de quem tem) e quanto falta para subir */}
                    <td className={cn('col-p2 whitespace-nowrap cel-sub', !(l.faixa_min > 0) && 'vazio')}>{faixa}</td>
                    <td className={cn('num font-semibold cel-valor', !l.valor_incentivo && 'subtle')}><span className="max-md:hidden">{r0(l.valor_incentivo)}</span><span className="md:hidden">{rLista(l.valor_incentivo)}</span></td>
                    <td className="muted col-p3">{proxima}</td>
                    {/* celular: curto, para caber numa linha ao lado do valor ("pontos" já está no título do bloco
                        e volta no detalhe, em "Faltam para subir"). Com a faixa na frente ("Mais de 10.000 · faltam
                        27.507") o "para subir" não cabe em 390 px e a faixa já diz de onde sobe; sem faixa a linha é
                        curta e leva a frase inteira */}
                    <td className="num col-p2 cel-sub">
                      {l.pontos_faltantes != null
                        ? <><span className="md:hidden">faltam </span>{fmtNum(l.pontos_faltantes)}{!(l.faixa_min > 0) && <span className="md:hidden"> para subir</span>}</>
                        : <><span className="max-md:hidden">{TRACO}</span><span className="md:hidden">faixa máxima</span></>}
                    </td>
                  </tr>
                  {aberta && (
                    <tr className={cn('bg-surface-2 max-md:rounded-lg', alem)}>
                      <td colSpan={7} className="!whitespace-normal">
                        {/* celular: a ficha é o primeiro item do detalhe (no computador o nome já é o link) */}
                        <div className="pb-1 pl-6 pt-2 md:hidden">
                          {l.cliente_id
                            ? <Link href={`${base}/clientes/${l.cliente_id}`} className="link inline-flex min-h-[44px] items-center text-dense font-medium">Abrir ficha do cliente</Link>
                            : <p className="text-dense text-warn">Conta sem cliente cadastrado</p>}
                        </div>
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
              // celular: o total continua no fim (com a busca ou "só com faixa" ligados, é o total filtrado)
              <tr className="total">
                <td className="cel-titulo">Total · {fmtNum(filtradas.length)} clientes</td><td className="num col-p2 cel-sub" data-sufixo="pontos">{n0(total.pontos)}</td><td className="num col-p3 cel-sub" data-sufixo="lotes">{n0(total.lotes)}</td><td className="col-p2" />
                <td className="num cel-valor">{rCurto(total.incentivo)}</td><td className="col-p3" /><td className="col-p2" />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filtradas.length > visiveis.length && (
        <div className="py-2 text-center max-md:hidden">
          <button type="button" className="link text-label" onClick={() => setLimite(n => n + 200)}>mostrar mais ({fmtNum(filtradas.length - visiveis.length)} restantes)</button>
        </div>
      )}
      {restantesNoCelular > 0 && (
        <button type="button" onClick={maisNoCelular}
          className="mt-1 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md bg-surface text-dense font-medium text-fg md:hidden">
          <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
          <span>mostrar mais ({fmtNum(restantesNoCelular)} restantes)</span>
        </button>
      )}
    </Panel>
  )
}
