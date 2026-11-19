'use client'

import { useState, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

// No celular a lista mostra, em cada linha, o nome, o que aconteceu em palavras e um número (DESIGN.md §8.6).
// As outras colunas do computador não somem: ficam atrás deste botão, que as acrescenta à linha de apoio de
// todas as linhas da lista de uma vez. A tabela é a mesma do computador (em children): as células extras
// levam a classe de `celMais` (comum.ts). No computador o botão não existe e a tabela fica como sempre.
export function MaisNumeros({ className, children }: { className?: string; children: ReactNode }) {
  const [ligado, setLigado] = useState(false)
  const Icone = ligado ? Minus : Plus
  return (
    <div className={cn('group/numeros min-w-0', className)} data-numeros={ligado}>
      {/* 44 px no dedo: o chip da base para em 38 px no celular, e só o "!" vence a regra dela (§8.10) */}
      <button type="button" className="chip mb-1 max-md:min-h-11! md:hidden" data-active={ligado} aria-pressed={ligado} onClick={() => setLigado(v => !v)}>
        <Icone className="h-3.5 w-3.5" aria-hidden />{ligado ? 'Menos números' : 'Mais números'}
      </button>
      {children}
    </div>
  )
}
