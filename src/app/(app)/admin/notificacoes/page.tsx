export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth/getProfile'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { NotificacoesClient } from './NotificacoesClient'

export default async function NotificacoesPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')

  const supabase = createAdminClient()

  const { data: logs } = await supabase
    .from('notificacoes_log')
    .select(`
      id, tipo, enviado_em, canal,
      cliente:clientes(nome),
      assessor:profiles(nome)
    `)
    .order('enviado_em', { ascending: false })
    .limit(200)

  const { data: resumo } = await supabase
    .from('notificacoes_log')
    .select('tipo')

  const contagem: Record<string, number> = {}
  for (const r of resumo ?? []) {
    contagem[r.tipo] = (contagem[r.tipo] ?? 0) + 1
  }

  return (
    <div>
      <Header title="Notificações" />
      <NotificacoesClient logs={(logs ?? []) as never} contagem={contagem} />
    </div>
  )
}
