'use client'

import { useRef, useState, type CSSProperties } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

// Explicação de como um número é calculado, atrás de um "i": aparece ao passar o mouse, ao focar pelo
// teclado ou ao tocar (celular). Substitui o subtítulo com fórmula, que enchia a tela de texto.
// O balão é posicionado na janela (position: fixed), então não é cortado pela moldura do cartão nem
// pela tabela que rola, e nunca passa da borda da tela.
// No toque quem manda é o clique: o dedo dispara "entrar" e "focar" antes do clique, e o balão abria e
// fechava no mesmo toque. Ali ele abre no toque e fecha no toque seguinte, no "i" ou fora dele.
const LARGURA = 256, MARGEM = 8

export function Dica({ texto, destaque, className }: { texto: string; destaque?: boolean; className?: string }) {
  const [pos, setPos] = useState<CSSProperties | null>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const dedo = useRef(false)
  const fechar = () => setPos(null)
  const abrir = () => {
    const r = botao.current?.getBoundingClientRect()
    if (!r) return
    const largura = Math.min(LARGURA, window.innerWidth - 2 * MARGEM)
    const left = Math.max(MARGEM, Math.min(r.left, window.innerWidth - largura - MARGEM))
    // abre para baixo; perto do fim da janela, para cima
    setPos(window.innerHeight - r.bottom > 160 ? { left, top: r.bottom + 6, width: largura } : { left, bottom: window.innerHeight - r.top + 6, width: largura })
    window.addEventListener('scroll', fechar, { capture: true, once: true })
  }
  const abrirNoToque = () => {
    abrir()
    const fora = (e: PointerEvent) => {
      if (botao.current?.contains(e.target as Node)) return
      fechar()
      window.removeEventListener('pointerdown', fora, true)
    }
    window.addEventListener('pointerdown', fora, true)
  }
  return (
    <span className={cn('inline-flex align-middle', className)}>
      <button ref={botao} type="button" aria-label={texto} aria-expanded={pos != null}
        className={cn('dica-btn inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2', destaque ? 'text-bg/60 hover:text-bg' : 'text-fg-subtle hover:text-fg')}
        onPointerDown={e => { dedo.current = e.pointerType !== 'mouse' }}
        onMouseEnter={() => { if (!dedo.current) abrir() }} onMouseLeave={() => { if (!dedo.current) fechar() }}
        onFocus={() => { if (!dedo.current) abrir() }} onBlur={() => { if (!dedo.current) fechar() }}
        onClick={e => { e.stopPropagation(); if (pos) fechar(); else if (dedo.current) abrirNoToque(); else abrir() }}>
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {pos && (
        <span role="tooltip" style={pos}
          className="pointer-events-none fixed z-50 whitespace-normal rounded-md border border-line bg-surface-2 px-2.5 py-2 text-left text-micro font-normal normal-case leading-snug tracking-normal text-fg shadow-float max-md:px-3 max-md:py-2.5">
          {texto}
        </span>
      )}
    </span>
  )
}
