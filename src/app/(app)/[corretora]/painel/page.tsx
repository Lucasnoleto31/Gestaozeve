export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { comissaoMensal, funilMensal, giroDiario, incentivoMes, lotesNaoCadastrados, mixPlataforma, painelClientesMensal, painelMensal, painelResumo, parametrosDaCorretora, ultimaData } from '@/lib/gestao/consultas'
import { calcularRepasse, configBtg } from '@/lib/gestao/btg'
import { projetarIncentivo, projetarMes, variacaoDe, variacaoMensal } from '@/lib/gestao/projecao'
import { temListaPropria, termosDaCorretora } from '@/lib/corretoras'
import { janelaMeses, limitesDoMes, mesAtual as mesDeHoje, mesCurto, mesLongo, somarMeses } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import type { Situacao } from '@/lib/gestao/tipos'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { DeltaText, KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { MesPicker } from '@/components/gestao/Filtros'
import { BarraCelula, LinhaVazia, RiscoTexto, SituacaoBadge, TRACO, dataCurta, n0, n2, p1, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { HeatmapClientes } from './HeatmapClientes'

// Mapa de calor: só os maiores clientes da janela (a lista completa fica na tela Clientes)
const TOP_HEATMAP = 80
// Projeção: meses de histórico que entram no perfil intra-mês
const MESES_PROJECAO = 24

export default async function PainelPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { corretora, mesRef, base } = ctx
  const meses = janelaMeses(mesRef, 12)
  const lim = limitesDoMes(mesRef)
  const termos = termosDaCorretora(corretora)
  const hoje = fmtDate(hojeBrasil())
  const mesCorrente = mesRef === mesDeHoje()

  // Tudo em paralelo; os agregados da base de clientes vêm prontos do banco (painel_resumo).
  // O giro por dia (até 24 meses) alimenta a projeção e a comparação com o mesmo ponto do mês anterior.
  const [painel, mensal, porCliente, naoCad, mix, funil, par, comissoes, giro, ultima, incentivo] = await Promise.all([
    painelResumo(corretora, mesRef),
    painelMensal(corretora, mesRef, 12),
    painelClientesMensal(corretora, mesRef, 12, TOP_HEATMAP),
    lotesNaoCadastrados(corretora),
    mixPlataforma(corretora, lim.inicio, lim.fim),
    funilMensal(mesRef, 12),
    parametrosDaCorretora(corretora),
    comissaoMensal(mesRef, 12, null, corretora),
    giroDiario(corretora, somarMeses(mesRef, -MESES_PROJECAO), lim.fim),
    ultimaData(corretora),
    // pontos por cliente só servem à projeção do incentivo no mês corrente
    mesCorrente ? incentivoMes(corretora, mesRef) : Promise.resolve([]),
  ])

  // Economia da corretora: no BTG a receita não tem incentivo por pontos e passa pelo
  // repasse (faixas progressivas), imposto, Delta e divisão entre os sócios
  const cfg = configBtg(par.parametros)
  const atp = cfg.modelo === 'ATP'
  const comRepasse = cfg.faixas.length > 0
  const listaPropria = temListaPropria(corretora)
  type Mes = typeof mensal[number]
  const receitaTotal = (m: Mes) => m.receita + (atp ? 0 : m.incentivo)
  const repasseDe = (m: Mes) => calcularRepasse(m.receita, cfg)

  // Fechamento previsto do mês corrente (perfil intra-mês de todo o histórico) e variações
  const proj = projetarMes(giro, mesRef, ultima, hoje, { maxMeses: MESES_PROJECAO })
  const mesAnt = mensal.find(m => m.mes_ref === proj.mesAnterior)
  const incentivoProj = !atp && proj.parcial ? projetarIncentivo(incentivo, proj.fator.lotes, par.faixas) : null
  const repasseProj = comRepasse && proj.parcial ? calcularRepasse(proj.receita.projetado, cfg) : null
  const repasseAnt = mesAnt ? repasseDe(mesAnt) : null
  // Clientes em risco: contagem e os 12 maiores vêm do painel_resumo (uma só passagem pela lista)
  const risco = painel.em_risco
  const totalRisco = painel.resumo.em_risco

  const r = painel.resumo
  const taxaMigracao = r.levados ? (r.migrados / r.levados) * 100 : 0
  const pctAtivosMigrados = r.migrados ? (r.ativos / r.migrados) * 100 : 0
  const pctAtivosLevados = r.levados ? (r.ativos / r.levados) * 100 : 0
  const assessores = painel.grupos.filter(g => g.tipo === 'assessor')
  const porResponsavel = [...painel.grupos.filter(g => g.tipo === 'responsavel')]
    .sort((a, b) => (a.grupo === 'Sem responsável' ? 1 : b.grupo === 'Sem responsável' ? -1 : a.grupo.localeCompare(b.grupo, 'pt-BR')))
  const baseStatus = [
    { status: 'Migrado', total: r.migrados, por: porResponsavel.map(g => g.migrados) },
    { status: 'Em processamento', total: r.em_processamento, por: porResponsavel.map(g => g.em_processamento) },
    { status: 'Recusou', total: r.recusaram, por: porResponsavel.map(g => g.recusaram) },
  ]
  const situacoes: { situacao: Situacao; qtde: number }[] = [
    { situacao: 'Ativo', qtde: r.ativos_sit }, { situacao: 'Inativo', qtde: r.inativos }, { situacao: 'Nunca girou', qtde: r.nunca_giraram },
  ]
  const semGiro = painel.sem_giro
  const totalClientesGiro = porCliente[0]?.total_clientes ?? 0
  const mesAtual = mensal.find(m => m.mes_ref === mesRef)
  const repasseMes = calcularRepasse(mesAtual?.receita ?? 0, cfg)
  const naoCadLinhas = naoCad.reduce((s, l) => s + l.linhas, 0)
  const naoCadLotes = naoCad.reduce((s, l) => s + l.lotes, 0)
  const mixTotal = mix.reduce((s, m) => s + m.lotes, 0)
  const funilPorMes = new Map(funil.map(f => [f.mes_ref, f]))
  // Comissão de parceiros (abertura e ativação de conta) nesta corretora, somando os parceiros
  const comissaoPorMes = new Map<string, { valor: number; aberturas: number; ativacoes: number }>()
  for (const c of comissoes) {
    const x = comissaoPorMes.get(c.mes_ref) ?? { valor: 0, aberturas: 0, ativacoes: 0 }
    x.valor += c.valor_abertura + c.valor_ativacao; x.aberturas += c.aberturas; x.ativacoes += c.ativacoes + c.reativacoes
    comissaoPorMes.set(c.mes_ref, x)
  }
  const mensalPorMes = new Map(mensal.map(m => [m.mes_ref, m]))
  // No celular só os 4 últimos meses ficam visíveis (os outros em telas ≥ 768 px)
  const colMes = (i: number) => (i < meses.length - 4 ? 'col-p2' : '')

  // Indicadores mensais: uma linha por indicador, uma coluna por mês
  type Linha = { label: string; valores: (number | null)[]; fmt: (v: number | null) => string; destaque?: 'bold' | 'total' | 'sub'; total?: boolean }
  const col = (fn: (m: Mes | undefined, f: typeof funil[number] | undefined) => number | null) =>
    meses.map(m => fn(mensalPorMes.get(m), funilPorMes.get(m)))
  const nn = (v: number | null) => (v == null ? TRACO : n0(v))
  const rr = (v: number | null) => (v == null ? TRACO : rCurto(v))
  const pp = (v: number | null) => (v == null ? TRACO : p1(v))
  // A mesma ordem do fechamento mensal do BTG: bruta → líquida → comissão → Delta → imposto → líquida
  const linhasRepasse: Linha[] = comRepasse ? [
    { label: `Receita bruta ${ctx.label} (impostos de ${fmtPct(cfg.impostosEmbutidosPct, 2)} no preço)`, valores: col(m => (m ? repasseDe(m).bruta : null)), fmt: rr, destaque: 'sub', total: true },
    { label: `(–) Impostos ${ctx.label} ${fmtPct(cfg.impostoBtgPct, 2)}`, valores: col(m => (m ? repasseDe(m).impostoBtg : null)), fmt: rr, destaque: 'sub', total: true },
    { label: `Receita líquida ${ctx.label}`, valores: col(m => (m ? repasseDe(m).liquida : null)), fmt: rr, total: true },
    { label: `Comissão ${ctx.label} (% efetivo)`, valores: col(m => (m && m.receita ? repasseDe(m).pctEfetivo : null)), fmt: pp, destaque: 'sub' },
    { label: `Comissão ${ctx.label}`, valores: col(m => (m ? repasseDe(m).comissao : null)), fmt: rr, destaque: 'bold', total: true },
    { label: `(–) Delta ${fmtPct(cfg.deltaPct, 0)}`, valores: col(m => (m ? repasseDe(m).delta : null)), fmt: rr, destaque: 'sub', total: true },
    { label: 'Comissão do escritório', valores: col(m => (m ? repasseDe(m).comissaoEscritorio : null)), fmt: rr, total: true },
    { label: `(–) Imposto ${fmtPct(cfg.impostoPct, 1)}`, valores: col(m => (m ? repasseDe(m).imposto : null)), fmt: rr, destaque: 'sub', total: true },
    { label: 'Comissão líquida', valores: col(m => (m ? repasseDe(m).liquido : null)), fmt: rr, destaque: 'total', total: true },
    ...cfg.participacoes.map((p): Linha => ({ label: `${p.nome} (${fmtPct(p.pct, 0)})`, valores: col(m => (m ? repasseDe(m).partes.find(x => x.nome === p.nome)?.valor ?? null : null)), fmt: rr, destaque: 'sub', total: true })),
    { label: 'Comissão líquida / receita', valores: col(m => (m && m.receita ? (repasseDe(m).liquido / m.receita) * 100 : null)), fmt: pp, destaque: 'sub' },
  ] : []
  const linhas: Linha[] = [
    { label: 'Clientes migrados (acumulado)', valores: col(m => m?.migrados_acumulados ?? null), fmt: nn },
    { label: 'Novas migrações', valores: col(m => m?.novas_migracoes ?? null), fmt: nn, total: true },
    { label: 'Clientes levados (data de entrada)', valores: col(m => m?.entradas ?? null), fmt: nn, total: true },
    { label: 'Clientes ativos', valores: col(m => m?.clientes_ativos ?? null), fmt: nn, destaque: 'bold' },
    { label: '% ativos da base migrada', valores: col(m => (m && m.migrados_acumulados ? (m.clientes_ativos / m.migrados_acumulados) * 100 : null)), fmt: pp, destaque: 'sub' },
    { label: '% ativos do total levado', valores: col(m => (m && r.levados ? (m.clientes_ativos / r.levados) * 100 : null)), fmt: pp, destaque: 'sub' },
    { label: 'Lotes girados', valores: col(m => m?.lotes ?? null), fmt: nn, total: true },
    { label: 'Lotes zerados', valores: col(m => m?.zerados ?? null), fmt: nn, total: true },
    ...(mensal.some(m => m.posicao > 0) ? [{ label: 'Posição (ações e contratos carregados, fora dos lotes)', valores: col(m => m?.posicao ?? null), fmt: nn, destaque: 'sub', total: true } as Linha] : []),
    { label: 'Lotes por cliente ativo', valores: col(m => (m && m.clientes_ativos ? m.lotes / m.clientes_ativos : null)), fmt: v => (v == null ? TRACO : n2(Math.round(v * 10) / 10)) },
    { label: 'Receita de corretagem', valores: col(m => m?.receita_corretagem ?? null), fmt: rr, total: true },
    { label: 'Receita de zeragem', valores: col(m => m?.receita_zeragem ?? null), fmt: rr, total: true },
    ...(mensal.some(m => m.receita_acoes > 0 || m.acoes_operacoes > 0) ? [
      { label: 'Corretagem fixa (ações, cripto e posições)', valores: col(m => m?.receita_acoes ?? null), fmt: rr, total: true } as Linha,
      { label: 'operações de ações e cripto (day trade)', valores: col(m => m?.acoes_operacoes ?? null), fmt: nn, destaque: 'sub', total: true } as Linha,
    ] : []),
    ...(atp ? [] : [{ label: `Incentivo ${ctx.label}`, valores: col(m => m?.incentivo ?? null), fmt: rr, total: true } as Linha]),
    { label: 'Receita total', valores: col(m => (m ? receitaTotal(m) : null)), fmt: rr, destaque: 'total', total: true },
    ...linhasRepasse,
    ...(comissoes.length ? [
      { label: 'Comissão de parceiros (abertura e ativação de conta)', valores: meses.map(m => comissaoPorMes.get(m)?.valor ?? null), fmt: rr, total: true } as Linha,
      { label: 'contas abertas por parceiros', valores: meses.map(m => comissaoPorMes.get(m)?.aberturas ?? null), fmt: nn, destaque: 'sub', total: true } as Linha,
      { label: 'ativações por parceiros (inclui reativações)', valores: meses.map(m => comissaoPorMes.get(m)?.ativacoes ?? null), fmt: nn, destaque: 'sub', total: true } as Linha,
    ] : []),
    { label: 'Leads recebidos', valores: col((_, f) => f?.recebidos ?? null), fmt: nn, total: true },
    { label: 'dos quais já eram clientes', valores: col((_, f) => f?.ja_clientes ?? null), fmt: nn, destaque: 'sub', total: true },
    { label: 'Leads ganhos (data do fechamento)', valores: col((_, f) => f?.ganhos ?? null), fmt: nn, total: true },
  ]

  const grafico = meses.map(m => {
    const x = mensalPorMes.get(m)
    return { label: mesCurto(m), lotes: x?.lotes ?? 0, receita: x ? receitaTotal(x) : 0, ativos: x?.clientes_ativos ?? 0 }
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
          <KpiCard label="Clientes levados" value={fmtNum(r.levados)} sub={`${fmtNum(r.contas)} contas · ${fmtNum(r.em_processamento)} em processamento`} />
          <KpiCard label="Taxa de migração" value={fmtPct(taxaMigracao)} sub={`${fmtNum(r.migrados)} migrados · ${fmtNum(r.recusaram)} recusaram`} />
          <KpiCard label="Ativos no mês" value={fmtNum(r.ativos)} sub={totalRisco ? <Link href={`${base}/clientes?risco=qualquer`} className="link text-warn">{fmtNum(totalRisco)} em risco</Link> : `giraram em ${mesCurto(mesRef)}`}
            delta={variacaoMensal(r.ativos, mesAnt?.clientes_ativos, proj.mesAnterior, proj.parcial, fmtNum)} />
          <KpiCard label="% ativos da base migrada" value={fmtPct(pctAtivosMigrados)} sub={`${fmtPct(pctAtivosLevados)} do total levado`} />
          <KpiCard label="Lotes no mês" value={fmtNum(r.lotes_mes)} sub={`${fmtNum(r.zerados_mes)} zerados · ${rCurto(r.receita_mes)}${mesAtual?.acoes_operacoes ? ` · ${fmtNum(mesAtual.acoes_operacoes)} op. de ações` : ''}${mesAtual?.posicao ? ` · ${fmtNum(mesAtual.posicao)} em posição` : ''}${proj.parcial ? ` · fecha em ${fmtNum(Math.round(proj.lotes.projetado))}` : ''}`}
            delta={variacaoDe(proj, proj.lotes, fmtNum)} />
          {comRepasse ? (
            <KpiCard destaque label="Comissão líquida no mês" value={rCurto(repasseMes.liquido)}
              sub={repasseProj ? `fecha em ${rCurto(repasseProj.liquido)} · comissão ${ctx.label} ${rCurto(repasseMes.comissao)}` : `comissão ${ctx.label} ${rCurto(repasseMes.comissao)}${repasseMes.partes.length ? ' · ' + repasseMes.partes.map(p => `${p.nome} ${rCurto(p.valor)}`).join(' · ') : ''}`}
              delta={variacaoMensal(repasseMes.liquido, repasseAnt?.liquido, proj.mesAnterior, proj.parcial, rCurto)} />
          ) : atp ? (
            <KpiCard destaque label="Receita no mês" value={rCurto(mesAtual?.receita ?? 0)} sub={proj.parcial ? `fecha em ${rCurto(proj.receita.projetado)}` : 'corretagem + zeragem'}
              delta={variacaoDe(proj, proj.receita, rCurto)} />
          ) : (
            <KpiCard label="Incentivo no mês" value={rCurto(mesAtual?.incentivo ?? 0)} sub={incentivoProj ? `fecha em ${rCurto(incentivoProj.total)} · ${fmtNum(incentivoProj.comFaixa)} com faixa` : `${fmtNum(mesAtual?.clientes_com_faixa ?? 0)} clientes com faixa`}
              delta={variacaoMensal(mesAtual?.incentivo ?? 0, mesAnt?.incentivo, proj.mesAnterior, proj.parcial, rCurto)} />
          )}
        </KpiRow>

        {proj.parcial && (
          <Panel
            title={`Fechamento previsto de ${mesLongo(mesRef)}`}
            subtitle={`${fmtNum(proj.diasDecorridos)} de ${fmtNum(proj.diasTotal)} dias úteis lançados (até ${dataCurta(proj.ultimaData)}) · ${proj.metodo === 'historico'
              ? `perfil de ${fmtNum(proj.mesesHistorico)} meses de histórico: neste ponto o mês costuma estar em ${fmtPct(proj.fracaoEsperada * 100, 0)} dos lotes`
              : 'menos de 3 meses de histórico: projeção pelo ritmo linear dos dias úteis'}.`}
          >
            <div className="tbl-wrap">
              <table className="tbl tbl-dense">
                <thead>
                  <tr>
                    <th>Indicador</th><th className="num col-p2">Até {dataCurta(proj.ultimaData)}</th><th className="num">Fecha em</th>
                    <th className="num col-p2">Faixa</th><th className="num col-p3">Ritmo linear</th><th className="num">{mesCurto(proj.mesAnterior)}</th><th className="num col-p2">Previsto vs {mesCurto(proj.mesAnterior)}</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    { label: 'Lotes girados', m: proj.lotes, fmt: (v: number) => n0(Math.round(v)) },
                    { label: 'Receita (corretagem, zeragem e avulsas)', m: proj.receita, fmt: rCurto },
                  ] as const).map(l => (
                    <tr key={l.label}>
                      <td className="font-medium">{l.label}</td>
                      <td className="num col-p2">{l.fmt(l.m.realizado)}</td>
                      <td className="num font-semibold">{l.fmt(l.m.projetado)}</td>
                      <td className="num col-p2 text-fg-muted">{proj.metodo === 'historico' ? `${l.fmt(l.m.baixo)} – ${l.fmt(l.m.alto)}` : TRACO}</td>
                      <td className="num col-p3 text-fg-muted">{l.fmt(l.m.linear)}</td>
                      <td className="num">{l.fmt(l.m.anteriorTotal ?? 0)}</td>
                      <td className="num col-p2"><DeltaText pct={l.m.anteriorTotal ? ((l.m.projetado - l.m.anteriorTotal) / l.m.anteriorTotal) * 100 : null} /></td>
                    </tr>
                  ))}
                  {incentivoProj && (
                    <tr>
                      <td className="font-medium">Incentivo {ctx.label}<span className="ml-1.5 text-micro text-fg-subtle">{fmtNum(incentivoProj.comFaixa)} com faixa{incentivoProj.sobem ? ` · ${fmtNum(incentivoProj.sobem)} sobem de faixa` : ''}</span></td>
                      <td className="num col-p2">{rCurto(mesAtual?.incentivo ?? 0)}</td>
                      <td className="num font-semibold">{rCurto(incentivoProj.total)}</td>
                      <td className="num col-p2 text-fg-muted">{TRACO}</td>
                      <td className="num col-p3 text-fg-muted">{TRACO}</td>
                      <td className="num">{rCurto(mesAnt?.incentivo)}</td>
                      <td className="num col-p2"><DeltaText pct={mesAnt?.incentivo ? ((incentivoProj.total - mesAnt.incentivo) / mesAnt.incentivo) * 100 : null} /></td>
                    </tr>
                  )}
                  {repasseProj && (
                    <tr className="total">
                      <td>Comissão líquida<span className="ml-1.5 text-micro font-normal text-fg-subtle">comissão {ctx.label} {fmtPct(repasseProj.pctEfetivo)} sobre a líquida prevista</span></td>
                      <td className="num col-p2">{rCurto(repasseMes.liquido)}</td>
                      <td className="num font-semibold">{rCurto(repasseProj.liquido)}</td>
                      <td className="num col-p2 text-fg-muted">{proj.metodo === 'historico' ? `${rCurto(calcularRepasse(proj.receita.baixo, cfg).liquido)} – ${rCurto(calcularRepasse(proj.receita.alto, cfg).liquido)}` : TRACO}</td>
                      <td className="num col-p3 text-fg-muted">{rCurto(calcularRepasse(proj.receita.linear, cfg).liquido)}</td>
                      <td className="num">{rCurto(repasseAnt?.liquido)}</td>
                      <td className="num col-p2"><DeltaText pct={repasseAnt?.liquido ? ((repasseProj.liquido - repasseAnt.liquido) / repasseAnt.liquido) * 100 : null} /></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-micro text-fg-subtle">
              Previsto = realizado ÷ fração que o mês costuma ter atingido neste dia útil (mediana dos meses do histórico); a faixa usa os quartis.
              Ritmo linear = realizado ÷ fração dos dias úteis. Dias úteis contam segunda a sexta, sem feriados.
              {repasseProj ? ' A comissão líquida prevista passa pela cadeia de repasse do BTG (faixas, impostos e Delta) sobre a receita prevista.' : ''}
            </p>
          </Panel>
        )}

        <Panel title="Lotes, receita e clientes ativos" subtitle={`12 meses até o mês de referência · receita = corretagem + zeragem${atp ? '' : ' + incentivo'}`}>
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

        <Panel title="Indicadores mensais" subtitle={comRepasse ? 'O último mês pode estar parcial · a cadeia de impostos, comissão e Delta segue o fechamento mensal do BTG (Parâmetros).' : 'O último mês pode estar parcial.'}>
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
                <Link href={`${base}/clientes?alerta=migrado%20sem%20data`} className={cn('link tabular-nums', r.migrados_sem_data && 'text-warn')}>{fmtNum(r.migrados_sem_data)}</Link>
              </li>
              <li className="flex items-center justify-between gap-3 py-3">
                <span>Clientes com mais de uma conta</span>
                <Link href={`${base}/clientes?alerta=contas`} className="link tabular-nums">{fmtNum(r.multi_conta)}</Link>
              </li>
              <li className="flex items-center justify-between gap-3 py-3">
                <span>Clientes com algum alerta de cadastro</span>
                <Link href={`${base}/clientes?alerta=qualquer`} className="link tabular-nums">{fmtNum(r.com_alertas)}</Link>
              </li>
              <li className="flex items-center justify-between gap-3 py-3">
                <span>Migrados que nunca giraram</span>
                <Link href={`${base}/clientes?situacao=Nunca%20girou`} className="link tabular-nums">{fmtNum(r.nunca_giraram)} · {fmtNum(r.inativos)} inativos</Link>
              </li>
            </ul>
          </Panel>

          <Panel title="Base por status" subtitle={listaPropria ? 'Status e responsável vêm da lista de clientes.' : 'Status vem da situação da conta; responsável vem do assessor.'}>
            <div className="tbl-wrap">
              <table className="tbl tbl-dense">
                <thead>
                  <tr>
                    <th>Status</th><th className="num">Clientes</th><th className="num">% da base</th>
                    {porResponsavel.map(g => <th key={g.grupo} className="num col-p2">{g.grupo}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {baseStatus.map(l => (
                    <tr key={l.status}>
                      <td>{l.status}</td>
                      <td className="num">{n0(l.total)}</td>
                      <td className="num">{r.levados ? fmtPct((l.total / r.levados) * 100) : TRACO}</td>
                      {l.por.map((v, i) => <td key={i} className={cn('num col-p2', !v && 'subtle')}>{n0(v)}</td>)}
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Total levado</td><td className="num">{fmtNum(r.levados)}</td><td className="num">100,0%</td>
                    {porResponsavel.map(g => <td key={g.grupo} className="num col-p2">{n0(g.levados)}</td>)}
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
                  {situacoes.map(l => (
                    <tr key={l.situacao}>
                      <td><SituacaoBadge situacao={l.situacao} /></td>
                      <td className="num">{n0(l.qtde)}</td>
                      <td className="num">{r.migrados ? fmtPct((l.qtde / r.migrados) * 100) : TRACO}</td>
                    </tr>
                  ))}
                  <tr className="total"><td>Migrados</td><td className="num">{fmtNum(r.migrados)}</td><td className="num">100,0%</td></tr>
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

        <Panel title={`Por ${termos.assessor.toLowerCase()}`} subtitle="Clientes levados e migrados pela conta principal; lotes e receita do mês e dos últimos 12 meses.">
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th>{termos.assessor}</th><th className="col-p3">Responsável</th><th className="num col-p2">Levados</th><th className="num col-p2">Migrados</th><th className="num">Ativos</th>
                  <th className="num col-p3">% ativação</th><th className="num">Lotes no mês</th><th className="num col-p2">Receita no mês</th><th className="num col-p3">Lotes 12 m</th><th className="num col-p3">Receita 12 m</th>
                </tr>
              </thead>
              <tbody>
                <tr className="total">
                  <td>Total</td><td className="col-p3"></td><td className="num col-p2">{fmtNum(r.levados)}</td><td className="num col-p2">{fmtNum(r.migrados)}</td><td className="num">{fmtNum(r.ativos)}</td>
                  <td className="num col-p3">{fmtPct(pctAtivosMigrados)}</td><td className="num">{fmtNum(r.lotes_mes)}</td><td className="num col-p2">{r0(r.receita_mes)}</td>
                  <td className="num col-p3">{fmtNum(r.lotes_12m)}</td><td className="num col-p3">{r0(r.receita_12m)}</td>
                </tr>
                {assessores.map(a => (
                  <tr key={a.grupo}>
                    <td><Link href={`${base}/assessores?assessor=${encodeURIComponent(a.grupo)}`} className="link">{a.grupo}</Link></td>
                    <td className="muted col-p3">{a.responsavel ?? TRACO}</td>
                    <td className="num col-p2">{n0(a.levados)}</td><td className="num col-p2">{n0(a.migrados)}</td><td className="num">{n0(a.ativos)}</td>
                    <td className={cn('num col-p3', !a.ativos && 'subtle')}>{a.migrados ? fmtPct((a.ativos / a.migrados) * 100) : TRACO}</td>
                    <td className="num"><BarraCelula valor={a.lotes_mes} max={assessores[0]?.lotes_mes ?? 0} /></td>
                    <td className="num col-p2">{r0(a.receita_mes)}</td><td className="num col-p3">{n0(a.lotes_12m)}</td><td className="num col-p3">{r0(a.receita_12m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-8 xl:grid-cols-2">
          <Panel title="Clientes em risco" subtitle={`Ativos em ${mesCurto(mesRef)} que pararam de girar (dias contados até o último lançamento) ou caíram contra os 3 meses anteriores · maiores primeiro.`}
            action={<Link href={`${base}/clientes?risco=qualquer`} className="link text-label">ver todos ({fmtNum(totalRisco)})</Link>}>
            <div className="tbl-wrap">
              <table className="tbl tbl-dense">
                <thead><tr><th>Cliente</th><th className="col-p2">Responsável</th><th>Risco</th><th className="num">Lotes mês</th><th className="num col-p2">Média 3 m</th><th className="num col-p3">Receita 12 m</th><th>Último giro</th></tr></thead>
                <tbody>
                  {risco.length === 0 && <LinhaVazia colunas={7}>Nenhum cliente em risco.</LinhaVazia>}
                  {risco.map(c => (
                    <tr key={c.cliente_id}>
                      <td className="max-w-[200px] truncate"><Link href={`${base}/clientes/${c.cliente_id}`} className="link">{c.nome}</Link></td>
                      <td className="muted col-p2">{c.responsavel ?? TRACO}</td>
                      <td><RiscoTexto risco={c.risco} diasSemGiro={c.dias_sem_giro} /></td>
                      <td className={cn('num', !c.lotes_mes && 'subtle')}>{n0(c.lotes_mes)}</td>
                      <td className="num col-p2">{n0(Math.round(c.lotes_media_3m))}</td>
                      <td className="num col-p3">{r0(c.receita_12m)}</td>
                      <td className="num">{dataCurta(c.ultimo_giro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Migrados sem giro" subtitle="Priorizar contato · migrações mais recentes primeiro."
            action={<Link href={`${base}/clientes?situacao=Nunca%20girou`} className="link text-label">ver todos ({fmtNum(r.nunca_giraram)})</Link>}>
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
        </div>

        <HeatmapClientes meses={meses} dados={porCliente} base={base} totalClientes={totalClientesGiro} />
      </PageBody>
    </>
  )
}
