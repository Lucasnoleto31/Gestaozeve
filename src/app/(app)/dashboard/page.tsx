export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Fragment, Suspense, type CSSProperties, type ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { MeusPontos } from '@/components/gestao/MeusPontos'
import { getProfile } from '@/lib/auth/getProfile'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { DeltaText, KpiCard, KpiRow } from '@/components/ui/Kpi'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import { Recolhido } from '@/components/ui/Recolhido'
import { Empty } from '@/components/ui/Skeleton'
import { CORRETORA_LABEL, CORRETORA_SLUG, corretorasDoPerfil, temListaPropria, type Corretora } from '@/lib/corretoras'
import { funilMensal, funilResultadoPorCorretora, giroDiario, leadsResumo, painelKpis, painelMensal } from '@/lib/gestao/consultas'
import { economiaDoPainel } from '@/lib/gestao/economiaPainel'
import { mesReferencia } from '@/lib/gestao/pagina'
import { fraseDoFechamento, fraseDoMes, fraseDoRendimento, giroPorDia, linhaDaCorretora, rotuloCorretoras, totaisDoEscritorio, variacaoPct } from '@/lib/gestao/inicio'
import { variacaoMensal } from '@/lib/gestao/projecao'
import { mesCurto, mesLongo, somarMeses } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { MESES_LONGOS, fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TRACO, n0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { Resumo, semQuebra } from '@/components/gestao/Resumo'
import { ddmm, diaCurto, momentoDoUltimoDia } from '../[corretora]/lotes/comum'
import { hrefDistribuir } from '@/lib/gestao/oportunidades'

// Projeção: meses de histórico que entram no perfil intra-mês
const MESES_PROJECAO = 24
// Gráfico do giro por dia: dias corridos até o último lançamento
const DIAS_GRAFICO = 35

// ── Celular (DESIGN.md §8). Tudo o que está aqui vale só abaixo de 768 px: o computador não muda. ──
// Link em linha com área de toque de 44 px. A margem negativa devolve o espaço: o texto em volta não abre.
const TOQUE = 'max-md:inline-flex max-md:min-h-11 max-md:items-center max-md:-my-3 max-md:px-1.5 max-md:-mx-1.5'
// Os dois cartões da frente dividem as mesmas três linhas (nome, número, comparação): o nome de um quebra em
// duas linhas e o do outro não, e sem isso os dois números ficavam em alturas diferentes.
const CARTAO_DA_FRENTE = 'max-md:row-span-3 max-md:grid max-md:grid-rows-subgrid max-md:[&>.kpi-rotulo]:items-start'
// "Mais números": os cartões que saem da vista aparecem logo abaixo da linha que abre (o <details> é o `peer`
// deles), sem repetir o cartão. O `!` é preciso porque as regras de celular do globals.css ficam fora das camadas.
const MAIS_NUMEROS = 'max-md:order-2 max-md:hidden! max-md:peer-open:grid!'
// Mês em andamento contra mês inteiro: a porcentagem sem cor lia-se como queda de verdade. No celular ela
// sai e o apoio diz o número do mês anterior por extenso (no computador ele aparece ao parar o mouse).
const SEM_VARIACAO = 'max-md:[&_.kpi-delta]:hidden!'
const DA_CORRETORA: Record<Corretora, string> = { GENIAL: 'da Genial', XP: 'da XP', BTG: 'do BTG' }

// Apoio de um cartão: `pc` é o texto do computador; no celular entra `celular` no lugar dele (ou nada)
function Apoio({ pc, celular }: { pc: ReactNode; celular?: ReactNode }) {
  return <><span className="max-md:hidden">{pc}</span>{celular != null && <span className="md:hidden">{celular}</span>}</>
}

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
  // a frase de abertura e, abaixo dela, onde o mês deve fechar e, quando a receita não acompanha os lotes, o rendimento por lote
  const frase = fraseDoMes(t, mes), fechamento = fraseDoFechamento(t, mes), rendimento = fraseDoRendimento(t, mes)
  const apoio = [fechamento, rendimento].filter(Boolean).join(' ')
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
  // `noCartao` = no celular o assunto já está no cartão do número, com os mesmos links: não repete aqui
  type Atencao = { rotulo: string; itens: { texto: string; href: string }[]; noCartao?: boolean }
  const porCorretoraCom = (valor: (l: (typeof comDados)[number]) => number, href: (slug: string, corretora: string) => string, sufixo = '') =>
    comDados.filter(l => valor(l) > 0).map(l => ({ texto: `${CORRETORA_LABEL[l.corretora]} ${fmtNum(valor(l))}${sufixo}`, href: href(CORRETORA_SLUG[l.corretora], l.corretora) }))
  const emRisco = porCorretoraCom(l => l.emRisco, s => `/${s}/clientes?momento=risco`)
  const atencao: Atencao[] = [
    { rotulo: 'Leads em aberto que pedem contato', itens: comAlerta ? [{ texto: `${fmtNum(comAlerta)} de ${fmtNum(leads.abertos)} em aberto`, href: '/leads' }] : [] },
    { rotulo: 'Clientes em risco de parar', itens: emRisco, noCartao: true },
    { rotulo: 'Clientes que nunca operaram', itens: porCorretoraCom(l => l.nuncaGiraram, (_, corretora) => hrefDistribuir(corretora, 'ativar')) },
    { rotulo: 'Lançamentos sem cliente cadastrado', itens: admin ? porCorretoraCom(l => l.pendencias, s => `/${s}/importar#nao-cadastrados`, ' linhas') : [] },
  ].filter(a => a.itens.length > 0)

  // ── Só para o celular (DESIGN.md §8): os mesmos números, ditos de um jeito que cabe em 390 px ──
  const nomeDoMes = MESES_LONGOS[parseInt(mes.slice(5, 7), 10) - 1] ?? mesCurto(mes)
  // o cadastro guarda o nome em maiúsculas; na linha pequena de cima ele vai como nome próprio
  const saudacaoCurta = `${getSaudacao()}, ${firstName.charAt(0).toUpperCase()}${firstName.slice(1).toLowerCase()}`
  // mês em andamento contra o mês anterior inteiro, por extenso ("252 em out/26, o mês inteiro")
  const mesInteiro = (anterior: number | null | undefined) => (t.parcial && anterior ? `${fmtNum(anterior)} em ${mesCurto(mesAnt)}, o mês inteiro` : null)
  const ativosAntes = mesInteiro(t.ativosAnterior), leadsAntes = mesInteiro(funilAnterior?.recebidos)
  // a última barra do gráfico parece queda quando uma corretora ainda não lançou esse dia: o aviso diz qual
  const semUltimoDia = ultimaGeral ? comDados.filter(l => !l.ultimaData || l.ultimaData < ultimaGeral) : []
  const ultimoNaAtencao = atencao.map(a => !a.noCartao).lastIndexOf(true)

  return (
    <>
      <PageHeader eyebrow={`O escritório em ${mesLongo(mes)}`} title={saudacao} />
      {/* No celular os blocos são os mesmos em outra ordem (por CSS): a frase, os números, o que pede atenção,
          cada corretora e o gráfico. O que diz o que fazer deixa de ser a última coisa da tela. */}
      <PageBody className="max-md:flex max-md:flex-col max-md:gap-6 max-md:space-y-0">
        <div className="max-md:hidden">
          <Resumo frase={frase} apoio={apoio} nota={lancadoAte ? <>Lotes lançados: {lancadoAte}.</> : null} />
        </div>
        {/* Celular: a saudação e o mês numa linha pequena (a barra de cima já diz "Início"); embaixo da frase fica
            só a previsão, e a nota passa a dizer os lotes do último dia de cada corretora, que na tabela não cabem.
            O rendimento por lote desce para o bloco "Por corretora". Na nota vai só a data ("17/11"): em destaque,
            "ter 17/11" se lia como o verbo. O computador continua com o dia da semana. */}
        <div className="md:hidden">
          <p className="mb-1.5 text-label text-fg-muted">{saudacaoCurta} · o escritório em {nomeDoMes}</p>
          <Resumo frase={frase} apoio={fechamento} nota={comDados.some(l => l.ultimaData) ? <>
            Último dia lançado:
            {comDados.filter(l => l.ultimaData).map(l => (
              <span key={l.corretora} className="block text-fg-muted">
                {CORRETORA_LABEL[l.corretora]}, {ddmm(l.ultimaData!)}{momentoDe.get(l.corretora) ? ` (${momentoDe.get(l.corretora)})` : ''}:{' '}
                <span className="font-medium text-fg">{l.lotesDia ? `${fmtNum(l.lotesDia)} lotes` : 'sem giro neste mês'}</span>
              </span>
            ))}
          </> : null} />
        </div>

        {/* remuneração por níveis: os pontos de quem está logado, se estiver no modelo */}
        <Suspense fallback={null}><MeusPontos comLink /></Suspense>

        {/* Celular: Receita e Lotes ficam como cartão, só com a comparação; Clientes ativos e Em risco viram linha;
            Contas novas e Leads ficam atrás de "Mais números". O que sai do apoio (divisão por corretora,
            "fecha em", incentivo) está na frase de cima e na lista "Por corretora". */}
        <KpiRow cols={6}>
          <KpiCard destaque label="Receita do giro no mês" value={rCurto(t.receita)} className={CARTAO_DA_FRENTE}
            sub={<Apoio pc={[t.parcial ? `fecha em ${rCurto(t.receitaPrevista)}` : null, t.incentivo ? `+ incentivo ${rCurto(t.incentivo)}` : 'lotes × tarifa + zeragem'].filter(Boolean).join(' · ')} />}
            delta={{ atual: t.receitaComparavel, anterior: t.receitaMesmoPonto, rotulo: rotuloComparacao, fmt: rCurto }} />
          <KpiCard label="Lotes no mês" value={fmtNum(t.lotes)} className={CARTAO_DA_FRENTE}
            sub={<Apoio pc={[rotuloCorretoras(comDados, l => l.lotes, fmtNum), t.parcial ? `fecha em ${fmtNum(Math.round(t.lotesPrevisto))}` : null].filter(Boolean).join(' · ')} />}
            delta={{ atual: t.lotesComparavel, anterior: t.lotesMesmoPonto, rotulo: rotuloComparacao, fmt: fmtNum }} />
          <KpiCard label="Clientes ativos" value={fmtNum(t.ativos)} className={ativosAntes ? SEM_VARIACAO : undefined}
            sub={ativosAntes ? <Apoio pc={rotuloCorretoras(comDados, l => l.ativos, fmtNum)} celular={ativosAntes} /> : rotuloCorretoras(comDados, l => l.ativos, fmtNum)}
            delta={variacaoMensal(t.ativos, t.ativosAnterior, mesAnt, t.parcial, fmtNum)} />
          <Recolhido tamanho="linha" titulo="Mais números: contas novas e leads" className="peer col-span-full border-t border-line md:hidden max-md:order-1">{null}</Recolhido>
          <KpiCard label="Contas novas no mês" value={fmtNum(t.contasNovas)} className={MAIS_NUMEROS}
            sub={novosOperaram != null ? `${fmtNum(novosOperaram)} já operaram · ${fmtNum(reativados ?? 0)} ${reativados === 1 ? 'cliente voltou' : 'clientes voltaram'} a operar` : rotuloCorretoras(comDados, l => l.contasNovas, fmtNum)} />
          <KpiCard label="Leads no mês" value={fmtNum(funilDoMes?.recebidos ?? 0)} className={cn(MAIS_NUMEROS, 'max-md:border-b-0!', leadsAntes && SEM_VARIACAO)}
            sub={<>{`${fmtNum(funilDoMes?.ganhos ?? 0)} ganhos · ${fmtNum(leads.abertos)} em aberto`}{leadsAntes && <span className="block md:hidden">{leadsAntes}</span>}</>}
            delta={variacaoMensal(funilDoMes?.recebidos ?? 0, funilAnterior?.recebidos, mesAnt, t.parcial, fmtNum)} />
          {/* Celular: o caminho para a lista de quem está em risco fica junto do número (no computador ele está
              em "O que pede atenção" e na tabela) */}
          <KpiCard label="Em risco" value={fmtNum(t.emRisco)} tone={t.emRisco ? 'warn' : 'neutral'}
            sub={<Apoio pc={`${rotuloCorretoras(comDados, l => l.emRisco, fmtNum)} · giravam e pararam ou caíram`}
              celular={<>{emRisco.map(i => <Fragment key={i.href}><Link href={i.href} className={cn('link tabular-nums', TOQUE)}>{i.texto}</Link> · </Fragment>)}giravam e pararam ou caíram</>} />} />
        </KpiRow>

        <Panel className="max-md:order-2" title="Por corretora" subtitle={<>
          <span className="max-md:hidden">{t.parcial
            ? <>{mesLongo(mes)} lado a lado: a comparação é com {mesCurto(mesAnt)} no mesmo ponto do mês<span className="hidden xl:inline">, e “fecha em” é a previsão no ritmo atual</span>.</>
            : `${mesLongo(mes)} lado a lado, contra ${mesCurto(mesAnt)}.`}</span>
          <span className="md:hidden">Contra {mesCurto(mesAnt)}{t.parcial && ', no mesmo ponto do mês'}.</span>
        </>}>
          {/* No celular a tabela vira lista (DESIGN.md §8.6) e a linha abre o Painel da corretora: o nome, os lotes
              do mês com a variação, o incentivo ou o líquido e, à direita, a receita do giro com a variação.
              O que fica de fora: o último dia está na nota da frase e embaixo do gráfico; "Em risco", no cartão;
              "Fecha em" e "Ativos" de cada corretora, no Painel dela; a linha "Escritório" são os dois cartões. */}
          <div className="tbl-wrap">
            <table className="tbl tbl-lista lista-abre" style={{ '--lista-direita': '6.5rem' } as CSSProperties}>
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
                  // celular: o que no computador fica embaixo da receita (o incentivo da corretora ou, com cadeia de
                  // repasse, o que fica para o escritório) vai para a linha de apoio, por extenso
                  const alemDoGiro = l.liquido != null ? `líquido para o escritório ${rCurto(l.liquido)}` : l.incentivo > 0 ? `+ incentivo ${rCurto(l.incentivo)}` : null
                  if (l.semDados) {
                    return (
                      <tr key={l.corretora}>
                        <td className="cel-titulo"><CorretoraBadge corretora={l.corretora} size="md" /></td>
                        <td colSpan={t.parcial ? 9 : 8} className="muted">
                          Nenhum dado ainda.{admin && <> Comece pelos <Link href={`/${slug}/parametros`} className="link">Parâmetros</Link> e depois em <Link href={`/${slug}/importar`} className="link">Importar</Link>.</>}
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={l.corretora}>
                      <td className="cel-titulo"><Link href={`/${slug}/painel`} className="inline-flex" title={`Abrir o Painel da ${CORRETORA_LABEL[l.corretora]}`}><CorretoraBadge corretora={l.corretora} size="md" /></Link></td>
                      <td className="col-p2">
                        <Link href={`/${slug}/lotes`} className="link">{l.ultimaData ? diaCurto(l.ultimaData) : TRACO}</Link>{momento && <span className="text-fg-subtle"> · {momento}</span>}
                        <span className="block text-micro text-fg-subtle">{l.lotesDia ? `${fmtNum(l.lotesDia)} lotes no dia · média de ${fmtNum(Math.round(l.mediaDia))} por dia` : 'sem giro neste mês'}</span>
                      </td>
                      {/* no celular as colunas de variação somem: ela vai junto do número (os lotes na linha de
                          apoio, a receita à direita) */}
                      <td className="num cel-sub">
                        <span className="font-semibold max-md:text-fg">{n0(l.lotes)}</span>
                        <span className="md:hidden"> lotes{vLotes != null && <> <DeltaText pct={vLotes} /></>}</span>
                        {alemDoGiro && <span className="block md:hidden">{alemDoGiro}</span>}
                      </td>
                      <td className="num col-p2">{vLotes == null ? TRACO : <DeltaText pct={vLotes} />}</td>
                      <td className="num cel-valor" data-rotulo="receita do giro">
                        <span className="font-semibold max-md:font-bold">{rCurto(l.receita)}</span>
                        {vReceita != null && <span className="block text-micro md:hidden"><DeltaText pct={vReceita} /></span>}
                        {l.liquido != null ? <span className="block text-micro text-fg-subtle max-md:hidden">líquido <span className="hidden md:inline">para o escritório </span>{rCurto(l.liquido)}</span>
                          : l.incentivo > 0 && <span className="block text-micro text-fg-subtle max-md:hidden">+ incentivo {rCurto(l.incentivo)}</span>}
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
                <tfoot className="max-md:hidden!">
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
          {/* Celular: o porquê de a receita não acompanhar os lotes fica junto de quem explica, e não no topo */}
          {rendimento && <p className="mt-3 text-label text-fg-muted md:hidden">{semQuebra(rendimento)}</p>}
        </Panel>

        <div className="grid gap-8 xl:grid-cols-3 max-md:contents">
          <Panel className="xl:col-span-2 max-md:order-3" title="Giro por dia"
            subtitle={<>
              <span className="max-md:hidden">{`Lotes de cada dia nos últimos ${DIAS_GRAFICO} dias${comDados.length > 1 ? ', uma cor por corretora' : ''}.`}</span>
              <span className="md:hidden">{`Lotes de cada dia nos últimos ${DIAS_GRAFICO} dias.`}</span>
            </>}>
            {grafico.length ? (
              <GraficoSeries dados={grafico} formato="num" altura={260}
                series={comDados.map(l => ({ key: l.corretora, nome: CORRETORA_LABEL[l.corretora], tipo: 'bar' as const, empilhar: 'lotes' }))} />
            ) : <Empty>Sem lotes lançados no período.</Empty>}
            {/* Celular: o resto da coluna "Último dia lançado" da tabela (a média por dia e o caminho para o Giro
                diário de cada corretora) e o aviso de que a última barra ainda não está completa */}
            {grafico.length > 0 && (
              <div className="mt-2 text-label text-fg-muted md:hidden">
                {semUltimoDia.length > 0 && <p>A barra de {ddmm(ultimaGeral!)} ainda não tem os lotes {semUltimoDia.map(l => DA_CORRETORA[l.corretora]).join(' e ')}.</p>}
                <ul className="mt-1 divide-y divide-line">
                  {comDados.map(l => (
                    <li key={l.corretora} className="py-2.5">
                      <Link href={`/${CORRETORA_SLUG[l.corretora]}/lotes`} className={cn('link text-dense', TOQUE)}>Giro diário {DA_CORRETORA[l.corretora]}</Link>
                      {l.mediaDia > 0 && <span className="block tabular-nums">média de {fmtNum(Math.round(l.mediaDia))} lotes por dia em {nomeDoMes}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <Panel className={cn('max-md:order-1', atencao.length > 0 && ultimoNaAtencao < 0 && 'max-md:hidden')} title="O que pede atenção"
            action={<Link href="/fila" className={cn('link inline-flex items-center gap-1 text-label', TOQUE)}>Minha fila <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>}>
            {atencao.length === 0 ? <p className="text-dense text-fg-muted">Nada pendente agora.</p> : (
              <ul className="divide-y divide-line text-dense">
                {/* Celular: o assunto em cima e os links embaixo, sempre igual (antes dependia de caber na linha) */}
                {atencao.map((a, n) => (
                  <li key={a.rotulo} className={cn('flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3 max-md:flex-col max-md:flex-nowrap max-md:items-start',
                    a.noCartao && 'max-md:hidden', n === ultimoNaAtencao && 'max-md:border-b-0')}>
                    <span>{a.rotulo}</span>
                    <span className="flex flex-wrap justify-end gap-x-3 gap-y-1 max-md:justify-start max-md:gap-x-6">
                      {a.itens.map(i => <Link key={i.href} href={i.href} className={cn('link tabular-nums', TOQUE)}>{i.texto}</Link>)}
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
