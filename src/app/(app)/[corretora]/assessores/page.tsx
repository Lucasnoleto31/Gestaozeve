export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { assessoresMensal, assessoresResumo, parametrosDaCorretora, topClientes } from '@/lib/gestao/consultas'
import { janelaMeses, limitesDoMes, mesCurto, mesLongo } from '@/lib/gestao/meses'
import { fmtNum, fmtPct, fmtDelta } from '@/lib/format'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { MesPicker, SelectParam } from '@/components/gestao/Filtros'
import { BarraCelula, CelulaCalor, LinhaVazia, Secao, TRACO, Variacao, n0, n2, r0, rCurto } from '@/components/gestao/Celulas'
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

  return (
    <>
      <PageHeader
        eyebrow={ctx.eyebrow}
        title={`Assessores · ${ctx.label}`}
        description={`Visão por assessor: lotes, receita e clientes, tudo calculado dos lotes importados. Mês de referência ${mesLongo(mesRef)}; janela de 12 meses de ${mesCurto(meses[0])} a ${mesCurto(mesRef)}.`}
        actions={<><SelectParam param="assessor" valor={assessorSel} opcoes={opcoesAssessor} label="Assessor (rankings)" todos="Todos" /><MesPicker valor={mesRef} /></>}
      />
      <PageBody>
        <KpiRow cols={7}>
          <KpiCard label="Lotes operados no mês" value={fmtNum(totalLotes)} />
          <KpiCard label="Receita total no mês" value={rCurto(totalReceita)} tone="success" />
          <KpiCard label="Clientes ativos no mês" value={fmtNum(clientesAtivos)} sub="soma por assessor" tone="violet" />
          <KpiCard label="Assessores com giro" value={`${comGiro} de ${cadastrados}`} sub="cadastrados em Parâmetros" tone="info" />
          <KpiCard label="Lotes · 12 meses" value={fmtNum(lotes12)} tone="neutral" />
          <KpiCard label="Receita · 12 meses" value={rCurto(receita12)} tone="neutral" />
          <KpiCard label="Lotes vs mês anterior" value={totalAnterior ? fmtDelta(((totalLotes - totalAnterior) / totalAnterior) * 100) : TRACO} sub={`anterior: ${fmtNum(totalAnterior)}`} tone={totalLotes >= totalAnterior ? 'success' : 'danger'} />
        </KpiRow>

        <Panel flush>
          <div className="px-5 pt-4"><Secao numero={1} titulo="Resumo por assessor · mês de referência" descricao="Ordenado do maior para o menor giro no mês. Mesma ordem nas seções 2 e 3." /></div>
          <div className="tbl-wrap rounded-none border-0 border-t border-line">
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th>Assessor</th><th>Resp.</th><th className="num">Clientes ativos</th><th className="num">Lotes operados</th><th className="num">Lotes zerados</th>
                  <th className="num">Rec. corretagem</th><th className="num">Rec. zeragem</th><th className="num">Receita total</th><th className="num">% dos lotes</th>
                  <th className="num">Lotes / cliente</th><th className="num">Tarifa (R$/lote)</th><th className="num">Lotes · 12 m</th><th className="num">Receita · 12 m</th><th className="num">Var. lotes vs mês ant.</th>
                </tr>
              </thead>
              <tbody>
                {resumo.length === 0 && <LinhaVazia colunas={14}>Sem lotes na janela.</LinhaVazia>}
                {resumo.map(a => (
                  <tr key={a.assessor_nome}>
                    <td className="font-medium"><Link href={`${base}/assessores?assessor=${encodeURIComponent(a.assessor_nome)}&mes=${mesRef.slice(0, 7)}`} className="link">{a.assessor_nome}</Link></td>
                    <td className="muted">{a.responsavel ?? TRACO}</td>
                    <td className="num">{n0(a.clientes_ativos)}</td>
                    <td className="num"><BarraCelula valor={a.lotes} max={resumo[0]?.lotes ?? 0} tom="success" largura={80} /></td>
                    <td className={`num ${!a.zerados ? 'subtle' : ''}`}>{n0(a.zerados)}</td>
                    <td className="num">{r0(a.receita_corretagem)}</td>
                    <td className={`num ${!a.receita_zeragem ? 'subtle' : ''}`}>{r0(a.receita_zeragem)}</td>
                    <td className="num font-semibold">{r0(a.receita)}</td>
                    <td className="num">{totalLotes ? fmtPct((a.lotes / totalLotes) * 100) : TRACO}</td>
                    <td className="num">{a.clientes_ativos ? n2(Math.round((a.lotes / a.clientes_ativos) * 10) / 10) : TRACO}</td>
                    <td className="num">{a.tarifa == null ? <span className="text-warning" title="Assessor não cadastrado em Parâmetros">?</span> : n2(a.tarifa)}{a.tipo_zeragem === 'FIXA' ? <span className="ml-1 text-[10px] text-fg-subtle">fixa</span> : ''}</td>
                    <td className="num">{n0(a.lotes_12m)}</td>
                    <td className="num">{r0(a.receita_12m)}</td>
                    <td className="num"><Variacao atual={a.lotes} anterior={a.lotes_mes_anterior} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel flush>
          <div className="px-5 pt-4"><Secao numero={2} titulo="Giro mensal por assessor · lotes operados (últimos 12 meses)" descricao="Mapa de calor: quanto mais verde, maior o giro. O último mês pode estar parcial." /></div>
          <div className="tbl-wrap rounded-none border-0 border-t border-line">
            <table className="tbl tbl-dense">
              <thead><tr><th className="sticky-col">Assessor</th>{meses.map(m => <th key={m} className={`num ${m === mesRef ? 'text-accent' : ''}`}>{mesCurto(m)}</th>)}<th className="num">Total</th></tr></thead>
              <tbody>
                {ordem.map(nome => {
                  const linha = porAssessorMes.get(nome)
                  const total = meses.reduce((s, m) => s + (linha?.get(m)?.lotes ?? 0), 0)
                  return (
                    <tr key={nome}>
                      <td className="sticky-col font-medium">{nome}</td>
                      {meses.map(m => <CelulaCalor key={m} valor={linha?.get(m)?.lotes ?? 0} max={maxLotesMes} />)}
                      <td className="num font-semibold">{n0(total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel flush>
          <div className="px-5 pt-4"><Secao numero={3} titulo="Receita mensal por assessor · corretagem + zeragem (R$)" descricao="Mesma ordem e meses da seção 2." /></div>
          <div className="tbl-wrap rounded-none border-0 border-t border-line">
            <table className="tbl tbl-dense">
              <thead><tr><th className="sticky-col">Assessor</th>{meses.map(m => <th key={m} className={`num ${m === mesRef ? 'text-accent' : ''}`}>{mesCurto(m)}</th>)}<th className="num">Total</th></tr></thead>
              <tbody>
                {ordem.map(nome => {
                  const linha = porAssessorMes.get(nome)
                  const total = meses.reduce((s, m) => s + (linha?.get(m)?.receita ?? 0), 0)
                  return (
                    <tr key={nome}>
                      <td className="sticky-col font-medium">{nome}</td>
                      {meses.map(m => <CelulaCalor key={m} valor={linha?.get(m)?.receita ?? 0} max={maxReceitaMes} tom="accent" fmt={rCurto} />)}
                      <td className="num font-semibold">{rCurto(total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <Secao numero={4} titulo="Maiores clientes (Top 20)" descricao={`Respeita o filtro de assessor (${assessorSel || 'todos'}). Esquerda: mês de referência · direita: últimos 12 meses.`} />
          <div className="grid gap-5 2xl:grid-cols-2">
            <TabelaTop base={base} titulo={`Mês ${mesCurto(mesRef)} · assessor: ${assessorSel || 'todos'}`} dados={topMes} />
            <TabelaTop base={base} titulo={`12 meses (${mesCurto(meses[0])} a ${mesCurto(mesRef)}) · assessor: ${assessorSel || 'todos'}`} dados={top12} />
          </div>
        </Panel>
      </PageBody>
    </>
  )
}

function TabelaTop({ titulo, dados, base }: { titulo: string; dados: TopClienteRow[]; base: string }) {
  return (
    <div>
      <p className="label mb-2">{titulo}</p>
      <div className="tbl-wrap">
        <table className="tbl tbl-dense">
          <thead><tr><th className="num">#</th><th>Cliente</th><th>Assessor</th><th className="num">Lotes operados</th><th className="num">Lotes zerados</th><th className="num">Receita (R$)</th><th className="num">% dos lotes</th></tr></thead>
          <tbody>
            {dados.length === 0 && <LinhaVazia colunas={7}>Sem lotes.</LinhaVazia>}
            {dados.map((c, i) => (
              <tr key={`${c.cliente_id ?? c.cliente_nome}-${i}`}>
                <td className="num muted">{i + 1}</td>
                <td className="max-w-[220px] truncate">{c.cliente_id ? <Link href={`${base}/clientes/${c.cliente_id}`} className="link">{c.cliente_nome}</Link> : <span className="text-warning">{c.cliente_nome}</span>}</td>
                <td className="max-w-[160px] truncate muted">{c.assessor_nome ?? TRACO}</td>
                <td className="num"><BarraCelula valor={c.lotes} max={dados[0]?.lotes ?? 0} tom="success" largura={64} /></td>
                <td className={`num ${!c.zerados ? 'subtle' : ''}`}>{n0(c.zerados)}</td>
                <td className="num">{r0(c.receita)}</td>
                <td className="num">{fmtPct(c.pct_lotes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
