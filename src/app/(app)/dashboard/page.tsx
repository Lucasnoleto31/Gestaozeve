export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Filter } from 'lucide-react'
import { getProfile } from '@/lib/auth/getProfile'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import { CORRETORAS, CORRETORA_COLOR, CORRETORA_LABEL, CORRETORA_SLUG, PAGINAS_CORRETORA } from '@/lib/corretoras'
import { leadsLista, painelKpis } from '@/lib/gestao/consultas'
import { mesCurto } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { dataCurta, rCurto, TRACO } from '@/components/gestao/Celulas'

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

  const [kpis, leads] = equipe
    ? await Promise.all([Promise.all(CORRETORAS.map(c => painelKpis(c, null))), leadsLista()])
    : [[], []]
  const abertos = leads.filter(l => l.tipo_status === 'Aberto')

  return (
    <>
      <PageHeader
        eyebrow="Visão geral"
        title={`${getSaudacao()}, ${firstName}`}
        description="Resumo das três corretoras no último mês com lotes de cada uma. Entre no controle de cada corretora pelo menu ou pelos cartões."
      />
      <PageBody>
        {!equipe ? (
          <Panel title="Acesso" subtitle="Seu perfil não tem acesso ao controle de lotes. Fale com o administrador.">
            <div className="flex flex-wrap gap-2">{CORRETORAS.map(c => <CorretoraBadge key={c} corretora={c} size="md" />)}</div>
          </Panel>
        ) : (
          <>
            <div className="grid gap-5 xl:grid-cols-3">
              {CORRETORAS.map((c, i) => {
                const k = kpis[i]
                const slug = CORRETORA_SLUG[c]
                const vazio = !k || (k.clientes_levados === 0 && !k.ultima_data)
                return (
                  <section key={c} className="panel overflow-hidden" style={{ borderTop: `3px solid ${CORRETORA_COLOR[c]}` }}>
                    <header className="flex items-center justify-between px-5 pt-4">
                      <div className="flex items-center gap-2">
                        <CorretoraBadge corretora={c} size="md" />
                        <span className="text-xs text-fg-subtle">{k?.ultima_data ? `lotes até ${dataCurta(k.ultima_data)} · ref. ${mesCurto(k.mes_ref)}` : 'sem lotes importados'}</span>
                      </div>
                      <Link href={`/${slug}/painel`} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">Painel <ArrowRight className="h-3.5 w-3.5" /></Link>
                    </header>
                    {vazio ? (
                      <div className="px-5 py-6 text-sm text-fg-muted">
                        Nenhum dado ainda. Comece em <Link href={`/${slug}/parametros`} className="link">Parâmetros</Link> (assessores, tarifas) e depois <Link href={`/${slug}/importar`} className="link">importe</Link> o cadastro de clientes e os lotes.
                      </div>
                    ) : (
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 text-[13px] sm:grid-cols-3">
                        <div><dt className="label">Clientes levados</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums">{fmtNum(k.clientes_levados)}</dd><p className="text-[11px] text-fg-subtle">{fmtNum(k.migrados)} migrados ({k.clientes_levados ? fmtPct((k.migrados / k.clientes_levados) * 100, 0) : '0%'})</p></div>
                        <div><dt className="label">Ativos no mês</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums">{fmtNum(k.ativos_mes)}</dd><p className="text-[11px] text-fg-subtle">{k.migrados ? fmtPct((k.ativos_mes / k.migrados) * 100) : '0%'} da base migrada</p></div>
                        <div><dt className="label">Lotes no mês</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums">{fmtNum(k.lotes_mes)}</dd><p className="text-[11px] text-fg-subtle">{fmtNum(k.zerados_mes)} zerados</p></div>
                        <div><dt className="label">Receita no mês</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums">{rCurto(k.receita_mes)}</dd><p className="text-[11px] text-fg-subtle">+ incentivo {rCurto(k.incentivo_mes)}</p></div>
                        <div><dt className="label">Sem giro / inativos</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums">{fmtNum(k.migrados_sem_giro)} <span className="text-sm text-fg-muted">/ {fmtNum(k.inativos)}</span></dd><p className="text-[11px] text-fg-subtle">migrados que nunca giraram / pararam</p></div>
                        <div><dt className="label">Pendências</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums">{fmtNum(k.linhas_nao_cadastradas)}</dd><p className="text-[11px] text-fg-subtle">linhas de lotes sem cliente · {fmtNum(k.com_alertas)} com alertas</p></div>
                      </dl>
                    )}
                    <nav className="flex flex-wrap gap-1 border-t border-line px-3 py-2">
                      {PAGINAS_CORRETORA.filter(p => profile.role === 'admin' || !['importar', 'parametros'].includes(p.id)).map(p => (
                        <Link key={p.id} href={`/${slug}/${p.id}`} className="rounded-md px-2 py-1 text-xs text-fg-muted hover:bg-surface-3 hover:text-fg" title={p.hint}>{p.label}</Link>
                      ))}
                    </nav>
                  </section>
                )
              })}
            </div>

            <Panel icon={Filter} title="Leads" subtitle="Funil único do escritório, independente da corretora."
              action={<Link href="/leads" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">Abrir leads <ArrowRight className="h-3.5 w-3.5" /></Link>}>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div><dt className="label">Total</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums">{fmtNum(leads.length)}</dd></div>
                <div><dt className="label">Em aberto</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums">{fmtNum(abertos.length)}</dd></div>
                <div><dt className="label">Com alerta de contato</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums text-warning">{fmtNum(abertos.filter(l => l.alerta).length)}</dd></div>
                <div><dt className="label">Ganhos</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums text-success">{fmtNum(leads.filter(l => l.status === 'Ganho').length)}</dd><p className="text-[11px] text-fg-subtle">{leads.length ? `${fmtNum(leads.filter(l => l.cliente_id).length)} já eram clientes` : TRACO}</p></div>
              </dl>
            </Panel>
            <p className="text-xs text-fg-subtle">{CORRETORAS.map(c => CORRETORA_LABEL[c]).join(' · ')} usam as mesmas telas; cada uma tem os seus parâmetros, clientes e lotes.</p>
          </>
        )}
      </PageBody>
    </>
  )
}
