// Sessão verificada localmente. O projeto assina os tokens com chave assimétrica (ES256),
// então dá para conferir a assinatura aqui com a chave pública (JWKS) em vez de perguntar
// ao servidor de auth a cada requisição (getUser): duas idas a menos por página (proxy +
// getProfile). O JWKS fica em cache no processo por uma hora; se a chave mudar, o próprio
// getClaims busca o JWKS novo no endpoint público.
import type { SupabaseClient } from '@supabase/supabase-js'

type OpcoesClaims = NonNullable<Parameters<SupabaseClient['auth']['getClaims']>[1]>
type Jwks = NonNullable<OpcoesClaims['jwks']>

let cache: { jwks: Jwks; em: number } | null = null
const VALIDADE_MS = 60 * 60 * 1000

async function jwksSupabase(): Promise<Jwks | undefined> {
  if (cache && Date.now() - cache.em < VALIDADE_MS) return cache.jwks
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`, { cache: 'no-store' })
    if (!r.ok) return cache?.jwks
    const jwks = (await r.json()) as Jwks
    if (!Array.isArray(jwks?.keys)) return cache?.jwks
    cache = { jwks, em: Date.now() }
    return jwks
  } catch {
    return cache?.jwks
  }
}

// Usuário da sessão atual (id do auth.users) ou null quando não há sessão válida.
// Renova o token expirado pelos cookies, como o getUser fazia.
export async function usuarioDaSessao(supabase: SupabaseClient): Promise<{ id: string } | null> {
  const jwks = await jwksSupabase()
  const { data } = await supabase.auth.getClaims(undefined, jwks ? { jwks } : undefined)
  const sub = data?.claims?.sub
  return typeof sub === 'string' && sub ? { id: sub } : null
}
