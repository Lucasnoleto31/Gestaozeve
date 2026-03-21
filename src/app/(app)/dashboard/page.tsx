import { getProfile } from '@/lib/auth/getProfile'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDate, formatCurrency } from '@/lib/utils'
import { CarteiraPie } from '@/components/charts/DashboardCharts'
import {
  Users, TrendingUp, Target, BarChart2, AlertTriangle,
  CheckCircle, Clock, ArrowRight, Zap, Activity,
  TrendingDown, Minus, Calendar,
} from 'lucide-react'

// ── helpers ────────────────────────────────────────────────────────────────

function getSaudacao() {
  const h = (new Date().getUTCHours() - 3 + 24) % 24
  if (h >= 18) return 'Boa noite'
  if (h >= 12) return 'Boa tarde'
  return 'Bom dia'
}

const classificacaoConfig = {
  saudavel: { label: 'Saudável',   variant: 'success'  as const, dot: 'bg-emerald-500' },
  atencao:  { label: 'Em atenção', variant: 'warning'  as const, dot: 'bg-amber-500'   },
  risco:    { label: 'Em risco',   variant: 'danger'   as const, dot: 'bg-red-500'     },
}

const tendenciaIcon = {
  subindo: TrendingUp,
  caindo:  TrendingDown,
  estavel: Minus,
}

const tendenciaColor = {
  subindo: 'text-emerald-600',
  caindo:  'text-red-500',
  estavel: 'text-gray-400',
}

const tipoAcaoConfig = {
  tarefa:  { label: 'Tarefa',   icon: AlertTriangle, color: 'text-red-500'     },
  nutricao:{ label: 'Nutrição', icon: Zap,           color: 'text-amber-500'   },
  upsell:  { label: 'Upsell',   icon: TrendingUp,    color: 'text-emerald-600' },
}

// ── influenciador stats ────────────────────────────────────────────────────

async function getInfluenciadorStats(userId: string) {
  const supabase = await createClient()
  const { data: influenciador } = await supabase
    .from('influenciadores').select('id').eq('user_id', userId).single()
  if (!influenciador) return null
  const { count: totalLeads } = await supabase
    .from('leads').select('*', { count: 'exact', head: true }).eq('influenciador_id', influenciador.id)
  const { count: convertidos } = await supabase
    .from('leads').select('*', { count: 'exact', head: true })
    .eq('influenciador_id', influenciador.id).eq('status', 'convertido')
  return { totalLeads: totalLeads ?? 0, convertidos: convertidos ?? 0 }
}

// ── main stats ─────────────────────────────────────────────────────────────

