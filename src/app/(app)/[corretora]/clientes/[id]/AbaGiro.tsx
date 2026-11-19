// Ficha do cliente › Giro: os 12 meses em números, o giro dia a dia, por ativo, como ele opera
// (plataforma e modo) e os lançamentos do extrato.
// No celular (DESIGN.md §8) a aba abre pela frase do mês. "Mês a mês" vira uma lista de meses, do mais
// novo para o mais antigo (a matriz rolava de lado e escondia justamente o mês corrente). "Dia a dia"
// mostra os dias do mês de referência e "Lançamentos" fica fechado no fim: sem a caixa com rolagem
// própria, as duas listas inteiras correriam umas 25 telas; o resto abre no toque (MostrarMais). As duas são
// as mesmas tabelas do computador, com o papel de cada célula (tbl-lista); só a lista de meses tem
// desenho próprio, porque a tabela do computador é indicador por mês.
import type { Contexto } from '@/lib/gestao/pagina'
import { diasOperadosNoMes, fatias, type Fatia, type GiroPorDia } from '@/lib/gestao/fichaCliente'
import { janelaMeses, mesCurto, mesLongo } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { Dica } from '@/components/ui/Dica'
import { Recolhido } from '@/components/ui/Recolhido'
import { Resumo } from '@/components/gestao/Resumo'
import { BarraCelula, CelulaCalor, LinhaVazia, TRACO, dataCurta, n0, n2, r0, rCurto } from '@/components/gestao/Celulas'
import { MostrarMais } from '@/components/ui/MostrarMais'
import { ALEM_NO_CELULAR, SEM_BARRA_NO_CELULAR, diaDaSemana, type Ficha } from './comum'

// Celular: quantos meses ficam à vista na lista de meses; os mais antigos abrem no toque
const MESES_A_VISTA = 4

type MesDaLista = { rotulo: string; lotes: number; zerados: number; receita: number; pontos: number; total?: boolean }

