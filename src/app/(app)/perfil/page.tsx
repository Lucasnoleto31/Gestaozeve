import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { PerfilForm } from './PerfilForm'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  vendedor: 'Assessor',
  influenciador: 'Influenciador',
}

export default async function PerfilPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const iniciais = profile.nome.trim().split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  const membroDesde = new Date(profile.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <>
      <PageHeader
        eyebrow="Conta"
        title={
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-dense font-semibold text-accent" aria-hidden>
              {iniciais}
            </span>
            {profile.nome}
          </span>
        }
        description={`${profile.email} · membro desde ${membroDesde}`}
        actions={<Badge variant="accent">{ROLE_LABELS[profile.role] ?? profile.role}</Badge>}
      />
      <PageBody className="max-w-2xl">
        <PerfilForm profile={profile} />
      </PageBody>
    </>
  )
}
