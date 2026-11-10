// Ficha do cliente › Giro: os 12 meses em números, o giro dia a dia, por ativo, como ele opera
// (plataforma e modo) e os lançamentos do extrato.
import type { Contexto } from '@/lib/gestao/pagina'
import { diasOperadosNoMes, fatias, type Fatia, type GiroPorDia } from '@/lib/gestao/fichaCliente'
import { janelaMeses, mesCurto, mesLongo } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { BarraCelula, CelulaCalor, LinhaVazia, TRACO, dataCurta, n0, n2, r0, rCurto } from '@/components/gestao/Celulas'
import { diaDaSemana, type Ficha } from './comum'

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

  return (
    <>
      <Panel title="Mês a mês" subtitle={`Lotes, zerados, receita e pontos de ${mesCurto(meses[0])} a ${mesCurto(mesRef)}.`}>
        <div className="tbl-wrap">
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
      </Panel>

      <div className="grid gap-8 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title={`Dia a dia · ${fmtNum(giro.dias.length)} ${giro.dias.length === 1 ? 'dia' : 'dias'} com giro`}
          subtitle={[
            noMes ? (noMes.operados ? `Em ${mesCurto(mesRef)}: ${fmtNum(noMes.operados)} ${noMes.operados === 1 ? 'dia' : 'dias'} com giro, média de ${fmtNum(Math.round(noMes.mediaPorDia))} lotes por dia.` : `Sem giro em ${mesCurto(mesRef)}.`) : null,
            giro.completo ? 'Todo o histórico do cliente.' : 'Só os dias mais recentes: o extrato traz os últimos 400 lançamentos.',
          ].filter(Boolean).join(' ')}>
          <div className="tbl-wrap max-h-[520px]">
            <table className="tbl tbl-dense">
              <thead><tr><th>Data</th><th className="col-p2">Dia</th><th className="num">Lotes</th><th className="num col-p2">Zerados</th><th className="num col-p3">Lançamentos</th><th className="col-p2">Ativos</th><th className="num">Receita</th></tr></thead>
              <tbody>
                {giro.dias.length === 0 && <LinhaVazia colunas={7}>Sem lançamentos nesta corretora.</LinhaVazia>}
                {giro.dias.map(d => (
                  <tr key={d.dia} className={cn(!d.dia.startsWith(mesRef.slice(0, 7)) && 'text-fg-muted')}>
                    <td className="whitespace-nowrap font-medium tabular-nums">{dataCurta(d.dia)}</td>
                    <td className="muted col-p2">{diaDaSemana(d.dia)}</td>
                    <td className="num"><BarraCelula valor={d.lotes} max={maxDia} largura={72} /></td>
                    <td className={cn('num col-p2', !d.zerados && 'subtle')}>{n0(d.zerados)}</td>
                    <td className="num col-p3">{n0(d.operacoes)}</td>
                    <td className="muted col-p2">{d.ativos.join(' · ') || TRACO}</td>
                    <td className="num">{r0(d.receita)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

          <Panel variant="card" title="Como opera" subtitle={giro.completo ? 'Plataforma e modo, pela fatia dos lotes.' : 'Plataforma e modo, pela fatia dos lotes nos últimos 400 lançamentos.'}>
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

      <Panel title="Lançamentos" subtitle={`Os mais recentes (até 400) · ${mesLongo(mesRef)} em destaque.`}>
        <div className="tbl-wrap max-h-[520px]">
          <table className="tbl tbl-dense">
            <thead>
              <tr><th>Data</th><th className="num col-p3">Conta</th><th>Ativo</th><th className="col-p2">Plataforma</th><th className="col-p3">Modo</th><th className="num">Operados</th><th className="num col-p2">Zerados</th><th className="num col-p3">Tarifa</th><th className="num">Receita</th></tr>
            </thead>
            <tbody>
              {extrato.length === 0 && <LinhaVazia colunas={9}>Sem lançamentos.</LinhaVazia>}
              {extrato.map(l => (
                <tr key={l.id} className={cn(!l.data.startsWith(mesRef.slice(0, 7)) && 'text-fg-muted')}>
                  <td className="whitespace-nowrap tabular-nums">{dataCurta(l.data)}</td><td className="num muted col-p3">{l.conta ?? TRACO}</td><td className="font-medium">{l.ativo ?? TRACO}</td>
                  <td className="muted col-p2">{l.plataforma ?? TRACO}</td><td className="muted col-p3">{l.modo ?? TRACO}</td>
                  <td className={cn('num', !l.lotes_operados && 'subtle')}>{n0(l.lotes_operados)}</td><td className={cn('num col-p2', !l.lotes_zerados && 'subtle')}>{n0(l.lotes_zerados)}</td>
                  <td className="num col-p3">{n2(l.tarifa)}</td><td className="num">{r0(l.receita_corretagem + l.receita_zeragem)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
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
