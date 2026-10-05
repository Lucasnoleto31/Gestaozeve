export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { AlertTriangle, Info, Users } from 'lucide-react'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { clientesLista, funilMensal, lotesNaoCadastrados, mixPlataforma, painelClientesMensal, painelMensal } from '@/lib/gestao/consultas'
import { baseStatus, porAssessor, resumoClientes, situacaoMigrados } from '@/lib/gestao/derivados'
import { janelaMeses, limitesDoMes, mesCurto, mesLongo } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
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

  // Indicadores mensais: uma linha por indicador, uma coluna por mês
  type Linha = { label: string; valores: (number | null)[]; fmt: (v: number | null) => string; destaque?: 'bold' | 'total' | 'sub'; total?: boolean }
  const col = (fn: (m: typeof mensal[number] | undefined, f: typeof funil[number] | undefined) => number | null) =>
    meses.map(m => fn(mensalPorMes.get(m), funilPorMes.get(m)))
  const nn = (v: number | null) => (v == null ? TRACO : n0(v))
  const rr = (v: number | null) => (v == null ? TRACO : rCurto(v))
  const pp = (v: number | null) => (v == null ? TRACO : p1(v))
  const linhas: Linha[] = [
    { label: 'Clientes migrados (acumulado)', valores: col(m => m?.migrados_acumulados ?? null), fmt: nn },
    { label: 'Novas migrações no mês', valores: col(m => m?.novas_migracoes ?? null), fmt: nn, total: true },
    { label: 'Clientes levados no mês (data de entrada)', valores: col(m => m?.entradas ?? null), fmt: nn, total: true },
    { label: 'Clientes ativos (giraram lotes)', valores: col(m => m?.clientes_ativos ?? null), fmt: nn, destaque: 'bold' },
    { label: '% de ativos sobre a base migrada', valores: col(m => (m && m.migrados_acumulados ? (m.clientes_ativos / m.migrados_acumulados) * 100 : null)), fmt: pp, destaque: 'sub' },
    { label: '% de ativos sobre o total levado', valores: col(m => (m && r.levados ? (m.clientes_ativos / r.levados) * 100 : null)), fmt: pp, destaque: 'sub' },
    { label: 'Total de lotes girados', valores: col(m => m?.lotes ?? null), fmt: nn, total: true },
    { label: 'Total de lotes zerados', valores: col(m => m?.zerados ?? null), fmt: nn, total: true },
    { label: 'Média de lotes por cliente ativo', valores: col(m => (m && m.clientes_ativos ? m.lotes / m.clientes_ativos : null)), fmt: v => (v == null ? TRACO : n2(Math.round(v * 10) / 10)) },
    { label: 'Receita de corretagem (R$)', valores: col(m => m?.receita_corretagem ?? null), fmt: rr, total: true },
    { label: 'Receita de zeragem (R$)', valores: col(m => m?.receita_zeragem ?? null), fmt: rr, total: true },
    { label: 'Receita de incentivo (R$)', valores: col(m => m?.incentivo ?? null), fmt: rr, total: true },
    { label: 'Receita total (R$)', valores: col(m => (m ? m.receita + m.incentivo : null)), fmt: rr, destaque: 'total', total: true },
    { label: 'Leads recebidos no mês', valores: col((_, f) => f?.recebidos ?? null), fmt: nn, total: true },
    { label: 'dos quais já eram clientes (base)', valores: col((_, f) => f?.ja_clientes ?? null), fmt: nn, destaque: 'sub', total: true },
    { label: 'Leads ganhos no mês (pela data do fechamento)', valores: col((_, f) => f?.ganhos ?? null), fmt: nn, total: true },
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
        description={`Acompanhamento cliente a cliente da base levada à ${ctx.label} e dos lotes girados. Mês de referência: ${mesLongo(mesRef)}${ctx.mesEscolhido ? '' : ' (último mês com lotes)'}.`}
        actions={<MesPicker valor={mesRef} />}
      />
      <PageBody>
        <KpiRow cols={6}>
          <KpiCard label={`Clientes levados à ${ctx.label}`} value={fmtNum(r.levados)} sub={`${fmtNum(r.contas)} contas · ${fmtNum(r.emProcessamento)} em processamento`} />
          <KpiCard label="Taxa de migração" value={fmtPct(r.taxaMigracao)} sub={`${fmtNum(r.migrados)} migrados · ${fmtNum(r.recusaram)} recusaram`} tone="success" />
          <KpiCard label="Clientes ativos no mês" value={fmtNum(r.ativos)} sub={`Referência: ${mesCurto(mesRef)}`} tone="violet" />
          <KpiCard label="% ativos s/ base migrada" value={fmtPct(r.pctAtivosMigrados)} sub={`Sobre o total levado: ${fmtPct(r.pctAtivosLevados)}`} tone="info" />
          <KpiCard label="Lotes girados no mês" value={fmtNum(r.lotesMes)} sub={`${fmtNum(r.zeradosMes)} zerados · receita ${rCurto(r.receitaMes)}`} />
          <KpiCard label={`Incentivo ${ctx.label} no mês`} value={rCurto(mesAtual?.incentivo ?? 0)} sub={`${fmtNum(mesAtual?.clientes_com_faixa ?? 0)} clientes com faixa · detalhe em Incentivo`} tone="success" />
        </KpiRow>

        <Panel title="Lotes, receita e clientes ativos por mês" subtitle="Janela de 12 meses até o mês de referência. Receita = corretagem + zeragem + incentivo.">
          <GraficoSeries
            dados={grafico}
            series={[
              { key: 'lotes', nome: 'Lotes girados', tipo: 'bar' },
              { key: 'receita', nome: 'Receita total (R$)', tipo: 'line', eixo: 'dir', formato: 'brl' },
              { key: 'ativos', nome: 'Clientes ativos', tipo: 'line', eixo: 'dir', formato: 'num' },
            ]}
            formato="num"
            formatoDir="num"
            altura={240}
          />
        </Panel>

        <Panel title="Indicadores mensais" subtitle="Os 12 meses até o mês de referência; o último mês pode estar parcial." flush>
          <div className="tbl-wrap rounded-none border-0">
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th className="sticky-col min-w-[260px]">Indicador</th>
                  {meses.map(m => <th key={m} className={`num ${m === mesRef ? 'text-accent' : ''}`}>{mesCurto(m)}</th>)}
                  <th className="num">Total 12 m</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => {
                  const soma = l.total ? l.valores.reduce<number>((s, v) => s + (v ?? 0), 0) : null
                  const cls = l.destaque === 'total' ? 'total' : ''
                  return (
                    <tr key={l.label} className={cls}>
                      <td className={`sticky-col ${l.destaque === 'sub' ? 'pl-6 text-fg-muted' : ''} ${l.destaque === 'bold' ? 'font-semibold' : ''} ${l.destaque === 'total' ? 'text-success' : ''}`}>{l.label}</td>
                      {l.valores.map((v, i) => (
                        <td key={i} className={`num ${v == null || v === 0 ? 'subtle' : ''} ${l.destaque === 'bold' ? 'font-semibold' : ''} ${l.destaque === 'total' ? 'text-success' : ''}`}>{l.fmt(v)}</td>
                      ))}
                      <td className={`num font-semibold ${l.destaque === 'total' ? 'text-success' : ''}`}>{soma == null ? '' : l.fmt(soma)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="Alertas" subtitle="O que precisa de atenção no cadastro e nos lançamentos.">
            <ul className="divide-y divide-line text-[13px]">
              <li className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Lançamentos em lotes com cliente não cadastrado</span>
                <Link href={`${base}/importar#nao-cadastrados`} className="link tabular-nums">{fmtNum(naoCadLinhas)} linhas · {fmtNum(naoCadLotes)} lotes</Link>
              </li>
              <li className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2"><AlertTriangle className={`h-4 w-4 ${r.migradosSemData ? 'text-warning' : 'text-success'}`} /> Migrados sem data de migração</span>
                <Link href={`${base}/clientes?alerta=migrado%20sem%20data`} className="link tabular-nums">{fmtNum(r.migradosSemData)}</Link>
              </li>
              <li className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2"><Info className="h-4 w-4 text-info" /> Clientes com mais de uma conta</span>
                <Link href={`${base}/clientes?alerta=contas`} className="link tabular-nums">{fmtNum(r.multiConta)}</Link>
              </li>
              <li className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2"><Info className="h-4 w-4 text-info" /> Clientes com algum alerta de cadastro</span>
                <Link href={`${base}/clientes?alerta=qualquer`} className="link tabular-nums">{fmtNum(r.comAlertas)}</Link>
              </li>
              <li className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2"><Users className="h-4 w-4 text-danger" /> Migrados que nunca giraram</span>
                <Link href={`${base}/clientes?situacao=Nunca%20girou`} className="link tabular-nums">{fmtNum(r.nuncaGiraram)} · {fmtNum(r.inativos)} inativos</Link>
              </li>
            </ul>
          </Panel>

          <Panel title="Base por status" subtitle="Status vem da SITUACAO_CONTA (mapa em Parâmetros); responsável vem do assessor." flush>
            <div className="tbl-wrap rounded-none border-0">
              <table className="tbl tbl-dense">
                <thead>
                  <tr>
                    <th>Status da base</th><th className="num">Qtde</th><th className="num">% da base</th>
                    {bs.responsaveis.map(x => <th key={x} className="num">{x}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {bs.linhas.map(l => (
                    <tr key={l.status}>
                      <td>{l.status}</td>
                      <td className="num"><BarraCelula valor={l.total} max={bs.total} tom={l.status === 'Migrado' ? 'success' : l.status === 'Recusou' ? 'danger' : 'warning'} /></td>
                      <td className="num">{bs.total ? fmtPct((l.total / bs.total) * 100) : TRACO}</td>
                      {l.porResponsavel.map((v, i) => <td key={i} className={`num ${!v ? 'subtle' : ''}`}>{n0(v)}</td>)}
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Total levado à {ctx.label}</td><td className="num">{fmtNum(bs.total)}</td><td className="num">100,0%</td>
                    {bs.totalPorResponsavel.map((v, i) => <td key={i} className="num">{n0(v)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Situação da base migrada · mês de referência" subtitle={`Ativo = girou em ${mesCurto(mesRef)}; Inativo = já girou e parou; Nunca girou = migrado sem lote.`} flush>
            <div className="tbl-wrap rounded-none border-0">
              <table className="tbl tbl-dense">
                <thead><tr><th>Situação</th><th className="num">Qtde</th><th className="num">% dos migrados</th></tr></thead>
                <tbody>
                  {sit.linhas.map(l => (
                    <tr key={l.situacao}>
                      <td><SituacaoBadge situacao={l.situacao} /></td>
                      <td className="num"><BarraCelula valor={l.qtde} max={sit.total} tom={l.situacao === 'Ativo' ? 'success' : l.situacao === 'Inativo' ? 'warning' : 'danger'} /></td>
                      <td className="num">{sit.total ? fmtPct((l.qtde / sit.total) * 100) : TRACO}</td>
                    </tr>
                  ))}
                  <tr className="total"><td>Migrados</td><td className="num">{fmtNum(sit.total)}</td><td className="num">100,0%</td></tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Mix de plataforma · mês de referência" subtitle="Lotes operados por plataforma no mês." flush>
            <div className="tbl-wrap rounded-none border-0">
              <table className="tbl tbl-dense">
                <thead><tr><th>Plataforma</th><th className="num">Lotes</th><th className="num">% lotes</th><th className="num">Zerados</th><th className="num">Clientes</th></tr></thead>
                <tbody>
                  {mix.length === 0 && <LinhaVazia colunas={5}>Sem lotes no mês.</LinhaVazia>}
                  {mix.map(m => (
                    <tr key={m.plataforma}>
                      <td>{m.plataforma}</td>
                      <td className="num"><BarraCelula valor={m.lotes} max={mix[0]?.lotes ?? 0} /></td>
                      <td className="num">{mixTotal ? fmtPct((m.lotes / mixTotal) * 100) : TRACO}</td>
                      <td className={`num ${!m.zerados ? 'subtle' : ''}`}>{n0(m.zerados)}</td>
                      <td className="num">{n0(m.clientes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <Panel title="Por assessor · mês de referência" subtitle="Clientes levados e migrados por assessor da conta principal; lotes e receita do mês e dos últimos 12 meses." flush>
          <div className="tbl-wrap rounded-none border-0">
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th>Assessor</th><th>Responsável</th><th className="num">Clientes levados</th><th className="num">Migrados</th><th className="num">Ativos no mês</th>
                  <th className="num">% ativação</th><th className="num">Lotes no mês</th><th className="num">Receita no mês</th><th className="num">Lotes 12 m</th><th className="num">Receita 12 m</th>
                </tr>
              </thead>
              <tbody>
                <tr className="total">
                  <td>Total</td><td></td><td className="num">{fmtNum(r.levados)}</td><td className="num">{fmtNum(r.migrados)}</td><td className="num">{fmtNum(r.ativos)}</td>
                  <td className="num">{fmtPct(r.pctAtivosMigrados)}</td><td className="num">{fmtNum(r.lotesMes)}</td><td className="num">{r0(r.receitaMes)}</td>
                  <td className="num">{fmtNum(r.lotes12m)}</td><td className="num">{r0(r.receita12m)}</td>
                </tr>
                {assessores.map(a => (
                  <tr key={a.grupo}>
                    <td><Link href={`${base}/assessores?assessor=${encodeURIComponent(a.grupo)}`} className="link">{a.grupo}</Link></td>
                    <td className="muted">{a.responsavel ?? TRACO}</td>
                    <td className="num">{n0(a.levados)}</td><td className="num">{n0(a.migrados)}</td><td className="num">{n0(a.ativos)}</td>
                    <td className={`num ${!a.ativos ? 'subtle' : ''}`}>{a.migrados ? fmtPct((a.ativos / a.migrados) * 100) : TRACO}</td>
                    <td className="num"><BarraCelula valor={a.lotesMes} max={assessores[0]?.lotesMes ?? 0} tom="success" /></td>
                    <td className="num">{r0(a.receitaMes)}</td><td className="num">{n0(a.lotes12m)}</td><td className="num">{r0(a.receita12m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-5">
          <Panel className="xl:col-span-2" title="Migrados sem giro · priorizar contato" subtitle="Migrações mais recentes primeiro." flush
            action={<Link href={`${base}/clientes?situacao=Nunca%20girou`} className="text-xs font-medium text-accent hover:underline">ver todos ({fmtNum(r.nuncaGiraram)})</Link>}>
            <div className="tbl-wrap rounded-none border-0">
              <table className="tbl tbl-dense">
                <thead><tr><th>Cliente</th><th>Resp.</th><th>Migração</th><th>Telefone</th></tr></thead>
                <tbody>
                  {semGiro.length === 0 && <LinhaVazia colunas={4}>Nenhum migrado sem giro.</LinhaVazia>}
                  {semGiro.map(c => (
                    <tr key={c.cliente_id}>
                      <td><Link href={`${base}/clientes/${c.cliente_id}`} className="link">{c.nome}</Link></td>
                      <td className="muted">{c.responsavel ?? TRACO}</td>
                      <td className="num">{dataCurta(c.data_migracao)}</td>
                      <td className="num">{c.telefone ?? TRACO}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <div className="xl:col-span-3">
            <HeatmapClientes meses={meses} dados={porCliente} base={base} />
          </div>
        </div>
      </PageBody>
    </>
  )
}
