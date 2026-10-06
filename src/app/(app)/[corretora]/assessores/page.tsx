export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { termosDaCorretora } from '@/lib/corretoras'
import { assessoresMensal, assessoresResumo, parametrosDaCorretora, topClientes } from '@/lib/gestao/consultas'
import { janelaMeses, limitesDoMes, mesCurto, mesLongo } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { MesPicker, SelectParam } from '@/components/gestao/Filtros'
import { BarraCelula, CelulaCalor, LinhaVazia, TRACO, Variacao, n0, n2, r0, rCurto } from '@/components/gestao/Celulas'
import type { TopClienteRow } from '@/lib/gestao/tipos'

export default async function AssessoresPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { corretora, mesRef, base, q } = ctx
  const meses = janelaMeses(mesRef, 12)
  const lim = limitesDoMes(mesRef)
  const assessorSel = q.assessor ?? ''

  const [resumo, mensal, topMes, top12, par] = await Promise.all([
    assessoresResumo(corretora, mesRef),
    assessoresMensal(corretora, mesRef, 12),
    topClientes(corretora, lim.inicio, lim.fim, assessorSel || null, 20),
    topClientes(corretora, meses[0], lim.fim, assessorSel || null, 20),
    parametrosDaCorretora(corretora),
  ])

  const totalLotes = resumo.reduce((s, a) => s + a.lotes, 0)
  const totalReceita = resumo.reduce((s, a) => s + a.receita, 0)
  const totalAnterior = resumo.reduce((s, a) => s + a.lotes_mes_anterior, 0)
  const lotes12 = resumo.reduce((s, a) => s + a.lotes_12m, 0)
  const receita12 = resumo.reduce((s, a) => s + a.receita_12m, 0)
  const comGiro = resumo.filter(a => a.lotes > 0).length
  const cadastrados = par.assessores.filter(a => a.ativo).length
  // "clientes ativos" soma por assessor (um cliente pode aparecer em dois assessores)
  const clientesAtivos = resumo.reduce((s, a) => s + a.clientes_ativos, 0)

  // Mapas de calor: assessor × mês (ordem do resumo)
  const ordem = resumo.map(a => a.assessor_nome)
  const porAssessorMes = new Map<string, Map<string, { lotes: number; receita: number }>>()
  for (const m of mensal) {
    if (!porAssessorMes.has(m.assessor_nome)) porAssessorMes.set(m.assessor_nome, new Map())
    porAssessorMes.get(m.assessor_nome)!.set(m.mes_ref, { lotes: m.lotes, receita: m.receita })
  }
  for (const nome of porAssessorMes.keys()) if (!ordem.includes(nome)) ordem.push(nome)
  const maxLotesMes = Math.max(0, ...mensal.map(m => m.lotes))
  const maxReceitaMes = Math.max(0, ...mensal.map(m => m.receita))
  const opcoesAssessor = [...new Set([...resumo.map(a => a.assessor_nome), ...par.assessores.map(a => a.nome)])].sort().map(n => ({ valor: n, label: n }))
  const colMes = (i: number) => (i < meses.length - 4 ? 'col-p2' : '')

  return (
    <>
      <PageHeader
        eyebrow={ctx.eyebrow}
        title={termosDaCorretora(corretora).assessores}
        description={`Lotes, receita e clientes por assessor · ${mesLongo(mesRef)} e janela de ${mesCurto(meses[0])} a ${mesCurto(mesRef)}.`}
        actions={<><SelectParam param="assessor" valor={assessorSel} opcoes={opcoesAssessor} label="Rankings" todos="Todos os assessores" /><MesPicker valor={mesRef} /></>}
      />
      <PageBody>
        <KpiRow cols={6}>
          <KpiCard label="Lotes no mês" value={fmtNum(totalLotes)} delta={{ atual: totalLotes, anterior: totalAnterior, rotulo: 'vs mês anterior', fmt: fmtNum }} />
          <KpiCard label="Receita no mês" value={rCurto(totalReceita)} />
          <KpiCard label="Clientes ativos" value={fmtNum(clientesAtivos)} sub="soma por assessor" />
          <KpiCard label="Assessores com giro" value={`${comGiro} de ${cadastrados}`} sub="cadastrados em Parâmetros" />
          <KpiCard label="Lotes 12 meses" value={fmtNum(lotes12)} />
          <KpiCard label="Receita 12 meses" value={rCurto(receita12)} />
        </KpiRow>

        <Panel title="Resumo por assessor" subtitle="Mês de referência · do maior para o menor giro.">
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th>Assessor</th><th className="col-p3">Resp.</th><th className="num col-p2">Clientes ativos</th><th className="num">Lotes</th><th className="num col-p2">Zerados</th>
                  <th className="num col-p3">Rec. corretagem</th><th className="num col-p3">Rec. zeragem</th><th className="num">Receita</th><th className="num col-p2">% dos lotes</th>
                  <th className="num col-p3">Lotes / cliente</th><th className="num col-p3">Tarifa</th><th className="num col-p2">Lotes 12 m</th><th className="num col-p3">Receita 12 m</th><th className="num col-p2">Var. mês ant.</th>
                </tr>
              </thead>
              <tbody>
                {resumo.length === 0 && <LinhaVazia colunas={14}>Sem lotes na janela.</LinhaVazia>}
                {resumo.map(a => (
                  <tr key={a.assessor_nome}>
                    <td className="font-medium"><Link href={`${base}/assessores?assessor=${encodeURIComponent(a.assessor_nome)}&mes=${mesRef.slice(0, 7)}`} className="link">{a.assessor_nome}</Link></td>
                    <td className="muted col-p3">{a.responsavel ?? TRACO}</td>
                    <td className="num col-p2">{n0(a.clientes_ativos)}</td>
                    <td className="num"><BarraCelula valor={a.lotes} max={resumo[0]?.lotes ?? 0} largura={80} /></td>
                    <td className={cn('num col-p2', !a.zerados && 'subtle')}>{n0(a.zerados)}</td>
                    <td className="num col-p3">{r0(a.receita_corretagem)}</td>
                    <td className={cn('num col-p3', !a.receita_zeragem && 'subtle')}>{r0(a.receita_zeragem)}</td>
                    <td className="num font-semibold">{r0(a.receita)}</td>
                    <td className="num col-p2">{totalLotes ? fmtPct((a.lotes / totalLotes) * 100) : TRACO}</td>
                    <td className="num col-p3">{a.clientes_ativos ? n2(Math.round((a.lotes / a.clientes_ativos) * 10) / 10) : TRACO}</td>
                    <td className="num col-p3">{a.tarifa == null ? <span className="text-warn" title="Assessor não cadastrado em Parâmetros">?</span> : n2(a.tarifa)}{a.tipo_zeragem === 'FIXA' ? <span className="ml-1 text-micro text-fg-subtle">fixa</span> : ''}</td>
                    <td className="num col-p2">{n0(a.lotes_12m)}</td>
                    <td className="num col-p3">{r0(a.receita_12m)}</td>
                    <td className="num col-p2"><Variacao atual={a.lotes} anterior={a.lotes_mes_anterior} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Giro mensal por assessor" subtitle="Lotes operados nos últimos 12 meses · o último mês pode estar parcial.">
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead><tr><th className="sticky-col">Assessor</th>{meses.map((m, i) => <th key={m} className={cn('num', colMes(i), m === mesRef && 'text-fg')}>{mesCurto(m)}</th>)}<th className="num">Total</th></tr></thead>
              <tbody>
                {ordem.map(nome => {
                  const linha = porAssessorMes.get(nome)
                  const total = meses.reduce((s, m) => s + (linha?.get(m)?.lotes ?? 0), 0)
                  return (
                    <tr key={nome}>
                      <td className="sticky-col max-w-[200px] truncate font-medium">{nome}</td>
                      {meses.map((m, i) => <CelulaCalor key={m} valor={linha?.get(m)?.lotes ?? 0} max={maxLotesMes} className={colMes(i)} />)}
                      <td className="num font-semibold">{n0(total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Receita mensal por assessor" subtitle="Corretagem + zeragem · mesma ordem e meses.">
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead><tr><th className="sticky-col">Assessor</th>{meses.map((m, i) => <th key={m} className={cn('num', colMes(i), m === mesRef && 'text-fg')}>{mesCurto(m)}</th>)}<th className="num">Total</th></tr></thead>
              <tbody>
                {ordem.map(nome => {
                  const linha = porAssessorMes.get(nome)
                  const total = meses.reduce((s, m) => s + (linha?.get(m)?.receita ?? 0), 0)
                  return (
                    <tr key={nome}>
                      <td className="sticky-col max-w-[200px] truncate font-medium">{nome}</td>
                      {meses.map((m, i) => <CelulaCalor key={m} valor={linha?.get(m)?.receita ?? 0} max={maxReceitaMes} tom="accent" fmt={rCurto} className={colMes(i)} />)}
                      <td className="num font-semibold">{rCurto(total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Maiores clientes" subtitle={`Top 20 · ${assessorSel || 'todos os assessores'}`}>
          <div className="grid gap-8 2xl:grid-cols-2">
            <TabelaTop base={base} titulo={`Mês ${mesCurto(mesRef)}`} dados={topMes} />
            <TabelaTop base={base} titulo={`12 meses · ${mesCurto(meses[0])} a ${mesCurto(mesRef)}`} dados={top12} />
          </div>
        </Panel>
      </PageBody>
    </>
  )
}

function TabelaTop({ titulo, dados, base }: { titulo: string; dados: TopClienteRow[]; base: string }) {
  return (
    <div className="min-w-0">
      <p className="label mb-2">{titulo}</p>
      <div className="tbl-wrap">
        <table className="tbl tbl-dense">
          <thead><tr><th className="num">#</th><th>Cliente</th><th className="col-p2">Assessor</th><th className="num">Lotes</th><th className="num col-p3">Zerados</th><th className="num col-p2">Receita</th><th className="num">% lotes</th></tr></thead>
          <tbody>
            {dados.length === 0 && <LinhaVazia colunas={7}>Sem lotes.</LinhaVazia>}
            {dados.map((c, i) => (
              <tr key={`${c.cliente_id ?? c.cliente_nome}-${i}`}>
                <td className="num muted">{i + 1}</td>
                <td className="max-w-[220px] truncate">{c.cliente_id ? <Link href={`${base}/clientes/${c.cliente_id}`} className="link">{c.cliente_nome}</Link> : <span className="text-warn" title="Conta não cadastrada">{c.cliente_nome}</span>}</td>
                <td className="max-w-[160px] truncate muted col-p2">{c.assessor_nome ?? TRACO}</td>
                <td className="num"><BarraCelula valor={c.lotes} max={dados[0]?.lotes ?? 0} largura={64} /></td>
                <td className={cn('num col-p3', !c.zerados && 'subtle')}>{n0(c.zerados)}</td>
                <td className="num col-p2">{r0(c.receita)}</td>
                <td className="num">{fmtPct(c.pct_lotes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
