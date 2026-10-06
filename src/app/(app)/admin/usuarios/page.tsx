export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getProfile } from '@/lib/auth/getProfile'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import { corretorasDoPerfil } from '@/lib/corretoras'
import { formatDate } from '@/lib/utils'
import { NovoUsuarioButton } from './NovoUsuarioButton'
import { EditarUsuarioButton } from './EditarUsuarioButton'
import { DeletarUsuarioButton } from './DeletarUsuarioButton'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  vendedor: 'Assessor',
  influenciador: 'Influenciador',
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
        description="Quem acessa o sistema e com qual permissão."
        stats={[
          { label: 'Usuários', value: total },
          { label: 'Ativos', value: ativos },
        ]}
        actions={<NovoUsuarioButton />}
      />
      <PageBody>
        <Panel>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th className="col-p2">E-mail</th>
                  <th>Função</th>
                  <th>Corretoras</th>
                  <th className="col-p2">Status</th>
                  <th className="col-p3">Criado em</th>
                  <th className="w-20"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {!usuarios?.length && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-dense text-fg-subtle">Nenhum usuário cadastrado.</td>
                  </tr>
                )}
                {usuarios?.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-micro font-semibold text-accent" aria-hidden>
                          {(u.nome ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{u.nome}</span>
                      </div>
                    </td>
                    <td className="muted col-p2">{u.email}</td>
                    <td><Badge variant={u.role === 'admin' ? 'accent' : 'neutral'}>{ROLE_LABEL[u.role] ?? u.role}</Badge></td>
                    <td>
                      {u.corretoras == null
                        ? <span className="muted">Todas</span>
                        : corretorasDoPerfil(u).length === 0
                          ? <span className="text-warn">Nenhuma</span>
                          : <span className="inline-flex flex-wrap gap-1">{corretorasDoPerfil(u).map(c => <CorretoraBadge key={c} corretora={c} />)}</span>}
                    </td>
                    <td className="col-p2"><Badge variant={u.ativo ? 'gain' : 'neutral'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge></td>
                    <td className="muted whitespace-nowrap col-p3">{formatDate(u.created_at)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
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
