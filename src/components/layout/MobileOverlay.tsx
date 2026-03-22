'use client'

import { useSidebar } from '@/lib/sidebar-context'

export function MobileOverlay() {
  const { isOpen, close } = useSidebar()
  if (!isOpen) return null
  return (
    <div
      className="fixed inset-0 bg-black/50 z-30 lg:hidden"
      onClick={close}
    />
  )
}
