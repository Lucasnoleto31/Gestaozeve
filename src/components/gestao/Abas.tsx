import Link from 'next/link'
import { cn } from '@/lib/utils'

export type OpcaoAba = { valor: string; label: string; conta?: string | number | null }

// Abas de uma página guardadas no endereço (?aba=). Cada aba é um link: a página (Server Component)
// carrega só os dados da aba aberta. `query` = os outros parâmetros a preservar (mês, parceiro…);
// a aba padrão não vai para o endereço.
export function Abas({ caminho, query, valor, opcoes, padrao, param = 'aba', rotulo = 'Seções da página' }: {
  caminho: string
  query: Record<string, string | null | undefined>
  valor: string
  opcoes: OpcaoAba[]
  padrao: string
  param?: string
  rotulo?: string
}) {
  const href = (v: string) => {
    const p = new URLSearchParams()
    for (const [k, x] of Object.entries(query)) if (x != null && x !== '') p.set(k, x)
    if (v !== padrao) p.set(param, v)
    const qs = p.toString()
    return qs ? `${caminho}?${qs}` : caminho
  }
  return (
    <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-line" aria-label={rotulo}>
      {opcoes.map(o => {
        const ativa = o.valor === valor
        return (
          <Link key={o.valor} href={href(o.valor)} scroll={false} aria-current={ativa ? 'page' : undefined}
            className={cn('inline-flex min-h-[44px] items-center whitespace-nowrap border-b-2 px-3 text-dense font-medium',
              ativa ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg')}>
            {o.label}
            {o.conta != null && o.conta !== '' && <span className="ml-1.5 text-micro font-normal text-fg-subtle">{o.conta}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
