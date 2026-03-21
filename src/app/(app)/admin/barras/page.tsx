export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { Card } from '@/components/ui/Card'
import { redirect } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { BarrasClient } from './BarrasClient'

export default async function BarrasPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  const supabase = createAdminClient()

  const [
    { data: barras },
    { data: assessores },
    { data: influenciadores },
  ] = await Promise.all([
    supabase
      .from('barras')
      .select('*, assessor:profiles(nome), influenciador:influenciadores(nome, codigo)')
      .order('nome'),
    supabase.from('profiles').select('id, nome').in('role', ['admin', 'vendedor']).order('nome'),
    supabase.from('influenciadores').select('id, nome, codigo').order('nome'),
  ])

  return (
    <div>
      <Header title="Barras da Corretora" />
      <HeroBanner>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-300 mb-1">Configuração</p>
            <h1 className="text-2xl font-bold text-white">Barras da Corretora</h1>
            <p className="text-sm text-blue-100/60 mt-0.5">
              Mapeie o nome de cada barra (como aparece no Excel) para o assessor e/ou influenciador correspondente.
            </p>
          </div>
        </div>
      </HeroBanner>

      <div className="p-6 max-w-4xl">
        <Card>
          <BarrasClient
            barras={barras ?? []}
            assessores={assessores ?? []}
            influenciadores={influenciadores ?? []}
          />
        </Card>
      </div>
    </div>
  )
}
