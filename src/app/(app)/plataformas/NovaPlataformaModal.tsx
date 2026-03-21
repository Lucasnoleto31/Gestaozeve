'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { X, Plus } from 'lucide-react'

type Cliente = { id: string; nome: string; conta_genial?: string | null }

interface Props {
  clientes: Cliente[]
}

export function NovaPlataformaModal({ clientes }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState({
    cliente_id: '',
    plataforma: '',
    valor: '',
    mes_referencia: new Date().toISOString().slice(0, 7),
    observacoes: '',
  })

  const clientesFiltrados = busca.length > 1
    ? clientes.filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase()) || (c.conta_genial ?? '').toLowerCase().includes(busca.toLowerCase())).slice(0, 8)
    : []

  function handleClose() {
    setOpen(false)
    setError('')
    setBusca('')
    setForm({ cliente_id: '', plataforma: '', valor: '', mes_referencia: new Date().toISOString().slice(0, 7), observacoes: '' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const valorNum = parseFloat(form.valor.replace(',', '.'))
    if (isNaN(valorNum)) {
      setError('Valor inválido')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: err } = await supabase.from('plataformas').insert({
      cliente_id: form.cliente_id || null,
      plataforma: form.plataforma,
      valor: valorNum,
      mes_referencia: form.mes_referencia,
      observacoes: form.observacoes || null,
    })

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    setLoading(false)
    handleClose()
    router.refresh()
  }

  const clienteSelecionado = clientes.find((c) => c.id === form.cliente_id)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" />
        Nova Plataforma
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
          <div className="relative bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Nova Plataforma</h2>
              <button onClick={handleClose} className="text-gray-500 hover:text-gray-900"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Busca de cliente */}
              <div>
                <label className="block text-sm text-gray-500 mb-1.5">Cliente</label>
                {clienteSelecionado ? (
                  <div className="flex items-center justify-between bg-blue-900/20 border border-blue-700/40 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-sm text-gray-900 font-medium">{clienteSelecionado.nome}</p>
                      {clienteSelecionado.conta_genial && (
                        <p className="text-xs text-gray-500">Conta Genial: {clienteSelecionado.conta_genial}</p>
                      )}
                    </div>
                    <button type="button" onClick={() => setForm({ ...form, cliente_id: '' })} className="text-xs text-gray-500 hover:text-gray-900">
                      Trocar
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                      placeholder="Buscar cliente por nome ou conta Genial..."
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                    />
                    {clientesFiltrados.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-gray-100 border border-gray-200 rounded-lg overflow-hidden z-10 shadow-xl">
                        {clientesFiltrados.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors"
                            onClick={() => { setForm({ ...form, cliente_id: c.id }); setBusca('') }}
                          >
                            <p className="text-sm text-gray-900">{c.nome}</p>
                            {c.conta_genial && <p className="text-xs text-gray-500">Conta: {c.conta_genial}</p>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Input
                label="Plataforma"
                placeholder="Ex: Profit Pro, TraderEvolution..."
                value={form.plataforma}
                onChange={(e) => setForm({ ...form, plataforma: e.target.value })}
                required
              />

              <div>
                <label className="block text-sm text-gray-500 mb-1.5">
                  Valor <span className="text-gray-400">(use negativo se coberto pelos contratos)</span>
                </label>
                <input
                  type="text"
                  className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  placeholder="Ex: 150.00 ou -75.50"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1.5">Mês de referência</label>
                <input
                  type="month"
                  className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500"
                  value={form.mes_referencia}
                  onChange={(e) => setForm({ ...form, mes_referencia: e.target.value })}
                  required
                />
              </div>

              <Input
                label="Observações (opcional)"
                placeholder="..."
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />

              {error && (
                <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-3 py-2">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={handleClose}>Cancelar</Button>
                <Button type="submit" className="flex-1" loading={loading}>Salvar</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
