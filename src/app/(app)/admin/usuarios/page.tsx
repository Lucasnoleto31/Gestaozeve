export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getProfile } from '@/lib/auth/getProfile'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import type { CSSProperties } from 'react'
import { CORRETORA_LABEL, corretorasDoPerfil } from '@/lib/corretoras'
import { cn, formatDate } from '@/lib/utils'
import { NovoUsuarioButton } from './NovoUsuarioButton'
import { EditarUsuarioButton } from './EditarUsuarioButton'
import { DeletarUsuarioButton } from './DeletarUsuarioButton'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  vendedor: 'Assessor',
  atendente: 'Atendente',
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
            {/* No celular (DESIGN.md §8.6) cada pessoa vira um item: o nome inteiro em cima; a função, as corretoras
                e a data de criação embaixo, em palavras; o lápis e a lixeira à direita. O e-mail fica na folha
                "Editar usuário" (subtítulo e campo) e "Inativo" aparece só na linha de quem está inativo. */}
            <table className="tbl tbl-lista" style={{ '--lista-direita': '6.5rem' } as CSSProperties}>
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
                    <td className="cel-titulo">
                      {/* sem a inicial no celular: o nome cabe inteiro */}
                      <div className="flex items-center gap-2.5 max-md:block">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-micro font-semibold text-accent max-md:hidden" aria-hidden>
                          {(u.nome ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{u.nome}</span>
                      </div>
                    </td>
                    <td className="muted col-p2">{u.email}</td>
                    <td className="cel-sub">
                      <Badge variant={u.role === 'admin' ? 'accent' : 'neutral'} className="max-md:hidden!">{ROLE_LABEL[u.role] ?? u.role}</Badge>
                      {/* no celular a função é palavra: a pílula na tinta do Administrador pesava mais que o nome
                          (o "!" vence a regra da base que mostra o selo da linha de apoio como palavra) */}
                      <span className="md:hidden">{ROLE_LABEL[u.role] ?? u.role}</span>
                    </td>
                    <td className="cel-sub">
                      {u.corretoras == null
                        ? <span className="muted"><span className="max-md:hidden">Todas</span><span className="md:hidden">todas as corretoras</span></span>
                        : corretorasDoPerfil(u).length === 0
                          ? <span className="text-warn">Nenhuma</span>
                          : <>
                              <span className="inline-flex flex-wrap gap-1 max-md:hidden">{corretorasDoPerfil(u).map(c => <CorretoraBadge key={c} corretora={c} />)}</span>
                              {/* em palavras no celular: a pílula cinza da Genial ao lado da do BTG parecia "desligada" */}
                              <span className="md:hidden">{corretorasDoPerfil(u).map(c => CORRETORA_LABEL[c]).join(' e ')}</span>
                            </>}
                    </td>
                    <td className={cn('col-p2 cel-sub', u.ativo && 'vazio')}><Badge variant={u.ativo ? 'gain' : 'neutral'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge></td>
                    <td className="muted whitespace-nowrap col-p3 cel-sub" data-rotulo={'criado em'}>{formatDate(u.created_at)}</td>
                    <td className="cel-acoes">
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
