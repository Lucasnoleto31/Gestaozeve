// Guarda das server actions: quem pode usar o controle (admin e assessores)
// e o client do Supabase com service_role (as tabelas têm RLS sem políticas).
import { getProfile } from '@/lib/auth/getProfile'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCorretora, podeVerCorretora, type Corretora } from '@/lib/corretoras'
import type { Profile } from '@/types'
import { mesmaPessoa } from '@/lib/texto'

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

// Valida a corretora pedida e confere se o usuário logado pode vê-la (profiles.corretoras)
export async function corretoraValida(v: unknown): Promise<Corretora> {
  if (!isCorretora(v)) throw new Error('Corretora inválida')
  const profile = await getProfile()
  if (!podeVerCorretora(profile, v)) throw new Error('Você não tem acesso a esta corretora')
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

// ── Atendente (papel restrito) ───────────────────────────────────────────────
// A tela de Leads também abre para o atendente, que só enxerga e mexe nos leads em que é o responsável.
// Tudo o mais (clientes, funil, comissões, parâmetros) continua em equipe() / somenteAdmin(), que o barram.
export async function equipeLeads(): Promise<{ profile: Profile; db: Admin; restrito: boolean }> {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'vendedor' && profile.role !== 'atendente')) throw new Error('Não autorizado')
  return { profile, db: createAdminClient(), restrito: profile.role === 'atendente' }
}

// Guarda de uma ação sobre um lead: para o atendente, o lead tem de ser dele (responsável = o próprio usuário)
export async function equipeDoLead(leadId: string): Promise<{ profile: Profile; db: Admin; restrito: boolean }> {
  const ctx = await equipeLeads()
  if (ctx.restrito) {
    const { data, error } = await ctx.db.from('leads').select('responsavel').eq('id', leadId).maybeSingle()
    if (error) falha(error, 'leads')
    if (!data || !mesmaPessoa((data as { responsavel: string | null }).responsavel, ctx.profile.nome)) throw new Error('Este lead não está com você')
  }
  return ctx
}

// Nome oficial do responsável (tabela responsaveis) que corresponde ao usuário logado; sem cadastro, o primeiro nome
export async function responsavelDoUsuario(db: Admin, nomeUsuario: string): Promise<string> {
  const { data } = await db.from('responsaveis').select('nome').eq('ativo', true)
  const achado = ((data ?? []) as { nome: string }[]).find(r => mesmaPessoa(r.nome, nomeUsuario))
  return achado?.nome ?? nomeUsuario.trim().split(/\s+/)[0]
}
