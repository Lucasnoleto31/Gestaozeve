import { CORRETORA_COLOR, CORRETORA_LABEL, isCorretora } from '@/lib/corretoras'
import { cn } from '@/lib/utils'

// Pílula com a cor da corretora. Sem hooks: serve em Server e Client Components.
export function CorretoraBadge({ corretora, size = 'sm', className }: {
  corretora: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const c = isCorretora(corretora) ? corretora : null
  const color = c ? CORRETORA_COLOR[c] : 'var(--fg-subtle)'
  const label = c ? CORRETORA_LABEL[c] : corretora
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md font-semibold',
        size === 'md' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-px text-[10px]',
        className,
      )}
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}
