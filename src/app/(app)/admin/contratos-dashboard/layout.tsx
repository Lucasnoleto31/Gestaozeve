export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { getProfile } from '@/lib/auth/getProfile'
import { DashboardShell } from './_lib/Shell'

export default async function ContratosDashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  return (
    <div>
      <Header title="Dashboard de Contratos" />
      <HeroBanner compact>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Dashboard de Contratos</h1>
            <p className="text-blue-200/60 text-xs">
              Lotes girados por corretora, barra, produto e cliente. Filtros no topo valem para todas as abas.
            </p>
          </div>
        </div>
      </HeroBanner>
      <DashboardShell>{children}</DashboardShell>
    </div>
  )
}
