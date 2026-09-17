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
      className={buttonClasses(variant, size, className)}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

// Botão só com ícone (ações de linha: editar, excluir…)
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'default' | 'accent' | 'danger' | 'success'
}

const ICON_TONE: Record<NonNullable<IconButtonProps['tone']>, string> = {
  default: 'text-fg-subtle hover:bg-surface-3 hover:text-fg',
  accent: 'text-fg-subtle hover:bg-accent-soft hover:text-accent',
  danger: 'text-fg-subtle hover:bg-danger-soft hover:text-danger',
  success: 'text-fg-subtle hover:bg-success-soft hover:text-success',
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, tone = 'default', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        'disabled:cursor-not-allowed disabled:opacity-40',
        ICON_TONE[tone], className,
      )}
      {...props}
    />
  ),
)
IconButton.displayName = 'IconButton'

export { Button, IconButton }
