'use client'

import { useEffect } from 'react'
import { ErrorState } from '@/components/ui/ErrorState'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  const detalhe = /statement timeout/i.test(error.message)
    ? 'O banco demorou mais do que o limite para responder. Tente de novo em instantes.'
    : error.message
  return <ErrorState detalhe={detalhe} onRetry={reset} />
}
