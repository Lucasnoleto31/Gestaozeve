'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { FunilEtapa } from '@/types'
import { ArrowRight } from 'lucide-react'

interface Props {
  leadId: string
  etapaAtualId: string
  etapas: FunilEtapa[]
  canEdit: boolean
}

export function MoverEtapaButton({ leadId, etapaAtualId, etapas, canEdit }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selectedEtapa, setSelectedEtapa] = useState('')
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  if (!canEdit) return null

  async function handleMover() {
    if (!selectedEtapa) return
    setLoading(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user?.id)
      .single()

    await supabase.from('leads').update({ etapa_id: selectedEtapa }).eq('id', leadId)
    await supabase.from('lead_historico').insert({
      lead_id: leadId,
      etapa_anterior_id: etapaAtualId,
      etapa_nova_id: selectedEtapa,
      vendedor_id: profile?.id,
      observacao: observacao || null,
    })

    setLoading(false)
    setOpen(false)
    setObservacao('')
    router.refresh()
  }

  const proximas = etapas.filter((e) => e.id !== etapaAtualId)

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="w-full mt-4"
        onClick={() => setOpen(true)}
      >
        <ArrowRight className="w-4 h-4" />
        Mover de Etapa
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Mover para etapa</h3>

            <div className="space-y-2 mb-4">
              {proximas.map((etapa) => (
                <button
                  key={etapa.id}
                  onClick={() => setSelectedEtapa(etapa.id)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border ${
                    selectedEtapa === etapa.id
                      ? 'border-blue-500 bg-blue-600/10 text-slate-900'
                      : 'border-gray-200 hover:border-gray-300 text-gray-400'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: etapa.cor }} />
                  {etapa.nome}
                </button>
              ))}
            </div>

            <textarea
              className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
              rows={2}
              placeholder="Observação (opcional)"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />

            <div className="flex gap-3">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={handleMover}
                loading={loading}
                disabled={!selectedEtapa}
              >
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
