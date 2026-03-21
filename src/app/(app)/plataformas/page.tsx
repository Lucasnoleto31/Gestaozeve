export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { redirect } from 'next/navigation'
import { TrendingUp, TrendingDown, DollarSign, BarChart2 } from 'lucide-react'
import { NovaPlataformaModal } from './NovaPlataformaModal'
import { ImportarWrapper } from './ImportarWrapper'
import { PlataformasClient } from './PlataformasClient'
import { MesFiltroClient } from './MesFiltroClient'

export default async function PlataformasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (!['admin', 'vendedor'].includes(profile.role)) redirect('/dashboard')

  const { mes } = await searchParams
  const mesAtual = mes ?? new Date().toISOString().slice(0, 7)

  const supabase = await createClient()

  const { data: plataformas } = await supabase
    .from('plataformas')
    .select('*, cliente:clientes(id, nome, conta_genial, assessor:profiles(nome), influenciador:influenciadores(nome, codigo))')
    .eq('mes_referencia', mesAtual)
    .order('created_at', { ascending: false })

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nome, conta_genial')
    .eq('status', 'ativo')
    .order('nome')

  const all = plataformas ?? []
  const totalValor = all.reduce((s, p) => s + (p.valor ?? 0), 0)
  const totalPositivo = all.filter((p) => p.valor > 0).reduce((s, p) => s + p.valor, 0)
  const totalNegativo = all.filter((p) => p.valor < 0).reduce((s, p) => s + p.valor, 0)
  const totalRegistros = all.length

  function fmt(v: number) {
    const abs = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return v < 0 ? `- R$ ${abs}` : `R$ ${abs}`
  }

  const [anoMes, mesMes] = mesAtual.split('-')
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  const mesLabel = `${meses[parseInt(mesMes) - 1]} ${anoMes}`

  return (
    <div>
      <Header title="Plataformas" />

      <HeroBanner>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-2">
                Gestão
              </p>
              <h1 className="text-3xl font-bold text-white tracking-tight">Plataformas</h1>
              <p className="text-blue-200/60 mt-1 text-sm">{mesLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="rounded-xl px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <MesFiltroClient mesAtual={mesAtual} />
              </div>
              <div
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <ImportarWrapper />
                <NovaPlataformaModal clientes={clientes ?? []} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total do Mês',    value: fmt(totalValor),    positive: totalValor >= 0 },
              { label: 'Total Positivo',  value: fmt(totalPositivo), positive: true },
              { label: 'Total Negativo',  value: fmt(totalNegativo), positive: false },
              { label: 'Registros',       value: String(totalRegistros), positive: true },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl px-4 py-3"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <p className="text-xs text-blue-200/70 uppercase tracking-wide mb-1 leading-tight">{label}</p>
                <p className="text-lg font-bold text-white tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </HeroBanner>

      <div className="p-6">
        <PlataformasClient
          plataformas={all as any}
          isAdmin={profile.role === 'admin'}
        />
      </div>
    </div>
  )
}
