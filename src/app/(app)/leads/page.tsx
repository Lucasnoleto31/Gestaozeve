export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { assessoresPorCorretora, leadsLista, parametroGeral, responsaveisAtivos, statusLeadLista } from '@/lib/gestao/consultas'
import { mesAtual, parseMes } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil, mesBrasil } from '@/lib/periodo'
import { corretorasDoPerfil } from '@/lib/corretoras'
import { fmtNum, fmtPct } from '@/lib/format'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { TRACO } from '@/components/gestao/Celulas'
import { TabelaLeads } from './TabelaLeads'
import { AcoesLeads } from './AcoesLeads'

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'vendedor')) redirect('/dashboard')
  const sp = await searchParams
  const [leads, responsaveis, status, diasAlerta, assessores] = await Promise.all([
    leadsLista(), responsaveisAtivos(), statusLeadLista(), parametroGeral('dias_alerta_lead', '7'), assessoresPorCorretora(),
  ])

  const mes = mesAtual().slice(0, 7)
  const nesteMes = leads.filter(l => mesBrasil(l.data_hora) === mes).length
  const abertos = leads.filter(l => l.tipo_status === 'Aberto')
  const comAlerta = abertos.filter(l => l.alerta).length
  const ganhos = leads.filter(l => l.status === 'Ganho')
  const perdidos = leads.filter(l => l.status === 'Perdido')
  const fechados = ganhos.length + perdidos.length
  const jaClientes = leads.filter(l => l.cliente_id).length
  const jaGiraram = leads.filter(l => l.cliente_id && l.girou).length
  const diasFechar = [...ganhos, ...perdidos].filter(l => l.data_fechamento && l.dias != null).map(l => l.dias as number)
  const mediaFechar = diasFechar.length ? diasFechar.reduce((s, d) => s + d, 0) / diasFechar.length : null
  const diasAberto = abertos.filter(l => l.dias != null).map(l => l.dias as number)
  const mediaAberto = diasAberto.length ? diasAberto.reduce((s, d) => s + d, 0) / diasAberto.length : null
  const motivos = new Map<string, number>()
  for (const p of perdidos) if (p.motivo_perda) motivos.set(p.motivo_perda, (motivos.get(p.motivo_perda) ?? 0) + 1)
  const motivoComum = [...motivos.entries()].sort((a, b) => b[1] - a[1])[0]
  const f = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')

  return (
    <>
      <PageHeader
        eyebrow="Leads · todas as corretoras"
        title="Leads"
        description={<>Um lead por linha do formulário; o acompanhamento (origem, responsável, status, contatos) é editado aqui. Sem contato há mais de {diasAlerta} dias vira alerta. Veja o <Link href="/funil" className="link">funil</Link>.</>}
        actions={<AcoesLeads responsaveis={responsaveis.filter(r => r.atende_leads).map(r => r.nome)} status={status} admin={profile.role === 'admin'} />}
      />
      <PageBody>
        <KpiRow cols={6}>
          <KpiCard label="Total de leads" value={fmtNum(leads.length)} sub={`${fmtNum(nesteMes)} neste mês`} />
          <KpiCard label="Em aberto" value={fmtNum(abertos.length)} sub={`${fmtNum(comAlerta)} com alerta de contato`} tone={comAlerta ? 'warn' : 'neutral'} />
          <KpiCard label="Ganhos" value={fmtNum(ganhos.length)} sub={fechados ? `${fmtPct((ganhos.length / fechados) * 100, 0)} dos fechados` : 'nenhum fechado ainda'} />
          <KpiCard label="Perdidos" value={fmtNum(perdidos.length)} sub={motivoComum ? `motivo mais comum: ${motivoComum[0]}` : TRACO} />
          <KpiCard label="Já eram clientes" value={fmtNum(jaClientes)} sub={`${fmtNum(jaGiraram)} já giraram lotes`} />
          <KpiCard label="Tempo até fechar" value={mediaFechar != null ? `${Math.round(mediaFechar)} dias` : TRACO} sub={mediaAberto != null ? `${Math.round(mediaAberto)} dias em aberto (média)` : undefined} />
        </KpiRow>
        <TabelaLeads
          leads={leads}
          responsaveis={responsaveis.filter(r => r.atende_leads).map(r => r.nome)}
          responsaveisClientes={responsaveis.filter(r => r.atende_clientes).map(r => r.nome)}
          status={status}
          admin={profile.role === 'admin'}
          corretoras={corretorasDoPerfil(profile)}
          assessores={assessores}
          hoje={fmtDate(hojeBrasil())}
          filtrosIniciais={{ busca: f('busca'), mes: parseMes(f('mes'))?.slice(0, 7) ?? '', status: f('status'), responsavel: f('responsavel'), origem: f('origem'), corretora: f('corretora'), alerta: f('alerta') === '1', clientes: f('clientes') }}
        />
      </PageBody>
    </>
  )
}
