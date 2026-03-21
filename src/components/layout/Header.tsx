'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut, Bell } from 'lucide-react'

interface HeaderProps {
  title: string
}

export function Header({ title }: HeaderProps) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="relative h-14 flex items-center justify-between px-6 backdrop-blur-sm"
      style={{
        background: 'rgba(255,255,255,0.95)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* Top gradient accent line */}
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent 0%, var(--blue) 30%, var(--blue-light) 70%, transparent 100%)', opacity: 0.6 }}
      />

      <h1 className="text-base font-semibold text-slate-900 tracking-tight">{title}</h1>

      <div className="flex items-center gap-1">
        <button
          className="p-2 rounded-lg transition-colors"
          style={{ color: 'var(--muted)' }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--foreground)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = ''
            ;(e.currentTarget as HTMLElement).style.color = 'var(--muted)'
          }}
        >
          <Bell className="w-4 h-4" />
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors"
          style={{ color: 'var(--muted)' }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--foreground)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = ''
            ;(e.currentTarget as HTMLElement).style.color = 'var(--muted)'
          }}
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:block">Sair</span>
        </button>
      </div>
    </header>
  )
}
