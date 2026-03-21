export const dynamic = 'force-dynamic'

import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NovoUsuarioButton } from './NovoUsuarioButton'
import { EditarUsuarioButton } from './EditarUsuarioButton'
import { DeletarUsuarioButton } from './DeletarUsuarioButton'
import { Users, ShieldCheck } from 'lucide-react'

const roleMap: Record<string, { label: string; variant: 'info' | 'warning' | 'success' }> = {
  admin: { label: 'Admin', variant: 'info' },
  vendedor: { label: 'Vendedor', variant: 'warning' },
  influenciador: { label: 'Influenciador', variant: 'success' },
}

export default async function UsuariosPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: usuarios } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  const total = usuarios?.length ?? 0
  const ativos = usuarios?.filter((u) => u.ativo).length ?? 0

  return (
    <div>
      <Header title="Usuários" />

      <HeroBanner>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-2">
              Administração
            </p>
            <h1 className="text-3xl font-bold text-white tracking-tight">Gestão de Usuários</h1>
            <p className="text-blue-200/60 mt-1 text-sm">
              Controle de acesso e permissões do sistema
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="rounded-xl px-4 py-3 text-center"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <p className="text-xs text-blue-200/70 uppercase tracking-wide mb-1">Total</p>
              <p className="text-2xl font-bold text-white">{total}</p>
            </div>
            <div
              className="rounded-xl px-4 py-3 text-center"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <p className="text-xs text-blue-200/70 uppercase tracking-wide mb-1">Ativos</p>
              <p className="text-2xl font-bold text-white">{ativos}</p>
            </div>
          </div>
        </div>
      </HeroBanner>

      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{total} usuário{total !== 1 ? 's' : ''} cadastrado{total !== 1 ? 's' : ''}</p>
          <NovoUsuarioButton />
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--surface-3)', borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">E-mail</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Função</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Criado em</th>
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {!usuarios?.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                      Nenhum usuário cadastrado.
                    </td>
                  </tr>
                )}
                {usuarios?.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/80 transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg, var(--blue) 0%, var(--blue-dark) 100%)' }}
                        >
                          {(u.nome ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{u.nome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant={roleMap[u.role]?.variant ?? 'default'}>
                        {roleMap[u.role]?.label ?? u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.ativo ? 'success' : 'danger'}>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <EditarUsuarioButton usuario={u} />
                        <DeletarUsuarioButton userId={u.user_id} nome={u.nome} />
                      </div>
                    </td>
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
