import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Dica } from '@/components/ui/Dica'

// Um número em linha: nome e apoio à esquerda, valor à direita. É o desenho que os cartões ganham no
// celular do terceiro em diante (DESIGN.md §8.5); serve aos números que no celular saem da faixa de
// cartões e ficam dentro de um Recolhido ("Mais números do mês", "Mais números do período").
export function LinhaNumero({ rotulo, valor, apoio, dica, className }: {
  rotulo: string
  valor: ReactNode
  apoio?: ReactNode
  dica?: string          // como o número é calculado: atrás do "i"
  className?: string     // cor do valor (text-gain, text-loss)
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-dense text-fg">{rotulo}{dica && <Dica texto={dica} />}</p>
        {apoio && <p className="mt-0.5 text-micro text-fg-muted">{apoio}</p>}
      </div>
      <p className={cn('shrink-0 text-right text-section font-bold tabular-nums text-fg', className)}>{valor}</p>
    </div>
  )
}
