export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getProfile } from '@/lib/auth/getProfile'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { DeltaText, KpiCard, KpiRow } from '@/components/ui/Kpi'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import { Empty } from '@/components/ui/Skeleton'
import { CORRETORA_LABEL, CORRETORA_SLUG, corretorasDoPerfil, temListaPropria, type Corretora } from '@/lib/corretoras'
import { funilMensal, funilResultadoPorCorretora, giroDiario, leadsResumo, painelKpis, painelMensal } from '@/lib/gestao/consultas'
import { economiaDoPainel } from '@/lib/gestao/economiaPainel'
import { mesReferencia } from '@/lib/gestao/pagina'
import { fraseDoFechamento, fraseDoMes, fraseDoRendimento, giroPorDia, linhaDaCorretora, rotuloCorretoras, totaisDoEscritorio, variacaoPct } from '@/lib/gestao/inicio'
import { variacaoMensal } from '@/lib/gestao/projecao'
import { mesCurto, mesLongo, somarMeses } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TRACO, n0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { diaCurto, momentoDoUltimoDia } from '../[corretora]/lotes/comum'

// Projeção: meses de histórico que entram no perfil intra-mês
const MESES_PROJECAO = 24
// Gráfico do giro por dia: dias corridos até o último lançamento
const DIAS_GRAFICO = 35

// Espaço que não quebra entre o número e a unidade ("27 %", "R$ 142 mil"), para a frase não partir no meio
const semQuebra = (s: string) => s.replace(/(\d) (%|mil\b|milh)/g, '$1 $2').replace(/R\$ /g, 'R$ ')

function getSaudacao() {
  const h = (new Date().getUTCHours() - 3 + 24) % 24
  if (h >= 18) return 'Boa noite'
  if (h >= 12) return 'Boa tarde'
  return 'Bom dia'
}

// Tudo de uma corretora no mês do Início. Na que tem cadeia de repasse (BTG) vem também a comissão
// líquida do escritório, pela mesma conta do Painel (a série mensal sai dela, sem uma consulta a mais).
async function dadosDaCorretora(c: Corretora, mes: string, hoje: string) {
  const [kpis, giro, eco] = await Promise.all([
    painelKpis(c, mes),
    giroDiario(c, somarMeses(mes, -MESES_PROJECAO), hoje),
    temListaPropria(c) ? economiaDoPainel(c, mes) : Promise.resolve(null),
  ])
  const [mensal, momento] = await Promise.all([
    eco ? Promise.resolve(eco.mensal) : painelMensal(c, mes, 2),
    momentoDoUltimoDia(c, kpis?.ultima_data ?? null),
  ])
  const liquido = eco?.comRepasse ? eco.liquidoCom(mes, eco.repasseDaReceita(eco.mensalPorMes.get(mes)?.receita ?? 0, mes).liquido) : null
  return { linha: linhaDaCorretora({ corretora: c, mes, hoje, kpis, giro, mensal, liquido, maxMeses: MESES_PROJECAO }), giro, momento }
}

