'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'

interface Props {
  userId: string
  nome: string
}

export function DeletarUsuarioButton({ userId, nome }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleDeletar() {
    setLoading(true)
    setError('')

    const res = await fetch('/api/admin/usuarios', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Erro ao excluir usuário')
      setLoading(false)
      return
    }

    setLoading(false)
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <IconButton tone="danger" title="Excluir usuário" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
      </IconButton>

      <Modal open={open} onClose={() => setOpen(false)} size="sm" title="Excluir usuário"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="danger" loading={loading} onClick={handleDeletar}>Excluir</Button>
          </>
        }>
        <p className="text-sm text-fg">
          Tem certeza que deseja excluir <span className="font-semibold">{nome}</span>?
        </p>
        <p className="mt-1 text-xs text-fg-muted">
          Esta ação é irreversível. O usuário perde o acesso imediatamente.
        </p>
        {error && <Alert tone="danger" className="mt-4">{error}</Alert>}
      </Modal>
    </>
  )
}
