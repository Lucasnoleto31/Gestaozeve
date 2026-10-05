export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { funilMensal, funilPor, leadsLista } from '@/lib/gestao/consultas'
import { janelaMeses, mesAtual, mesCurto, parseMes } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { MesPicker } from '@/components/gestao/Filtros'
import { LinhaVazia, Secao, StatusLeadBadge, TRACO, dataCurta, n0, p1 } from '@/components/gestao/Celulas'
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

  type Linha = { label: string; valor: (x: typeof mensal[number] | undefined) => number | null; fmt: (v: number | null) => string; total?: number | null; destaque?: 'sub' | 'bold' | 'success' | 'danger' }
  const nn = (v: number | null) => (v == null ? TRACO : n0(v))
  const pp = (v: number | null) => (v == null ? TRACO : p1(v))
  const linhas: Linha[] = [
    { label: 'Leads recebidos no mês', valor: x => x?.recebidos ?? null, fmt: nn, total: recebidos, destaque: 'bold' },
    { label: 'dos quais já eram clientes (base)', valor: x => x?.ja_clientes ?? null, fmt: nn, total: tot('ja_clientes'), destaque: 'sub' },
    { label: 'Ganhos no mês (pela data do fechamento)', valor: x => x?.ganhos ?? null, fmt: nn, total: ganhos, destaque: 'success' },
    { label: 'Perdidos no mês (pela data do fechamento)', valor: x => x?.perdidos ?? null, fmt: nn, total: perdidos, destaque: 'danger' },
    { label: 'Em aberto ao fim do mês (acumulado)', valor: x => x?.abertos_acumulado ?? null, fmt: nn, total: mensal[mensal.length - 1]?.abertos_acumulado ?? null },
    { label: 'Taxa de ganho = ganhos ÷ (ganhos + perdidos)', valor: x => (x && x.ganhos + x.perdidos ? (x.ganhos / (x.ganhos + x.perdidos)) * 100 : null), fmt: pp, total: ganhos + perdidos ? (ganhos / (ganhos + perdidos)) * 100 : null },
    { label: 'Safra do mês: já ganhos', valor: x => x?.safra_ganhos ?? null, fmt: nn, total: safraGanhos, destaque: 'sub' },
    { label: 'Safra do mês: já perdidos', valor: x => x?.safra_perdidos ?? null, fmt: nn, total: tot('safra_perdidos'), destaque: 'sub' },
    { label: 'Safra do mês: ainda em aberto', valor: x => x?.safra_abertos ?? null, fmt: nn, total: tot('safra_abertos'), destaque: 'sub' },
    { label: 'Safra do mês: conversão = ganhos ÷ leads do mês', valor: x => (x && x.recebidos ? (x.safra_ganhos / x.recebidos) * 100 : null), fmt: pp, total: recebidos ? (safraGanhos / recebidos) * 100 : null, destaque: 'sub' },
    { label: 'Tempo médio até fechar (dias)', valor: x => x?.dias_fechar ?? null, fmt: v => (v == null ? TRACO : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })), total: null },
  ]
  const grafico = meses.map(x => ({ label: mesCurto(x), recebidos: m.get(x)?.recebidos ?? 0, ganhos: m.get(x)?.ganhos ?? 0, perdidos: m.get(x)?.perdidos ?? 0, abertos: m.get(x)?.abertos_acumulado ?? 0 }))

  return (
    <>
      <PageHeader
        eyebrow="Leads · todas as corretoras"
        title="Funil de leads"
        description={<>Como ler: a seção 1 mostra o funil mês a mês; 2 e 3 comparam responsáveis e origens; 4 é a lista de ação (leads abertos sem contato). Tudo vem da tela de <Link href="/leads" className="link">Leads</Link>; nada é digitado aqui.</>}
        actions={<MesPicker valor={mesRef} label="Janela até" />}
      />
      <PageBody>
        <KpiRow cols={5}>
          <KpiCard label="Leads recebidos (12 m)" value={fmtNum(recebidos)} sub={`${fmtNum(tot('ja_clientes'))} já eram clientes`} />
          <KpiCard label="Ganhos (12 m)" value={fmtNum(ganhos)} sub={ganhos + perdidos ? `taxa de ganho ${fmtPct((ganhos / (ganhos + perdidos)) * 100, 0)}` : 'nenhum fechado'} tone="success" />
          <KpiCard label="Perdidos (12 m)" value={fmtNum(perdidos)} tone="danger" />
          <KpiCard label="Em aberto hoje" value={fmtNum(leads.filter(l => l.tipo_status === 'Aberto').length)} sub={`${fmtNum(leads.filter(l => l.alerta).length)} com alerta de contato`} tone="warning" />
          <KpiCard label="Conversão da janela" value={recebidos ? fmtPct((safraGanhos / recebidos) * 100, 1) : TRACO} sub="ganhos ÷ leads recebidos" tone="info" />
        </KpiRow>

        <Panel title="Leads por mês" subtitle="Recebidos, ganhos e perdidos (pela data do fechamento) e em aberto acumulado.">
          <GraficoSeries dados={grafico} series={[{ key: 'recebidos', nome: 'Recebidos', tipo: 'bar' }, { key: 'ganhos', nome: 'Ganhos', tipo: 'bar', cor: 'success' }, { key: 'perdidos', nome: 'Perdidos', tipo: 'bar', cor: 'danger' }, { key: 'abertos', nome: 'Em aberto (acum.)', tipo: 'line', eixo: 'dir' }]} formatoDir="num" altura={240} />
        </Panel>

        <Panel flush>
          <div className="px-5 pt-4"><Secao numero={1} titulo="Funil mensal" descricao={`Janela de 12 meses, de ${mesCurto(meses[0])} a ${mesCurto(mesRef)}.`} /></div>
          <div className="tbl-wrap rounded-none border-0 border-t border-line">
            <table className="tbl tbl-dense">
              <thead><tr><th className="sticky-col min-w-[280px]">Indicador</th>{meses.map(x => <th key={x} className={`num ${x === mesRef ? 'text-accent' : ''}`}>{mesCurto(x)}</th>)}<th className="num">Total 12 m</th></tr></thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.label}>
                    <td className={`sticky-col ${l.destaque === 'sub' ? 'pl-6 text-fg-muted' : ''} ${l.destaque === 'bold' ? 'font-semibold' : ''} ${l.destaque === 'success' ? 'text-success' : ''} ${l.destaque === 'danger' ? 'text-danger' : ''}`}>{l.label}</td>
                    {meses.map(x => { const v = l.valor(m.get(x)); return <td key={x} className={`num ${!v ? 'subtle' : ''} ${l.destaque === 'success' && v ? 'text-success' : ''} ${l.destaque === 'danger' && v ? 'text-danger' : ''}`}>{l.fmt(v)}</td> })}
                    <td className="num font-semibold">{l.total == null ? '' : l.fmt(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <TabelaPor numero={2} titulo="Por responsável" descricao="Leads atribuídos a cada pessoa na janela · (sem responsável) = coluna Responsável em branco." dados={porResp} />
        <TabelaPor numero={3} titulo="Por origem / parceiro" descricao="De onde vêm os leads e como convertem." dados={porOrigem} />

        <Panel flush>
          <div className="px-5 pt-4"><Secao numero={4} titulo="Lista de ação · leads abertos sem contato" descricao="Mais tempo sem contato primeiro. Clique no nome para abrir na tela de Leads." action={<Link href="/leads?alerta=1" className="text-xs font-medium text-accent hover:underline">ver todos na tela de Leads</Link>} /></div>
          <div className="tbl-wrap max-h-[480px] rounded-none border-0 border-t border-line">
            <table className="tbl tbl-dense">
              <thead><tr><th>Nome</th><th>WhatsApp</th><th>Responsável</th><th>Status</th><th>Recebido</th><th>Último contato</th><th className="num">Dias</th><th>Opera em</th></tr></thead>
              <tbody>
                {acao.length === 0 && <LinhaVazia colunas={8}>Nenhum lead aberto com alerta. 👍</LinhaVazia>}
                {acao.map(l => (
                  <tr key={l.id}>
                    <td className="font-medium"><Link href={`/leads?busca=${encodeURIComponent(l.nome)}`} className="link">{l.nome}</Link></td>
                    <td className="num">{l.whatsapp ?? TRACO}</td>
                    <td className="muted">{l.responsavel ?? TRACO}</td>
                    <td><StatusLeadBadge status={l.status} tipo={l.tipo_status} /></td>
                    <td className="num">{dataCurta(l.data_hora.slice(0, 10))}</td>
                    <td className="num">{dataCurta(l.ultimo_contato)}</td>
                    <td className="num font-semibold text-warning">{l.dias ?? TRACO}</td>
                    <td className="muted">{l.corretora ?? TRACO}</td>
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

function TabelaPor({ titulo, descricao, dados, numero }: { titulo: string; descricao: string; dados: FunilPorRow[]; numero: number }) {
  return (
    <Panel flush>
      <div className="px-5 pt-4"><Secao numero={numero} titulo={titulo} descricao={descricao} /></div>
      <div className="tbl-wrap rounded-none border-0 border-t border-line">
        <table className="tbl tbl-dense">
          <thead><tr><th>Grupo</th><th className="num">Leads</th><th className="num">Já clientes</th><th className="num">Em aberto</th><th className="num">Ganhos</th><th className="num">Perdidos</th><th className="num">Taxa de ganho</th><th className="num">Conversão</th><th className="num">Dias p/ fechar</th><th className="num">Com alerta</th></tr></thead>
          <tbody>
            {dados.length === 0 && <LinhaVazia colunas={10}>Sem leads na janela.</LinhaVazia>}
            {dados.map(g => (
              <tr key={g.grupo}>
                <td className="font-medium">{g.grupo}</td><td className="num">{n0(g.leads)}</td><td className="num">{n0(g.ja_clientes)}</td><td className="num">{n0(g.abertos)}</td>
                <td className="num text-success">{n0(g.ganhos)}</td><td className="num text-danger">{n0(g.perdidos)}</td>
                <td className="num">{g.ganhos + g.perdidos ? fmtPct(g.taxa_ganho, 0) : TRACO}</td><td className="num">{g.leads ? fmtPct(g.conversao, 0) : TRACO}</td>
                <td className="num">{g.dias_fechar ?? TRACO}</td><td className={`num ${g.com_alerta ? 'text-warning' : 'subtle'}`}>{n0(g.com_alerta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
