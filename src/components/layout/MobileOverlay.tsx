'use client'

import { useSidebar } from '@/lib/sidebar-context'

// Escurece o conteúdo (inclusive a barra do topo) enquanto o menu está aberto no mobile
export function MobileOverlay() {
  const { isOpen, close } = useSidebar()
  if (!isOpen) return null
  return (
    <div
      className="fixed inset-0 z-[35] bg-black/50 lg:hidden"
      onClick={close}
      aria-hidden="true"
    />
  )
}
