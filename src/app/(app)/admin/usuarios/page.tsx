export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getProfile } from '@/lib/auth/getProfile'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import { NovoUsuarioButton } from './NovoUsuarioButton'
import { EditarUsuarioButton } from './EditarUsuarioButton'
import { DeletarUsuarioButton } from './DeletarUsuarioButton'

const roleMap: Record<string, { label: string; variant: BadgeVariant }> = {
  admin: { label: 'Administrador', variant: 'accent' },
  vendedor: { label: 'Assessor', variant: 'warning' },
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
    <>
      <PageHeader
        eyebrow="Sistema"
        title="Usuários"
        description="Quem acessa o sistema e com qual permissão. Só administradores veem os painéis de lotes."
        stats={[
          { label: 'Usuários', value: total },
          { label: 'Ativos', value: ativos },
        ]}
        actions={<NovoUsuarioButton />}
      />
      <PageBody>
        <Panel flush>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Função</th>
                  <th>Status</th>
                  <th>Criado em</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {!usuarios?.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-fg-subtle">Nenhum usuário cadastrado.</td>
                  </tr>
                )}
                {usuarios?.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                          {(u.nome ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{u.nome}</span>
                      </div>
                    </td>
                    <td className="muted">{u.email}</td>
                    <td>
                      <Badge variant={roleMap[u.role]?.variant ?? 'default'}>{roleMap[u.role]?.label ?? u.role}</Badge>
                    </td>
                    <td>
                      <Badge variant={u.ativo ? 'success' : 'danger'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge>
                    </td>
                    <td className="muted whitespace-nowrap">{formatDate(u.created_at)}</td>
                    <td>
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
        </Panel>
      </PageBody>
    </>
  )
}
