export const dynamic = 'force-dynamic'

import { contexto, periodoDaUrl, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { diario, ultimaData } from '@/lib/gestao/consultas'
import { diasEntre, inicioSemana, somarDias } from '@/lib/gestao/meses'
import { fmtNum, fmtPct, fmtDelta } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { PeriodoPicker } from '@/components/gestao/Filtros'
import { BarraCelula, LinhaVazia, TRACO, Variacao, dataCurta, n0, n2, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const diaSemana = (iso: string) => DIAS[new Date(iso + 'T12:00:00').getDay()]
const MEDIA_MOVEL = 7

// Inclinação da reta de mínimos quadrados (lotes/dia por dia com giro)
function inclinacao(valores: number[]): number {
  const n = valores.length
  if (n < 2) return 0
  const mx = (n - 1) / 2
  const my = valores.reduce((s, v) => s + v, 0) / n
  let num = 0, den = 0
  valores.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2 })
  return den ? num / den : 0
}

export default async function GiroDiarioPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { corretora, q } = ctx
  const { inicio, fim } = periodoDaUrl(q, 90)
  const duracao = diasEntre(inicio, fim) + 1
  const antFim = somarDias(inicio, -1), antIni = somarDias(antFim, -(duracao - 1))

  const [dias, anterior, ultima] = await Promise.all([diario(corretora, inicio, fim), diario(corretora, antIni, antFim), ultimaData(corretora)])
  // Situação atual (último dia lançado, semana e mês dele)
  const mesIni = ultima ? ultima.slice(0, 7) + '-01' : null
  const atual = ultima && mesIni ? (mesIni >= inicio && ultima <= fim ? dias.filter(d => d.dia >= mesIni && d.dia <= ultima) : await diario(corretora, mesIni, ultima)) : []
  const semIni = ultima ? inicioSemana(ultima) : null

  const lotes = dias.reduce((s, d) => s + d.lotes, 0)
  const zerados = dias.reduce((s, d) => s + d.zerados, 0)
  const receita = dias.reduce((s, d) => s + d.receita, 0)
  const operacoes = dias.reduce((s, d) => s + d.operacoes, 0)
  const lotesAnt = anterior.reduce((s, d) => s + d.lotes, 0)
  const media = dias.length ? lotes / dias.length : 0
  const melhor = dias.reduce<typeof dias[number] | null>((m, d) => (!m || d.lotes > m.lotes ? d : m), null)
  const metade = Math.ceil(dias.length / 2)
  const m1 = dias.slice(0, metade), m2 = dias.slice(metade)
  const media1 = m1.length ? m1.reduce((s, d) => s + d.lotes, 0) / m1.length : 0
  const media2 = m2.length ? m2.reduce((s, d) => s + d.lotes, 0) / m2.length : 0
  const varMetades = media1 ? ((media2 - media1) / media1) * 100 : null
  const slope = inclinacao(dias.map(d => d.lotes))
  const limiar = 0.10 // 10% da média ao longo do período
  const variacaoPeriodo = media && dias.length > 1 ? (slope * (dias.length - 1)) / media : 0
  const tendencia = variacaoPeriodo > limiar ? 'Subindo' : variacaoPeriodo < -limiar ? 'Caindo' : 'Estável'
  const clientesMedia = dias.length ? dias.reduce((s, d) => s + d.clientes, 0) / dias.length : 0
  const clientesMax = Math.max(0, ...dias.map(d => d.clientes))

  // Série com média móvel, acumulado e variação
  const acumulados = dias.reduce<number[]>((acc, d) => { acc.push((acc[acc.length - 1] ?? 0) + d.lotes); return acc }, [])
  const serie = dias.map((d, i) => {
    const acumulado = acumulados[i]
    const janela = dias.slice(Math.max(0, i - MEDIA_MOVEL + 1), i + 1)
    const mm = janela.reduce((s, x) => s + x.lotes, 0) / janela.length
    const ant = i > 0 ? dias[i - 1].lotes : 0
    return { ...d, mm, acumulado, anteriorLotes: ant, acimaMedia: d.lotes >= media }
  })
  const maxLotes = Math.max(0, ...dias.map(d => d.lotes))

  const ultimoDia = atual.find(d => d.dia === ultima)
  const lotesSemana = atual.filter(d => semIni && d.dia >= semIni).reduce((s, d) => s + d.lotes, 0)
  const lotesMes = atual.reduce((s, d) => s + d.lotes, 0)
  const receitaMes = atual.reduce((s, d) => s + d.receita, 0)
  const clientesMesMax = Math.max(0, ...atual.map(d => d.clientes))
  const diasUteisMes = atual.length
  const tomTendencia = tendencia === 'Subindo' ? 'gain' : tendencia === 'Caindo' ? 'loss' : 'neutral'

  return (
    <>
      <PageHeader
        eyebrow={ctx.eyebrow}
        title="Giro diário"
        description="Lotes operados por dia com giro, tendência e comparação com o período anterior de mesma duração."
        actions={<PeriodoPicker inicio={inicio} fim={fim} />}
      />
      <PageBody>
        <KpiRow cols={6}>
          <KpiCard label="Lotes no período" value={fmtNum(lotes)} sub={`${dias.length} dias com giro · ${fmtNum(zerados)} zerados`} />
          <KpiCard label="Média por dia" value={fmtNum(Math.round(media))} sub={melhor ? `maior dia ${fmtNum(melhor.lotes)} em ${dataCurta(melhor.dia)}` : undefined} />
          <KpiCard label="Receita no período" value={rCurto(receita)} sub={`${n2(lotes ? receita / lotes : 0)} R$/lote`} />
          <KpiCard label="Vs período anterior" value={lotesAnt ? fmtDelta(((lotes - lotesAnt) / lotesAnt) * 100) : TRACO} sub={`${fmtNum(lotesAnt)} lotes de ${dataCurta(antIni)} a ${dataCurta(antFim)}`} tone={lotesAnt ? (lotes >= lotesAnt ? 'gain' : 'loss') : 'neutral'} />
          <KpiCard label="Tendência" value={tendencia} sub={`${slope >= 0 ? '+' : ''}${fmtNum(Math.round(slope))} lotes/dia a cada dia · limiar ${fmtPct(limiar * 100, 0)}`} tone={tomTendencia} />
          <KpiCard label="Operações" value={fmtNum(operacoes)} sub={`${duracao} dias no calendário`} />
        </KpiRow>

        <Panel title="Lotes por dia com giro" subtitle={`Barras = lotes do dia · linha = média móvel de ${MEDIA_MOVEL} dias`}>
          <GraficoSeries
            dados={serie.map(d => ({ label: dataCurta(d.dia).slice(0, 5), lotes: d.lotes, mm: Math.round(d.mm) }))}
            series={[{ key: 'lotes', nome: 'Lotes operados', tipo: 'bar' }, { key: 'mm', nome: `Média móvel (${MEDIA_MOVEL})`, tipo: 'line' }]}
            altura={300}
          />
        </Panel>

        <div className="grid gap-8 xl:grid-cols-2">
          <Panel title="Situação atual" subtitle={ultima ? `Última data lançada: ${dataCurta(ultima)}` : 'Nenhum lote lançado ainda.'}>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-dense sm:grid-cols-3">
              <div><dt className="label">Lotes no último dia</dt><dd className="mt-1 text-section font-semibold tabular-nums">{n0(ultimoDia?.lotes)}</dd><p className="text-micro text-fg-subtle">{ultimoDia ? `${fmtNum(ultimoDia.operacoes)} operações · ${fmtNum(ultimoDia.clientes)} clientes` : TRACO}</p></div>
              <div><dt className="label">Lotes na semana</dt><dd className="mt-1 text-section font-semibold tabular-nums">{n0(lotesSemana)}</dd><p className="text-micro text-fg-subtle">{semIni ? `semana de ${dataCurta(semIni)}` : TRACO}</p></div>
              <div><dt className="label">Lotes no mês</dt><dd className="mt-1 text-section font-semibold tabular-nums">{n0(lotesMes)}</dd><p className="text-micro text-fg-subtle">{mesIni ? `${mesIni.slice(5, 7)}/${mesIni.slice(0, 4)} até ${dataCurta(ultima)}` : TRACO}</p></div>
              <div><dt className="label">Receita no mês</dt><dd className="mt-1 text-section font-semibold tabular-nums">{rCurto(receitaMes)}</dd><p className="text-micro text-fg-subtle">{lotesMes ? `${n2(receitaMes / lotesMes)} R$/lote` : TRACO}</p></div>
              <div><dt className="label">Clientes com giro (máx./dia)</dt><dd className="mt-1 text-section font-semibold tabular-nums">{n0(clientesMesMax)}</dd><p className="text-micro text-fg-subtle">no mês atual</p></div>
              <div><dt className="label">Média por dia útil</dt><dd className="mt-1 text-section font-semibold tabular-nums">{diasUteisMes ? fmtNum(Math.round(lotesMes / diasUteisMes)) : TRACO}</dd><p className="text-micro text-fg-subtle">{diasUteisMes} dias com giro no mês</p></div>
            </dl>
          </Panel>

          <Panel title="Resumo do período">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-dense sm:grid-cols-3">
              <div><dt className="text-fg-muted">Dias com giro</dt><dd className="num font-semibold">{dias.length}</dd></div>
              <div><dt className="text-fg-muted">Dias no calendário</dt><dd className="num font-semibold">{duracao}</dd></div>
              <div><dt className="text-fg-muted">Melhor dia</dt><dd className="num font-semibold">{melhor ? `${dataCurta(melhor.dia)} (${diaSemana(melhor.dia)}) · ${fmtNum(melhor.lotes)}` : TRACO}</dd></div>
              <div><dt className="text-fg-muted">1ª metade (lotes/dia)</dt><dd className="num font-semibold">{fmtNum(Math.round(media1))}</dd></div>
              <div><dt className="text-fg-muted">2ª metade (lotes/dia)</dt><dd className="num font-semibold">{fmtNum(Math.round(media2))}</dd></div>
              <div><dt className="text-fg-muted">Var. entre metades</dt><dd className={cn('num font-semibold', varMetades != null && (varMetades > 0.05 ? 'text-gain' : varMetades < -0.05 ? 'text-loss' : ''))}>{varMetades == null ? TRACO : fmtDelta(varMetades)}</dd></div>
              <div><dt className="text-fg-muted">Inclinação (lotes/dia²)</dt><dd className="num font-semibold">{slope.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</dd></div>
              <div><dt className="text-fg-muted">Período anterior</dt><dd className="num font-semibold">{fmtNum(lotesAnt)} lotes · {anterior.length} dias</dd></div>
              <div><dt className="text-fg-muted">Clientes por dia (média · máx.)</dt><dd className="num font-semibold">{fmtNum(Math.round(clientesMedia))} · {fmtNum(clientesMax)}</dd></div>
              <div><dt className="text-fg-muted">Lotes zerados</dt><dd className="num font-semibold">{n0(zerados)}</dd></div>
              <div><dt className="text-fg-muted">Receita</dt><dd className="num font-semibold">{r0(receita)}</dd></div>
              <div><dt className="text-fg-muted">Linhas de operação</dt><dd className="num font-semibold">{fmtNum(operacoes)}</dd></div>
            </dl>
          </Panel>
        </div>

        <Panel title="Dia a dia" subtitle="Mais recente primeiro.">
          <div className="tbl-wrap max-h-[70vh]">
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th>Data</th><th className="col-p2">Dia</th><th className="num">Lotes</th><th className="num col-p2">Zerados</th><th className="num col-p2">Clientes</th><th className="num col-p3">Operações</th>
                  <th className="num">Receita</th><th className="num">Var. dia ant.</th><th className="num col-p3">Média móvel</th><th className="num col-p3">Acumulado</th><th className="num col-p2">vs média</th>
                </tr>
              </thead>
              <tbody>
                {serie.length === 0 && <LinhaVazia colunas={11}>Sem lotes no período.</LinhaVazia>}
                {[...serie].reverse().map(d => (
                  <tr key={d.dia}>
                    <td className="num font-medium">{dataCurta(d.dia)}</td>
                    <td className="muted col-p2">{diaSemana(d.dia)}</td>
                    <td className="num"><BarraCelula valor={d.lotes} max={maxLotes} largura={80} /></td>
                    <td className={cn('num col-p2', !d.zerados && 'subtle')}>{n0(d.zerados)}</td>
                    <td className="num col-p2">{n0(d.clientes)}</td>
                    <td className="num col-p3">{n0(d.operacoes)}</td>
                    <td className="num">{r0(d.receita)}</td>
                    <td className="num"><Variacao atual={d.lotes} anterior={d.anteriorLotes} /></td>
                    <td className="num col-p3">{fmtNum(Math.round(d.mm))}</td>
                    <td className="num muted col-p3">{fmtNum(d.acumulado)}</td>
                    <td className={cn('num col-p2', d.acimaMedia ? 'text-gain' : 'text-loss')}>{d.acimaMedia ? 'acima' : 'abaixo'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </PageBody>
    </>
  )
}
