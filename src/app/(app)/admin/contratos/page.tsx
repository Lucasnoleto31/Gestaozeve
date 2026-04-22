export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { redirect } from 'next/navigation'
import { ContratosView } from './ContratosView'

type ContratosResumo = { total_operados: number; total_zerados: number; num_contratos: number }
type PorMesRow = { mes: string; operados: number; zerados: number }
type PorNomeRow = { nome: string; operados: number; zerados: number }

export default async function ContratosPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  const supabase = await createClient()

  const [
    { data: resumo },
    { data: porMes },
    { data: porAssessor },
    { data: porCliente },
    { data: contratos },
    { data: importacoes },
  ] = await Promise.all([
    supabase.rpc('contratos_resumo').single(),
    supabase.rpc('contratos_por_mes'),
    supabase.rpc('contratos_por_assessor'),
    supabase.rpc('contratos_por_cliente'),
    supabase
      .from('contratos')
      .select('*, cliente:clientes(id, nome)')
      .order('data', { ascending: false })
      .limit(1000),
    supabase
      .from('contratos_importacoes')
      .select('*')
      .order('created_at', { ascending: false }),
  ])

  const res = (resumo as ContratosResumo | null) ?? { total_operados: 0, total_zerados: 0, num_contratos: 0 }

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
              <p className="text-2xl font-bold text-white">{Number(res.num_contratos ?? 0).toLocaleString('pt-BR')}</p>
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
        resumo={res}
        porMes={(porMes as PorMesRow[] | null) ?? []}
        porAssessor={(porAssessor as PorNomeRow[] | null) ?? []}
        porCliente={(porCliente as PorNomeRow[] | null) ?? []}
        contratos={contratos ?? []}
        importacoes={importacoes ?? []}
      />
    </div>
  )
}
