'use client'

import { useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { TrendingUp, CheckCircle } from 'lucide-react'

export default function RefPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = use(params)
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ nome: '', email: '', telefone: '' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()

    const { data: influenciador } = await supabase
      .from('influenciadores')
      .select('id')
      .eq('codigo', codigo)
      .single()

    if (!influenciador) {
      setError('Este link não é válido ou expirou.')
      setLoading(false)
      return
    }

    const { data: etapas } = await supabase
      .from('funil_etapas')
      .select('id')
      .order('ordem')
      .limit(1)

    const { error: insertError } = await supabase.from('leads').insert({
      nome: form.nome,
      email: form.email,
      telefone: form.telefone,
      origem: `influenciador:${codigo}`,
      influenciador_id: influenciador.id,
      etapa_id: etapas?.[0]?.id ?? null,
      status: 'ativo',
    })

    if (insertError) {
      setError('Não foi possível enviar. Verifique sua conexão e tente novamente.')
      setLoading(false)
      return
    }

    setStep('success')
    setLoading(false)
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-emerald-600/20 border border-emerald-600/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Solicitação enviada!</h1>
          <p className="text-gray-500 text-sm">
            Um assessor especializado entrará em contato em até 24 horas pelo WhatsApp informado.
          </p>
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-400">ZeveAI — Assessoria de Investimentos</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-slate-900" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900">ZeveAI</h1>
            <p className="text-sm text-gray-500 mt-1">Assessoria especializada para traders</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Fale com um especialista</h2>
          <p className="text-sm text-gray-500 mb-6">
            Preencha seus dados e um assessor especializado em traders entrará em contato em até 24 horas.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Nome completo"
              placeholder="Seu nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              required
            />
            <Input
              label="E-mail"
              type="email"
              placeholder="seu@email.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              label="WhatsApp"
              placeholder="(11) 99999-9999"
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              required
            />

            {error && (
              <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-3 py-2">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Solicitar assessoria gratuita
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
