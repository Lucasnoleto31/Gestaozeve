'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Pencil, X } from 'lucide-react'

type Props = {
  influenciador: {
    id: string
    nome: string
    codigo: string
    codigo_genial?: string | null
    status?: string | null
  }
}

export function EditarInfluenciadorButton({ influenciador }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    nome: influenciador.nome ?? '',
    codigo: influenciador.codigo ?? '',
    codigo_genial: influenciador.codigo_genial ?? '',
    status: influenciador.status ?? 'ativo',
  })

  function handleClose() {
    setOpen(false)
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/admin/influenciadores', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: influenciador.id, ...form }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Erro ao salvar')
      setLoading(false)
      return
    }

    setLoading(false)
    handleClose()
    router.refresh()
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="w-3.5 h-3.5" />
        Editar
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
          <div className="relative bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Editar Influenciador</h2>
              <button onClick={handleClose} className="text-gray-500 hover:text-gray-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                required
              />
              <Input
                label="Código de captação (/ref/codigo)"
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                required
              />
              <Input
                label="Código na Genial (ex: Zeve Investimentos 4)"
                placeholder="Nome do escritório na Genial"
                value={form.codigo_genial}
                onChange={(e) => setForm({ ...form, codigo_genial: e.target.value })}
              />

              <div>
                <label className="block text-sm text-gray-500 mb-1.5">Status</label>
                <div className="flex gap-3">
                  {['ativo', 'inativo'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm({ ...form, status: s })}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        form.status === s
                          ? s === 'ativo'
                            ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400'
                            : 'bg-red-600/20 border-red-500 text-red-400'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {s === 'ativo' ? 'Ativo' : 'Inativo'}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-3 py-2">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1" loading={loading}>
                  Salvar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
