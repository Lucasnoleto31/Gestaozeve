'use client'

// Tema claro/escuro.
// - Preferência salva em localStorage + cookie (o cookie deixa o servidor
//   renderizar o <html class="dark"> certo; o localStorage manda no cliente).
// - THEME_INIT_SCRIPT roda inline no <head> antes da hidratação, então a
//   página já nasce no tema certo (sem piscar).
// - O estado vive fora do React (useSyncExternalStore): sem setState em
//   effect e sem divergência entre servidor e cliente.

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { THEME_COOKIE, THEME_STORAGE_KEY, isThemePref, type ResolvedTheme, type ThemePref } from './theme-shared'

export type { ResolvedTheme, ThemePref }

const STORAGE_KEY = THEME_STORAGE_KEY

// ── store externo ──────────────────────────────────────────────────────────
const listeners = new Set<() => void>()

function readPref(): ThemePref {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (isThemePref(s)) return s
  } catch {}
  const m = typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )zeve-theme=(light|dark|system)/) : null
  return m && isThemePref(m[1]) ? m[1] : 'system'
}

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolvePref(p: ThemePref): ResolvedTheme {
  if (p === 'system') return systemDark() ? 'dark' : 'light'
  return p
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', cb)
  window.addEventListener('storage', cb)
  return () => {
    listeners.delete(cb)
    mq.removeEventListener('change', cb)
    window.removeEventListener('storage', cb)
  }
}

function getSnapshot(): string {
  const p = readPref()
  return `${p}|${resolvePref(p)}`
}

function writePref(p: ThemePref) {
  try { localStorage.setItem(STORAGE_KEY, p) } catch {}
  document.cookie = `${THEME_COOKIE}=${p}; path=/; max-age=31536000; SameSite=Lax`
  listeners.forEach(l => l())
}

// ── contexto ───────────────────────────────────────────────────────────────
type Ctx = { pref: ThemePref; resolved: ResolvedTheme; setPref: (p: ThemePref) => void }
const ThemeContext = createContext<Ctx>({ pref: 'system', resolved: 'light', setPref: () => {} })

export function ThemeProvider({ initial, children }: { initial: ThemePref; children: React.ReactNode }) {
  // No servidor (e no primeiro render do cliente) só sabemos o cookie.
  const getServerSnapshot = useCallback(
    () => `${initial}|${initial === 'dark' ? 'dark' : 'light'}`,
    [initial],
  )
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [pref, resolved] = snap.split('|') as [ThemePref, ResolvedTheme]

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolved === 'dark')
    root.style.colorScheme = resolved
  }, [resolved])

  const value = useMemo<Ctx>(() => ({ pref, resolved, setPref: writePref }), [pref, resolved])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}

// ── seletor (claro / escuro / automático) ──────────────────────────────────
const OPCOES: { id: ThemePref; icon: React.ElementType; label: string }[] = [
  { id: 'light', icon: Sun, label: 'Tema claro' },
  { id: 'dark', icon: Moon, label: 'Tema escuro' },
  { id: 'system', icon: Monitor, label: 'Seguir o sistema' },
]

export function ThemeToggle({ className }: { className?: string }) {
  const { pref, setPref } = useTheme()
  return (
    <div className={cn('seg', className)} role="radiogroup" aria-label="Tema">
      {OPCOES.map(o => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={pref === o.id}
          data-active={pref === o.id}
          title={o.label}
          onClick={() => setPref(o.id)}
          className="px-2"
        >
          <o.icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  )
}

// ── cores dos gráficos ─────────────────────────────────────────────────────
// Recharts pinta SVG com strings de cor, então cada tema tem a sua paleta.
export type ChartColors = {
  grid: string
  axis: string
  text: string
  tooltipBg: string
  tooltipBorder: string
  operados: string
  zerados: string
  clientes: string
  receita: string
  acumulado: string
  incentivo: string
  produto: Record<string, string>
  corretora: Record<'GENIAL' | 'XP' | 'BTG', string>
  palette: string[]
}

export const CHART_COLORS: Record<ResolvedTheme, ChartColors> = {
  light: {
    grid: 'rgba(16,24,40,0.08)',
    axis: '#8b95a7',
    text: '#475467',
    tooltipBg: '#ffffff',
    tooltipBorder: '#e2e7ef',
    operados: '#1f4fd1',
    zerados: '#d92d20',
    clientes: '#7a5af8',
    receita: '#1f4fd1',
    acumulado: '#d92d20',
    incentivo: '#157f3d',
    produto: {
      WIN: '#1f4fd1', WDO: '#157f3d', BIT: '#d97706', IND: '#7a5af8', DOL: '#d92d20',
      WSP: '#0e7490', CCM: '#65a30d', SOL: '#db2777', OUTRO: '#64748b',
    },
    corretora: { GENIAL: '#2563eb', XP: '#d97706', BTG: '#059669' },
    palette: ['#1f4fd1', '#157f3d', '#d97706', '#7a5af8', '#d92d20', '#0e7490', '#64748b', '#db2777'],
  },
  dark: {
    grid: 'rgba(255,255,255,0.07)',
    axis: '#6c788d',
    text: '#a3aec2',
    tooltipBg: '#161d2b',
    tooltipBorder: '#334159',
    operados: '#6d9bf5',
    zerados: '#f4706b',
    clientes: '#b197fc',
    receita: '#6d9bf5',
    acumulado: '#f4706b',
    incentivo: '#3dd68c',
    produto: {
      WIN: '#6d9bf5', WDO: '#3dd68c', BIT: '#f5b942', IND: '#b197fc', DOL: '#f4706b',
      WSP: '#38c4e0', CCM: '#a3e635', SOL: '#f472b6', OUTRO: '#94a3b8',
    },
    corretora: { GENIAL: '#60a5fa', XP: '#fbbf24', BTG: '#34d399' },
    palette: ['#6d9bf5', '#3dd68c', '#f5b942', '#b197fc', '#f4706b', '#38c4e0', '#94a3b8', '#f472b6'],
  },
}

export function useChartColors(): ChartColors {
  const { resolved } = useTheme()
  return CHART_COLORS[resolved]
}