// Início: como está indo o escritório. A resposta primeiro (uma frase e seis números do mês, somando as
// corretoras), depois cada corretora no mesmo quadro, o giro dia a dia e o que pede atenção.
export default async function DashboardPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role === 'atendente') redirect('/fila')   // atendente começa pela fila do dia (e tem a tela de Leads)
  const equipe = profile.role === 'admin' || profile.role === 'vendedor'
  const admin = profile.role === 'admin'
  const firstName = profile.nome.split(' ')[0]
  const visiveis = corretorasDoPerfil(profile)
  const saudacao = `${getSaudacao()}, ${firstName}`

  if (!equipe || visiveis.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Visão geral" title={saudacao} />
        <PageBody><Empty>Seu perfil não tem acesso ao controle de lotes. Fale com o administrador.</Empty></PageBody>
      </>
    )
  }

  const hoje = fmtDate(hojeBrasil())
  // O mês do Início é o mais recente com lotes entre as corretoras (no começo do mês, antes da primeira
  // planilha, ainda é o mês anterior); todas as corretoras são lidas nesse mesmo mês
  const refs = await Promise.all(visiveis.map(c => mesReferencia(c)))
  const mes = refs.reduce((m, x) => (x > m ? x : m), refs[0])
  const mesAnt = somarMeses(mes, -1)
  const [porCorretora, leads, funil, resultado] = await Promise.all([
    Promise.all(visiveis.map(c => dadosDaCorretora(c, mes, hoje))),
    leadsResumo(0),
    funilMensal(mes, 2),
    funilResultadoPorCorretora(mes, visiveis),
  ])

  const linhas = porCorretora.map(x => x.linha)
  const comDados = linhas.filter(l => !l.semDados)
  const momentoDe = new Map(porCorretora.map(x => [x.linha.corretora, x.momento]))
  const t = totaisDoEscritorio(comDados)
  const vs = `vs ${mesCurto(mesAnt)}`
  const rotuloComparacao = t.parcial ? `vs mesmo ponto de ${mesCurto(mesAnt)}` : vs
  // abaixo da frase de abertura: onde o mês deve fechar e, quando a receita não acompanha os lotes, o rendimento por lote
  const apoio = [fraseDoFechamento(t, mes), fraseDoRendimento(t, mes)].filter(Boolean).join(' ')
  const vLotesT = variacaoPct(t.lotesComparavel, t.lotesMesmoPonto), vReceitaT = variacaoPct(t.receitaComparavel, t.receitaMesmoPonto)
  // contas novas do mês: quantas já operaram e quantos clientes voltaram a operar (resultado do mês, por corretora)
  const novosOperaram = resultado?.reduce((s, x) => s + x.r.novos_operaram, 0) ?? null
  const reativados = resultado?.reduce((s, x) => s + x.r.reativados, 0) ?? null
  const funilDoMes = funil.find(f => f.mes_ref === mes), funilAnterior = funil.find(f => f.mes_ref === mesAnt)
  const comAlerta = leads.com_alerta

  // o giro por dia das corretoras, empilhado, até o último dia lançado
  const ultimaGeral = comDados.reduce<string | null>((m, l) => (l.ultimaData && (!m || l.ultimaData > m) ? l.ultimaData : m), null)
  const grafico = ultimaGeral ? giroPorDia(porCorretora.filter(x => !x.linha.semDados).map(x => ({ corretora: x.linha.corretora, dias: x.giro })), ultimaGeral, DIAS_GRAFICO) : []
  const lancadoAte = comDados.filter(l => l.ultimaData).map(l => `${CORRETORA_LABEL[l.corretora]} até ${diaCurto(l.ultimaData!)}${momentoDe.get(l.corretora) ? ` (${momentoDe.get(l.corretora)})` : ''}`).join(' · ')

  // o que pede atenção: uma linha por assunto, com cada corretora levando direto à lista
  type Atencao = { rotulo: string; itens: { texto: string; href: string }[] }
  const porCorretoraCom = (valor: (l: (typeof comDados)[number]) => number, href: (slug: string) => string, sufixo = '') =>
    comDados.filter(l => valor(l) > 0).map(l => ({ texto: `${CORRETORA_LABEL[l.corretora]} ${fmtNum(valor(l))}${sufixo}`, href: href(CORRETORA_SLUG[l.corretora]) }))
  const atencao: Atencao[] = [
    { rotulo: 'Leads em aberto que pedem contato', itens: comAlerta ? [{ texto: `${fmtNum(comAlerta)} de ${fmtNum(leads.abertos)} em aberto`, href: '/leads' }] : [] },
    { rotulo: 'Clientes em risco de parar', itens: porCorretoraCom(l => l.emRisco, s => `/${s}/clientes?momento=risco`) },
    { rotulo: 'Clientes que nunca operaram', itens: porCorretoraCom(l => l.nuncaGiraram, s => `/${s}/oportunidades`) },
    { rotulo: 'Lançamentos sem cliente cadastrado', itens: admin ? porCorretoraCom(l => l.pendencias, s => `/${s}/importar#nao-cadastrados`, ' linhas') : [] },
  ].filter(a => a.itens.length > 0)

  return (
    <>
      <PageHeader eyebrow={`O escritório em ${mesLongo(mes)}`} title={saudacao} />
      <PageBody>
        <div className="max-w-5xl">
          <p className="text-balance text-section font-medium text-fg">{semQuebra(fraseDoMes(t, mes))}</p>
          {apoio && <p className="mt-1.5 text-dense text-fg-muted">{semQuebra(apoio)}</p>}
          {lancadoAte && <p className="mt-1 text-label text-fg-subtle">Lotes lançados: {lancadoAte}.</p>}
        </div>

        <KpiRow cols={6}>
          <KpiCard destaque label="Receita do giro no mês" value={rCurto(t.receita)}
            sub={[t.parcial ? `fecha em ${rCurto(t.receitaPrevista)}` : null, t.incentivo ? `+ incentivo ${rCurto(t.incentivo)}` : 'lotes × tarifa + zeragem'].filter(Boolean).join(' · ')}
            delta={{ atual: t.receitaComparavel, anterior: t.receitaMesmoPonto, rotulo: rotuloComparacao, fmt: rCurto }} />
          <KpiCard label="Lotes no mês" value={fmtNum(t.lotes)}
            sub={[rotuloCorretoras(comDados, l => l.lotes, fmtNum), t.parcial ? `fecha em ${fmtNum(Math.round(t.lotesPrevisto))}` : null].filter(Boolean).join(' · ')}
            delta={{ atual: t.lotesComparavel, anterior: t.lotesMesmoPonto, rotulo: rotuloComparacao, fmt: fmtNum }} />
          <KpiCard label="Clientes ativos" value={fmtNum(t.ativos)} sub={rotuloCorretoras(comDados, l => l.ativos, fmtNum)}
            delta={variacaoMensal(t.ativos, t.ativosAnterior, mesAnt, t.parcial, fmtNum)} />
          <KpiCard label="Contas novas no mês" value={fmtNum(t.contasNovas)}
            sub={novosOperaram != null ? `${fmtNum(novosOperaram)} já operaram · ${fmtNum(reativados ?? 0)} ${reativados === 1 ? 'cliente voltou' : 'clientes voltaram'} a operar` : rotuloCorretoras(comDados, l => l.contasNovas, fmtNum)} />
          <KpiCard label="Leads no mês" value={fmtNum(funilDoMes?.recebidos ?? 0)} sub={`${fmtNum(funilDoMes?.ganhos ?? 0)} ganhos · ${fmtNum(leads.abertos)} em aberto`}
            delta={variacaoMensal(funilDoMes?.recebidos ?? 0, funilAnterior?.recebidos, mesAnt, t.parcial, fmtNum)} />
          <KpiCard label="Em risco" value={fmtNum(t.emRisco)} tone={t.emRisco ? 'warn' : 'neutral'} sub={`${rotuloCorretoras(comDados, l => l.emRisco, fmtNum)} · giravam e pararam ou caíram`} />
        </KpiRow>

        <Panel title="Por corretora" subtitle={t.parcial
          ? <>{mesLongo(mes)} lado a lado: a comparação é com {mesCurto(mesAnt)} no mesmo ponto do mês<span className="hidden xl:inline">, e “fecha em” é a previsão no ritmo atual</span>.</>
          : `${mesLongo(mes)} lado a lado, contra ${mesCurto(mesAnt)}.`}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Corretora</th><th className="col-p2">Último dia lançado</th>
                  <th className="num">Lotes no mês</th><th className="num col-p2">{vs}</th>
                  <th className="num">Receita do giro</th><th className="num col-p2">{vs}</th>
                  {t.parcial && <th className="num col-p3">Fecha em</th>}
                  <th className="num col-p2">Ativos</th><th className="num col-p3">Em risco</th><th className="col-p3"><span className="sr-only">Abrir</span></th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => {
                  const slug = CORRETORA_SLUG[l.corretora]
                  const momento = momentoDe.get(l.corretora)
                  const vLotes = variacaoPct(l.lotesComparavel, l.lotesMesmoPonto), vReceita = variacaoPct(l.receitaComparavel, l.receitaMesmoPonto)
                  if (l.semDados) {
                    return (
                      <tr key={l.corretora}>
                        <td><CorretoraBadge corretora={l.corretora} size="md" /></td>
                        <td colSpan={t.parcial ? 9 : 8} className="muted">
                          Nenhum dado ainda.{admin && <> Comece pelos <Link href={`/${slug}/parametros`} className="link">Parâmetros</Link> e depois em <Link href={`/${slug}/importar`} className="link">Importar</Link>.</>}
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={l.corretora}>
                      <td><Link href={`/${slug}/painel`} className="inline-flex" title={`Abrir o Painel da ${CORRETORA_LABEL[l.corretora]}`}><CorretoraBadge corretora={l.corretora} size="md" /></Link></td>
                      <td className="col-p2">
                        <Link href={`/${slug}/lotes`} className="link">{l.ultimaData ? diaCurto(l.ultimaData) : TRACO}</Link>{momento && <span className="text-fg-subtle"> · {momento}</span>}
                        <span className="block text-micro text-fg-subtle">{l.lotesDia ? `${fmtNum(l.lotesDia)} lotes no dia · média de ${fmtNum(Math.round(l.mediaDia))} por dia` : 'sem giro neste mês'}</span>
                      </td>
                      {/* no celular as colunas de variação somem: ela desce para baixo do número */}
                      <td className="num">
                        <span className="font-semibold">{n0(l.lotes)}</span>
                        {vLotes != null && <span className="block text-micro md:hidden"><DeltaText pct={vLotes} /></span>}
                      </td>
                      <td className="num col-p2">{vLotes == null ? TRACO : <DeltaText pct={vLotes} />}</td>
                      <td className="num">
                        <span className="font-semibold">{rCurto(l.receita)}</span>
                        {vReceita != null && <span className="block text-micro md:hidden"><DeltaText pct={vReceita} /></span>}
                        {l.liquido != null ? <span className="block text-micro text-fg-subtle">líquido <span className="hidden md:inline">para o escritório </span>{rCurto(l.liquido)}</span>
                          : l.incentivo > 0 && <span className="block text-micro text-fg-subtle">+ incentivo {rCurto(l.incentivo)}</span>}
                      </td>
                      <td className="num col-p2">{vReceita == null ? TRACO : <DeltaText pct={vReceita} />}</td>
                      {t.parcial && (
                        <td className="num col-p3">
                          {l.parcial ? <>{rCurto(l.receitaPrevista)}<span className="block text-micro text-fg-subtle">{fmtNum(Math.round(l.lotesPrevisto))} lotes</span></> : TRACO}
                        </td>
                      )}
                      <td className="num col-p2">{n0(l.ativos)}</td>
                      <td className="num col-p3">{l.emRisco ? <Link href={`/${slug}/clientes?momento=risco`} className="link text-warn">{fmtNum(l.emRisco)}</Link> : TRACO}</td>
                      <td className="col-p3 text-right"><Link href={`/${slug}/painel`} className="link inline-flex items-center gap-1 text-label">Painel <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link></td>
                    </tr>
                  )
                })}
              </tbody>
              {comDados.length > 1 && (
                <tfoot>
                  <tr className="total">
                    <td>Escritório</td><td className="col-p2" />
                    <td className="num">{n0(t.lotes)}{vLotesT != null && <span className="block text-micro md:hidden"><DeltaText pct={vLotesT} /></span>}</td>
                    <td className="num col-p2">{vLotesT == null ? TRACO : <DeltaText pct={vLotesT} />}</td>
                    <td className="num">{rCurto(t.receita)}{vReceitaT != null && <span className="block text-micro md:hidden"><DeltaText pct={vReceitaT} /></span>}</td>
                    <td className="num col-p2">{vReceitaT == null ? TRACO : <DeltaText pct={vReceitaT} />}</td>
                    {t.parcial && <td className="num col-p3">{rCurto(t.receitaPrevista)}<span className="block text-micro font-normal text-fg-subtle">{fmtNum(Math.round(t.lotesPrevisto))} lotes</span></td>}
                    <td className="num col-p2">{n0(t.ativos)}</td>
                    <td className="num col-p3">{n0(t.emRisco)}</td>
                    <td className="col-p3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Panel>

        <div className="grid gap-8 xl:grid-cols-3">
          <Panel className="xl:col-span-2" title="Giro por dia" subtitle={`Lotes de cada dia nos últimos ${DIAS_GRAFICO} dias${comDados.length > 1 ? ', uma cor por corretora' : ''}.`}>
            {grafico.length ? (
              <GraficoSeries dados={grafico} formato="num" altura={260}
                series={comDados.map(l => ({ key: l.corretora, nome: CORRETORA_LABEL[l.corretora], tipo: 'bar' as const, empilhar: 'lotes' }))} />
            ) : <Empty>Sem lotes lançados no período.</Empty>}
          </Panel>

          <Panel title="O que pede atenção" action={<Link href="/fila" className="link inline-flex items-center gap-1 text-label">Minha fila <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>}>
            {atencao.length === 0 ? <p className="text-dense text-fg-muted">Nada pendente agora.</p> : (
              <ul className="divide-y divide-line text-dense">
                {atencao.map(a => (
                  <li key={a.rotulo} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3">
                    <span>{a.rotulo}</span>
                    <span className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                      {a.itens.map(i => <Link key={i.href} href={i.href} className={cn('link tabular-nums')}>{i.texto}</Link>)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </PageBody>
    </>
  )
}
