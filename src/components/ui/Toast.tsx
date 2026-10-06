'use client'

// Avisos curtos de resultado de ação (salvo, importado, erro). Sem lib.
// useToast().avisar({ titulo, detalhe?, tom? }) — some sozinho em 4 s.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Toast = { id: number; titulo: string; detalhe?: string; tom?: 'gain' | 'loss' | 'neutral' }
type Ctx = { avisar: (t: Omit<Toast, 'id'>) => void; fechar: (id: number) => void }

const ToastContext = createContext<Ctx>({ avisar: () => {}, fechar: () => {} })
export const useToast = () => useContext(ToastContext)

const ICON = { gain: CheckCircle2, loss: AlertCircle, neutral: Info } as const
const COR = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-fg-muted' } as const

export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<Toast[]>([])
  const seq = useRef(0)

  const fechar = useCallback((id: number) => setItens(x => x.filter(t => t.id !== id)), [])
  const avisar = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current
    setItens(x => [...x.slice(-3), { ...t, id }])
    window.setTimeout(() => fechar(id), t.tom === 'loss' ? 7000 : 4000)
  }, [fechar])

  const value = useMemo(() => ({ avisar, fechar }), [avisar, fechar])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6" aria-live="polite">
        {itens.map(t => {
          const tom = t.tom ?? 'neutral'
          const Icon = ICON[tom]
          return (
            <div key={t.id} className="panel modal-panel pointer-events-auto flex w-full max-w-sm items-start gap-3 px-4 py-3" role="status">
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', COR[tom])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-dense font-medium text-fg">{t.titulo}</p>
                {t.detalhe && <p className="mt-0.5 text-label text-fg-muted">{t.detalhe}</p>}
              </div>
              <button type="button" className="icon-btn -mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-fg-subtle hover:text-fg" onClick={() => fechar(t.id)} aria-label="Fechar aviso">
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
