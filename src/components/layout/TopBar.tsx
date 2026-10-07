'use client'

import { usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { LogOut, Loader2, Menu } from 'lucide-react'
import { sair } from '@/lib/auth/sair'
import { useSidebar } from '@/lib/sidebar-context'
import { ThemeToggle } from '@/lib/theme'
import { CORRETORA_LABEL, PAGINAS_CORRETORA, corretoraDoSlug } from '@/lib/corretoras'

// Localização derivada da rota (o título grande fica no cabeçalho da página)
const ROTAS: { prefix: string; section: string; label: string }[] = [
  { prefix: '/admin/usuarios', section: 'Sistema', label: 'Usuários' },
  { prefix: '/perfil', section: 'Conta', label: 'Meu perfil' },
  { prefix: '/dashboard', section: 'Visão geral', label: 'Início' },
  { prefix: '/leads', section: 'Leads', label: 'Leads' },
  { prefix: '/funil', section: 'Leads', label: 'Funil' },
]

function crumbFor(pathname: string) {
  const seg = pathname.split('/').filter(Boolean)
  const corretora = corretoraDoSlug(seg[0])
  if (corretora) {
    const pagina = PAGINAS_CORRETORA.find(p => p.id === seg[1])
    const label = seg[1] === 'clientes' && seg[2] ? 'Consulta de cliente' : pagina?.label ?? 'Painel'
    return { section: CORRETORA_LABEL[corretora], label }
  }
  return ROTAS.find(r => pathname === r.prefix || pathname.startsWith(r.prefix + '/')) ?? { section: 'ZeveAI', label: 'Gestão' }
}

export function TopBar() {
  const pathname = usePathname()
  const { toggle } = useSidebar()
  const crumb = crumbFor(pathname)
  const [saindo, iniciarSaida] = useTransition()

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <button onClick={toggle} className="icon-btn -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:bg-surface-3 hover:text-fg lg:hidden" aria-label="Abrir menu">
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <p className="min-w-0 truncate text-label text-fg-subtle" aria-label="Localização">
          {crumb.section} <span aria-hidden>·</span> <span className="font-medium text-fg-muted">{crumb.label}</span>
        </p>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <button onClick={() => iniciarSaida(() => sair())} disabled={saindo} className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-label font-medium text-fg-muted hover:bg-surface-3 hover:text-fg disabled:opacity-60">
          {saindo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LogOut className="h-4 w-4" aria-hidden />}
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  )
}
