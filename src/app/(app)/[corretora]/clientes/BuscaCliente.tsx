'use client'

// Busca rápida de cliente (nome, CPF ou conta) → abre a ficha
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search } from 'lucide-react'
import { buscarClientesAction } from '@/lib/gestao/acoes'
import type { Corretora } from '@/lib/corretoras'
import { cn } from '@/lib/utils'

type Item = { id: string; nome: string; documento: string | null; conta: string | null }

export function BuscaCliente({ corretora, base, autoFocus, className }: { corretora: Corretora; base: string; autoFocus?: boolean; className?: string }) {
  const router = useRouter()
  const [termo, setTermo] = useState('')
  const [itens, setItens] = useState<Item[]>([])
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [sel, setSel] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ultimo = useRef('')

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const t = termo.trim()
    if (t.length < 2) { ultimo.current = ''; return }
    timer.current = setTimeout(async () => {
      ultimo.current = t
      setCarregando(true)
      const r = await buscarClientesAction(corretora, t)
      if (ultimo.current !== t) return
      setCarregando(false)
      if (r.ok) { setItens(r.dados); setAberto(true); setSel(0) }
    }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [termo, corretora])

  const abrir = (item: Item) => {
    setAberto(false)
    setTermo('')
    router.push(`${base}/clientes/${item.id}`)
  }

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
      <input
        className="w-64 pl-8 pr-8"
        placeholder="Buscar cliente, CPF ou conta…"
        value={termo}
        autoFocus={autoFocus}
        onChange={e => setTermo(e.target.value)}
        onFocus={() => itens.length && setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={e => {
          if (!aberto) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(itens.length - 1, s + 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)) }
          if (e.key === 'Enter' && itens[sel]) { e.preventDefault(); abrir(itens[sel]) }
          if (e.key === 'Escape') setAberto(false)
        }}
      />
      {carregando && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-fg-subtle" />}
      {aberto && (
        <ul className="panel absolute right-0 z-20 mt-1 max-h-80 w-80 overflow-y-auto py-1 text-[13px] shadow-lg">
          {itens.length === 0 && <li className="px-3 py-2 text-fg-subtle">Nenhum cliente encontrado.</li>}
          {itens.map((it, i) => (
            <li key={it.id}>
              <button
                type="button"
                className={cn('flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-surface-2', i === sel && 'bg-surface-2')}
                onMouseDown={e => e.preventDefault()}
                onClick={() => abrir(it)}
              >
                <span className="font-medium text-fg">{it.nome}</span>
                <span className="text-[11px] text-fg-subtle">{it.documento ?? 'sem CPF'}{it.conta ? ` · conta ${it.conta}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
