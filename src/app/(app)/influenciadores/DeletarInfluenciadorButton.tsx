'use client'

import { useState } from 'react'
import { Trash2, X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { deletarInfluenciador } from './actions'

interface Props {
  id: string
  userId: string | null
  nome: string
}

export function DeletarInfluenciadorButton({ id, userId, nome }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleDeletar() {
    setLoading(true)
    setError('')
    try {
      await deletarInfluenciador(id, userId)
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir influenciador')
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        title="Excluir influenciador"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                </div>
                <h2 className="text-base font-semibold text-gray-900">Excluir influenciador</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-1">
              Tem certeza que deseja excluir <span className="font-semibold text-gray-900">{nome}</span>?
            </p>
            <p className="text-xs text-gray-500 mb-5">
              Esta ação é irreversível. O influenciador e seu acesso ao sistema serão removidos permanentemente.
            </p>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                className="flex-1 !bg-red-600 hover:!bg-red-700"
                loading={loading}
                onClick={handleDeletar}
              >
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
