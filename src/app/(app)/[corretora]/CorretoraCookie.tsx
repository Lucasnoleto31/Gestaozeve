'use client'

import { useEffect } from 'react'
import { CORRETORA_COOKIE, type Corretora } from '@/lib/corretoras'

// Guarda a última corretora aberta (o menu aponta pra ela nas páginas gerais)
export function CorretoraCookie({ corretora }: { corretora: Corretora }) {
  useEffect(() => {
    document.cookie = `${CORRETORA_COOKIE}=${corretora}; path=/; max-age=31536000; SameSite=Lax`
  }, [corretora])
  return null
}
