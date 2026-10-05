// Guarda das server actions: quem pode usar o controle (admin e assessores)
// e o client do Supabase com service_role (as tabelas têm RLS sem políticas).
import { getProfile } from '@/lib/auth/getProfile'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCorretora, type Corretora } from '@/lib/corretoras'
import type { Profile } from '@/types'

export type Admin = ReturnType<typeof createAdminClient>

export async function equipe(): Promise<{ profile: Profile; db: Admin }> {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'vendedor')) throw new Error('Não autorizado')
  return { profile, db: createAdminClient() }
}

export async function somenteAdmin(): Promise<{ profile: Profile; db: Admin }> {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Só o administrador pode fazer isso')
  return { profile, db: createAdminClient() }
}

export function corretoraValida(v: unknown): Corretora {
  if (!isCorretora(v)) throw new Error('Corretora inválida')
  return v
}

// Erro do Supabase → Error com mensagem legível
export function falha(error: { message: string } | null, contexto?: string): never {
  throw new Error(contexto ? `${contexto}: ${error?.message ?? 'erro'}` : error?.message ?? 'erro')
}

export const num = (v: unknown) => (v == null ? 0 : Number(v))
export const str = (v: unknown) => (v == null ? null : String(v))
export const linhas = <T,>(data: unknown, map: (r: Record<string, unknown>) => T): T[] =>
  ((data ?? []) as Record<string, unknown>[]).map(map)
