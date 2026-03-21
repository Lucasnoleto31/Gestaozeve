import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getCallerProfile() {
  const supabase = getAdminClient()
  const { createClient } = await import('@/lib/supabase/server')
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('role').eq('user_id', user.id).single()
  return data
}

export async function PATCH(req: NextRequest) {
  const profile = await getCallerProfile()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id, nome, codigo, codigo_genial, status } = await req.json()

  if (!id) {
    return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })
  }

  const supabase = getAdminClient()

  const updates: Record<string, string> = {}
  if (nome !== undefined) updates.nome = nome
  if (codigo !== undefined) updates.codigo = codigo
  if (codigo_genial !== undefined) updates.codigo_genial = codigo_genial
  if (status !== undefined) updates.status = status

  const { error } = await supabase
    .from('influenciadores')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
