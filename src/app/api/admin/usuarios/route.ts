import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getCallerProfile() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) return { _debug: `auth error: ${authError.message}`, role: null }
  if (!user) return { _debug: 'no user in session', role: null }

  const supabaseAdmin = getAdminClient()
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error) return { _debug: `profile query error: ${error.message} | user_id: ${user.id}`, role: null }
  if (!data) return { _debug: `no profile found for user_id: ${user.id}`, role: null }
  return data
}

export async function POST(req: NextRequest) {
  const profile = await getCallerProfile()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { nome, email, senha, role } = await req.json()

  if (!nome || !email || !senha || !role) {
    return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
  }

  const supabaseAdmin = getAdminClient()

  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  const { error: profileError } = await supabaseAdmin.from('profiles').insert({
    user_id: authUser.user.id,
    name: nome,
    nome,
    email,
    role,
    ativo: true,
  })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  if (role === 'influenciador') {
    const codigo = nome.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '') + Math.floor(Math.random() * 1000)
    await supabaseAdmin.from('influenciadores').insert({
      user_id: authUser.user.id,
      nome,
      codigo,
    })
  }

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const profile = await getCallerProfile()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id, userId, nome, email, role } = await req.json()

  if (!id || !userId || !nome || !email || !role) {
    return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
  }

  const supabaseAdmin = getAdminClient()

  const { data: perfilAtual } = await supabaseAdmin
    .from('profiles')
    .select('role, email')
    .eq('id', id)
    .single()

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ name: nome, nome, email, role })
    .eq('id', id)

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  if (email !== perfilAtual?.email) {
    await supabaseAdmin.auth.admin.updateUserById(userId, { email })
  }

  if (role === 'influenciador' && perfilAtual?.role !== 'influenciador') {
    const { data: existing } = await supabaseAdmin
      .from('influenciadores')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (!existing) {
      const codigo = nome.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '') + Math.floor(Math.random() * 1000)
      await supabaseAdmin.from('influenciadores').insert({ user_id: userId, nome, codigo })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const profile = await getCallerProfile()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { userId } = await req.json()
  if (!userId) {
    return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 })
  }

  const supabaseAdmin = getAdminClient()

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
