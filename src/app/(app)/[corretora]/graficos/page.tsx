export const dynamic = 'force-dynamic'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import {
  assessoresMensal, clientesPorAssessor, diario, funilMensal, funilSafraPor, leadsDiario, migracoesDiarias, mixPlataforma, painelClientesMensal, painelMensal,
} from '@/lib/gestao/consultas'
import { ativacaoPorMes, concentracaoPorMes, fluxoDaCarteira, fraseDosGraficos, juntarPlataformas, periodoDe, semanasDe, somarPorSemana, PERIODOS_GRAFICOS } from '@/lib/gestao/graficosTela'
import { evolucaoDoTime } from '@/lib/gestao/responsaveisTela'
import { doPrimeiroComDado } from '@/lib/gestao/receitaTela'
import { diasEntre, ehIso, inicioSemana, janelaMeses, limitesDoMes, mesCurto, somarMeses } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum, fmtPct } from '@/lib/format'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Dica } from '@/components/ui/Dica'
import { RecolheNoCelular } from '@/components/ui/RecolheNoCelular'
import { SegParam } from '@/components/gestao/Filtros'
import { Resumo } from '@/components/gestao/Resumo'
import { Secao, n2, rCurto, TRACO } from '@/components/gestao/Celulas'
import { GraficoBarrasH, GraficoRosca, GraficoSeries } from '@/components/gestao/Graficos'
import type { PainelMensalRow } from '@/lib/gestao/tipos'
import { EvolucaoTime } from '../assessores/EvolucaoTime'

// Gráficos: a operação na ordem em que ela acontece (lead, conta, lotes, receita, retenção, time), com um
// ou dois gráficos por bloco e o título de cada um dizendo a pergunta que ele responde.
// Redesenho de nov/26: eram 7 cartões e 13 gráficos sem ordem, com dois seletores (data de referência e
// janela). Agora há um seletor de período só (?periodo=3|6|12, meses até o mês de referência); os três
// gráficos de "migrados" viraram um; o mix de plataforma junta nomes repetidos; saíram os que eram só uma
// foto que já existe em outra tela (leads por status, funil da base, top 10 clientes, leads por corretora).
// Os endereços antigos continuam abrindo: ?mes= escolhe o mês de referência e ?ref= o último dia das séries.
const vazio = <p className="py-10 text-center text-dense text-fg-subtle">Sem dados no período.</p>

// Celular (DESIGN.md §8): eram 12 gráficos em 6,4 telas. Ali a tela abre pela frase, pela receita e pelos
// lotes; cada bloco que não é do dia a dia (Captação, Ativação, Retenção, Time e plataformas) fica atrás do
// próprio título, com o número dele na linha de baixo, e nos blocos abertos (Lotes e Receita) o segundo
// gráfico também. No computador nada muda: o RecolheNoCelular fica aberto e as trocas abaixo só agem no
// celular.
const soNoComputador = (t: ReactNode) => <span className="max-md:hidden">{t}</span>
// subtítulo de duas ou três linhas vira o "i" ao lado do título, só no celular (§8.9)
const comDica = (titulo: string, dica: string) => <>{titulo}<Dica texto={dica} className="ml-1.5 md:hidden" /></>
const nomeDoBloco = (numero: number, titulo: string) => <><span className="mr-1.5 text-fg-subtle">{numero} ·</span>{titulo}</>

