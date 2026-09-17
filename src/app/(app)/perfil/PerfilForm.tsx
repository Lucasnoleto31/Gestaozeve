'use client'

import { useState } from 'react'
import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'

interface Props {
  profile: {
    id: string
    nome: string
    email: string
    role: string
    created_at: string
  }
}

type Status = { type: 'success' | 'error'; msg: string } | null

function StatusBanner({ status }: { status: Status }) {
  if (!status) return null
  return <Alert tone={status.type === 'success' ? 'success' : 'danger'} className="animate-fade-in">{status.msg}</Alert>
}

// Fora dos componentes de seção: criar componentes durante o render reinicia o estado deles.
function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="text-fg-subtle hover:text-fg" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  )
}

function SenhaField({ label, value, onChange, placeholder, show, onToggle, error }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string
  show: boolean; onToggle: () => void; error?: string
}) {
  return (
    <Field label={label} error={error}>
      <div className="relative">
        <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} className="w-full pr-10" autoComplete="new-password" />
        <div className="absolute right-3 top-1/2 -translate-y-1/2"><EyeToggle show={show} onToggle={onToggle} /></div>
      </div>
    </Field>
  )
}

// ── Nome ──────────────────────────────────────────────────────────────────────

function NomeSection({ profileId, nomeInicial }: { profileId: string; nomeInicial: string }) {
  const [nome, setNome] = useState(nomeInicial)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() || nome.trim() === nomeInicial) return
    setLoading(true)
    setStatus(null)
    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({ nome: nome.trim() }).eq('id', profileId)
    setLoading(false)
    if (error) {
      setStatus({ type: 'error', msg: 'Erro ao atualizar nome. Tente novamente.' })
    } else {
      setStatus({ type: 'success', msg: 'Nome atualizado com sucesso!' })
    }
  }

  return (
    <Panel icon={User} title="Informações pessoais">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nome completo">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo" className="w-full" />
        </Field>
        <StatusBanner status={status} />
        <div className="flex justify-end">
          <Button type="submit" loading={loading} disabled={!nome.trim() || nome.trim() === nomeInicial}>Salvar alterações</Button>
        </div>
      </form>
    </Panel>
  )
}

// ── Email ─────────────────────────────────────────────────────────────────────

function EmailSection({ emailAtual }: { emailAtual: string }) {
  const [email, setEmail] = useState(emailAtual)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || email.trim() === emailAtual) return
    setLoading(true)
    setStatus(null)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ email: email.trim() })
    setLoading(false)
    if (error) {
      setStatus({ type: 'error', msg: error.message ?? 'Erro ao atualizar e-mail.' })
    } else {
      setStatus({ type: 'success', msg: 'Confirmação enviada para o novo e-mail. Verifique sua caixa de entrada.' })
    }
  }

  return (
    <Panel icon={Mail} title="Endereço de e-mail">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="E-mail" hint="Um e-mail de confirmação será enviado para o novo endereço antes da alteração entrar em vigor.">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="w-full" />
        </Field>
        <StatusBanner status={status} />
        <div className="flex justify-end">
          <Button type="submit" loading={loading} disabled={!email.trim() || email.trim() === emailAtual}>Salvar alterações</Button>
        </div>
      </form>
    </Panel>
  )
}

// ── Senha ─────────────────────────────────────────────────────────────────────

function SenhaSection() {
  const [nova, setNova] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [showNova, setShowNova] = useState(false)
  const [showConfirmar, setShowConfirmar] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  const senhaFraca = nova.length > 0 && nova.length < 8
  const naoConfere = confirmar.length > 0 && nova !== confirmar

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nova || nova !== confirmar || nova.length < 8) return
    setLoading(true)
    setStatus(null)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: nova })
    setLoading(false)
    if (error) {
      setStatus({ type: 'error', msg: error.message ?? 'Erro ao atualizar senha.' })
    } else {
      setStatus({ type: 'success', msg: 'Senha alterada com sucesso!' })
      setNova('')
      setConfirmar('')
    }
  }

  return (
    <Panel icon={Lock} title="Segurança">
      <form onSubmit={handleSubmit} className="space-y-4">
        <SenhaField label="Nova senha" value={nova} onChange={setNova} placeholder="Mínimo 8 caracteres"
          show={showNova} onToggle={() => setShowNova(!showNova)}
          error={senhaFraca ? 'A senha deve ter pelo menos 8 caracteres.' : undefined} />
        <SenhaField label="Confirmar nova senha" value={confirmar} onChange={setConfirmar} placeholder="Repita a nova senha"
          show={showConfirmar} onToggle={() => setShowConfirmar(!showConfirmar)}
          error={naoConfere ? 'As senhas não coincidem.' : undefined} />
        <StatusBanner status={status} />
        <div className="flex justify-end">
          <Button type="submit" loading={loading} disabled={!nova || !confirmar || nova !== confirmar || nova.length < 8}>Alterar senha</Button>
        </div>
      </form>
    </Panel>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function PerfilForm({ profile }: Props) {
  return (
    <div className="space-y-5">
      <NomeSection profileId={profile.id} nomeInicial={profile.nome} />
      <EmailSection emailAtual={profile.email} />
      <SenhaSection />
    </div>
  )
}