export function AbaGiro({ ctx, ficha, giro }: { ctx: Contexto; ficha: Ficha; giro: GiroPorDia }) {
  const { mesRef } = ctx
  const { mensal, extrato, porAtivo } = ficha
  const meses = janelaMeses(mesRef, 12)
  const mensalPorMes = new Map(mensal.map(m => [m.mes_ref, m]))
  const colMes = (i: number) => (i < meses.length - 4 ? 'col-p2' : '')
  const total12 = mensal.reduce((a, m) => ({ lotes: a.lotes + m.lotes, zerados: a.zerados + m.zerados, receita: a.receita + m.receita, pontos: a.pontos + m.pontos }), { lotes: 0, zerados: 0, receita: 0, pontos: 0 })
  const maxMes = Math.max(0, ...mensal.map(m => m.lotes))
  const totalAtivo = porAtivo.reduce((s, a) => s + a.lotes, 0)
  const maxDia = Math.max(0, ...giro.dias.map(d => d.lotes))
  const noMes = diasOperadosNoMes(giro, mesRef)
  const plataformas = fatias(extrato, 'plataforma')
  const modos = fatias(extrato, 'modo')

  // O que a tela já dizia no subtítulo de "Dia a dia"; no celular é a frase que abre a aba. Quando o
  // extrato não cobre o mês inteiro a conta dos dias não existe: a frase sai dos lotes e da receita do mês.
  const fraseDosDias = noMes ? (noMes.operados ? `Em ${mesCurto(mesRef)}: ${fmtNum(noMes.operados)} ${noMes.operados === 1 ? 'dia' : 'dias'} com giro, média de ${fmtNum(Math.round(noMes.mediaPorDia))} lotes por dia.` : `Sem giro em ${mesCurto(mesRef)}.`) : null
  const doMes = mensalPorMes.get(mesRef)
  const fraseDeAbertura = fraseDosDias
    ?? (doMes?.lotes ? `Em ${mesCurto(mesRef)}: ${n0(doMes.lotes)} lotes${doMes.receita ? ` e ${rCurto(doMes.receita)} de receita` : ''}.` : `Sem giro em ${mesCurto(mesRef)}.`)
  const periodoDoExtrato = giro.completo ? 'Todo o histórico do cliente.' : 'Só os dias mais recentes: o extrato traz os últimos 400 lançamentos.'

  // Celular: a lista de meses começa no primeiro mês com lotes ou receita (o BTG começou em set/26)
  const primeiroComDado = meses.findIndex(m => { const x = mensalPorMes.get(m); return !!x && (x.lotes > 0 || x.receita > 0) })
  const mesesDaLista: MesDaLista[] = (primeiroComDado < 0 ? [mesRef] : meses.slice(primeiroComDado)).reverse().map(m => {
    const x = mensalPorMes.get(m)
    return { rotulo: mesCurto(m), lotes: x?.lotes ?? 0, zerados: x?.zerados ?? 0, receita: x?.receita ?? 0, pontos: x?.pontos ?? 0 }
  })
  const mesesAntigos = mesesDaLista.slice(MESES_A_VISTA)

  // Celular: o que é do mês de referência fica à vista; o resto abre no toque
  const prefixo = mesRef.slice(0, 7)
  const diasFora = giro.dias.filter(d => !d.dia.startsWith(prefixo)).length
  const diasDoMes = giro.dias.length - diasFora
  const lancFora = extrato.filter(l => !l.data.startsWith(prefixo)).length
  const lancDoMes = extrato.length - lancFora
  // só separa os lançamentos em duas etapas quando há dos dois lados
  const separaLanc = lancDoMes > 0 && lancFora > 0

  const tabelaDias = (
    <div className="tbl-wrap max-h-[520px]">
      <table className="tbl tbl-dense tbl-lista">
        <thead><tr><th>Data</th><th className="col-p2">Dia</th><th className="num">Lotes</th><th className="num col-p2">Zerados</th><th className="num col-p3">Lançamentos</th><th className="col-p2">Ativos</th><th className="num">Receita</th></tr></thead>
        <tbody>
          {giro.dias.length === 0 && <LinhaVazia colunas={7}>Sem lançamentos nesta corretora.</LinhaVazia>}
          {giro.dias.length > 0 && diasDoMes === 0 && (
            <tr className="md:hidden"><td colSpan={7} className="text-dense text-fg-subtle">{noMes ? `Sem giro em ${mesCurto(mesRef)}.` : `Os dias de ${mesCurto(mesRef)} não estão entre os mais recentes.`}</td></tr>
          )}
          {giro.dias.map(d => {
            const fora = !d.dia.startsWith(prefixo)
            return (
              // no celular: a data com o dia da semana, os lotes à direita e, embaixo, os zerados, os ativos e a receita
              <tr key={d.dia} className={cn(fora && 'text-fg-muted', fora && ALEM_NO_CELULAR)}>
                <td className="cel-titulo whitespace-nowrap font-medium tabular-nums">{dataCurta(d.dia)}<span className="font-normal text-fg-subtle md:hidden"> {diaDaSemana(d.dia)}</span></td>
                <td className="muted col-p2">{diaDaSemana(d.dia)}</td>
                <td className="cel-valor num" data-rotulo="lotes"><BarraCelula valor={d.lotes} max={maxDia} largura={72} className={SEM_BARRA_NO_CELULAR} /></td>
                <td className={cn('cel-sub num col-p2', !d.zerados && 'subtle vazio')}>{n0(d.zerados)}<span className="md:hidden"> zerados</span></td>
                <td className="num col-p3">{n0(d.operacoes)}</td>
                <td className={cn('cel-sub muted col-p2', d.ativos.length === 0 && 'vazio')}>{d.ativos.join(' · ') || TRACO}</td>
                <td className={cn('cel-sub num', !d.receita && 'vazio')}>{r0(d.receita)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const tabelaLancamentos = (
    <div className="tbl-wrap max-h-[520px]">
      <table className="tbl tbl-dense tbl-lista">
        <thead>
          <tr><th>Data</th><th className="num col-p3">Conta</th><th>Ativo</th><th className="col-p2">Plataforma</th><th className="col-p3">Modo</th><th className="num">Operados</th><th className="num col-p2">Zerados</th><th className="num col-p3">Tarifa</th><th className="num">Receita</th></tr>
        </thead>
        <tbody>
          {extrato.length === 0 && <LinhaVazia colunas={9}>Sem lançamentos.</LinhaVazia>}
          {extrato.map(l => {
            const fora = !l.data.startsWith(prefixo)
            const receita = l.receita_corretagem + l.receita_zeragem
            return (
              // no celular: a data com o ativo, os operados à direita e, embaixo, a conta (sem ela o mesmo dia
              // e o mesmo ativo parecem repetidos), a plataforma, o modo, os zerados, a tarifa e a receita
              <tr key={l.id} className={cn(fora && 'text-fg-muted', separaLanc && fora && ALEM_NO_CELULAR)}>
                <td className="cel-titulo whitespace-nowrap tabular-nums">{dataCurta(l.data)}<span className="md:hidden"> · {l.ativo ?? TRACO}</span></td>
                <td className={cn('cel-sub num muted col-p3', !l.conta && 'vazio')} data-rotulo="conta">{l.conta ?? TRACO}</td>
                <td className="font-medium">{l.ativo ?? TRACO}</td>
                <td className={cn('cel-sub muted col-p2', !l.plataforma && 'vazio')}>{l.plataforma ?? TRACO}</td>
                <td className={cn('cel-sub muted col-p3', !l.modo && 'vazio')}>{l.modo ?? TRACO}</td>
                <td className={cn('cel-valor num', !l.lotes_operados && 'subtle')} data-rotulo="operados">{n0(l.lotes_operados)}</td>
                <td className={cn('cel-sub num col-p2', !l.lotes_zerados && 'subtle vazio')}>{n0(l.lotes_zerados)}<span className="md:hidden"> zerados</span></td>
                <td className={cn('cel-sub num col-p3', !l.tarifa && 'vazio')} data-rotulo="tarifa">{n2(l.tarifa)}</td>
                <td className={cn('cel-sub num', !receita && 'vazio')}>{r0(receita)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      <div className="md:hidden"><Resumo frase={fraseDeAbertura} /></div>

      <Panel title="Mês a mês" subtitle={<span className="max-md:hidden">{`Lotes, zerados, receita e pontos de ${mesCurto(meses[0])} a ${mesCurto(mesRef)}.`}</span>}>
        <div className="tbl-wrap max-md:hidden">
          <table className="tbl tbl-dense">
            <thead>
              <tr><th className="sticky-col">Indicador</th>{meses.map((m, i) => <th key={m} className={cn('num', colMes(i), m === mesRef && 'text-fg')}>{mesCurto(m)}</th>)}<th className="num">12 m</th></tr>
            </thead>
            <tbody>
              <tr><td className="sticky-col font-semibold">Lotes operados</td>{meses.map((m, i) => <CelulaCalor key={m} valor={mensalPorMes.get(m)?.lotes ?? 0} max={maxMes} className={colMes(i)} />)}<td className="num font-semibold">{n0(total12.lotes)}</td></tr>
              <tr><td className="sticky-col">Lotes zerados</td>{meses.map((m, i) => <td key={m} className={cn('num', colMes(i), !mensalPorMes.get(m)?.zerados && 'subtle')}>{n0(mensalPorMes.get(m)?.zerados)}</td>)}<td className="num font-semibold">{n0(total12.zerados)}</td></tr>
              <tr><td className="sticky-col">Receita</td>{meses.map((m, i) => <td key={m} className={cn('num', colMes(i), !mensalPorMes.get(m)?.receita && 'subtle')}>{rCurto(mensalPorMes.get(m)?.receita)}</td>)}<td className="num font-semibold">{rCurto(total12.receita)}</td></tr>
              <tr><td className="sticky-col">Pontos</td>{meses.map((m, i) => <td key={m} className={cn('num', colMes(i), !mensalPorMes.get(m)?.pontos && 'subtle')}>{n0(mensalPorMes.get(m)?.pontos)}</td>)}<td className="num font-semibold">{n0(total12.pontos)}</td></tr>
            </tbody>
          </table>
        </div>
        {/* só no celular: um mês por linha, com os lotes à direita e, embaixo, a receita, os zerados e os pontos */}
        <div className="md:hidden">
          <ListaDeMeses itens={mesesDaLista.slice(0, MESES_A_VISTA)} />
          {mesesAntigos.length > 0 && (
            <Recolhido tamanho="linha" titulo={mesesAntigos.length === 1 ? 'Ver o outro mês' : `Ver os outros ${mesesAntigos.length} meses`}>
              <ListaDeMeses itens={mesesAntigos} />
            </Recolhido>
          )}
          <ListaDeMeses itens={[{ rotulo: '12 meses', ...total12, total: true }]} />
        </div>
      </Panel>

      <div className="grid gap-8 xl:grid-cols-3">
        <Panel className="xl:col-span-2"
          title={<>Dia a dia<span className="max-md:hidden"> · {fmtNum(giro.dias.length)} {giro.dias.length === 1 ? 'dia' : 'dias'} com giro</span><Dica className="ml-1.5 md:hidden" texto={periodoDoExtrato} /></>}
          subtitle={<span className="max-md:hidden">{[fraseDosDias, periodoDoExtrato].filter(Boolean).join(' ')}</span>}>
          {diasFora > 0
            ? <MostrarMais rotulo={diasDoMes > 0 ? `Ver os outros dias (${fmtNum(diasFora)})` : `Ver os dias de outros meses (${fmtNum(diasFora)})`}>{tabelaDias}</MostrarMais>
            : tabelaDias}
        </Panel>

        <div className="min-w-0 space-y-5">
          <Panel variant="card" title="Por ativo" subtitle="Todo o histórico · participação nos lotes.">
            {porAtivo.length === 0 ? (
              <p className="text-dense text-fg-subtle">Sem lançamentos.</p>
            ) : (
              <ul className="space-y-2.5">
                {porAtivo.slice(0, 8).map(a => (
                  <li key={a.ativo}>
                    <div className="flex items-baseline justify-between gap-3 text-dense">
                      <span className="font-medium">{a.ativo}</span>
                      <span className="tabular-nums text-fg-muted">{n0(a.lotes)} · {totalAtivo ? fmtPct((a.lotes / totalAtivo) * 100, 0) : TRACO}</span>
                    </div>
                    <div className="bar-track mt-1 h-1.5" aria-hidden><div className="bar-fill" style={{ width: `${totalAtivo ? (a.lotes / totalAtivo) * 100 : 0}%`, opacity: 0.7 }} /></div>
                  </li>
                ))}
                {porAtivo.length > 8 && <li className="text-micro text-fg-subtle">+ {porAtivo.length - 8} ativos com menos lotes</li>}
              </ul>
            )}
          </Panel>

          {/* celular: o período (os últimos 400 lançamentos) vai para o "i", para o subtítulo caber em uma linha */}
          <Panel variant="card"
            title={<>Como opera{!giro.completo && <Dica className="ml-1.5 md:hidden" texto="Pela fatia dos lotes nos últimos 400 lançamentos." />}</>}
            subtitle={giro.completo ? 'Plataforma e modo, pela fatia dos lotes.' : <>Plataforma e modo, pela fatia dos lotes<span className="max-md:hidden"> nos últimos 400 lançamentos</span>.</>}>
            {plataformas.length === 0 ? (
              <p className="text-dense text-fg-subtle">Sem lançamentos.</p>
            ) : (
              <dl className="space-y-3 text-dense">
                <Fatias rotulo="Plataforma" itens={plataformas} />
                <Fatias rotulo="Modo" itens={modos} />
              </dl>
            )}
          </Panel>
        </div>
      </div>

      {/* celular: fechado; abre primeiro os lançamentos do mês e, num segundo toque, os outros */}
      <Panel title="Lançamentos" subtitle={<span className="max-md:hidden">{`Os mais recentes (até 400) · ${mesLongo(mesRef)} em destaque.`}</span>}>
        {extrato.length === 0 ? tabelaLancamentos : (
          <MostrarMais rotulo={separaLanc ? `Ver os lançamentos de ${mesCurto(mesRef)} (${fmtNum(lancDoMes)})` : `Ver os lançamentos (${fmtNum(extrato.length)})`}>
            <div className={ALEM_NO_CELULAR}>
              {separaLanc
                ? <MostrarMais rotulo={`Ver os outros lançamentos (${fmtNum(lancFora)})`}>{tabelaLancamentos}</MostrarMais>
                : tabelaLancamentos}
            </div>
          </MostrarMais>
        )}
      </Panel>
    </>
  )
}

// Só no celular: os meses em lista (tbl-lista). A linha de total leva o nome "12 meses".
function ListaDeMeses({ itens }: { itens: MesDaLista[] }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl tbl-lista">
        <tbody>
          {itens.map(m => (
            <tr key={m.rotulo} className={m.total ? 'total' : undefined}>
              <td className="cel-titulo tabular-nums">{m.rotulo}</td>
              <td className={cn('cel-valor', !m.lotes && 'subtle')} data-rotulo="lotes">{n0(m.lotes)}</td>
              <td className={cn('cel-sub', !m.receita && 'vazio')}>{rCurto(m.receita)}</td>
              <td className={cn('cel-sub', !m.zerados && 'vazio')}>{n0(m.zerados)} zerados</td>
              <td className={cn('cel-sub', !m.pontos && 'vazio')}>{n0(m.pontos)} pontos</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// "Nelogica 92% · MetaTrader 8%": as três maiores fatias
function Fatias({ rotulo, itens }: { rotulo: string; itens: Fatia[] }) {
  return (
    <div>
      <dt className="text-fg-subtle">{rotulo}</dt>
      <dd className="mt-0.5">
        {itens.slice(0, 3).map((f, i) => (
          <span key={f.nome}>{i > 0 && <span className="text-fg-subtle"> · </span>}<span className="font-medium">{f.nome}</span> <span className="tabular-nums text-fg-muted">{fmtPct(f.pct, 0)}</span></span>
        ))}
        {itens.length > 3 && <span className="text-fg-subtle"> · + {itens.length - 3}</span>}
      </dd>
    </div>
  )
}
