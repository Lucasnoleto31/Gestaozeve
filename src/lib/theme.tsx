'use client'

// Tema claro/escuro.
// - Preferência salva em localStorage + cookie (o cookie deixa o servidor
//   renderizar o <html class="dark"> certo; o localStorage manda no cliente).
// - THEME_INIT_SCRIPT roda inline no <head> antes da hidratação, então a
//   página já nasce no tema certo (sem piscar). Sem preferência, é escuro.
// - O estado vive fora do React (useSyncExternalStore): sem setState em
//   effect e sem divergência entre servidor e cliente.

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { THEME_COOKIE, THEME_PADRAO, THEME_STORAGE_KEY, isThemePref, type ResolvedTheme, type ThemePref } from './theme-shared'
import { comAlpha, useTokens } from './tokens'

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
  return m && isThemePref(m[1]) ? m[1] : THEME_PADRAO
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
const ThemeContext = createContext<Ctx>({ pref: THEME_PADRAO, resolved: 'dark', setPref: () => {} })

export function ThemeProvider({ initial, children }: { initial: ThemePref; children: React.ReactNode }) {
  // No servidor (e no primeiro render do cliente) só sabemos o cookie; "system" assume escuro.
  const getServerSnapshot = useCallback(
    () => `${initial}|${initial === 'light' ? 'light' : 'dark'}`,
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

// ── seletor (escuro / claro / automático) ──────────────────────────────────
const OPCOES: { id: ThemePref; icon: React.ElementType; label: string }[] = [
  { id: 'dark', icon: Moon, label: 'Tema escuro' },
  { id: 'light', icon: Sun, label: 'Tema claro' },
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
          aria-label={o.label}
          onClick={() => setPref(o.id)}
          className="px-2"
        >
          <o.icon className="h-3.5 w-3.5" aria-hidden />
        </button>
      ))}
    </div>
  )
}

// ── cores dos gráficos ─────────────────────────────────────────────────────
// Recharts pinta SVG com strings de cor; os valores vêm dos tokens do CSS
// (src/lib/tokens.ts), então acompanham o tema sem paleta própria aqui.
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
  corretora: Record<'GENIAL' | 'XP' | 'BTG', string>
  // 1ª accent, 2ª âmbar, 3ª neutro; depois versões atenuadas (séries empilhadas). Verde/vermelho só em ganho/perda.
  palette: string[]
}

export function useChartColors(): ChartColors {
  const t = useTokens()
  return useMemo(() => ({
    grid: comAlpha(t.fg, 0.08),
    axis: t.fgSubtle,
    text: t.fgMuted,
    tooltipBg: t.surface2,
    tooltipBorder: t.lineStrong,
    operados: t.accent,
    zerados: t.loss,
    clientes: t.warn,
    receita: t.accent,
    acumulado: t.warn,
    incentivo: t.gain,
    corretora: t.corretora,
    palette: [
      t.accent, t.warn, t.fgMuted,
      comAlpha(t.accent, 0.6), comAlpha(t.warn, 0.6), comAlpha(t.fgMuted, 0.6),
      comAlpha(t.accent, 0.35), comAlpha(t.warn, 0.35), t.fgSubtle,
    ],
  }), [t])
}
