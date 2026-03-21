import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { redirect, notFound } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { Link2, Users, TrendingUp, XCircle, ArrowLeft, Mail, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { EditarInfluenciadorButton } from './EditarInfluenciadorButton'
import { CopyButton } from './CopyButton'

type Cliente = {
  id: string
  nome: string
  status: string
  created_at: string
  ultimo_score: { score_total: number; classificacao: string }[]
}

function calcularScore(clientes: Cliente[]) {
  const total = clientes.length
  const ativos = clientes.filter((c) => c.status === 'ativo').length
  const pontoVolume = Math.min(30, (Math.log10(total + 1) / Math.log10(11)) * 30)
  const scores = clientes.flatMap((c) => c.ultimo_score ?? []).map((s) => s.score_total).filter(Boolean)
  const chsMedio = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const pontoCHS = (chsMedio / 100) * 40
  const ultimoCliente = clientes.length > 0
    ? new Date(Math.max(...clientes.map((c) => new Date(c.created_at).getTime())))
    : null
  let pontoRecencia = 0
  if (ultimoCliente) {
    const dias = (Date.now() - ultimoCliente.getTime()) / 86400000
    if (dias < 30) pontoRecencia = 20
    else if (dias < 60) pontoRecencia = 15
    else if (dias < 90) pontoRecencia = 10
    else if (dias < 180) pontoRecencia = 5
  }
  const pontoAtivos = total > 0 ? (ativos / total) * 10 : 0
  return {
    total: Math.round(pontoVolume + pontoCHS + pontoRecencia + pontoAtivos),
    volume: Math.round(pontoVolume),
    chs: Math.round(pontoCHS),
    recencia: pontoRecencia,
    ativos: Math.round(pontoAtivos),
    chsMedio: Math.round(chsMedio),
  }
}

function getClassificacao(score: number): { label: string; variant: 'success' | 'info' | 'warning' | 'default' | 'danger' } {
  if (score >= 80) return { label: 'Elite', variant: 'success' }
  if (score >= 60) return { label: 'Premium', variant: 'info' }
  if (score >= 40) return { label: 'Ativo', variant: 'warning' }
  if (score >= 20) return { label: 'Em crescimento', variant: 'default' }
  return { label: 'Inativo', variant: 'danger' }
}

function getScoreColor(score: number) {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-blue-600'
  if (score >= 40) return 'text-amber-600'
  return 'text-gray-500'
}

function getBarColor(score: number) {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-blue-500'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-gray-300'
}

const statusConfig = {
  ativo: { label: 'Ativo', variant: 'success' as const },
  inativo: { label: 'Inativo', variant: 'danger' as const },
  pendente: { label: 'Pendente', variant: 'warning' as const },
}

export default async function InfluenciadorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (!['admin', 'vendedor'].includes(profile.role)) redirect('/dashboard')

  const supabase = await createClient()

  const { data: inf } = await supabase.from('influenciadores').select('*').eq('id', id).single()
  if (!inf) notFound()

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nome, status, created_at, ultimo_score:cliente_scores(score_total, classificacao)')
    .eq('influenciador_id', id)
    .order('created_at', { ascending: false })
    .order('created_at', { referencedTable: 'cliente_scores', ascending: false })
    .limit(1, { referencedTable: 'cliente_scores' })

  const allClientes = (clientes ?? []) as Cliente[]
  const score = calcularScore(allClientes)
  const cls = getClassificacao(score.total)

  const total = allClientes.length
  const ativos = allClientes.filter((c) => c.status === 'ativo').length
  const inativos = allClientes.filter((c) => c.status !== 'ativo').length

  const clientesPorMes: Record<string, number> = {}
  for (const c of allClientes) {
    const mes = c.created_at.slice(0, 7)
    clientesPorMes[mes] = (clientesPorMes[mes] ?? 0) + 1
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const refUrl = `${siteUrl}/ref/${inf.codigo}`
  const infNome = inf.nome ?? inf.name ?? '?'
  const infStatus = inf.status ?? 'ativo'

  return (
    <div>
      <Header title={infNome} />

      <HeroBanner>
        <Link
          href="/influenciadores"
          className="inline-flex items-center gap-1.5 text-xs text-blue-200/70 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar para Influenciadores
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
          <div className="flex items-center gap-5">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl font-bold text-white select-none"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.22)' }}
            >
              {infNome.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">{infNome}</h1>
              <div className="flex items-center gap-1.5 mt-1">
                <Link2 className="w-3.5 h-3.5 text-blue-300" />
                <span className="text-sm text-blue-200/80 font-mono">@{inf.codigo}</span>
              </div>
              {inf.email && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Mail className="w-3.5 h-3.5 text-blue-200/60" />
                  <span className="text-sm text-blue-200/60">{inf.email}</span>
                </div>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant={cls.variant}>{cls.label}</Badge>
                <Badge variant={infStatus === 'ativo' ? 'success' : 'danger'}>
                  {infStatus === 'ativo' ? 'Ativo' : 'Inativo'}
                </Badge>
                <span className="text-xs text-blue-200/50">desde {formatDate(inf.created_at)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className={`text-5xl font-black ${score.total >= 60 ? 'text-white' : 'text-blue-200/80'}`}>{score.total}</p>
              <p className="text-xs text-blue-200/50 mt-1">Score / 100</p>
              <div className="mt-2 w-28 h-2 rounded-full overflow-hidden mx-auto" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <div className={`h-full rounded-full ${getBarColor(score.total)}`} style={{ width: `${score.total}%` }} />
              </div>
            </div>
            {profile.role === 'admin' && (
              <EditarInfluenciadorButton
                influenciador={{
                  id: inf.id,
                  nome: infNome,
                  codigo: inf.codigo,
                  codigo_genial: inf.codigo_genial ?? null,
                  status: infStatus,
                }}
              />
            )}
          </div>
        </div>
      </HeroBanner>

      <div className="p-6 space-y-6">
        {/* Métricas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Clientes', value: total,              color: 'text-gray-900' },
            { label: 'Ativos',         value: ativos,             color: 'text-emerald-600' },
            { label: 'Inativos',       value: inativos,           color: 'text-red-500' },
            { label: 'CHS Médio',      value: score.chsMedio || '—', color: 'text-amber-600' },
          ].map((m) => (
            <div
              key={m.label}
              className="rounded-xl px-4 py-3 text-center"
              style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
            >
              <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Score Breakdown */}
            <Card>
              <CardHeader><CardTitle>Composição do Score</CardTitle></CardHeader>
              <div className="space-y-4">
                {[
                  { label: 'Volume de clientes',     value: score.volume,   max: 30, desc: `${total} clientes indicados` },
                  { label: 'CHS médio dos clientes', value: score.chs,      max: 40, desc: `CHS médio: ${score.chsMedio}` },
                  { label: 'Recência',               value: score.recencia, max: 20, desc: score.recencia === 20 ? 'Nos últimos 30 dias' : score.recencia === 15 ? '30–60 dias' : score.recencia === 10 ? '60–90 dias' : score.recencia === 5 ? '90–180 dias' : 'Inativo há +180 dias' },
                  { label: 'Clientes ativos',        value: score.ativos,   max: 10, desc: `${ativos} de ${total} ativos` },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="text-sm text-gray-600">{item.label}</span>
                        <span className="text-xs text-gray-400 ml-2">({item.desc})</span>
                      </div>
                      <span className={`text-sm font-bold ${getScoreColor(score.total)}`}>
                        {item.value}<span className="text-gray-400 font-normal">/{item.max}</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                      <div className={`h-full rounded-full ${getBarColor(score.total)}`} style={{ width: `${(item.value / item.max) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Lista de clientes */}
            <Card className="p-0 overflow-hidden">
              <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-3)' }}>
                <h3 className="text-sm font-semibold text-gray-900">Clientes Indicados ({total})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-3)' }}>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nome</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">CHS</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Desde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allClientes.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                          Nenhum cliente indicado ainda.
                        </td>
                      </tr>
                    )}
                    {allClientes.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50/80 transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <Link href={`/clientes/${c.id}`} className="hover:text-blue-600 transition-colors">
                            {c.nome}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusConfig[c.status as keyof typeof statusConfig]?.variant ?? 'default'}>
                            {statusConfig[c.status as keyof typeof statusConfig]?.label ?? c.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-amber-600">
                          {c.ultimo_score?.[0]?.score_total ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{formatDate(c.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Link de Captação</CardTitle></CardHeader>
              <div className="space-y-2">
                <div className="rounded-lg px-3 py-2 text-sm text-blue-600 font-mono break-all" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
                  {refUrl}
                </div>
                <CopyButton text={refUrl} />
              </div>
            </Card>

            {inf.codigo_genial && (
              <Card>
                <CardHeader><CardTitle>Código na Genial</CardTitle></CardHeader>
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span className="text-sm text-gray-700 font-medium">{inf.codigo_genial}</span>
                </div>
                <p className="text-xs text-gray-400 mt-2">Vincula clientes e receitas importadas da Genial.</p>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle>CHS Médio dos Clientes</CardTitle></CardHeader>
              <div className="text-center py-2">
                <p className="text-4xl font-black text-amber-600">{score.chsMedio || '—'}</p>
                <p className="text-xs text-gray-500 mt-1">média de {total} cliente{total !== 1 ? 's' : ''}</p>
              </div>
              {score.chsMedio > 0 && (
                <div className="mt-3 h-3 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${score.chsMedio}%` }} />
                </div>
              )}
            </Card>

            {Object.keys(clientesPorMes).length > 0 && (
              <Card>
                <CardHeader><CardTitle>Clientes por Mês</CardTitle></CardHeader>
                <div className="space-y-2">
                  {Object.entries(clientesPorMes)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .slice(0, 6)
                    .map(([mes, count]) => {
                      const [ano, m] = mes.split('-')
                      const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
                      const label = `${meses[parseInt(m) - 1]}/${ano.slice(2)}`
                      return (
                        <div key={mes} className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 w-12">{label}</span>
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, count * 10)}%` }} />
                          </div>
                          <span className="text-xs font-bold text-gray-600 w-4 text-right">{count}</span>
                        </div>
                      )
                    })}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
