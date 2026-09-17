export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { getCobertura } from '@/app/(app)/admin/contratos-dashboard/actions'
import { listarLogImportacoes } from './actions'
import { ContratosView } from './ContratosView'

type ContratosResumo = { total_operados: number; total_zerados: number; num_contratos: number }
type PorMesRow = { mes: string; operados: number; zerados: number }
type PorNomeRow = { nome: string; operados: number; zerados: number }

export default async function ContratosPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  const supabase = await createClient()

  // Importações com o autor (FK criado_por → profiles); sem o embed, cai no select simples
  const importacoesQuery = async () => {
    const comAutor = await supabase
      .from('contratos_importacoes')
      .select('*, autor:profiles!criado_por(nome)')
      .order('created_at', { ascending: false })
    if (!comAutor.error) return comAutor.data ?? []
    const simples = await supabase.from('contratos_importacoes').select('*').order('created_at', { ascending: false })
    return simples.data ?? []
  }

  const [
    { data: resumo },
    { data: porMes },
    { data: porAssessor },
    { data: porCliente },
    { data: contratos },
    importacoes,
    cobertura,
    log,
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
    importacoesQuery(),
    getCobertura(60).catch(() => null),
    listarLogImportacoes(30).catch(() => []),
  ])

  const res = (resumo as ContratosResumo | null) ?? { total_operados: 0, total_zerados: 0, num_contratos: 0 }

  return (
    <ContratosView
      resumo={res}
      porMes={(porMes as PorMesRow[] | null) ?? []}
      porAssessor={(porAssessor as PorNomeRow[] | null) ?? []}
      porCliente={(porCliente as PorNomeRow[] | null) ?? []}
      contratos={contratos ?? []}
      importacoes={importacoes}
      cobertura={cobertura}
      log={log}
      hoje={fmtDate(hojeBrasil())}
    />
  )
}
