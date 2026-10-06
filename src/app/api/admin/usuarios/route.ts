import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Role } from '@/types'
import { CORRETORAS, isCorretora } from '@/lib/corretoras'

const ROLES: Role[] = ['admin', 'vendedor', 'influenciador']
const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as string[]).includes(v)

// Corretoras que o usuário vê: lista de GENIAL/XP/BTG; todas as três (ou nada informado) = NULL (sem restrição)
function corretorasValidas(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const lista = CORRETORAS.filter(c => v.includes(c))
  return lista.length === CORRETORAS.length ? null : lista
}

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function chamadorEhAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await getAdminClient().from('profiles').select('role').eq('user_id', user.id).single()
  return data?.role === 'admin'
}

// Cria a conta e o perfil. O gatilho handle_new_user (supabase-s18) já cria o
// perfil a partir dos metadados; o upsert abaixo garante nome, perfil e status
// mesmo se o gatilho não existir.
export async function POST(req: NextRequest) {
  if (!(await chamadorEhAdmin())) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { nome, email, senha, role, corretoras } = await req.json()
  if (!nome || !email || !senha || !isRole(role)) {
    return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
  }

  const supabaseAdmin = getAdminClient()

  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome, role },
  })
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({ user_id: authUser.user.id, name: nome, nome, email, role, ativo: true, corretoras: corretorasValidas(corretoras) }, { onConflict: 'user_id' })
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  if (!(await chamadorEhAdmin())) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id, userId, nome, email, role, corretoras } = await req.json()
  if (!id || !userId || !nome || !email || !isRole(role)) {
    return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
  }
  if (corretoras !== undefined && corretoras !== null && !(Array.isArray(corretoras) && corretoras.every(isCorretora))) {
    return NextResponse.json({ error: 'Corretoras inválidas' }, { status: 400 })
  }

  const supabaseAdmin = getAdminClient()

  const { data: perfilAtual } = await supabaseAdmin
    .from('profiles')
    .select('email')
    .eq('id', id)
    .single()

  const campos: Record<string, unknown> = { name: nome, nome, email, role }
  if (corretoras !== undefined) campos.corretoras = corretorasValidas(corretoras)
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update(campos)
    .eq('id', id)
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  if (email !== perfilAtual?.email) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { email })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!(await chamadorEhAdmin())) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { userId } = await req.json()
  if (!userId) {
    return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 })
  }

  // profiles.user_id referencia auth.users com ON DELETE CASCADE: o perfil cai junto
  const { error } = await getAdminClient().auth.admin.deleteUser(userId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
