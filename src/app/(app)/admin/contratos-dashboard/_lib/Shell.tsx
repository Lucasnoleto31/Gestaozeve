'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { TABS } from './types'
import type { Periodo } from '../actions'
import { getBarrasAtivas } from '../actions'
import { useDashboardFilters } from './useDashboardFilters'
import { fmtDataPt } from './utils'

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: '30d',  label: '30 dias' },
  { id: '60d',  label: '60 dias' },
  { id: '90d',  label: '90 dias' },
  { id: 'ano',  label: 'Ano' },
  { id: 'tudo', label: 'Tudo' },
]

// Context pra sub-rotas reportarem dataset_max e estado de loading pro Shell
type ShellCtx = {
  datasetMax: string | null
  setDatasetMax: (s: string | null) => void
  isLoading: boolean
  setIsLoading: (b: boolean) => void
}
const ShellContext = createContext<ShellCtx>({
  datasetMax: null, setDatasetMax: () => {},
  isLoading: false, setIsLoading: () => {},
})

export function useShell() { return useContext(ShellContext) }

// ===========================================================
// Shell client component que envolve as sub-rotas
// Renderiza tabs + filtros globais; o conteudo da rota vem via children.
// ===========================================================
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [barras, setBarras] = useState<{ barra_nome: string; numero: string | null }[]>([])
  const [datasetMax, setDatasetMax] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    getBarrasAtivas().then(setBarras).catch(() => {})
  }, [])

  return (
    <ShellContext.Provider value={{ datasetMax, setDatasetMax, isLoading, setIsLoading }}>
      <div className="px-6 lg:px-8 py-6 space-y-6">
        <DashboardNav />
        <FilterBar barras={barras} datasetMax={datasetMax} isLoading={isLoading} />
        {children}
      </div>
    </ShellContext.Provider>
  )
}

// ===========================================================
// Tabs (sub-rotas)
// ===========================================================
function DashboardNav() {
  const pathname = usePathname()
  return (
    <nav className="flex flex-wrap gap-1 rounded-2xl p-1.5"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      {TABS.map(t => {
        const active = t.href === '/admin/contratos-dashboard'
          ? pathname === t.href
          : pathname.startsWith(t.href)
        return (
          <Link key={t.id} href={t.href}
            className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
            style={active
              ? { background: 'var(--blue)', color: '#fff' }
              : { color: 'var(--muted)' }}
            onMouseEnter={(e) => {
              if (!active) {
                ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'
                ;(e.currentTarget as HTMLElement).style.color = 'var(--ink)'
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                ;(e.currentTarget as HTMLElement).style.background = ''
                ;(e.currentTarget as HTMLElement).style.color = 'var(--muted)'
              }
            }}>
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

// ===========================================================
// Filtros globais (período + barra) sincronizados com URL
// ===========================================================
function RangeFilter({ customRange, datasetMax, isLoading, onApply }:
  { customRange: { inicio: string; fim: string } | null; datasetMax: string | null; isLoading: boolean;
    onApply: (inicio: string, fim: string) => void }
) {
  const [de, setDe] = useState(customRange?.inicio ?? '')
  const [ate, setAte] = useState(customRange?.fim ?? '')

  // Mantém os inputs em sincronia com a URL (ex.: navegação, reload) —
  // reconciliação durante o render em vez de useEffect (evita render extra).
  const rangeKey = customRange ? `${customRange.inicio}:${customRange.fim}` : ''
  const [prevRangeKey, setPrevRangeKey] = useState(rangeKey)
  if (rangeKey !== prevRangeKey) {
    setPrevRangeKey(rangeKey)
    if (customRange) { setDe(customRange.inicio); setAte(customRange.fim) }
  }

  const active = customRange != null
  function update(nextDe: string, nextAte: string) {
    setDe(nextDe); setAte(nextAte)
    if (nextDe && nextAte) onApply(nextDe, nextAte)
  }

  const inputStyle = {
    background: active ? 'var(--blue)' : 'var(--surface)',
    color: active ? '#fff' : 'var(--muted)',
    border: '1px solid var(--border)',
    colorScheme: 'light' as const,
  }

  return (
    <div className="flex items-center gap-1.5">
      <input type="date" value={de} max={ate || datasetMax || undefined} disabled={isLoading}
        onChange={e => update(e.target.value, ate)}
        className="px-2.5 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 cursor-pointer"
        style={inputStyle} aria-label="Data inicial" />
      <span className="text-xs text-gray-400">até</span>
      <input type="date" value={ate} min={de || undefined} max={datasetMax || undefined} disabled={isLoading}
        onChange={e => update(de, e.target.value)}
        className="px-2.5 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 cursor-pointer"
        style={inputStyle} aria-label="Data final" />
    </div>
  )
}

function FilterBar({ barras, datasetMax, isLoading }:
  { barras: { barra_nome: string; numero: string | null }[]; datasetMax: string | null; isLoading: boolean }
) {
  const { periodo, barra, customRange, setPeriodo, setRange, setBarra } = useDashboardFilters()
  return (
    <div className="rounded-2xl p-4 flex flex-wrap items-center gap-3"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Período</span>
      <div className="flex flex-wrap gap-1.5">
        {PERIODOS.map(p => {
          const active = p.id === periodo
          return (
            <button key={p.id} onClick={() => setPeriodo(p.id)} disabled={isLoading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              style={active
                ? { background: 'var(--blue)', color: '#fff' }
                : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
              {p.label}
            </button>
          )
        })}
      </div>

      <span className="text-[11px] text-gray-300">ou</span>
      <RangeFilter customRange={customRange} datasetMax={datasetMax} isLoading={isLoading} onApply={setRange} />

      <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold ml-2">Barra</span>
      <select
        value={barra ?? ''}
        onChange={e => setBarra(e.target.value || null)}
        disabled={isLoading}
        className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 cursor-pointer"
        style={{ background: barra ? 'var(--blue)' : 'var(--surface)',
                 color: barra ? '#fff' : 'var(--muted)',
                 border: '1px solid var(--border)', minWidth: 200 }}>
        <option value="">Todas as barras</option>
        {barras.map(b => (
          <option key={b.barra_nome} value={b.barra_nome}>
            {b.barra_nome}{b.numero ? ` · ${b.numero}` : ''}
          </option>
        ))}
      </select>

      <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
        {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
        {datasetMax && (
          <span title="Data mais recente no dataset">
            Dataset até <strong className="text-gray-700">{fmtDataPt(datasetMax)}</strong>
          </span>
        )}
      </div>
    </div>
  )
}
