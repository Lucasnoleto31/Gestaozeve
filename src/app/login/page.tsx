'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp } from 'lucide-react'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('E-mail ou senha incorretos. Verifique e tente novamente.')
      setLoading(false)
      return
    }
    window.location.href = '/dashboard'
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#F0F4FF' }}>

      {/* ── Left panel — GIF background ── */}
      <div className="hidden lg:flex lg:w-[58%] xl:w-[60%] flex-col relative overflow-hidden bg-black">

        {/* GIF background */}
        <Image
          src="/login-bg.gif"
          alt=""
          fill
          className="object-cover opacity-60"
          priority
          unoptimized
        />

        {/* Dark gradient overlay — top and bottom for text readability */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, rgba(8,8,16,0.75) 0%, rgba(8,8,16,0.15) 40%, rgba(8,8,16,0.15) 60%, rgba(8,8,16,0.85) 100%)',
          }}
        />

        {/* Blue vignette sides */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 90% 80% at 50% 50%, transparent 50%, rgba(0,17,40,0.6) 100%)',
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full px-14 py-12">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}
            >
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">ZeveAI</span>
          </div>

          {/* Main copy — bottom aligned */}
          <div className="mt-auto mb-16">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] mb-5" style={{ color: '#7CB9FF' }}>
              Plataforma de assessoria
            </p>
            <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight tracking-tight">
              Seus trades contam<br />
              <span style={{ color: '#7CB9FF' }}>uma história.</span><br />
              Você já a leu?
            </h1>
            <p className="text-base mt-5 max-w-md leading-relaxed" style={{ color: 'rgba(220,232,255,0.65)' }}>
              Importe seus relatórios do Profit e descubra com clareza o que está funcionando e o que está te custando dinheiro.
            </p>
          </div>

          {/* Bottom badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full self-start"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}
          >
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-white/80 font-medium">Sistema disponível 24/7</span>
          </div>
        </div>
      </div>

      {/* ── Right panel — login form ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">

        {/* Mobile logo */}
        <div className="flex items-center gap-2.5 mb-10 lg:hidden">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--blue) 0%, var(--blue-dark) 100%)' }}
          >
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-slate-900">ZeveAI</span>
        </div>

        <div className="w-full max-w-[400px] animate-fade-up">

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Bem-vindo de volta</h2>
            <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>
              Acesse sua conta para continuar
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                E-mail
              </label>
              <input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-gray-400 focus:outline-none transition-all duration-150"
                style={{
                  background: '#FFFFFF',
                  border: '1.5px solid var(--border)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--blue)'
                  e.target.style.boxShadow = '0 0 0 3px rgba(23,100,244,0.10)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border)'
                  e.target.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Senha
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-gray-400 focus:outline-none transition-all duration-150"
                style={{
                  background: '#FFFFFF',
                  border: '1.5px solid var(--border)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--blue)'
                  e.target.style.boxShadow = '0 0 0 3px rgba(23,100,244,0.10)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border)'
                  e.target.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
                }}
              />
            </div>

            {error && (
              <div
                className="rounded-xl px-4 py-3 animate-fade-in"
                style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)' }}
              >
                <p className="text-xs text-red-500">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed mt-1"
              style={{
                background: 'linear-gradient(135deg, var(--blue) 0%, var(--blue-dark) 100%)',
                boxShadow: '0 4px 20px rgba(23,100,244,0.25)',
              }}
              onMouseEnter={(e) => !loading && ((e.currentTarget as HTMLElement).style.filter = 'brightness(1.08)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.filter = '')}
            >
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Acessando...
                </span>
              ) : 'Entrar na plataforma'}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs mt-10 text-gray-400">
            © {new Date().getFullYear()} ZeveAI · Todos os direitos reservados
          </p>
        </div>
      </div>
    </div>
  )
}
