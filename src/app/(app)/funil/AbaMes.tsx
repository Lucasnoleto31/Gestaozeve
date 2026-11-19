// Funil › Mês: o que fechou no mês (pela data de cada evento) e onde estão hoje os leads que entraram nele.
//
// No celular (DESIGN.md §8) a aba abre pela frase, com dois cartões (ganhos e receita nova) e duas linhas
// (perdidos e contas novas); depois o que pede ação (leads em aberto), onde estão os leads do mês e a receita
// por tipo, em lista. As etapas e o gráfico por dia ficam recolhidos. O computador não muda.
import Link from 'next/link'
import { Fragment } from 'react'
import { CORRETORA_LABEL, type Corretora } from '@/lib/corretoras'
import { funilMensal, funilResultado, funilResultadoPorCorretora, funilSafra, leadsDiario, leadsGanhosDoMes, leadsResumo, motivosDePerdaDoMes } from '@/lib/gestao/consultas'
import { diasDoMes, fmtMedia } from '@/lib/gestao/contatos'
import { diasEntre, mesAtual, mesCurto, mesInput, mesLongo } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Alert } from '@/components/ui/Alert'
import { Recolhido } from '@/components/ui/Recolhido'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Resumo } from '@/components/gestao/Resumo'
import { TRACO, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { DicaNoTitulo } from './Celular'
import { GanhosDoMes } from './GanhosDoMes'
import { MaisNumeros } from './MaisNumeros'
import { RecolheNoCelular } from '@/components/ui/RecolheNoCelular'
import { LISTA_LARGA, MESES_INATIVO, RESULTADO_VAZIO, celMais, pct, plural, somaSafra } from './comum'
import type { FunilResultadoRow } from '@/lib/gestao/tipos'

const EXPLICA_RECEITA = 'Cada conta que operou no mês entra em um tipo só. Receita bruta: corretagem, zeragem e avulsas, antes de repasse e impostos.'

export async function AbaMes({ mesRef, corretoras }: { mesRef: string; corretoras: Corretora[] }) {
  const hoje = fmtDate(hojeBrasil())
  const diasSerie = Math.max(1, Math.min(366, diasEntre(mesRef, hoje) + 1))   // a série diária vai de hoje para trás
  const [resultado, porCorretora, safra, mensal, diario, ganhosMes, leads, motivos] = await Promise.all([
    funilResultado(mesRef, 1, MESES_INATIVO), funilResultadoPorCorretora(mesRef, corretoras, MESES_INATIVO), funilSafra(mesRef, 1), funilMensal(mesRef, 1),
    leadsDiario(diasSerie), leadsGanhosDoMes(mesRef), leadsResumo(0), motivosDePerdaDoMes(mesRef),
  ])
  // motivo mais comum de perda no mês (até nov/26 ficava num cartão da tela Leads)
  const motivoComum = motivos[0] ?? null
  const mes = mesCurto(mesRef)
  const r = resultado.find(x => x.mes_ref === mesRef) ?? RESULTADO_VAZIO
  const t = somaSafra(safra.filter(x => x.mes_ref === mesRef))
  const jaClientes = t.ja_clientes || (mensal.find(x => x.mes_ref === mesRef)?.ja_clientes ?? 0)
  const receitaNova = r.receita_novos + r.receita_ativados + r.receita_reativados
  const porCorretoraTexto = (k: 'contas_novas' | 'ativados' | 'reativados') =>
    (porCorretora ?? []).filter(x => x.r[k] > 0).map(x => `${CORRETORA_LABEL[x.corretora]} ${fmtNum(x.r[k])}`).join(' · ')

  // os leads que entraram no mês: etapas (quem já era cliente fica fora) e destino (um só por lead)
  const contatosPorGanho = t.ganhos_contatados ? t.contatos_ganhos / t.ganhos_contatados : null
  const etapas = [
    { nome: 'Entraram', valor: t.recebidos, nota: jaClientes ? `${fmtNum(jaClientes)} já eram clientes` : 'pelo formulário ou cadastrados à mão' },
    { nome: 'Contatados', valor: t.contatados, nota: t.contatos ? `${fmtNum(t.contatos)} contatos registrados${contatosPorGanho != null ? ` · ${fmtMedia(contatosPorGanho)} por lead ganho` : ''}` : 'com contato registrado ou status alterado' },
    { nome: 'Tombaram', valor: t.ativados, nota: `abriram a conta na corretora${t.contas_em_abertura ? ` · mais ${fmtNum(t.contas_em_abertura)} em abertura` : ''}` },
    { nome: 'Operaram', valor: t.com_giro, nota: 'abriram a conta e já giraram' },
  ]
  const destinos = [
    { nome: 'Em contato', valor: t.em_contato, tom: 'neutral' as const, nota: 'em aberto, ainda sendo trabalhados' },
    { nome: 'Conta aberta', valor: t.contas_abertas, tom: 'gain' as const, nota: `${fmtNum(t.contas_abertas - t.contas_em_abertura)} abertas · ${fmtNum(t.contas_em_abertura)} em abertura` },
    { nome: 'Perdido', valor: t.perdidos_funil, tom: 'loss' as const, nota: t.recusaram ? `${fmtNum(t.recusaram)} recusaram a corretora` : 'desistiram ou não responderam' },
    { nome: 'Já eram clientes', valor: jaClientes, tom: 'neutral' as const, nota: 'voltaram pelo formulário' },
  ]

  // receita do mês por tipo de cliente: cada corretora com movimento e o total do escritório
  const operaram = (x: FunilResultadoRow) => x.novos_operaram + x.ativados + x.reativados + x.carteira_operou
  const tipos = [
    { chave: 'novos', nome: 'Clientes novos', nota: 'conta aberta no mês', de: (x: FunilResultadoRow) => ({ contas: x.novos_operaram, lotes: x.lotes_novos, receita: x.receita_novos }) },
    { chave: 'ativados', nome: 'Ativados', nota: '1ª operação no mês', de: (x: FunilResultadoRow) => ({ contas: x.ativados, lotes: x.lotes_ativados, receita: x.receita_ativados }) },
    { chave: 'reativados', nome: 'Reativados', nota: `voltaram após ${MESES_INATIVO} meses`, de: (x: FunilResultadoRow) => ({ contas: x.reativados, lotes: x.lotes_reativados, receita: x.receita_reativados }) },
    { chave: 'carteira', nome: 'Carteira', nota: 'quem já operava', de: (x: FunilResultadoRow) => ({ contas: x.carteira_operou, lotes: x.lotes_carteira, receita: x.receita_carteira }) },
  ]
  const grupos = [
    ...(porCorretora ?? []).filter(x => x.r.contas_novas > 0 || x.r.lotes_total > 0).map(x => ({ chave: x.corretora as string, label: CORRETORA_LABEL[x.corretora], r: x.r })),
    { chave: 'total', label: 'Total', r },
  ]
  const ganhosDias = diasDoMes(diario, mesRef, hoje)

  // Os cartões são os mesmos nas duas larguras; o celular mostra quatro, com os dois que respondem à aba na frente
  const cartao = {
    entraram: <KpiCard label="Leads que entraram" value={fmtNum(t.recebidos)} sub={jaClientes ? `${fmtNum(jaClientes)} já eram clientes` : `em ${mes}`} />,
    ganhos: <KpiCard label="Ganhos" value={fmtNum(r.ganhos)} sub="leads fechados como Ganho" tone={r.ganhos ? 'gain' : 'neutral'} />,
    perdidos: (
      <KpiCard label="Perdidos" value={fmtNum(r.perdidos)} tone={r.perdidos ? 'loss' : 'neutral'}
        sub={motivoComum ? <span title={motivos.map(m => `${m.motivo}: ${fmtNum(m.leads)}`).join(' · ')}>motivo mais comum: {motivoComum.motivo} ({fmtNum(motivoComum.leads)})</span> : 'leads fechados como Perdido'} />
    ),
    contas: <KpiCard label="Contas novas" value={fmtNum(r.contas_novas)} sub={`${porCorretoraTexto('contas_novas') || 'abertas no mês'} · ${fmtNum(r.novos_operaram)} já operaram`} />,
    ativados: <KpiCard label="Ativados · reativados" value={`${fmtNum(r.ativados)} · ${fmtNum(r.reativados)}`} sub={`1ª operação · voltaram após ${MESES_INATIVO} meses`} />,
    receita: (
      <KpiCard destaque label="Receita nova no mês" value={receitaNova ? rCurto(receitaNova) : 'R$ 0'}
        sub={r.receita_total ? `novos, ativados e reativados · ${fmtPct(pct(receitaNova, r.receita_total) ?? 0, 0)} de ${rCurto(r.receita_total)}` : 'de novos, ativados e reativados'} />
    ),
  }
  // A frase do celular só usa números dos cartões: ganhos, perdidos, contas novas e receita nova
  const parcial = mesRef >= mesAtual()
  const frase = `Em ${mesLongo(mesRef)}${parcial ? ', até hoje' : ''}: ${plural(r.ganhos, 'lead ganho', 'leads ganhos')}, ${plural(r.perdidos, 'perdido', 'perdidos')} e ${plural(r.contas_novas, 'conta nova', 'contas novas')}. `
    + (receitaNova ? `Clientes novos, ativados e reativados deixaram ${rCurto(receitaNova)}.` : 'Clientes novos, ativados e reativados ainda não deixaram receita.')
  const emAberto = <>Em aberto hoje, somando todos os meses: <span className="font-semibold tabular-nums text-fg">{fmtNum(leads.abertos)}</span> leads · {fmtNum(leads.com_alerta)} sem contato além do limite.</>

  // As três células de um grupo (corretora ou total) na tabela de receita. No celular a tabela vira lista:
  // o nome do tipo com as contas, e a receita total à direita. O que é de cada corretora ("Genial 8 contas ·
  // 3.000 lotes · R$ 1.000,00") e os lotes entram na linha de apoio com "Mais números".
  const celulas = (g: (typeof grupos)[number], v: { contas: number; lotes: number; receita: number }, rodape = false) => {
    const total = g.chave === 'total', so = !total && 'col-p2'
    // o nome da corretora vai na frente da primeira célula dela que aparece (as contas; sem contas, a receita)
    const comContas = !total && v.contas > 0
    return (
      <Fragment key={g.chave}>
        <td className={cn('num', so, !rodape && !v.contas && 'subtle', celMais(comContas))} data-rotulo={comContas ? g.label : undefined}>
          {n0(v.contas)}{!total && <span className="md:hidden"> {v.contas === 1 ? 'conta' : 'contas'}</span>}
        </td>
        <td className={cn('num col-p2', !rodape && !v.lotes && 'subtle', celMais(v.lotes > 0 && (total || comContas)))}>{n0(v.lotes)}<span className="md:hidden"> lotes{total && ' no total'}</span></td>
        <td className={cn('num', so, !rodape && total && 'font-semibold', !rodape && !v.receita && 'subtle', total ? 'cel-valor' : celMais(v.receita > 0))}
          data-rotulo={!total && !comContas && v.receita > 0 ? g.label : undefined}>{r0(v.receita)}</td>
      </Fragment>
    )
  }

  return (
    <>
      {resultado.length === 0 && <Alert tone="warn" title="Resultado do mês ainda não ativado no banco">Rode a S51 no Supabase para ver ganhos, perdidos, contas novas, ativados e reativados.</Alert>}

      {resultado.length > 0 && <div className="md:hidden"><Resumo frase={frase} /></div>}

      <KpiRow cols={6} className="max-md:hidden">
        {cartao.entraram}{cartao.ganhos}{cartao.perdidos}{cartao.contas}{cartao.ativados}{cartao.receita}
      </KpiRow>
      {/* Celular: os leads que entraram viram o título de "Onde estão hoje"; ativados e reativados estão na
          lista de receita por tipo */}
      <KpiRow cols={4} className="md:hidden">
        {cartao.ganhos}{cartao.receita}{cartao.perdidos}{cartao.contas}
      </KpiRow>
      {/* no computador a lista dos motivos aparece ao passar o mouse no cartão; no toque isso não existe */}
      {motivos.length > 1 && (
        <Recolhido tamanho="linha" titulo="Motivos de perda do mês" className="max-md:-mt-4 md:hidden">
          <ul className="divide-y divide-line text-dense">
            {motivos.map(m => (
              <li key={m.motivo} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0">{m.motivo}</span><span className="font-semibold tabular-nums">{fmtNum(m.leads)}</span>
              </li>
            ))}
          </ul>
        </Recolhido>
      )}
      <div className="md:hidden">
        <p className="text-dense text-fg-muted">{emAberto}</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Link href="/fila" className={buttonClasses('secondary', 'md', 'h-11 px-3')}>Abrir a Minha fila</Link>
          <Link href="/leads?alerta=1" className={buttonClasses('secondary', 'md', 'h-11 px-3')}>ver na tela de Leads</Link>
        </div>
      </div>

      <div className="grid gap-8 max-md:gap-6 xl:grid-cols-3">
        <RecolheNoCelular className="max-md:order-2 xl:col-span-2" titulo="Até onde chegaram"
          resumo={`${fmtNum(t.contatados)} contatados · ${fmtNum(t.ativados)} tombaram · ${fmtNum(t.com_giro)} operaram`}
          dica="Os leads que entraram no mês e até onde chegaram até hoje. Quem já era cliente ao entrar fica fora das etapas.">
          <Panel title={<span className="max-md:hidden">Leads que entraram em {mesLongo(mesRef)}</span>}
            subtitle={<span className="max-md:hidden">Até onde chegaram até hoje. Quem já era cliente ao entrar fica fora das etapas.</span>}
            action={<Link href={`/leads?mes=${mesInput(mesRef)}`} className="link text-label max-md:hidden">ver os leads do mês</Link>}>
            <ol className="space-y-3">
              {etapas.map((e, i) => {
                const anterior = i > 0 ? etapas[i - 1].valor : null
                const dosQueEntraram = i > 0 && t.recebidos > 0
                const daAnterior = i > 1 && anterior != null && anterior >= e.valor && anterior > 0
                return (
                  <li key={e.nome}>
                    {/* celular: o nome com a nota embaixo, o número à direita e as porcentagens numa linha própria
                        (um trecho só do celular; o do computador fica como era, escondido ali) */}
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-dense">
                      <span className="font-medium max-md:min-w-0 max-md:flex-1">{e.nome}<span className="ml-2 text-micro font-normal text-fg-subtle max-md:ml-0 max-md:block max-md:text-label max-md:text-fg-muted">{e.nota}</span></span>
                      <span className="ml-auto text-right tabular-nums text-fg-muted max-md:hidden">
                        <span className="font-semibold text-fg">{fmtNum(e.valor)}</span>
                        {dosQueEntraram && <> · {fmtPct(pct(e.valor, t.recebidos) ?? 0, 0)} dos que entraram</>}
                        {daAnterior && <span className="text-fg-subtle"> · {fmtPct(pct(e.valor, anterior) ?? 0, 0)} da etapa anterior</span>}
                      </span>
                      <span className="font-semibold tabular-nums text-fg md:hidden">{fmtNum(e.valor)}</span>
                      {dosQueEntraram && (
                        <span className="basis-full text-label tabular-nums text-fg-muted md:hidden">
                          {fmtPct(pct(e.valor, t.recebidos) ?? 0, 0)} dos que entraram
                          {daAnterior && <span className="text-fg-subtle"> · {fmtPct(pct(e.valor, anterior) ?? 0, 0)} da etapa anterior</span>}
                        </span>
                      )}
                    </div>
                    <div className="bar-track mt-1 h-2" aria-hidden><div className="bar-fill" style={{ width: `${t.recebidos ? Math.min(100, (e.valor / t.recebidos) * 100) : 0}%`, opacity: 1 - i * 0.18 }} /></div>
                  </li>
                )
              })}
            </ol>
          </Panel>
        </RecolheNoCelular>
        <Panel title={<>Onde estão hoje<span className="md:hidden"> os {fmtNum(t.recebidos)} leads que entraram em {mesLongo(mesRef)}</span></>}
          subtitle={<span className="max-md:hidden">Cada lead do mês em um destino só; os quatro somam os que entraram.</span>}>
          <ol className="space-y-3">
            {destinos.map(d => (
              <li key={d.nome}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-dense max-md:flex-nowrap">
                  <span className="font-medium max-md:min-w-0 max-md:flex-1">{d.nome}<span className="ml-2 text-micro font-normal text-fg-subtle max-md:ml-0 max-md:block max-md:text-label max-md:text-fg-muted">{d.nota}</span></span>
                  <span className="ml-auto whitespace-nowrap text-right tabular-nums text-fg-muted">
                    <span className={cn('font-semibold', d.tom === 'loss' && d.valor ? 'text-loss' : d.tom === 'gain' && d.valor ? 'text-gain' : 'text-fg')}>{fmtNum(d.valor)}</span>
                    {t.recebidos > 0 && <> · {fmtPct(pct(d.valor, t.recebidos) ?? 0, 0)}</>}
                  </span>
                </div>
                <div className="bar-track mt-1 h-2" aria-hidden><div className="bar-fill" style={{ width: `${t.recebidos ? Math.min(100, (d.valor / t.recebidos) * 100) : 0}%` }} /></div>
              </li>
            ))}
          </ol>
          <Link href={`/leads?mes=${mesInput(mesRef)}`} className={buttonClasses('secondary', 'md', 'mt-4 h-11 w-full md:hidden')}>ver os leads do mês</Link>
        </Panel>
      </div>

      {/* celular: o gráfico por dia vai para o fim, recolhido (o mesmo dado, com os nomes, está na aba Calendário) */}
      <RecolheNoCelular className="max-md:order-last" titulo="Ganhos por dia" resumo="leads ganhos e contas abertas em cada dia">
        <Panel title={<span className="max-md:hidden">Ganhos por dia · {mesLongo(mesRef)}</span>}
          subtitle={<span className="max-md:hidden">{`Leads fechados como Ganho e contas abertas na corretora em cada dia · ${fmtNum(ganhosDias.reduce((acc, d) => acc + d.ganhos, 0))} ganhos no mês até aqui.`}</span>}>
          {ganhosDias.length === 0
            ? <p className="py-10 text-center text-dense text-fg-subtle">Sem dias no período: a série diária cobre os últimos 12 meses.</p>
            : <GanhosDoMes dias={ganhosDias} ganhos={ganhosMes} hoje={hoje} />}
        </Panel>
      </RecolheNoCelular>

      <Panel title={<>Receita de {mes} por tipo de cliente<DicaNoTitulo texto={EXPLICA_RECEITA} /></>} subtitle={<span className="max-md:hidden">{EXPLICA_RECEITA}</span>}>
        <MaisNumeros>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense tbl-lista" style={LISTA_LARGA}>
              <thead>
                {grupos.length > 1 && (
                  <tr>
                    <th></th>
                    {grupos.map(g => <th key={g.chave} colSpan={3} className={cn('text-center', g.chave !== 'total' && 'col-p2')}>{g.label}</th>)}
                    <th className="col-p3"></th>
                  </tr>
                )}
                <tr>
                  <th>Tipo</th>
                  {grupos.map(g => { const so = g.chave !== 'total' && 'col-p2'; return <Fragment key={g.chave}><th className={cn('num', so)}>Contas</th><th className="num col-p2">Lotes</th><th className={cn('num', so)}>Receita</th></Fragment> })}
                  <th className="num col-p3">% da receita</th>
                </tr>
              </thead>
              <tbody>
                {tipos.map(tp => {
                  const doTipo = tp.de(r)
                  return (
                    <tr key={tp.chave}>
                      <td className="cel-titulo whitespace-nowrap font-medium">
                        {tp.nome}
                        <span className="ml-2 text-micro font-normal text-fg-subtle max-md:ml-0 max-md:block max-md:text-label max-md:text-fg-muted">
                          <span className="md:hidden">{plural(doTipo.contas, 'conta', 'contas')} · </span>{tp.nota}
                        </span>
                      </td>
                      {grupos.map(g => celulas(g, tp.de(g.r)))}
                      <td className={cn('num col-p3', !doTipo.receita && 'subtle', celMais(doTipo.receita > 0 && r.receita_total > 0))}>
                        {r.receita_total ? fmtPct(pct(doTipo.receita, r.receita_total) ?? 0, 0) : TRACO}<span className="md:hidden"> da receita do mês</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="total">
                  <td className="cel-titulo">Receita do mês<span className="block text-label font-normal text-fg-muted md:hidden">{plural(operaram(r), 'conta', 'contas')}</span></td>
                  {grupos.map(g => celulas(g, { contas: operaram(g.r), lotes: g.r.lotes_total, receita: g.r.receita_total }, true))}
                  <td className="num col-p3">{r.receita_total ? '100%' : TRACO}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </MaisNumeros>
      </Panel>

      <p className="text-dense text-fg-muted max-md:hidden">
        {emAberto}{' '}
        <Link href="/fila" className="link">Abrir a Minha fila</Link> · <Link href="/leads?alerta=1" className="link">ver na tela de Leads</Link>
      </p>
    </>
  )
}
