'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export function DataRefPicker({ valor }: { valor: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  return (
    <label className="flex items-center gap-2">
      <span className="label whitespace-nowrap">Data de referência</span>
      <input
        type="date"
        className="field-sm"
        value={valor}
        onChange={e => {
          const p = new URLSearchParams(params.toString())
          if (e.target.value) p.set('ref', e.target.value); else p.delete('ref')
          router.push(`${pathname}?${p.toString()}`)
        }}
      />
    </label>
  )
}
