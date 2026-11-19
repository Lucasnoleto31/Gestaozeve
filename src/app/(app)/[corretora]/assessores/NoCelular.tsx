'use client'

import { useEffect, useRef } from 'react'
import { useLinkStatus } from 'next/link'
import { ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Peças da tela Responsáveis que só existem no celular (DESIGN.md §8). No computador nenhuma delas
// aparece nem age: a seta é md:hidden e a rolagem confere a largura da janela. Recolher e "ver os
// outros" usam as peças da base (RecolheNoCelular e MostrarMais, em components/ui).

// A seta da linha que abre no lugar: para baixo, vira ao abrir. Fica dentro do link da pessoa: abrir é uma
// navegação que refaz a tela no servidor, e enquanto a resposta não chega a seta vira um giro, para o toque
// não parecer perdido.
export function SetaDaLinha({ aberta }: { aberta: boolean }) {
  const { pending } = useLinkStatus()
  return (
    <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-fg-subtle md:hidden" aria-hidden>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className={cn('h-4 w-4 transition-transform', aberta && 'rotate-180')} />}
    </span>
  )
}

// Leva a tela até a pessoa aberta quando ela não está à vista: na chegada por um link de outra tela
// (o Painel aponta para cá com ?assessor=) e quando o detalhe de cima se fecha e empurra a lista. Com a
// linha à vista não mexe em nada, senão a lista pularia a cada toque. Fica dentro do detalhe, que nasce de
// novo a cada pessoa aberta. No computador sai na primeira linha.
const BARRA_DE_CIMA = 60, BARRA_DE_BAIXO = 110, MINIMO_DO_DETALHE = 140
export function RolarAteAberta() {
  const marca = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!window.matchMedia('(max-width: 767.98px)').matches) return
    // a linha da pessoa: a de cima, quando o detalhe é uma linha da tabela (Genial); a última da tabela de
    // cima, quando o detalhe fica entre as duas partes da lista (BTG, ver page.tsx)
    const tr = marca.current?.closest('tr')
    const linha = tr ? tr.previousElementSibling : marca.current?.closest('section')?.parentElement?.previousElementSibling?.querySelector('tbody > tr:last-child')
    if (!(linha instanceof HTMLElement) || linha.offsetParent === null) return
    const r = linha.getBoundingClientRect()
    // à vista = a linha abaixo da barra de cima e com espaço para o começo do detalhe antes da barra de baixo
    if (r.top >= BARRA_DE_CIMA && r.bottom <= window.innerHeight - BARRA_DE_BAIXO - MINIMO_DO_DETALHE) return
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: window.scrollY + r.top - BARRA_DE_CIMA - 8, behavior: suave ? 'smooth' : 'auto' })
  }, [])
  return <span ref={marca} hidden />
}
