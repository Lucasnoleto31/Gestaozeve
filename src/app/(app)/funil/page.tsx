export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { contatosParaResumo, funilMensal, funilSafra, funilSafraPor, leadsDiario, leadsResumo } from '@/lib/gestao/consultas'
import { fmtMedia, resumoContatosPorAtendente, somaUltimos, type ResumoAtendente } from '@/lib/gestao/contatos'
import { janelaMeses, mesAtual, mesCurto, mesInput, mesLongo, parseMes, somarMeses } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Alert } from '@/components/ui/Alert'
import { MesPicker, SegParam } from '@/components/gestao/Filtros'
import { LinhaVazia, StatusLeadBadge, TRACO, dataCurta, n0, p1, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import type { FunilSafraBase, FunilSafraPorRow } from '@/lib/gestao/tipos'

const pct = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : null)

// Vocabulário do escritório: tombou = virou cliente (abriu a conta); ativado = operou
export default async function FunilPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'vendedor')) redirect('/dashboard')
  const sp = await searchParams
  const mesRef = parseMes(typeof sp.mes === 'string' ? sp.mes : null) ?? mesAtual()
  // Período: só os leads que entraram no mês escolhido (padrão) ou os 12 meses até ele
  const periodo: 'mes' | '12m' = sp.periodo === '12m' ? '12m' : 'mes'
  const soMes = periodo === 'mes'
  const meses = janelaMeses(mesRef, 12)
  const [mensal, safra, porResp, porOrigem, leads, diario, dadosContatos] = await Promise.all([
    funilMensal(mesRef, 12), funilSafra(mesRef, 12), funilSafraPor('responsavel', mesRef, soMes ? 1 : 12), funilSafraPor('origem', mesRef, soMes ? 1 : 12), leadsResumo(40), leadsDiario(30),
    contatosParaResumo(),
  ])
  // contatos realizados no período (pela data do contato), por responsável do lead
  const contatosAt = resumoContatosPorAtendente(dadosContatos.contatos, dadosContatos.leads, soMes ? mesRef : meses[0], somarMeses(mesRef, 1))
  const m = new Map(mensal.map(x => [x.mes_ref, x]))
  const s = new Map(safra.map(x => [x.mes_ref, x]))
  const semSafra = safra.length === 0 && leads.total > 0   // S27 ainda não rodou
  const rotuloPeriodo = soMes ? mesLongo(mesRef) : `${mesCurto(meses[0])} a ${mesCurto(mesRef)}`

  // Totais do período: do que entrou nele, o que aconteceu até hoje
  const base = soMes ? safra.filter(x => x.mes_ref === mesRef) : safra
  const chaves: (keyof FunilSafraBase)[] = ['recebidos', 'contatados', 'perdidos', 'ganhos', 'em_aberto', 'ja_clientes', 'viraram_clientes', 'ativados', 'em_processamento', 'recusaram', 'com_giro', 'lotes', 'receita', 'contatos', 'contatos_ganhos', 'ganhos_contatados', 'em_contato', 'perdidos_funil', 'contas_abertas', 'contas_em_abertura']
  const t = Object.fromEntries(chaves.map(k => [k, base.reduce((acc, x) => acc + x[k], 0)])) as FunilSafraBase
  const jaClientes = t.ja_clientes || (soMes ? m.get(mesRef)?.ja_clientes ?? 0 : mensal.reduce((acc, x) => acc + x.ja_clientes, 0))
  // contatos por lead ganho (S47): só entre os ganhos com contato registrado
  const contatosPorGanho = (x: Pick<FunilSafraBase, 'contatos_ganhos' | 'ganhos_contatados'> | undefined) => (x && x.ganhos_contatados ? x.contatos_ganhos / x.ganhos_contatados : null)
  const abertosHoje = leads.abertos
  const acao = leads.acao
  const colMes = (i: number) => (i < meses.length - 4 ? 'col-p2' : '')

  // Etapas do funil. Quem já era cliente antes de entrar fica fora das etapas.
  const etapas = [
    { nome: 'Entraram', valor: t.recebidos, nota: `${fmtNum(jaClientes)} já eram clientes` },
    { nome: 'Contatados', valor: t.contatados, nota: t.contatos ? `${fmtNum(t.contatos)} contatos registrados${contatosPorGanho(t) != null ? ` · ${fmtMedia(contatosPorGanho(t))} por lead ganho` : ''}` : 'registramos contato ou mudamos o status' },
    { nome: 'Cadastrados', valor: t.viraram_clientes, nota: `${fmtNum(t.ganhos)} marcados como ganho` },
    { nome: 'Tombaram', valor: t.ativados, nota: 'viraram clientes: abriram a conta' },
    { nome: 'Ativados', valor: t.com_giro, nota: 'abriram a conta e operaram' },
  ]
  // Destino de cada lead do período, um só por lead (S50): os quatro somam os que entraram
  const semS50 = t.recebidos > 0 && t.em_contato + t.perdidos_funil + t.contas_abertas + jaClientes === 0
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
    { label: 'Perdidos', valor: x => x?.perdidos ?? null, fmt: nn, total: tudo.perdidos, destaque: 'loss' },
    { label: 'Ainda em aberto', valor: x => x?.em_aberto ?? null, fmt: nn, total: tudo.em_aberto },
    { label: 'Cadastrados (ganhos ou cadastro novo)', valor: x => x?.viraram_clientes ?? null, fmt: nn, total: tudo.viraram_clientes },
    { label: 'marcados como ganho', valor: x => x?.ganhos ?? null, fmt: nn, total: tudo.ganhos, destaque: 'sub' },
    { label: 'Tombaram (abriram a conta)', valor: x => x?.ativados ?? null, fmt: nn, total: tudo.ativados, destaque: 'bold' },
    { label: 'conta em abertura', valor: x => x?.em_processamento ?? null, fmt: nn, total: tudo.em_processamento, destaque: 'sub' },
    { label: 'Recusaram a corretora', valor: x => x?.recusaram ?? null, fmt: nn, total: tudo.recusaram, destaque: 'loss' },
    { label: 'Ativados (operaram)', valor: x => x?.com_giro ?? null, fmt: nn, total: tudo.com_giro, destaque: 'gain' },
    { label: '% tombaram sobre os que entraram', valor: x => (x ? pct(x.ativados, x.recebidos) : null), fmt: pp, total: pct(tudo.ativados, tudo.recebidos), destaque: 'sub' },
    { label: '% ativados sobre os que tombaram', valor: x => (x ? pct(x.com_giro, x.ativados) : null), fmt: pp, total: pct(tudo.com_giro, tudo.ativados), destaque: 'sub' },
    { label: 'Lotes operados pelos ativados', valor: x => x?.lotes ?? null, fmt: nn, total: tudo.lotes },
    { label: 'Receita deixada para o escritório', valor: x => x?.receita ?? null, fmt: rr, total: tudo.receita, destaque: 'gain' },
  ]
  const grafico = meses.map(x => ({ label: mesCurto(x), entraram: s.get(x)?.recebidos ?? m.get(x)?.recebidos ?? 0, tombaram: s.get(x)?.ativados ?? 0, ativados: s.get(x)?.com_giro ?? 0, perdidos: s.get(x)?.perdidos ?? 0 }))

  return (
    <>
      <PageHeader
        eyebrow="Leads · todas as corretoras"
        title="Funil"
        description={<>Do que entrou no período, o que aconteceu até hoje: contato, cadastro, conta aberta (tombou), operação (ativou), giro e receita. Tudo vem da tela de <Link href="/leads" className="link">Leads</Link> e do vínculo com o cadastro de clientes.</>}
        actions={<>
          <SegParam param="periodo" valor={periodo} opcoes={[{ valor: 'mes', label: 'Só o mês' }, { valor: '12m', label: '12 meses' }]} />
          <MesPicker valor={mesRef} label={soMes ? 'Mês de entrada' : 'Janela até'} />
        </>}
      />
      <PageBody>
        {semSafra && <Alert tone="warn" title="Funil por safra ainda não ativado no banco">Rode os scripts S27 e S28 no Supabase para ver contatados, tombaram, ativados, lotes e receita.</Alert>}

        <KpiRow cols={7}>
          <KpiCard label={`Entraram em ${soMes ? mesCurto(mesRef) : '12 m'}`} value={fmtNum(t.recebidos)} sub={`${fmtNum(jaClientes)} já eram clientes`} />
          <KpiCard label="Contatados" value={fmtNum(t.contatados)} sub={t.recebidos ? `${fmtPct(pct(t.contatados, t.recebidos) ?? 0, 0)} dos que entraram` : undefined} />
          <KpiCard label="Cadastrados" value={fmtNum(t.viraram_clientes)} sub={`${fmtNum(t.ganhos)} marcados como ganho${contatosPorGanho(t) != null ? ` · ${fmtMedia(contatosPorGanho(t))} contatos por ganho` : ''}`} />
          <KpiCard label="Tombaram" value={fmtNum(t.ativados)} sub={`abriram a conta · ${fmtNum(t.em_processamento)} em abertura`} tone={t.ativados ? 'gain' : 'neutral'} />
          <KpiCard label="Ativados" value={fmtNum(t.com_giro)} sub={t.ativados ? `operaram · ${fmtPct(pct(t.com_giro, t.ativados) ?? 0, 0)} dos que tombaram` : 'operaram'} tone={t.com_giro ? 'gain' : 'neutral'} />
          <KpiCard label="Perdidos" value={fmtNum(t.perdidos)} sub={`${fmtNum(t.recusaram)} recusaram a corretora`} tone={t.perdidos || t.recusaram ? 'loss' : 'neutral'} />
          <KpiCard label="Receita dos ativados" value={rCurto(t.receita)} sub={`${fmtNum(t.lotes)} lotes operados`} tone={t.receita ? 'gain' : 'neutral'} />
        </KpiRow>

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

        <Panel title="Leads por mês" subtitle="Por mês de entrada: entraram, tombaram (abriram a conta), ativados (operaram) e perdidos.">
          <GraficoSeries dados={grafico} series={[{ key: 'entraram', nome: 'Entraram', tipo: 'bar' }, { key: 'tombaram', nome: 'Tombaram', tipo: 'bar', cor: 'neutral' }, { key: 'ativados', nome: 'Ativados', tipo: 'bar', cor: 'gain' }, { key: 'perdidos', nome: 'Perdidos', tipo: 'bar', cor: 'loss' }]} altura={260} />
        </Panel>

        <Panel title="Últimos 30 dias" subtitle={`Por dia: leads que entraram, contatos registrados e leads ganhos (clientes trazidos). ${fmtNum(somaUltimos(diario, 7, 'ganhos'))} ganhos nos últimos 7 dias, ${fmtNum(somaUltimos(diario, 30, 'ganhos'))} em 30.`}>
          <GraficoSeries dados={diario.map(d => ({ label: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}`, entraram: d.entraram, contatos: d.contatos, ganhos: d.ganhos }))}
            series={[{ key: 'entraram', nome: 'Entraram', tipo: 'bar' }, { key: 'ganhos', nome: 'Ganhos', tipo: 'bar', cor: 'gain' }, { key: 'contatos', nome: 'Contatos', tipo: 'line', cor: 'neutral' }]} altura={220} />
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

        <Panel title="Lista de ação" subtitle="Leads abertos sem contato, de qualquer mês · mais tempo primeiro." action={<Link href="/leads?alerta=1" className="link text-label">ver todos na tela de Leads</Link>}>
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
        </Panel>
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

function TabelaSafra({ titulo, descricao, dados }: { titulo: string; descricao: string; dados: FunilSafraPorRow[] }) {
  return (
    <Panel title={titulo} subtitle={descricao}>
      <div className="tbl-wrap">
        <table className="tbl tbl-dense">
          <thead>
            <tr>
              <th>Grupo</th><th className="num">Entraram</th><th className="num col-p3">Já clientes</th><th className="num col-p2">Contatados</th><th className="num col-p2">Contatos/ganho</th><th className="num">Perdidos</th><th className="num col-p3">Em aberto</th>
              <th className="num col-p2">Cadastrados</th><th className="num">Tombaram</th><th className="num col-p2">Recusaram</th><th className="num">Ativados</th><th className="num col-p2">% tombaram</th><th className="num col-p3">Lotes</th><th className="num">Receita</th>
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
                <td className={cn('num', g.perdidos && 'text-loss')}>{n0(g.perdidos)}</td>
                <td className="num col-p3">{n0(g.em_aberto)}</td>
                <td className="num col-p2">{n0(g.viraram_clientes)}</td>
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
