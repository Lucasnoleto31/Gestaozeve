'use server'

// Sair pelo servidor: encerra a sessão (limpa os cookies) e manda para o login.
// Assim a barra superior não precisa carregar o cliente do Supabase no navegador
// em todas as páginas (180 KB de JavaScript a menos no primeiro acesso).
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PREFIXO_COOKIE_FILTROS } from '@/lib/filtrosLista'
import { createClient } from '@/lib/supabase/server'

export async function sair() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const store = await cookies()
  for (const c of store.getAll()) if (c.name.startsWith(PREFIXO_COOKIE_FILTROS)) store.delete(c.name)
  redirect('/login')
}
