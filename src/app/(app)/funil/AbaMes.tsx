// Funil › Mês: o que fechou no mês (pela data de cada evento) e onde estão hoje os leads que entraram nele.
import Link from 'next/link'
import { Fragment } from 'react'
import { CORRETORA_LABEL, type Corretora } from '@/lib/corretoras'
import { funilMensal, funilResultado, funilResultadoPorCorretora, funilSafra, leadsDiario, leadsGanhosDoMes, leadsResumo } from '@/lib/gestao/consultas'
import { diasDoMes, fmtMedia } from '@/lib/gestao/contatos'
import { diasEntre, mesCurto, mesInput, mesLongo } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Alert } from '@/components/ui/Alert'
import { TRACO, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { GanhosDoMes } from './GanhosDoMes'
import { MESES_INATIVO, RESULTADO_VAZIO, pct, somaSafra } from './comum'
import type { FunilResultadoRow } from '@/lib/gestao/tipos'

export async function AbaMes({ mesRef, corretoras }: { mesRef: string; corretoras: Corretora[] }) {
  const hoje = fmtDate(hojeBrasil())
  const diasSerie = Math.max(1, Math.min(366, diasEntre(mesRef, hoje) + 1))   // a série diária vai de hoje para trás
  const [resultado, porCorretora, safra, mensal, diario, ganhosMes, leads] = await Promise.all([
    funilResultado(mesRef, 1, MESES_INATIVO), funilResultadoPorCorretora(mesRef, corretoras, MESES_INATIVO), funilSafra(mesRef, 1), funilMensal(mesRef, 1),
    leadsDiario(diasSerie), leadsGanhosDoMes(mesRef), leadsResumo(0),
  ])
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

  return (
    <>
      {resultado.length === 0 && <Alert tone="warn" title="Resultado do mês ainda não ativado no banco">Rode a S51 no Supabase para ver ganhos, perdidos, contas novas, ativados e reativados.</Alert>}

      <KpiRow cols={6}>
        <KpiCard label="Leads que entraram" value={fmtNum(t.recebidos)} sub={jaClientes ? `${fmtNum(jaClientes)} já eram clientes` : `em ${mes}`} />
        <KpiCard label="Ganhos" value={fmtNum(r.ganhos)} sub="leads fechados como Ganho" tone={r.ganhos ? 'gain' : 'neutral'} />
        <KpiCard label="Perdidos" value={fmtNum(r.perdidos)} sub="leads fechados como Perdido" tone={r.perdidos ? 'loss' : 'neutral'} />
        <KpiCard label="Contas novas" value={fmtNum(r.contas_novas)} sub={`${porCorretoraTexto('contas_novas') || 'abertas no mês'} · ${fmtNum(r.novos_operaram)} já operaram`} />
        <KpiCard label="Ativados · reativados" value={`${fmtNum(r.ativados)} · ${fmtNum(r.reativados)}`} sub={`1ª operação · voltaram após ${MESES_INATIVO} meses`} />
        <KpiCard destaque label="Receita nova no mês" value={receitaNova ? rCurto(receitaNova) : 'R$ 0'}
          sub={r.receita_total ? `novos, ativados e reativados · ${fmtPct(pct(receitaNova, r.receita_total) ?? 0, 0)} de ${rCurto(r.receita_total)}` : 'de novos, ativados e reativados'} />
      </KpiRow>

      <div className="grid gap-8 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title={`Leads que entraram em ${mesLongo(mesRef)}`} subtitle="Até onde chegaram até hoje. Quem já era cliente ao entrar fica fora das etapas."
          action={<Link href={`/leads?mes=${mesInput(mesRef)}`} className="link text-label">ver os leads do mês</Link>}>
          <ol className="space-y-3">
            {etapas.map((e, i) => {
              const anterior = i > 0 ? etapas[i - 1].valor : null
              return (
                <li key={e.nome}>
                  <div className="flex items-baseline justify-between gap-3 text-dense">
                    <span className="font-medium">{e.nome}<span className="ml-2 text-micro font-normal text-fg-subtle">{e.nota}</span></span>
                    <span className="whitespace-nowrap tabular-nums text-fg-muted">
                      <span className="font-semibold text-fg">{fmtNum(e.valor)}</span>
                      {i > 0 && t.recebidos > 0 && <> · {fmtPct(pct(e.valor, t.recebidos) ?? 0, 0)} dos que entraram</>}
                      {i > 1 && anterior != null && anterior >= e.valor && anterior > 0 && <span className="text-fg-subtle"> · {fmtPct(pct(e.valor, anterior) ?? 0, 0)} da etapa anterior</span>}
                    </span>
                  </div>
                  <div className="bar-track mt-1 h-2" aria-hidden><div className="bar-fill" style={{ width: `${t.recebidos ? Math.min(100, (e.valor / t.recebidos) * 100) : 0}%`, opacity: 1 - i * 0.18 }} /></div>
                </li>
              )
            })}
          </ol>
        </Panel>
        <Panel title="Onde estão hoje" subtitle="Cada lead do mês em um destino só; os quatro somam os que entraram.">
          <ol className="space-y-3">
            {destinos.map(d => (
              <li key={d.nome}>
                <div className="flex items-baseline justify-between gap-3 text-dense">
                  <span className="font-medium">{d.nome}<span className="ml-2 text-micro font-normal text-fg-subtle">{d.nota}</span></span>
                  <span className="whitespace-nowrap tabular-nums text-fg-muted">
                    <span className={cn('font-semibold', d.tom === 'loss' && d.valor ? 'text-loss' : d.tom === 'gain' && d.valor ? 'text-gain' : 'text-fg')}>{fmtNum(d.valor)}</span>
                    {t.recebidos > 0 && <> · {fmtPct(pct(d.valor, t.recebidos) ?? 0, 0)}</>}
                  </span>
                </div>
                <div className="bar-track mt-1 h-2" aria-hidden><div className="bar-fill" style={{ width: `${t.recebidos ? Math.min(100, (d.valor / t.recebidos) * 100) : 0}%` }} /></div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <Panel title={`Ganhos por dia · ${mesLongo(mesRef)}`} subtitle={`Leads fechados como Ganho e contas abertas na corretora em cada dia · ${fmtNum(ganhosDias.reduce((acc, d) => acc + d.ganhos, 0))} ganhos no mês até aqui.`}>
        {ganhosDias.length === 0
          ? <p className="py-10 text-center text-dense text-fg-subtle">Sem dias no período: a série diária cobre os últimos 12 meses.</p>
          : <GanhosDoMes dias={ganhosDias} ganhos={ganhosMes} hoje={hoje} />}
      </Panel>

      <Panel title={`Receita de ${mes} por tipo de cliente`} subtitle="Cada conta que operou no mês entra em um tipo só. Receita bruta: corretagem, zeragem e avulsas, antes de repasse e impostos.">
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead>
              {grupos.length > 1 && (
                <tr>
                  <th></th>
                  {grupos.map(g => <th key={g.chave} colSpan={3} className="text-center">{g.label}</th>)}
                  <th className="col-p3"></th>
                </tr>
              )}
              <tr>
                <th>Tipo</th>
                {grupos.map(g => <Fragment key={g.chave}><th className="num">Contas</th><th className="num col-p2">Lotes</th><th className="num">Receita</th></Fragment>)}
                <th className="num col-p3">% da receita</th>
              </tr>
            </thead>
            <tbody>
              {tipos.map(tp => (
                <tr key={tp.chave}>
                  <td className="whitespace-nowrap font-medium">{tp.nome}<span className="ml-2 text-micro font-normal text-fg-subtle">{tp.nota}</span></td>
                  {grupos.map(g => { const v = tp.de(g.r); return (
                    <Fragment key={g.chave}>
                      <td className={cn('num', !v.contas && 'subtle')}>{n0(v.contas)}</td>
                      <td className={cn('num col-p2', !v.lotes && 'subtle')}>{n0(v.lotes)}</td>
                      <td className={cn('num', g.chave === 'total' && 'font-semibold', !v.receita && 'subtle')}>{r0(v.receita)}</td>
                    </Fragment>
                  ) })}
                  <td className={cn('num col-p3', !tp.de(r).receita && 'subtle')}>{r.receita_total ? fmtPct(pct(tp.de(r).receita, r.receita_total) ?? 0, 0) : TRACO}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total">
                <td>Receita do mês</td>
                {grupos.map(g => <Fragment key={g.chave}><td className="num">{n0(operaram(g.r))}</td><td className="num col-p2">{n0(g.r.lotes_total)}</td><td className="num">{r0(g.r.receita_total)}</td></Fragment>)}
                <td className="num col-p3">{r.receita_total ? '100%' : TRACO}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      <p className="text-dense text-fg-muted">
        Em aberto hoje, somando todos os meses: <span className="font-semibold tabular-nums text-fg">{fmtNum(leads.abertos)}</span> leads · {fmtNum(leads.com_alerta)} sem contato além do limite.{' '}
        <Link href="/fila" className="link">Abrir a Minha fila</Link> · <Link href="/leads?alerta=1" className="link">ver na tela de Leads</Link>
      </p>
    </>
  )
}
