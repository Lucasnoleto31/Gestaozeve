import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { redirect, notFound } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { MoverEtapaButton } from './MoverEtapaButton'
import { TemperaturaButton } from './TemperaturaButton'
import { MarcarPerdidoModal } from './MarcarPerdidoModal'
import { ConverterParaClienteModal } from './ConverterParaClienteModal'
import { LeadNotaForm } from './LeadNotaForm'
import { Phone, Mail, Calendar, User, Clock, MessageCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const statusConfig = {
  ativo: { label: 'Ativo', variant: 'warning' as const },
  convertido: { label: 'Convertido', variant: 'success' as const },
  perdido: { label: 'Perdido', variant: 'danger' as const },
}

function diasNaEtapa(etapaId: string, historico: { etapa_nova_id: string; created_at: string }[]) {
  const entrada = [...historico].reverse().find((h) => h.etapa_nova_id === etapaId)
  const desde = entrada ? new Date(entrada.created_at) : null
  if (!desde) return null
  return Math.floor((Date.now() - desde.getTime()) / 86400000)
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('leads')
    .select(`*, etapa:funil_etapas(*), influenciador:influenciadores(*), vendedor:profiles(*)`)
    .eq('id', id)
    .single()

  if (!lead) notFound()

  const [
    { data: historico },
    { data: etapas },
    { data: scripts },
    { data: notas },
    { data: assessores },
  ] = await Promise.all([
    supabase.from('lead_historico').select(`*, etapa_nova:funil_etapas(*), vendedor:profiles(nome)`).eq('lead_id', id).order('created_at', { ascending: false }),
    supabase.from('funil_etapas').select('*').order('ordem'),
    supabase.from('scripts').select('*').eq('etapa_id', lead.etapa_id).order('ordem'),
    supabase.from('lead_notas').select('*, autor:profiles(nome)').eq('lead_id', id).order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, nome').in('role', ['admin', 'vendedor']).order('nome'),
  ])

  const canEdit = ['admin', 'vendedor'].includes(profile.role)
  const diasEtapa = diasNaEtapa(lead.etapa_id, historico ?? [])
  const telefoneWhatsapp = lead.telefone?.replace(/\D/g, '')
  const iniciais = lead.nome.trim().split(' ').map((p: string) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <div>
      <Header title={lead.nome} />

      <HeroBanner>
        <Link
          href="/crm"
          className="inline-flex items-center gap-1.5 text-xs text-blue-200/70 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar para CRM
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          <div className="flex items-center gap-5">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl font-bold text-white select-none"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.22)' }}
            >
              {iniciais}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-white tracking-tight">{lead.nome}</h1>
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                  style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
                >
                  {statusConfig[lead.status as keyof typeof statusConfig]?.label ?? lead.status}
                </span>
                {diasEtapa !== null && (
                  <span
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}
                  >
                    <Clock className="w-3 h-3" />
                    há {diasEtapa}d nesta etapa
                  </span>
                )}
              </div>
              {lead.etapa && (
                <p className="text-sm text-blue-200/70 mt-1">
                  Etapa: <span className="text-blue-200/90 font-medium">{lead.etapa.nome}</span>
                </p>
              )}
              {lead.vendedor && (
                <p className="text-xs text-blue-200/60 mt-0.5">Responsável: {lead.vendedor.nome}</p>
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
              >
                <MessageCircle className="w-3.5 h-3.5" />
                WhatsApp
              </a>
            )}
            {lead.telefone && (
              <a
                href={`tel:${lead.telefone}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all"
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <Phone className="w-3.5 h-3.5" />
                Ligar
              </a>
            )}
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all"
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <Mail className="w-3.5 h-3.5" />
                E-mail
              </a>
            )}
            {canEdit && <TemperaturaButton leadId={id} temperatura={lead.temperatura} />}
            {canEdit && lead.status === 'ativo' && (
              <>
                <ConverterParaClienteModal leadId={id} nomePreenchido={lead.nome} assessores={assessores ?? []} />
                <MarcarPerdidoModal leadId={id} />
              </>
            )}
          </div>
        </div>
      </HeroBanner>

      <div className="p-6 space-y-6">
        {/* Motivo da perda */}
        {lead.status === 'perdido' && lead.motivo_perda && (
          <div
            className="rounded-xl px-4 py-3"
            style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)' }}
          >
            <p className="text-xs text-red-600 font-semibold mb-1">Motivo da perda</p>
            <p className="text-sm text-gray-700">{lead.motivo_perda}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Info do Lead */}
            <Card>
              <CardHeader><CardTitle>Informações do Lead</CardTitle></CardHeader>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  { icon: Mail,     label: 'E-mail',        value: lead.email },
                  { icon: Phone,    label: 'Telefone',      value: lead.telefone },
                  { icon: Calendar, label: 'Cadastrado em', value: formatDate(lead.created_at) },
                  { icon: User,     label: 'Origem',        value: lead.influenciador ? `@${lead.influenciador.codigo}` : (lead.origem || '—') },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-2">
                    <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="text-gray-700">{value || '—'}</p>
                    </div>
                  </div>
                ))}
              </div>
              {lead.observacoes && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <p className="text-xs text-gray-500 mb-1">Observações</p>
                  <p className="text-sm text-gray-600">{lead.observacoes}</p>
                </div>
              )}
            </Card>

            {/* Notas de interação */}
            <Card>
              <CardHeader><CardTitle>Notas de Interação</CardTitle></CardHeader>
              {canEdit && <LeadNotaForm leadId={id} />}
              <div className="mt-4 space-y-3">
                {!notas?.length && (
                  <p className="text-sm text-gray-500 text-center py-2">Nenhuma nota registrada ainda.</p>
                )}
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

            {/* Scripts da etapa atual */}
            {scripts && scripts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Scripts — {lead.etapa?.nome}</CardTitle>
                </CardHeader>
                <div className="space-y-4">
                  {scripts.map((script, i) => (
                    <div key={script.id} className="rounded-lg p-4" style={{ background: 'var(--surface-3)', border: '1px solid var(--border-subtle)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="w-5 h-5 rounded text-xs flex items-center justify-center font-semibold text-white flex-shrink-0"
                          style={{ background: 'var(--blue)' }}
                        >
                          {i + 1}
                        </span>
                        <p className="text-sm font-medium text-gray-700">{script.titulo}</p>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{script.conteudo}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Histórico de movimentações */}
            <Card>
              <CardHeader><CardTitle>Histórico de Movimentações</CardTitle></CardHeader>
              <div className="space-y-3">
                {!historico?.length && (
                  <p className="text-sm text-gray-500 text-center py-4">Nenhum histórico ainda.</p>
                )}
                {historico?.map((h) => (
                  <div key={h.id} className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--blue)' }} />
                    <div>
                      <p className="text-gray-600">
                        Movido para <span className="text-blue-600 font-medium">{h.etapa_nova?.nome}</span>
                        {h.vendedor && <span className="text-gray-500"> por {h.vendedor.nome}</span>}
                      </p>
                      {h.observacao && <p className="text-gray-500 text-xs mt-0.5">{h.observacao}</p>}
                      <p className="text-gray-400 text-xs mt-0.5">{formatDate(h.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Etapa no Funil</CardTitle></CardHeader>
              <div
                className="flex items-center gap-2 py-2 px-3 rounded-lg mb-3"
                style={{
                  background: 'var(--surface-3)',
                  borderLeft: `3px solid ${lead.etapa?.cor ?? 'var(--blue)'}`,
                }}
              >
                <span className="text-sm font-medium text-gray-900">{lead.etapa?.nome}</span>
                {diasEtapa !== null && <span className="ml-auto text-xs text-gray-500">{diasEtapa}d</span>}
              </div>

              <div className="space-y-1 mb-4">
                {etapas?.map((etapa) => (
                  <div
                    key={etapa.id}
                    className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${etapa.id === lead.etapa_id ? 'font-semibold text-gray-900' : 'text-gray-400'}`}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: etapa.id === lead.etapa_id ? etapa.cor : '#D1D5DB' }} />
                    {etapa.nome}
                  </div>
                ))}
              </div>

              {canEdit && lead.status === 'ativo' && (
                <MoverEtapaButton
                  leadId={lead.id}
                  etapaAtualId={lead.etapa_id}
                  etapas={etapas ?? []}
                  canEdit={canEdit}
                />
              )}
            </Card>

            {lead.influenciador && (
              <Card>
                <CardHeader><CardTitle>Indicado por</CardTitle></CardHeader>
                <p className="text-sm text-gray-900">{lead.influenciador.nome}</p>
                <p className="text-xs text-blue-600 mt-1">@{lead.influenciador.codigo}</p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
