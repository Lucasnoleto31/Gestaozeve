'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export type PageTab = { label: string; href: string; hint?: string; exact?: boolean }

// Abas sublinhadas, coladas na borda inferior do PageHeader.
export function PageTabs({ items }: { items: PageTab[] }) {
  const pathname = usePathname()
  return (
    <nav className="-mb-5 flex gap-1 overflow-x-auto" aria-label="Abas">
      {items.map(t => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + '/')
        return (
          <Link
            key={t.href}
            href={t.href}
            title={t.hint}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium',
              active ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
