import { Role } from '@/types'
import {
  LayoutDashboard,
  Users,
  Settings,
  UserCircle,
  Link2,
  UserCheck,
  Monitor,
  ShieldAlert,
  BarChart2,
  FileStack,
  FileDown,
} from 'lucide-react'

export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  '/dashboard': ['admin', 'vendedor', 'influenciador'],
  '/clientes': ['admin', 'vendedor'],
  '/crm': ['admin', 'vendedor'],
  '/influenciadores': ['admin', 'vendedor'],
  '/plataformas': ['admin', 'vendedor'],
  '/retencao': ['admin', 'vendedor'],
  '/influenciador': ['influenciador'],
  '/admin': ['admin'],
  '/admin/usuarios': ['admin'],
  '/admin/influenciadores': ['admin'],
  '/admin/receitas': ['admin'],
  '/admin/contratos': ['admin'],
  '/admin/relatorios': ['admin'],
}

export const NAV_ITEMS: {
  label: string
  href: string
  icon: React.ElementType
  roles: Role[]
}[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: ['admin', 'vendedor', 'influenciador'],
  },
  {
    label: 'Clientes',
    href: '/clientes',
    icon: UserCheck,
    roles: ['admin', 'vendedor'],
  },
  {
    label: 'CRM/Leads',
    href: '/crm',
    icon: Users,
    roles: ['admin', 'vendedor'],
  },
  {
    label: 'Influenciadores',
    href: '/influenciadores',
    icon: Link2,
    roles: ['admin', 'vendedor'],
  },
  {
    label: 'Plataformas',
    href: '/plataformas',
    icon: Monitor,
    roles: ['admin', 'vendedor'],
  },
  {
    label: 'Retenção',
    href: '/retencao',
    icon: ShieldAlert,
    roles: ['admin', 'vendedor'],
  },
  {
    label: 'Meu Painel',
    href: '/influenciador',
    icon: UserCircle,
    roles: ['influenciador'],
  },
  {
    label: 'Usuários',
    href: '/admin/usuarios',
    icon: Settings,
    roles: ['admin'],
  },
  {
    label: 'Receitas',
    href: '/admin/receitas',
    icon: BarChart2,
    roles: ['admin'],
  },
  {
    label: 'Contratos',
    href: '/admin/contratos',
    icon: FileStack,
    roles: ['admin'],
  },
  {
    label: 'Relatórios',
    href: '/admin/relatorios',
    icon: FileDown,
    roles: ['admin'],
  },
]

export function canAccess(role: Role, path: string): boolean {
  const entry = Object.entries(ROUTE_PERMISSIONS).find(([route]) =>
    path.startsWith(route)
  )
  if (!entry) return false
  return entry[1].includes(role)
}
