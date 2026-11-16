export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { clientesLista, giroDiario, painelMensal, ultimaData } from '@/lib/gestao/consultas'
import { mediana, porResponsavel, valorDoCliente, valorPorGrupo, valorPorSafra, SEM_RESP } from '@/lib/gestao/derivados'
import { MOMENTO_GRUPO, MOMENTO_RESUMO, somarPorMomento } from '@/lib/gestao/momentoCliente'
import { projetarMes, variacaoDe } from '@/lib/gestao/projecao'
import { apoioDaReceita, doPrimeiroComDado, fraseDaReceita, maiores } from '@/lib/gestao/receitaTela'
import { janelaMeses, limitesDoMes, mesCurto, somarMeses } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { DeltaPill, KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Alert } from '@/components/ui/Alert'
import { Dica } from '@/components/ui/Dica'
import { Recolhido } from '@/components/ui/Recolhido'
import { MesPicker } from '@/components/gestao/Filtros'
import { Resumo } from '@/components/gestao/Resumo'
import { BarraCelula, LinhaVazia, TRACO, dataCurta, n0, n2, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { TabelaReceita } from './TabelaReceita'
import { compactar } from '@/lib/compacto'
import { CAMPOS_RECEITA_LINHA } from '@/lib/gestao/tipos'

// Receita: quanto entrou no mês, de onde veio e em quanto vai fechar. A tela abre com a resposta em uma
// frase e quatro números; depois, a receita mês a mês por tipo, de onde ela vem (os 10 maiores clientes
// e a divisão por responsável) e a tabela por cliente, com o detalhe de cada um na linha expandida.
// O que saiu da visão principal no redesenho de 16/11/2026 continua aqui: os números mês a mês em "ver
// os números" e o valor do cliente, as safras e a receita por estado em "Análises". Só o ranking de
// lotes saiu de vez, porque repetia a tabela. As contas são as mesmas de antes.
export default async function ReceitaPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { corretora, mesRef, base } = ctx
  const meses = janelaMeses(mesRef, 12)
  const hoje = fmtDate(hojeBrasil())
  const [todos, mensal, giro, ultima] = await Promise.all([
    clientesLista(corretora, mesRef), painelMensal(corretora, mesRef, 12),
    giroDiario(corretora, somarMeses(mesRef, -24), limitesDoMes(mesRef).fim), ultimaData(corretora),
  ])
  const clientes = todos.filter(c => c.status !== 'Recusou')
  const migrados = clientes.filter(c => c.status === 'Migrado')
  // Fechamento previsto (perfil intra-mês do histórico) e variação contra o mesmo ponto do mês anterior
  const proj = projetarMes(giro, mesRef, ultima, hoje)
  const mesAnt = somarMeses(mesRef, -1)

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
  const maiorEmLotes = [...clientes].sort((a, b) => b.lotes_12m - a.lotes_12m)[0]
  const mensalMap = new Map(mensal.map(m => [m.mes_ref, m]))
  const doMes = mensalMap.get(mesRef), doAnterior = mensalMap.get(mesAnt)
  const fixaMes = doMes?.receita_acoes ?? 0
  const porLote = lotesMes ? receitaMes / lotesMes : null
  const porLoteAnterior = doAnterior && doAnterior.lotes ? doAnterior.receita / doAnterior.lotes : null

  // Receita mês a mês por tipo, sem os meses vazios do começo (o BTG começou em set/26)
  const serie = doPrimeiroComDado(meses.map(m => ({ mes: m, x: mensalMap.get(m) })), l => !!l.x && (l.x.lotes > 0 || l.x.receita > 0 || l.x.incentivo > 0))
  const temFixa = serie.some(l => (l.x?.receita_acoes ?? 0) > 0), temIncentivo = serie.some(l => (l.x?.incentivo ?? 0) > 0)
  const totMensal = serie.reduce((a, l) => ({ lotes: a.lotes + (l.x?.lotes ?? 0), rc: a.rc + (l.x?.receita_corretagem ?? 0), rz: a.rz + (l.x?.receita_zeragem ?? 0), ra: a.ra + (l.x?.receita_acoes ?? 0), inc: a.inc + (l.x?.incentivo ?? 0) }), { lotes: 0, rc: 0, rz: 0, ra: 0, inc: 0 })
  const receitaDosMeses = totMensal.rc + totMensal.rz + totMensal.ra
  // A soma dos meses é da corretora inteira; a soma por cliente (receita12) só de quem está cadastrado e não
  // recusou. Na Genial as duas diferem (contas com lotes sem cliente cadastrado): a tela diz de quanto e por quê.
  const foraDosClientes = { receita: receitaDosMeses - receita12, lotes: totMensal.lotes - lotes12 }

  // De onde vem: os 10 maiores clientes do mês e a divisão por responsável. A divisão é a de antes (só
  // clientes migrados); o que vier de conta ainda em abertura entra numa linha à parte, para fechar com o total.
  const top = maiores(clientes, c => c.receita_mes, 10)
  const resp = porResponsavel(migrados).filter(g => g.receitaMes > 0 || g.receita12m > 0).sort((a, b) => b.receitaMes - a.receitaMes || b.receita12m - a.receita12m)
  const emAbertura = clientes.filter(c => c.status !== 'Migrado')
  const abertura = { comReceita: emAbertura.filter(c => c.receita_mes > 0).length, receitaMes: emAbertura.reduce((s, c) => s + c.receita_mes, 0), receita12m: emAbertura.reduce((s, c) => s + c.receita_12m, 0) }
  const temAbertura = abertura.receitaMes > 0 || abertura.receita12m > 0

  // Análises (recolhidas): valor do cliente, safras e receita por estado
  const semS44 = migrados.some(c => c.receita_12m > 0) && migrados.every(c => c.receita_total === 0)
  const ltv = valorDoCliente(migrados)
  const ltvResp = valorPorGrupo(migrados, c => c.responsavel ?? SEM_RESP)
  const ltvSafra = valorPorSafra(migrados, 6)
  const porEstado = somarPorMomento(clientes)
  const n1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

  return (
    <>
      <PageHeader eyebrow={ctx.eyebrow} title="Receita" actions={<MesPicker valor={mesRef} />} />
      <PageBody>
        <Resumo frase={fraseDaReceita(proj, receitaMes)} apoio={apoioDaReceita({ corretagem: corretagemMes, zeragem: zeragemMes, outras: fixaMes, incentivo: doMes?.incentivo ?? 0 })} />

        <KpiRow cols={4}>
          <KpiCard destaque label={`Receita em ${mesCurto(mesRef)}`} value={rCurto(receitaMes)} delta={variacaoDe(proj, proj.receita, rCurto)}
            dica="Corretagem mais zeragem dos clientes no mês. Recusados ficam de fora; o incentivo da corretora não entra." />
          {proj.parcial ? (
            <KpiCard label="Fecha em" value={rCurto(proj.receita.projetado)}
              delta={{ atual: proj.receita.projetado, anterior: proj.receita.anteriorTotal, rotulo: `vs ${mesCurto(mesAnt)} inteiro`, fmt: rCurto }}
              dica="Previsão para o mês inteiro: a receita até agora, levada ao fim do mês pelo ritmo que os meses anteriores tinham neste mesmo ponto." />
          ) : (
            <KpiCard label="Receita em 12 meses" value={rCurto(receita12)} valueClassName={receita12 >= 1_000_000 ? 'max-md:text-section' : undefined} sub={`${fmtNum(lotes12)} lotes`}
              dica="Soma dos clientes cadastrados nos 12 meses até este mês. Lotes de contas sem cliente cadastrado ficam de fora; por isso pode ser menor que a soma dos meses do gráfico." />
          )}
          <KpiCard label="R$ por lote" value={porLote != null ? n2(Math.round(porLote * 1000) / 1000) : TRACO}
            delta={porLote != null ? { atual: porLote, anterior: porLoteAnterior, rotulo: `vs ${mesCurto(mesAnt)}`, fmt: v => n2(Math.round(v * 1000) / 1000) } : null}
            dica={`Receita do mês dividida pelos lotes do mês (${fmtNum(lotesMes)} lotes, ${fmtNum(zeradosMes)} contratos zerados). A tarifa média cadastrada é ${n2(Math.round(tarifaMedia * 100) / 100)}.`} />
          <KpiCard label="Clientes com receita" value={fmtNum(comReceita.length)} sub={`${fmtPct(migrados.length ? (comReceita.length / migrados.length) * 100 : 0, 0)} dos ${fmtNum(migrados.length)} migrados`}
            dica="Clientes com alguma receita no mês, comparados com todos os que já migraram." />
        </KpiRow>

        <Panel title="Receita por mês" subtitle={serie.length ? `${rCurto(receitaDosMeses)} de ${mesCurto(serie[0].mes)} a ${mesCurto(mesRef)}, com ${fmtNum(totMensal.lotes)} lotes${temIncentivo ? `, mais ${rCurto(totMensal.inc)} de incentivo` : ''}.` : undefined}>
          {serie.length === 0 ? <p className="py-10 text-center text-dense text-fg-subtle">Sem receita lançada na janela.</p> : (
            <>
              <GraficoSeries
                dados={serie.map(l => ({ label: mesCurto(l.mes), corretagem: l.x?.receita_corretagem ?? 0, zeragem: l.x?.receita_zeragem ?? 0, fixa: l.x?.receita_acoes ?? 0, incentivo: l.x?.incentivo ?? 0 }))}
                series={[
                  { key: 'corretagem', nome: 'Corretagem', tipo: 'bar' as const, empilhar: 'r' },
                  { key: 'zeragem', nome: 'Zeragem', tipo: 'bar' as const, empilhar: 'r' },
                  ...(temFixa ? [{ key: 'fixa', nome: 'Receita fixa', tipo: 'bar' as const, empilhar: 'r' }] : []),
                  ...(temIncentivo ? [{ key: 'incentivo', nome: 'Incentivo', tipo: 'bar' as const, empilhar: 'r' }] : []),
                ]}
                colorido formato="brl" altura={260}
              />
              <Recolhido tamanho="linha" titulo="ver os números mês a mês">
                <div className="tbl-wrap">
                  <table className="tbl tbl-dense max-md:[&_td]:px-1.5 max-md:[&_th]:px-1.5">
                    <thead><tr><th>Mês</th><th className="num col-p2">Lotes</th><th className="num">Corretagem</th><th className="num">Zeragem</th>{temFixa && <th className="num col-p2">Fixa</th>}<th className="num">Total</th>{temIncentivo && <th className="num col-p2">Incentivo</th>}</tr></thead>
                    <tbody>
                      {serie.map(({ mes, x }) => (
                        <tr key={mes} className={cn(mes === mesRef && 'font-semibold')}>
                          <td>{mesCurto(mes)}</td><td className="num col-p2">{n0(x?.lotes)}</td><td className="num">{rCurto(x?.receita_corretagem)}</td><td className="num">{rCurto(x?.receita_zeragem)}</td>
                          {temFixa && <td className="num col-p2">{rCurto(x?.receita_acoes)}</td>}<td className="num">{rCurto(x?.receita)}</td>{temIncentivo && <td className="num col-p2">{rCurto(x?.incentivo)}</td>}
                        </tr>
                      ))}
                      <tr className="total">
                        <td>Total</td><td className="num col-p2">{n0(totMensal.lotes)}</td><td className="num">{rCurto(totMensal.rc)}</td><td className="num">{rCurto(totMensal.rz)}</td>
                        {temFixa && <td className="num col-p2">{rCurto(totMensal.ra)}</td>}<td className="num">{rCurto(receitaDosMeses)}</td>{temIncentivo && <td className="num col-p2">{rCurto(totMensal.inc)}</td>}
                      </tr>
                    </tbody>
                  </table>
                </div>
                {foraDosClientes.receita > 1 && (
                  <p className="mt-2 max-w-3xl text-label text-fg-muted">
                    A soma dos meses passa da soma por cliente ({rCurto(receita12)}) em {rCurto(foraDosClientes.receita)}{foraDosClientes.lotes > 0 ? ` e ${fmtNum(foraDosClientes.lotes)} lotes` : ''}: são lotes de contas sem cliente cadastrado ou de quem recusou, que não entram na tabela por cliente.{' '}
                    <Link href={`${base}/importar`} className="link">Ver as contas sem cliente</Link>
                  </p>
                )}
              </Recolhido>
            </>
          )}
        </Panel>

        <div className="grid gap-8 xl:grid-cols-2">
          <Panel title="De onde vem: os 10 maiores clientes" subtitle={top.itens.length ? `Juntos, ${fmtPct(top.pctJuntos, 0)} da receita de ${mesCurto(mesRef)}.` : undefined}>
            <div className="tbl-wrap">
              <table className="tbl tbl-dense">
                <thead><tr><th>Cliente</th><th className="num"><span className="md:hidden">Receita</span><span className="hidden md:inline">Receita no mês</span></th><th className="num"><span className="md:hidden">%</span><span className="hidden md:inline">% do total</span></th></tr></thead>
                <tbody>
                  {top.itens.length === 0 && <LinhaVazia colunas={3}>Sem receita no mês.</LinhaVazia>}
                  {top.itens.map(c => (
                    <tr key={c.cliente_id}>
                      <td className="max-w-[170px] truncate md:max-w-[260px]"><Link href={`${base}/clientes/${c.cliente_id}`} className="link font-medium">{c.nome}</Link></td>
                      {/* no celular só o número: a barrinha empurrava a tabela para fora da tela */}
                      <td className="num"><span className="md:hidden">{rCurto(c.valor)}</span><span className="hidden md:inline"><BarraCelula valor={c.valor} max={top.itens[0]?.valor ?? 0} fmt={rCurto} largura={64} /></span></td>
                      <td className="num">{fmtPct(c.pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="De onde vem: por responsável" subtitle="Quem cuida dos clientes que geraram a receita do mês.">
            <div className="tbl-wrap">
              <table className="tbl tbl-dense">
                <thead><tr><th>Responsável</th><th className="num col-p2">Clientes com receita</th><th className="num"><span className="md:hidden">Receita</span><span className="hidden md:inline">Receita no mês</span></th><th className="num"><span className="md:hidden">%</span><span className="hidden md:inline">% do total</span></th><th className="num col-p2">Receita 12 meses</th></tr></thead>
                <tbody>
                  {resp.length === 0 && !temAbertura && <LinhaVazia colunas={5}>Sem receita na janela.</LinhaVazia>}
                  {resp.map(g => (
                    <tr key={g.grupo}>
                      <td className="font-medium">{g.grupo}</td><td className="num col-p2">{n0(g.comReceita)}</td>
                      <td className="num">{rCurto(g.receitaMes)}</td><td className="num">{receitaMes ? fmtPct((g.receitaMes / receitaMes) * 100) : TRACO}</td><td className="num col-p2">{rCurto(g.receita12m)}</td>
                    </tr>
                  ))}
                  {temAbertura && (
                    <tr>
                      <td className="muted">Contas em abertura</td><td className="num col-p2">{n0(abertura.comReceita)}</td>
                      <td className="num">{rCurto(abertura.receitaMes)}</td><td className="num">{receitaMes ? fmtPct((abertura.receitaMes / receitaMes) * 100) : TRACO}</td><td className="num col-p2">{rCurto(abertura.receita12m)}</td>
                    </tr>
                  )}
                  {(resp.length > 0 || temAbertura) && (
                    <tr className="total">
                      <td>Total</td><td className="num col-p2">{n0(comReceita.length)}</td><td className="num">{rCurto(receitaMes)}</td><td className="num">{receitaMes ? '100,0%' : TRACO}</td><td className="num col-p2">{rCurto(receita12)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <TabelaReceita clientes={compactar(clientes, CAMPOS_RECEITA_LINHA)} base={base} />

        <Recolhido titulo="Análises" resumo="valor do cliente, safras de migração e receita por estado">
          <div className="grid gap-8 xl:grid-cols-2">
            <Panel title={<span className="inline-flex items-center gap-1.5">Valor do cliente<Dica texto="Receita bruta de todo o histórico (corretagem, zeragem e avulsas, antes de repasse e impostos) dividida pelas migrações: quanto vale levar um cliente." /></span>}>
              {semS44 ? <Alert tone="warn" className="mb-4">Receita no histórico ainda não disponível: rode o script S44 no banco.</Alert> : null}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-dense">
                <div>
                  <dt className="label">Por migração</dt>
                  <dd className="mt-0.5 text-section font-semibold tabular-nums">{rCurto(ltv.ltvPorMigracao)}</dd>
                  <dd className="text-micro text-fg-muted">{fmtNum(ltv.migrados)} migrados, com quem nunca operou</dd>
                </div>
                <div>
                  <dt className="label">Por cliente que operou</dt>
                  <dd className="mt-0.5 text-section font-semibold tabular-nums">{rCurto(ltv.receitaPorClienteComGiro)}</dd>
                  <dd className="text-micro text-fg-muted">mediana {rCurto(ltv.medianaComGiro)} · {fmtNum(ltv.comGiro)} clientes</dd>
                </div>
                <div>
                  <dt className="label">Por mês com operação</dt>
                  <dd className="mt-0.5 text-section font-semibold tabular-nums">{rCurto(ltv.receitaPorMesAtivo)}</dd>
                  <dd className="text-micro text-fg-muted">vida média de {n1(ltv.mesesAtivosMedio)} meses com operação</dd>
                </div>
                <div>
                  <dt className="label">Receita no histórico</dt>
                  <dd className="mt-0.5 text-section font-semibold tabular-nums">{rCurto(ltv.receitaTotal)}</dd>
                  <dd className="text-micro text-fg-muted">desde o primeiro lote</dd>
                </div>
              </dl>
              <div className="tbl-wrap mt-4">
                <table className="tbl tbl-dense">
                  <thead><tr><th>Responsável</th><th className="num">Migrados</th><th className="num col-p2">Operaram</th><th className="num">Por migração</th><th className="num col-p2">Por mês com operação</th></tr></thead>
                  <tbody>
                    {ltvResp.map(g => (
                      <tr key={g.grupo}>
                        <td className="font-medium">{g.grupo}</td><td className="num">{n0(g.migrados)}</td><td className="num col-p2">{n0(g.comGiro)}</td>
                        <td className="num">{r0(g.ltvPorMigracao)}</td><td className="num col-p2">{r0(g.receitaPorMesAtivo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <div className="min-w-0 space-y-8">
              {ltvSafra.length > 0 && (
                <Panel title={<span className="inline-flex items-center gap-1.5">Safras de migração<Dica texto="Quem migrou em cada mês e quanto já rendeu desde então. Safra recente ainda está rendendo: compare só safras com a mesma idade." /></span>}>
                  <div className="tbl-wrap">
                    <table className="tbl tbl-dense">
                      <thead><tr><th>Migrou em</th><th className="num">Migrados</th><th className="num col-p2">Operaram</th><th className="num col-p2">Receita</th><th className="num">Por migração</th></tr></thead>
                      <tbody>
                        {ltvSafra.map(s => (
                          <tr key={s.safra}>
                            <td className="font-medium">{mesCurto(s.safra)}</td><td className="num">{n0(s.migrados)}</td><td className="num col-p2">{n0(s.comGiro)}</td>
                            <td className="num col-p2">{rCurto(s.receitaTotal)}</td><td className="num">{r0(s.ltvPorMigracao)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              )}

              <Panel title="Por estado do cliente" subtitle="Os grupos da tela Clientes; um clique abre a lista.">
                <div className="tbl-wrap">
                  <table className="tbl tbl-dense">
                    <thead><tr><th>Grupo</th><th className="num">Clientes</th><th className="num col-p2">Lotes 12 meses</th><th className="num">Receita 12 meses</th></tr></thead>
                    <tbody>
                      {porEstado.length === 0 && <LinhaVazia colunas={4} />}
                      {porEstado.map(l => (
                        <tr key={l.momento}>
                          <td className="whitespace-nowrap"><Link href={`${base}/clientes?momento=${l.momento}`} className="link font-medium" title={MOMENTO_RESUMO[l.momento]}>{MOMENTO_GRUPO[l.momento]}</Link></td>
                          <td className="num">{n0(l.clientes)}</td><td className="num col-p2">{n0(l.lotes12m)}</td><td className="num">{rCurto(l.receita12m)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="Outros números do mês">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-dense md:grid-cols-3">
                  <div><dt className="label">Receita por cliente ativo</dt><dd className="mt-0.5 font-semibold tabular-nums">{ativos.length ? rCurto(receitaMes / ativos.length) : TRACO}</dd><dd className="text-micro text-fg-muted">mediana {rCurto(mediana(comReceita.map(c => c.receita_mes)))}</dd></div>
                  <div><dt className="label">Maior cliente</dt><dd className="mt-0.5 font-semibold tabular-nums">{maiorEmLotes && lotes12 ? fmtPct((maiorEmLotes.lotes_12m / lotes12) * 100, 0) : TRACO}</dd><dd className="text-micro text-fg-muted">dos lotes de 12 meses</dd></div>
                  <div>
                    <dt className="label">Lotes no mês</dt><dd className="mt-0.5 font-semibold tabular-nums">{fmtNum(lotesMes)}</dd>
                    <dd><DeltaPill delta={variacaoDe(proj, proj.lotes, fmtNum)} /></dd>
                    <dd className="text-micro text-fg-muted">{fmtNum(zeradosMes)} contratos zerados{proj.parcial ? ` · fecha em ${fmtNum(Math.round(proj.lotes.projetado))}` : ''}</dd>
                  </div>
                  <div><dt className="label">Tarifa média cadastrada</dt><dd className="mt-0.5 font-semibold tabular-nums">{n2(Math.round(tarifaMedia * 100) / 100)}</dd><dd className="text-micro text-fg-muted">R$ por lote</dd></div>
                  <div><dt className="label">Lançado até</dt><dd className="mt-0.5 font-semibold tabular-nums">{dataCurta(ultima)}</dd><dd className="text-micro text-fg-muted">último dia com lotes</dd></div>
                </dl>
              </Panel>
            </div>
          </div>
        </Recolhido>
      </PageBody>
    </>
  )
}
