import { redirect } from 'next/navigation'
import { Calendar, Shield } from 'lucide-react'
import { getProfile } from '@/lib/auth/getProfile'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
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
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-base font-bold text-white">
              {iniciais}
            </span>
            {profile.nome}
          </span>
        }
        description={profile.email}
        actions={
          <>
            <Badge variant="accent"><Shield className="h-3 w-3" /> {ROLE_LABELS[profile.role] ?? profile.role}</Badge>
            <Badge><Calendar className="h-3 w-3" /> Membro desde {membroDesde}</Badge>
          </>
        }
      />
      <PageBody className="max-w-2xl">
        <Alert tone="info" title="Gerencie sua conta">
          Alterações de nome têm efeito imediato. Mudanças de e-mail requerem confirmação. Senhas devem ter no mínimo 8 caracteres.
        </Alert>
        <PerfilForm profile={profile} />
      </PageBody>
    </>
  )
}
