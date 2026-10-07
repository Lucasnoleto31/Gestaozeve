import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { usuarioDaSessao } from '@/lib/supabase/jwks'
import { Profile } from '@/types'

// Memoizado por requisição (React cache): layout, página e server actions
// da mesma requisição compartilham a mesma verificação de sessão + select em profiles.
// A sessão é verificada localmente pela assinatura do token (sem ida ao servidor de auth).
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient()

  const usuario = await usuarioDaSessao(supabase)
  if (!usuario) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', usuario.id)
    .single()

  return data
})
