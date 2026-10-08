'use client'

// Cabeçalho do desktop (lg+), em três colunas, como a barra de abas do iPadOS (kit, bloco 7):
// marca e seletor de corretora à esquerda, a cápsula de navegação no centro, data e conta à
// direita. As telas que não cabem na cápsula ficam em "Mais". No celular vale a TopBar +
// a gaveta (Sidebar) + a barra de abas (BottomNav).
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Filter, Home, KeyRound, LineChart, Loader2, LogOut, MoreHorizontal, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Role } from '@/types'
import { Marca } from '@/components/ui/Marca'
import { ThemeToggle } from '@/lib/theme'
import { sair } from '@/lib/auth/sair'
import { CORRETORA_LABEL, CORRETORA_SLUG, corretoraDoSlug, termosDaCorretora, type Corretora } from '@/lib/corretoras'
import { PAGINAS, isActivePath } from './Sidebar'

type Item = { label: string; href: string; icon: React.ElementType; exact?: boolean }

const EQUIPE: Role[] = ['admin', 'vendedor']
// O que fica na cápsula, nesta ordem; o resto das páginas da corretora vai para "Mais"
const NA_CAPSULA = ['painel', 'clientes', 'lotes', 'receita']

export function Header({ role, nome, corretoraPadrao, corretoras, dataHoje }: {
  role: Role
  nome: string
  corretoraPadrao: Corretora
  corretoras: Corretora[]
  dataHoje: string
}) {
  const pathname = usePathname()
  // O "Mais" guarda em que rota foi aberto: navegar fecha sozinho, sem efeito
  const [abertoEm, setAbertoEm] = useState<string | null>(null)
  const maisAberto = abertoEm === pathname
  const setMaisAberto = (v: boolean) => setAbertoEm(v ? pathname : null)
  const [saindo, iniciarSaida] = useTransition()

  const segmentos = pathname.split('/').filter(Boolean)
  const naRota = corretoraDoSlug(segmentos[0])
  const corretora = naRota ?? corretoraPadrao
  const slug = CORRETORA_SLUG[corretora]
  const termos = termosDaCorretora(corretora)
  const paginaAtual = naRota && segmentos[1] && PAGINAS.some(p => p.id === segmentos[1]) ? segmentos[1] : 'painel'
  const equipe = EQUIPE.includes(role)
  const paginas = PAGINAS.filter(p => p.roles.includes(role))
  const rotulo = (id: string, label: string) => (id === 'assessores' ? termos.assessores : label)

  const capsula: Item[] = [
    { label: 'Início', href: '/dashboard', icon: Home, exact: true },
    ...paginas.filter(p => NA_CAPSULA.includes(p.id)).map(p => ({ label: rotulo(p.id, p.label), href: `/${slug}/${p.id}`, icon: p.icon })),
    ...(equipe ? [{ label: 'Leads', href: '/leads', icon: Filter }] : []),
  ]
  const mais: Item[] = [
    ...paginas.filter(p => !NA_CAPSULA.includes(p.id)).map(p => ({ label: rotulo(p.id, p.label), href: `/${slug}/${p.id}`, icon: p.icon })),
    ...(equipe ? [{ label: 'Funil', href: '/funil', icon: LineChart }] : []),
    ...(role === 'admin' ? [{ label: 'Usuários', href: '/admin/usuarios', icon: KeyRound }] : []),
    { label: 'Meu perfil', href: '/perfil', icon: UserRound },
  ]
  const maisAtivo = mais.some(it => isActivePath(pathname, it.href, it.exact))
  const inicial = (nome ?? '?').trim().charAt(0).toUpperCase() || '?'
  const primeiroNome = (nome ?? '').trim().split(/\s+/)[0] || 'Conta'

  return (
    <header className="safe-top sticky top-0 z-30 hidden h-14 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-line bg-bg/90 px-8 backdrop-blur lg:grid">
      {/* Marca e corretora */}
      <div className="flex min-w-0 items-center gap-4">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5 text-dense font-semibold tracking-tight text-fg" aria-label="Zeve Controle, início">
          <Marca className="h-6 w-8" />
          <span>Zeve Controle</span>
        </Link>
        {paginas.length > 0 && corretoras.length > 1 && (
          <nav className="seg" aria-label="Corretora">
            {corretoras.map(c => (
              <Link key={c} href={`/${CORRETORA_SLUG[c]}/${paginaAtual}`} aria-current={c === corretora ? 'true' : undefined}
                className={cn('inline-flex min-h-[30px] items-center rounded-sm px-2.5 text-label font-medium', c === corretora ? 'bg-bg text-fg font-semibold' : 'text-fg-muted hover:text-fg')}>
                {CORRETORA_LABEL[c]}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {/* Cápsula */}
      <nav className="flex items-center gap-0.5 rounded-[26px] bg-surface p-1" aria-label="Áreas">
        {capsula.map(it => {
          const ativo = isActivePath(pathname, it.href, it.exact)
          const Icon = it.icon
          return (
            <Link key={it.href} href={it.href} aria-current={ativo ? 'page' : undefined}
              title={it.label}
              className={cn('inline-flex h-9 items-center gap-2 rounded-[20px] px-3.5 text-dense', ativo ? 'bg-accent-soft font-medium text-fg' : 'text-fg-muted hover:text-fg')}>
              <Icon className="h-4 w-4" aria-hidden strokeWidth={ativo ? 2.25 : 1.75} />
              <span className="hidden xl:inline">{it.label}</span>
            </Link>
          )
        })}
        <div className="relative" onKeyDown={e => { if (e.key === 'Escape') setMaisAberto(false) }}>
          <button type="button" onClick={() => setMaisAberto(!maisAberto)} aria-expanded={maisAberto} aria-haspopup="menu"
            className={cn('inline-flex h-9 items-center gap-2 rounded-[20px] px-3.5 text-dense', maisAberto || maisAtivo ? 'bg-accent-soft font-medium text-fg' : 'text-fg-muted hover:text-fg')}>
            <MoreHorizontal className="h-4 w-4" aria-hidden />
            <span className="hidden xl:inline">Mais</span>
          </button>
          {maisAberto && (
            <>
              <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Fechar menu" onClick={() => setMaisAberto(false)} />
              <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-60 rounded-lg border border-line bg-popover p-1.5 shadow-float">
                {mais.map(it => {
                  const ativo = isActivePath(pathname, it.href, it.exact)
                  const Icon = it.icon
                  return (
                    <Link key={it.href} href={it.href} role="menuitem" aria-current={ativo ? 'page' : undefined}
                      className={cn('flex items-center gap-2.5 rounded-md px-3 py-2 text-dense', ativo ? 'bg-accent-soft font-medium text-fg' : 'text-fg-muted hover:bg-surface hover:text-fg')}>
                      <Icon className="h-4 w-4" aria-hidden />
                      {it.label}
                    </Link>
                  )
                })}
                <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-line px-1 pt-2">
                  <ThemeToggle />
                  <button type="button" onClick={() => iniciarSaida(() => sair())} disabled={saindo}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-label font-medium text-fg-muted hover:bg-surface hover:text-fg disabled:opacity-60">
                    {saindo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LogOut className="h-4 w-4" aria-hidden />}
                    Sair
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </nav>

      {/* Data e conta */}
      <div className="flex min-w-0 items-center justify-end gap-4">
        <span className="hidden truncate text-label text-fg-muted xl:inline">{dataHoje}</span>
        <Link href="/perfil" className="flex shrink-0 items-center gap-2 text-dense text-fg hover:text-fg-muted" aria-label={`Conta de ${nome}`}>
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface text-micro font-semibold" aria-hidden>{inicial}</span>
          <span>{primeiroNome}</span>
        </Link>
      </div>
    </header>
  )
}
