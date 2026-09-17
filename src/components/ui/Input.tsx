import { InputHTMLAttributes, SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

// Rótulo + campo + dica/erro. Os campos em si são estilizados globalmente
// (globals.css), então aqui só cuidamos de layout e mensagens.
export function Field({ label, hint, error, htmlFor, className, children }: {
  label?: string
  hint?: string
  error?: string
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <label htmlFor={htmlFor} className="label">{label}</label>}
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => (
    <Field label={label} error={error} hint={hint} htmlFor={id}>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        className={cn('w-full', error && 'border-danger', className)}
        {...props}
      />
    </Field>
  ),
)
Input.displayName = 'Input'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, hint, id, children, ...props }, ref) => (
    <Field label={label} error={error} hint={hint} htmlFor={id}>
      <select ref={ref} id={id} className={cn('w-full', error && 'border-danger', className)} {...props}>
        {children}
      </select>
    </Field>
  ),
)
Select.displayName = 'Select'

export { Input, Select }
