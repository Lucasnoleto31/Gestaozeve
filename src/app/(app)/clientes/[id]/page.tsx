import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDate, formatCPF, formatCurrency, cn } from '@/lib/utils'
import { ScoreGauge, ScoreBadge } from '@/components/chs/ScoreGauge'
import {
  getClassificacaoConfig,
  calcularSegmento,
  getSegmentoConfig,
  calcularRiscoChurn,
} from '@/lib/chs/calculator'
import { Classificacao, Tendencia } from '@/types/cliente'
import { RecalcularScoreButton } from './RecalcularScoreButton'
import { NovaNotaForm } from './NovaNotaForm'
import { AtualizarDadosCHSModal } from './AtualizarDadosCHSModal'
import { AcaoStatusButton } from './AcaoStatusButton'
import { ProximoContatoCard } from './ProximoContatoCard'
import { ClienteCharts } from '@/components/charts/ClienteCharts'
import {
  Edit, User, Phone, Mail, Calendar, MapPin, Briefcase,
  TrendingUp, Building2, AlertTriangle, CheckCircle, Zap,
  MessageCircle, DollarSign, BarChart2, Clock, Activity,
  AlertOctagon, ArrowLeft, CreditCard, Wallet, Star,
} from 'lucide-react'

const statusConfig = {
  ativo: { label: 'Ativo', variant: 'success' as const },
  inativo: { label: 'Inativo', variant: 'danger' as const },
  em_transferencia: { label: 'Transferência', variant: 'warning' as const },
}

