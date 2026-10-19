export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { contatosParaResumo, funilAtivacoesPorAtendente, funilMensal, funilResultado, funilSafra, funilSafraPor, leadsDiario, leadsResumo } from '@/lib/gestao/consultas'
import { diasDoMes, fmtMedia, resumoContatosPorAtendente, somaAtivacoes, type ResumoAtendente } from '@/lib/gestao/contatos'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { janelaMeses, mesAtual, mesCurto, mesInput, mesLongo, parseMes, somarMeses } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Alert } from '@/components/ui/Alert'
import { MesPicker, SegParam } from '@/components/gestao/Filtros'
import { LinhaVazia, Secao, StatusLeadBadge, TRACO, dataCurta, n0, p1, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import type { AtivacaoAtendenteRow, FunilResultadoRow, FunilSafraBase, FunilSafraPorRow } from '@/lib/gestao/tipos'

const pct = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : null)
// Mesma regra da comissão (S41): voltar a operar depois de N meses parado é reativação
const MESES_INATIVO = 4
const RESULTADO_VAZIO: FunilResultadoRow = {
  mes_ref: '', ganhos: 0, perdidos: 0, contas_novas: 0, novos_operaram: 0, ativados: 0, reativados: 0, carteira_operou: 0,
  receita_total: 0, receita_novos: 0, receita_ativados: 0, receita_reativados: 0, receita_carteira: 0,
  lotes_total: 0, lotes_novos: 0, lotes_ativados: 0, lotes_reativados: 0, lotes_carteira: 0,
}

