export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { clientesLista, painelMensal } from '@/lib/gestao/consultas'
import { mediana, porResponsavel, porSituacao } from '@/lib/gestao/derivados'
import { janelaMeses, mesCurto, mesLongo } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { MesPicker } from '@/components/gestao/Filtros'
import { BarraCelula, LinhaVazia, SituacaoBadge, TRACO, n0, n2, r0, rCurto } from '@/components/gestao/Celulas'
import { TabelaReceita } from './TabelaReceita'

export default async function ReceitaPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { corretora, mesRef, base } = ctx
  const meses = janelaMeses(mesRef, 12)
  const [todos, mensal] = await Promise.all([clientesLista(corretora, mesRef), painelMensal(corretora, mesRef, 12)])
  const clientes = todos.filter(c => c.status !== 'Recusou')
  const migrados = clientes.filter(c => c.status === 'Migrado')

  const receitaMes = clientes.reduce((s, c) => s + c.receita_mes, 0)
  const corretagemMes = clientes.reduce((s, c) => s + c.receita_corretagem_mes, 0)
  const zeragemMes = clientes.reduce((s, c) => s + c.receita_zeragem_mes, 0)
  const receita12 = clientes.reduce((s, c) => s + c.receita_12m, 0)
  const lotes12 = clientes.reduce((s, c) => s + c.lotes_12m, 0)
  const lotesMes = clientes.reduce((s, c) => s + c.lotes_mes, 0)
  const zeradosMes = clientes.reduce((s, c) => s + c.zerados_mes, 0)
  const comReceita = clientes.filter(c => c.receita_mes > 0)
  const ativos = clientes.filter(c => c.lotes_mes > 0)
  const tarifaMedia = clientes.length ? clientes.reduce((s, c) => s + c.tarifa, 0) / clientes.length : 0
  const maior = [...clientes].sort((a, b) => b.lotes_12m - a.lotes_12m)[0]
  const ranking = [...clientes].sort((a, b) => b.lotes_12m - a.lotes_12m).slice(0, 25)
  const resp = porResponsavel(migrados)
  const sit = porSituacao(clientes)
  const mensalMap = new Map(mensal.map(m => [m.mes_ref, m]))
  const totMensal = mensal.reduce((a, m) => ({ lotes: a.lotes + m.lotes, rc: a.rc + m.receita_corretagem, rz: a.rz + m.receita_zeragem, inc: a.inc + m.incentivo }), { lotes: 0, rc: 0, rz: 0, inc: 0 })

  return (
    <>
      <PageHeader
        eyebrow={ctx.eyebrow}
        title="Receita por cliente"
        description={`Tudo automático. Clientes ordenados por lotes girados (maior primeiro); recusados ficam de fora. Mês de referência ${mesLongo(mesRef)}; janela de 12 meses de ${mesCurto(meses[0])} a ${mesCurto(mesRef)}.`}
        actions={<MesPicker valor={mesRef} />}
      />
      <PageBody>
        <KpiRow cols={7}>
          <KpiCard label="Receita do mês" value={rCurto(receitaMes)} sub={`corretagem ${rCurto(corretagemMes)} · zeragem ${rCurto(zeragemMes)}`} tone="success" />
          <KpiCard label="Receita 12 meses" value={rCurto(receita12)} sub={`${fmtNum(lotes12)} lotes na janela`} tone="success" />
          <KpiCard label="Lotes no mês" value={fmtNum(lotesMes)} sub={`${fmtNum(zeradosMes)} contratos zerados`} />
          <KpiCard label="R$ médio por lote" value={lotesMes ? n2(Math.round((receitaMes / lotesMes) * 1000) / 1000) : TRACO} sub={`tarifa média cadastrada ${n2(Math.round(tarifaMedia * 100) / 100)}`} tone="info" />
          <KpiCard label="Clientes com receita" value={fmtNum(comReceita.length)} sub={`de ${fmtNum(migrados.length)} migrados (${fmtPct(migrados.length ? (comReceita.length / migrados.length) * 100 : 0, 0)})`} tone="violet" />
          <KpiCard label="Receita / cliente ativo" value={ativos.length ? rCurto(receitaMes / ativos.length) : TRACO} sub={`mediana ${rCurto(mediana(comReceita.map(c => c.receita_mes)))}`} tone="neutral" />
          <KpiCard label="Maior cliente" value={<span className="truncate text-base" title={maior?.nome}>{maior?.nome ?? TRACO}</span>} sub={maior && lotes12 ? `${fmtPct((maior.lotes_12m / lotes12) * 100, 0)} dos lotes 12 m` : undefined} tone="neutral" />
        </KpiRow>

        <div className="grid gap-5 2xl:grid-cols-[1fr_380px]">
          <TabelaReceita clientes={clientes} base={base} mesRef={mesRef} />
          <div className="space-y-5">
            <Panel title="Ranking · lotes 12 meses" flush>
              <div className="tbl-wrap max-h-[420px] rounded-none border-0">
                <table className="tbl tbl-dense">
                  <thead><tr><th>Cliente</th><th className="num">Lotes 12 m</th></tr></thead>
                  <tbody>
                    {ranking.map(c => (
                      <tr key={c.cliente_id}>
                        <td className="max-w-[220px] truncate"><Link href={`${base}/clientes/${c.cliente_id}`} className="link">{c.nome}</Link></td>
                        <td className="num"><BarraCelula valor={c.lotes_12m} max={ranking[0]?.lotes_12m ?? 0} largura={64} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="Por responsável" subtitle="Só clientes migrados." flush>
              <div className="tbl-wrap rounded-none border-0">
                <table className="tbl tbl-dense">
                  <thead><tr><th>Responsável</th><th className="num">Migrados</th><th className="num">Com receita</th><th className="num">Lotes · mês</th><th className="num">Receita · mês</th><th className="num">Receita · 12 m</th></tr></thead>
                  <tbody>
                    {resp.map(g => (
                      <tr key={g.grupo}>
                        <td className="font-medium">{g.grupo}</td><td className="num">{n0(g.migrados)}</td><td className="num">{n0(g.comReceita)}</td>
                        <td className="num">{n0(g.lotesMes)}</td><td className="num">{r0(g.receitaMes)}</td><td className="num">{r0(g.receita12m)}</td>
                      </tr>
                    ))}
                    <tr className="total">
                      <td>Total</td><td className="num">{n0(migrados.length)}</td><td className="num">{n0(resp.reduce((s, g) => s + g.comReceita, 0))}</td>
                      <td className="num">{n0(resp.reduce((s, g) => s + g.lotesMes, 0))}</td><td className="num">{r0(resp.reduce((s, g) => s + g.receitaMes, 0))}</td><td className="num">{r0(resp.reduce((s, g) => s + g.receita12m, 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="Por situação" flush>
              <div className="tbl-wrap rounded-none border-0">
                <table className="tbl tbl-dense">
                  <thead><tr><th>Situação</th><th className="num">Clientes</th><th className="num">Lotes · 12 m</th><th className="num">Receita · 12 m</th></tr></thead>
                  <tbody>
                    {sit.length === 0 && <LinhaVazia colunas={4} />}
                    {sit.map(l => (
                      <tr key={l.situacao}>
                        <td><SituacaoBadge situacao={l.situacao} /></td><td className="num">{n0(l.clientes)}</td><td className="num">{n0(l.lotes12m)}</td><td className="num">{r0(l.receita12m)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="Receita por mês · janela do painel" subtitle={`Corretagem + zeragem + incentivo ${ctx.label}`} flush>
              <div className="tbl-wrap rounded-none border-0">
                <table className="tbl tbl-dense">
                  <thead><tr><th>Mês</th><th className="num">Lotes</th><th className="num">Corretagem</th><th className="num">Zeragem</th><th className="num">Total</th><th className="num">Incentivo</th></tr></thead>
                  <tbody>
                    {meses.map(m => {
                      const x = mensalMap.get(m)
                      return (
                        <tr key={m} className={m === mesRef ? 'font-semibold' : ''}>
                          <td>{mesCurto(m)}</td><td className="num">{n0(x?.lotes)}</td><td className="num">{rCurto(x?.receita_corretagem)}</td>
                          <td className="num">{rCurto(x?.receita_zeragem)}</td><td className="num">{rCurto(x?.receita)}</td><td className="num">{rCurto(x?.incentivo)}</td>
                        </tr>
                      )
                    })}
                    <tr className="total"><td>12 m</td><td className="num">{n0(totMensal.lotes)}</td><td className="num">{rCurto(totMensal.rc)}</td><td className="num">{rCurto(totMensal.rz)}</td><td className="num">{rCurto(totMensal.rc + totMensal.rz)}</td><td className="num">{rCurto(totMensal.inc)}</td></tr>
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </div>
      </PageBody>
    </>
  )
}
