export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { redirect } from 'next/navigation'
import { ContratosView } from './ContratosView'
import { FileStack } from 'lucide-react'

export default async function ContratosPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  const supabase = await createClient()

  const PAGE_SIZE = 1000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allContratos: any[] = []
  let from = 0
  while (true) {
    const { data } = await supabase
      .from('contratos')
      .select('*, cliente:clientes(id, nome)')
      .order('data', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (!data?.length) break
    allContratos = [...allContratos, ...data]
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  const { data: importacoes } = await supabase
    .from('contratos_importacoes')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div>
      <Header title="Contratos" />

      <HeroBanner>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-2">
              Administração
            </p>
            <h1 className="text-3xl font-bold text-white tracking-tight">Contratos</h1>
            <p className="text-blue-200/60 mt-1 text-sm">
              Histórico e importação de contratos da plataforma
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="rounded-xl px-4 py-3 text-center"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <p className="text-xs text-blue-200/70 uppercase tracking-wide mb-1">Registros</p>
              <p className="text-2xl font-bold text-white">{allContratos.length.toLocaleString('pt-BR')}</p>
            </div>
            <div
              className="rounded-xl px-4 py-3 text-center"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <p className="text-xs text-blue-200/70 uppercase tracking-wide mb-1">Importações</p>
              <p className="text-2xl font-bold text-white">{importacoes?.length ?? 0}</p>
            </div>
          </div>
        </div>
      </HeroBanner>

      <ContratosView
        contratos={allContratos}
        importacoes={importacoes ?? []}
      />
    </div>
  )
}
