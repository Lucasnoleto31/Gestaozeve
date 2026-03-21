'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ClienteFollowup } from '@/types/cliente'
import { agendarFollowup, atualizarFollowup } from './actions'
import { Calendar, CheckCircle, X, Plus } from 'lucide-react'

interface Props {
  clienteId: string
  followup: ClienteFollowup | null
}

function formatDatetimeBR(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso))
}

function isVencido(iso: string) {
  return new Date(iso) < new Date()
}

export function ProximoContatoCard({ clienteId, followup }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [agendando, setAgendando] = useState(false)
  const [data, setData] = useState('')
  const [obs, setObs] = useState('')

  function handleAgendar() {
    if (!data) return
    startTransition(async () => {
      await agendarFollowup(clienteId, data, obs || null)
      setAgendando(false)
      setData('')
      setObs('')
      router.refresh()
    })
  }

  function handleStatus(status: 'realizado' | 'cancelado') {
    if (!followup) return
    startTransition(async () => {
      await atualizarFollowup(followup.id, clienteId, status)
      router.refresh()
    })
  }

  const vencido = followup ? isVencido(followup.agendado_para) : false

  return (
    <div className="space-y-3">
      {followup ? (
        <div className={`rounded-xl border p-4 ${vencido ? 'bg-red-900/20 border-red-700/40' : 'bg-blue-900/20 border-blue-700/40'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <Calendar className={`w-4 h-4 mt-0.5 flex-shrink-0 ${vencido ? 'text-red-400' : 'text-blue-400'}`} />
              <div>
                <p className={`text-sm font-semibold ${vencido ? 'text-red-300' : 'text-blue-200'}`}>
                  {formatDatetimeBR(followup.agendado_para)}
                  {vencido && <span className="ml-2 text-xs text-red-400">(vencido)</span>}
                </p>
                {followup.observacao && (
                  <p className="text-xs text-gray-500 mt-1">{followup.observacao}</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 text-emerald-400 border-emerald-700/40 hover:bg-emerald-900/20"
              onClick={() => handleStatus('realizado')}
              loading={isPending}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Realizado
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleStatus('cancelado')}
              loading={isPending}
            >
              <X className="w-3.5 h-3.5" />
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-2">Nenhum contato agendado.</p>
      )}

      {agendando ? (
        <div className="bg-gray-100 border border-gray-200 rounded-xl p-4 space-y-3">
          <Input
            label="Data e hora"
            type="datetime-local"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-400">Observação</label>
            <textarea
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
              placeholder="Pauta do contato..."
              value={obs}
              onChange={(e) => setObs(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" className="flex-1" onClick={() => setAgendando(false)}>
              Cancelar
            </Button>
            <Button size="sm" className="flex-1" onClick={handleAgendar} loading={isPending} disabled={!data}>
              Agendar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" className="w-full" onClick={() => setAgendando(true)}>
          <Plus className="w-4 h-4" />
          {followup ? 'Reagendar' : 'Agendar contato'}
        </Button>
      )}
    </div>
  )
}
