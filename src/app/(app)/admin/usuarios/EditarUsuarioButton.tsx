'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'

interface Usuario {
  id: string
  user_id: string
  nome: string
  email: string
  role: string
  ativo: boolean
}

export function EditarUsuarioButton({ usuario }: { usuario: Usuario }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    nome: usuario.nome,
    email: usuario.email,
    role: usuario.role,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/admin/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: usuario.id, userId: usuario.user_id, ...form }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Erro ao atualizar usuário')
      setLoading(false)
      return
    }

    setLoading(false)
    setOpen(false)
    router.refresh()
  }

  const formId = `form-editar-${usuario.id}`

  return (
    <>
      <IconButton tone="accent" title="Editar usuário" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
      </IconButton>

      <Modal open={open} onClose={() => setOpen(false)} title="Editar usuário" subtitle={usuario.email}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" form={formId} loading={loading}>Salvar</Button>
          </>
        }>
        <form id={formId} onSubmit={handleSubmit} className="space-y-4">
          <Input id={`${formId}-nome`} label="Nome completo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          <Input id={`${formId}-email`} label="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <Select id={`${formId}-role`} label="Função" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="vendedor">Assessor</option>
            <option value="influenciador">Influenciador</option>
            <option value="admin">Administrador</option>
          </Select>
          {error && <Alert tone="danger">{error}</Alert>}
        </form>
      </Modal>
    </>
  )
}