async function getMainStats() {
  const supabase = await createClient()

  const [
    { data: clientesComScore },
    { data: dadosCHSAll },
    { data: proximosFollowups },
    { data: acoesPendentes },
  ] = await Promise.all([
    supabase
      .from('clientes')
      .select(`id, nome, status, ultimo_score:cliente_scores(score_total, classificacao, tendencia, created_at)`)
      .eq('status', 'ativo')
      .order('created_at', { ascending: false })
      .order('created_at', { referencedTable: 'cliente_scores', ascending: false })
      .limit(1, { referencedTable: 'cliente_scores' }),

    supabase
      .from('cliente_dados_chs')
      .select('receita_periodo_atual'),

    supabase
      .from('cliente_followups')
      .select('*, cliente:clientes(id, nome)')
      .eq('status', 'pendente')
      .order('agendado_para')
      .limit(5),

    supabase
      .from('cliente_acoes')
      .select('*, cliente:clientes(id, nome)')
      .eq('status', 'pendente')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const clientes = clientesComScore ?? []
  const totalAtivos = clientes.length

  const comScore = clientes.filter((c) => (c.ultimo_score as any)?.[0])
  const scoreMedio = comScore.length > 0
    ? Math.round(comScore.reduce((acc, c) => acc + (c.ultimo_score as any)[0].score_total, 0) / comScore.length)
    : null

  const distClassificacao = { saudavel: 0, atencao: 0, risco: 0 }
  for (const c of comScore) {
    const cls = (c.ultimo_score as any)[0].classificacao as keyof typeof distClassificacao
    if (cls in distClassificacao) distClassificacao[cls]++
  }

  const clientesEmAtencao = clientes
    .filter((c) => {
      const cls = (c.ultimo_score as any)?.[0]?.classificacao
      return cls === 'risco' || cls === 'atencao'
    })
    .sort((a, b) =>
      ((a.ultimo_score as any)?.[0]?.score_total ?? 100) -
      ((b.ultimo_score as any)?.[0]?.score_total ?? 100)
    )
    .slice(0, 6)

  const receitaMes = (dadosCHSAll ?? []).reduce((acc, d) => acc + (d.receita_periodo_atual ?? 0), 0)

  return {
    totalAtivos,
    scoreMedio,
    emRisco: distClassificacao.risco,
    emAtencao: distClassificacao.atencao,
    receitaMes,
    distClassificacao,
    clientesEmAtencao,
    proximosFollowups: proximosFollowups ?? [],
    acoesPendentes: acoesPendentes ?? [],
  }
}

// ── page ───────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const firstName = profile.nome.split(' ')[0]
  const saudacao = getSaudacao()
  const isInfluenciador = profile.role === 'influenciador'

  if (isInfluenciador) {
    const stats = await getInfluenciadorStats(profile.user_id)
    const conversao = stats?.totalLeads
      ? Math.round(((stats.convertidos) / stats.totalLeads) * 100)
      : 0

    return (
      <div>
        <Header title="Dashboard" />

        {/* Hero */}
        <div
          className="relative overflow-hidden"
          style={{ background: 'linear-gradient(140deg, #0A1628 0%, #0F2550 50%, #1764F4 100%)' }}
        >
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 80% at 80% 40%, rgba(23,100,244,0.4) 0%, transparent 70%)' }} />
          <div className="relative z-10 px-6 py-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-2">Painel do influenciador</p>
            <h1 className="text-3xl font-bold text-white tracking-tight">{saudacao}, {firstName}</h1>
            <p className="text-blue-200/60 mt-1 text-sm">Acompanhe seus leads e conversões</p>

            <div className="mt-8 grid grid-cols-3 gap-4">
              {[
                { label: 'Total de Leads', value: stats?.totalLeads ?? 0 },
                { label: 'Convertidos',    value: stats?.convertidos ?? 0 },
                { label: 'Taxa de Conversão', value: `${conversao}%` },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl px-4 py-4" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  <p className="text-xs text-blue-200/70 uppercase tracking-wide mb-1">{label}</p>
                  <p className="text-2xl font-bold text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const stats = await getMainStats()
  const kpis = [
    {
      label: 'Clientes Ativos',
      value: stats.totalAtivos.toString(),
      sub: 'na carteira',
      icon: Users,
      color: '#1764F4',
    },
    {
      label: 'Score CHS Médio',
      value: stats.scoreMedio !== null ? stats.scoreMedio.toString() : '—',
      sub: stats.scoreMedio !== null ? (stats.scoreMedio >= 70 ? 'Carteira saudável' : stats.scoreMedio >= 40 ? 'Atenção necessária' : 'Risco elevado') : 'Sem dados',
      icon: Activity,
      color: stats.scoreMedio !== null ? (stats.scoreMedio >= 70 ? '#059669' : stats.scoreMedio >= 40 ? '#d97706' : '#dc2626') : '#6B7280',
    },
    {
      label: 'Em Risco',
      value: stats.emRisco.toString(),
      sub: `+ ${stats.emAtencao} em atenção`,
      icon: AlertTriangle,
      color: '#dc2626',
    },
    {
      label: 'Receita do Mês',
      value: formatCurrency(stats.receitaMes),
      sub: 'período atual',
      icon: TrendingUp,
      color: '#059669',
    },
  ]

  return (
    <div>
      <Header title="Dashboard" />

      {/* ── Hero Banner ── */}
      <div
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(140deg, #0A1628 0%, #0F2550 50%, #1764F4 100%)' }}
      >
        {/* Grid texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        {/* Radial glow */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 60% 80% at 80% 40%, rgba(23,100,244,0.4) 0%, transparent 70%)' }}
        />

        <div className="relative z-10 px-6 py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-2">
            Centro de controle
          </p>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            {saudacao}, {firstName}
          </h1>
          <p className="text-blue-200/60 mt-1 text-sm">
            Acompanhe sua carteira de traders em tempo real
          </p>

          {/* KPI strip */}
          <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map(({ label, value, sub, icon: Icon, color }) => (
              <div
                key={label}
                className="rounded-xl px-4 py-4"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-blue-200/70 uppercase tracking-wide leading-tight">{label}</p>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.10)' }}>
                    <Icon className="w-3.5 h-3.5 text-white/70" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-white">{value}</p>
                {sub && <p className="text-xs text-blue-200/50 mt-1">{sub}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="p-6 space-y-6">

        {/* Row 1: Clients needing attention + Score distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Clients needing attention */}
          <div className="lg:col-span-2">
            <Card className="p-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Clientes que precisam de atenção</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Ordenados por menor score CHS</p>
                </div>
                <Link
                  href="/clientes?classificacao=risco"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Ver todos <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {stats.clientesEmAtencao.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-2">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50">
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                  </div>
                  <p className="text-sm text-gray-500">Todos os clientes estão saudáveis!</p>
                </div>
              ) : (
                <div>
                  {stats.clientesEmAtencao.map((c) => {
                    const score = (c.ultimo_score as any)?.[0]
                    const cls = score?.classificacao as keyof typeof classificacaoConfig | undefined
                    const tend = score?.tendencia as keyof typeof tendenciaIcon | undefined
                    const TendIcon = tend ? tendenciaIcon[tend] : Minus
                    const iniciais = c.nome.trim().split(' ').map((p: string) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
                    return (
                      <Link
                        key={c.id}
                        href={`/clientes/${c.id}`}
                        className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/80 transition-colors group"
                        style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold text-white select-none"
                            style={{ background: 'linear-gradient(135deg, var(--blue) 0%, var(--blue-dark) 100%)' }}
                          >
                            {iniciais}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{c.nome}</p>
                            {score && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                Score: <span className="font-semibold">{Math.round(score.score_total)}</span>
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {cls && (
                            <Badge variant={classificacaoConfig[cls].variant}>
                              {classificacaoConfig[cls].label}
                            </Badge>
                          )}
                          {tend && (
                            <TendIcon className={`w-4 h-4 ${tendenciaColor[tend]}`} />
                          )}
                          <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-400 transition-colors" />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Score distribution */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Distribuição da carteira</CardTitle>
              </CardHeader>
              <CarteiraPie
                distribuicao={stats.distClassificacao}
                total={stats.totalAtivos}
              />
            </Card>
          </div>
        </div>

        {/* Row 2: Follow-ups + Pending actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Próximos follow-ups */}
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--blue-dim)' }}>
                  <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--blue)' }} />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">Próximos Follow-ups</h3>
              </div>
              {stats.proximosFollowups.length > 0 && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--blue-dim)', color: 'var(--blue)' }}
                >
                  {stats.proximosFollowups.length}
                </span>
              )}
            </div>

            {stats.proximosFollowups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Clock className="w-8 h-8 text-gray-300" />
                <p className="text-sm text-gray-400">Nenhum follow-up agendado.</p>
              </div>
            ) : (
              <div>
                {stats.proximosFollowups.map((f: any) => {
                  const data = new Date(f.agendado_para + 'T12:00:00')
                  const hoje = new Date()
                  const diff = Math.floor((data.getTime() - hoje.getTime()) / 86400000)
                  const isAtrasado = diff < 0
                  const isHoje = diff === 0
                  return (
                    <Link
                      key={f.id}
                      href={`/clientes/${f.cliente?.id}`}
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/80 transition-colors"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: isAtrasado ? '#dc2626' : isHoje ? '#d97706' : '#1764F4' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{f.cliente?.nome ?? '—'}</p>
                        {f.observacao && <p className="text-xs text-gray-500 truncate mt-0.5">{f.observacao}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-xs font-semibold ${isAtrasado ? 'text-red-500' : isHoje ? 'text-amber-500' : 'text-gray-500'}`}>
                          {isAtrasado ? `${Math.abs(diff)}d atrasado` : isHoje ? 'Hoje' : formatDate(f.agendado_para)}
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Ações pendentes */}
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-50">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">Ações Pendentes</h3>
              </div>
              {stats.acoesPendentes.length > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                  {stats.acoesPendentes.length}
                </span>
              )}
            </div>

            {stats.acoesPendentes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <CheckCircle className="w-8 h-8 text-gray-300" />
                <p className="text-sm text-gray-400">Sem ações pendentes.</p>
              </div>
            ) : (
              <div>
                {stats.acoesPendentes.map((a: any) => {
                  const config = tipoAcaoConfig[a.tipo as keyof typeof tipoAcaoConfig]
                  const Icon = config?.icon ?? AlertTriangle
                  return (
                    <Link
                      key={a.id}
                      href={`/clientes/${a.cliente?.id}`}
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/80 transition-colors"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${config?.color ?? 'text-gray-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{a.titulo}</p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{a.cliente?.nome ?? '—'}</p>
                      </div>
                      <Badge variant={a.prioridade === 'alta' ? 'danger' : a.prioridade === 'media' ? 'warning' : 'default'}>
                        {a.prioridade}
                      </Badge>
                    </Link>
                  )
                })}
              </div>
            )}
          </Card>

        </div>
      </div>
    </div>
  )
}
