'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { atualizarTemperatura } from '../actions'
import { Flame, Droplets, Wind, ChevronDown } from 'lucide-react'

interface Props {
  leadId: string
  temperatura: string | null
}

const opcoes = [
  { value: 'quente', label: 'Quente', icon: Flame, color: 'text-red-400', bg: 'bg-red-900/20 border-red-700/40' },
  { value: 'morno', label: 'Morno', icon: Droplets, color: 'text-amber-400', bg: 'bg-amber-900/20 border-amber-700/40' },
  { value: 'frio', label: 'Frio', icon: Wind, color: 'text-blue-400', bg: 'bg-blue-900/20 border-blue-700/40' },
]

export function TemperaturaButton({ leadId, temperatura }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  const atual = opcoes.find((o) => o.value === temperatura)
  const Icon = atual?.icon

  function handleSelect(value: string | null) {
    setOpen(false)
    startTransition(async () => {
      await atualizarTemperatura(leadId, value)
      router.refresh()
    })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={isPending}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${atual ? `${atual.bg} ${atual.color}` : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'}`}
      >
        {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
        {atual ? atual.label : 'Temperatura'}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 bg-gray-100 border border-gray-200 rounded-xl py-1 z-20 min-w-36 shadow-xl">
            {opcoes.map((op) => {
              const OpIcon = op.icon
              return (
                <button
                  key={op.value}
                  onClick={() => handleSelect(op.value)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-700 ${op.color} ${temperatura === op.value ? 'font-semibold' : ''}`}
                >
                  <OpIcon className="w-3.5 h-3.5" />
                  {op.label}
                </button>
              )
            })}
            {temperatura && (
              <button
                onClick={() => handleSelect(null)}
                className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-700 hover:text-gray-400 border-t border-gray-200 mt-1"
              >
                Remover
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
