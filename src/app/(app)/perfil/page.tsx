import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { redirect } from 'next/navigation'
import { PerfilForm } from './PerfilForm'
import { Shield, Calendar, UserCircle } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  vendedor: 'Assessor',
  influenciador: 'Influenciador',
}

export default async function PerfilPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const iniciais = profile.nome.trim().split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  const membroDesde = new Date(profile.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <div>
      <Header title="Meu Perfil" />

      {/* ── Hero Banner ── */}
      <div
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(140deg, #0A1628 0%, #0F2550 50%, #1764F4 100%)' }}
      >
        {/* Grid texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        {/* Radial glow */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 50% 80% at 85% 50%, rgba(23,100,244,0.4) 0%, transparent 70%)' }}
        />

        <div className="relative z-10 px-6 py-10">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            {/* Avatar grande */}
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl font-bold text-white select-none"
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.22)',
                backdropFilter: 'blur(8px)',
              }}
            >
              {iniciais}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-1">
                Conta do usuário
              </p>
              <h1 className="text-2xl font-bold text-white tracking-tight">{profile.nome}</h1>
              <p className="text-blue-200/70 text-sm mt-1">{profile.email}</p>

              <div className="flex flex-wrap items-center gap-3 mt-3">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                  style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
                >
                  <Shield className="w-3 h-3" />
                  {ROLE_LABELS[profile.role] ?? profile.role}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.75)' }}
                >
                  <Calendar className="w-3 h-3" />
                  Membro desde {membroDesde}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="p-6">
        <div className="max-w-2xl">

          {/* Info box */}
          <div
            className="rounded-2xl px-5 py-4 mb-6 flex items-start gap-3"
            style={{ background: 'var(--blue-dim)', border: '1px solid rgba(23,100,244,0.15)' }}
          >
            <UserCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--blue)' }} />
            <div>
              <p className="text-sm font-semibold text-gray-900">Gerencie sua conta</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Alterações de nome têm efeito imediato. Mudanças de e-mail requerem confirmação. Senhas devem ter no mínimo 8 caracteres.
              </p>
            </div>
          </div>

          <PerfilForm profile={profile} />
        </div>
      </div>
    </div>
  )
}
