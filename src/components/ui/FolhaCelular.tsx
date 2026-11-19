'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonClasses } from './buttonStyles'

// Os filtros de uma tela. No computador os campos aparecem no lugar, como sempre (className é o da barra
// de filtros). No celular (DESIGN.md §8) ficam atrás do botão "Filtros", com a contagem dos ligados, e
// sobem numa folha, um por linha. São os mesmos campos nos dois casos: nada é montado duas vezes, então
// o estado e o endereço continuam sendo um só.
export function FolhaCelular({ rotulo = 'Filtros', ativos = 0, concluir = 'Ver resultado', children, className, botaoClassName }: {
  rotulo?: string
  ativos?: number          // quantos filtros estão ligados (aparece no botão)
  concluir?: string        // texto do botão que fecha a folha
  children: ReactNode
  className?: string
  botaoClassName?: string
}) {
  const [aberta, setAberta] = useState(false)
  useEffect(() => {
    if (!aberta) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberta(false) }
    window.addEventListener('keydown', tecla)
    // a página de trás não rola enquanto a folha está aberta
    const raiz = document.documentElement
    const antes = raiz.style.overflow
    raiz.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', tecla); raiz.style.overflow = antes }
  }, [aberta])

  return (
    <>
      <button type="button" className={cn('chip md:hidden', botaoClassName)} data-active={ativos > 0} aria-expanded={aberta} onClick={() => setAberta(true)}>
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        {rotulo}
        {ativos > 0 && <span className="tabular-nums">· {ativos}</span>}
      </button>
      {aberta && <div className="folha-fundo md:hidden" onClick={() => setAberta(false)} aria-hidden />}
      <div className={cn('folha-celular', className)} data-aberta={aberta} role={aberta ? 'dialog' : undefined} aria-label={aberta ? rotulo : undefined}>
        <div className="flex items-center justify-between md:hidden">
          <p className="text-section font-semibold text-fg">{rotulo}</p>
          <button type="button" className="icon-btn inline-flex h-10 w-10 items-center justify-center rounded-md text-fg-muted" aria-label="Fechar" onClick={() => setAberta(false)}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {children}
        {/* preso ao pé: com muitos filtros a folha rola e o botão continua à vista */}
        <div className="folha-pe md:hidden">
          <button type="button" className={cn(buttonClasses('primary', 'md'), 'w-full')} onClick={() => setAberta(false)}>{concluir}</button>
        </div>
      </div>
    </>
  )
}
