// Painel › Resumo: como está o mês. Seis números, a conta do mês (do que a corretora paga ao que fica para
// o escritório) em poucas linhas, o que pede atenção e, no mês em andamento, onde ele deve fechar.
// No celular (DESIGN.md §8) a aba abre pela frase com a conclusão, os cartões levam uma comparação só, a
// previsão sobe para logo depois dos números e vira lista, e a linha inteira de cada pendência abre a lista.
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { Contexto } from '@/lib/gestao/pagina'
import { comissaoMensal, giroDiario, incentivoMes, lotesNaoCadastrados, painelResumo, ultimaData } from '@/lib/gestao/consultas'
import { projetarIncentivo, projetarMes, variacaoDe, variacaoMensal } from '@/lib/gestao/projecao'
import { contaComRepasse, contaDaReceita } from '@/lib/gestao/contaDoMes'
import { limitesDoMes, mesAtual as mesDeHoje, mesCurto, mesLongo, somarMeses } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DeltaText, KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Recolhido } from '@/components/ui/Recolhido'
import { RecolheNoCelular } from '@/components/ui/RecolheNoCelular'
import { Resumo } from '@/components/gestao/Resumo'
import { MOMENTO_RESUMO } from '@/lib/gestao/momentoCliente'
import { TRACO, dataCurta, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { ContaDoMes } from '@/components/gestao/ContaDoMes'
import { economiaDoPainel } from '@/lib/gestao/economiaPainel'
import { custosDoPainel, haCustosFixos, parametroCustosFixos } from '@/lib/gestao/consultasCustos'
import { getProfile } from '@/lib/auth/getProfile'
import { normTexto } from '@/lib/texto'
import { fraseDosCustos, resultadoDepoisDosCustos } from '@/lib/gestao/custos'
import { frasesDoResumo } from './frases'
import { ChaveCustos, custosNaQuery, semCustosNaUrl } from './ChaveCustos'
import { LINHA_INTEIRA, TOQUE, apoio, soNoComputador } from './celular'

// Projeção: meses de histórico que entram no perfil intra-mês
const MESES_PROJECAO = 24

// Valor que pode ser negativo (resultado depois dos custos): "− R$ 500", como na conta do mês
const rSinal = (v: number) => (Math.round(v) === 0 ? 'R$ 0' : v < 0 ? `− ${rCurto(-v)}` : rCurto(v))
// 'Aikon', 'Aikon e Milena', 'A, B e C'
const eLista = (nomes: string[]) => (nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0] ?? '')

// Uma linha da previsão de fechamento: a mesma na tabela (computador) e na lista (celular)
// perda: as colunas que saem negativas (só na linha do giro depois dos custos), na cor de perda
type LinhaPrevista = { label: string; nota?: string; total?: boolean; realizado: string; projetado: string; faixa: string; linear: string; anterior: string; pct: number | null; perda?: { realizado: boolean; projetado: boolean; anterior: boolean } }

