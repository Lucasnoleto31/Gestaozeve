'use client'

import { AlertCircle, RotateCcw } from 'lucide-react'
import { Button } from './Button'

// Erro de página (error.tsx) ou de bloco: o que houve e um jeito de tentar de novo
export function ErrorState({ titulo = 'Não consegui carregar esta tela', detalhe, onRetry }: {
  titulo?: string
  detalhe?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center" role="alert">
      <AlertCircle className="h-6 w-6 text-loss" aria-hidden />
      <p className="text-section font-semibold text-fg">{titulo}</p>
      {detalhe && <p className="max-w-md text-dense text-fg-muted">{detalhe}</p>}
      {onRetry && <Button variant="secondary" onClick={onRetry}><RotateCcw className="h-4 w-4" aria-hidden />Tentar de novo</Button>}
    </div>
  )
}
