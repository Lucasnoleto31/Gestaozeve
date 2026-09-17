'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'

export function NovoUsuarioButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    nome: '',
    email: '',
    senha: '',
    role: 'vendedor',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Erro ao criar usuário')
      setLoading(false)
      return
    }

    setLoading(false)
    setOpen(false)
    setForm({ nome: '', email: '', senha: '', role: 'vendedor' })
    router.refresh()
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Novo usuário
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Novo usuário" subtitle="O usuário recebe acesso imediato com a senha definida aqui."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" form="form-novo-usuario" loading={loading}>Criar usuário</Button>
          </>
        }>
        <form id="form-novo-usuario" onSubmit={handleSubmit} className="space-y-4">
          <Input id="novo-nome" label="Nome completo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required autoFocus />
          <Input id="novo-email" label="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <Input id="novo-senha" label="Senha" type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} required minLength={6} hint="Mínimo de 6 caracteres." />
          <Select id="novo-role" label="Função" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
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
