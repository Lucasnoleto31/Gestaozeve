'use client'

// Barra de abas do celular (telas menores que lg): flutuante no pé, de vidro, com os atalhos
// de todo dia e o botão Menu, que abre a gaveta completa. A posição acima do indicador do
// iPhone fica no CSS (.bottom-nav); o conteúdo ganha o respiro em .com-barra-inferior.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Filter, Home, LayoutDashboard, Menu, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Role } from '@/types'
import { useSidebar } from '@/lib/sidebar-context'
import { CORRETORA_SLUG, corretoraDoSlug, type Corretora } from '@/lib/corretoras'
import { isActivePath } from './Sidebar'

type Item = { label: string; href: string; icon: React.ElementType; exact?: boolean }

const ITEM = 'flex h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-[20px] text-[10px] font-medium leading-3 active:scale-[.97]'

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
    <nav
      className="bottom-nav fixed inset-x-4 z-30 rounded-[26px] border border-line-strong/60 bg-surface/80 p-1.5 shadow-float backdrop-blur-xl backdrop-saturate-150 lg:hidden"
      aria-label="Atalhos"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${itens.length + 1}, minmax(0, 1fr))` }}>
        {itens.map(it => {
          const ativo = !isOpen && isActivePath(pathname, it.href, it.exact)
          const Icon = it.icon
          return (
            <li key={it.href}>
              <Link href={it.href} aria-current={ativo ? 'page' : undefined} className={cn(ITEM, ativo ? 'bg-accent-soft text-fg' : 'text-fg-muted')}>
                <Icon className="h-[22px] w-[22px]" aria-hidden strokeWidth={ativo ? 2.25 : 1.75} />
                {it.label}
              </Link>
            </li>
          )
        })}
        <li>
          <button type="button" onClick={toggle} aria-expanded={isOpen} className={cn(ITEM, isOpen ? 'bg-accent-soft text-fg' : 'text-fg-muted')}>
            <Menu className="h-[22px] w-[22px]" aria-hidden strokeWidth={isOpen ? 2.25 : 1.75} />
            Menu
          </button>
        </li>
      </ul>
    </nav>
  )
}