export async function AbaResumo({ ctx }: { ctx: Contexto }) {
  const { corretora, mesRef, base } = ctx
  const lim = limitesDoMes(mesRef)
  const hoje = fmtDate(hojeBrasil())
  const mesCorrente = mesRef === mesDeHoje()
  // Tudo em paralelo. O giro por dia (até 24 meses) alimenta a projeção e a comparação com o mês anterior;
  // os pontos por cliente só servem à projeção do incentivo no mês corrente
  // Custos fixos do escritório (só onde há cadeia de repasse, hoje o BTG): do mês e do anterior, para a conta e
  // para a previsão. A chave custos_fixos é lida sozinha (uma linha) e começa junto com a economia; a
  // remuneração da equipe só é lida quando alguma pessoa está em vigor, e corre ao lado do resto.
  const mesesCustos = [mesRef, somarMeses(mesRef, -1)]
  // "Sem custos" (a chave da aba, ?custos=sem): os custos não são lidos e a aba sai como era antes deles
  const semCustos = semCustosNaUrl(ctx.q)
  const paramCustosP = parametroCustosFixos(corretora)
  const custosP = paramCustosP.then(p => (!semCustos && haCustosFixos(p, mesesCustos) ? custosDoPainel(p, mesesCustos) : null))
  const [eco, painel, naoCad, comissoes, giro, ultima, incentivo, custosMap, profile, paramCustos] = await Promise.all([
    economiaDoPainel(corretora, mesRef),
    painelResumo(corretora, mesRef),
    lotesNaoCadastrados(corretora),
    comissaoMensal(mesRef, 1, null, corretora),
    giroDiario(corretora, somarMeses(mesRef, -MESES_PROJECAO), lim.fim),
    ultimaData(corretora),
    mesCorrente ? incentivoMes(corretora, mesRef) : Promise.resolve([]),
    custosP,
    getProfile(),
    paramCustosP,
  ])
  const { cfg, atp, comRepasse, mensal, par } = eco
  // a chave "Com custos | Sem custos" só aparece quando o mês tem custo lançado (com ou sem a chave ligada)
  const temChave = comRepasse && haCustosFixos(paramCustos, [mesRef])
  const chaveCustos = (className: string) => (temChave ? <ChaveCustos caminho={`${base}/painel`} query={ctx.q} className={className} /> : null)
  // o valor de cada pessoa da equipe só para o admin (em Comissões, só o admin e a própria pessoa veem)
  const verEquipe = profile?.role === 'admin'
  // sem custo em vigor no mês, nada abaixo muda: custosMes fica null e a tela é a de sempre
  const custosMes = comRepasse && custosMap?.get(mesRef)?.temCusto ? custosMap.get(mesRef)! : null
  const custosAnt = comRepasse && custosMap?.get(mesesCustos[1])?.temCusto ? custosMap.get(mesesCustos[1])! : null

  // Fechamento previsto do mês corrente (perfil intra-mês de todo o histórico) e variações
  const proj = projetarMes(giro, mesRef, ultima, hoje, { maxMeses: MESES_PROJECAO })
  const mesAtual = mensal.find(m => m.mes_ref === mesRef)
  const mesAnt = mensal.find(m => m.mes_ref === proj.mesAnterior)
  const incentivoProj = !atp && proj.parcial ? projetarIncentivo(incentivo, proj.fator.lotes, par.faixas) : null
  const repasseMes = eco.repasseDaReceita(mesAtual?.receita ?? 0, mesRef)
  const repasseAnt = mesAnt ? eco.repasseDe(mesAnt) : null
  const liquidoMes = eco.liquidoCom(mesRef, repasseMes.liquido)   // giro + fora do giro + Banking: o que fica para o escritório
  const liquidoAnt = repasseAnt ? eco.liquidoCom(proj.mesAnterior, repasseAnt.liquido) : null
  const extrasMes = eco.extrasDe(mesRef)
  const rotuloExtras = [eco.foraDe(mesRef) ? 'fora do giro' : null, eco.bankingDe(mesRef) ? 'Banking' : null].filter(Boolean).join(' e ')
  // nos meses com custo, a parte de cada sócio sai do resultado depois dos custos (a mesma conta de contaComRepasse)
  const resultadoMes = resultadoDepoisDosCustos(liquidoMes, custosMes)
  const partes = cfg.participacoes.map(p => ({ nome: p.nome, valor: (resultadoMes * p.pct) / 100 }))
  // A receita da tabela mensal (todos os lançamentos, inclusive contas ainda não vinculadas) é a base do
  // dinheiro do mês; a projeção dela escala pela mesma proporção prevista para o giro dos clientes cadastrados
  const escalaR = (v: number) => (proj.receita.realizado > 0 ? ((mesAtual?.receita ?? 0) * v) / proj.receita.realizado : v)
  const receitaProj = { projetado: escalaR(proj.receita.projetado), baixo: escalaR(proj.receita.baixo), alto: escalaR(proj.receita.alto), linear: escalaR(proj.receita.linear) }
  // na projeção, os clientes de parceiros crescem na mesma proporção da receita do mês
  const parceirosProj = (v: number): Record<string, number> => {
    const atual = mesAtual?.receita ?? 0, rp = eco.receitaParceiros(mesRef)
    return atual > 0 ? Object.fromEntries(Object.entries(rp).map(([k, x]) => [k, (x * v) / atual])) : rp
  }
  const liquidoPrevisto = (receita: number) => eco.repasseDaReceita(receita, mesRef, parceirosProj(receita)).liquido
  const repasseProj = comRepasse && proj.parcial ? eco.repasseDaReceita(receitaProj.projetado, mesRef, parceirosProj(receitaProj.projetado)) : null

  const r = painel.resumo
  const totalRisco = r.em_risco
  const taxaMigracao = r.levados ? (r.migrados / r.levados) * 100 : 0
  const pctAtivosMigrados = r.migrados ? (r.ativos / r.migrados) * 100 : 0
  const pctAtivosLevados = r.levados ? (r.ativos / r.levados) * 100 : 0
  const naoCadLinhas = naoCad.reduce((s, l) => s + l.linhas, 0)
  const naoCadLotes = naoCad.reduce((s, l) => s + l.lotes, 0)
  // comissão de parceiros por conta (abertura e ativação) no mês: paga à parte, entra na conta como lembrete.
  // Quem da equipe já está descontado nos custos do mês (só quem tem valor) sai daqui; sem custo, nada muda
  const equipeDescontada = new Set((custosMes?.itens ?? []).filter(i => i.tipo !== 'valor' && i.valor != null).map(i => normTexto(i.nome)))
  const comissaoParceiros = comissoes.filter(c => c.mes_ref === mesRef && !equipeDescontada.has(normTexto(c.parceiro))).reduce((s, c) => s + c.valor_abertura + c.valor_ativacao, 0)
  const receitaComIncentivo = mesAtual ? eco.receitaTotal(mesAtual) : 0
  const receitaComIncentivoAnt = mesAnt ? eco.receitaTotal(mesAnt) : undefined

  const conta = comRepasse
    ? contaComRepasse({
      corretora: ctx.label, repasse: repasseMes, pctDoFechamento: eco.pctDoFechamento(mesRef), deltaPct: cfg.deltaPct, impostoPct: cfg.impostoPct,
      fora: eco.foraDe(mesRef), banking: eco.bankingDe(mesRef), participacoes: cfg.participacoes, comissaoParceiros, custos: custosMes, verEquipe,
    })
    : contaDaReceita({
      corretora: ctx.label, corretagem: mesAtual?.receita_corretagem ?? 0, zeragem: mesAtual?.receita_zeragem ?? 0, fixa: mesAtual?.receita_acoes ?? 0, receita: mesAtual?.receita ?? 0,
      incentivo: atp ? null : mesAtual?.incentivo ?? 0, clientesComFaixa: mesAtual?.clientes_com_faixa ?? 0, comissaoParceiros,
    })
  // as planilhas do que fica fora dos lotes chegam depois do mês: sem elas, a conta avisa que ainda falta
  const faltamExtras = comRepasse && (eco.temFora || eco.temBanking) && !eco.foraDe(mesRef) && !eco.bankingDe(mesRef)
  // A resposta sobre os custos em uma frase (null sem custo) e quem da equipe ficou sem valor em Comissões
  const dadosFrase = { mes: mesRef, parcial: proj.parcial, liquido: liquidoMes, custos: custosMes, previsto: repasseProj?.liquido ?? null }
  const fraseCustos = fraseDosCustos(dadosFrase)
  const fraseCustosCurta = fraseDosCustos({ ...dadosFrase, curta: true })   // a do celular, depois do apoio da frase de abertura
  const semValorEquipe = custosMes?.equipeIncompleta ? custosMes.itens.filter(i => i.tipo !== 'valor' && i.valor == null).map(i => i.nome) : []
  // no mês em andamento os custos mensais entram inteiros, mas a equipe é o que está em Comissões até hoje
  const notaCustosParcial = !custosMes ? null
    : custosMes.itens.some(i => i.tipo !== 'valor') ? 'os custos mensais são os do mês inteiro; a equipe, o valor de hoje' : 'os custos são os do mês inteiro'
  const hrefMeses = `${base}/painel?${custosNaQuery(ctx.q)}${ctx.mesEscolhido ? `mes=${mesRef.slice(0, 7)}&` : ''}aba=meses`

  // ── Só para o celular: a frase de abertura e os apoios curtos, com os números já calculados acima ──
  const antCurto = mesCurto(proj.mesAnterior)
  const ateData = dataCurta(proj.ultimaData).slice(0, 5)   // 17/11: o ano já está no título do bloco
  // os mesmos números dos dois cartões logo abaixo (o em destaque e o de lotes), no texto do esboço aprovado
  const frases = frasesDoResumo({
    corretora: `${corretora === 'BTG' ? 'O' : 'A'} ${ctx.label}`,
    mes: mesRef, parcial: proj.parcial, lotes: r.lotes_mes, lotesComparavel: proj.lotes.realizado,
    lotesBase: proj.metodo === 'sem-lotes' ? null : proj.lotes.anteriorMesmoPonto,
    lotesPrevistos: proj.parcial ? proj.lotes.projetado : null,
    ...(comRepasse
      // a previsão do BTG é só do giro (sem fora do giro e Banking): a frase diz isso com o nome da linha da previsão
      ? { medida: 'comissão líquida', medidaNaFrase: true, valor: liquidoMes, valorAnterior: liquidoAnt, medidaPrevista: 'comissão líquida do giro', previsto: repasseProj?.liquido ?? null }
      : atp
        ? { medida: 'receita', medidaNaFrase: false, valor: mesAtual?.receita ?? 0, valorAnterior: mesAnt?.receita ?? null, medidaPrevista: null, previsto: proj.parcial ? receitaProj.projetado : null }
        : { medida: 'receita total', medidaNaFrase: false, valor: receitaComIncentivo, valorAnterior: receitaComIncentivoAnt ?? null, medidaPrevista: null, previsto: incentivoProj ? receitaProj.projetado + incentivoProj.total : null }),
  })
  // Mês em andamento contra mês inteiro ("−55,4% vs out/26 (mês parcial)") é a primeira coisa que se lê no
  // cartão e diz o contrário da previsão. No celular o cartão mostra os dois valores (fecha em · mês anterior)
  // e a variação parcial sai; a do mesmo ponto (lotes) e a do mês fechado continuam.
  const semVariacaoParcial = proj.parcial ? 'max-md:[&_.kpi-delta]:hidden!' : undefined
  const contraAnterior = (previsto: number, anterior: number | null | undefined) => `fecha em ${rCurto(previsto)}${anterior ? ` · ${antCurto}: ${rCurto(anterior)}` : ''}`

  // ── Onde o mês deve fechar: as mesmas linhas na tabela do computador e na lista do celular ──
  const variacaoPrevista = (previsto: number, anterior: number | null | undefined) => (anterior ? ((previsto - anterior) / anterior) * 100 : null)
  const historico = proj.metodo === 'historico'
  const linhasPrevistas: LinhaPrevista[] = !proj.parcial ? [] : [
    ...([
      { label: 'Lotes girados', m: proj.lotes, fmt: (v: number) => n0(Math.round(v)) },
      { label: 'Receita (corretagem, zeragem e avulsas)', m: proj.receita, fmt: rCurto },
    ] as const).map(l => ({
      label: l.label, realizado: l.fmt(l.m.realizado), projetado: l.fmt(l.m.projetado), faixa: historico ? `${l.fmt(l.m.baixo)} – ${l.fmt(l.m.alto)}` : TRACO, linear: l.fmt(l.m.linear),
      anterior: l.fmt(l.m.anteriorTotal ?? 0), pct: variacaoPrevista(l.m.projetado, l.m.anteriorTotal),
    })),
    ...(incentivoProj ? [{
      label: `Incentivo ${ctx.label}`, nota: `${fmtNum(incentivoProj.comFaixa)} com faixa${incentivoProj.sobem ? ` · ${fmtNum(incentivoProj.sobem)} sobem de faixa` : ''}`,
      realizado: rCurto(mesAtual?.incentivo ?? 0), projetado: rCurto(incentivoProj.total), faixa: TRACO, linear: TRACO,
      anterior: rCurto(mesAnt?.incentivo), pct: variacaoPrevista(incentivoProj.total, mesAnt?.incentivo),
    }] : []),
    ...(repasseProj ? [{
      label: 'Comissão líquida do giro', nota: `comissão ${ctx.label} ${fmtPct(repasseProj.pctEfetivo)} sobre a líquida prevista`, total: true,
      realizado: rCurto(repasseMes.liquido), projetado: rCurto(repasseProj.liquido),
      faixa: historico ? `${rCurto(liquidoPrevisto(receitaProj.baixo))} – ${rCurto(liquidoPrevisto(receitaProj.alto))}` : TRACO, linear: rCurto(liquidoPrevisto(receitaProj.linear)),
      anterior: rCurto(repasseAnt?.liquido), pct: variacaoPrevista(repasseProj.liquido, repasseAnt?.liquido),
    }] : []),
    // só com custo no mês: a comissão líquida do giro de cima menos os custos do mês (custos mensais inteiros,
    // equipe até hoje). É só giro, sem fora do giro e Banking: por isso não se chama "Resultado depois dos custos"
    ...(repasseProj && custosMes ? (() => {
      const menos = (v: number) => rSinal(resultadoDepoisDosCustos(v, custosMes))
      const comoAcima = (v: number) => (rCurto(v) === TRACO ? TRACO : menos(v))   // "–" onde a linha de cima mostra "–"
      const anterior = repasseAnt && custosAnt ? resultadoDepoisDosCustos(repasseAnt.liquido, custosAnt) : null
      const projetado = resultadoDepoisDosCustos(repasseProj.liquido, custosMes)
      const realizadoNum = resultadoDepoisDosCustos(repasseMes.liquido, custosMes)
      return [{
        label: 'Giro depois dos custos', nota: 'comissão líquida do giro prevista menos os custos do mês (sem fora do giro e Banking); equipe pelo valor de hoje', total: true,
        realizado: rSinal(realizadoNum), projetado: rSinal(projetado),
        // a mesma regra de arredondamento do rSinal: "R$ 0" não fica vermelho
        perda: { realizado: Math.round(realizadoNum) < 0, projetado: Math.round(projetado) < 0, anterior: anterior != null && Math.round(anterior) < 0 },
        faixa: historico ? `${comoAcima(liquidoPrevisto(receitaProj.baixo))} – ${comoAcima(liquidoPrevisto(receitaProj.alto))}` : TRACO,
        linear: comoAcima(liquidoPrevisto(receitaProj.linear)),
        // variação só contra um mês anterior positivo: contra um resultado negativo o percentual engana
        anterior: anterior == null ? TRACO : rSinal(anterior), pct: anterior != null && anterior > 0 ? variacaoPrevista(projetado, anterior) : null,
      }]
    })() : []),
  ]
  const diasLancados = `${fmtNum(proj.diasDecorridos)} de ${fmtNum(proj.diasTotal)} dias úteis lançados (até ${dataCurta(proj.ultimaData)})`
  const metodoDaPrevisao = historico
    ? `perfil de ${fmtNum(proj.mesesHistorico)} meses de histórico: neste ponto o mês costuma estar em ${fmtPct(proj.fracaoEsperada * 100, 0)} dos lotes`
    : 'menos de 3 meses de histórico: projeção pelo ritmo linear dos dias úteis'
  const explicaPrevisto = 'Previsto = realizado ÷ fração que o mês costuma ter atingido neste dia útil (mediana dos meses do histórico); a faixa usa os quartis.'
  const explicaLinear = 'Ritmo linear = realizado ÷ fração dos dias úteis. Dias úteis contam segunda a sexta, sem feriados.'
  const explicaRepasse = repasseProj ? ` A comissão líquida prevista passa pela cadeia de repasse do ${ctx.label} (faixas, impostos e Delta) sobre a receita prevista.` : ''

  // O que pede atenção: as mesmas linhas nos dois aparelhos; no celular a primeira que pede ação vai para o título
  const pendencias: { rotulo: string; href: string; valor: string; alerta?: boolean }[] = [
    { rotulo: 'Lançamentos com cliente não cadastrado', href: `${base}/importar#nao-cadastrados`, valor: `${fmtNum(naoCadLinhas)} linhas · ${fmtNum(naoCadLotes)} lotes`, alerta: !!naoCadLinhas },
    { rotulo: 'Migrados sem data de migração', href: `${base}/clientes?alerta=migrado%20sem%20data`, valor: fmtNum(r.migrados_sem_data), alerta: !!r.migrados_sem_data },
    { rotulo: 'Clientes com mais de uma conta', href: `${base}/clientes?alerta=contas`, valor: fmtNum(r.multi_conta) },
    { rotulo: 'Clientes com algum alerta de cadastro', href: `${base}/clientes?alerta=qualquer`, valor: fmtNum(r.com_alertas) },
    { rotulo: 'Clientes que nunca operaram', href: `${base}/clientes?momento=nunca`, valor: fmtNum(r.nunca_giraram) },
  ]
  const pendencia = pendencias.find(p => p.alerta)

  // Uma coluna só, com a ordem trocada no celular: a previsão vem logo depois dos números (no computador
  // é o último bloco). O espaço entre os blocos é o mesmo que a página dava.
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div className="md:hidden">
        <Resumo frase={frases.frase} apoio={fraseCustos ? (frases.apoio ? `${frases.apoio} ${fraseCustosCurta}` : fraseCustos) : frases.apoio}
          nota={proj.parcial ? `Lotes lançados até ${dataCurta(proj.ultimaData)}: ${fmtNum(proj.diasDecorridos)} de ${fmtNum(proj.diasTotal)} dias úteis.` : undefined} />
        {/* logo abaixo da frase que fala dos custos: um toque mostra a aba sem eles */}
        {chaveCustos('mt-3')}
      </div>

      <KpiRow cols={6}>
        {comRepasse ? (
          <KpiCard destaque label="Comissão líquida no mês" value={rCurto(liquidoMes)} className={semVariacaoParcial}
            sub={apoio(
              repasseProj ? `fecha em ${rCurto(repasseProj.liquido)} · comissão ${ctx.label} ${rCurto(repasseMes.comissao)}` : `comissão ${ctx.label} ${rCurto(repasseMes.comissao)}${extrasMes ? ` · ${rotuloExtras} ${r0(extrasMes)}` : ''}${custosMes ? ` · depois dos custos ${rSinal(resultadoMes)}` : partes.length ? ' · ' + partes.map(p => `${p.nome} ${rCurto(p.valor)}`).join(' · ') : ''}`,
              // o mês anterior na mesma medida do cartão (com fora do giro e Banking), o valor que a aba Mês a mês mostra
              repasseProj ? contraAnterior(repasseProj.liquido, liquidoAnt) : `comissão ${ctx.label} ${rCurto(repasseMes.comissao)}`,
            )}
            delta={variacaoMensal(liquidoMes, liquidoAnt ?? undefined, proj.mesAnterior, proj.parcial, rCurto)} />
        ) : atp ? (
          <KpiCard destaque label="Receita no mês" value={rCurto(mesAtual?.receita ?? 0)} sub={proj.parcial ? `fecha em ${rCurto(receitaProj.projetado)}` : 'corretagem + zeragem'}
            delta={variacaoDe(proj, proj.receita, rCurto)} />
        ) : (
          <KpiCard destaque label="Receita total no mês" value={rCurto(receitaComIncentivo)} className={semVariacaoParcial}
            sub={apoio(
              `giro ${rCurto(mesAtual?.receita ?? 0)} · incentivo ${rCurto(mesAtual?.incentivo ?? 0)}${incentivoProj ? ` · fecha em ${rCurto(receitaProj.projetado + incentivoProj.total)}` : ''}`,
              incentivoProj ? contraAnterior(receitaProj.projetado + incentivoProj.total, receitaComIncentivoAnt) : `giro ${rCurto(mesAtual?.receita ?? 0)} · incentivo ${rCurto(mesAtual?.incentivo ?? 0)}`,
            )}
            delta={variacaoMensal(receitaComIncentivo, receitaComIncentivoAnt, proj.mesAnterior, proj.parcial, rCurto)} />
        )}
        <KpiCard label="Lotes no mês" value={fmtNum(r.lotes_mes)}
          sub={apoio(
            `${fmtNum(r.zerados_mes)} zerados · ${rCurto(r.receita_mes)}${mesAtual?.acoes_operacoes ? ` · ${fmtNum(mesAtual.acoes_operacoes)} op. de ações` : ''}${mesAtual?.posicao ? ` · ${fmtNum(mesAtual.posicao)} em posição` : ''}${proj.parcial ? ` · fecha em ${fmtNum(Math.round(proj.lotes.projetado))}` : ''}`,
            proj.parcial ? `fecha em ${fmtNum(Math.round(proj.lotes.projetado))}` : `${fmtNum(r.zerados_mes)} zerados`,
          )}
          delta={variacaoDe(proj, proj.lotes, fmtNum)} />
        <KpiCard label="Ativos no mês" value={fmtNum(r.ativos)} className={semVariacaoParcial}
          sub={apoio(
            `${fmtPct(pctAtivosMigrados)} da base migrada · ${fmtPct(pctAtivosLevados)} do total levado`,
            `${proj.parcial && mesAnt ? `${antCurto} inteiro: ${fmtNum(mesAnt.clientes_ativos)} · ` : ''}${fmtPct(pctAtivosMigrados)} da base migrada`,
          )}
          delta={variacaoMensal(r.ativos, mesAnt?.clientes_ativos, proj.mesAnterior, proj.parcial, fmtNum)} />
        <KpiCard label="Em risco" tone={r.em_risco_alto ? 'warn' : 'neutral'} className="max-md:relative"
          value={totalRisco ? <Link href={`${base}/clientes?momento=risco`} className={cn('link', LINHA_INTEIRA)}>{fmtNum(totalRisco)}</Link> : fmtNum(0)}
          sub={apoio(
            `${r.em_risco_alto ? `${fmtNum(r.em_risco_alto)} de nível alto · ` : ''}giraram nos últimos 3 meses e pararam ou caíram`,
            `${r.em_risco_alto ? `${fmtNum(r.em_risco_alto)} de nível alto · ` : ''}${MOMENTO_RESUMO.risco}`,
          )} />
        <KpiCard label="Clientes levados" value={fmtNum(r.levados)} sub={`${fmtNum(r.contas)} contas · ${fmtNum(r.em_processamento)} em processamento`} />
        <KpiCard label="Taxa de migração" value={fmtPct(taxaMigracao)} sub={`${fmtNum(r.migrados)} migrados · ${fmtNum(r.recusaram)} recusaram`} />
      </KpiRow>

      <div className="grid gap-8 max-md:order-last xl:grid-cols-2">
        <Panel title={`A conta de ${mesLongo(mesRef)}`}
          subtitle={<>
            <span className="max-md:hidden">{`${comRepasse ? `Do que o ${ctx.label} paga ao que fica para o escritório` : 'O que os clientes geraram no mês'}, de cima para baixo${proj.parcial ? ` · parcial, com os lotes até ${dataCurta(proj.ultimaData)}${notaCustosParcial ? ` · ${notaCustosParcial}` : ''}` : ''}.`}</span>
            {proj.parcial && <span className="md:hidden">Parcial, com os lotes até {dataCurta(proj.ultimaData)}{notaCustosParcial ? `; ${notaCustosParcial}` : ''}.</span>}
          </>}
          action={<>{chaveCustos('max-md:hidden')}<Link href={hrefMeses} className={cn('link text-label', TOQUE)}>ver mês a mês</Link></>}>
          {/* no celular a mesma frase já está no topo da aba, junto da resposta */}
          {fraseCustos && <p className="mb-4 max-w-2xl text-dense max-md:hidden">{fraseCustos}</p>}
          <ContaDoMes linhas={conta} className="max-w-2xl" />
          {semValorEquipe.length > 0 && <p className="mt-3 text-label text-fg-subtle">Sem o valor de {eLista(semValorEquipe)} em Comissões: a conta está sem essa parte.</p>}
          {faltamExtras && <p className="mt-3 text-label text-fg-subtle">O fora do giro e o Banking de {mesCurto(mesRef)} entram quando as planilhas do mês forem lançadas em Importar.</p>}
        </Panel>

        {/* No celular é faxina de cadastro, não a resposta da aba: fica fechado no fim, com a primeira
            pendência ao lado do título; no computador aparece inteiro, como sempre */}
        <RecolheNoCelular titulo="O que pede atenção"
          resumo={pendencia ? <span className="text-warn">{pendencia.rotulo}: {pendencia.valor}</span> : 'Cadastro e lançamentos.'}>
          <Panel title={soNoComputador('O que pede atenção')} subtitle={soNoComputador('Cadastro e lançamentos.')}>
            <ul className="divide-y divide-line text-dense">
              {pendencias.map(p => (
                <li key={p.rotulo} className="flex items-center justify-between gap-3 py-3 max-md:relative">
                  <span className="max-md:flex-1">{p.rotulo}</span>
                  {/* valor comprido ("3.082 linhas · 414.457 lotes") quebra em duas linhas em vez de espremer o nome */}
                  <Link href={p.href} className={cn('link tabular-nums max-md:max-w-[45%] max-md:text-right', LINHA_INTEIRA, p.alerta && 'text-warn')}>{p.valor}</Link>
                  <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle md:hidden" aria-hidden />
                </li>
              ))}
            </ul>
          </Panel>
        </RecolheNoCelular>
      </div>

      {proj.parcial && (
        <Panel
          title={`Onde ${mesLongo(mesRef)} deve fechar`}
          subtitle={<>{diasLancados}<span className="max-md:hidden"> · {metodoDaPrevisao}</span>.
            {/* no celular, o "fecha perto de" da frase e do cartão aparece aqui somado (no BTG a lista já tem a linha de total) */}
            {incentivoProj && !repasseProj && <span className="md:hidden"> Receita total: {rCurto(receitaProj.projetado + incentivoProj.total)}, a soma da receita e do incentivo.</span>}</>}
        >
          {/* No celular cada indicador é um item: o previsto à direita e, embaixo, o mês anterior e a variação
              (que antes só aparecia no computador). O realizado até a data, a faixa e o ritmo linear ficam a um
              toque, em "Como a previsão é feita". */}
          <div className="tbl-wrap">
            <table className="tbl tbl-dense tbl-lista" style={{ '--lista-direita': '7rem' } as CSSProperties}>
              <thead>
                <tr>
                  <th>Indicador</th><th className="num col-p2">Até {dataCurta(proj.ultimaData)}</th><th className="num">Fecha em</th>
                  <th className="num col-p2">Faixa</th><th className="num col-p3">Ritmo linear</th><th className="num">{mesCurto(proj.mesAnterior)}</th><th className="num col-p2">Previsto vs {mesCurto(proj.mesAnterior)}</th>
                </tr>
              </thead>
              <tbody>
                {linhasPrevistas.map(l => (
                  <tr key={l.label} className={l.total ? 'total' : undefined}>
                    <td className={cn('cel-titulo', !l.total && 'font-medium')}>
                      {l.label}{l.nota && <span className={cn('ml-1.5 text-micro text-fg-subtle max-md:ml-0 max-md:block', l.total && 'font-normal')}>{l.nota}</span>}
                    </td>
                    <td className={cn('num col-p2', l.perda?.realizado && 'text-loss')}>{l.realizado}</td>
                    <td className={cn('num cel-valor font-semibold', l.perda?.projetado && 'text-loss')}>{l.projetado}</td>
                    <td className="num col-p2 text-fg-muted">{l.faixa}</td>
                    <td className="num col-p3 text-fg-muted">{l.linear}</td>
                    <td className={cn('num cel-sub', l.perda?.anterior && 'text-loss max-md:text-loss')} data-rotulo={antCurto}>{l.anterior}</td>
                    <td className={cn('num col-p2 cel-sub', l.pct == null && 'vazio')}><DeltaText pct={l.pct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-micro text-fg-subtle max-md:hidden">
            {explicaPrevisto} {explicaLinear}{explicaRepasse}
          </p>
          {/* a explicação e as três colunas que não cabem na linha: a um toque, com o texto do método usado */}
          <Recolhido tamanho="linha" titulo="Como a previsão é feita" className="mt-1 md:hidden">
            <div className="space-y-2 text-label text-fg-muted">
              <p>{metodoDaPrevisao.charAt(0).toUpperCase() + metodoDaPrevisao.slice(1)}.</p>
              <ul className="space-y-1">
                {linhasPrevistas.map(l => (
                  <li key={l.label}>
                    <span className="text-fg">{l.label}:</span> até {ateData}, <span className={cn(l.perda?.realizado && 'text-loss')}>{l.realizado}</span>
                    {l.faixa !== TRACO && ` · faixa de ${l.faixa}`}{historico && l.linear !== TRACO && ` · ritmo linear ${l.linear}`}
                  </li>
                ))}
              </ul>
              <p>{historico ? `${explicaPrevisto} ` : ''}{explicaLinear}{explicaRepasse}</p>
            </div>
          </Recolhido>
        </Panel>
      )}
    </div>
  )
}
