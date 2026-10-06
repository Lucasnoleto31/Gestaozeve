export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { incentivoHistorico, incentivoMes, parametrosDaCorretora } from '@/lib/gestao/consultas'
import { janelaMeses, mesCurto, mesLongo } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { MesPicker } from '@/components/gestao/Filtros'
import { BarraCelula, LinhaVazia, TRACO, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { TabelaIncentivo } from './TabelaIncentivo'

export default async function IncentivoPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { corretora, mesRef, base } = ctx
  const meses = janelaMeses(mesRef, 12)
  const [linhas, hist, par] = await Promise.all([incentivoMes(corretora, mesRef), incentivoHistorico(corretora, mesRef, 12), parametrosDaCorretora(corretora)])

  const total = linhas.reduce((s, l) => s + l.valor_incentivo, 0)
  const comFaixa = linhas.filter(l => l.valor_incentivo > 0)
  const pontos = linhas.reduce((s, l) => s + l.pontos, 0)
  const lotes = linhas.reduce((s, l) => s + l.lotes, 0)
  const total12 = hist.reduce((s, h) => s + h.incentivo, 0)
  const maior = comFaixa[0]
  const proximo = [...linhas].filter(l => l.pontos_faltantes != null && l.pontos_faltantes > 0).sort((a, b) => (a.pontos_faltantes ?? 0) - (b.pontos_faltantes ?? 0))[0]
  const primeiraFaixa = par.faixas[0]?.pontos_min ?? 1000
  const histMap = new Map(hist.map(h => [h.mes_ref, h]))
  const mult = par.multiplicadores.map(m => `${m.produto} ×${m.pontos}`).join(' · ')
  const maxHist = Math.max(0, ...hist.map(x => x.incentivo))

  return (
    <>
      <PageHeader
        eyebrow={ctx.eyebrow}
        title="Incentivo"
        description={`Bônus pago pela ${ctx.label} por cliente: pontos = lotes × multiplicador do produto; faixa = maior mínimo ultrapassado · ${mesLongo(mesRef)}${ctx.mesEscolhido ? '' : ' (parcial)'}.`}
        actions={<MesPicker valor={mesRef} />}
      />
      <PageBody>
        <KpiRow cols={6}>
          <KpiCard label="Incentivo do mês" value={rCurto(total)} sub={`${fmtNum(linhas.length)} clientes pontuando`} />
          <KpiCard label="Clientes com faixa" value={fmtNum(comFaixa.length)} sub={linhas.length ? `${fmtPct((comFaixa.length / linhas.length) * 100, 0)} dos que pontuam` : undefined} />
          <KpiCard label={`Até ${fmtNum(primeiraFaixa)} pontos`} value={fmtNum(linhas.length - comFaixa.length)} sub="ativos no mês, sem incentivo" />
          <KpiCard label="Pontos no mês" value={fmtNum(pontos)} sub={`${fmtNum(lotes)} lotes operados`} />
          <KpiCard label="Incentivo 12 meses" value={rCurto(total12)} sub={`${mesCurto(meses[0])} a ${mesCurto(mesRef)}`} />
          <KpiCard label="Maior incentivo" value={<span className="truncate text-section" title={maior?.nome}>{maior?.nome ?? TRACO}</span>} sub={maior ? `${rCurto(maior.valor_incentivo)} · mais de ${fmtNum(maior.faixa_min)}` : 'ninguém com faixa'} />
        </KpiRow>

        <div className="grid gap-8 xl:grid-cols-3">
          <Panel className="xl:col-span-2" title="Incentivo por mês" subtitle="Valor pago e clientes com faixa.">
            <GraficoSeries
              dados={meses.map(m => ({ label: mesCurto(m), incentivo: histMap.get(m)?.incentivo ?? 0, faixa: histMap.get(m)?.clientes_com_faixa ?? 0 }))}
              series={[{ key: 'incentivo', nome: 'Incentivo', tipo: 'bar', formato: 'brl' }, { key: 'faixa', nome: 'Clientes com faixa', tipo: 'line', eixo: 'dir', formato: 'num' }]}
              formato="brl" formatoDir="num" altura={240}
            />
          </Panel>
          <Panel title="Regras em vigor" subtitle={<Link href={`${base}/parametros`} className="link">editar em Parâmetros</Link>}>
            <p className="label mb-1">Multiplicadores</p>
            <p className="mb-4 text-dense text-fg-muted">{mult || 'nenhum cadastrado'}</p>
            <p className="label mb-1">Faixas (pontos acima do mínimo)</p>
            <table className="tbl tbl-dense w-full">
              <thead><tr><th>Faixa</th><th className="num">Incentivo</th><th className="num">Clientes</th></tr></thead>
              <tbody>
                {par.faixas.map(f => (
                  <tr key={f.pontos_min}><td>Mais de {fmtNum(f.pontos_min)}</td><td className="num">{r0(f.valor)}</td><td className={cn('num', !linhas.filter(l => l.faixa_min === f.pontos_min).length && 'subtle')}>{n0(linhas.filter(l => l.faixa_min === f.pontos_min).length)}</td></tr>
                ))}
                {par.faixas.length === 0 && <LinhaVazia colunas={3}>Sem faixas cadastradas.</LinhaVazia>}
              </tbody>
            </table>
            {par.consolidados.length > 0 && <p className="mt-3 text-label text-fg-muted">Consolidados (somam pelo nome): {par.consolidados.map(c => c.nome).join(', ')}</p>}
            {proximo && <p className="mt-3 text-label text-fg-muted">Mais perto de subir de faixa: <span className="text-fg">{proximo.nome}</span> · faltam {fmtNum(proximo.pontos_faltantes ?? 0)} pontos para {fmtNum(proximo.proxima_faixa ?? 0)}</p>}
          </Panel>
        </div>

        <TabelaIncentivo linhas={linhas} base={base} mesRef={mesRef} />

        <Panel title="Histórico mensal" subtitle="Todo o histórico de lotes.">
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead><tr><th>Mês</th><th className="num col-p2">Pontos</th><th className="num">Clientes pontuando</th><th className="num">Com faixa</th><th className="num">Incentivo</th></tr></thead>
              <tbody>
                {meses.map(m => {
                  const h = histMap.get(m)
                  return (
                    <tr key={m} className={cn(m === mesRef && 'font-semibold')}>
                      <td>{mesCurto(m)}</td><td className="num col-p2">{n0(h?.pontos)}</td><td className="num">{n0(h?.clientes_pontuando)}</td><td className="num">{n0(h?.clientes_com_faixa)}</td>
                      <td className="num"><BarraCelula valor={h?.incentivo ?? 0} max={maxHist} fmt={rCurto} largura={80} /></td>
                    </tr>
                  )
                })}
                <tr className="total"><td>12 m</td><td className="num col-p2">{n0(hist.reduce((s, h) => s + h.pontos, 0))}</td><td></td><td></td><td className="num">{rCurto(total12)}</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>
      </PageBody>
    </>
  )
}
