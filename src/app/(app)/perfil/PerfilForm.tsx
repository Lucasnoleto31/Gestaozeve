'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User, Mail, Lock, CheckCircle, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react'

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

function FormSection({ title, icon: Icon, children }: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
    >
      <div
        className="flex items-center gap-3 px-6 py-4"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--blue-dim)' }}
        >
          <Icon className="w-4 h-4" style={{ color: 'var(--blue)' }} />
        </div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function StatusBanner({ status }: { status: Status }) {
  if (!status) return null
  const isSuccess = status.type === 'success'
  return (
    <div
      className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-medium animate-fade-in"
      style={
        isSuccess
          ? { background: 'rgba(5,150,105,0.07)', border: '1px solid rgba(5,150,105,0.2)', color: '#065f46' }
          : { background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)', color: '#991b1b' }
      }
    >
      {isSuccess
        ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
        : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
      {status.msg}
    </div>
  )
}

function InputField({
  label, type = 'text', value, onChange, placeholder, disabled, rightEl,
}: {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  rightEl?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-gray-400 focus:outline-none transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: disabled ? 'var(--surface-3)' : '#FFFFFF',
            border: '1.5px solid var(--border)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            paddingRight: rightEl ? '2.75rem' : undefined,
          }}
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--blue)'
            e.target.style.boxShadow = '0 0 0 3px rgba(23,100,244,0.10)'
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'var(--border)'
            e.target.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
          }}
        />
        {rightEl && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightEl}</div>
        )}
      </div>
    </div>
  )
}

function SaveButton({ loading, disabled }: { loading: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
      style={{
        background: 'linear-gradient(135deg, var(--blue) 0%, var(--blue-dark) 100%)',
        boxShadow: '0 4px 14px rgba(23,100,244,0.22)',
      }}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {loading ? 'Salvando...' : 'Salvar alterações'}
    </button>
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
    <FormSection title="Informações pessoais" icon={User}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          label="Nome completo"
          value={nome}
          onChange={setNome}
          placeholder="Seu nome completo"
        />
        <StatusBanner status={status} />
        <div className="flex justify-end">
          <SaveButton loading={loading} disabled={!nome.trim() || nome.trim() === nomeInicial} />
        </div>
      </form>
    </FormSection>
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
    <FormSection title="Endereço de e-mail" icon={Mail}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          label="E-mail"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="seu@email.com"
        />
        <p className="text-xs text-gray-400">
          Um e-mail de confirmação será enviado para o novo endereço antes da alteração entrar em vigor.
        </p>
        <StatusBanner status={status} />
        <div className="flex justify-end">
          <SaveButton loading={loading} disabled={!email.trim() || email.trim() === emailAtual} />
        </div>
      </form>
    </FormSection>
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

  const EyeToggle = ({ show, onToggle }: { show: boolean; onToggle: () => void }) => (
    <button type="button" onClick={onToggle} className="text-gray-400 hover:text-gray-600 transition-colors">
      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  )

  return (
    <FormSection title="Segurança" icon={Lock}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          label="Nova senha"
          type={showNova ? 'text' : 'password'}
          value={nova}
          onChange={setNova}
          placeholder="Mínimo 8 caracteres"
          rightEl={<EyeToggle show={showNova} onToggle={() => setShowNova(!showNova)} />}
        />
        {senhaFraca && (
          <p className="text-xs text-red-500 -mt-2">A senha deve ter pelo menos 8 caracteres.</p>
        )}

        <InputField
          label="Confirmar nova senha"
          type={showConfirmar ? 'text' : 'password'}
          value={confirmar}
          onChange={setConfirmar}
          placeholder="Repita a nova senha"
          rightEl={<EyeToggle show={showConfirmar} onToggle={() => setShowConfirmar(!showConfirmar)} />}
        />
        {naoConfere && (
          <p className="text-xs text-red-500 -mt-2">As senhas não coincidem.</p>
        )}

        <StatusBanner status={status} />
        <div className="flex justify-end">
          <SaveButton
            loading={loading}
            disabled={!nova || !confirmar || nova !== confirmar || nova.length < 8}
          />
        </div>
      </form>
    </FormSection>
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
