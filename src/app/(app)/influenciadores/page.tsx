export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { Badge } from '@/components/ui/Badge'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { ArrowRight, Link2 } from 'lucide-react'
import { NovoInfluenciadorButton } from './NovoInfluenciadorButton'
import { DeletarInfluenciadorButton } from './DeletarInfluenciadorButton'

type ClienteSimple = { status: string; created_at: string; ultimo_score?: { score_total: number }[] }

function calcularScore(clientes: ClienteSimple[]) {
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
  return Math.round(pontoVolume + pontoCHS + pontoRecencia + pontoAtivos)
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

const posicaoIcon = ['🥇', '🥈', '🥉']

export default async function InfluenciadoresPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (!['admin', 'vendedor'].includes(profile.role)) redirect('/dashboard')

  const supabase = await createClient()

  const { data: influenciadores } = await supabase
    .from('influenciadores')
    .select('*')
    .order('created_at', { ascending: false })

  const clientesMap: Record<string, ClienteSimple[]> = {}
  if (influenciadores?.length) {
    const { data: clientes } = await supabase
      .from('clientes')
      .select('influenciador_id, status, created_at, ultimo_score:cliente_scores(score_total)')
      .in('influenciador_id', influenciadores.map((i) => i.id))
      .order('created_at', { referencedTable: 'cliente_scores', ascending: false })
      .limit(1, { referencedTable: 'cliente_scores' })
    for (const c of clientes ?? []) {
      if (!clientesMap[c.influenciador_id]) clientesMap[c.influenciador_id] = []
      clientesMap[c.influenciador_id].push(c)
    }
  }

  const ranking = (influenciadores ?? [])
    .map((inf) => {
      const clientes = clientesMap[inf.id] ?? []
      const score = calcularScore(clientes)
      const total = clientes.length
      const ativos = clientes.filter((c) => c.status === 'ativo').length
      const inativos = clientes.filter((c) => c.status !== 'ativo').length
      const scores = clientes.flatMap((c) => c.ultimo_score ?? []).map((s) => s.score_total).filter(Boolean)
      const chsMedio = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
      const ultimoCliente = clientes.length > 0
        ? clientes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
        : null
      return { ...inf, score, total, ativos, inativos, chsMedio, ultimoCliente }
    })
    .sort((a, b) => b.score - a.score)

  const totalClientes = ranking.reduce((s, i) => s + i.total, 0)
  const chsGeral = ranking.filter((i) => i.chsMedio !== null)
  const chsMediaGeral = chsGeral.length > 0
    ? Math.round(chsGeral.reduce((s, i) => s + (i.chsMedio ?? 0), 0) / chsGeral.length)
    : 0
  const melhorScore = ranking[0]?.score ?? 0

  return (
    <div>
      <Header title="Influenciadores" />

      <HeroBanner>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-2">
              Gestão
            </p>
            <h1 className="text-3xl font-bold text-white tracking-tight">Influenciadores</h1>
            <p className="text-blue-200/60 mt-1 text-sm">
              Ranking e performance dos parceiros de captação
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { label: 'Parceiros',        value: ranking.length },
              { label: 'Clientes Indicados', value: totalClientes },
              { label: 'CHS Médio',        value: chsMediaGeral || '—' },
              { label: 'Melhor Score',     value: melhorScore },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl px-4 py-3 text-center min-w-[72px]"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <p className="text-xs text-blue-200/70 uppercase tracking-wide mb-1 leading-tight">{label}</p>
                <p className="text-2xl font-bold text-white">{value}</p>
              </div>
            ))}
            {profile.role === 'admin' && <NovoInfluenciadorButton />}
          </div>
        </div>
      </HeroBanner>

      <div className="p-6">
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
        >
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-3)' }}>
            <h2 className="text-sm font-semibold text-gray-900">Ranking de Influenciadores</h2>
          </div>

          {ranking.length === 0 && (
            <div className="px-6 py-12 text-center text-gray-500 text-sm">
              Nenhum influenciador cadastrado ainda.
            </div>
          )}

          <div>
            {ranking.map((inf, i) => {
              const cls = getClassificacao(inf.score)
              return (
                <div
                  key={inf.id}
                  className="px-6 py-4 hover:bg-blue-50/50 transition-colors"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 text-center flex-shrink-0">
                      {i < 3 ? (
                        <span className="text-xl">{posicaoIcon[i]}</span>
                      ) : (
                        <span className="text-sm font-bold text-gray-400">#{i + 1}</span>
                      )}
                    </div>
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm text-white"
                      style={{ background: 'linear-gradient(135deg, var(--blue) 0%, var(--blue-dark) 100%)' }}
                    >
                      {(inf.nome ?? '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 truncate">{inf.nome}</span>
                        <span className="text-xs text-blue-600 font-mono flex items-center gap-1">
                          <Link2 className="w-3 h-3" />@{inf.codigo}
                        </span>
                        <Badge variant={cls.variant}>{cls.label}</Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden max-w-48" style={{ background: 'var(--surface-3)' }}>
                          <div className={`h-full rounded-full transition-all ${getBarColor(inf.score)}`} style={{ width: `${inf.score}%` }} />
                        </div>
                        <span className={`text-xs font-mono font-bold ${getScoreColor(inf.score)}`}>{inf.score}/100</span>
                      </div>
                    </div>
                    <div className="hidden md:flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <p className="font-bold text-gray-900">{inf.total}</p>
                        <p className="text-xs text-gray-500">Clientes</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-emerald-600">{inf.ativos}</p>
                        <p className="text-xs text-gray-500">Ativos</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-amber-600">{inf.chsMedio ?? '—'}</p>
                        <p className="text-xs text-gray-500">CHS Médio</p>
                      </div>
                      <div className="text-center hidden lg:block">
                        <p className="text-xs text-gray-600">{inf.ultimoCliente ? formatDate(inf.ultimoCliente) : '—'}</p>
                        <p className="text-xs text-gray-400">Último cliente</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Link href={`/influenciadores/${inf.id}`} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors">
                        Ver <ArrowRight className="w-3 h-3" />
                      </Link>
                      {profile.role === 'admin' && (
                        <DeletarInfluenciadorButton id={inf.id} userId={inf.user_id ?? null} nome={inf.nome} />
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
