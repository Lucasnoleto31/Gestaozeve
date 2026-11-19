'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Marca } from '@/components/ui/Marca'
import { CORRETORA_COLOR, CORRETORA_LABEL, corretoraDoSlug, type Corretora } from '@/lib/corretoras'
import { PAGINAS } from './Sidebar'
import { seletorCorretora } from './seletorCorretora'

// Barra do topo no celular (abaixo de lg): a marca, o nome da tela e, nas telas que dependem da corretora,
// a troca Genial/BTG a um toque. O nome da tela mora aqui: o cabeçalho da página não o repete no celular
// (PageHeader). Tema e sair ficam no Menu (gaveta), que é onde se mexe na conta.
const ROTAS: { prefix: string; label: string }[] = [
  { prefix: '/admin/usuarios', label: 'Usuários' },
  { prefix: '/perfil', label: 'Meu perfil' },
  { prefix: '/dashboard', label: 'Início' },
  { prefix: '/leads', label: 'Leads' },
  { prefix: '/funil', label: 'Funil' },
  { prefix: '/fila', label: 'Minha fila' },
  { prefix: '/comissoes', label: 'Comissões' },
]

export function tituloDaRota(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)
  if (corretoraDoSlug(seg[0])) {
    if (seg[1] === 'clientes' && seg[2]) return 'Ficha do cliente'
    // um nome por coisa: o mesmo do menu e do título da página
    return PAGINAS.find(p => p.id === seg[1])?.label ?? 'Painel'
  }
  return ROTAS.find(r => pathname === r.prefix || pathname.startsWith(r.prefix + '/'))?.label ?? 'Início'
}

export function TopBar({ corretoraPadrao, corretoras }: { corretoraPadrao: Corretora; corretoras: Corretora[] }) {
  const pathname = usePathname()
  const busca = useSearchParams().toString()
  const sel = seletorCorretora(pathname, busca, corretoraPadrao, id => PAGINAS.some(p => p.id === id))
  // a troca aparece onde a corretora muda o que a tela mostra: páginas da corretora, Comissões (filtro) e
  // a aba Distribuir da Fila
  const seg = pathname.split('/').filter(Boolean)
  const naCorretora = corretoraDoSlug(seg[0])
  const distribuir = pathname === '/fila' && new URLSearchParams(busca).get('aba') === 'distribuir'
  // na ficha de um cliente e nas operações de um dia, trocar de corretora tiraria a pessoa da tela (o cliente
  // e o dia são de uma corretora só): ali a corretora aparece só como texto
  const telaDeUmaSo = naCorretora != null && seg.length > 2
  const comTroca = corretoras.length > 1 && !telaDeUmaSo && (naCorretora != null || sel.filtro || distribuir)

  return (
    <header className="safe-top sticky top-0 z-30 flex min-h-[52px] items-center gap-2.5 border-b border-line bg-bg/90 px-4 backdrop-blur lg:hidden">
      <Link href="/dashboard" className="flex h-8 shrink-0 items-center" aria-label="Início">
        <Marca className="h-6 w-8" />
      </Link>
      <p className="min-w-0 flex-1 truncate text-section font-semibold tracking-tight text-fg" aria-label="Tela aberta">{tituloDaRota(pathname)}</p>

      {naCorretora && !comTroca && (
        <span className="flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-label font-medium text-fg-muted">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: CORRETORA_COLOR[naCorretora] }} aria-hidden />
          {CORRETORA_LABEL[naCorretora]}
        </span>
      )}
      {comTroca && (
        <div className="flex shrink-0 rounded-full bg-surface p-[3px]" role="tablist" aria-label={sel.filtro ? 'Corretora: filtro desta tela' : 'Corretora'}>
          {sel.filtro && (
            <Link role="tab" aria-selected={sel.marcada == null} href={sel.href(null)}
              className={cn('flex min-h-[36px] items-center rounded-full px-2.5 text-label font-medium', sel.marcada == null ? 'bg-surface-3 font-semibold text-fg' : 'text-fg-muted')}>
              Todas
            </Link>
          )}
          {corretoras.map(c => {
            const ativa = c === sel.marcada
            return (
              <Link key={c} role="tab" aria-selected={ativa} href={sel.href(c)}
                className={cn('flex min-h-[36px] items-center gap-1.5 rounded-full text-label font-medium', sel.filtro ? 'px-2.5' : 'px-3', ativa ? 'bg-surface-3 font-semibold text-fg' : 'text-fg-muted')}>
                {/* com a opção "Todas" a fileira fica larga: sem a bolinha, o nome da tela não corta */}
                {!sel.filtro && <span className="h-1.5 w-1.5 rounded-full" style={{ background: CORRETORA_COLOR[c] }} aria-hidden />}
                {CORRETORA_LABEL[c]}
              </Link>
            )
          })}
        </div>
      )}
    </header>
  )
}
