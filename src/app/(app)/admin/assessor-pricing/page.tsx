export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { getProfile } from '@/lib/auth/getProfile'
import { listPricing, savePricing, deletePricing, listTiers, saveTiers } from './actions'
import { PricingView } from './View'

export default async function AssessorPricingPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  const initial = await listPricing()

  return (
    <div>
      <Header title="Tarifas por Barra" />
      <HeroBanner>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-2">
              Administração · Receita
            </p>
            <h1 className="text-3xl font-bold text-white tracking-tight">Tarifas por Barra</h1>
            <p className="text-blue-200/60 mt-1 text-sm">
              Preço por lote operado, modelo de zeragem e tarifa Bovespa de cada barra/assessor.
            </p>
          </div>
        </div>
      </HeroBanner>
      <PricingView initial={initial} actions={{ savePricing, deletePricing, listTiers, saveTiers }} />
    </div>
  )
}
