'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import type { Periodo } from '../actions'

const VALID_PERIODOS: Periodo[] = ['hoje', 'semana', '30d', 'mes', 'mes_anterior', 'tudo']

// Hook compartilhado entre sub-rotas: lê os filtros da URL (?periodo=mes&barra=ZEVE+1)
// e expõe setters que fazem router.replace mantendo a rota atual.
export function useDashboardFilters(): {
  periodo: Periodo
  barra: string | null
  setPeriodo: (p: Periodo) => void
  setBarra: (b: string | null) => void
} {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const periodo = useMemo<Periodo>(() => {
    const p = searchParams.get('periodo') as Periodo | null
    return p && VALID_PERIODOS.includes(p) ? p : 'mes'
  }, [searchParams])

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

  const setPeriodo = useCallback((p: Periodo) => updateParams({ periodo: p === 'mes' ? null : p }), [updateParams])
  const setBarra   = useCallback((b: string | null) => updateParams({ barra: b }), [updateParams])

  return { periodo, barra, setPeriodo, setBarra }
}
