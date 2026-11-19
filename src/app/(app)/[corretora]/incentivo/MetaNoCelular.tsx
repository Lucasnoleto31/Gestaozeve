'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Uma meta do ATP na trilha "As metas, em ordem". No computador é o cartão de sempre, tudo à vista. No
// celular (DESIGN.md §8) as cinco metas empilhadas ocupavam quase duas telas: cada meta vira uma linha com o
// valor, o prêmio, a situação e quando bate, e o toque em qualquer ponto dela abre o resto (prazo, quanto
// falta, quanto precisa por mês e a observação). A próxima meta já vem aberta. O que só aparece aberto leva
// a classe FECHADA_NO_CELULAR (em IncentivoAtp: constante exportada de um arquivo 'use client' chega ao
// componente do servidor como referência, não como texto); o botão que cobre a linha existe só no celular.

export function MetaNoCelular({ indice, inicial, className, children }: {
  indice: number
  inicial: boolean      // a próxima meta vem aberta
  className?: string
  children: ReactNode
}) {
  const [aberta, setAberta] = useState(inicial)
  return (
    // relative só no celular: é lá que o botão que cobre a linha existe (no computador o cartão fica como era)
    <li className={cn('group/meta max-md:relative', className)} data-aberta={aberta}>
      <button type="button" className="absolute inset-0 z-[1] rounded-none md:hidden" aria-expanded={aberta}
        aria-label={`${aberta ? 'Fechar' : 'Ver'} o detalhe da Meta ${indice}`} onClick={() => setAberta(a => !a)} />
      {children}
    </li>
  )
}
