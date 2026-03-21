'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'

export function NovaNotaForm({ clienteId }: { clienteId: string }) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return

    startTransition(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('id').eq('user_id', user?.id ?? '').single()

      await supabase.from('cliente_notas').insert({
        cliente_id: clienteId,
        autor_id: profile?.id ?? null,
        conteudo: texto.trim(),
      })

      setTexto('')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Adicionar interação ou observação..."
        className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <Button type="submit" size="sm" loading={isPending} disabled={!texto.trim()}>
        <Send className="w-4 h-4" />
      </Button>
    </form>
  )
}
