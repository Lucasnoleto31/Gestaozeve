'use client'

import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton } from './Button'

const SIZE = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
} as const

export function Modal({ open, onClose, title, subtitle, actions, size = 'md', footer, children, className }: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode      // botões ao lado do fechar (ex.: exportar)
  size?: keyof typeof SIZE
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="modal-backdrop absolute inset-0" onClick={onClose} />
      <div className={cn('panel modal-panel relative flex max-h-[92vh] w-full flex-col', SIZE[size], className)}>
        {(title || subtitle) && (
          <header className="flex items-start justify-between gap-3 border-b border-line px-6 pb-4 pt-5">
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold text-fg">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {actions}
              <IconButton onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></IconButton>
            </div>
          </header>
        )}
        <div className="min-h-0 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</footer>}
      </div>
    </div>
  )
}
