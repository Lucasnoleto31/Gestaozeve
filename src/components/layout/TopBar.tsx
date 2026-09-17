'use client'

import { usePathname, useRouter } from 'next/navigation'
import { ChevronRight, LogOut, Menu } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSidebar } from '@/lib/sidebar-context'
import { ThemeToggle } from '@/lib/theme'

// Breadcrumb derivado da rota (prefixos mais longos primeiro).
const ROTAS: { prefix: string; section: string; label: string }[] = [
  { prefix: '/admin/contratos-dashboard/barras', section: 'Lotes', label: 'Ranking de barras' },
  { prefix: '/admin/contratos-dashboard/clientes', section: 'Lotes', label: 'Clientes' },
  { prefix: '/admin/contratos-dashboard/fechamento', section: 'Lotes', label: 'Fechamento mensal' },
  { prefix: '/admin/contratos-dashboard/operacional', section: 'Lotes', label: 'Operacional' },
  { prefix: '/admin/contratos-dashboard/receita', section: 'Lotes', label: 'Receita' },
  { prefix: '/admin/contratos-dashboard/incentivo', section: 'Lotes', label: 'Incentivo Genial' },
  { prefix: '/admin/contratos-dashboard', section: 'Lotes', label: 'Painel' },
  { prefix: '/admin/contratos', section: 'Lotes', label: 'Importações' },
  { prefix: '/admin/assessor-pricing', section: 'Cadastros', label: 'Tarifas' },
  { prefix: '/admin/barras', section: 'Cadastros', label: 'Barras' },
  { prefix: '/admin/metas', section: 'Cadastros', label: 'Metas' },
  { prefix: '/admin/usuarios', section: 'Sistema', label: 'Usuários' },
  { prefix: '/perfil', section: 'Conta', label: 'Meu perfil' },
  { prefix: '/dashboard', section: 'Visão geral', label: 'Início' },
]

function crumbFor(pathname: string) {
  return ROTAS.find(r => pathname === r.prefix || pathname.startsWith(r.prefix + '/'))
    ?? { section: 'ZeveAI', label: 'Controle de lotes' }
}

export function TopBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { toggle } = useSidebar()
  const crumb = crumbFor(pathname)

  async function sair() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={toggle}
          className="-ml-1 rounded-md p-1.5 text-fg-muted hover:bg-surface-3 hover:text-fg lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <nav className="flex min-w-0 items-center gap-1.5 text-[13px]" aria-label="Localização">
          <span className="text-fg-subtle">{crumb.section}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
          <span className="truncate font-medium text-fg">{crumb.label}</span>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <button
          onClick={sair}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-fg-muted hover:bg-surface-3 hover:text-fg"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  )
}
