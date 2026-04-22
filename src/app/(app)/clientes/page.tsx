export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { redirect } from 'next/navigation'
import { ClientesTable } from './ClientesTable'

const PAGE_LIMIT = 1000

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

  let query = supabase
    .from('clientes_com_score')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (q) query = query.or(`nome.ilike.%${q}%,cpf.ilike.%${q}%,email.ilike.%${q}%`)
  if (status) query = query.eq('status', status)
  if (classificacao) query = query.eq('classificacao', classificacao)

  const [
    { data: clientesRows, count, error: clientesError },
    { data: classificacaoCounts },
    { data: assessores },
    { data: influenciadores },
  ] = await Promise.all([
    query.range(0, PAGE_LIMIT - 1),
    supabase.rpc('clientes_classificacao_counts'),
    supabase.from('profiles').select('id, nome').in('role', ['admin', 'vendedor']).order('nome'),
    supabase.from('influenciadores').select('id, nome, codigo'),
  ])

  if (clientesError) {
    console.error('[clientes/page] query falhou:', clientesError)
    return (
      <div>
        <Header title="Clientes" />
        <div className="p-8">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 max-w-2xl">
            <h2 className="text-base font-semibold text-red-800 mb-2">Erro ao carregar clientes</h2>
            <p className="text-sm text-red-700 mb-4">{clientesError.message}</p>
            <pre className="text-xs bg-white border border-red-200 rounded-lg p-3 overflow-auto text-red-700">
              {JSON.stringify(clientesError, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    )
  }

  // Monta os joins em JS (views não propagam FKs do PostgREST)
  const assessorMap = new Map((assessores ?? []).map((a) => [a.id, { nome: a.nome }]))
  const influenciadorMap = new Map(
    (influenciadores ?? []).map((i) => [i.id, { nome: i.nome, codigo: i.codigo }])
  )

  const clientes = (clientesRows ?? []).map((c) => ({
    ...c,
    assessor: c.assessor_id ? assessorMap.get(c.assessor_id) ?? null : null,
    influenciador: c.influenciador_id ? influenciadorMap.get(c.influenciador_id) ?? null : null,
    ultimo_score: c.score_total != null
      ? [{ score_total: c.score_total, classificacao: c.classificacao, tendencia: c.tendencia }]
      : [],
  }))

  const classCountMap = new Map<string, number>(
    (classificacaoCounts ?? []).map((r: { classificacao: string; total: number }) => [r.classificacao, Number(r.total)])
  )
  const kpis = {
    saudaveis: classCountMap.get('saudavel') ?? 0,
    atencao: classCountMap.get('atencao') ?? 0,
    risco: classCountMap.get('risco') ?? 0,
  }

  return (
    <div>
      <Header title="Clientes" />
      <ClientesTable
        clientes={clientes as any}
        total={count ?? clientes.length}
        kpis={kpis}
        assessores={assessores ?? []}
        filtros={{ q, status, classificacao }}
        isAdmin={profile.role === 'admin'}
      />
    </div>
  )
}
