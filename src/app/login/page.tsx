'use client'

import { useState } from 'react'
import { Building2, Layers, Loader2, Receipt, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/lib/theme'
import { Field } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'

const DESTAQUES = [
  { icon: Building2, titulo: 'Três corretoras, um painel', texto: 'Genial, XP e BTG lado a lado, com os lotes de cada uma separados na importação.' },
  { icon: Trophy, titulo: 'Ranking de barras', texto: 'Quem está girando mais, variação contra o período anterior, clientes novos e churn.' },
  { icon: Receipt, titulo: 'Receita estimada', texto: 'Tarifa por lote e zeragem de cada barra viram receita bruta e líquida, com meta anual.' },
]

export default function LoginPage() {
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
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1.1fr_1fr]">
      {/* ── Painel institucional ── */}
      <aside className="relative hidden overflow-hidden bg-sb text-sb-fg lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 20% 100%, rgba(91,141,239,0.22) 0%, transparent 70%)' }}
        />

        <div className="relative z-10 flex h-full flex-col px-14 py-12">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sb-accent text-white">
              <Layers className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="text-lg font-semibold tracking-tight">ZeveAI</p>
              <p className="text-[11px] uppercase tracking-[0.16em] text-sb-muted">Controle de lotes</p>
            </div>
          </div>

          <div className="mt-auto">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-sb-accent">Escritório de assessoria</p>
            <h1 className="max-w-lg text-4xl font-semibold leading-[1.15] tracking-tight xl:text-[44px]">
              Lotes, barras e receita das três corretoras em um só lugar.
            </h1>
            <ul className="mt-10 space-y-5">
              {DESTAQUES.map(d => (
                <li key={d.titulo} className="flex gap-4">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sb-line bg-sb-active text-sb-accent">
                    <d.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{d.titulo}</p>
                    <p className="mt-0.5 max-w-md text-[13px] leading-relaxed text-sb-muted">{d.texto}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-12 text-xs text-sb-muted">© {new Date().getFullYear()} ZeveAI · Todos os direitos reservados</p>
        </div>
      </aside>

      {/* ── Formulário ── */}
      <main className="relative flex flex-col items-center justify-center px-6 py-12">
        <div className="absolute right-4 top-4"><ThemeToggle /></div>

        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
            <Layers className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-fg">ZeveAI</span>
        </div>

        <div className="panel w-full max-w-[400px] animate-fade-up p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold tracking-tight text-fg">Entrar</h2>
            <p className="mt-1 text-sm text-fg-muted">Acesse sua conta para continuar.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="E-mail" htmlFor="login-email">
              <input id="login-email" type="email" placeholder="seu@email.com" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="w-full py-2.5" />
            </Field>

            <Field label="Senha" htmlFor="login-senha">
              <input id="login-senha" type="password" placeholder="••••••••" value={password}
                onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className="w-full py-2.5" />
            </Field>

            {error && <Alert tone="danger">{error}</Alert>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Acessando…</> : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-xs text-fg-subtle lg:hidden">
          © {new Date().getFullYear()} ZeveAI · Todos os direitos reservados
        </p>
      </main>
    </div>
  )
}
