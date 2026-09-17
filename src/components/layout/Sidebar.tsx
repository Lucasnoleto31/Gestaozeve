'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import {
  Activity, Building2, ChevronRight, DollarSign, Gift, Home, LayoutDashboard,
  Layers, Receipt, Target, Trophy, Upload, Users, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Role } from '@/types'
import { useSidebar } from '@/lib/sidebar-context'

type NavItem = { label: string; href: string; icon: React.ElementType; exact?: boolean }
type NavSection = { label: string; roles: Role[]; items: NavItem[] }

const TODOS: Role[] = ['admin', 'vendedor', 'influenciador']

// Estrutura do sistema: tudo gira em torno dos lotes.
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Visão geral',
    roles: TODOS,
    items: [{ label: 'Início', href: '/dashboard', icon: Home, exact: true }],
  },
  {
    label: 'Lotes',
    roles: ['admin'],
    items: [
      { label: 'Painel', href: '/admin/contratos-dashboard', icon: LayoutDashboard, exact: true },
      { label: 'Ranking de barras', href: '/admin/contratos-dashboard/barras', icon: Trophy },
      { label: 'Operacional', href: '/admin/contratos-dashboard/operacional', icon: Activity },
      { label: 'Receita', href: '/admin/contratos-dashboard/receita', icon: DollarSign },
      { label: 'Incentivo Genial', href: '/admin/contratos-dashboard/incentivo', icon: Gift },
      { label: 'Importações', href: '/admin/contratos', icon: Upload },
    ],
  },
  {
    label: 'Cadastros',
    roles: ['admin'],
    items: [
      { label: 'Barras', href: '/admin/barras', icon: Building2 },
      { label: 'Tarifas', href: '/admin/assessor-pricing', icon: Receipt },
      { label: 'Metas', href: '/admin/metas', icon: Target },
    ],
  },
  {
    label: 'Sistema',
    roles: ['admin'],
    items: [{ label: 'Usuários', href: '/admin/usuarios', icon: Users }],
  },
]

// Match por segmento: '/admin/contratos' não acende em '/admin/contratos-dashboard'.
export function isActivePath(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  vendedor: 'Assessor',
  influenciador: 'Influenciador',
}

export function Sidebar({ role, nome }: { role: Role; nome: string }) {
  const pathname = usePathname()
  const { isOpen, close } = useSidebar()

  // Fecha o menu ao navegar (mobile)
  useEffect(() => { close() }, [pathname, close])

  const sections = NAV_SECTIONS.filter(s => s.roles.includes(role))
  const inicial = (nome ?? '?').trim().charAt(0).toUpperCase() || '?'

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-sb-line bg-sb text-sb-fg',
        'transition-transform duration-200 lg:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      {/* Marca */}
      <div className="flex h-14 items-center gap-2.5 border-b border-sb-line px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sb-accent text-white">
          <Layers className="h-4 w-4" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold tracking-tight">ZeveAI</p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-sb-muted">Controle de lotes</p>
        </div>
        <button
          onClick={close}
          className="ml-auto rounded-md p-1.5 text-sb-muted hover:bg-sb-active hover:text-sb-fg lg:hidden"
          aria-label="Fechar menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navegação */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {sections.map(section => (
          <div key={section.label}>
            <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-sb-muted">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map(item => {
                const active = isActivePath(pathname, item.href, item.exact)
                const Icon = item.icon
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[13px] font-medium',
                        active
                          ? 'bg-sb-active text-sb-fg shadow-[inset_2px_0_0_var(--sb-accent)]'
                          : 'text-sb-muted hover:bg-sb-active hover:text-sb-fg',
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-sb-accent' : 'text-sb-muted group-hover:text-sb-fg')} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Usuário */}
      <div className="border-t border-sb-line p-3">
        <Link
          href="/perfil"
          className={cn(
            'flex items-center gap-3 rounded-md px-2 py-2 hover:bg-sb-active',
            isActivePath(pathname, '/perfil') && 'bg-sb-active',
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sb-accent text-xs font-bold text-white">
            {inicial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-sb-fg">{nome}</p>
            <p className="truncate text-[11px] text-sb-muted">{ROLE_LABELS[role] ?? role}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-sb-muted" />
        </Link>
      </div>
    </aside>
  )
}
