import type { ReactNode } from 'react'
import { MostrarMais as MostrarMaisBase } from '@/components/ui/MostrarMais'
import { fmtNum } from '@/lib/format'
import { LIMITE_CELULAR } from './comum'

// Lista longa no celular (DESIGN.md §8.7): as primeiras linhas e o resto atrás do "mostrar mais" da base, o
// mesmo botão das outras telas. Aqui só se decide quando ele entra (a lista passa do limite) e o rótulo,
// iguais em todas as listas de Comissões. As linhas além do limite levam `alemDoLimite` (comum.ts). No
// computador e no papel nada muda: o botão é só do celular e a classe não age lá.
export function MostrarMais({ total, children }: { total: number; children: ReactNode }) {
  const restantes = total - LIMITE_CELULAR
  if (restantes <= 0) return <>{children}</>
  return <MostrarMaisBase rotulo={`mostrar mais (${fmtNum(restantes)} restantes)`}>{children}</MostrarMaisBase>
}
