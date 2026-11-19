'use client'

// Um valor que se copia com um clique (CPF, conta, telefone), para colar no sistema da corretora
import { useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Copiar({ valor, rotulo, children, className }: { valor: string; rotulo: string; children: ReactNode; className?: string }) {
  const [feito, setFeito] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor)
      setFeito(true)
      setTimeout(() => setFeito(false), 1500)
    } catch { /* navegador sem permissão de área de transferência: o valor continua na tela */ }
  }
  // Celular: o botão fica da altura do texto (a regra de toque o esticaria para 44 px e a linha dele
  // ficaria mais alta que as vizinhas) e a área de toque cresce para cima e para baixo; depois do toque
  // aparece a palavra "copiado" (lá não existe o aviso de passar o mouse).
  return (
    <button type="button" onClick={copiar} title={feito ? 'Copiado' : `Copiar ${rotulo}`} aria-label={`Copiar ${rotulo}`}
      className={cn('group inline-flex max-w-full items-center gap-1.5 text-left tabular-nums hover:text-accent max-md:relative max-md:min-h-0! max-md:after:absolute max-md:after:-inset-x-1 max-md:after:-inset-y-2.5', className)}>
      <span className="truncate">{children}</span>
      {feito
        ? <Check className="h-3.5 w-3.5 shrink-0 text-gain" aria-hidden />
        : <Copy className="h-3.5 w-3.5 shrink-0 text-fg-subtle group-hover:text-fg" aria-hidden />}
      {feito && <span className="text-label font-medium text-gain md:hidden" role="status">copiado</span>}
    </button>
  )
}
