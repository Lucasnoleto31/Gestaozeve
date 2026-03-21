'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Role } from '@/types'
import {
  LayoutDashboard, Users, Settings, UserCircle, Link2,
  UserCheck, Monitor, ShieldAlert, BarChart2, FileStack, FileDown,
  TrendingUp, Building2, Bell,
} from 'lucide-react'

interface SidebarProps {
  role: Role
  nome: string
}

const NAV_SECTIONS: {
  label?: string
  roles: Role[]
  items: { label: string; href: string; icon: React.ElementType }[]
}[] = [
  {
    roles: ['admin', 'vendedor', 'influenciador'],
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Gestão',
    roles: ['admin', 'vendedor'],
    items: [
      { label: 'Clientes', href: '/clientes', icon: UserCheck },
      { label: 'CRM / Leads', href: '/crm', icon: Users },
      { label: 'Influenciadores', href: '/influenciadores', icon: Link2 },
      { label: 'Plataformas', href: '/plataformas', icon: Monitor },
      { label: 'Retenção', href: '/retencao', icon: ShieldAlert },
    ],
  },
  {
    label: 'Meu espaço',
    roles: ['influenciador'],
    items: [
      { label: 'Meu Painel', href: '/influenciador', icon: UserCircle },
    ],
  },
  {
    label: 'Administração',
    roles: ['admin'],
    items: [
      { label: 'Usuários', href: '/admin/usuarios', icon: Settings },
      { label: 'Barras', href: '/admin/barras', icon: Building2 },
      { label: 'Receitas', href: '/admin/receitas', icon: BarChart2 },
      { label: 'Contratos', href: '/admin/contratos', icon: FileStack },
      { label: 'Relatórios', href: '/admin/relatorios', icon: FileDown },
      { label: 'Notificações', href: '/admin/notificacoes', icon: Bell },
    ],
  },
]

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  vendedor: 'Assessor',
  influenciador: 'Influenciador',
}

export function Sidebar({ role, nome }: SidebarProps) {
  const pathname = usePathname()

  const sections = NAV_SECTIONS.filter((s) => s.roles.includes(role))

  return (
    <aside className="w-64 flex flex-col h-full fixed left-0 top-0 z-40"
      style={{ background: 'var(--sidebar)', borderRight: '1px solid var(--border-subtle)' }}
    >
      {/* Logo */}
      <div className="px-5 py-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--blue) 0%, var(--blue-dark) 100%)' }}
          >
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-bold text-slate-900 tracking-wide">ZeveAI</span>
            <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--muted)' }}>Assessoria</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
        {sections.map((section, si) => (
          <div key={si}>
            {section.label && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: 'var(--muted)' }}
              >
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = pathname.startsWith(item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium relative',
                        isActive
                          ? 'text-slate-900'
                          : 'hover:text-gray-900'
                      )}
                      style={
                        isActive
                          ? {
                              background: 'linear-gradient(90deg, rgba(23,100,244,0.15) 0%, rgba(23,100,244,0.05) 100%)',
                              color: 'var(--blue-light)',
                              boxShadow: 'inset 2px 0 0 var(--blue)',
                            }
                          : { color: 'var(--muted)' }
                      }
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'
                          ;(e.currentTarget as HTMLElement).style.color = '#e2e8f0'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          ;(e.currentTarget as HTMLElement).style.background = ''
                          ;(e.currentTarget as HTMLElement).style.color = 'var(--muted)'
                        }
                      }}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 py-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <Link href="/perfil" className="flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 transition-colors hover:bg-blue-50/60 group">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--blue) 0%, var(--blue-dark) 100%)' }}
          >
            {(nome ?? '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-700">{nome}</p>
            <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
              {ROLE_LABELS[role] ?? role}
            </p>
          </div>
        </Link>
      </div>
    </aside>
  )
}
