'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Plus, X, Link2 } from 'lucide-react'

function gerarCodigo(nome: string) {
  return (
    nome.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '') +
    Math.floor(Math.random() * 1000)
  )
}

export function NovoInfluenciadorButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ nome: '', email: '', senha: '' })

  function handleClose() {
    setOpen(false)
    setError('')
    setForm({ nome: '', email: '', senha: '' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, role: 'influenciador' }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError((data.error ?? 'Erro ao cadastrar influenciador') + (data.debug ? ` | ${data.debug}` : ''))
      setLoading(false)
      return
    }

    setLoading(false)
    handleClose()
    router.refresh()
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" />
        Novo Influenciador
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
          <div className="relative bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
                  <Link2 className="w-4 h-4 text-blue-400" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Novo Influenciador</h2>
              </div>
              <button onClick={handleClose} className="text-gray-500 hover:text-gray-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            {form.nome && (
              <div className="mb-4 flex items-center gap-2 bg-blue-900/20 border border-blue-700/30 rounded-lg px-3 py-2">
                <Link2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                <span className="text-xs text-blue-600 font-mono">
                  /ref/{gerarCodigo(form.nome).replace(/\d+$/, '***')}
                </span>
                <span className="text-xs text-gray-500 ml-1">— link gerado automaticamente</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Nome completo"
                placeholder="João Silva"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                required
              />
              <Input
                label="E-mail"
                type="email"
                placeholder="joao@email.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
              <Input
                label="Senha de acesso"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
                required
                minLength={6}
              />

              <p className="text-xs text-gray-500">
                Um link de captação com código único será gerado automaticamente.
              </p>

              {error && (
                <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-3 py-2">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1" loading={loading} disabled={!form.nome.trim()}>
                  Cadastrar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
