export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { getProfile } from '@/lib/auth/getProfile'
import { listMetas, saveMeta, deleteMeta } from './actions'
import { MetasView } from './View'

export default async function MetasPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  const initial = await listMetas()

  return (
    <div>
      <Header title="Metas Anuais" />
      <HeroBanner>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-2">
              Administração · Receita
            </p>
            <h1 className="text-3xl font-bold text-white tracking-tight">Metas Anuais</h1>
            <p className="text-blue-200/60 mt-1 text-sm">
              Defina meta de lotes e receita por ano. O dashboard mostra o tracking em tempo real.
            </p>
          </div>
        </div>
      </HeroBanner>
      <MetasView initial={initial} actions={{ saveMeta, deleteMeta }} />
    </div>
  )
}
