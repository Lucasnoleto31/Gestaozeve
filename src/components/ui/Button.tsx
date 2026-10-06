'use client'

import { ButtonHTMLAttributes, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonClasses, type ButtonSize, type ButtonVariant } from './buttonStyles'

export type { ButtonSize, ButtonVariant }

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

// Botão só com ícone (ações de linha: editar, excluir…). 36 px; 44 no toque (globals.css).
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'default' | 'accent' | 'danger' | 'success'
}

const ICON_TONE: Record<NonNullable<IconButtonProps['tone']>, string> = {
  default: 'text-fg-subtle hover:bg-surface-3 hover:text-fg',
  accent: 'text-fg-subtle hover:bg-accent-soft hover:text-accent',
  danger: 'text-fg-subtle hover:bg-loss-soft hover:text-loss',
  success: 'text-fg-subtle hover:bg-gain-soft hover:text-gain',
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, tone = 'default', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'icon-btn inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50',
        'disabled:cursor-not-allowed disabled:opacity-40',
        ICON_TONE[tone], className,
      )}
      {...props}
    />
  ),
)
IconButton.displayName = 'IconButton'

export { Button, IconButton }
