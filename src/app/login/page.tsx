'use client'

import { useState } from 'react'
import { Layers, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/lib/theme'
import { Field } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'

const DESTAQUES = [
  { titulo: 'Três corretoras, um controle', texto: 'Genial, XP e BTG com os mesmos painéis: base levada, giro, receita e incentivo.' },
  { titulo: 'Cliente a cliente', texto: 'Contas agrupadas por CPF, situação no mês, tarifas e extrato de lotes.' },
  { titulo: 'Leads e funil', texto: 'O formulário entra direto, cruzado com a base, com alerta de contato por responsável.' },
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
      {/* ── Lado institucional ── */}
      <aside className="hidden border-r border-line bg-surface lg:flex lg:flex-col">
        <div className="flex h-full flex-col px-14 py-12">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-fg">
              <Layers className="h-4 w-4" aria-hidden />
            </div>
            <div className="leading-tight">
              <p className="text-body font-semibold tracking-tight text-fg">ZeveAI</p>
              <p className="text-micro text-fg-subtle">Controle de lotes</p>
            </div>
          </div>

          <div className="mt-auto">
            <p className="label mb-3">Escritório de assessoria</p>
            <h1 className="max-w-lg text-display font-semibold tracking-tight text-fg">
              Lotes, receita e clientes das três corretoras em um só lugar.
            </h1>
            <ul className="mt-10 space-y-5">
              {DESTAQUES.map(d => (
                <li key={d.titulo} className="max-w-md border-l-2 border-accent pl-4">
                  <p className="text-body font-semibold text-fg">{d.titulo}</p>
                  <p className="mt-0.5 text-dense text-fg-muted">{d.texto}</p>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-12 text-micro text-fg-subtle">© {new Date().getFullYear()} ZeveAI</p>
        </div>
      </aside>

      {/* ── Formulário ── */}
      <main className="relative flex flex-col items-center justify-center px-4 py-12">
        <div className="absolute right-4 top-4"><ThemeToggle /></div>

        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-fg">
            <Layers className="h-4 w-4" aria-hidden />
          </div>
          <span className="text-section font-semibold tracking-tight text-fg">ZeveAI</span>
        </div>

        <div className="w-full max-w-[400px]">
          <div className="mb-6">
            <h2 className="text-title font-semibold tracking-tight text-fg">Entrar</h2>
            <p className="mt-1 text-dense text-fg-muted">Acesse sua conta para continuar.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="E-mail" htmlFor="login-email">
              <input id="login-email" type="email" placeholder="seu@email.com" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="w-full" />
            </Field>

            <Field label="Senha" htmlFor="login-senha">
              <input id="login-senha" type="password" placeholder="••••••••" value={password}
                onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className="w-full" />
            </Field>

            {error && <Alert tone="loss">{error}</Alert>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent text-body font-semibold text-accent-fg hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Acessando…</> : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-micro text-fg-subtle lg:hidden">© {new Date().getFullYear()} ZeveAI</p>
      </main>
    </div>
  )
}
