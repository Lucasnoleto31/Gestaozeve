'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Copy, Check } from 'lucide-react'

export function CopyLinkButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(window.location.origin + text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleCopy}>
      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
      {copied ? 'Copiado!' : 'Copiar'}
    </Button>
  )
}
