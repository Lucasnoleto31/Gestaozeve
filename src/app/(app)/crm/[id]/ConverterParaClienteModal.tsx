'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { converterParaCliente } from '../actions'
import { UserCheck } from 'lucide-react'

interface Props {
  leadId: string
  nomePreenchido: string
  assessores: { id: string; nome: string }[]
}

const SELECT_CLASS = 'w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'

export function ConverterParaClienteModal({ leadId, nomePreenchido, assessores }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [cpf, setCpf] = useState('')
  const [assessorId, setAssessorId] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleConverter() {
    setError('')
    startTransition(async () => {
      try {
        const clienteId = await converterParaCliente(leadId, cpf, assessorId || null)
        setOpen(false)
        router.push(`/clientes/${clienteId}`)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erro ao converter.')
      }
    })
  }

  return (
    <>
      <Button variant="secondary" size="sm" className="text-emerald-400 border-emerald-700/40 hover:bg-emerald-900/20" onClick={() => setOpen(true)}>
        <UserCheck className="w-4 h-4" />
        Converter para Cliente
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Converter para Cliente</h3>
            <p className="text-xs text-gray-500 mb-1">
              O lead <span className="text-gray-400 font-medium">{nomePreenchido}</span> será cadastrado como cliente.
            </p>
            <p className="text-xs text-gray-400 mb-5">O status do lead será alterado para "Convertido".</p>

            <div className="space-y-4">
              <Input
                label="CPF *"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                required
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-400">Assessor responsável</label>
                <select value={assessorId} onChange={(e) => setAssessorId(e.target.value)} className={SELECT_CLASS}>
                  <option value="">Sem assessor</option>
                  {assessores.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </div>
            </div>

            {error && (
              <div className="mt-3 bg-red-900/30 border border-red-700/50 rounded-lg px-3 py-2">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleConverter} loading={isPending} disabled={!cpf}>
                Converter
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
