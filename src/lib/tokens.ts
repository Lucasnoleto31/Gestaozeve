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

// Cor com transparência: aceita '#rgb', '#rrggbb' (o Tailwind compila #111111 como #111),
// 'rgb(r, g, b)' e 'rgba(r, g, b, a)'. Outros formatos voltam como vieram.
export function comAlpha(cor: string, alpha: number): string {
  const rgb = rgbDe(cor)
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})` : cor
}

// [r, g, b] de uma cor em hex ou rgb(); null para o que não entende
export function rgbDe(cor: string): [number, number, number] | null {
  const s = cor.trim()
  const h3 = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i)
  if (h3) return [parseInt(h3[1] + h3[1], 16), parseInt(h3[2] + h3[2], 16), parseInt(h3[3] + h3[3], 16)]
  const h6 = s.match(/^#([0-9a-f]{6})$/i)
  if (h6) { const n = parseInt(h6[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
  const r = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (r) return [Number(r[1]), Number(r[2]), Number(r[3])]
  return null
}

// Fundo escuro? (luminância abaixo da metade)
export function ehEscuro(cor: string): boolean {
  const rgb = rgbDe(cor)
  if (!rgb) return true
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 < 0.5
}
