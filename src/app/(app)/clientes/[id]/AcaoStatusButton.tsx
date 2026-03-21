'use client'

import { useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'

export function AcaoStatusButton({ acaoId, clienteId }: { acaoId: string; clienteId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function atualizar(status: string) {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('cliente_acoes').update({ status }).eq('id', acaoId)
      router.refresh()
    })
  }

  return (
    <div className="flex gap-1 flex-shrink-0">
      <Button variant="ghost" size="sm" onClick={() => atualizar('concluida')} title="Concluir" loading={isPending}>
        <Check className="w-4 h-4 text-emerald-400" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => atualizar('ignorada')} title="Ignorar">
        <X className="w-4 h-4 text-gray-500" />
      </Button>
    </div>
  )
}
