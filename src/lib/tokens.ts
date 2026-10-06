'use client'

// Tokens de cor lidos do CSS em runtime (gráficos e SVGs precisam de cor em
// string). Única fonte: src/app/globals.css. Quando o tema troca, a classe do
// <html> muda e o MutationObserver avisa, então os valores são relidos.
import { useMemo, useSyncExternalStore } from 'react'

export type Tokens = {
  bg: string
  surface: string
  surface2: string
  surface3: string
  line: string
  lineStrong: string
  fg: string
  fgMuted: string
  fgSubtle: string
  accent: string
  gain: string
  loss: string
  warn: string
  corretora: { GENIAL: string; XP: string; BTG: string }
}

const NOMES: Record<Exclude<keyof Tokens, 'corretora'>, string> = {
  bg: '--bg', surface: '--surface', surface2: '--surface-2', surface3: '--surface-3', line: '--line', lineStrong: '--line-strong',
  fg: '--fg', fgMuted: '--fg-muted', fgSubtle: '--fg-subtle', accent: '--accent', gain: '--gain', loss: '--loss', warn: '--warn',
}

// Só para o render no servidor (nenhum gráfico desenha lá): cinza neutro.
const NEUTRO = '#808080'
const FALLBACK: Tokens = {
  bg: NEUTRO, surface: NEUTRO, surface2: NEUTRO, surface3: NEUTRO, line: NEUTRO, lineStrong: NEUTRO, fg: NEUTRO, fgMuted: NEUTRO,
  fgSubtle: NEUTRO, accent: NEUTRO, gain: NEUTRO, loss: NEUTRO, warn: NEUTRO, corretora: { GENIAL: NEUTRO, XP: NEUTRO, BTG: NEUTRO },
}

function lerTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement)
  const v = (nome: string) => cs.getPropertyValue(nome).trim() || NEUTRO
  const t = {} as Tokens
  for (const [chave, nome] of Object.entries(NOMES) as [Exclude<keyof Tokens, 'corretora'>, string][]) t[chave] = v(nome)
  t.corretora = { GENIAL: v('--c-genial'), XP: v('--c-xp'), BTG: v('--c-btg') }
  return t
}

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => mo.disconnect()
}

const snapshotCliente = () => document.documentElement.className
const snapshotServidor = () => '\0ssr'

export function useTokens(): Tokens {
  const classe = useSyncExternalStore(subscribe, snapshotCliente, snapshotServidor)
  return useMemo(() => (classe === '\0ssr' ? FALLBACK : lerTokens()), [classe])
}

// '#rrggbb' → 'rgba(r, g, b, a)'. Outros formatos voltam como vieram.
export function comAlpha(cor: string, alpha: number): string {
  const m = cor.match(/^#([0-9a-f]{6})$/i)
  if (!m) return cor
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
