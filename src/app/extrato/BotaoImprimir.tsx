'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'

// Abre a caixa de impressão do navegador (de lá dá para salvar em PDF); some no papel
export function BotaoImprimir() {
  return <Button onClick={() => window.print()} className="print:hidden"><Printer className="h-4 w-4" aria-hidden />Imprimir ou salvar em PDF</Button>
}
