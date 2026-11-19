'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// "Mostrar mais" só do celular (DESIGN.md §8.7). Sem a caixa com rolagem própria, uma lista longa que não
// é o último bloco da tela empurraria o resto várias telas para baixo. A lista é a mesma do computador
// (vem pronta, em children): as linhas além do essencial levam a classe ALEM_NO_CELULAR, que as esconde
// no celular enquanto este bloco está fechado. No computador nada muda: o botão não existe e as linhas
// aparecem todas. Um dentro do outro não funciona com o mesmo nome de grupo: use um por lista.
export const ALEM_NO_CELULAR = 'max-md:group-data-[tudo=false]/mais:hidden!'
// para a i-ésima linha de uma lista que mostra `limite` linhas no celular
export const alemDe = (limite: number) => (i: number) => (i >= limite ? ALEM_NO_CELULAR : undefined)

export function MostrarMais({ rotulo, children, className }: {
  rotulo: ReactNode      // "mostrar os 40 dias anteriores", "mostrar mais (12 restantes)"
  children: ReactNode
  className?: string
}) {
  const [tudo, setTudo] = useState(false)
  return (
    <div className={cn('group/mais min-w-0', className)} data-tudo={tudo}>
      {children}
      {!tudo && (
        <button type="button" onClick={() => setTudo(true)}
          className="mt-1 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md bg-surface text-dense font-medium text-fg md:hidden">
          <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
          <span>{rotulo}</span>
        </button>
      )}
    </div>
  )
}
