export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { Badge } from '@/components/ui/Badge'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { Users, TrendingUp, Award, ArrowRight, Link2, Star } from 'lucide-react'
import { NovoInfluenciadorButton } from './NovoInfluenciadorButton'

type LeadSimple = { status: string; created_at: string }

function calcularScore(leads: LeadSimple[]) {
  const total = leads.length
  const convertidos = leads.filter((l) => l.status === 'convertido').length

  const pontoConversao = total > 0 ? (convertidos / total) * 50 : 0
  const pontoVolume = Math.min(30, (Math.log10(total + 1) / Math.log10(11)) * 30)

  const ultimoLead = leads.length > 0
    ? new Date(Math.max(...leads.map((l) => new Date(l.created_at).getTime())))
    : null
  let pontoRecencia = 0
  if (ultimoLead) {
    const dias = (Date.now() - ultimoLead.getTime()) / 86400000
    if (dias < 30) pontoRecencia = 20
    else if (dias < 60) pontoRecencia = 15
    else if (dias < 90) pontoRecencia = 10
    else if (dias < 180) pontoRecencia = 5
  }

  return Math.round(pontoConversao + pontoVolume + pontoRecencia)
}

function getClassificacao(score: number): { label: string; variant: 'success' | 'info' | 'warning' | 'default' | 'danger' } {
  if (score >= 80) return { label: 'Elite', variant: 'success' }
  if (score >= 60) return { label: 'Premium', variant: 'info' }
  if (score >= 40) return { label: 'Ativo', variant: 'warning' }
  if (score >= 20) return { label: 'Em crescimento', variant: 'default' }
  return { label: 'Inativo', variant: 'danger' }
}

function getScoreColor(score: number) {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-blue-400'
  if (score >= 40) return 'text-amber-400'
  if (score >= 20) return 'text-blue-400'
  return 'text-gray-500'
}

function getBarColor(score: number) {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-blue-500'
  if (score >= 40) return 'bg-amber-500'
  if (score >= 20) return 'bg-blue-500'
  return 'bg-gray-600'
}

const posicaoIcon = ['🥇', '🥈', '🥉']

export default async function InfluenciadoresAdminPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  const supabase = await createClient()

  const { data: influenciadores } = await supabase
    .from('influenciadores')
    .select('*')
    .order('created_at', { ascending: false })

  const leadsMap: Record<string, LeadSimple[]> = {}
  if (influenciadores?.length) {
    const { data: leads } = await supabase
      .from('leads')
      .select('influenciador_id, status, created_at')
      .in('influenciador_id', influenciadores.map((i) => i.id))

    for (const lead of leads ?? []) {
      if (!leadsMap[lead.influenciador_id]) leadsMap[lead.influenciador_id] = []
      leadsMap[lead.influenciador_id].push(lead)
    }
  }

  const ranking = (influenciadores ?? [])
    .map((inf) => {
      const leads = leadsMap[inf.id] ?? []
      const score = calcularScore(leads)
      const total = leads.length
      const convertidos = leads.filter((l) => l.status === 'convertido').length
      const perdidos = leads.filter((l) => l.status === 'perdido').length
      const ativos = leads.filter((l) => l.status === 'ativo').length
      const taxa = total > 0 ? Math.round((convertidos / total) * 100) : 0
      const ultimoLead = leads.length > 0
        ? leads.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
        : null
      return { ...inf, score, total, convertidos, perdidos, ativos, taxa, ultimoLead }
    })
    .sort((a, b) => b.score - a.score)

  const totalLeads = ranking.reduce((s, i) => s + i.total, 0)
  const totalConvertidos = ranking.reduce((s, i) => s + i.convertidos, 0)
  const taxaGeral = totalLeads > 0 ? Math.round((totalConvertidos / totalLeads) * 100) : 0
  const melhorScore = ranking[0]?.score ?? 0

  return (
    <div>
      <Header title="Influenciadores" />
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{ranking.length} influenciadores</p>
          <NovoInfluenciadorButton />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Influenciadores', value: ranking.length, icon: Users, color: 'text-blue-400' },
            { label: 'Leads Gerados', value: totalLeads, icon: TrendingUp, color: 'text-emerald-400' },
            { label: 'Taxa de Conversão', value: `${taxaGeral}%`, icon: TrendingUp, color: 'text-amber-400' },
            { label: 'Melhor Score', value: melhorScore, icon: Award, color: 'text-purple-400' },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500">{s.label}</p>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Ranking */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-gray-900">Ranking de Influenciadores</h2>
          </div>

          {ranking.length === 0 && (
            <div className="px-6 py-12 text-center text-gray-500 text-sm">
              Nenhum influenciador cadastrado ainda.
            </div>
          )}

          <div className="divide-y divide-gray-200">
            {ranking.map((inf, i) => {
              const cls = getClassificacao(inf.score)
              return (
                <div key={inf.id} className="px-6 py-4 hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-4">

                    {/* Posição */}
                    <div className="w-10 text-center flex-shrink-0">
                      {i < 3 ? (
                        <span className="text-xl">{posicaoIcon[i]}</span>
                      ) : (
                        <span className="text-sm font-bold text-gray-500">#{i + 1}</span>
                      )}
                    </div>

                    {/* Avatar */}
                    <div className="w-10 h-10 bg-blue-600/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-400 font-bold text-sm">
                        {(inf.nome ?? '?').charAt(0).toUpperCase()}
                      </span>
                    </div>

                    {/* Nome e código */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 truncate">{inf.nome}</span>
                        <span className="text-xs text-blue-400 font-mono flex items-center gap-1">
                          <Link2 className="w-3 h-3" />
                          @{inf.codigo}
                        </span>
                        <Badge variant={cls.variant}>{cls.label}</Badge>
                      </div>

                      {/* Score bar */}
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-48">
                          <div
                            className={`h-full rounded-full transition-all ${getBarColor(inf.score)}`}
                            style={{ width: `${inf.score}%` }}
                          />
                        </div>
                        <span className={`text-xs font-mono font-bold ${getScoreColor(inf.score)}`}>
                          {inf.score}/100
                        </span>
                      </div>
                    </div>

                    {/* Métricas */}
                    <div className="hidden md:flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <p className="font-bold text-gray-900">{inf.total}</p>
                        <p className="text-xs text-gray-500">Leads</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-emerald-400">{inf.convertidos}</p>
                        <p className="text-xs text-gray-500">Conv.</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-amber-400">{inf.taxa}%</p>
                        <p className="text-xs text-gray-500">Taxa</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-red-400">{inf.perdidos}</p>
                        <p className="text-xs text-gray-500">Perdidos</p>
                      </div>
                      <div className="text-center hidden lg:block">
                        <p className="text-xs text-gray-500">{inf.ultimoLead ? formatDate(inf.ultimoLead) : '—'}</p>
                        <p className="text-xs text-gray-400">Último lead</p>
                      </div>
                    </div>

                    {/* Ver detalhes */}
                    <Link
                      href={`/admin/influenciadores/${inf.id}`}
                      className="flex-shrink-0 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Ver
                      <ArrowRight className="w-3 h-3" />
                    </Link>
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
