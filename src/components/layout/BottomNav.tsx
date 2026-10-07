'use client'

// Barra inferior do celular (telas menores que lg): os atalhos de todo dia e o botão
// Menu, que abre o painel lateral completo. Respeita a área do indicador do iPhone.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Filter, Home, LayoutDashboard, Menu, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Role } from '@/types'
import { useSidebar } from '@/lib/sidebar-context'
import { CORRETORA_SLUG, corretoraDoSlug, type Corretora } from '@/lib/corretoras'
import { isActivePath } from './Sidebar'

type Item = { label: string; href: string; icon: React.ElementType; exact?: boolean }

export function BottomNav({ role, corretoraPadrao }: { role: Role; corretoraPadrao: Corretora }) {
  const pathname = usePathname()
  const { toggle, isOpen } = useSidebar()
  const seg = pathname.split('/').filter(Boolean)
  const corretora = corretoraDoSlug(seg[0]) ?? corretoraPadrao
  const slug = CORRETORA_SLUG[corretora]
  const equipe = role === 'admin' || role === 'vendedor'
  const itens: Item[] = equipe
    ? [
        { label: 'Início', href: '/dashboard', icon: Home, exact: true },
        { label: 'Painel', href: `/${slug}/painel`, icon: LayoutDashboard },
        { label: 'Clientes', href: `/${slug}/clientes`, icon: Users },
        { label: 'Leads', href: '/leads', icon: Filter },
      ]
    : [{ label: 'Início', href: '/dashboard', icon: Home, exact: true }]

  return (
    <nav className="bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden" aria-label="Atalhos">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${itens.length + 1}, minmax(0, 1fr))` }}>
        {itens.map(it => {
          const ativo = !isOpen && isActivePath(pathname, it.href, it.exact)
          const Icon = it.icon
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={ativo ? 'page' : undefined}
                className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium active:opacity-70', ativo ? 'text-accent' : 'text-fg-muted')}
              >
                <Icon className="h-5 w-5" aria-hidden strokeWidth={ativo ? 2.25 : 1.75} />
                {it.label}
              </Link>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={isOpen}
            className={cn('flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium active:opacity-70', isOpen ? 'text-accent' : 'text-fg-muted')}
          >
            <Menu className="h-5 w-5" aria-hidden strokeWidth={isOpen ? 2.25 : 1.75} />
            Menu
          </button>
        </li>
      </ul>
    </nav>
  )
}
