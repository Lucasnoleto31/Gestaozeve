'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Trash2, Link } from 'lucide-react'
import NextLink from 'next/link'
import { deletarPlataformas } from './actions'

type Plataforma = {
  id: string
  plataforma: string
  valor: number
  mes_referencia: string
  observacoes?: string | null
  created_at: string
  cliente: {
    id: string
    nome: string
    conta_genial?: string | null
    assessor?: { nome: string } | null
    influenciador?: { nome: string; codigo: string } | null
  } | null
}

interface Props {
  plataformas: Plataforma[]
  isAdmin: boolean
}

function formatValor(valor: number) {
  const abs = Math.abs(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return valor >= 0 ? `R$ ${abs}` : `- R$ ${abs}`
}

export function PlataformasClient({ plataformas, isAdmin }: Props) {
  const router = useRouter()
  const [deletando, setDeletando] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(plataformas.map((p) => p.id)) : new Set())
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este registro de plataforma?')) return
    setDeletando(id)
    await deletarPlataformas([id])
    setDeletando(null)
    router.refresh()
  }

  function handleDeletarEmMassa() {
    if (!confirm(`Excluir ${selected.size} registro(s)? Esta ação não pode ser desfeita.`)) return
    startTransition(async () => {
      const result = await deletarPlataformas(Array.from(selected))
      if (result?.error) { alert(`Erro ao excluir: ${result.error}`); return }
      setSelected(new Set())
      router.refresh()
    })
  }

  const allSelected = plataformas.length > 0 && selected.size === plataformas.length

  if (plataformas.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 text-center text-gray-500 text-sm">
        Nenhuma plataforma registrada para este período.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Barra de ações em massa */}
      {isAdmin && selected.size > 0 && (
        <div className="sticky top-2 z-30 flex items-center gap-3 bg-gray-900 text-white rounded-lg px-4 py-2.5 shadow-md">
          <span className="text-sm font-medium">{selected.size} selecionado(s)</span>
          <button
            onClick={handleDeletarEmMassa}
            disabled={isPending}
            className="flex items-center gap-1.5 text-sm bg-red-500 hover:bg-red-600 disabled:opacity-50 px-3 py-1 rounded-md transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Excluir selecionados
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-gray-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                {isAdmin && (
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 cursor-pointer"
                    />
                  </th>
                )}
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Assessor / Influenciador</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Plataforma</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Valor</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Mês</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Observações</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {plataformas.map((p) => {
                const positivo = p.valor >= 0
                const [ano, mes] = p.mes_referencia.split('-')
                const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
                const mesLabel = `${meses[parseInt(mes) - 1]}/${ano}`
                const isSelected = selected.has(p.id)

                return (
                  <tr key={p.id} className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(p.id)}
                          className="rounded border-gray-300 text-blue-600 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {p.cliente ? (
                        <NextLink href={`/clientes/${p.cliente.id}`} className="hover:text-blue-600 transition-colors flex items-center gap-1.5">
                          <span className="font-medium text-gray-900">{p.cliente.nome}</span>
                          <Link className="w-3 h-3 text-gray-400" />
                        </NextLink>
                      ) : (
                        <span className="text-gray-500 italic text-xs">Sem vínculo</span>
                      )}
                      {p.cliente?.conta_genial && (
                        <p className="text-xs text-gray-400 mt-0.5">Conta: {p.cliente.conta_genial}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="space-y-0.5">
                        {p.cliente?.assessor?.nome && (
                          <p className="text-xs text-gray-400">{p.cliente.assessor.nome}</p>
                        )}
                        {p.cliente?.influenciador?.nome && (
                          <p className="text-xs text-blue-600 font-mono">@{p.cliente.influenciador.codigo}</p>
                        )}
                        {!p.cliente?.assessor && !p.cliente?.influenciador && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{p.plataforma}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold tabular-nums ${positivo ? 'text-emerald-600' : 'text-red-500'}`}>
                        {formatValor(p.valor)}
                      </span>
                      <Badge variant={positivo ? 'success' : 'danger'} className="ml-2 text-xs">
                        {positivo ? '+' : '−'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-medium">{mesLabel}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell max-w-40 truncate">
                      {p.observacoes ?? '—'}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDelete(p.id)}
                          disabled={deletando === p.id}
                          className="text-gray-400 hover:text-red-400 transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
