'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import type { Periodo } from '../actions'

const VALID_PERIODOS: Periodo[] = ['30d', '60d', '90d', 'ano', 'tudo']
const DEFAULT_PERIODO: Periodo = '30d'
const CUSTOM_RE = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/

// Hook compartilhado entre sub-rotas: lê os filtros da URL (?periodo=mes&barra=ZEVE+1)
// e expõe setters que fazem router.replace mantendo a rota atual.
export function useDashboardFilters(): {
  periodo: Periodo
  barra: string | null
  customRange: { inicio: string; fim: string } | null
  setPeriodo: (p: Periodo) => void
  setRange: (inicio: string, fim: string) => void
  setBarra: (b: string | null) => void
} {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const periodo = useMemo<Periodo>(() => {
    const p = searchParams.get('periodo')
    if (!p) return DEFAULT_PERIODO
    if (CUSTOM_RE.test(p)) return p as Periodo
    return VALID_PERIODOS.includes(p as Periodo) ? (p as Periodo) : DEFAULT_PERIODO
  }, [searchParams])

  const customRange = useMemo<{ inicio: string; fim: string } | null>(() => {
    const m = CUSTOM_RE.exec(periodo)
    return m ? { inicio: m[1], fim: m[2] } : null
  }, [periodo])

  const barra = useMemo<string | null>(() => {
    const b = searchParams.get('barra')
    return b && b.trim() !== '' ? b : null
  }, [searchParams])

  const updateParams = useCallback((updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname, searchParams])

  const setPeriodo = useCallback((p: Periodo) => updateParams({ periodo: p === DEFAULT_PERIODO ? null : p }), [updateParams])
  const setRange   = useCallback((inicio: string, fim: string) => updateParams({ periodo: `custom:${inicio}:${fim}` }), [updateParams])
  const setBarra   = useCallback((b: string | null) => updateParams({ barra: b }), [updateParams])

  return { periodo, barra, customRange, setPeriodo, setRange, setBarra }
}
