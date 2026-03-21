'use client'

import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150',
          {
            'text-white shadow-sm shadow-blue-900/40 hover:shadow-blue-900/60 hover:brightness-110 active:scale-[0.98]':
              variant === 'primary',
            'text-gray-900 border hover:brightness-110 active:scale-[0.98]':
              variant === 'secondary',
            'text-gray-500 hover:text-gray-900 hover:bg-gray-100':
              variant === 'ghost',
            'text-white shadow-sm shadow-red-900/40 hover:brightness-110 active:scale-[0.98]':
              variant === 'danger',
          },
          {
            'text-xs px-3 py-1.5': size === 'sm',
            'text-sm px-4 py-2': size === 'md',
            'text-base px-6 py-3': size === 'lg',
          },
          className
        )}
        style={{
          ...(variant === 'primary'
            ? { background: 'linear-gradient(135deg, var(--blue) 0%, var(--blue-dark) 100%)' }
            : variant === 'secondary'
            ? { background: 'var(--surface-3)', borderColor: 'var(--border)' }
            : variant === 'danger'
            ? { background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' }
            : {}),
        }}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export { Button }
