'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import {
  BarChart3, ChevronRight, Filter, Gift, Home, KeyRound, LayoutDashboard, Layers, LineChart, SlidersHorizontal, Upload, Users, UserSearch, Wallet, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Role } from '@/types'
import { useSidebar } from '@/lib/sidebar-context'
import { CORRETORAS, CORRETORA_COLOR, CORRETORA_LABEL, CORRETORA_SLUG, corretoraDoSlug, type Corretora } from '@/lib/corretoras'

type NavItem = { label: string; href: string; icon: React.ElementType; exact?: boolean }
type NavSection = { label: string; roles: Role[]; items: NavItem[] }

const TODOS: Role[] = ['admin', 'vendedor', 'influenciador']
const EQUIPE: Role[] = ['admin', 'vendedor']

// Páginas do controle de cada corretora (na ordem do menu)
const PAGINAS: { id: string; label: string; icon: React.ElementType; roles: Role[] }[] = [
  { id: 'painel', label: 'Painel', icon: LayoutDashboard, roles: EQUIPE },
  { id: 'clientes', label: 'Clientes', icon: Users, roles: EQUIPE },
  { id: 'lotes', label: 'Giro diário', icon: BarChart3, roles: EQUIPE },
  { id: 'assessores', label: 'Assessores', icon: UserSearch, roles: EQUIPE },
  { id: 'receita', label: 'Receita', icon: Wallet, roles: EQUIPE },
  { id: 'incentivo', label: 'Incentivo', icon: Gift, roles: EQUIPE },
  { id: 'graficos', label: 'Gráficos', icon: LineChart, roles: EQUIPE },
  { id: 'importar', label: 'Importar', icon: Upload, roles: ['admin'] },
  { id: 'parametros', label: 'Parâmetros', icon: SlidersHorizontal, roles: ['admin'] },
]

// Match por segmento: um item só acende na própria rota ou nas filhas dela.
export function isActivePath(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  vendedor: 'Assessor',
  influenciador: 'Influenciador',
}

export function Sidebar({ role, nome, corretoraPadrao }: { role: Role; nome: string; corretoraPadrao: Corretora }) {
  const pathname = usePathname()
  const { isOpen, close } = useSidebar()

  // Fecha o menu ao navegar (mobile)
  useEffect(() => { close() }, [pathname, close])

  const segmentos = pathname.split('/').filter(Boolean)
  const naRota = corretoraDoSlug(segmentos[0])
  const corretora = naRota ?? corretoraPadrao
  const slug = CORRETORA_SLUG[corretora]
  // Ao trocar de corretora, fica na mesma página (ou vai pro painel)
  const paginaAtual = naRota && segmentos[1] && PAGINAS.some(p => p.id === segmentos[1]) ? segmentos[1] : 'painel'

  const sections: NavSection[] = [
    { label: 'Visão geral', roles: TODOS, items: [{ label: 'Início', href: '/dashboard', icon: Home, exact: true }] },
    { label: 'Leads', roles: EQUIPE, items: [{ label: 'Leads', href: '/leads', icon: Filter }, { label: 'Funil', href: '/funil', icon: LineChart }] },
    { label: 'Sistema', roles: ['admin'], items: [{ label: 'Usuários', href: '/admin/usuarios', icon: KeyRound }] },
  ].filter(s => s.roles.includes(role)) as NavSection[]

  const paginas = PAGINAS.filter(p => p.roles.includes(role))
  const inicial = (nome ?? '?').trim().charAt(0).toUpperCase() || '?'

  const renderItem = (item: NavItem) => {
    const active = isActivePath(pathname, item.href, item.exact)
    const Icon = item.icon
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'group flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[13px] font-medium',
            active ? 'bg-sb-active text-sb-fg shadow-[inset_2px_0_0_var(--sb-accent)]' : 'text-sb-muted hover:bg-sb-active hover:text-sb-fg',
          )}
        >
          <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-sb-accent' : 'text-sb-muted group-hover:text-sb-fg')} />
          <span className="truncate">{item.label}</span>
        </Link>
      </li>
    )
  }

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
        <button onClick={close} className="ml-auto rounded-md p-1.5 text-sb-muted hover:bg-sb-active hover:text-sb-fg lg:hidden" aria-label="Fechar menu">
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {sections.filter(s => s.label === 'Visão geral').map(section => (
          <div key={section.label}>
            <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-sb-muted">{section.label}</p>
            <ul className="space-y-0.5">{section.items.map(renderItem)}</ul>
          </div>
        ))}

        {/* Corretoras: seletor + páginas do controle */}
        {paginas.length > 0 && (
          <div>
            <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-sb-muted">Corretora</p>
            <div className="mb-2 grid grid-cols-3 gap-1 px-1" role="tablist" aria-label="Corretora">
              {CORRETORAS.map(c => {
                const ativa = c === corretora
                const cor = CORRETORA_COLOR[c]
                return (
                  <Link
                    key={c}
                    role="tab"
                    aria-selected={ativa}
                    href={`/${CORRETORA_SLUG[c]}/${paginaAtual}`}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-md border px-1 py-1.5 text-[11.5px] font-semibold',
                      ativa ? 'border-sb-line bg-sb-active text-sb-fg' : 'border-transparent text-sb-muted hover:bg-sb-active hover:text-sb-fg',
                    )}
                    style={ativa ? { boxShadow: `inset 0 -2px 0 ${cor}` } : undefined}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor }} />
                    {CORRETORA_LABEL[c]}
                  </Link>
                )
              })}
            </div>
            <ul className="space-y-0.5">
              {paginas.map(p => renderItem({ label: p.label, href: `/${slug}/${p.id}`, icon: p.icon }))}
            </ul>
          </div>
        )}

        {sections.filter(s => s.label !== 'Visão geral').map(section => (
          <div key={section.label}>
            <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-sb-muted">{section.label}</p>
            <ul className="space-y-0.5">{section.items.map(renderItem)}</ul>
          </div>
        ))}
      </nav>

      {/* Usuário */}
      <div className="border-t border-sb-line p-3">
        <Link
          href="/perfil"
          className={cn('flex items-center gap-3 rounded-md px-2 py-2 hover:bg-sb-active', isActivePath(pathname, '/perfil') && 'bg-sb-active')}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sb-accent text-xs font-bold text-white">{inicial}</div>
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
