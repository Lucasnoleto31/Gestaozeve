'use client'

import Link from 'next/link'
import { MessageCircle, ArrowUpRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

type ClienteRisco = {
  id: string
  nome: string
  telefone?: string | null
  score: number | null
  classificacao: string | null
  tendencia: string | null
  diasSemOperar: number | null
  risco: { nivel: 'alto' | 'medio' | 'baixo'; percentual: number }
  assessor: string | null
  influenciador: string | null
}

const nivelConfig = {
  alto: { label: 'Alto', variant: 'danger' as const, bar: 'bg-red-500' },
  medio: { label: 'Médio', variant: 'warning' as const, bar: 'bg-amber-500' },
  baixo: { label: 'Baixo', variant: 'success' as const, bar: 'bg-emerald-500' },
}

function TendenciaIcon({ tendencia }: { tendencia: string | null }) {
  if (tendencia === 'subindo') return <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
  if (tendencia === 'caindo') return <TrendingDown className="w-3.5 h-3.5 text-red-500" />
  return <Minus className="w-3.5 h-3.5 text-gray-500" />
}

interface Props {
  clientes: ClienteRisco[]
  titulo: string
  emptyMsg: string
}

export function RiscoTable({ clientes, titulo, emptyMsg }: Props) {
  return (
    <div className="rounded-xl overflow-hidden animate-fade-up" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
        <span className="text-xs text-gray-500">{clientes.length} cliente{clientes.length !== 1 ? 's' : ''}</span>
      </div>

      {clientes.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-gray-500">{emptyMsg}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Assessor</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">CHS</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tendência</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Sem operar</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Risco</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {clientes.map((c) => {
                const cfg = nivelConfig[c.risco.nivel]
                const tel = c.telefone?.replace(/\D/g, '')
                return (
                  <tr key={c.id} className="hover:bg-blue-50/50 transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="px-4 py-3">
                      <Link href={`/clientes/${c.id}`} className="font-medium text-gray-900 hover:text-blue-600 transition-colors flex items-center gap-1">
                        {c.nome}
                        <ArrowUpRight className="w-3 h-3 text-gray-400" />
                      </Link>
                      {c.influenciador && (
                        <p className="text-xs text-blue-600 mt-0.5">via {c.influenciador}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">
                      {c.assessor ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-bold ${c.score !== null && c.score >= 80 ? 'text-emerald-600' : c.score !== null && c.score >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                        {c.score ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <TendenciaIcon tendencia={c.tendencia} />
                        <span className="text-xs text-gray-500">
                          {c.tendencia === 'subindo' ? 'subindo' : c.tendencia === 'caindo' ? 'caindo' : 'estável'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center hidden lg:table-cell">
                      {c.diasSemOperar !== null ? (
                        <span className={`text-xs font-medium ${c.diasSemOperar > 90 ? 'text-red-500' : c.diasSemOperar > 60 ? 'text-amber-600' : 'text-gray-500'}`}>
                          {c.diasSemOperar}d
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                          <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${c.risco.percentual}%` }} />
                        </div>
                        <Badge variant={cfg.variant} className="text-xs">{c.risco.percentual}%</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {tel && (
                        <a
                          href={`https://wa.me/55${tel}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 transition-colors"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          WhatsApp
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
