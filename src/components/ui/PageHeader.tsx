import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type PageStat = { label: string; value: ReactNode; sub?: ReactNode }

// Cabeçalho de página: seção (eyebrow), título, uma linha de descrição, ações à
// direita. Sem faixa própria: a hierarquia vem do tamanho e do espaço.
// No celular (DESIGN.md §8) ele encolhe: a barra do topo já diz o nome da tela, então a seção e o título
// em texto simples somem da vista (o título continua para o leitor de tela) e a descrição também, porque
// a tela abre pela frase com a resposta. Sobram as ações e as abas.
export function PageHeader({ eyebrow, title, description, actions, stats, children, className, tituloNoCelular, descricaoNoCelular }: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  stats?: PageStat[]
  children?: ReactNode
  className?: string
  tituloNoCelular?: boolean     // o título é informação (nome do cliente, do parceiro, o dia): fica à vista no celular
  descricaoNoCelular?: boolean  // a descrição traz dado que a tela não repete: fica à vista no celular
}) {
  // título que a barra do topo já mostra: texto simples, sem pedido para manter
  const tituloNaBarra = typeof title === 'string' && !tituloNoCelular
  return (
    <div className={cn('px-4 pb-2 pt-3 md:pt-6 lg:px-8', className)}>
      {/* Título com largura mínima: quando as ações não cabem ao lado, descem para a linha de baixo */}
      <div className="flex flex-col md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-4">
        <div className="min-w-0 md:min-w-[18rem] md:flex-1">
          {eyebrow && <p className="eyebrow mb-1 max-lg:hidden">{eyebrow}</p>}
          <h1 className={cn('text-title font-bold tracking-tight text-fg', tituloNaBarra && 'max-lg:sr-only')}>{title}</h1>
          {description && <p className={cn('mt-1 max-w-2xl text-dense text-fg-muted', !descricaoNoCelular && 'max-md:hidden')}>{description}</p>}
        </div>
        {actions && <div className={cn('cabecalho-acoes flex min-w-0 flex-wrap items-center gap-2 md:ml-auto md:shrink-0', (!tituloNaBarra || (description && descricaoNoCelular)) && 'max-md:mt-3')}>{actions}</div>}
      </div>

      {stats && stats.length > 0 && (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          {stats.map((s, i) => (
            <div key={i} className="min-w-0">
              <dt className="label">{s.label}</dt>
              <dd className="mt-0.5 text-section font-semibold leading-tight tabular-nums text-fg">{s.value}</dd>
              {s.sub && <p className="text-micro text-fg-subtle">{s.sub}</p>}
            </div>
          ))}
        </dl>
      )}

      {children}
    </div>
  )
}

// Área de conteúdo abaixo do cabeçalho
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-6 px-4 pb-10 pt-3 md:space-y-8 md:pt-4 lg:px-8', className)}>{children}</div>
}
