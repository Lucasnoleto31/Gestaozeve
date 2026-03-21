import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { Users, TrendingUp, XCircle, Link2, Copy } from 'lucide-react'
import { CopyLinkButton } from './CopyLinkButton'

const statusConfig = {
  ativo: { label: 'Ativo', variant: 'success' as const },
  inativo: { label: 'Inativo', variant: 'danger' as const },
  pendente: { label: 'Pendente', variant: 'warning' as const },
}

export default async function InfluenciadorPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'influenciador') redirect('/dashboard')

  const supabase = await createClient()

  const { data: influenciador } = await supabase
    .from('influenciadores')
    .select('*')
    .eq('user_id', profile.user_id)
    .single()

  if (!influenciador) {
    return (
      <div>
        <Header title="Meu Painel" />
        <HeroBanner>
          <h1 className="text-2xl font-bold text-white">Meu Painel</h1>
          <p className="text-blue-200/60 mt-1 text-sm">Perfil de influenciador não encontrado. Contate o admin.</p>
        </HeroBanner>
      </div>
    )
  }

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nome, status, created_at, ultimo_score:cliente_scores(score_total, classificacao)')
    .eq('influenciador_id', influenciador.id)
    .order('created_at', { ascending: false })
    .order('created_at', { referencedTable: 'cliente_scores', ascending: false })
    .limit(1, { referencedTable: 'cliente_scores' })

  const allClientes = clientes ?? []
  const total = allClientes.length
  const ativos = allClientes.filter((c) => c.status === 'ativo').length
  const inativos = allClientes.filter((c) => c.status !== 'ativo').length

  const scores = allClientes
    .flatMap((c) => (c.ultimo_score as { score_total: number }[] ?? []))
    .map((s) => s.score_total)
    .filter(Boolean)
  const chsMedio = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0

  const refUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/ref/${influenciador.codigo}`
  const iniciais = profile.nome.trim().split(' ').map((p: string) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <div>
      <Header title="Meu Painel" />

      <HeroBanner>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
          <div className="flex items-center gap-5">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl font-bold text-white select-none"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.22)' }}
            >
              {iniciais}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-1">Meu espaço</p>
              <h1 className="text-2xl font-bold text-white tracking-tight">{profile.nome}</h1>
              <div className="flex items-center gap-1.5 mt-1">
                <Link2 className="w-3.5 h-3.5 text-blue-300" />
                <span className="text-sm text-blue-200/80 font-mono">@{influenciador.codigo}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Clientes', value: total },
              { label: 'Ativos',   value: ativos },
              { label: 'Inativos', value: inativos },
              { label: 'CHS Médio', value: chsMedio || '—' },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl px-3 py-3 text-center"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <p className="text-xs text-blue-200/70 uppercase tracking-wide mb-1 leading-tight">{label}</p>
                <p className="text-xl font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </HeroBanner>

      <div className="p-6 space-y-6">
        {/* Link de captação */}
        <Card>
          <CardHeader>
            <CardTitle>Seu Link de Captação</CardTitle>
            <Link2 className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <div className="flex items-center gap-3">
            <div
              className="flex-1 rounded-lg px-3 py-2 text-sm text-blue-600 font-mono truncate"
              style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}
            >
              /ref/{influenciador.codigo}
            </div>
            <CopyLinkButton text={refUrl} />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Compartilhe este link para que novos clientes sejam associados ao seu perfil.
          </p>
        </Card>

        {/* Tabela de clientes */}
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-3)' }}>
            <h3 className="text-sm font-semibold text-gray-900">Meus Clientes ({total})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-3)' }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">CHS</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Desde</th>
                </tr>
              </thead>
              <tbody>
                {allClientes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                      Nenhum cliente ainda. Compartilhe seu link para captar clientes!
                    </td>
                  </tr>
                )}
                {allClientes.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/80 transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="px-4 py-3 font-medium text-gray-900">{c.nome}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusConfig[c.status as keyof typeof statusConfig]?.variant ?? 'default'}>
                        {statusConfig[c.status as keyof typeof statusConfig]?.label ?? c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-amber-600">
                      {(c.ultimo_score as { score_total: number }[])?.[0]?.score_total ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
