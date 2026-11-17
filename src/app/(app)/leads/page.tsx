export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { CHAVES_FILTRO_LEADS, COOKIE_FILTROS_LEADS, filtrosIniciais } from '@/lib/filtrosLista'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { assessoresPorCorretora, leadsLista, parametroGeral, responsaveisAtivos, statusLeadLista } from '@/lib/gestao/consultas'
import { opcoesOrigem as lerOpcoesOrigem } from '@/lib/gestao/consultasOrigens'
import { COOKIE_VISAO_LEADS, visaoLeads } from '@/lib/gestao/leadsTela'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { corretorasDoPerfil } from '@/lib/corretoras'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { TabelaLeads } from './TabelaLeads'
import { compactar } from '@/lib/compacto'
import { CAMPOS_LEAD } from '@/lib/gestao/tipos'
import { AcoesLeads } from './AcoesLeads'
import { mesmaPessoa } from '@/lib/texto'

// Leads: quem eu preciso chamar agora e em que pé está cada lead. A frase, os cartões, as abas por etapa e
// a tabela ficam em TabelaLeads (os cartões filtram a lista). Redesenho de nov/26: a faixa de ganhos por
// dia e os números de análise (total, perdidos e motivo mais comum, já eram clientes, contatos até ganhar)
// saíram daqui e estão na tela Funil. Os filtros do endereço, o clique na linha, as ações da linha e os
// botões do formulário continuam iguais: a tela é usada por automações diárias.
export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'vendedor' && profile.role !== 'atendente')) redirect('/dashboard')
  const sp = await searchParams
  const [leads, responsaveis, status, diasAlertaTxt, assessores, opcoesOrigem] = await Promise.all([
    leadsLista(), responsaveisAtivos(), statusLeadLista(), parametroGeral('dias_alerta_lead', '7'), assessoresPorCorretora(), lerOpcoesOrigem(corretorasDoPerfil(profile)),
  ])
  const hoje = fmtDate(hojeBrasil())
  const diasAlerta = Math.max(1, Number(diasAlertaTxt) || 7)
  // Atendente: só os próprios leads (o filtro é no servidor, em leadsLista) e só o próprio nome nas listas de responsável
  const restrito = profile.role === 'atendente'
  const meuNome = restrito ? responsaveis.filter(r => mesmaPessoa(r.nome, profile.nome)).map(r => r.nome) : null
  const nomesLeads = meuNome ?? responsaveis.filter(r => r.atende_leads).map(r => r.nome)
  const nomesClientes = meuNome ?? responsaveis.filter(r => r.atende_clientes).map(r => r.nome)

  // filtros da tabela: os do endereço; sem nenhum no endereço (menu, volta da ficha), os últimos usados
  const guardados = await cookies()
  const daUrl: Record<string, string> = {}
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string') daUrl[k] = v
  const fi = filtrosIniciais(daUrl, guardados.get(COOKIE_FILTROS_LEADS)?.value, CHAVES_FILTRO_LEADS)

  return (
    <>
      <PageHeader
        eyebrow="Leads · todas as corretoras"
        title="Leads"
        description={restrito ? undefined : <>Ganhos por dia, perdas e de onde vêm os leads estão no <Link href="/funil" className="link">Funil</Link>; o mês dia a dia, no <Link href="/funil?aba=calendario" className="link">Calendário</Link>.</>}
        actions={<AcoesLeads responsaveis={nomesLeads} status={status} admin={profile.role === 'admin'} opcoesOrigem={opcoesOrigem} />}
      />
      <PageBody>
        <TabelaLeads
          leads={compactar(leads, CAMPOS_LEAD)}
          responsaveis={nomesLeads}
          responsaveisClientes={nomesClientes}
          status={status}
          admin={profile.role === 'admin'}
          corretoras={corretorasDoPerfil(profile)}
          assessores={assessores}
          hoje={hoje}
          usuario={profile.nome}
          filtrosSalvos={fi}
          diasAlerta={diasAlerta}
          opcoesOrigem={opcoesOrigem}
          restrito={restrito}
          visaoInicial={visaoLeads(guardados.get(COOKIE_VISAO_LEADS)?.value)}
        />
      </PageBody>
    </>
  )
}
