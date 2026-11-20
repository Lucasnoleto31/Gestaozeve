// Painel › a chave "Com custos | Sem custos" (Lucas, 20/11/2026: "Coloque para eu ter como visualizar com e
// sem custos no sistema"). Dois links: a escolha fica no endereço (?custos=sem) e vale para as abas Resumo e
// Mês a mês; sem o parâmetro vale "com custos". Com "sem custos" a aba sai como era antes de os custos
// existirem (a divisão dos sócios sobre a comissão líquida). Sem hooks: serve em Server Components.
import Link from 'next/link'
import { cn } from '@/lib/utils'

export const PARAM_CUSTOS = 'custos'
export const semCustosNaUrl = (q: Record<string, string>) => q[PARAM_CUSTOS] === 'sem'
// para os outros links da aba levarem a escolha junto ("ver mês a mês", "ver todas as linhas")
export const custosNaQuery = (q: Record<string, string>) => (semCustosNaUrl(q) ? `${PARAM_CUSTOS}=sem&` : '')

// `query` = os parâmetros que já estão no endereço (mês, aba, linhas…): todos seguem, só a escolha muda
export function ChaveCustos({ caminho, query, className }: { caminho: string; query: Record<string, string>; className?: string }) {
  const semCustos = semCustosNaUrl(query)
  const href = (sem: boolean) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) if (v !== '' && k !== PARAM_CUSTOS) p.set(k, v)
    if (sem) p.set(PARAM_CUSTOS, 'sem')
    const qs = p.toString()
    return qs ? `${caminho}?${qs}` : caminho
  }
  return (
    <nav className={cn('flex gap-2', className)} aria-label="Ver a conta com ou sem os custos do escritório">
      <Link href={href(false)} scroll={false} className="chip" data-active={!semCustos} aria-current={!semCustos ? 'true' : undefined}>Com custos</Link>
      <Link href={href(true)} scroll={false} className="chip" data-active={semCustos} aria-current={semCustos ? 'true' : undefined}>Sem custos</Link>
    </nav>
  )
}
