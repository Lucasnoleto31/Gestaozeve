import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { redirect } from 'next/navigation'
import { RelatoriosClient } from './RelatoriosClient'
import * as actions from './actions'

export default async function RelatoriosPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  return (
    <div>
      <Header title="Relatórios" />

      <HeroBanner>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-2">
          Administração
        </p>
        <h1 className="text-3xl font-bold text-white tracking-tight">Relatórios</h1>
        <p className="text-blue-200/60 mt-1 text-sm">
          Exporte e analise os dados da plataforma
        </p>
      </HeroBanner>

      <RelatoriosClient actions={actions} />
    </div>
  )
}
