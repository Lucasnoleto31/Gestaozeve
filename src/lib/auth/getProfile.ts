import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Profile } from '@/types'

// Memoizado por requisição (React cache): layout, página e server actions
// da mesma requisição compartilham o mesmo getUser() + select em profiles,
// em vez de repetir as duas idas ao Supabase em cada camada.
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return data
})
