export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { redirect } from 'next/navigation'
import { ClientesTable } from './ClientesTable'

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; classificacao?: string }>
}) {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (!['admin', 'vendedor'].includes(profile.role)) redirect('/dashboard')

  const { q, status, classificacao } = await searchParams
  const supabase = createAdminClient()

  // Fetch clients and latest scores in parallel
  const PAGE_SIZE = 1000
  let allClientes: Record<string, unknown>[] = []
  let page = 0

  while (true) {
    let query = supabase
      .from('clientes')
      .select(`
        *,
        assessor:profiles(nome),
        influenciador:influenciadores(nome, codigo)
      `)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (q) query = query.or(`nome.ilike.%${q}%,cpf.ilike.%${q}%,email.ilike.%${q}%`)
    if (status) query = query.eq('status', status)

    const { data } = await query
    if (!data || data.length === 0) break
    allClientes = allClientes.concat(data as Record<string, unknown>[])
    if (data.length < PAGE_SIZE) break
    page++
  }

  // Fetch latest score per client separately (join ordering is unreliable)
  const { data: allScores } = await supabase
    .from('cliente_scores')
    .select('cliente_id, score_total, classificacao, tendencia, created_at')
    .order('created_at', { ascending: false })

  const latestScoreMap = new Map<string, { score_total: number; classificacao: string; tendencia: string }>()
  for (const s of allScores ?? []) {
    if (!latestScoreMap.has(s.cliente_id)) {
      latestScoreMap.set(s.cliente_id, { score_total: s.score_total, classificacao: s.classificacao, tendencia: s.tendencia })
    }
  }

  // Attach latest score to each client
  const clientes = allClientes.map((c) => ({
    ...c,
    ultimo_score: latestScoreMap.has(c.id as string)
      ? [latestScoreMap.get(c.id as string)]
      : [],
  }))

  // Filtrar por classificação do score
  const clientesFiltrados = classificacao
    ? clientes.filter((c) => (c.ultimo_score as any[])[0]?.classificacao === classificacao)
    : clientes

  const { data: assessores } = await supabase
    .from('profiles')
    .select('id, nome')
    .in('role', ['admin', 'vendedor'])
    .order('nome')

  return (
    <div>
      <Header title="Clientes" />
      <ClientesTable
        clientes={clientesFiltrados as any}
        assessores={assessores ?? []}
        filtros={{ q, status, classificacao }}
        isAdmin={profile.role === 'admin'}
      />
    </div>
  )
}
