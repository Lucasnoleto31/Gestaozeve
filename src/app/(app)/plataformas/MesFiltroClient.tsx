'use client'

import { useRouter } from 'next/navigation'

export function MesFiltroClient({ mesAtual }: { mesAtual: string }) {
  const router = useRouter()
  return (
    <input
      type="month"
      className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500"
      value={mesAtual}
      onChange={(e) => router.push(`/plataformas?mes=${e.target.value}`)}
    />
  )
}
