// Células de tabela no estilo da planilha: números com traço no zero, barras de
// dados, mapa de calor, badges de situação. Sem hooks: servem em Server Components.
import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { fmtBRL2, fmtNum, fmtNum2, fmtPct } from '@/lib/format'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import type { Situacao, StatusConta } from '@/lib/gestao/tipos'

export const TRACO = '–'

// Lotes/quantidades: zero vira traço
export const n0 = (v: number | null | undefined) => (v == null || v === 0 ? TRACO : fmtNum(v))
export const n2 = (v: number | null | undefined) => (v == null || v === 0 ? TRACO : fmtNum2(v))
// Dinheiro
export const r0 = (v: number | null | undefined) => (v == null || v === 0 ? TRACO : fmtBRL2(v))
export const rCurto = (v: number | null | undefined) => (v == null || v === 0 ? TRACO : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }))
export const p1 = (v: number | null | undefined) => (v == null ? TRACO : fmtPct(v))
export const pct = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : 0)
export const dataCurta = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : TRACO)
export const dataPt = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : TRACO)

export type Tom = 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'violet'
const VAR: Record<Tom, string> = {
  accent: 'var(--accent)', success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)', info: 'var(--info)', violet: 'var(--violet)',
}

// Barra de dados dentro da célula (como a formatação condicional do Excel)
export function BarraCelula({ valor, max, tom = 'accent', fmt = n0, largura = 72, className }: {
  valor: number
  max: number
  tom?: Tom
  fmt?: (v: number) => string
  largura?: number
  className?: string
}) {
  const p = max > 0 ? Math.max(0, Math.min(100, (valor / max) * 100)) : 0
  return (
    <span className={cn('inline-flex items-center justify-end gap-2', className)}>
      <span className="bar-track h-2 shrink-0" style={{ width: largura }}>
        <span className="bar-fill block" style={{ width: `${p}%`, background: VAR[tom], opacity: 0.75 }} />
      </span>
      <span className="tabular-nums">{fmt(valor)}</span>
    </span>
  )
}

// Intensidade do mapa de calor (0..1 → fundo colorido translúcido)
export function estiloCalor(valor: number, max: number, tom: Tom = 'success'): CSSProperties | undefined {
  if (!valor || max <= 0) return undefined
  const i = Math.sqrt(Math.max(0, Math.min(1, valor / max)))
  const alpha = Math.round(8 + 52 * i)
  return { background: `color-mix(in srgb, ${VAR[tom]} ${alpha}%, transparent)` }
}

export function CelulaCalor({ valor, max, tom = 'success', fmt = n0, className }: {
  valor: number
  max: number
  tom?: Tom
  fmt?: (v: number) => string
  className?: string
}) {
  return (
    <td className={cn('num', !valor && 'subtle', className)} style={estiloCalor(valor, max, tom)}>
      {fmt(valor)}
    </td>
  )
}

const SITUACAO_VARIANT: Record<Situacao, BadgeVariant> = {
  'Ativo': 'success', 'Inativo': 'warning', 'Nunca girou': 'danger', 'Em processamento': 'info', 'Recusou': 'default',
}
export function SituacaoBadge({ situacao, mesesSemGiro }: { situacao: Situacao | string; mesesSemGiro?: number | null }) {
  const v = SITUACAO_VARIANT[situacao as Situacao] ?? 'default'
  const texto = situacao === 'Inativo' && mesesSemGiro ? `Inativo há ${mesesSemGiro} m` : situacao
  return <Badge variant={v}>{texto}</Badge>
}

const STATUS_VARIANT: Record<StatusConta, BadgeVariant> = { 'Migrado': 'success', 'Em processamento': 'warning', 'Recusou': 'danger' }
export function StatusBadge({ status }: { status: StatusConta | string }) {
  return <Badge variant={STATUS_VARIANT[status as StatusConta] ?? 'default'}>{status}</Badge>
}

export function StatusLeadBadge({ status, tipo }: { status: string; tipo: 'Aberto' | 'Fechado' }) {
  const v: BadgeVariant = status === 'Ganho' ? 'success' : status === 'Perdido' ? 'danger' : status === 'Novo' ? 'accent' : tipo === 'Aberto' ? 'info' : 'default'
  return <Badge variant={v}>{status}</Badge>
}

// Variação em texto colorido (+12,3% / −4,0%)
export function Variacao({ atual, anterior, className }: { atual: number; anterior: number; className?: string }) {
  if (!anterior) return <span className={cn('subtle', className)}>{TRACO}</span>
  const p = ((atual - anterior) / anterior) * 100
  const cor = p > 0.05 ? 'text-success' : p < -0.05 ? 'text-danger' : 'text-fg-muted'
  return <span className={cn('font-semibold tabular-nums', cor, className)}>{p > 0 ? '+' : p < 0 ? '−' : ''}{Math.abs(p).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
}

// Linha de "sem dados" em tabelas
export function LinhaVazia({ colunas, children }: { colunas: number; children?: ReactNode }) {
  return (
    <tr>
      <td colSpan={colunas} className="py-8 text-center text-sm text-fg-subtle">{children ?? 'Sem dados.'}</td>
    </tr>
  )
}

// Cabeçalho de seção dentro de uma página (1 · Resumo por assessor)
export function Secao({ numero, titulo, descricao, action }: { numero?: number | string; titulo: ReactNode; descricao?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold text-fg">
          {numero != null && <span className="mr-1.5 text-accent">{numero} ·</span>}
          {titulo}
        </h2>
        {descricao && <p className="mt-0.5 text-xs text-fg-muted">{descricao}</p>}
      </div>
      {action}
    </div>
  )
}
