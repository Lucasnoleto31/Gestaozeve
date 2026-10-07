'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import {
  BarChart3, ChevronRight, Filter, Gift, Home, KeyRound, LayoutDashboard, LineChart, SlidersHorizontal, Upload, Users, UserSearch, Wallet, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Marca } from '@/components/ui/Marca'
import type { Role } from '@/types'
import { useSidebar } from '@/lib/sidebar-context'
import { CORRETORA_COLOR, CORRETORA_LABEL, CORRETORA_SLUG, corretoraDoSlug, termosDaCorretora, type Corretora } from '@/lib/corretoras'

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

// Rótulo de grupo do menu
function Secao({ label }: { label: string }) {
  return <p className="mb-1.5 px-3 text-micro font-medium text-fg-subtle">{label}</p>
}

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  vendedor: 'Assessor',
  influenciador: 'Influenciador',
}

export function Sidebar({ role, nome, corretoraPadrao, corretoras }: { role: Role; nome: string; corretoraPadrao: Corretora; corretoras: Corretora[] }) {
  const pathname = usePathname()
  const { isOpen, close } = useSidebar()

  // Fecha o menu ao navegar (mobile)
  useEffect(() => { close() }, [pathname, close])

  const segmentos = pathname.split('/').filter(Boolean)
  const naRota = corretoraDoSlug(segmentos[0])
  const corretora = naRota ?? corretoraPadrao
  const slug = CORRETORA_SLUG[corretora]
  const termos = termosDaCorretora(corretora)
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
            'group flex items-center gap-2.5 rounded-md px-3 py-2.5 text-dense font-medium lg:py-2',
            active ? 'bg-accent-soft text-fg shadow-[inset_2px_0_0_var(--accent)]' : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
          )}
        >
          <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-accent' : 'text-fg-subtle group-hover:text-fg')} aria-hidden />
          <span className="truncate">{item.label}</span>
        </Link>
      </li>
    )
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-surface text-fg',
        'transition-transform duration-200 lg:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      )}
      aria-label="Menu principal"
    >
      {/* Marca */}
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg">
          <Marca className="h-5 w-5" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="text-dense font-semibold tracking-tight">Zeve Controle</p>
          <p className="text-micro text-fg-subtle">Genial · XP · BTG</p>
        </div>
        <button onClick={close} className="icon-btn ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-3 hover:text-fg lg:hidden" aria-label="Fechar menu">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4 pt-2">
        {sections.filter(s => s.label === 'Visão geral').map(section => (
          <div key={section.label}>
            <Secao label={section.label} />
            <ul className="space-y-0.5">{section.items.map(renderItem)}</ul>
          </div>
        ))}

        {/* Corretora: seletor + páginas do controle */}
        {paginas.length > 0 && (
          <div>
            <Secao label="Corretora" />
            <div className="mb-2 flex rounded-md bg-surface-3 p-0.5" role="tablist" aria-label="Corretora">
              {corretoras.map(c => {
                const ativa = c === corretora
                return (
                  <Link
                    key={c}
                    role="tab"
                    aria-selected={ativa}
                    href={`/${CORRETORA_SLUG[c]}/${paginaAtual}`}
                    className={cn(
                      'flex min-h-[30px] flex-1 items-center justify-center gap-1.5 rounded-sm text-label font-medium',
                      ativa ? 'bg-surface text-fg font-semibold' : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: CORRETORA_COLOR[c] }} aria-hidden />
                    {CORRETORA_LABEL[c]}
                  </Link>
                )
              })}
            </div>
            <ul className="space-y-0.5">
              {paginas.map(p => renderItem({ label: p.id === 'assessores' ? termos.assessores : p.label, href: `/${slug}/${p.id}`, icon: p.icon }))}
            </ul>
          </div>
        )}

        {sections.filter(s => s.label !== 'Visão geral').map(section => (
          <div key={section.label}>
            <Secao label={section.label} />
            <ul className="space-y-0.5">{section.items.map(renderItem)}</ul>
          </div>
        ))}
      </nav>

      {/* Usuário */}
      <div className="border-t border-line p-3">
        <Link
          href="/perfil"
          className={cn('flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-3', isActivePath(pathname, '/perfil') && 'bg-surface-3')}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-label font-semibold text-accent" aria-hidden>{inicial}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-dense font-medium text-fg">{nome}</p>
            <p className="truncate text-micro text-fg-subtle">{ROLE_LABELS[role] ?? role}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-fg-subtle" aria-hidden />
        </Link>
      </div>
    </aside>
  )
}
