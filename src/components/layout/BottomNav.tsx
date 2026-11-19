'use client'

// Barra de abas do celular (telas menores que lg): flutuante no pé, de vidro, com os atalhos
// de todo dia e o botão Menu, que abre a gaveta completa. A posição acima do indicador do
// iPhone fica no CSS (.bottom-nav); o conteúdo ganha o respiro em .com-barra-inferior.
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Filter, Home, LayoutDashboard, ListChecks, Menu, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Role } from '@/types'
import { useSidebar } from '@/lib/sidebar-context'
import { CORRETORA_SLUG, type Corretora } from '@/lib/corretoras'
import { isActivePath } from './Sidebar'
import { seletorCorretora } from './seletorCorretora'

type Item = { label: string; href: string; icon: React.ElementType; exact?: boolean }

const ITEM = 'flex h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11px] font-medium leading-3 active:scale-[.97]'

export function BottomNav({ role, corretoraPadrao }: { role: Role; corretoraPadrao: Corretora }) {
  const pathname = usePathname()
  const busca = useSearchParams().toString()
  const { toggle, isOpen } = useSidebar()
  // a corretora dos atalhos: a da rota, a filtrada em Comissões ou a última aberta
  const corretora = seletorCorretora(pathname, busca, corretoraPadrao, () => false).atual
  const slug = CORRETORA_SLUG[corretora]
  const equipe = role === 'admin' || role === 'vendedor'
  const itens: Item[] = equipe
    ? [
        { label: 'Início', href: '/dashboard', icon: Home, exact: true },
        { label: 'Painel', href: `/${slug}/painel`, icon: LayoutDashboard },
        { label: 'Clientes', href: `/${slug}/clientes`, icon: Users },
        { label: 'Leads', href: '/leads', icon: Filter },
        { label: 'Fila', href: '/fila', icon: ListChecks },
      ]
    : role === 'atendente'
      ? [{ label: 'Fila', href: '/fila', icon: ListChecks }, { label: 'Meus leads', href: '/leads', icon: Filter }]
      : [{ label: 'Início', href: '/dashboard', icon: Home, exact: true }]

  // tela sem atalho próprio (Giro diário, Receita, Funil, Comissões…): quem acende é o Menu, que é onde ela mora
  const semAtalho = !itens.some(it => isActivePath(pathname, it.href, it.exact))
  const menuAceso = isOpen || semAtalho

  return (
    <>
    {/* o conteúdo some aos poucos antes de passar por trás da barra, em vez de aparecer cortado no vidro */}
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-32 bg-gradient-to-t from-bg via-bg/85 to-transparent lg:hidden" aria-hidden />
    <nav
      className="bottom-nav fixed inset-x-4 z-30 rounded-[26px] border border-line-strong/60 bg-surface/85 p-1.5 shadow-float backdrop-blur-xl backdrop-saturate-150 lg:hidden"
      aria-label="Atalhos"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${itens.length + 1}, minmax(0, 1fr))` }}>
        {itens.map(it => {
          const ativo = !isOpen && isActivePath(pathname, it.href, it.exact)
          const Icon = it.icon
          return (
            <li key={it.href}>
              <Link href={it.href} aria-current={ativo ? 'page' : undefined} className={cn(ITEM, ativo ? 'bg-accent-soft text-fg' : 'text-fg-muted')}>
                <Icon className="h-[22px] w-[22px]" aria-hidden strokeWidth={ativo ? 2.25 : 1.75} />
                {it.label}
              </Link>
            </li>
          )
        })}
        <li>
          <button type="button" onClick={toggle} aria-expanded={isOpen} className={cn(ITEM, menuAceso ? 'bg-accent-soft text-fg' : 'text-fg-muted')}>
            <Menu className="h-[22px] w-[22px]" aria-hidden strokeWidth={menuAceso ? 2.25 : 1.75} />
            Menu
          </button>
        </li>
      </ul>
    </nav>
    </>
  )
}