// Duas lentes, em blocos numerados: 1 · Resultado do mês (eventos pela data, S51), 2 · Ritmo do mês,
// 3 · Safra (o que aconteceu com os leads que entraram no período), 4 · Lista de ação.
// Vocabulário do escritório: tombou = virou cliente (abriu a conta); ativado = operou.
export default async function FunilPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'vendedor')) redirect('/dashboard')
  const sp = await searchParams
  const mesRef = parseMes(typeof sp.mes === 'string' ? sp.mes : null) ?? mesAtual()
  // Período da safra: só os leads que entraram no mês escolhido (padrão) ou os 12 meses até ele
  const periodo: 'mes' | '12m' = sp.periodo === '12m' ? '12m' : 'mes'
  const soMes = periodo === 'mes'
  const meses = janelaMeses(mesRef, 12)
  const [mensal, safra, porResp, porOrigem, leads, diario12m, dadosContatos, resultado, ativacoes] = await Promise.all([
    funilMensal(mesRef, 12), funilSafra(mesRef, 12), funilSafraPor('responsavel', mesRef, soMes ? 1 : 12), funilSafraPor('origem', mesRef, soMes ? 1 : 12), leadsResumo(40), leadsDiario(366),
    contatosParaResumo(), funilResultado(mesRef, 12, MESES_INATIVO), funilAtivacoesPorAtendente(mesRef, MESES_INATIVO),
  ])
  const hoje = fmtDate(hojeBrasil())
  const rotuloPeriodo = soMes ? mesLongo(mesRef) : `${mesCurto(meses[0])} a ${mesCurto(mesRef)}`

  // 1 · Resultado do mês escolhido e os 12 meses até ele
  const semS51 = resultado.length === 0
  const r = resultado.find(x => x.mes_ref === mesRef) ?? RESULTADO_VAZIO
  const resultadoDesc = [...resultado].reverse()
  const chavesR = (Object.keys(RESULTADO_VAZIO) as (keyof FunilResultadoRow)[]).filter(k => k !== 'mes_ref')
  const totR = Object.fromEntries(chavesR.map(k => [k, resultado.reduce((acc, x) => acc + (x[k] as number), 0)])) as Omit<FunilResultadoRow, 'mes_ref'>
  const tiposReceita = [
    { nome: 'Clientes novos', nota: 'conta aberta no mês', contas: r.novos_operaram, lotes: r.lotes_novos, receita: r.receita_novos },
    { nome: 'Ativados', nota: '1ª operação no mês', contas: r.ativados, lotes: r.lotes_ativados, receita: r.receita_ativados },
    { nome: 'Reativados', nota: `voltaram após ${MESES_INATIVO} meses parados`, contas: r.reativados, lotes: r.lotes_reativados, receita: r.receita_reativados },
    { nome: 'Carteira', nota: 'demais clientes que operaram', contas: r.carteira_operou, lotes: r.lotes_carteira, receita: r.receita_carteira },
  ]
  const contasOperaram = r.novos_operaram + r.ativados + r.reativados + r.carteira_operou

  // 2 · Ritmo: ganhos por dia do mês e contatos realizados no período
  const ganhosDias = diasDoMes(diario12m, mesRef, hoje)
  const contatosAt = resumoContatosPorAtendente(dadosContatos.contatos, dadosContatos.leads, soMes ? mesRef : meses[0], somarMeses(mesRef, 1))

  // 3 · Safra: do que entrou no período, o que aconteceu até hoje
  const m = new Map(mensal.map(x => [x.mes_ref, x]))
  const s = new Map(safra.map(x => [x.mes_ref, x]))
  const semSafra = safra.length === 0 && leads.total > 0   // S27 ainda não rodou
  const base = soMes ? safra.filter(x => x.mes_ref === mesRef) : safra
  const chaves: (keyof FunilSafraBase)[] = ['recebidos', 'contatados', 'perdidos', 'ganhos', 'em_aberto', 'ja_clientes', 'viraram_clientes', 'ativados', 'em_processamento', 'recusaram', 'com_giro', 'lotes', 'receita', 'contatos', 'contatos_ganhos', 'ganhos_contatados', 'em_contato', 'perdidos_funil', 'contas_abertas', 'contas_em_abertura']
  const t = Object.fromEntries(chaves.map(k => [k, base.reduce((acc, x) => acc + x[k], 0)])) as FunilSafraBase
  const jaClientes = t.ja_clientes || (soMes ? m.get(mesRef)?.ja_clientes ?? 0 : mensal.reduce((acc, x) => acc + x.ja_clientes, 0))
  const contatosPorGanho = (x: Pick<FunilSafraBase, 'contatos_ganhos' | 'ganhos_contatados'> | undefined) => (x && x.ganhos_contatados ? x.contatos_ganhos / x.ganhos_contatados : null)
  const abertosHoje = leads.abertos
  const acao = leads.acao
  const colMes = (i: number) => (i < meses.length - 4 ? 'col-p2' : '')
  const etapas = [
    { nome: 'Entraram', valor: t.recebidos, nota: `${fmtNum(jaClientes)} já eram clientes` },
    { nome: 'Contatados', valor: t.contatados, nota: t.contatos ? `${fmtNum(t.contatos)} contatos registrados${contatosPorGanho(t) != null ? ` · ${fmtMedia(contatosPorGanho(t))} por lead ganho` : ''}` : 'registramos contato ou mudamos o status' },
    { nome: 'Cadastrados', valor: t.viraram_clientes, nota: `${fmtNum(t.ganhos)} marcados como ganho` },
    { nome: 'Tombaram', valor: t.ativados, nota: 'viraram clientes: abriram a conta' },
    { nome: 'Operaram', valor: t.com_giro, nota: 'abriram a conta e já operaram' },
  ]
  const semS50 = t.recebidos > jaClientes && t.em_contato + t.perdidos_funil + t.contas_abertas === 0
  const destinos = [
    { nome: 'Perdido', valor: t.perdidos_funil, tom: 'loss' as const, nota: t.recusaram ? `${fmtNum(t.recusaram)} recusaram a corretora` : 'desistiram ou não responderam' },
    { nome: 'Em contato', valor: t.em_contato, tom: 'neutral' as const, nota: 'em aberto, ainda sendo trabalhados' },
    { nome: 'Conta aberta', valor: t.contas_abertas, tom: 'gain' as const, nota: `${fmtNum(t.contas_abertas - t.contas_em_abertura)} abriram a conta · ${fmtNum(t.contas_em_abertura)} em abertura · ${fmtNum(t.com_giro)} operaram` },
    { nome: 'Conta reativada', valor: jaClientes, tom: 'neutral' as const, nota: 'já eram clientes e voltaram pelo formulário' },
  ]

  type Linha = { label: string; valor: (x: FunilSafraBase | undefined) => number | null; fmt: (v: number | null) => string; total: number | null; destaque?: 'sub' | 'bold' | 'gain' | 'loss' }
  const nn = (v: number | null) => (v == null ? TRACO : n0(v))
  const pp = (v: number | null) => (v == null ? TRACO : p1(v))
  const rr = (v: number | null) => (v == null ? TRACO : rCurto(v))
  const mm = (v: number | null) => (v == null ? TRACO : (fmtMedia(v) ?? TRACO))
  const tudo = Object.fromEntries(chaves.map(k => [k, safra.reduce((acc, x) => acc + x[k], 0)])) as FunilSafraBase
  const linhas: Linha[] = [
    { label: 'Leads que entraram', valor: x => x?.recebidos ?? null, fmt: nn, total: tudo.recebidos, destaque: 'bold' },
    { label: 'já eram clientes ao entrar', valor: x => x?.ja_clientes ?? null, fmt: nn, total: tudo.ja_clientes, destaque: 'sub' },
    { label: 'Contatados', valor: x => x?.contatados ?? null, fmt: nn, total: tudo.contatados },
    { label: '% contatados', valor: x => (x ? pct(x.contatados, x.recebidos) : null), fmt: pp, total: pct(tudo.contatados, tudo.recebidos), destaque: 'sub' },
    { label: 'Contatos registrados', valor: x => x?.contatos ?? null, fmt: nn, total: tudo.contatos },
    { label: 'contatos por lead ganho (média)', valor: contatosPorGanho, fmt: mm, total: contatosPorGanho(tudo), destaque: 'sub' },
    { label: 'Perdidos', valor: x => x?.perdidos_funil ?? null, fmt: nn, total: tudo.perdidos_funil, destaque: 'loss' },
    { label: 'Em contato', valor: x => x?.em_contato ?? null, fmt: nn, total: tudo.em_contato },
    { label: 'Conta aberta (ganho, migrado ou em abertura)', valor: x => x?.contas_abertas ?? null, fmt: nn, total: tudo.contas_abertas, destaque: 'bold' },
    { label: 'marcados como ganho', valor: x => x?.ganhos ?? null, fmt: nn, total: tudo.ganhos, destaque: 'sub' },
    { label: 'tombaram (conta migrada)', valor: x => x?.ativados ?? null, fmt: nn, total: tudo.ativados, destaque: 'sub' },
    { label: 'ainda em abertura', valor: x => x?.contas_em_abertura ?? null, fmt: nn, total: tudo.contas_em_abertura, destaque: 'sub' },
    { label: 'Conta reativada (já era cliente)', valor: x => x?.ja_clientes ?? null, fmt: nn, total: tudo.ja_clientes },
    { label: 'Operaram (abriram a conta e giraram)', valor: x => x?.com_giro ?? null, fmt: nn, total: tudo.com_giro, destaque: 'gain' },
    { label: '% tombaram sobre os que entraram', valor: x => (x ? pct(x.ativados, x.recebidos) : null), fmt: pp, total: pct(tudo.ativados, tudo.recebidos), destaque: 'sub' },
    { label: '% operaram sobre os que tombaram', valor: x => (x ? pct(x.com_giro, x.ativados) : null), fmt: pp, total: pct(tudo.com_giro, tudo.ativados), destaque: 'sub' },
    { label: 'Lotes operados por essa safra', valor: x => x?.lotes ?? null, fmt: nn, total: tudo.lotes },
    { label: 'Receita deixada por essa safra', valor: x => x?.receita ?? null, fmt: rr, total: tudo.receita, destaque: 'gain' },
  ]
  const grafico = meses.map(x => ({ label: mesCurto(x), entraram: s.get(x)?.recebidos ?? m.get(x)?.recebidos ?? 0, tombaram: s.get(x)?.ativados ?? 0, operaram: s.get(x)?.com_giro ?? 0, perdidos: s.get(x)?.perdidos_funil ?? 0 }))

  return (
    <>
      <PageHeader
        eyebrow="Leads · todas as corretoras"
        title="Funil"
        description={<>Bloco 1: o resultado do mês, contado pela data de cada evento. Bloco 3: a safra, o que aconteceu até hoje com os leads que entraram no período. Tudo vem de <Link href="/leads" className="link">Leads</Link> e do cadastro de clientes.</>}
        actions={<>
          <SegParam param="periodo" valor={periodo} opcoes={[{ valor: 'mes', label: 'Só o mês' }, { valor: '12m', label: '12 meses' }]} />
          <MesPicker valor={mesRef} label="Mês" />
        </>}
      />
      <PageBody>
        {/* 1 · Resultado do mês */}
        <section className="space-y-6">
          <Secao numero={1} titulo={`Resultado de ${mesLongo(mesRef)}`}
            descricao={`Pela data do evento no mês. Ganhos e perdidos = leads fechados; contas novas = migradas na corretora; ativados = primeira operação da conta (aberta antes do mês); reativados = voltaram a operar depois de ${MESES_INATIVO} meses parados, como na comissão. Receita bruta = corretagem, zeragem e avulsas de quem operou no mês, cada conta em um tipo só.`} />
          {semS51 && <Alert tone="warn" title="Resultado do mês ainda não ativado no banco">Rode a S51 no Supabase para ver ganhos, perdidos, contas novas, ativados, reativados e a receita por tipo.</Alert>}
          <KpiRow cols={6}>
            <KpiCard label="Ganhos" value={fmtNum(r.ganhos)} sub="leads fechados como Ganho" tone={r.ganhos ? 'gain' : 'neutral'} />
            <KpiCard label="Perdidos" value={fmtNum(r.perdidos)} sub="leads fechados como Perdido" tone={r.perdidos ? 'loss' : 'neutral'} />
            <KpiCard label="Contas novas" value={fmtNum(r.contas_novas)} sub={`abertas no mês · ${fmtNum(r.novos_operaram)} já operaram`} />
            <KpiCard label="Ativados" value={fmtNum(r.ativados)} sub="1ª operação no mês, conta aberta antes" />
            <KpiCard label="Reativados" value={fmtNum(r.reativados)} sub={`voltaram a operar após ${MESES_INATIVO} meses`} />
            <KpiCard destaque label="Receita bruta do mês" value={rCurto(r.receita_total)} sub={`novos ${rCurto(r.receita_novos)} · ativados ${rCurto(r.receita_ativados)} · reativados ${rCurto(r.receita_reativados)}`} />
          </KpiRow>
          <div className="grid gap-8 xl:grid-cols-3">
            <Panel title={`Receita de ${mesCurto(mesRef)} por tipo de cliente`} subtitle="Cada conta que operou no mês entra em um tipo só; a soma dos quatro é a receita bruta do mês.">
              <table className="tbl tbl-dense">
                <thead><tr><th>Tipo</th><th className="num">Contas</th><th className="num col-p3">Lotes</th><th className="num">Receita</th><th className="num">%</th></tr></thead>
                <tbody>
                  {tiposReceita.map(x => (
                    <tr key={x.nome}>
                      <td className="font-medium">{x.nome}<span className="ml-2 text-micro font-normal text-fg-subtle">{x.nota}</span></td>
                      <td className={cn('num', !x.contas && 'subtle')}>{n0(x.contas)}</td>
                      <td className={cn('num col-p3', !x.lotes && 'subtle')}>{n0(x.lotes)}</td>
                      <td className={cn('num font-semibold', !x.receita && 'subtle')}>{r0(x.receita)}</td>
                      <td className={cn('num', !x.receita && 'subtle')}>{r.receita_total ? fmtPct(pct(x.receita, r.receita_total) ?? 0, 0) : TRACO}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="total">
                    <td>Receita do mês</td>
                    <td className="num">{n0(contasOperaram)}</td>
                    <td className="num col-p3">{n0(r.lotes_total)}</td>
                    <td className="num">{r0(r.receita_total)}</td>
                    <td className="num">{r.receita_total ? '100%' : TRACO}</td>
                  </tr>
                </tfoot>
              </table>
            </Panel>
            <Panel className="xl:col-span-2" title="Resultado mês a mês" subtitle="Últimos 12 meses, pelas mesmas definições; o mês escolhido fica em destaque. Clique no mês para levar o Funil para ele.">
              <div className="tbl-wrap">
                <table className="tbl tbl-dense">
                  <thead>
                    <tr>
                      <th>Mês</th><th className="num">Ganhos</th><th className="num">Perdidos</th><th className="num">Contas novas</th><th className="num">Ativados</th><th className="num">Reativados</th>
                      <th className="num">Receita</th><th className="num col-p2">de novos</th><th className="num col-p2">de ativados</th><th className="num col-p2">de reativados</th><th className="num col-p3">da carteira</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultadoDesc.length === 0 && <LinhaVazia colunas={11}>Sem resultado: rode a S51 no Supabase.</LinhaVazia>}
                    {resultadoDesc.map(x => (
                      <tr key={x.mes_ref} className={cn(x.mes_ref === mesRef && 'bg-surface-2')}>
                        <td className="font-medium"><Link href={`/funil?mes=${mesInput(x.mes_ref)}${soMes ? '' : '&periodo=12m'}`} className="link">{mesCurto(x.mes_ref)}</Link></td>
                        <td className={cn('num font-semibold', x.ganhos ? 'text-gain' : 'subtle')}>{n0(x.ganhos)}</td>
                        <td className={cn('num', x.perdidos ? 'text-loss' : 'subtle')}>{n0(x.perdidos)}</td>
                        <td className={cn('num', !x.contas_novas && 'subtle')}>{n0(x.contas_novas)}</td>
                        <td className={cn('num', !x.ativados && 'subtle')}>{n0(x.ativados)}</td>
                        <td className={cn('num', !x.reativados && 'subtle')}>{n0(x.reativados)}</td>
                        <td className={cn('num font-semibold', !x.receita_total && 'subtle')}>{r0(x.receita_total)}</td>
                        <td className={cn('num col-p2', !x.receita_novos && 'subtle')}>{r0(x.receita_novos)}</td>
                        <td className={cn('num col-p2', !x.receita_ativados && 'subtle')}>{r0(x.receita_ativados)}</td>
                        <td className={cn('num col-p2', !x.receita_reativados && 'subtle')}>{r0(x.receita_reativados)}</td>
                        <td className={cn('num col-p3', !x.receita_carteira && 'subtle')}>{r0(x.receita_carteira)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {resultadoDesc.length > 1 && (
                    <tfoot>
                      <tr className="total">
                        <td>12 meses</td>
                        <td className="num">{n0(totR.ganhos)}</td>
                        <td className="num">{n0(totR.perdidos)}</td>
                        <td className="num">{n0(totR.contas_novas)}</td>
                        <td className="num">{n0(totR.ativados)}</td>
                        <td className="num">{n0(totR.reativados)}</td>
                        <td className="num">{r0(totR.receita_total)}</td>
                        <td className="num col-p2">{r0(totR.receita_novos)}</td>
                        <td className="num col-p2">{r0(totR.receita_ativados)}</td>
                        <td className="num col-p2">{r0(totR.receita_reativados)}</td>
                        <td className="num col-p3">{r0(totR.receita_carteira)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Panel>
          </div>
        </section>

        {/* 2 · Ritmo do mês */}
        <section className="space-y-6">
          <Secao numero={2} titulo="Ritmo" descricao={`Ganhos dia a dia em ${mesLongo(mesRef)}, os contatos feitos com leads em ${rotuloPeriodo} e a campanha de ativação de contas em ${mesLongo(mesRef)}.`} />
          <Panel title={`Clientes ganhos por dia · ${mesLongo(mesRef)}`} subtitle={`Leads fechados como Ganho em cada dia (pela data de fechamento) e contas abertas na corretora (pela data de migração). ${fmtNum(ganhosDias.reduce((acc, d) => acc + d.ganhos, 0))} ganhos no mês até aqui.`}>
            {ganhosDias.length === 0
              ? <p className="py-10 text-center text-dense text-fg-subtle">Sem dias no período: a série diária cobre os últimos 12 meses.</p>
              : <GraficoSeries dados={ganhosDias.map(d => ({ label: d.dia.slice(8, 10), ganhos: d.ganhos, contas: d.contas_abertas }))}
                  series={[{ key: 'ganhos', nome: 'Ganhos', tipo: 'bar', cor: 'gain' }, { key: 'contas', nome: 'Contas abertas', tipo: 'bar', cor: 'neutral' }]} altura={200} />}
          </Panel>
          <Panel title="Contatos realizados" subtitle={`Contatos registrados em ${rotuloPeriodo}, pela data do contato, agrupados pelo responsável do lead. Por lead = contatos ÷ leads contatados; por dia = contatos ÷ dias com contato; até ganhar = todos os contatos (de todo o atendimento) dos leads ganhos contatados no período ÷ esses ganhos.`}>
            <div className="tbl-wrap">
              <table className="tbl tbl-dense">
                <thead>
                  <tr><th>Atendente</th><th className="num">Contatos</th><th className="num">Leads contatados</th><th className="num">Por lead</th><th className="num col-p2">Dias com contato</th><th className="num col-p2">Por dia</th><th className="num">Ganhos</th><th className="num">Contatos até ganhar</th></tr>
                </thead>
                <tbody>
                  {contatosAt.linhas.length === 0 && <LinhaVazia colunas={8}>Nenhum contato registrado em {rotuloPeriodo}.</LinhaVazia>}
                  {contatosAt.linhas.map(a => <LinhaAtendente key={a.grupo} a={a} />)}
                </tbody>
                {contatosAt.linhas.length > 1 && <tfoot><LinhaAtendente a={contatosAt.total} total /></tfoot>}
              </table>
            </div>
          </Panel>
          <Panel title={`Ativações e reativações por atendente · ${mesLongo(mesRef)}`}
            subtitle={`Campanha de ativação: as contas atribuídas a cada atendente hoje (lista de Clientes › Atribuir à campanha, ou o campo Ativação da ficha) e, no mês, os contatos registrados com elas, quantas operaram, quantas fizeram a 1ª operação e quantas voltaram a operar depois de ${MESES_INATIVO} meses paradas (a regra da comissão). Lotes e receita bruta são das contas com 1ª operação ou reativação no mês. Não mexe no responsável nem na comissão.`}>
            {ativacoes === null ? (
              <Alert tone="warn" title="Campanha de ativação ainda não ativada no banco">Rode a S52 no Supabase para atribuir contas, registrar contatos com clientes e ver este painel.</Alert>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl tbl-dense">
                  <thead>
                    <tr><th>Atendente</th><th className="num">Contas</th><th className="num">Contatos</th><th className="num col-p2">Contatadas</th><th className="num col-p2">Operaram</th><th className="num">1ª operação</th><th className="num">Reativadas</th><th className="num col-p3">Lotes</th><th className="num">Receita</th></tr>
                  </thead>
                  <tbody>
                    {ativacoes.length === 0 && <LinhaVazia colunas={9}>Nenhuma conta na campanha ainda: em Clientes, marque as contas e use “Atribuir à campanha”.</LinhaVazia>}
                    {ativacoes.map(a => <LinhaAtivacao key={a.ativador} a={a} />)}
                  </tbody>
                  {ativacoes.length > 1 && <tfoot><LinhaAtivacao a={somaAtivacoes(ativacoes)} total /></tfoot>}
                </table>
              </div>
            )}
          </Panel>
        </section>

        {/* 3 · Safra */}
        <section className="space-y-6">
          <Secao numero={3} titulo={`Safra: os leads que entraram em ${rotuloPeriodo}`} descricao="Pelo mês em que o lead entrou, o que aconteceu com ele até hoje: contato, cadastro, conta aberta (tombou) e operação. Use “Só o mês” ou “12 meses” no topo para mudar o período." />
          {semSafra && <Alert tone="warn" title="Funil por safra ainda não ativado no banco">Rode os scripts S27 e S28 no Supabase para ver contatados, tombaram, operaram, lotes e receita.</Alert>}
          <div className="grid gap-8 xl:grid-cols-3">
            <Panel className="xl:col-span-2" title={`Funil de ${rotuloPeriodo}`} subtitle={`Leads que entraram ${soMes ? 'nesse mês' : 'nessa janela'} e onde estão hoje. Quem já era cliente ao entrar fica fora das etapas.`}
              action={soMes ? <Link href={`/leads?mes=${mesInput(mesRef)}`} className="link text-label">ver os leads do mês</Link> : undefined}>
              <ol className="space-y-3">
                {etapas.map((e, i) => {
                  const anterior = i > 0 ? etapas[i - 1].valor : null
                  return (
                    <li key={e.nome}>
                      <div className="flex items-baseline justify-between gap-3 text-dense">
                        <span className="font-medium">{e.nome}<span className="ml-2 text-micro text-fg-subtle">{e.nota}</span></span>
                        <span className="tabular-nums text-fg-muted">
                          <span className="font-semibold text-fg">{fmtNum(e.valor)}</span>
                          {i > 0 && t.recebidos > 0 && <> · {fmtPct(pct(e.valor, t.recebidos) ?? 0, 0)} dos que entraram</>}
                          {anterior != null && anterior >= e.valor && anterior > 0 && <span className="text-fg-subtle"> · {fmtPct(pct(e.valor, anterior) ?? 0, 0)} da etapa anterior</span>}
                        </span>
                      </div>
                      <div className="bar-track mt-1 h-2" aria-hidden><div className="bar-fill" style={{ width: `${t.recebidos ? Math.min(100, (e.valor / t.recebidos) * 100) : 0}%`, opacity: 1 - i * 0.15 }} /></div>
                    </li>
                  )
                })}
              </ol>
            </Panel>
            <Panel title="Destino dos leads" subtitle={`Cada lead de ${rotuloPeriodo} em um destino só; os quatro somam os que entraram.`}>
              {semS50 && <Alert tone="warn" className="mb-3">Rode a S50 no Supabase para ver os destinos.</Alert>}
              <ol className="space-y-3">
                {destinos.map(d => (
                  <li key={d.nome}>
                    <div className="flex items-baseline justify-between gap-3 text-dense">
                      <span className="font-medium">{d.nome}<span className="ml-2 text-micro text-fg-subtle">{d.nota}</span></span>
                      <span className="whitespace-nowrap tabular-nums text-fg-muted">
                        <span className={cn('font-semibold', d.tom === 'loss' && d.valor ? 'text-loss' : d.tom === 'gain' && d.valor ? 'text-gain' : 'text-fg')}>{fmtNum(d.valor)}</span>
                        {t.recebidos > 0 && <> · {fmtPct(pct(d.valor, t.recebidos) ?? 0, 0)}</>}
                      </span>
                    </div>
                    <div className="bar-track mt-1 h-2" aria-hidden><div className="bar-fill" style={{ width: `${t.recebidos ? Math.min(100, (d.valor / t.recebidos) * 100) : 0}%` }} /></div>
                  </li>
                ))}
              </ol>
              <p className="mt-4 border-t border-line pt-3 text-label text-fg-muted">Em aberto hoje, somando todos os meses: <span className="font-semibold tabular-nums text-fg">{fmtNum(abertosHoje)}</span> · {fmtNum(leads.com_alerta)} com alerta de contato.</p>
            </Panel>
          </div>

          <Panel title="Leads por mês de entrada" subtitle="Por safra: quantos entraram, quantos tombaram (abriram a conta), quantos operaram e quantos se perderam, contando o que aconteceu com eles até hoje.">
            <GraficoSeries dados={grafico} series={[{ key: 'entraram', nome: 'Entraram', tipo: 'bar' }, { key: 'tombaram', nome: 'Tombaram', tipo: 'bar', cor: 'neutral' }, { key: 'operaram', nome: 'Operaram', tipo: 'bar', cor: 'gain' }, { key: 'perdidos', nome: 'Perdidos', tipo: 'bar', cor: 'loss' }]} altura={260} />
          </Panel>

          <Panel title="Safra mês a mês" subtitle={`Cada coluna é o mês em que o lead entrou; os números dizem o que aconteceu com esses leads até hoje. De ${mesCurto(meses[0])} a ${mesCurto(mesRef)}; a coluna do mês escolhido fica em destaque.`}>
            <div className="tbl-wrap">
              <table className="tbl tbl-dense">
                <thead><tr><th className="sticky-col min-w-[240px]">Indicador</th>{meses.map((x, i) => <th key={x} className={cn('num', colMes(i), x === mesRef && 'text-fg')}>{mesCurto(x)}</th>)}<th className="num">12 m</th></tr></thead>
                <tbody>
                  {linhas.map(l => (
                    <tr key={l.label}>
                      <td className={cn('sticky-col', l.destaque === 'sub' && 'pl-6 text-fg-muted', l.destaque === 'bold' && 'font-semibold', l.destaque === 'gain' && 'text-gain', l.destaque === 'loss' && 'text-loss')}>{l.label}</td>
                      {meses.map((x, i) => { const v = l.valor(s.get(x)); return <td key={x} className={cn('num', colMes(i), !v && 'subtle', x === mesRef && 'bg-surface-2', l.destaque === 'gain' && v && 'text-gain', l.destaque === 'loss' && v && 'text-loss')}>{l.fmt(v)}</td> })}
                      <td className="num font-semibold">{l.total == null ? '' : l.fmt(l.total)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="sticky-col">Tempo médio até fechar (dias)</td>
                    {meses.map((x, i) => { const v = m.get(x)?.dias_fechar ?? null; return <td key={x} className={cn('num', colMes(i), !v && 'subtle', x === mesRef && 'bg-surface-2')}>{v == null ? TRACO : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td> })}
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <TabelaSafra titulo="Por responsável" descricao={`Leads de ${rotuloPeriodo} atribuídos a cada pessoa: quantos tombaram e quantos operaram.`} dados={porResp} />
          <TabelaSafra titulo="Por origem" descricao={`De onde vieram os leads de ${rotuloPeriodo} e quanto cada origem rendeu.`} dados={porOrigem} />
        </section>

        {/* 4 · Lista de ação */}
        <section className="space-y-6">
          <Secao numero={4} titulo="Lista de ação" descricao="Leads abertos sem contato há mais tempo que o limite, de qualquer mês, mais antigos primeiro." action={<Link href="/leads?alerta=1" className="link text-label">ver todos na tela de Leads</Link>} />
          <div className="tbl-wrap max-h-[480px]">
            <table className="tbl tbl-dense">
              <thead><tr><th>Nome</th><th className="col-p2">WhatsApp</th><th className="col-p2">Responsável</th><th>Status</th><th className="col-p3">Recebido</th><th className="col-p2">Último contato</th><th className="num">Dias</th><th className="col-p3">Opera em</th></tr></thead>
              <tbody>
                {acao.length === 0 && <LinhaVazia colunas={8}>Nenhum lead aberto com alerta.</LinhaVazia>}
                {acao.map(l => (
                  <tr key={l.id}>
                    <td className="max-w-[200px] truncate font-medium"><Link href={`/leads?busca=${encodeURIComponent(l.nome)}`} className="link">{l.nome}</Link></td>
                    <td className="num col-p2">{l.whatsapp ?? TRACO}</td>
                    <td className="muted col-p2">{l.responsavel ?? TRACO}</td>
                    <td><StatusLeadBadge status={l.status} tipo={l.tipo_status} /></td>
                    <td className="num col-p3">{dataCurta(l.data_hora.slice(0, 10))}</td>
                    <td className="num col-p2">{dataCurta(l.ultimo_contato)}</td>
                    <td className="num font-semibold text-warn">{l.dias ?? TRACO}</td>
                    <td className="muted col-p3">{l.corretora ?? TRACO}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </PageBody>
    </>
  )
}

// Uma linha de "Contatos realizados": médias com uma casa, traço quando não há base
function LinhaAtendente({ a, total }: { a: ResumoAtendente; total?: boolean }) {
  const media = (x: number, n: number) => (n ? fmtMedia(x / n) : TRACO)
  return (
    <tr className={cn(total && 'total')}>
      <td className="font-medium">{a.grupo}</td>
      <td className="num font-semibold">{n0(a.contatos)}</td>
      <td className="num">{n0(a.leads)}</td>
      <td className="num">{media(a.contatos, a.leads)}</td>
      <td className="num col-p2">{n0(a.dias)}</td>
      <td className="num col-p2">{media(a.contatos, a.dias)}</td>
      <td className={cn('num', a.ganhos && 'text-gain')}>{n0(a.ganhos)}</td>
      <td className="num font-semibold">{media(a.contatos_ganhos, a.ganhos)}</td>
    </tr>
  )
}

// Uma linha de "Ativações e reativações por atendente" (S52)
function LinhaAtivacao({ a, total }: { a: AtivacaoAtendenteRow; total?: boolean }) {
  return (
    <tr className={cn(total && 'total')}>
      <td className="font-medium">{a.ativador}</td>
      <td className="num">{n0(a.contas)}</td>
      <td className="num font-semibold">{n0(a.contatos)}</td>
      <td className="num col-p2">{n0(a.contas_contatadas)}</td>
      <td className="num col-p2">{n0(a.operaram)}</td>
      <td className={cn('num font-semibold', a.ativados && 'text-gain')}>{n0(a.ativados)}</td>
      <td className={cn('num font-semibold', a.reativados && 'text-gain')}>{n0(a.reativados)}</td>
      <td className="num col-p3">{n0(a.lotes)}</td>
      <td className="num">{r0(a.receita)}</td>
    </tr>
  )
}

function TabelaSafra({ titulo, descricao, dados }: { titulo: string; descricao: string; dados: FunilSafraPorRow[] }) {
  return (
    <Panel title={titulo} subtitle={descricao}>
      <div className="tbl-wrap">
        <table className="tbl tbl-dense">
          <thead>
            <tr>
              <th>Grupo</th><th className="num">Entraram</th><th className="num col-p3">Já clientes</th><th className="num col-p2">Contatados</th><th className="num col-p2">Contatos/ganho</th><th className="num">Perdidos</th><th className="num col-p3">Em contato</th>
              <th className="num col-p2">Conta aberta</th><th className="num">Tombaram</th><th className="num col-p2">Recusaram</th><th className="num">Operaram</th><th className="num col-p2">% tombaram</th><th className="num col-p3">Lotes</th><th className="num">Receita</th>
            </tr>
          </thead>
          <tbody>
            {dados.length === 0 && <LinhaVazia colunas={14}>Sem leads no período.</LinhaVazia>}
            {dados.map(g => (
              <tr key={g.grupo}>
                <td className="font-medium">{g.grupo}</td>
                <td className="num">{n0(g.recebidos)}</td>
                <td className="num muted col-p3">{n0(g.ja_clientes)}</td>
                <td className="num col-p2">{n0(g.contatados)}</td>
                <td className="num col-p2" title={g.ganhos_contatados ? `${fmtNum(g.contatos_ganhos)} contatos em ${fmtNum(g.ganhos_contatados)} ganhos com contato registrado` : undefined}>{g.ganhos_contatados ? fmtMedia(g.contatos_ganhos / g.ganhos_contatados) : TRACO}</td>
                <td className={cn('num', g.perdidos_funil && 'text-loss')}>{n0(g.perdidos_funil)}</td>
                <td className="num col-p3">{n0(g.em_contato)}</td>
                <td className="num col-p2">{n0(g.contas_abertas)}</td>
                <td className={cn('num font-semibold', g.ativados && 'text-fg')}>{n0(g.ativados)}</td>
                <td className={cn('num col-p2', g.recusaram && 'text-loss')}>{n0(g.recusaram)}</td>
                <td className={cn('num font-semibold', g.com_giro && 'text-gain')}>{n0(g.com_giro)}</td>
                <td className="num col-p2">{g.recebidos ? fmtPct((g.ativados / g.recebidos) * 100, 0) : TRACO}</td>
                <td className="num col-p3">{n0(g.lotes)}</td>
                <td className="num">{r0(g.receita)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
