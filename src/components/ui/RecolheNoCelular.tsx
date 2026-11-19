'use client'

import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dica } from './Dica'

// Bloco que no celular fica recolhido atrás do próprio título (um toque abre) e no computador aparece
// sempre, como antes (DESIGN.md §8.2): o que não responde à pergunta da tela (gráfico secundário, números
// de apoio, regras) sai da primeira leitura sem sumir. O conteúdo é montado uma vez só e é o mesmo nas
// duas larguras: nada de cópia para o celular. O Recolhido (o <details> nativo) fecha nas duas larguras;
// este só fecha no celular.
//  - `tamanho="titulo"` (padrão): a linha de toque tem cara de título de bloco; quem chama esconde no
//    celular o título do próprio bloco (a linha já diz o nome).
//  - `tamanho="linha"`: linha discreta, para "Mais números" e apoios.
// Fechado, o conteúdo fica com altura zero em vez de sair da tela: um gráfico lá dentro continua medindo
// a largura e abre desenhado.
export function RecolheNoCelular({ titulo, resumo, dica, tamanho = 'titulo', className, children }: {
  titulo: ReactNode
  resumo?: ReactNode     // uma linha embaixo do título dizendo o que tem dentro
  dica?: string          // a explicação do bloco, atrás do "i" ao lado do título
  tamanho?: 'titulo' | 'linha'
  className?: string
  children: ReactNode
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <div className={cn('min-w-0', className)}>
      <div className={cn('flex items-center gap-2 md:hidden', tamanho === 'titulo' && 'border-t border-line pt-3')}>
        <button type="button" aria-expanded={aberto} onClick={() => setAberto(a => !a)}
          className={cn('flex min-h-[44px] min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-left',
            tamanho === 'titulo' ? 'text-section font-semibold text-fg' : 'text-dense font-medium text-fg-muted')}>
          <ChevronRight className={cn('h-4 w-4 shrink-0 text-fg-muted transition-transform', aberto && 'rotate-90')} aria-hidden />
          <span className="min-w-0 flex-1">{titulo}</span>
          {resumo && <span className="basis-full pl-6 text-dense font-normal text-fg-muted">{resumo}</span>}
        </button>
        {dica && <Dica texto={dica} />}
      </div>
      <div className={cn('min-w-0', aberto ? 'max-md:mt-3' : 'max-md:invisible max-md:h-0 max-md:overflow-hidden')}>{children}</div>
    </div>
  )
}
