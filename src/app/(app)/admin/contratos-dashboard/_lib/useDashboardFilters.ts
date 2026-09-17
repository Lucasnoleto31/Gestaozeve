'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import type { Periodo } from '../actions'
import { isCorretora, type Corretora } from '@/lib/corretoras'

const VALID_PERIODOS: Periodo[] = ['30d', '60d', '90d', 'ano', 'tudo']
const DEFAULT_PERIODO: Periodo = '30d'
const CUSTOM_RE = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/

// Hook compartilhado entre sub-rotas: lê os filtros da URL
// (?periodo=90d&corretora=XP&barra=ZEVE+1&excluir=FULANO) e expõe setters
// que fazem router.replace mantendo a rota atual.
export function useDashboardFilters(): {
  periodo: Periodo
  corretora: Corretora | null
  barra: string | null
  excluir: string | null
  customRange: { inicio: string; fim: string } | null
  setPeriodo: (p: Periodo) => void
  setRange: (inicio: string, fim: string) => void
  setCorretora: (c: Corretora | null) => void
  setBarra: (b: string | null) => void
  setExcluir: (c: string | null) => void
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

  // Corretora (GENIAL | XP | BTG); qualquer outro valor = todas
  const corretora = useMemo<Corretora | null>(() => {
    const c = (searchParams.get('corretora') ?? '').trim().toUpperCase()
    return isCorretora(c) ? c : null
  }, [searchParams])

  const barra = useMemo<string | null>(() => {
    const b = searchParams.get('barra')
    return b && b.trim() !== '' ? b : null
  }, [searchParams])

  // Cliente excluído dos lotes (nome como veio da importação; casa todas as contas dele)
  const excluir = useMemo<string | null>(() => {
    const c = searchParams.get('excluir')
    return c && c.trim() !== '' ? c : null
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

  const setPeriodo   = useCallback((p: Periodo) => updateParams({ periodo: p === DEFAULT_PERIODO ? null : p }), [updateParams])
  const setRange     = useCallback((inicio: string, fim: string) => updateParams({ periodo: `custom:${inicio}:${fim}` }), [updateParams])
  // Trocar de corretora limpa a barra: as barras são de uma corretora só.
  const setCorretora = useCallback((c: Corretora | null) => updateParams({ corretora: c, barra: null }), [updateParams])
  const setBarra     = useCallback((b: string | null) => updateParams({ barra: b }), [updateParams])
  const setExcluir   = useCallback((c: string | null) => updateParams({ excluir: c }), [updateParams])

  return { periodo, corretora, barra, excluir, customRange, setPeriodo, setRange, setCorretora, setBarra, setExcluir }
}
