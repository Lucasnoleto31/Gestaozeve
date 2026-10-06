export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { funilMensal, funilPor, leadsLista } from '@/lib/gestao/consultas'
import { janelaMeses, mesAtual, mesCurto, parseMes } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { MesPicker } from '@/components/gestao/Filtros'
import { LinhaVazia, StatusLeadBadge, TRACO, dataCurta, n0, p1 } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import type { FunilPorRow } from '@/lib/gestao/tipos'

export default async function FunilPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'vendedor')) redirect('/dashboard')
  const sp = await searchParams
  const mesRef = parseMes(typeof sp.mes === 'string' ? sp.mes : null) ?? mesAtual()
  const meses = janelaMeses(mesRef, 12)
  const [mensal, porResp, porOrigem, leads] = await Promise.all([funilMensal(mesRef, 12), funilPor('responsavel', mesRef, 12), funilPor('origem', mesRef, 12), leadsLista()])
  const m = new Map(mensal.map(x => [x.mes_ref, x]))
  const tot = (k: keyof typeof mensal[number]) => mensal.reduce((s, x) => s + (Number(x[k]) || 0), 0)
  const recebidos = tot('recebidos'), ganhos = tot('ganhos'), perdidos = tot('perdidos'), safraGanhos = tot('safra_ganhos')
  const acao = leads.filter(l => l.alerta).sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0)).slice(0, 40)
  const colMes = (i: number) => (i < meses.length - 4 ? 'col-p2' : '')

  type Linha = { label: string; valor: (x: typeof mensal[number] | undefined) => number | null; fmt: (v: number | null) => string; total?: number | null; destaque?: 'sub' | 'bold' | 'gain' | 'loss' }
  const nn = (v: number | null) => (v == null ? TRACO : n0(v))
  const pp = (v: number | null) => (v == null ? TRACO : p1(v))
  const linhas: Linha[] = [
    { label: 'Leads recebidos', valor: x => x?.recebidos ?? null, fmt: nn, total: recebidos, destaque: 'bold' },
    { label: 'dos quais já eram clientes', valor: x => x?.ja_clientes ?? null, fmt: nn, total: tot('ja_clientes'), destaque: 'sub' },
    { label: 'Ganhos (data do fechamento)', valor: x => x?.ganhos ?? null, fmt: nn, total: ganhos, destaque: 'gain' },
    { label: 'Perdidos (data do fechamento)', valor: x => x?.perdidos ?? null, fmt: nn, total: perdidos, destaque: 'loss' },
    { label: 'Em aberto ao fim do mês', valor: x => x?.abertos_acumulado ?? null, fmt: nn, total: mensal[mensal.length - 1]?.abertos_acumulado ?? null },
    { label: 'Taxa de ganho (ganhos ÷ fechados)', valor: x => (x && x.ganhos + x.perdidos ? (x.ganhos / (x.ganhos + x.perdidos)) * 100 : null), fmt: pp, total: ganhos + perdidos ? (ganhos / (ganhos + perdidos)) * 100 : null },
    { label: 'Safra: já ganhos', valor: x => x?.safra_ganhos ?? null, fmt: nn, total: safraGanhos, destaque: 'sub' },
    { label: 'Safra: já perdidos', valor: x => x?.safra_perdidos ?? null, fmt: nn, total: tot('safra_perdidos'), destaque: 'sub' },
    { label: 'Safra: ainda em aberto', valor: x => x?.safra_abertos ?? null, fmt: nn, total: tot('safra_abertos'), destaque: 'sub' },
    { label: 'Safra: conversão (ganhos ÷ recebidos)', valor: x => (x && x.recebidos ? (x.safra_ganhos / x.recebidos) * 100 : null), fmt: pp, total: recebidos ? (safraGanhos / recebidos) * 100 : null, destaque: 'sub' },
    { label: 'Tempo médio até fechar (dias)', valor: x => x?.dias_fechar ?? null, fmt: v => (v == null ? TRACO : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })), total: null },
  ]
  const grafico = meses.map(x => ({ label: mesCurto(x), recebidos: m.get(x)?.recebidos ?? 0, ganhos: m.get(x)?.ganhos ?? 0, perdidos: m.get(x)?.perdidos ?? 0, abertos: m.get(x)?.abertos_acumulado ?? 0 }))

  return (
    <>
      <PageHeader
        eyebrow="Leads · todas as corretoras"
        title="Funil"
        description={<>Mês a mês, por responsável e por origem; no fim, a lista de ação. Tudo vem da tela de <Link href="/leads" className="link">Leads</Link>.</>}
        actions={<MesPicker valor={mesRef} label="Janela até" />}
      />
      <PageBody>
        <KpiRow cols={5}>
          <KpiCard label="Recebidos (12 m)" value={fmtNum(recebidos)} sub={`${fmtNum(tot('ja_clientes'))} já eram clientes`} />
          <KpiCard label="Ganhos (12 m)" value={fmtNum(ganhos)} sub={ganhos + perdidos ? `taxa de ganho ${fmtPct((ganhos / (ganhos + perdidos)) * 100, 0)}` : 'nenhum fechado'} tone={ganhos ? 'gain' : 'neutral'} />
          <KpiCard label="Perdidos (12 m)" value={fmtNum(perdidos)} tone={perdidos ? 'loss' : 'neutral'} />
          <KpiCard label="Em aberto hoje" value={fmtNum(leads.filter(l => l.tipo_status === 'Aberto').length)} sub={`${fmtNum(leads.filter(l => l.alerta).length)} com alerta de contato`} />
          <KpiCard label="Conversão da janela" value={recebidos ? fmtPct((safraGanhos / recebidos) * 100, 1) : TRACO} sub="ganhos ÷ recebidos" />
        </KpiRow>

        <Panel title="Leads por mês" subtitle="Recebidos, ganhos, perdidos e em aberto acumulado.">
          <GraficoSeries dados={grafico} series={[{ key: 'recebidos', nome: 'Recebidos', tipo: 'bar' }, { key: 'ganhos', nome: 'Ganhos', tipo: 'bar', cor: 'gain' }, { key: 'perdidos', nome: 'Perdidos', tipo: 'bar', cor: 'loss' }, { key: 'abertos', nome: 'Em aberto (acum.)', tipo: 'line', eixo: 'dir' }]} formatoDir="num" altura={260} />
        </Panel>

        <Panel title="Funil mensal" subtitle={`De ${mesCurto(meses[0])} a ${mesCurto(mesRef)}.`}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead><tr><th className="sticky-col min-w-[200px]">Indicador</th>{meses.map((x, i) => <th key={x} className={cn('num', colMes(i), x === mesRef && 'text-fg')}>{mesCurto(x)}</th>)}<th className="num">12 m</th></tr></thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.label}>
                    <td className={cn('sticky-col', l.destaque === 'sub' && 'pl-6 text-fg-muted', l.destaque === 'bold' && 'font-semibold', l.destaque === 'gain' && 'text-gain', l.destaque === 'loss' && 'text-loss')}>{l.label}</td>
                    {meses.map((x, i) => { const v = l.valor(m.get(x)); return <td key={x} className={cn('num', colMes(i), !v && 'subtle', l.destaque === 'gain' && v && 'text-gain', l.destaque === 'loss' && v && 'text-loss')}>{l.fmt(v)}</td> })}
                    <td className="num font-semibold">{l.total == null ? '' : l.fmt(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <TabelaPor titulo="Por responsável" descricao="Leads atribuídos a cada pessoa na janela." dados={porResp} />
        <TabelaPor titulo="Por origem" descricao="De onde vêm os leads e como convertem." dados={porOrigem} />

        <Panel title="Lista de ação" subtitle="Leads abertos sem contato · mais tempo primeiro." action={<Link href="/leads?alerta=1" className="link text-label">ver todos na tela de Leads</Link>}>
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

function TabelaPor({ titulo, descricao, dados }: { titulo: string; descricao: string; dados: FunilPorRow[] }) {
  return (
    <Panel title={titulo} subtitle={descricao}>
      <div className="tbl-wrap">
        <table className="tbl tbl-dense">
          <thead><tr><th>Grupo</th><th className="num">Leads</th><th className="num col-p2">Já clientes</th><th className="num">Em aberto</th><th className="num">Ganhos</th><th className="num">Perdidos</th><th className="num col-p2">Taxa de ganho</th><th className="num col-p2">Conversão</th><th className="num col-p3">Dias p/ fechar</th><th className="num col-p3">Com alerta</th></tr></thead>
          <tbody>
            {dados.length === 0 && <LinhaVazia colunas={10}>Sem leads na janela.</LinhaVazia>}
            {dados.map(g => (
              <tr key={g.grupo}>
                <td className="font-medium">{g.grupo}</td><td className="num">{n0(g.leads)}</td><td className="num col-p2">{n0(g.ja_clientes)}</td><td className="num">{n0(g.abertos)}</td>
                <td className={cn('num', g.ganhos && 'text-gain')}>{n0(g.ganhos)}</td><td className={cn('num', g.perdidos && 'text-loss')}>{n0(g.perdidos)}</td>
                <td className="num col-p2">{g.ganhos + g.perdidos ? fmtPct(g.taxa_ganho, 0) : TRACO}</td><td className="num col-p2">{g.leads ? fmtPct(g.conversao, 0) : TRACO}</td>
                <td className="num col-p3">{g.dias_fechar ?? TRACO}</td><td className={cn('num col-p3', g.com_alerta ? 'text-warn' : 'subtle')}>{n0(g.com_alerta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
