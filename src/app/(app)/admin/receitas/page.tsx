export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { redirect } from 'next/navigation'
import { ReceitasView } from './ReceitasView'

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

export default async function ReceitasPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  const supabase = createAdminClient()
  const supabaseSession = await createClient()

  const [
    { data: resumo },
    { data: porMes },
    { data: porAssessor },
    { data: porCliente },
    { data: registros },
    { data: importacoes },
    { data: assessores },
    { data: influenciadores },
    { data: totalBrutoData },
  ] = await Promise.all([
    supabaseSession.rpc('receitas_resumo').single(),
    supabaseSession.rpc('receitas_por_mes'),
    supabaseSession.rpc('receitas_por_assessor'),
    supabaseSession.rpc('receitas_por_cliente'),
    supabase
      .from('receitas')
      .select('id, data_receita, cliente_nome, cpf_cnpj, assessor_nome, produto, tipo_produto, receita_genial, valor_bruto_aai, imposto, valor_liquido_aai, cliente:clientes(id, nome, influenciador:influenciadores(id, nome, codigo)), assessor:profiles(id, nome)')
      .order('data_receita', { ascending: false })
      .limit(1000),
    supabase
      .from('receitas_importacoes')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, nome')
      .in('role', ['admin', 'vendedor'])
      .order('nome'),
    supabase
      .from('influenciadores')
      .select('id, nome, codigo')
      .order('nome'),
    supabaseSession.rpc('receitas_total_bruto'),
  ])

  type ReceitasResumo = { total_liquido: number; mes_atual: number; num_meses: number }
  const res = (resumo as ReceitasResumo | null) ?? { total_liquido: 0, mes_atual: 0, num_meses: 0 }
  const totalBruto = Number(totalBrutoData ?? 0)

  return (
    <div>
      <Header title="Receitas" />

      <HeroBanner>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-2">
              Administração
            </p>
            <h1 className="text-3xl font-bold text-white tracking-tight">Receitas</h1>
            <p className="text-blue-200/60 mt-1 text-sm">
              Análise de receitas e comissões da carteira
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Receita Bruta Total',  value: formatBRL(totalBruto) },
              { label: 'Receita Líquida Total', value: formatBRL(res.total_liquido ?? 0) },
              { label: 'Mês Atual (Líquido)',   value: formatBRL(res.mes_atual ?? 0) },
              { label: 'Meses com dados',        value: String(res.num_meses ?? 0) },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl px-4 py-3 text-center"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <p className="text-xs text-blue-200/70 uppercase tracking-wide mb-1 leading-tight">{label}</p>
                <p className="text-lg font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </HeroBanner>

      <ReceitasView
        resumo={res}
        porMes={porMes ?? []}
        porAssessor={porAssessor ?? []}
        porCliente={porCliente ?? []}
        registros={(registros ?? []) as never}
        importacoes={importacoes ?? []}
        assessores={assessores ?? []}
        influenciadores={influenciadores ?? []}
      />
    </div>
  )
}
