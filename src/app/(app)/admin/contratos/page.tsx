export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
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
    <ContratosView
      resumo={res}
      porMes={(porMes as PorMesRow[] | null) ?? []}
      porAssessor={(porAssessor as PorNomeRow[] | null) ?? []}
      porCliente={(porCliente as PorNomeRow[] | null) ?? []}
      contratos={contratos ?? []}
      importacoes={importacoes ?? []}
    />
  )
}
