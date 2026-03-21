import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { redirect, notFound } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { Link2, Users, TrendingUp, Target, XCircle, Copy } from 'lucide-react'

type Lead = {
  id: string
  nome: string
  status: string
  created_at: string
  temperatura: string | null
  etapa: { nome: string; cor: string } | null
}

function calcularScore(leads: Pick<Lead, 'status' | 'created_at'>[]) {
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

  return {
    total: Math.round(pontoConversao + pontoVolume + pontoRecencia),
    conversao: Math.round(pontoConversao),
    volume: Math.round(pontoVolume),
    recencia: pontoRecencia,
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

const statusConfig = {
  ativo: { label: 'Ativo', variant: 'warning' as const },
  convertido: { label: 'Convertido', variant: 'success' as const },
  perdido: { label: 'Perdido', variant: 'danger' as const },
}

export default async function InfluenciadorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  const supabase = await createClient()

  const { data: inf } = await supabase
    .from('influenciadores')
    .select('*')
    .eq('id', id)
    .single()

  if (!inf) notFound()

  const { data: leads } = await supabase
    .from('leads')
    .select('id, nome, status, created_at, temperatura, etapa:funil_etapas(nome, cor)')
    .eq('influenciador_id', id)
    .order('created_at', { ascending: false })

  const allLeads = (leads ?? []) as Lead[]

  const score = calcularScore(allLeads)
  const cls = getClassificacao(score.total)

  const total = allLeads.length
  const convertidos = allLeads.filter((l) => l.status === 'convertido').length
  const perdidos = allLeads.filter((l) => l.status === 'perdido').length
  const ativos = allLeads.filter((l) => l.status === 'ativo').length
  const taxa = total > 0 ? Math.round((convertidos / total) * 100) : 0

  // Leads por mês (últimos 6 meses)
  const leadsPorMes: Record<string, { total: number; convertidos: number }> = {}
  for (const lead of allLeads) {
    const mes = lead.created_at.slice(0, 7)
    if (!leadsPorMes[mes]) leadsPorMes[mes] = { total: 0, convertidos: 0 }
    leadsPorMes[mes].total++
    if (lead.status === 'convertido') leadsPorMes[mes].convertidos++
  }

  // Distribuição por etapa (apenas ativos)
  const leadsPorEtapa: Record<string, { nome: string; cor: string; count: number }> = {}
  for (const lead of allLeads.filter((l) => l.status === 'ativo')) {
    const key = lead.etapa?.nome ?? 'Sem etapa'
    if (!leadsPorEtapa[key]) leadsPorEtapa[key] = { nome: key, cor: lead.etapa?.cor ?? '#1764F4', count: 0 }
    leadsPorEtapa[key].count++
  }
  const etapaDistrib = Object.values(leadsPorEtapa).sort((a, b) => b.count - a.count)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const refUrl = `${siteUrl}/ref/${inf.codigo}`

  return (
    <div>
      <Header title={inf.nome} />
      <div className="p-6 space-y-6">

        {/* Hero — Score */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">

            {/* Avatar + info */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-blue-600/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                <span className="text-blue-400 font-bold text-2xl">
                  {(inf.nome ?? '?').charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{inf.nome}</h2>
                <div className="flex items-center gap-1.5 mt-1">
                  <Link2 className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-sm text-blue-400 font-mono">@{inf.codigo}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant={cls.variant}>{cls.label}</Badge>
                  <span className="text-xs text-gray-500">desde {formatDate(inf.created_at)}</span>
                </div>
              </div>
            </div>

            {/* Score gauge */}
            <div className="sm:ml-auto text-center sm:text-right">
              <p className={`text-5xl font-black ${getScoreColor(score.total)}`}>{score.total}</p>
              <p className="text-xs text-gray-500 mt-1">Score / 100</p>
              <div className="mt-2 w-32 h-2 bg-gray-100 rounded-full overflow-hidden mx-auto sm:ml-auto sm:mr-0">
                <div
                  className={`h-full rounded-full ${getBarColor(score.total)}`}
                  style={{ width: `${score.total}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna principal */}
          <div className="lg:col-span-2 space-y-6">

            {/* Métricas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Leads', value: total, icon: Users, color: 'text-gray-900' },
                { label: 'Convertidos', value: convertidos, icon: TrendingUp, color: 'text-emerald-400' },
                { label: 'Em andamento', value: ativos, icon: Target, color: 'text-amber-400' },
                { label: 'Perdidos', value: perdidos, icon: XCircle, color: 'text-red-400' },
              ].map((m) => (
                <div key={m.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center">
                  <m.icon className={`w-5 h-5 ${m.color} mx-auto mb-1`} />
                  <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>

            {/* Score Breakdown */}
            <Card>
              <CardHeader><CardTitle>Composição do Score</CardTitle></CardHeader>
              <div className="space-y-4">
                {[
                  { label: 'Taxa de conversão', value: score.conversao, max: 50, desc: `${taxa}% de conversão` },
                  { label: 'Volume de leads', value: score.volume, max: 30, desc: `${total} leads no total` },
                  { label: 'Recência', value: score.recencia, max: 20, desc: score.recencia === 20 ? 'Lead nos últimos 30 dias' : score.recencia === 15 ? 'Último lead: 30–60 dias' : score.recencia === 10 ? 'Último lead: 60–90 dias' : score.recencia === 5 ? 'Último lead: 90–180 dias' : 'Inativo há +180 dias' },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="text-sm text-gray-400">{item.label}</span>
                        <span className="text-xs text-gray-400 ml-2">({item.desc})</span>
                      </div>
                      <span className={`text-sm font-bold ${getScoreColor(score.total)}`}>
                        {item.value}<span className="text-gray-400 font-normal">/{item.max}</span>
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${getBarColor(score.total)}`}
                        style={{ width: `${(item.value / item.max) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Leads recentes */}
            <Card className="p-0 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900">Leads ({total})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Etapa</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {allLeads.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                          Nenhum lead ainda.
                        </td>
                      </tr>
                    )}
                    {allLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-gray-100">
                        <td className="px-4 py-3 font-medium text-gray-900">{lead.nome}</td>
                        <td className="px-4 py-3">
                          {lead.etapa ? (
                            <span className="text-xs" style={{ color: lead.etapa.cor }}>{lead.etapa.nome}</span>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusConfig[lead.status as keyof typeof statusConfig]?.variant ?? 'default'}>
                            {statusConfig[lead.status as keyof typeof statusConfig]?.label ?? lead.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{formatDate(lead.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">

            {/* Link de captação */}
            <Card>
              <CardHeader><CardTitle>Link de Captação</CardTitle></CardHeader>
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-blue-600 font-mono break-all">
                /ref/{inf.codigo}
              </div>
              <p className="text-xs text-gray-400 mt-2">URL completa: {refUrl}</p>
            </Card>

            {/* Taxa de conversão */}
            <Card>
              <CardHeader><CardTitle>Conversão</CardTitle></CardHeader>
              <div className="text-center py-2">
                <p className="text-4xl font-black text-emerald-400">{taxa}%</p>
                <p className="text-xs text-gray-500 mt-1">{convertidos} de {total} leads convertidos</p>
              </div>
              <div className="mt-3 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${taxa}%` }}
                />
              </div>
            </Card>

            {/* Funil de leads ativos */}
            {etapaDistrib.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Leads Ativos por Etapa</CardTitle></CardHeader>
                <div className="space-y-2">
                  {etapaDistrib.map((etapa) => (
                    <div key={etapa.nome} className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: etapa.cor }}
                      />
                      <span className="text-xs text-gray-400 flex-1 truncate">{etapa.nome}</span>
                      <span className="text-xs font-bold text-gray-900">{etapa.count}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Leads por mês */}
            {Object.keys(leadsPorMes).length > 0 && (
              <Card>
                <CardHeader><CardTitle>Leads por Mês</CardTitle></CardHeader>
                <div className="space-y-2">
                  {Object.entries(leadsPorMes)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .slice(0, 6)
                    .map(([mes, data]) => {
                      const [ano, m] = mes.split('-')
                      const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
                      const label = `${meses[parseInt(m) - 1]}/${ano.slice(2)}`
                      return (
                        <div key={mes} className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 w-12">{label}</span>
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${Math.min(100, data.total * 10)}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-gray-400 w-4 text-right">{data.total}</span>
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
