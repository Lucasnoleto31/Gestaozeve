import { cn } from '@/lib/utils'

// Classes dos botões, separadas do componente pra servirem também em <Link>
// dentro de Server Components (Button.tsx é 'use client').
// DESIGN.md §3: primário (tinta), secundário (só o fio), ghost, destrutivo (fio e texto em loss).
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'xs' | 'sm' | 'md'

export const BUTTON_BASE =
  'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border font-medium ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'border-accent bg-accent text-accent-fg hover:bg-accent-hover hover:border-accent-hover',
  secondary: 'border-line-strong bg-transparent text-fg hover:bg-surface',
  ghost: 'border-transparent text-fg-muted hover:bg-surface-3 hover:text-fg',
  danger: 'border-loss bg-transparent text-loss hover:bg-loss-soft',
  // "success" é só alias do primário: cor de ação é uma só (DESIGN.md §1)
  success: 'border-accent bg-accent text-accent-fg hover:bg-accent-hover hover:border-accent-hover',
}

export const BUTTON_SIZE: Record<ButtonSize, string> = {
  xs: 'h-8 gap-1 px-2.5 text-label',
  sm: 'h-9 gap-1.5 px-3 text-dense',
  md: 'h-10 gap-2 px-4 text-body',
}

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)
}
