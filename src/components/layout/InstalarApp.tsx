'use client'

// No Safari do iPhone (fora do modo aplicativo), ensina a adicionar à Tela de Início.
// Some ao fechar (fica guardado no aparelho) e nunca aparece quando já está instalado.
import { useSyncExternalStore } from 'react'
import { Share, X } from 'lucide-react'
import { Marca } from '@/components/ui/Marca'

const CHAVE = 'zeve-instalar-dispensado'
const ouvintes = new Set<() => void>()
const assinar = (cb: () => void) => { ouvintes.add(cb); return () => { ouvintes.delete(cb) } }
const avisar = () => ouvintes.forEach(cb => cb())

function deveMostrar(): boolean {
  try {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
    const instalado = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
    return ios && !instalado && !localStorage.getItem(CHAVE)
  } catch {
    return false
  }
}

export function InstalarApp() {
  const mostrar = useSyncExternalStore(assinar, deveMostrar, () => false)
  if (!mostrar) return null
  const fechar = () => {
    try { localStorage.setItem(CHAVE, '1') } catch {}
    avisar()
  }
  return (
    <div className="fixed inset-x-3 z-30 rounded-lg border border-line bg-surface p-3 shadow-[var(--elev-float)] lg:hidden" style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }} role="status">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg"><Marca className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1 text-dense">
          <p className="font-semibold text-fg">Use como aplicativo</p>
          <p className="text-fg-muted">
            Toque em <Share className="inline h-3.5 w-3.5 align-text-bottom" aria-label="Compartilhar" /> Compartilhar e depois em <span className="font-medium text-fg">Adicionar à Tela de Início</span>. Abre em tela cheia, sem a barra do Safari.
          </p>
        </div>
        <button type="button" onClick={fechar} className="icon-btn -mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-fg-subtle" aria-label="Fechar aviso">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