const tipoAcaoConfig = {
  tarefa: { label: 'Tarefa', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
  nutricao: { label: 'Nutrição', icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  upsell: { label: 'Upsell', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
}

const churnConfig = {
  alto: { label: 'Alto', color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
  medio: { label: 'Médio', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  baixo: { label: 'Baixo', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
}

export default async function ClienteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (!['admin', 'vendedor'].includes(profile.role)) redirect('/dashboard')

  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  const { data: cliente } = await supabase
    .from('clientes')
    .select(`*, assessor:profiles(id, nome), influenciador:influenciadores(nome, codigo)`)
    .eq('id', id)
    .single()

  if (!cliente) notFound()

  const [
    { data: contas },
    { data: scores },
    { data: acoes },
    { data: notas },
    { data: dadosCHS },
    { data: followups },
    { data: contratos },
    { data: receitasCliente },
  ] = await Promise.all([
    supabaseAdmin.from('cliente_contas').select('*').eq('cliente_id', id).order('created_at'),
    supabaseAdmin.from('cliente_scores').select('*').eq('cliente_id', id).order('created_at', { ascending: false }).limit(10),
    supabaseAdmin.from('cliente_acoes').select('*').eq('cliente_id', id).order('created_at', { ascending: false }),
    supabaseAdmin.from('cliente_notas').select('*, autor:profiles(nome)').eq('cliente_id', id).order('created_at', { ascending: false }),
    supabaseAdmin.from('cliente_dados_chs').select('*').eq('cliente_id', id).single(),
    supabaseAdmin.from('cliente_followups').select('*').eq('cliente_id', id).eq('status', 'pendente').order('agendado_para').limit(1),
    supabaseAdmin.from('contratos').select('*').eq('cliente_id', id).order('data', { ascending: false }).limit(1000),
    supabaseAdmin.from('receitas').select('data_receita, receita_genial, valor_liquido_aai').eq('cliente_id', id).order('data_receita'),
  ])

  const ultimoScore = scores?.[0]
  const capitalTotal = (contas ?? []).reduce((acc, c) => acc + (c.capital_alocado ?? 0), 0)
  const acoesPendentes = (acoes ?? []).filter((a) => a.status === 'pendente')
  const proximoFollowup = followups?.[0] ?? null

  // ── Métricas computadas de contratos ─────────────────────────────────────
  const hoje = new Date()
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`

  const lotesPorMes: Record<string, { girados: number; zerados: number }> = {}
  for (const c of contratos ?? []) {
    if (!c.data) continue
    const mes = String(c.data).slice(0, 7)
    if (!lotesPorMes[mes]) lotesPorMes[mes] = { girados: 0, zerados: 0 }
    lotesPorMes[mes].girados += c.lotes_operados ?? 0
    lotesPorMes[mes].zerados += c.lotes_zerados ?? 0
  }

  const mesAtualLotes = lotesPorMes[mesAtual] ?? { girados: 0, zerados: 0 }
  const lotesGiradosMes = mesAtualLotes.girados
  const lotesZeradosMes = mesAtualLotes.zerados

  const diasOperadosMes = new Set(
    (contratos ?? [])
      .filter((c) => String(c.data ?? '').startsWith(mesAtual))
      .map((c) => c.data)
  ).size

  const datasContratos = (contratos ?? [])
    .map((c) => c.data)
    .filter(Boolean)
    .sort() as string[]
  const ultimaOperacaoContrato = datasContratos.at(-1) ?? null

  const ultimaOperacao = ultimaOperacaoContrato ?? dadosCHS?.ultima_operacao ?? null

  const diasSemOperar = ultimaOperacao
    ? Math.floor((Date.now() - new Date(ultimaOperacao + 'T12:00:00').getTime()) / 86400000)
    : null

  // ── Métricas computadas de receitas ──────────────────────────────────────
  const receitaAcumulada = (receitasCliente ?? []).reduce((sum, r) => sum + (r.receita_genial ?? 0), 0)

  const receitaPorMes: Record<string, number> = {}
  for (const r of receitasCliente ?? []) {
    if (!r.data_receita) continue
    const mes = String(r.data_receita).slice(0, 7)
    receitaPorMes[mes] = (receitaPorMes[mes] ?? 0) + (r.receita_genial ?? 0)
  }

  // Receita do mês atual e anterior (para segmento)
  const meses = Object.keys(receitaPorMes).sort()
  const receitaMesAtual = receitaPorMes[mesAtual] ?? 0
  const mesAnteriorKey = meses.at(-2) ?? ''
  const receitaMesAnterior = receitaPorMes[mesAnteriorKey] ?? 0

  // ── Segmento e churn ─────────────────────────────────────────────────────
  const segmento = calcularSegmento({
    ultimaOperacao,
    receitaAtual: receitaMesAtual || dadosCHS?.receita_periodo_atual || 0,
    receitaAnterior: receitaMesAnterior || dadosCHS?.receita_periodo_anterior || 0,
    dataCriacao: cliente.created_at,
  })
  const segmentoConfig = getSegmentoConfig(segmento)

  const churn = calcularRiscoChurn(
    ultimoScore?.score_total ?? null,
    ultimaOperacao,
    ultimoScore?.tendencia as Tendencia ?? null,
  )

  // ── Dados para gráficos ──────────────────────────────────────────────────
  const scoreChartData = (() => {
    const byMes: Record<string, number> = {}
    for (const s of scores ?? []) {
      const mes = s.created_at.substring(0, 7)
      if (!byMes[mes] || s.score_total > byMes[mes]) byMes[mes] = s.score_total
    }
    return Object.entries(byMes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, score]) => ({ mes, score }))
  })()

  const lotesChartData = Object.entries(lotesPorMes)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([mes, v]) => ({ mes, girados: v.girados, zerados: v.zerados }))

  const receitaChartData = Object.entries(receitaPorMes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, receita]) => ({ mes, receita }))

  const telefoneWhatsapp = cliente.telefone?.replace(/\D/g, '')
  const iniciais = cliente.nome.trim().split(' ').map((p: string) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <div>
      <Header title={cliente.nome} />

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
          style={{ background: 'radial-gradient(ellipse 60% 80% at 80% 50%, rgba(23,100,244,0.4) 0%, transparent 70%)' }}
        />

        <div className="relative z-10 px-6 py-8">
          {/* Back navigation */}
          <Link
            href="/clientes"
            className="inline-flex items-center gap-1.5 text-xs text-blue-200/70 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar para Clientes
          </Link>

          {/* Client identity row */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
            <div className="flex items-center gap-5">
              {/* Avatar */}
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl font-bold text-white select-none"
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}
              >
                {iniciais}
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-white tracking-tight">{cliente.nome}</h1>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{
                      background: 'rgba(255,255,255,0.12)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: 'white',
                    }}
                  >
                    {statusConfig[cliente.status as keyof typeof statusConfig]?.label ?? cliente.status}
                  </span>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{
                      background: 'rgba(255,255,255,0.10)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'rgba(255,255,255,0.85)',
                    }}
                  >
                    {segmentoConfig.label}
                  </span>
                </div>
                <p className="text-sm text-blue-200/70 font-mono mt-1">{formatCPF(cliente.cpf)}</p>
                {cliente.assessor && (
                  <p className="text-xs text-blue-200/60 mt-0.5">Assessor: {cliente.assessor.nome}</p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {telefoneWhatsapp && (
                <a
                  href={`https://wa.me/55${telefoneWhatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all"
                  style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
                  onMouseEnter={undefined}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </a>
              )}
              {cliente.telefone && (
                <a
                  href={`tel:${cliente.telefone}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all"
                  style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
                >
                  <Phone className="w-3.5 h-3.5" />
                  Ligar
                </a>
              )}
              {cliente.email && (
                <a
                  href={`mailto:${cliente.email}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all"
                  style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
                >
                  <Mail className="w-3.5 h-3.5" />
                  E-mail
                </a>
              )}
              <Link href={`/clientes/${id}/editar`}>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer transition-all"
                  style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}
                >
                  <Edit className="w-3.5 h-3.5" />
                  Editar
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Page content ── */}
      <div className="p-6 space-y-6">

        {/* Metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            {
              icon: DollarSign,
              label: 'Receita Acumulada',
              value: formatCurrency(receitaAcumulada || dadosCHS?.receita_acumulada || 0),
              valueColor: 'text-emerald-600',
              highlight: false,
            },
            {
              icon: BarChart2,
              label: 'Lotes Girados/Mês',
              value: (lotesGiradosMes || dadosCHS?.lotes_girados_mes || 0).toLocaleString('pt-BR'),
              valueColor: 'text-blue-600',
              highlight: false,
            },
            {
              icon: Activity,
              label: 'Lotes Zerados/Mês',
              value: (lotesZeradosMes || dadosCHS?.lotes_zerados_mes || 0).toLocaleString('pt-BR'),
              valueColor: 'text-purple-600',
              highlight: false,
            },
            {
              icon: Calendar,
              label: 'Dias Operados/Mês',
              value: (diasOperadosMes || dadosCHS?.dias_operados_mes || 0).toString(),
              valueColor: 'text-blue-600',
              highlight: false,
            },
            {
              icon: Clock,
              label: 'Última Operação',
              value: ultimaOperacao ? formatDate(ultimaOperacao) : '—',
              valueColor: 'text-gray-700',
              highlight: false,
            },
            {
              icon: AlertTriangle,
              label: 'Dias Sem Operar',
              value: diasSemOperar !== null ? `${diasSemOperar} dias` : '—',
              valueColor: diasSemOperar !== null && diasSemOperar > 60 ? 'text-red-600' : diasSemOperar !== null && diasSemOperar > 30 ? 'text-amber-600' : 'text-gray-600',
              highlight: diasSemOperar !== null && diasSemOperar > 60,
            },
            {
              icon: AlertOctagon,
              label: 'Risco de Churn',
              value: `${churn.percentual}% — ${churnConfig[churn.nivel].label}`,
              valueColor: churnConfig[churn.nivel].color,
              highlight: churn.nivel === 'alto',
            },
          ].map(({ icon: Icon, label, value, valueColor, highlight }) => (
            <div
              key={label}
              className="rounded-xl px-4 py-3"
              style={highlight
                ? { background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)' }
                : { background: '#FFFFFF', border: '1px solid var(--border-subtle)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }
              }
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={`w-3.5 h-3.5 ${highlight ? 'text-red-400' : 'text-gray-400'}`} />
                <p className="text-xs leading-tight text-gray-500">{label}</p>
              </div>
              <p className={`text-sm font-bold ${valueColor}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <ClienteCharts
          scoreData={scoreChartData}
          lotesData={lotesChartData}
          receitaData={receitaChartData}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Dados pessoais */}
            <Card>
              <CardHeader><CardTitle>Dados Pessoais</CardTitle></CardHeader>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  { icon: Mail,     label: 'E-mail',             value: cliente.email },
                  { icon: Phone,    label: 'Telefone',           value: cliente.telefone },
                  { icon: Calendar, label: 'Nascimento',         value: cliente.data_nascimento ? formatDate(cliente.data_nascimento) : null },
                  { icon: MapPin,   label: 'Estado',             value: cliente.estado },
                  { icon: User,     label: 'Sexo',               value: cliente.sexo ? ({ masculino: 'Masculino', feminino: 'Feminino', outro: 'Outro' } as Record<string, string>)[cliente.sexo] : null },
                  { icon: User,     label: 'Estado Civil',       value: cliente.estado_civil ? ({ solteiro: 'Solteiro', casado: 'Casado', divorciado: 'Divorciado', viuvo: 'Viúvo', uniao_estavel: 'União Estável' } as Record<string, string>)[cliente.estado_civil] : null },
                  { icon: Briefcase, label: 'Profissão',         value: cliente.profissao },
                  { icon: User,     label: 'Tipo de Pessoa',     value: cliente.tipo_pessoa ? (cliente.tipo_pessoa === 'F' ? 'Física' : cliente.tipo_pessoa === 'J' ? 'Jurídica' : cliente.tipo_pessoa) : null },
                  { icon: Calendar, label: 'Habilitação Genial', value: cliente.data_habilitacao ? formatDate(cliente.data_habilitacao) : null },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-2">
                    <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="text-gray-700">{value ?? '—'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Dados operacionais */}
            <Card>
              <CardHeader><CardTitle>Dados Operacionais</CardTitle></CardHeader>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  { label: 'Situação Conta',   value: cliente.situacao_conta },
                  { label: 'Perfil Genial',    value: cliente.perfil_genial ? ({ digital: 'Digital', premium: 'Premium', sem_informacao: 'Sem informação' } as Record<string, string>)[cliente.perfil_genial] : null },
                  { label: 'Perfil Investidor', value: cliente.perfil_investidor ? ({ conservador: 'Conservador', moderado: 'Moderado', arrojado: 'Arrojado', agressivo: 'Agressivo' } as Record<string, string>)[cliente.perfil_investidor] : null },
                  { label: 'Patrimônio',       value: cliente.patrimonio != null ? formatCurrency(cliente.patrimonio) : null },
                  { label: 'Tipo de Operação', value: cliente.tipo_operacao ? ({ day_trade: 'Day Trade', swing_trade: 'Swing Trade', position: 'Position', todos: 'Todos' } as Record<string, string>)[cliente.tipo_operacao] : null },
                  { label: 'Corretora de Origem', value: cliente.corretora_origem },
                  { label: 'Capital Total',    value: formatCurrency(capitalTotal) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-gray-700">{value ?? '—'}</p>
                  </div>
                ))}
              </div>
              {cliente.observacoes && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <p className="text-xs text-gray-500 mb-1">Observações</p>
                  <p className="text-sm text-gray-600">{cliente.observacoes}</p>
                </div>
              )}
            </Card>

            {/* Contas Genial */}
            <Card>
              <CardHeader>
                <CardTitle>Contas na Genial</CardTitle>
                <Badge variant="info">{contas?.length ?? 0} conta(s)</Badge>
              </CardHeader>
              {!contas?.length ? (
                <p className="text-sm text-gray-500 text-center py-4">Nenhuma conta cadastrada.</p>
              ) : (
                <div className="space-y-2">
                  {contas.map((conta) => (
                    <div key={conta.id} className="flex items-center justify-between rounded-lg px-4 py-3" style={{ background: 'var(--surface-3)' }}>
                      <div className="flex items-center gap-3">
                        <Building2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-mono font-medium text-gray-900">{conta.numero_conta}</p>
                          {conta.data_abertura && (
                            <p className="text-xs text-gray-500">Aberta em {formatDate(conta.data_abertura)}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">{formatCurrency(conta.capital_alocado)}</p>
                        <Badge variant={conta.ativa ? 'success' : 'default'}>{conta.ativa ? 'Ativa' : 'Inativa'}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Contratos */}
            <Card>
              <CardHeader>
                <CardTitle>Contratos</CardTitle>
                <Badge variant="info">{contratos?.length ?? 0} registro(s)</Badge>
              </CardHeader>
              {!contratos?.length ? (
                <p className="text-sm text-gray-500 text-center py-4">Nenhum contrato importado para este cliente.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: 'var(--surface-3)', borderBottom: '1px solid var(--border)' }}>
                        <th className="py-2 px-3 text-left text-gray-500 font-semibold">Data</th>
                        <th className="py-2 px-3 text-left text-gray-500 font-semibold">Ativo</th>
                        <th className="py-2 px-3 text-left text-gray-500 font-semibold">Plataforma</th>
                        <th className="py-2 px-3 text-left text-gray-500 font-semibold">Barra</th>
                        <th className="py-2 px-3 text-right text-gray-500 font-semibold">Operados</th>
                        <th className="py-2 px-3 text-right text-gray-500 font-semibold">Zerados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contratos.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50/80 transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td className="py-2 px-3 text-gray-600">
                            {c.data ? new Date(c.data + 'T12:00:00').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-'}
                          </td>
                          <td className="py-2 px-3 text-gray-700 font-medium">{c.ativo ?? '-'}</td>
                          <td className="py-2 px-3 text-gray-600">{c.plataforma ?? '-'}</td>
                          <td className="py-2 px-3 text-gray-600">{c.assessor_nome ?? '-'}</td>
                          <td className="py-2 px-3 text-right text-blue-600 font-medium">
                            {(c.lotes_operados ?? 0).toLocaleString('pt-BR')}
                          </td>
                          <td className="py-2 px-3 text-right font-medium">
                            <span className={c.lotes_zerados > 0 ? 'text-red-500' : 'text-gray-400'}>
                              {(c.lotes_zerados ?? 0).toLocaleString('pt-BR')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Ações automáticas */}
            {acoesPendentes.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Ações Pendentes</CardTitle>
                  <Badge variant="warning">{acoesPendentes.length}</Badge>
                </CardHeader>
                <div className="space-y-3">
                  {acoesPendentes.map((acao) => {
                    const config = tipoAcaoConfig[acao.tipo as keyof typeof tipoAcaoConfig]
                    const Icon = config.icon
                    return (
                      <div key={acao.id} className={`border rounded-xl p-4 ${config.bg}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.color}`} />
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{acao.titulo}</p>
                              {acao.descricao && <p className="text-xs text-gray-500 mt-1">{acao.descricao}</p>}
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant={acao.prioridade === 'alta' ? 'danger' : 'warning'}>{acao.prioridade}</Badge>
                                <span className="text-xs text-gray-500">{config.label}</span>
                              </div>
                            </div>
                          </div>
                          <AcaoStatusButton acaoId={acao.id} clienteId={id} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}

            {/* Notas */}
            <Card>
              <CardHeader><CardTitle>Histórico de Interações</CardTitle></CardHeader>
              <NovaNotaForm clienteId={id} />
              <div className="mt-4 space-y-3">
                {!notas?.length && <p className="text-sm text-gray-500 text-center py-2">Nenhuma nota ainda.</p>}
                {notas?.map((nota) => (
                  <div key={nota.id} className="pl-3" style={{ borderLeft: '2px solid rgba(23,100,244,0.35)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-600">{nota.autor?.nome ?? 'Sistema'}</span>
                      <span className="text-xs text-gray-400">{formatDate(nota.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-600">{nota.conteudo}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Score CHS */}
            <Card>
              <CardHeader>
                <CardTitle>Customer Health Score</CardTitle>
                <RecalcularScoreButton clienteId={id} />
              </CardHeader>

              {ultimoScore ? (
                <div className="space-y-5">
                  <div className="flex justify-center">
                    <ScoreGauge
                      score={ultimoScore.score_total}
                      classificacao={ultimoScore.classificacao as Classificacao}
                      tendencia={ultimoScore.tendencia as Tendencia}
                      size="lg"
                    />
                  </div>

                  <div className="space-y-2">
                    {[
                      { label: 'Atividade', value: ultimoScore.score_atividade, peso: '30%' },
                      { label: 'Receita', value: ultimoScore.score_receita, peso: '25%' },
                      { label: 'Volume', value: ultimoScore.score_volume, peso: '15%' },
                      { label: 'Engajamento', value: ultimoScore.score_engajamento, peso: '10%' },
                      { label: 'Relacionamento', value: ultimoScore.score_tempo, peso: '10%' },
                      { label: 'Comportamento', value: ultimoScore.score_risco, peso: '10%' },
                    ].map(({ label, value, peso }) => {
                      const pct = value ?? 0
                      const color = pct >= 80 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626'
                      return (
                        <div key={label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-500">{label} <span className="text-gray-400">({peso})</span></span>
                            <span style={{ color }}>{Math.round(pct)}</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <p className="text-xs text-gray-400 text-center">
                    Calculado em {formatDate(ultimoScore.created_at)}
                  </p>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-500 mb-3">Score não calculado ainda.</p>
                  <p className="text-xs text-gray-400">Atualize os dados operacionais e clique em calcular.</p>
                </div>
              )}

              <AtualizarDadosCHSModal clienteId={id} dados={dadosCHS} />
            </Card>

            {/* Próximo contato */}
            <Card>
              <CardHeader><CardTitle>Próximo Contato</CardTitle></CardHeader>
              <ProximoContatoCard clienteId={id} followup={proximoFollowup} />
            </Card>

            {/* Histórico de scores */}
            {(scores?.length ?? 0) > 1 && (
              <Card>
                <CardHeader><CardTitle>Histórico de Scores</CardTitle></CardHeader>
                <div className="space-y-2">
                  {scores?.slice(0, 5).map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-sm">
                      <span className="text-xs text-gray-500">{formatDate(s.created_at)}</span>
                      <ScoreBadge score={s.score_total} classificacao={s.classificacao as Classificacao} />
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Influenciador */}
            {cliente.influenciador && (
              <Card>
                <CardHeader><CardTitle>Indicado por</CardTitle></CardHeader>
                <p className="text-sm text-gray-900">{cliente.influenciador.nome}</p>
                <p className="text-xs text-blue-600 mt-1">@{cliente.influenciador.codigo}</p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
