export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { redirect } from 'next/navigation'
import { CRMView } from './CRMView'

export default async function CRMPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (!['admin', 'vendedor'].includes(profile.role)) redirect('/dashboard')

  const supabase = await createClient()

  let leadsQuery = supabase
    .from('leads')
    .select(`*, etapa:funil_etapas(*), influenciador:influenciadores(*), vendedor:profiles(*)`)
    .order('created_at', { ascending: false })

  if (profile.role === 'vendedor') {
    leadsQuery = leadsQuery.eq('vendedor_id', profile.id)
  }

  const [
    { data: leads },
    { data: etapas },
    { data: assessores },
  ] = await Promise.all([
    leadsQuery,
    supabase.from('funil_etapas').select('*').order('ordem'),
    supabase.from('profiles').select('id, nome').in('role', ['admin', 'vendedor']).order('nome'),
  ])

  const total = leads?.length ?? 0
  const ativos = leads?.filter((l) => l.status === 'ativo').length ?? 0
  const convertidos = leads?.filter((l) => l.status === 'convertido').length ?? 0
  const perdidos = leads?.filter((l) => l.status === 'perdido').length ?? 0

  return (
    <div>
      <Header title="CRM — Leads" />

      <HeroBanner>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-2">
              Gestão
            </p>
            <h1 className="text-3xl font-bold text-white tracking-tight">CRM / Leads</h1>
            <p className="text-blue-200/60 mt-1 text-sm">
              Funil de vendas e gestão de oportunidades
            </p>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total',      value: total },
              { label: 'No funil',   value: ativos },
              { label: 'Convertidos', value: convertidos },
              { label: 'Perdidos',   value: perdidos },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl px-4 py-3 text-center"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <p className="text-xs text-blue-200/70 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-2xl font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </HeroBanner>

      <CRMView
        leads={leads ?? []}
        etapas={etapas ?? []}
        assessores={assessores ?? []}
        isAdmin={profile.role === 'admin'}
      />
    </div>
  )
}
