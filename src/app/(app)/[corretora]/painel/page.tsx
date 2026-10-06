export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { clientesLista, funilMensal, lotesNaoCadastrados, mixPlataforma, painelClientesMensal, painelMensal } from '@/lib/gestao/consultas'
import { baseStatus, porAssessor, resumoClientes, situacaoMigrados } from '@/lib/gestao/derivados'
import { janelaMeses, limitesDoMes, mesCurto, mesLongo } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { MesPicker } from '@/components/gestao/Filtros'
import { BarraCelula, LinhaVazia, SituacaoBadge, TRACO, dataCurta, n0, n2, p1, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { HeatmapClientes } from './HeatmapClientes'

export default async function PainelPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { corretora, mesRef, base } = ctx
  const meses = janelaMeses(mesRef, 12)
  const lim = limitesDoMes(mesRef)

  const [clientes, mensal, porCliente, naoCad, mix, funil] = await Promise.all([
    clientesLista(corretora, mesRef),
    painelMensal(corretora, mesRef, 12),
    painelClientesMensal(corretora, mesRef, 12),
    lotesNaoCadastrados(corretora),
    mixPlataforma(corretora, lim.inicio, lim.fim),
    funilMensal(mesRef, 12),
  ])

  const r = resumoClientes(clientes)
  const bs = baseStatus(clientes)
  const sit = situacaoMigrados(clientes)
  const assessores = porAssessor(clientes)
  const mesAtual = mensal.find(m => m.mes_ref === mesRef)
  const naoCadLinhas = naoCad.reduce((s, l) => s + l.linhas, 0)
  const naoCadLotes = naoCad.reduce((s, l) => s + l.lotes, 0)
  const semGiro = clientes.filter(c => c.situacao === 'Nunca girou').sort((a, b) => (b.data_migracao ?? '').localeCompare(a.data_migracao ?? '')).slice(0, 15)
  const mixTotal = mix.reduce((s, m) => s + m.lotes, 0)
  const funilPorMes = new Map(funil.map(f => [f.mes_ref, f]))
  const mensalPorMes = new Map(mensal.map(m => [m.mes_ref, m]))
  // No celular só os 4 últimos meses ficam visíveis (os outros em telas ≥ 768 px)
  const colMes = (i: number) => (i < meses.length - 4 ? 'col-p2' : '')

  // Indicadores mensais: uma linha por indicador, uma coluna por mês
  type Linha = { label: string; valores: (number | null)[]; fmt: (v: number | null) => string; destaque?: 'bold' | 'total' | 'sub'; total?: boolean }
  const col = (fn: (m: typeof mensal[number] | undefined, f: typeof funil[number] | undefined) => number | null) =>
    meses.map(m => fn(mensalPorMes.get(m), funilPorMes.get(m)))
  const nn = (v: number | null) => (v == null ? TRACO : n0(v))
  const rr = (v: number | null) => (v == null ? TRACO : rCurto(v))
  const pp = (v: number | null) => (v == null ? TRACO : p1(v))
  const linhas: Linha[] = [
    { label: 'Clientes migrados (acumulado)', valores: col(m => m?.migrados_acumulados ?? null), fmt: nn },
    { label: 'Novas migrações', valores: col(m => m?.novas_migracoes ?? null), fmt: nn, total: true },
    { label: 'Clientes levados (data de entrada)', valores: col(m => m?.entradas ?? null), fmt: nn, total: true },
    { label: 'Clientes ativos', valores: col(m => m?.clientes_ativos ?? null), fmt: nn, destaque: 'bold' },
    { label: '% ativos da base migrada', valores: col(m => (m && m.migrados_acumulados ? (m.clientes_ativos / m.migrados_acumulados) * 100 : null)), fmt: pp, destaque: 'sub' },
    { label: '% ativos do total levado', valores: col(m => (m && r.levados ? (m.clientes_ativos / r.levados) * 100 : null)), fmt: pp, destaque: 'sub' },
    { label: 'Lotes girados', valores: col(m => m?.lotes ?? null), fmt: nn, total: true },
    { label: 'Lotes zerados', valores: col(m => m?.zerados ?? null), fmt: nn, total: true },
    { label: 'Lotes por cliente ativo', valores: col(m => (m && m.clientes_ativos ? m.lotes / m.clientes_ativos : null)), fmt: v => (v == null ? TRACO : n2(Math.round(v * 10) / 10)) },
    { label: 'Receita de corretagem', valores: col(m => m?.receita_corretagem ?? null), fmt: rr, total: true },
    { label: 'Receita de zeragem', valores: col(m => m?.receita_zeragem ?? null), fmt: rr, total: true },
    { label: `Incentivo ${ctx.label}`, valores: col(m => m?.incentivo ?? null), fmt: rr, total: true },
    { label: 'Receita total', valores: col(m => (m ? m.receita + m.incentivo : null)), fmt: rr, destaque: 'total', total: true },
    { label: 'Leads recebidos', valores: col((_, f) => f?.recebidos ?? null), fmt: nn, total: true },
    { label: 'dos quais já eram clientes', valores: col((_, f) => f?.ja_clientes ?? null), fmt: nn, destaque: 'sub', total: true },
    { label: 'Leads ganhos (data do fechamento)', valores: col((_, f) => f?.ganhos ?? null), fmt: nn, total: true },
  ]

  const grafico = meses.map(m => {
    const x = mensalPorMes.get(m)
    return { label: mesCurto(m), lotes: x?.lotes ?? 0, receita: x ? x.receita + x.incentivo : 0, ativos: x?.clientes_ativos ?? 0 }
  })

  return (
    <>
      <PageHeader
        eyebrow={ctx.eyebrow}
        title="Painel"
        description={`Base levada, giro e receita em ${mesLongo(mesRef)}${ctx.mesEscolhido ? '' : ' (último mês com lotes)'}.`}
        actions={<MesPicker valor={mesRef} />}
      />
      <PageBody>
        <KpiRow cols={6}>
          <KpiCard label="Clientes levados" value={fmtNum(r.levados)} sub={`${fmtNum(r.contas)} contas · ${fmtNum(r.emProcessamento)} em processamento`} />
          <KpiCard label="Taxa de migração" value={fmtPct(r.taxaMigracao)} sub={`${fmtNum(r.migrados)} migrados · ${fmtNum(r.recusaram)} recusaram`} />
          <KpiCard label="Ativos no mês" value={fmtNum(r.ativos)} sub={`giraram em ${mesCurto(mesRef)}`} />
          <KpiCard label="% ativos da base migrada" value={fmtPct(r.pctAtivosMigrados)} sub={`${fmtPct(r.pctAtivosLevados)} do total levado`} />
          <KpiCard label="Lotes no mês" value={fmtNum(r.lotesMes)} sub={`${fmtNum(r.zeradosMes)} zerados · ${rCurto(r.receitaMes)}`} />
          <KpiCard label="Incentivo no mês" value={rCurto(mesAtual?.incentivo ?? 0)} sub={`${fmtNum(mesAtual?.clientes_com_faixa ?? 0)} clientes com faixa`} />
        </KpiRow>

        <Panel title="Lotes, receita e clientes ativos" subtitle="12 meses até o mês de referência · receita = corretagem + zeragem + incentivo">
          <GraficoSeries
            dados={grafico}
            series={[
              { key: 'lotes', nome: 'Lotes girados', tipo: 'bar' },
              { key: 'receita', nome: 'Receita total', tipo: 'line', eixo: 'dir', formato: 'brl' },
              { key: 'ativos', nome: 'Clientes ativos', tipo: 'line', eixo: 'dir', formato: 'num' },
            ]}
            formato="num"
            formatoDir="num"
            altura={260}
          />
        </Panel>

        <Panel title="Indicadores mensais" subtitle="O último mês pode estar parcial.">
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th className="sticky-col min-w-[200px]">Indicador</th>
                  {meses.map((m, i) => <th key={m} className={cn('num', colMes(i), m === mesRef && 'text-fg')}>{mesCurto(m)}</th>)}
                  <th className="num">12 m</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => {
                  const soma = l.total ? l.valores.reduce<number>((s, v) => s + (v ?? 0), 0) : null
                  return (
                    <tr key={l.label} className={l.destaque === 'total' ? 'total' : ''}>
                      <td className={cn('sticky-col', l.destaque === 'sub' && 'pl-6 text-fg-muted', l.destaque === 'bold' && 'font-semibold')}>{l.label}</td>
                      {l.valores.map((v, i) => (
                        <td key={i} className={cn('num', colMes(i), (v == null || v === 0) && 'subtle', l.destaque === 'bold' && 'font-semibold')}>{l.fmt(v)}</td>
                      ))}
                      <td className="num font-semibold">{soma == null ? '' : l.fmt(soma)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-8 xl:grid-cols-2">
          <Panel title="Alertas" subtitle="O que precisa de atenção no cadastro e nos lançamentos.">
            <ul className="divide-y divide-line text-dense">
              <li className="flex items-center justify-between gap-3 py-3">
                <span>Lançamentos com cliente não cadastrado</span>
                <Link href={`${base}/importar#nao-cadastrados`} className={cn('link tabular-nums', naoCadLinhas && 'text-warn')}>{fmtNum(naoCadLinhas)} linhas · {fmtNum(naoCadLotes)} lotes</Link>
              </li>
              <li className="flex items-center justify-between gap-3 py-3">
                <span>Migrados sem data de migração</span>
                <Link href={`${base}/clientes?alerta=migrado%20sem%20data`} className={cn('link tabular-nums', r.migradosSemData && 'text-warn')}>{fmtNum(r.migradosSemData)}</Link>
              </li>
              <li className="flex items-center justify-between gap-3 py-3">
                <span>Clientes com mais de uma conta</span>
                <Link href={`${base}/clientes?alerta=contas`} className="link tabular-nums">{fmtNum(r.multiConta)}</Link>
              </li>
              <li className="flex items-center justify-between gap-3 py-3">
                <span>Clientes com algum alerta de cadastro</span>
                <Link href={`${base}/clientes?alerta=qualquer`} className="link tabular-nums">{fmtNum(r.comAlertas)}</Link>
              </li>
              <li className="flex items-center justify-between gap-3 py-3">
                <span>Migrados que nunca giraram</span>
                <Link href={`${base}/clientes?situacao=Nunca%20girou`} className="link tabular-nums">{fmtNum(r.nuncaGiraram)} · {fmtNum(r.inativos)} inativos</Link>
              </li>
            </ul>
          </Panel>

          <Panel title="Base por status" subtitle="Status vem da situação da conta; responsável vem do assessor.">
            <div className="tbl-wrap">
              <table className="tbl tbl-dense">
                <thead>
                  <tr>
                    <th>Status</th><th className="num">Clientes</th><th className="num">% da base</th>
                    {bs.responsaveis.map(x => <th key={x} className="num col-p2">{x}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {bs.linhas.map(l => (
                    <tr key={l.status}>
                      <td>{l.status}</td>
                      <td className="num">{n0(l.total)}</td>
                      <td className="num">{bs.total ? fmtPct((l.total / bs.total) * 100) : TRACO}</td>
                      {l.porResponsavel.map((v, i) => <td key={i} className={cn('num col-p2', !v && 'subtle')}>{n0(v)}</td>)}
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Total levado</td><td className="num">{fmtNum(bs.total)}</td><td className="num">100,0%</td>
                    {bs.totalPorResponsavel.map((v, i) => <td key={i} className="num col-p2">{n0(v)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Situação da base migrada" subtitle={`Ativo girou em ${mesCurto(mesRef)}; inativo já girou e parou; nunca girou não tem lote.`}>
            <div className="tbl-wrap">
              <table className="tbl tbl-dense">
                <thead><tr><th>Situação</th><th className="num">Clientes</th><th className="num">% dos migrados</th></tr></thead>
                <tbody>
                  {sit.linhas.map(l => (
                    <tr key={l.situacao}>
                      <td><SituacaoBadge situacao={l.situacao} /></td>
                      <td className="num">{n0(l.qtde)}</td>
                      <td className="num">{sit.total ? fmtPct((l.qtde / sit.total) * 100) : TRACO}</td>
                    </tr>
                  ))}
                  <tr className="total"><td>Migrados</td><td className="num">{fmtNum(sit.total)}</td><td className="num">100,0%</td></tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Mix de plataforma" subtitle={`Lotes operados por plataforma em ${mesCurto(mesRef)}.`}>
            <div className="tbl-wrap">
              <table className="tbl tbl-dense">
                <thead><tr><th>Plataforma</th><th className="num">Lotes</th><th className="num">% lotes</th><th className="num col-p2">Zerados</th><th className="num col-p2">Clientes</th></tr></thead>
                <tbody>
                  {mix.length === 0 && <LinhaVazia colunas={5}>Sem lotes no mês.</LinhaVazia>}
                  {mix.map(m => (
                    <tr key={m.plataforma}>
                      <td>{m.plataforma}</td>
                      <td className="num"><BarraCelula valor={m.lotes} max={mix[0]?.lotes ?? 0} /></td>
                      <td className="num">{mixTotal ? fmtPct((m.lotes / mixTotal) * 100) : TRACO}</td>
                      <td className={cn('num col-p2', !m.zerados && 'subtle')}>{n0(m.zerados)}</td>
                      <td className="num col-p2">{n0(m.clientes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <Panel title="Por assessor" subtitle="Clientes levados e migrados pela conta principal; lotes e receita do mês e dos últimos 12 meses.">
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th>Assessor</th><th className="col-p3">Responsável</th><th className="num col-p2">Levados</th><th className="num col-p2">Migrados</th><th className="num">Ativos</th>
                  <th className="num col-p3">% ativação</th><th className="num">Lotes no mês</th><th className="num col-p2">Receita no mês</th><th className="num col-p3">Lotes 12 m</th><th className="num col-p3">Receita 12 m</th>
                </tr>
              </thead>
              <tbody>
                <tr className="total">
                  <td>Total</td><td className="col-p3"></td><td className="num col-p2">{fmtNum(r.levados)}</td><td className="num col-p2">{fmtNum(r.migrados)}</td><td className="num">{fmtNum(r.ativos)}</td>
                  <td className="num col-p3">{fmtPct(r.pctAtivosMigrados)}</td><td className="num">{fmtNum(r.lotesMes)}</td><td className="num col-p2">{r0(r.receitaMes)}</td>
                  <td className="num col-p3">{fmtNum(r.lotes12m)}</td><td className="num col-p3">{r0(r.receita12m)}</td>
                </tr>
                {assessores.map(a => (
                  <tr key={a.grupo}>
                    <td><Link href={`${base}/assessores?assessor=${encodeURIComponent(a.grupo)}`} className="link">{a.grupo}</Link></td>
                    <td className="muted col-p3">{a.responsavel ?? TRACO}</td>
                    <td className="num col-p2">{n0(a.levados)}</td><td className="num col-p2">{n0(a.migrados)}</td><td className="num">{n0(a.ativos)}</td>
                    <td className={cn('num col-p3', !a.ativos && 'subtle')}>{a.migrados ? fmtPct((a.ativos / a.migrados) * 100) : TRACO}</td>
                    <td className="num"><BarraCelula valor={a.lotesMes} max={assessores[0]?.lotesMes ?? 0} /></td>
                    <td className="num col-p2">{r0(a.receitaMes)}</td><td className="num col-p3">{n0(a.lotes12m)}</td><td className="num col-p3">{r0(a.receita12m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-8 xl:grid-cols-5">
          <Panel className="xl:col-span-2" title="Migrados sem giro" subtitle="Priorizar contato · migrações mais recentes primeiro."
            action={<Link href={`${base}/clientes?situacao=Nunca%20girou`} className="link text-label">ver todos ({fmtNum(r.nuncaGiraram)})</Link>}>
            <div className="tbl-wrap">
              <table className="tbl tbl-dense">
                <thead><tr><th>Cliente</th><th className="col-p2">Responsável</th><th>Migração</th><th className="num">Telefone</th></tr></thead>
                <tbody>
                  {semGiro.length === 0 && <LinhaVazia colunas={4}>Nenhum migrado sem giro.</LinhaVazia>}
                  {semGiro.map(c => (
                    <tr key={c.cliente_id}>
                      <td className="max-w-[200px] truncate"><Link href={`${base}/clientes/${c.cliente_id}`} className="link">{c.nome}</Link></td>
                      <td className="muted col-p2">{c.responsavel ?? TRACO}</td>
                      <td className="num">{dataCurta(c.data_migracao)}</td>
                      <td className="num">{c.telefone ?? TRACO}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <div className="min-w-0 xl:col-span-3">
            <HeatmapClientes meses={meses} dados={porCliente} base={base} />
          </div>
        </div>
      </PageBody>
    </>
  )
}
