'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { X, Plus, Trash2 } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  assessores: { id: string; nome: string }[]
}

const SELECT_CLASS = 'w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'

export function NovoClienteModal({ open, onClose, assessores }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState(1)
  const [contas, setContas] = useState([{ numero_conta: '', data_abertura: '', capital_alocado: '' }])

  const [form, setForm] = useState({
    cpf: '',
    nome: '',
    email: '',
    telefone: '',
    data_nascimento: '',
    sexo: '',
    estado_civil: '',
    estado: '',
    perfil_investidor: '',
    tipo_operacao: '',
    corretora_origem: '',
    assessor_id: '',
    status: 'ativo',
    observacoes: '',
  })

  function set(key: string, value: string) {
    setForm((p) => ({ ...p, [key]: value }))
  }

  function addConta() {
    setContas((p) => [...p, { numero_conta: '', data_abertura: '', capital_alocado: '' }])
  }

  function removeConta(i: number) {
    setContas((p) => p.filter((_, idx) => idx !== i))
  }

  function updateConta(i: number, key: string, value: string) {
    setContas((p) => p.map((c, idx) => idx === i ? { ...c, [key]: value } : c))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (step === 1) { setStep(2); return }

    setError('')
    setLoading(true)

    const supabase = createClient()

    const cpfLimpo = form.cpf.replace(/\D/g, '')
    if (cpfLimpo.length !== 11) {
      setError('CPF inválido.')
      setLoading(false)
      return
    }

    const { data: cliente, error: clienteError } = await supabase
      .from('clientes')
      .insert({
        ...form,
        cpf: cpfLimpo,
        assessor_id: form.assessor_id || null,
        sexo: form.sexo || null,
        estado_civil: form.estado_civil || null,
        estado: form.estado || null,
        perfil_investidor: form.perfil_investidor || null,
        tipo_operacao: form.tipo_operacao || null,
        corretora_origem: form.corretora_origem || null,
        data_nascimento: form.data_nascimento || null,
        observacoes: form.observacoes || null,
      })
      .select('id')
      .single()

    if (clienteError) {
      setError(clienteError.message.includes('unique') ? 'Já existe um cliente com este CPF.' : clienteError.message)
      setLoading(false)
      return
    }

    const contasValidas = contas.filter((c) => c.numero_conta)
    if (contasValidas.length > 0) {
      await supabase.from('cliente_contas').insert(
        contasValidas.map((c) => ({
          cliente_id: cliente.id,
          numero_conta: c.numero_conta,
          data_abertura: c.data_abertura || null,
          capital_alocado: parseFloat(c.capital_alocado) || 0,
        }))
      )
    }

    setLoading(false)
    onClose()
    setStep(1)
    setForm({ cpf: '', nome: '', email: '', telefone: '', data_nascimento: '', sexo: '', estado_civil: '', estado: '', perfil_investidor: '', tipo_operacao: '', corretora_origem: '', assessor_id: '', status: 'ativo', observacoes: '' })
    setContas([{ numero_conta: '', data_abertura: '', capital_alocado: '' }])
    router.refresh()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white border border-gray-200 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Novo Cliente</h2>
            <p className="text-xs text-gray-500">{step === 1 ? 'Dados pessoais e operacionais' : 'Contas na Genial'}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {[1, 2].map((s) => (
                <div key={s} className={`w-6 h-1.5 rounded-full ${step >= s ? 'bg-blue-500' : 'bg-gray-700'}`} />
              ))}
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-900"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {step === 1 && (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Nome completo *" value={form.nome} onChange={(e) => set('nome', e.target.value)} required placeholder="João Silva" />
                <Input label="CPF *" value={form.cpf} onChange={(e) => set('cpf', e.target.value)} required placeholder="000.000.000-00" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="E-mail" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="joao@email.com" />
                <Input label="Telefone" value={form.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="(11) 99999-9999" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Input label="Data de nascimento" type="date" value={form.data_nascimento} onChange={(e) => set('data_nascimento', e.target.value)} />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-400">Sexo</label>
                  <select value={form.sexo} onChange={(e) => set('sexo', e.target.value)} className={SELECT_CLASS}>
                    <option value="">—</option>
                    <option value="masculino">Masculino</option>
                    <option value="feminino">Feminino</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-400">Estado civil</label>
                  <select value={form.estado_civil} onChange={(e) => set('estado_civil', e.target.value)} className={SELECT_CLASS}>
                    <option value="">—</option>
                    <option value="solteiro">Solteiro</option>
                    <option value="casado">Casado</option>
                    <option value="divorciado">Divorciado</option>
                    <option value="viuvo">Viúvo</option>
                    <option value="uniao_estavel">União Estável</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Estado" value={form.estado} onChange={(e) => set('estado', e.target.value)} placeholder="SP" />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-400">Perfil Investidor</label>
                  <select value={form.perfil_investidor} onChange={(e) => set('perfil_investidor', e.target.value)} className={SELECT_CLASS}>
                    <option value="">—</option>
                    <option value="conservador">Conservador</option>
                    <option value="moderado">Moderado</option>
                    <option value="arrojado">Arrojado</option>
                    <option value="agressivo">Agressivo</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-400">Tipo de operação</label>
                  <select value={form.tipo_operacao} onChange={(e) => set('tipo_operacao', e.target.value)} className={SELECT_CLASS}>
                    <option value="">—</option>
                    <option value="day_trade">Day Trade</option>
                    <option value="swing_trade">Swing Trade</option>
                    <option value="position">Position</option>
                    <option value="todos">Todos</option>
                  </select>
                </div>
                <Input label="Corretora de origem" value={form.corretora_origem} onChange={(e) => set('corretora_origem', e.target.value)} placeholder="XP, Rico, Clear..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-400">Assessor responsável</label>
                  <select value={form.assessor_id} onChange={(e) => set('assessor_id', e.target.value)} className={SELECT_CLASS}>
                    <option value="">Sem assessor</option>
                    {assessores.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-400">Status</label>
                  <select value={form.status} onChange={(e) => set('status', e.target.value)} className={SELECT_CLASS}>
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                    <option value="em_transferencia">Em transferência</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-400">Observações</label>
                <textarea className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" rows={2} value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">Adicione as contas do cliente na Genial. Um cliente pode ter múltiplas contas.</p>
              {contas.map((conta, i) => (
                <div key={i} className="bg-gray-100 border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-400">Conta {i + 1}</span>
                    {contas.length > 1 && (
                      <button type="button" onClick={() => removeConta(i)} className="text-gray-500 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Input label="Nº da conta *" value={conta.numero_conta} onChange={(e) => updateConta(i, 'numero_conta', e.target.value)} placeholder="1234567" />
                    <Input label="Data de abertura" type="date" value={conta.data_abertura} onChange={(e) => updateConta(i, 'data_abertura', e.target.value)} />
                    <Input label="Capital alocado (R$)" type="number" value={conta.capital_alocado} onChange={(e) => updateConta(i, 'capital_alocado', e.target.value)} placeholder="0,00" />
                  </div>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={addConta}>
                <Plus className="w-4 h-4" /> Adicionar conta
              </Button>
            </div>
          )}

          {error && (
            <div className="mx-6 bg-red-900/30 border border-red-700/50 rounded-lg px-3 py-2">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="flex gap-3 p-6 pt-4 border-t border-gray-200">
            {step === 2 && <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep(1)}>Voltar</Button>}
            <Button type="button" variant="secondary" className={step === 1 ? 'flex-1' : ''} onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" loading={loading}>
              {step === 1 ? 'Próximo →' : 'Cadastrar Cliente'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
