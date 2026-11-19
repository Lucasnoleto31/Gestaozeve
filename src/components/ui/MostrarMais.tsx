'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// "Mostrar mais" só do celular (DESIGN.md §8.7). Sem a caixa com rolagem própria, uma lista longa que não
// é o último bloco da tela empurraria o resto várias telas para baixo. A lista é a mesma do computador
// (vem pronta, em children): as linhas além do essencial levam a classe ALEM_NO_CELULAR, que as esconde
// no celular enquanto este bloco está fechado. No computador nada muda: o botão não existe e as linhas
// aparecem todas. Um dentro do outro funciona: a linha só aparece quando todos os que a envolvem foram abertos.
// As classes (ALEM_NO_CELULAR, alemDe) ficam em mostrarMaisClasses.ts, sem 'use client': componente de
// servidor importa de lá.
export { ALEM_NO_CELULAR, alemDe } from './mostrarMaisClasses'

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
