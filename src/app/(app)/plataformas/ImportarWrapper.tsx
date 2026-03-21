'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Upload } from 'lucide-react'
import { ImportarPlataformasModal } from './ImportarPlataformasModal'

export function ImportarWrapper() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Upload className="w-4 h-4" />
        Importar Excel
      </Button>
      <ImportarPlataformasModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
