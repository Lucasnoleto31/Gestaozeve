'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getProfile } from '@/lib/auth/getProfile'
import { revalidatePath } from 'next/cache'

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function deletarInfluenciador(id: string, userId: string | null) {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') {
    throw new Error('Acesso negado')
  }

  const admin = getAdmin()

  // Delete from influenciadores table first
  const { error: infError } = await admin.from('influenciadores').delete().eq('id', id)
  if (infError) throw new Error(infError.message)

  // Delete auth user if linked
  if (userId) {
    const { error: authError } = await admin.auth.admin.deleteUser(userId)
    if (authError) throw new Error(authError.message)
  }

  revalidatePath('/influenciadores')
}
