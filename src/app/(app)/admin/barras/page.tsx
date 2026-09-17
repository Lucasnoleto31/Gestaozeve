export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth/getProfile'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { CORRETORAS, CORRETORA_LABEL } from '@/lib/corretoras'
import { BarrasClient } from './BarrasClient'

export default async function BarrasPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  const supabase = createAdminClient()

  const [
    { data: barras },
    { data: assessores },
    { data: influenciadores },
  ] = await Promise.all([
    supabase
      .from('barras')
      .select('*, assessor:profiles(nome), influenciador:influenciadores(nome, codigo)')
      .order('corretora')
      .order('nome'),
    supabase.from('profiles').select('id, nome').in('role', ['admin', 'vendedor']).order('nome'),
    supabase.from('influenciadores').select('id, nome, codigo').order('nome'),
  ])

  const lista = (barras ?? []).map(b => ({ ...b, corretora: String(b.corretora ?? 'GENIAL') }))

  return (
    <>
      <PageHeader
        eyebrow="Cadastros"
        title="Barras"
        description="Cada barra pertence a uma corretora (Genial, XP ou BTG). O nome deve ser exatamente como aparece na planilha: é assim que os lotes são ligados ao assessor responsável."
        stats={[
          { label: 'Barras', value: lista.length },
          ...CORRETORAS.map(c => ({ label: CORRETORA_LABEL[c], value: lista.filter(b => b.corretora === c).length })),
        ]}
      />
      <PageBody>
        <BarrasClient
          barras={lista}
          assessores={assessores ?? []}
          influenciadores={influenciadores ?? []}
        />
      </PageBody>
    </>
  )
}
