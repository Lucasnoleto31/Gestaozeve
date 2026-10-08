'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Marca } from '@/components/ui/Marca'
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
      {/* Capa: narrativa no escuro, dado no claro (ficha padrão) */}
      <aside className="hidden bg-capa text-capa-fg lg:flex lg:flex-col">
        <div className="flex h-full flex-col px-14 py-12">
          <div className="flex items-center gap-3">
            <Marca className="h-7 w-9" />
            <div className="leading-tight">
              <p className="text-body font-semibold tracking-tight">Zeve Controle</p>
              <p className="text-micro opacity-60">Genial · XP · BTG</p>
            </div>
          </div>

          <div className="mt-auto">
            <p className="mb-3 text-micro font-medium uppercase tracking-wider opacity-60">Escritório de assessoria</p>
            <h1 className="max-w-lg text-display font-bold tracking-tight">
              Lotes, receita e clientes das três corretoras em um só lugar.
            </h1>
            <ul className="mt-10 space-y-5">
              {DESTAQUES.map(d => (
                <li key={d.titulo} className="max-w-md border-l-2 border-capa-fg/40 pl-4">
                  <p className="text-body font-semibold">{d.titulo}</p>
                  <p className="mt-0.5 text-dense font-light opacity-75">{d.texto}</p>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-12 text-micro opacity-60">© {new Date().getFullYear()} Zeve Controle</p>
        </div>
      </aside>

      {/* ── Formulário ── */}
      <main className="relative flex flex-col items-center justify-center px-4 py-12">
        <div className="absolute right-4 top-4"><ThemeToggle /></div>

        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <Marca className="h-7 w-9" />
          <span className="text-section font-semibold tracking-tight text-fg">Zeve Controle</span>
        </div>

        <div className="w-full max-w-[400px]">
          <div className="mb-6">
            <h2 className="text-title font-bold tracking-tight text-fg">Entrar</h2>
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

        <p className="mt-8 text-center text-micro text-fg-subtle lg:hidden">© {new Date().getFullYear()} Zeve Controle</p>
      </main>
    </div>
  )
}
