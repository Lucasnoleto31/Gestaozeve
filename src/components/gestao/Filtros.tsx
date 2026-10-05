'use client'

// Filtros ligados à URL (mês de referência, período, seleção). Trocar o valor
// navega para a mesma página com o parâmetro atualizado: a página (Server
// Component) recarrega os dados.
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mesInput, parseMes, somarDias, type MesRef } from '@/lib/gestao/meses'
import { hojeBrasil, fmtDate } from '@/lib/periodo'

function useParamNav() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, start] = useTransition()
  const set = (mudancas: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(mudancas)) {
      if (v == null || v === '') p.delete(k); else p.set(k, v)
    }
    const qs = p.toString()
    start(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }
  return { set, pending }
}

export function MesPicker({ valor, param = 'mes', label = 'Mês de referência', className }: {
  valor: MesRef
  param?: string
  label?: string
  className?: string
}) {
  const { set, pending } = useParamNav()
  return (
    <label className={cn('flex items-center gap-2', className)}>
      <span className="label whitespace-nowrap">{label}</span>
      <input
        type="month"
        className="field-sm"
        value={mesInput(valor)}
        onChange={e => { const m = parseMes(e.target.value); if (m) set({ [param]: m.slice(0, 7) }) }}
      />
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-fg-subtle" />}
    </label>
  )
}

export function PeriodoPicker({ inicio, fim, className }: { inicio: string; fim: string; className?: string }) {
  const { set, pending } = useParamNav()
  const hoje = fmtDate(hojeBrasil())
  const atalhos: { label: string; ini: string; fim: string }[] = [
    { label: '30 dias', ini: somarDias(hoje, -29), fim: hoje },
    { label: '60 dias', ini: somarDias(hoje, -59), fim: hoje },
    { label: '90 dias', ini: somarDias(hoje, -89), fim: hoje },
    { label: 'Mês atual', ini: hoje.slice(0, 7) + '-01', fim: hoje },
  ]
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="seg">
        {atalhos.map(a => (
          <button key={a.label} type="button" data-active={inicio === a.ini && fim === a.fim} onClick={() => set({ inicio: a.ini, fim: a.fim })}>
            {a.label}
          </button>
        ))}
      </div>
      <input type="date" className="field-sm" value={inicio} max={fim} onChange={e => e.target.value && set({ inicio: e.target.value })} aria-label="Data inicial" />
      <span className="text-xs text-fg-subtle">até</span>
      <input type="date" className="field-sm" value={fim} min={inicio} onChange={e => e.target.value && set({ fim: e.target.value })} aria-label="Data final" />
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-fg-subtle" />}
    </div>
  )
}

export function SelectParam({ param, valor, opcoes, label, todos = 'Todos', className }: {
  param: string
  valor: string
  opcoes: { valor: string; label: string }[]
  label?: string
  todos?: string | null
  className?: string
}) {
  const { set, pending } = useParamNav()
  return (
    <label className={cn('flex items-center gap-2', className)}>
      {label && <span className="label whitespace-nowrap">{label}</span>}
      <select className="field-sm max-w-[240px]" value={valor} onChange={e => set({ [param]: e.target.value })}>
        {todos != null && <option value="">{todos}</option>}
        {opcoes.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}
      </select>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-fg-subtle" />}
    </label>
  )
}

export function SegParam({ param, valor, opcoes }: { param: string; valor: string; opcoes: { valor: string; label: string; icon?: ReactNode }[] }) {
  const { set } = useParamNav()
  return (
    <div className="seg">
      {opcoes.map(o => (
        <button key={o.valor} type="button" data-active={valor === o.valor} onClick={() => set({ [param]: o.valor })}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  )
}
