'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Lead, FunilEtapa } from '@/types'
import { moverEtapa } from './actions'
import { formatDate } from '@/lib/utils'
import { Phone, Mail, Flame, Droplets, Wind, Eye } from 'lucide-react'

interface Props {
  leads: Lead[]
  etapas: FunilEtapa[]
}

const temperaturaConfig = {
  quente: { icon: Flame, color: 'text-red-400' },
  morno: { icon: Droplets, color: 'text-amber-400' },
  frio: { icon: Wind, color: 'text-blue-400' },
}

export function CRMKanban({ leads: initialLeads, etapas }: Props) {
  const [leads, setLeads] = useState(initialLeads)
  const [isPending, startTransition] = useTransition()
  const [dragOver, setDragOver] = useState<string | null>(null)

  function handleDragStart(e: React.DragEvent, leadId: string) {
    e.dataTransfer.setData('leadId', leadId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, etapaId: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(etapaId)
  }

  function handleDragLeave() {
    setDragOver(null)
  }

  function handleDrop(e: React.DragEvent, etapaId: string) {
    e.preventDefault()
    setDragOver(null)
    const leadId = e.dataTransfer.getData('leadId')
    if (!leadId) return

    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.etapa_id === etapaId) return

    const novaEtapa = etapas.find((et) => et.id === etapaId)

    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => l.id === leadId ? { ...l, etapa_id: etapaId, etapa: novaEtapa } : l)
    )

    startTransition(async () => {
      await moverEtapa(leadId, etapaId, null)
    })
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
      {etapas.map((etapa) => {
        const colLeads = leads.filter((l) => l.etapa_id === etapa.id)
        const isOver = dragOver === etapa.id

        return (
          <div
            key={etapa.id}
            className="flex-shrink-0 w-72"
            onDragOver={(e) => handleDragOver(e, etapa.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, etapa.id)}
          >
            {/* Column header */}
            <div
              className="flex items-center justify-between px-3 py-2 rounded-t-xl border-t-2 bg-white border border-gray-200"
              style={{ borderTopColor: etapa.cor }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{etapa.nome}</span>
              </div>
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {colLeads.length}
              </span>
            </div>

            {/* Cards */}
            <div
              className={`min-h-24 space-y-2 p-2 rounded-b-xl border border-t-0 border-gray-200 transition-colors ${isOver ? 'bg-blue-900/10 border-blue-700/40' : 'bg-blue-50/30'}`}
            >
              {colLeads.map((lead) => {
                const tempConfig = lead.temperatura ? temperaturaConfig[lead.temperatura] : null
                const TempIcon = tempConfig?.icon

                return (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    className="bg-white border border-gray-200 rounded-xl p-3 cursor-grab active:cursor-grabbing hover:border-gray-300 transition-colors select-none"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-medium text-gray-900 leading-tight">{lead.nome}</p>
                      {TempIcon && tempConfig && (
                        <TempIcon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${tempConfig.color}`} />
                      )}
                    </div>

                    <div className="space-y-1 mb-3">
                      {lead.email && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Mail className="w-3 h-3" />
                          <span className="truncate">{lead.email}</span>
                        </div>
                      )}
                      {lead.telefone && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Phone className="w-3 h-3" />
                          <span>{lead.telefone}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">{formatDate(lead.created_at)}</span>
                      <Link
                        href={`/crm/${lead.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        Ver
                      </Link>
                    </div>
                  </div>
                )
              })}

              {colLeads.length === 0 && (
                <div className="py-6 text-center">
                  <p className="text-xs text-gray-400">Sem leads aqui</p>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
