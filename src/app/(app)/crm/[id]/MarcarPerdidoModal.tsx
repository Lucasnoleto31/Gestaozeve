'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { marcarPerdido } from '../actions'
import { XCircle } from 'lucide-react'

export function MarcarPerdidoModal({ leadId }: { leadId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleConfirmar() {
    startTransition(async () => {
      await marcarPerdido(leadId, motivo)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        <XCircle className="w-4 h-4" />
        Marcar como Perdido
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Marcar como Perdido</h3>
            <p className="text-xs text-gray-500 mb-4">Informe o motivo da perda para análise futura.</p>

            <div className="flex flex-col gap-1.5 mb-5">
              <label className="text-sm font-medium text-gray-400">Motivo da perda</label>
              <textarea
                className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                rows={3}
                placeholder="Ex: preço, concorrência, sem interesse..."
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button variant="danger" className="flex-1" onClick={handleConfirmar} loading={isPending}>
                Confirmar Perda
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
