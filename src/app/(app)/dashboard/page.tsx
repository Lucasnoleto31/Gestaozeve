export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { Hammer } from 'lucide-react'
import { getProfile } from '@/lib/auth/getProfile'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import { CORRETORAS } from '@/lib/corretoras'

function getSaudacao() {
  const h = (new Date().getUTCHours() - 3 + 24) % 24
  if (h >= 18) return 'Boa noite'
  if (h >= 12) return 'Boa tarde'
  return 'Bom dia'
}

export default async function DashboardPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const firstName = profile.nome.split(' ')[0]

  return (
    <>
      <PageHeader
        eyebrow="Visão geral"
        title={`${getSaudacao()}, ${firstName}`}
        description="O sistema está sendo reconstruído para controlar as três corretoras no modelo das planilhas. As telas novas entram aqui."
      />
      <PageBody>
        <Panel icon={Hammer} title="Em reconstrução" subtitle="Próximas telas: uma para cada corretora, com o mesmo controle que hoje é feito no Excel.">
          <div className="flex flex-wrap gap-2">
            {CORRETORAS.map(c => <CorretoraBadge key={c} corretora={c} size="md" />)}
          </div>
        </Panel>
      </PageBody>
    </>
  )
}
