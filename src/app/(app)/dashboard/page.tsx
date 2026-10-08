export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getProfile } from '@/lib/auth/getProfile'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import { Empty } from '@/components/ui/Skeleton'
import { CORRETORA_SLUG, PAGINAS_CORRETORA, corretorasDoPerfil } from '@/lib/corretoras'
import { leadsResumo, painelKpis } from '@/lib/gestao/consultas'
import { mesCurto } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { dataCurta, rCurto } from '@/components/gestao/Celulas'

function getSaudacao() {
  const h = (new Date().getUTCHours() - 3 + 24) % 24
  if (h >= 18) return 'Boa noite'
  if (h >= 12) return 'Boa tarde'
  return 'Bom dia'
}

export default async function DashboardPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  const equipe = profile.role === 'admin' || profile.role === 'vendedor'
  const firstName = profile.nome.split(' ')[0]
  const visiveis = corretorasDoPerfil(profile)

  const [kpis, leads] = equipe
    ? await Promise.all([Promise.all(visiveis.map(c => painelKpis(c, null))), leadsResumo(0)])
    : [[], null]
  const comAlerta = leads?.com_alerta ?? 0

  return (
    <>
      <PageHeader
        eyebrow="Visão geral"
        title={`${getSaudacao()}, ${firstName}`}
        description={`${visiveis.length === 1 ? "Sua corretora" : visiveis.length === 2 ? "As duas corretoras" : "As três corretoras"} no último mês com lotes de cada uma.`}
      />
      <PageBody>
        {!equipe ? (
          <Empty>Seu perfil não tem acesso ao controle de lotes. Fale com o administrador.</Empty>
        ) : (
          <>
            {visiveis.map((c, i) => {
              const k = kpis[i]
              const slug = CORRETORA_SLUG[c]
              const vazio = !k || (k.clientes_levados === 0 && !k.ultima_data)
              return (
                <Panel
                  key={c}
                  title={<span className="inline-flex items-center gap-2"><CorretoraBadge corretora={c} size="md" /></span>}
                  subtitle={k?.ultima_data ? `Lotes até ${dataCurta(k.ultima_data)} · referência ${mesCurto(k.mes_ref)}` : 'Sem lotes importados'}
                  action={<Link href={`/${slug}/painel`} className="link inline-flex items-center gap-1 text-label">Painel <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>}
                >
                  {vazio ? (
                    <Empty action={<p className="text-dense"><Link href={`/${slug}/parametros`} className="link">Parâmetros</Link> → <Link href={`/${slug}/importar`} className="link">Importar</Link></p>}>
                      Nenhum dado ainda. Comece pelos parâmetros (assessores, tarifas) e depois importe o cadastro de clientes e os lotes.
                    </Empty>
                  ) : (
                    <>
                      <KpiRow cols={6}>
                        <KpiCard label="Clientes levados" value={fmtNum(k.clientes_levados)} sub={`${fmtNum(k.migrados)} migrados · ${k.clientes_levados ? fmtPct((k.migrados / k.clientes_levados) * 100, 0) : '0%'}`} />
                        <KpiCard label="Ativos no mês" value={fmtNum(k.ativos_mes)} sub={`${k.migrados ? fmtPct((k.ativos_mes / k.migrados) * 100) : '0%'} da base migrada`} />
                        <KpiCard label="Lotes no mês" value={fmtNum(k.lotes_mes)} sub={`${fmtNum(k.zerados_mes)} zerados${k.acoes_operacoes_mes ? ` · ${fmtNum(k.acoes_operacoes_mes)} op. de ações` : ''}${k.posicao_mes ? ` · ${fmtNum(k.posicao_mes)} em posição` : ''}`} />
                        <KpiCard destaque={i === 0} label="Receita no mês" value={rCurto(k.receita_mes)} sub={`+ incentivo ${rCurto(k.incentivo_mes)}`} />
                        <KpiCard label="Sem giro · inativos" value={`${fmtNum(k.migrados_sem_giro)} · ${fmtNum(k.inativos)}`} sub="migrados que nunca giraram · pararam" />
                        <KpiCard label="Pendências" value={fmtNum(k.linhas_nao_cadastradas)} sub={`linhas sem cliente · ${fmtNum(k.com_alertas)} com alertas`} tone={k.linhas_nao_cadastradas ? 'warn' : 'neutral'} />
                      </KpiRow>
                      <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1" aria-label={`Telas da ${c}`}>
                        {PAGINAS_CORRETORA.filter(p => profile.role === 'admin' || !['importar', 'parametros'].includes(p.id)).map(p => (
                          <Link key={p.id} href={`/${slug}/${p.id}`} className="text-label text-fg-muted hover:text-fg" title={p.hint}>{p.label}</Link>
                        ))}
                      </nav>
                    </>
                  )}
                </Panel>
              )
            })}

            <Panel title="Leads" subtitle="Funil único do escritório, independente da corretora."
              action={<Link href="/leads" className="link inline-flex items-center gap-1 text-label">Abrir leads <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>}>
              <KpiRow cols={4}>
                <KpiCard label="Total" value={fmtNum(leads?.total ?? 0)} sub={`${fmtNum(leads?.ja_clientes ?? 0)} já eram clientes`} />
                <KpiCard label="Em aberto" value={fmtNum(leads?.abertos ?? 0)} />
                <KpiCard label="Com alerta de contato" value={fmtNum(comAlerta)} tone={comAlerta ? 'warn' : 'neutral'} />
                <KpiCard label="Ganhos" value={fmtNum(leads?.ganhos ?? 0)} />
              </KpiRow>
            </Panel>
          </>
        )}
      </PageBody>
    </>
  )
}
