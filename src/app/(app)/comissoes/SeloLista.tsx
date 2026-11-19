import type { ReactNode } from 'react'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

const COR: Partial<Record<BadgeVariant, string>> = { gain: 'text-gain', warn: 'text-warn', loss: 'text-loss', accent: 'text-fg' }

// Selo de estado dentro de uma tabela que no celular vira lista. No computador é o selo de sempre. No celular,
// na linha de apoio, vira a palavra na cor do estado: a base já faz isso com os selos de fio, mas o selo na
// tinta ("Abertura", "Aberto, no prazo") continuava uma pílula cheia em toda linha.
export function SeloLista({ variante, children }: { variante: BadgeVariant; children: ReactNode }) {
  return (
    <>
      {/* com "!": a regra da base para o selo na linha de apoio define o display e venceria */}
      <Badge variant={variante} className="max-md:hidden!">{children}</Badge>
      <span className={cn('md:hidden', COR[variante])}>{children}</span>
    </>
  )
}
