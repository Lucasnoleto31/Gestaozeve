'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { recalcularScore } from '../actions'
import { RefreshCw } from 'lucide-react'

export function RecalcularScoreButton({ clienteId }: { clienteId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await recalcularScore(clienteId)
    })
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleClick} loading={isPending} title="Recalcular score">
      <RefreshCw className="w-4 h-4" />
    </Button>
  )
}
