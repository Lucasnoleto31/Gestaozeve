import { cn } from '@/lib/utils'

// Classes dos botões, separadas do componente pra servirem também em <Link>
// dentro de Server Components (Button.tsx é 'use client').
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'xs' | 'sm' | 'md'

export const BUTTON_BASE =
  'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg border font-medium ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'border-accent bg-accent text-accent-fg hover:bg-accent-hover hover:border-accent-hover',
  secondary: 'border-line-strong bg-surface text-fg hover:bg-surface-2',
  ghost: 'border-transparent text-fg-muted hover:bg-surface-3 hover:text-fg',
  danger: 'border-danger bg-danger text-white hover:opacity-90',
  success: 'border-success bg-success text-white hover:opacity-90',
}

export const BUTTON_SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 gap-1 px-2.5 text-xs',
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-9 gap-2 px-4 text-sm',
}

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)
}
