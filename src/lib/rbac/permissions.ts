import { Role } from '@/types'
import {
  LayoutDashboard,
  Settings,
  FileStack,
  FileDown,
} from 'lucide-react'

export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  '/dashboard': ['admin', 'vendedor', 'influenciador'],
  '/admin': ['admin'],
  '/admin/usuarios': ['admin'],
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
    label: 'Usuários',
    href: '/admin/usuarios',
    icon: Settings,
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
