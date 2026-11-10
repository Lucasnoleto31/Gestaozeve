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
  return (
    <button type="button" onClick={copiar} title={feito ? 'Copiado' : `Copiar ${rotulo}`} aria-label={`Copiar ${rotulo}`}
      className={cn('group inline-flex max-w-full items-center gap-1.5 text-left tabular-nums hover:text-accent', className)}>
      <span className="truncate">{children}</span>
      {feito
        ? <Check className="h-3.5 w-3.5 shrink-0 text-gain" aria-hidden />
        : <Copy className="h-3.5 w-3.5 shrink-0 text-fg-subtle group-hover:text-fg" aria-hidden />}
    </button>
  )
}