export default async function GraficosPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { corretora, mesRef, q, base } = ctx
  const periodo = periodoDe(q.periodo)
  const hoje = fmtDate(hojeBrasil())
  const lim = limitesDoMes(mesRef)
  const meses = janelaMeses(mesRef, periodo)
  const inicio = meses[0]
  const fim = ehIso(q.ref) && q.ref >= inicio && q.ref <= lim.fim ? q.ref : lim.fim
  const mesCorrente = mesRef.slice(0, 7) === hoje.slice(0, 7)
  const semanas = semanasDe(inicio, fim)

  const [mensal, porPessoa, mix, origens, clientes, matriz, migr, dias, leadsDia, funil] = await Promise.all([
    painelMensal(corretora, mesRef, periodo * 2),               // o período e o anterior, para comparar
    assessoresMensal(corretora, mesRef, periodo),
    mixPlataforma(corretora, inicio, fim),
    funilSafraPor('origem', mesRef, periodo),
    clientesPorAssessor(corretora, mesRef),
    painelClientesMensal(corretora, mesRef, periodo + 1, null),  // um mês a mais: quem operava antes do primeiro mês
    migracoesDiarias(corretora, semanas[0] ?? inicio, fim),
    diario(corretora, semanas[0] ?? inicio, fim),
    // leads por dia só existem "dos últimos N dias até hoje": com um mês antigo de referência a captação vai por mês
    mesCorrente ? leadsDiario(diasEntre(inicioSemana(inicio), hoje) + 1) : Promise.resolve(null),
    funilMensal(mesRef, periodo),
  ])

  // ── Receita e lotes por mês (corretora), sem os meses vazios do começo ──
  const mensalMap = new Map(mensal.map(m => [m.mes_ref, m]))
  const serieMes = doPrimeiroComDado(meses.map(m => ({ mes: m, x: mensalMap.get(m) })), l => !!l.x && (l.x.lotes > 0 || l.x.receita > 0 || l.x.incentivo > 0))
  const temFixa = serieMes.some(l => (l.x?.receita_acoes ?? 0) > 0), temIncentivo = serieMes.some(l => (l.x?.incentivo ?? 0) > 0)
  const soma = (ms: string[], f: (x: PainelMensalRow) => number) => ms.reduce((s, m) => { const x = mensalMap.get(m); return s + (x ? f(x) : 0) }, 0)
  const anteriores = janelaMeses(somarMeses(inicio, -1), periodo)
  const receita = soma(meses, x => x.receita), lotes = soma(meses, x => x.lotes)
  const receitaAntes = soma(anteriores, x => x.receita), lotesAntes = soma(anteriores, x => x.lotes)
  // só compara quando o período anterior está inteiro (todos os meses com lotes): com a corretora no começo, não
  const anteriorInteiro = anteriores.every(m => (mensalMap.get(m)?.lotes ?? 0) > 0)
  const comparacao = (atual: number, antes: number, fmt: (n: number) => string) => (anteriorInteiro && antes > 0 ? { atual, anterior: antes, rotulo: `vs os ${periodo} meses anteriores`, fmt, neutro: mesCorrente } : null)

  // ── Captação (leads do escritório inteiro) ──
  const funilMap = new Map(funil.map(f => [f.mes_ref, f]))
  const leadsPeriodo = meses.reduce((s, m) => s + (funilMap.get(m)?.recebidos ?? 0), 0)
  const ganhosPeriodo = meses.reduce((s, m) => s + (funilMap.get(m)?.ganhos ?? 0), 0)
  const captacao = doPrimeiroComDado<{ label: string; recebidos: number; ganhos: number }>(leadsDia
    ? somarPorSemana(leadsDia.filter(d => d.dia <= fim), d => d.dia, semanas, { recebidos: d => d.entraram, ganhos: d => d.ganhos })
    : meses.map(m => ({ label: mesCurto(m), recebidos: funilMap.get(m)?.recebidos ?? 0, ganhos: funilMap.get(m)?.ganhos ?? 0 })), c => c.recebidos > 0 || c.ganhos > 0)
  const porOrigem = origens.filter(o => o.recebidos > 0).sort((a, b) => b.recebidos - a.recebidos).slice(0, 10)
    .map(o => ({ nome: `${o.grupo} (${fmtNum(o.recebidos)})`, valor: Math.round((o.ativados / o.recebidos) * 1000) / 10 }))

  // ── Ativação ──
  const contas = doPrimeiroComDado(somarPorSemana(migr, d => d.dia, semanas, { entradas: d => d.entradas, migrados: d => d.migrados }), s => s.entradas > 0 || s.migrados > 0)
  const safras = doPrimeiroComDado(ativacaoPorMes(clientes, meses), s => s.migraram > 0)
  const migraram = safras.reduce((s, x) => s + x.migraram, 0), operaram = safras.reduce((s, x) => s + x.operaram, 0)

  // ── Lotes ──
  const lotesSemana = doPrimeiroComDado(somarPorSemana(dias, d => d.dia, semanas, { lotes: d => d.lotes }), s => s.lotes > 0)

  // ── Retenção (o mês em andamento fica de fora de "pararam": quem ainda não operou no mês não parou) ──
  const temLotesEm = (m: string) => matriz.some(x => x.mes_ref.slice(0, 7) === m.slice(0, 7) && x.lotes > 0)
  // também fica de fora o primeiro mês da corretora: nele todo mundo "começou"
  const mesesDoFluxo = (mesCorrente ? meses.slice(0, -1) : meses).filter(m => temLotesEm(m) && temLotesEm(somarMeses(m, -1)))
  const fluxo = fluxoDaCarteira(matriz, mesesDoFluxo)
  const concentracao = concentracaoPorMes(matriz, serieMes.map(l => l.mes)).filter(c => c.pct != null)

  // ── Time e plataformas ──
  const evolucao = evolucaoDoTime(porPessoa, serieMes.map(l => l.mes))
  const plataformas = juntarPlataformas(mix)

  // ── Textos das linhas de bloco no celular (os mesmos números dos cartões e dos gráficos) ──
  const DICA_LEADS = 'Leads do escritório inteiro (não só desta corretora) que entraram no período, e os ganhos pela data de fechamento.'
  const DICA_CONTAS = 'Clientes que migraram no período, pela data de migração, e quantos deles já tiveram algum lote.'
  const leadsComGanhos = leadsPeriodo ? `${fmtNum(ganhosPeriodo)} ganhos (${fmtPct((ganhosPeriodo / leadsPeriodo) * 100, 0)})` : undefined
  const contasJaOperaram = migraram ? `${fmtPct((operaram / migraram) * 100, 0)} já operaram` : undefined
  const ultimoMes = serieMes.at(-1)
  const ultimoFluxo = fluxo.at(-1)
  const totalPlataformas = plataformas.reduce((s, p) => s + p.valor, 0)
  const textoFluxo = `Começaram ou voltaram: operaram no mês e não no anterior. Pararam: operaram no anterior e não no mês.${mesCorrente ? ` ${mesCurto(mesRef)} entra quando fechar.` : ''}`
  const emAndamento = mesCorrente ? `${mesCurto(mesRef)} ainda está em andamento.` : null
  // a última barra de lotes por semana é a semana de hoje, ainda pela metade: no celular, onde o número
  // dela vem escrito no alto ("16/11: 71.646"), o aviso evita que ela pareça uma queda ou um dia só
  const ultimaSemana = lotesSemana.at(-1)
  const semanaEmAndamento = ultimaSemana && ultimaSemana.inicio === inicioSemana(hoje) ? `A semana de ${ultimaSemana.label} ainda está em andamento.` : null
  // "Quanto rende cada lote?" na linha que abre: o último mês fechado, que a frase e o cartão (o período
  // todo) não mostram
  const fechadosComLotes = serieMes.filter(l => (l.x?.lotes ?? 0) > 0 && !(mesCorrente && l.mes === mesRef))
  const ultimoFechado = fechadosComLotes.at(-1)
  const porLoteFechado = ultimoFechado ? `${mesCurto(ultimoFechado.mes)}: R$ ${n2(Math.round(((ultimoFechado.x?.receita ?? 0) / (ultimoFechado.x?.lotes ?? 1)) * 100) / 100)} por lote` : undefined

  return (
    <>
      <PageHeader eyebrow={ctx.eyebrow} title="Gráficos"
        actions={<SegParam param="periodo" valor={String(periodo)} opcoes={PERIODOS_GRAFICOS.map(p => ({ valor: String(p), label: `${p} meses` }))} />} />
      <PageBody>
        <Resumo
          frase={fraseDosGraficos({ periodo, leads: leadsPeriodo, ganhos: ganhosPeriodo, migraram, operaram, receita: rCurto(receita) === TRACO ? 'R$ 0' : rCurto(receita), porLote: lotes > 0 ? `R$ ${n2(Math.round((receita / lotes) * 100) / 100)}` : null })}
          apoio={`De ${mesCurto(inicio)} a ${mesCurto(mesRef)}${mesCorrente ? `, com ${mesCurto(mesRef)} ainda em andamento` : ''}. Os leads são do escritório inteiro; o resto é ${ctx.label === 'BTG' ? 'do' : 'da'} ${ctx.label}.`} />

        <KpiRow cols={4}>
          {/* no celular estes dois saem da faixa: os números já estão na frase e na linha dos blocos 1 e 2 */}
          <KpiCard className="max-md:hidden!" label="Leads recebidos" value={fmtNum(leadsPeriodo)} sub={leadsComGanhos} dica={DICA_LEADS} />
          <KpiCard className="max-md:hidden!" label="Contas migradas" value={fmtNum(migraram)} sub={contasJaOperaram} dica={DICA_CONTAS} />
          {/* celular: é a última linha à vista; sem o fio de baixo, que dobrava com o do bloco 1 */}
          <KpiCard className="max-md:border-b-0!" label="Lotes" value={fmtNum(lotes)} delta={comparacao(lotes, lotesAntes, fmtNum)} />
          <KpiCard destaque label="Receita" value={rCurto(receita)} valueClassName={receita >= 1_000_000 ? 'max-md:text-section' : undefined} delta={comparacao(receita, receitaAntes, rCurto)} sub={lotes > 0 ? `R$ ${n2(Math.round((receita / lotes) * 100) / 100)} por lote` : undefined}
            dica="Corretagem mais zeragem do período. O incentivo da corretora aparece à parte no gráfico de receita." />
        </KpiRow>

        <RecolheNoCelular titulo={nomeDoBloco(1, 'Captação')} dica={DICA_LEADS}
          resumo={leadsPeriodo ? `${fmtNum(leadsPeriodo)} leads recebidos · ${leadsComGanhos}` : 'Nenhum lead no período.'}>
          <section>
            <div className="max-md:hidden"><Secao numero={1} titulo="Captação" descricao="Os leads que chegam e os que viram cliente (escritório inteiro)." /></div>
            <div className="grid gap-8 xl:grid-cols-2">
              <Panel title="Quantos leads entram e quantos a gente ganha?" subtitle={leadsDia ? 'Por semana.' : 'Por mês.'}>
                {captacao.length
                  ? <GraficoSeries colorido dados={captacao} series={[{ key: 'recebidos', nome: 'Recebidos', tipo: 'bar' }, { key: 'ganhos', nome: 'Ganhos', tipo: 'bar', cor: 'success' }]} altura={240} />
                  : vazio}
              </Panel>
              <Panel title={comDica('Qual origem mais vira conta?', 'De cada 100 leads da origem, quantos abriram conta. Entre parênteses, os leads recebidos.')}
                subtitle={soNoComputador('De cada 100 leads da origem, quantos abriram conta. Entre parênteses, os leads recebidos.')}>
                {porOrigem.length ? <GraficoBarrasH colorido dados={porOrigem} formato="pct" larguraRotulo={170} /> : vazio}
              </Panel>
            </div>
          </section>
        </RecolheNoCelular>

        <RecolheNoCelular titulo={nomeDoBloco(2, 'Ativação')} dica={DICA_CONTAS}
          resumo={migraram ? `${fmtNum(migraram)} contas migradas · ${contasJaOperaram}` : 'Nenhuma conta migrou no período.'}>
        <section>
          <div className="max-md:hidden"><Secao numero={2} titulo="Ativação" descricao="A conta que entra, migra e começa a operar." /></div>
          <div className="grid gap-8 xl:grid-cols-2">
            <Panel title="Quantas contas entram e quantas migram?" subtitle="Por semana.">
              {contas.length ? <GraficoSeries colorido dados={contas} series={[{ key: 'entradas', nome: 'Entraram', tipo: 'bar' }, { key: 'migrados', nome: 'Migraram', tipo: 'bar', cor: 'success' }]} altura={240} /> : vazio}
            </Panel>
            <Panel title="De quem migrou em cada mês, quantos já operaram?" subtitle={migraram ? `${fmtPct((operaram / migraram) * 100, 0)} das ${fmtNum(migraram)} contas que migraram no período já operaram.` : undefined}>
              {safras.length
                ? <GraficoSeries colorido dados={safras.map(s => ({ label: mesCurto(s.mes), operaram: s.operaram, aindaNao: s.aindaNao }))}
                    series={[{ key: 'operaram', nome: 'Já operaram', tipo: 'bar', empilhar: 's', cor: 'success' }, { key: 'aindaNao', nome: 'Ainda não operaram', tipo: 'bar', empilhar: 's', cor: 'neutral' }]} altura={240} />
                : vazio}
            </Panel>
          </div>
        </section>
        </RecolheNoCelular>

        <section>
          <Secao numero={3} titulo="Lotes" descricao={soNoComputador('Quanto os clientes operam e quantos estão operando.')} />
          <div className="grid gap-8 xl:grid-cols-2">
            <Panel title="Quantos lotes por semana?">
              {/* só no celular, no corpo e não no subtítulo: no computador o cabeçalho fica como era */}
              {semanaEmAndamento && lotesSemana.length > 0 && <p className="-mt-2 mb-2 text-dense text-fg-muted md:hidden">{semanaEmAndamento}</p>}
              {lotesSemana.length ? <GraficoSeries colorido dados={lotesSemana} series={[{ key: 'lotes', nome: 'Lotes', tipo: 'bar' }]} altura={240} legenda={false} /> : vazio}
            </Panel>
            {/* gráfico secundário: linha discreta, para não parecer um bloco numerado a mais */}
            <RecolheNoCelular tamanho="linha" titulo="Quantos clientes operam em cada mês?"
              resumo={ultimoMes ? `${mesCurto(ultimoMes.mes)}: ${fmtNum(ultimoMes.x?.clientes_ativos ?? 0)} clientes com lotes${mesCorrente ? ' (ainda em andamento)' : ''}` : undefined}>
              <Panel title={soNoComputador('Quantos clientes operam em cada mês?')} subtitle={emAndamento ? soNoComputador(emAndamento) : undefined}>
                {serieMes.length ? <GraficoSeries colorido dados={serieMes.map(l => ({ label: mesCurto(l.mes), ativos: l.x?.clientes_ativos ?? 0 }))} series={[{ key: 'ativos', nome: 'Clientes com lotes', tipo: 'bar' }]} altura={240} legenda={false} /> : vazio}
              </Panel>
            </RecolheNoCelular>
          </div>
        </section>

        <section>
          <Secao numero={4} titulo="Receita" descricao={soNoComputador('Quanto entra e quanto cada lote rende.')} />
          <div className="grid gap-8 xl:grid-cols-2">
            {/* celular: a legenda já diz os tipos; no lugar fica o aviso do mês em andamento, para a última
                barra não parecer queda */}
            <Panel title="De onde vem a receita de cada mês?"
              subtitle={<>{soNoComputador('Corretagem, zeragem e, quando existe, o incentivo da corretora.')}{emAndamento && <span className="md:hidden">{emAndamento}</span>}</>}>
              {serieMes.length ? (
                <GraficoSeries colorido formato="brl" altura={240}
                  dados={serieMes.map(l => ({ label: mesCurto(l.mes), corretagem: l.x?.receita_corretagem ?? 0, zeragem: l.x?.receita_zeragem ?? 0, fixa: l.x?.receita_acoes ?? 0, incentivo: l.x?.incentivo ?? 0 }))}
                  series={[
                    { key: 'corretagem', nome: 'Corretagem', tipo: 'bar' as const, empilhar: 'r' },
                    { key: 'zeragem', nome: 'Zeragem', tipo: 'bar' as const, empilhar: 'r' },
                    ...(temFixa ? [{ key: 'fixa', nome: 'Receita fixa', tipo: 'bar' as const, empilhar: 'r' }] : []),
                    ...(temIncentivo ? [{ key: 'incentivo', nome: 'Incentivo', tipo: 'bar' as const, empilhar: 'r' }] : []),
                  ]} />
              ) : vazio}
            </Panel>
            <RecolheNoCelular tamanho="linha" titulo="Quanto rende cada lote?" dica="Receita do mês dividida pelos lotes do mês, em reais."
              resumo={porLoteFechado}>
              <Panel title={soNoComputador('Quanto rende cada lote?')} subtitle={soNoComputador('Receita do mês dividida pelos lotes do mês, em reais.')}>
                {serieMes.some(l => (l.x?.lotes ?? 0) > 0)
                  ? <GraficoSeries colorido formato="dec" altura={240} legenda={false}
                      dados={serieMes.filter(l => (l.x?.lotes ?? 0) > 0).map(l => ({ label: mesCurto(l.mes), porLote: Math.round(((l.x?.receita ?? 0) / (l.x?.lotes ?? 1)) * 1000) / 1000 }))}
                      series={[{ key: 'porLote', nome: 'R$ por lote', tipo: 'line' }]} />
                  : vazio}
              </Panel>
            </RecolheNoCelular>
          </div>
        </section>

        <RecolheNoCelular titulo={nomeDoBloco(5, 'Retenção')} dica="Quem começa, quem para e o quanto a operação depende de poucos clientes."
          resumo={ultimoFluxo ? `${mesCurto(ultimoFluxo.mes)}: ${fmtNum(ultimoFluxo.comecaram)} começaram ou voltaram, ${fmtNum(ultimoFluxo.pararam)} pararam` : undefined}>
        <section>
          <div className="max-md:hidden"><Secao numero={5} titulo="Retenção" descricao="Quem começa, quem para e o quanto a operação depende de poucos clientes." /></div>
          <div className="grid gap-8 xl:grid-cols-2">
            <Panel title={comDica('A carteira está crescendo ou encolhendo?', textoFluxo)} subtitle={soNoComputador(textoFluxo)}>
              {fluxo.length
                ? <GraficoSeries colorido dados={fluxo.map(f => ({ label: mesCurto(f.mes), comecaram: f.comecaram, pararam: f.pararam }))}
                    series={[{ key: 'comecaram', nome: 'Começaram ou voltaram', tipo: 'bar', cor: 'success' }, { key: 'pararam', nome: 'Pararam', tipo: 'bar', cor: 'danger' }]} altura={240} />
                : vazio}
            </Panel>
            <Panel title="Os lotes dependem de poucos clientes?" subtitle="Parte dos lotes de cada mês que veio dos 5 maiores clientes.">
              {concentracao.length
                ? <GraficoSeries colorido formato="pct" altura={240} legenda={false} dados={concentracao.map(c => ({ label: mesCurto(c.mes), top5: Math.round((c.pct ?? 0) * 10) / 10 }))} series={[{ key: 'top5', nome: '5 maiores clientes', tipo: 'line' }]} />
                : vazio}
            </Panel>
          </div>
        </section>
        </RecolheNoCelular>

        <RecolheNoCelular titulo={nomeDoBloco(6, 'Time e plataformas')} dica="Quem traz o resultado e por onde os clientes operam."
          resumo={plataformas[0] && totalPlataformas > 0 ? `${plataformas[0].nome}: ${fmtPct((plataformas[0].valor / totalPlataformas) * 100, 1)} dos lotes` : undefined}>
        <section>
          <div className="max-md:hidden"><Secao numero={6} titulo="Time e plataformas" descricao="Quem traz o resultado e por onde os clientes operam." /></div>
          <div className="grid gap-8 xl:grid-cols-2">
            <EvolucaoTime evolucao={evolucao} mesRef={mesRef} parcial={mesCorrente} titulo="Quem traz a receita e os lotes?" comNumeros={false}
              rodape={<p className="mt-2 text-dense"><Link href={`${base}/assessores`} className="link max-md:inline-flex max-md:min-h-11 max-md:items-center">Ver cada pessoa em Responsáveis</Link></p>} />
            <Panel title="Em que plataforma os clientes operam?" subtitle="Lotes do período por plataforma.">
              {plataformas.length ? <GraficoRosca colorido dados={plataformas} /> : vazio}
            </Panel>
          </div>
        </section>
        </RecolheNoCelular>
      </PageBody>
    </>
  )
}
