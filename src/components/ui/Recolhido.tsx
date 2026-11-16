import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Seção recolhida: o que saiu da visão principal de uma tela e continua acessível (análises, números
// mês a mês, regras, histórico). É o <details> nativo: abre e fecha sem JavaScript e sem recarregar.
// tamanho 'secao' = título de seção (Análises, Regras); 'linha' = link discreto ("ver números").
export function Recolhido({ titulo, resumo, tamanho = 'secao', aberto = false, className, children }: {
  titulo: ReactNode
  resumo?: ReactNode          // uma linha ao lado do título dizendo o que tem dentro
  tamanho?: 'secao' | 'linha'
  aberto?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <details className={cn('group/rec min-w-0', className)} open={aberto}>
      <summary className={cn('flex min-h-[44px] cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 [&::-webkit-details-marker]:hidden',
        tamanho === 'secao' ? 'border-t border-line pt-3 text-section font-semibold text-fg' : 'text-dense font-medium text-fg-muted hover:text-fg')}>
        <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted transition-transform group-open/rec:rotate-90" aria-hidden />
        <span>{titulo}</span>
        {resumo && <span className="text-dense font-normal text-fg-muted">{resumo}</span>}
      </summary>
      <div className={cn('min-w-0', tamanho === 'secao' ? 'mt-4 space-y-8' : 'mt-2')}>{children}</div>
    </details>
  )
}
