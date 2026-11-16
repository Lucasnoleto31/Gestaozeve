// Painel › Resumo: como está o mês. Seis números, a conta do mês (do que a corretora paga ao que fica para
// o escritório) em poucas linhas, o que pede atenção e, no mês em andamento, onde ele deve fechar.
import Link from 'next/link'
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
import { TRACO, dataCurta, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { ContaDoMes } from '@/components/gestao/ContaDoMes'
import { economiaDoPainel } from '@/lib/gestao/economiaPainel'

// Projeção: meses de histórico que entram no perfil intra-mês
const MESES_PROJECAO = 24

export async function AbaResumo({ ctx }: { ctx: Contexto }) {
  const { corretora, mesRef, base } = ctx
  const lim = limitesDoMes(mesRef)
  const hoje = fmtDate(hojeBrasil())
  const mesCorrente = mesRef === mesDeHoje()
  // Tudo em paralelo. O giro por dia (até 24 meses) alimenta a projeção e a comparação com o mês anterior;
  // os pontos por cliente só servem à projeção do incentivo no mês corrente
  const [eco, painel, naoCad, comissoes, giro, ultima, incentivo] = await Promise.all([
    economiaDoPainel(corretora, mesRef),
    painelResumo(corretora, mesRef),
    lotesNaoCadastrados(corretora),
    comissaoMensal(mesRef, 1, null, corretora),
    giroDiario(corretora, somarMeses(mesRef, -MESES_PROJECAO), lim.fim),
    ultimaData(corretora),
    mesCorrente ? incentivoMes(corretora, mesRef) : Promise.resolve([]),
  ])
  const { cfg, atp, comRepasse, mensal, par } = eco

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
  const partes = cfg.participacoes.map(p => ({ nome: p.nome, valor: (liquidoMes * p.pct) / 100 }))
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
  // comissão de parceiros por conta (abertura e ativação) no mês: paga à parte, entra na conta como lembrete
  const comissaoParceiros = comissoes.filter(c => c.mes_ref === mesRef).reduce((s, c) => s + c.valor_abertura + c.valor_ativacao, 0)
  const receitaComIncentivo = mesAtual ? eco.receitaTotal(mesAtual) : 0
  const receitaComIncentivoAnt = mesAnt ? eco.receitaTotal(mesAnt) : undefined

  const conta = comRepasse
    ? contaComRepasse({
      corretora: ctx.label, repasse: repasseMes, pctDoFechamento: eco.pctDoFechamento(mesRef), deltaPct: cfg.deltaPct, impostoPct: cfg.impostoPct,
      fora: eco.foraDe(mesRef), banking: eco.bankingDe(mesRef), participacoes: cfg.participacoes, comissaoParceiros,
    })
    : contaDaReceita({
      corretora: ctx.label, corretagem: mesAtual?.receita_corretagem ?? 0, zeragem: mesAtual?.receita_zeragem ?? 0, fixa: mesAtual?.receita_acoes ?? 0, receita: mesAtual?.receita ?? 0,
      incentivo: atp ? null : mesAtual?.incentivo ?? 0, clientesComFaixa: mesAtual?.clientes_com_faixa ?? 0, comissaoParceiros,
    })
  // as planilhas do que fica fora dos lotes chegam depois do mês: sem elas, a conta avisa que ainda falta
  const faltamExtras = comRepasse && (eco.temFora || eco.temBanking) && !eco.foraDe(mesRef) && !eco.bankingDe(mesRef)
  const hrefMeses = `${base}/painel?${ctx.mesEscolhido ? `mes=${mesRef.slice(0, 7)}&` : ''}aba=meses`

  return (
    <>
      <KpiRow cols={6}>
        {comRepasse ? (
          <KpiCard destaque label="Comissão líquida no mês" value={rCurto(liquidoMes)}
            sub={repasseProj ? `fecha em ${rCurto(repasseProj.liquido)} · comissão ${ctx.label} ${rCurto(repasseMes.comissao)}` : `comissão ${ctx.label} ${rCurto(repasseMes.comissao)}${extrasMes ? ` · ${rotuloExtras} ${r0(extrasMes)}` : ''}${partes.length ? ' · ' + partes.map(p => `${p.nome} ${rCurto(p.valor)}`).join(' · ') : ''}`}
            delta={variacaoMensal(liquidoMes, liquidoAnt ?? undefined, proj.mesAnterior, proj.parcial, rCurto)} />
        ) : atp ? (
          <KpiCard destaque label="Receita no mês" value={rCurto(mesAtual?.receita ?? 0)} sub={proj.parcial ? `fecha em ${rCurto(receitaProj.projetado)}` : 'corretagem + zeragem'}
            delta={variacaoDe(proj, proj.receita, rCurto)} />
        ) : (
          <KpiCard destaque label="Receita total no mês" value={rCurto(receitaComIncentivo)}
            sub={`giro ${rCurto(mesAtual?.receita ?? 0)} · incentivo ${rCurto(mesAtual?.incentivo ?? 0)}${incentivoProj ? ` · fecha em ${rCurto(receitaProj.projetado + incentivoProj.total)}` : ''}`}
            delta={variacaoMensal(receitaComIncentivo, receitaComIncentivoAnt, proj.mesAnterior, proj.parcial, rCurto)} />
        )}
        <KpiCard label="Lotes no mês" value={fmtNum(r.lotes_mes)} sub={`${fmtNum(r.zerados_mes)} zerados · ${rCurto(r.receita_mes)}${mesAtual?.acoes_operacoes ? ` · ${fmtNum(mesAtual.acoes_operacoes)} op. de ações` : ''}${mesAtual?.posicao ? ` · ${fmtNum(mesAtual.posicao)} em posição` : ''}${proj.parcial ? ` · fecha em ${fmtNum(Math.round(proj.lotes.projetado))}` : ''}`}
          delta={variacaoDe(proj, proj.lotes, fmtNum)} />
        <KpiCard label="Ativos no mês" value={fmtNum(r.ativos)} sub={`${fmtPct(pctAtivosMigrados)} da base migrada · ${fmtPct(pctAtivosLevados)} do total levado`}
          delta={variacaoMensal(r.ativos, mesAnt?.clientes_ativos, proj.mesAnterior, proj.parcial, fmtNum)} />
        <KpiCard label="Em risco" tone={r.em_risco_alto ? 'warn' : 'neutral'}
          value={totalRisco ? <Link href={`${base}/clientes?momento=risco`} className="link">{fmtNum(totalRisco)}</Link> : fmtNum(0)}
          sub={`${r.em_risco_alto ? `${fmtNum(r.em_risco_alto)} de nível alto · ` : ''}giraram nos últimos 3 meses e pararam ou caíram`} />
        <KpiCard label="Clientes levados" value={fmtNum(r.levados)} sub={`${fmtNum(r.contas)} contas · ${fmtNum(r.em_processamento)} em processamento`} />
        <KpiCard label="Taxa de migração" value={fmtPct(taxaMigracao)} sub={`${fmtNum(r.migrados)} migrados · ${fmtNum(r.recusaram)} recusaram`} />
      </KpiRow>

      <div className="grid gap-8 xl:grid-cols-2">
        <Panel title={`A conta de ${mesLongo(mesRef)}`}
          subtitle={`${comRepasse ? `Do que o ${ctx.label} paga ao que fica para o escritório` : 'O que os clientes geraram no mês'}, de cima para baixo${proj.parcial ? ` · parcial, com os lotes até ${dataCurta(proj.ultimaData)}` : ''}.`}
          action={<Link href={hrefMeses} className="link text-label">ver mês a mês</Link>}>
          <ContaDoMes linhas={conta} className="max-w-2xl" />
          {faltamExtras && <p className="mt-3 text-label text-fg-subtle">O fora do giro e o Banking de {mesCurto(mesRef)} entram quando as planilhas do mês forem lançadas em Importar.</p>}
        </Panel>

        <Panel title="O que pede atenção" subtitle="Cadastro e lançamentos.">
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
              <span>Clientes que nunca operaram</span>
              <Link href={`${base}/clientes?momento=nunca`} className="link tabular-nums">{fmtNum(r.nunca_giraram)}</Link>
            </li>
          </ul>
        </Panel>
      </div>

      {proj.parcial && (
        <Panel
          title={`Onde ${mesLongo(mesRef)} deve fechar`}
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
                    <td>Comissão líquida do giro<span className="ml-1.5 text-micro font-normal text-fg-subtle">comissão {ctx.label} {fmtPct(repasseProj.pctEfetivo)} sobre a líquida prevista</span></td>
                    <td className="num col-p2">{rCurto(repasseMes.liquido)}</td>
                    <td className="num font-semibold">{rCurto(repasseProj.liquido)}</td>
                    <td className="num col-p2 text-fg-muted">{proj.metodo === 'historico' ? `${rCurto(liquidoPrevisto(receitaProj.baixo))} – ${rCurto(liquidoPrevisto(receitaProj.alto))}` : TRACO}</td>
                    <td className="num col-p3 text-fg-muted">{rCurto(liquidoPrevisto(receitaProj.linear))}</td>
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
            {repasseProj ? ` A comissão líquida prevista passa pela cadeia de repasse do ${ctx.label} (faixas, impostos e Delta) sobre a receita prevista.` : ''}
          </p>
        </Panel>
      )}
    </>
  )
}
