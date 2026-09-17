export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { listMetas, saveMeta, deleteMeta } from './actions'
import { MetasView } from './View'

export default async function MetasPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  const initial = await listMetas()

  return (
    <>
      <PageHeader
        eyebrow="Cadastros"
        title="Metas anuais"
        description="Meta de lotes e de receita por ano: uma para o escritório inteiro e, se quiser, uma por corretora. O painel de lotes mostra o progresso de cada escopo."
        stats={[{ label: 'Metas configuradas', value: initial.length }]}
      />
      <PageBody>
        <MetasView initial={initial} actions={{ saveMeta, deleteMeta }} />
      </PageBody>
    </>
  )
}
