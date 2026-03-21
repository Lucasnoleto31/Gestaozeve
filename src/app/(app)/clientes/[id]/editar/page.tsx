import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { HeroBanner } from '@/components/layout/HeroBanner'
import { redirect, notFound } from 'next/navigation'
import { EditarClienteForm } from './EditarClienteForm'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (!['admin', 'vendedor'].includes(profile.role)) redirect('/dashboard')

  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  const { data: cliente } = await supabase.from('clientes').select('*').eq('id', id).single()
  if (!cliente) notFound()

  const { data: contas } = await supabaseAdmin.from('cliente_contas').select('*').eq('cliente_id', id).order('created_at')
  const { data: assessores } = await supabase.from('profiles').select('id, nome').in('role', ['admin', 'vendedor']).order('nome')
  const { data: influenciadores } = await supabase.from('influenciadores').select('id, nome, codigo').order('nome')

  const iniciais = cliente.nome.trim().split(' ').map((p: string) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <div>
      <Header title={`Editar — ${cliente.nome}`} />

      <HeroBanner>
        <Link
          href={`/clientes/${id}`}
          className="inline-flex items-center gap-1.5 text-xs text-blue-200/70 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar para o perfil
        </Link>

        <div className="flex items-center gap-5">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl font-bold text-white select-none"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.22)' }}
          >
            {iniciais}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-1">Editar cliente</p>
            <h1 className="text-2xl font-bold text-white tracking-tight">{cliente.nome}</h1>
            <p className="text-blue-200/60 text-sm mt-0.5">Atualize os dados cadastrais e operacionais</p>
          </div>
        </div>
      </HeroBanner>

      <div className="p-6 max-w-3xl">
        <EditarClienteForm
          cliente={cliente}
          contas={contas ?? []}
          assessores={assessores ?? []}
          influenciadores={influenciadores ?? []}
        />
      </div>
    </div>
  )
}
