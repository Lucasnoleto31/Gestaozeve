'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Cliente, ClienteConta } from '@/types/cliente'
import { Plus, Trash2, Save } from 'lucide-react'

const SELECT_CLASS = 'w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'

interface Props {
  cliente: Cliente
  contas: ClienteConta[]
  assessores: { id: string; nome: string }[]
  influenciadores: { id: string; nome: string; codigo: string }[]
}

export function EditarClienteForm({ cliente, contas: contasIniciais, assessores, influenciadores }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [contas, setContas] = useState(contasIniciais)
  const [novasContas, setNovasContas] = useState<{ numero_conta: string; data_abertura: string; capital_alocado: string }[]>([])

  const [form, setForm] = useState({
    nome: cliente.nome,
    email: cliente.email ?? '',
    telefone: cliente.telefone ?? '',
    data_nascimento: cliente.data_nascimento ?? '',
    sexo: cliente.sexo ?? '',
    estado_civil: cliente.estado_civil ?? '',
    estado: cliente.estado ?? '',
    profissao: cliente.profissao ?? '',
    tipo_pessoa: cliente.tipo_pessoa ?? '',
    data_habilitacao: cliente.data_habilitacao ?? '',
    perfil_investidor: cliente.perfil_investidor ?? '',
    tipo_operacao: cliente.tipo_operacao ?? '',
    corretora_origem: cliente.corretora_origem ?? '',
    patrimonio: cliente.patrimonio != null ? String(cliente.patrimonio) : '',
    perfil_genial: cliente.perfil_genial ?? '',
    situacao_conta: cliente.situacao_conta ?? '',
    assessor_id: cliente.assessor_id ?? '',
    influenciador_id: cliente.influenciador_id ?? '',
    status: cliente.status,
    observacoes: cliente.observacoes ?? '',
  })

  function set(key: string, value: string) {
    setForm((p) => ({ ...p, [key]: value }))
  }

  function handleSalvar() {
    setError('')
    startTransition(async () => {
      const supabase = createClient()

      const { error: err } = await supabase.from('clientes').update({
        nome: form.nome,
        email: form.email || null,
        telefone: form.telefone || null,
        data_nascimento: form.data_nascimento || null,
        sexo: form.sexo || null,
        estado_civil: form.estado_civil || null,
        estado: form.estado || null,
        profissao: form.profissao || null,
        tipo_pessoa: form.tipo_pessoa || null,
        data_habilitacao: form.data_habilitacao || null,
        perfil_investidor: form.perfil_investidor || null,
        tipo_operacao: form.tipo_operacao || null,
        corretora_origem: form.corretora_origem || null,
        patrimonio: form.patrimonio ? parseFloat(form.patrimonio.replace(/[^\d.,]/g, '').replace(',', '.')) || null : null,
        perfil_genial: form.perfil_genial || null,
        situacao_conta: form.situacao_conta || null,
        assessor_id: form.assessor_id || null,
        influenciador_id: form.influenciador_id || null,
        status: form.status,
        observacoes: form.observacoes || null,
      }).eq('id', cliente.id)

      if (err) { setError(err.message); return }

      // Adicionar novas contas
      const contasValidas = novasContas.filter((c) => c.numero_conta)
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

      router.push(`/clientes/${cliente.id}`)
      router.refresh()
    })
  }

  async function toggleContaAtiva(contaId: string, ativa: boolean) {
    const supabase = createClient()
    await supabase.from('cliente_contas').update({ ativa }).eq('id', contaId)
    setContas((p) => p.map((c) => c.id === contaId ? { ...c, ativa } : c))
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Dados Pessoais</CardTitle></CardHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Nome completo *" value={form.nome} onChange={(e) => set('nome', e.target.value)} required />
            <Input label="CPF" value={cliente.cpf} disabled className="opacity-50 cursor-not-allowed" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="E-mail" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            <Input label="Telefone" value={form.telefone} onChange={(e) => set('telefone', e.target.value)} />
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
              <label className="text-sm font-medium text-gray-400">Tipo de Pessoa</label>
              <select value={form.tipo_pessoa} onChange={(e) => set('tipo_pessoa', e.target.value)} className={SELECT_CLASS}>
                <option value="">—</option>
                <option value="F">Física (F)</option>
                <option value="J">Jurídica (J)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Profissão" value={form.profissao} onChange={(e) => set('profissao', e.target.value)} placeholder="Empresário" />
            <Input label="Habilitação Genial" type="date" value={form.data_habilitacao} onChange={(e) => set('data_habilitacao', e.target.value)} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dados Operacionais</CardTitle></CardHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-400">Tipo de Operação</label>
              <select value={form.tipo_operacao} onChange={(e) => set('tipo_operacao', e.target.value)} className={SELECT_CLASS}>
                <option value="">—</option>
                <option value="day_trade">Day Trade</option>
                <option value="swing_trade">Swing Trade</option>
                <option value="position">Position</option>
                <option value="todos">Todos</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Patrimônio (R$)" value={form.patrimonio} onChange={(e) => set('patrimonio', e.target.value)} placeholder="250000.00" />
            <Input label="Situação Conta" value={form.situacao_conta} onChange={(e) => set('situacao_conta', e.target.value)} placeholder="ATIVA" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-400">Perfil Genial</label>
            <select value={form.perfil_genial} onChange={(e) => set('perfil_genial', e.target.value)} className={SELECT_CLASS}>
              <option value="">—</option>
              <option value="digital">Digital</option>
              <option value="premium">Premium</option>
              <option value="sem_informacao">Sem informação</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Corretora de Origem" value={form.corretora_origem} onChange={(e) => set('corretora_origem', e.target.value)} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-400">Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={SELECT_CLASS}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="em_transferencia">Em transferência</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-400">Assessor Responsável</label>
              <select value={form.assessor_id} onChange={(e) => set('assessor_id', e.target.value)} className={SELECT_CLASS}>
                <option value="">Sem assessor</option>
                {assessores.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-400">Indicado por</label>
              <select value={form.influenciador_id} onChange={(e) => set('influenciador_id', e.target.value)} className={SELECT_CLASS}>
                <option value="">Nenhum</option>
                {influenciadores.map((i) => <option key={i.id} value={i.id}>{i.nome} (@{i.codigo})</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-400">Observações</label>
            <textarea className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" rows={3} value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contas na Genial</CardTitle>
          <Button variant="secondary" size="sm" onClick={() => setNovasContas((p) => [...p, { numero_conta: '', data_abertura: '', capital_alocado: '' }])}>
            <Plus className="w-4 h-4" /> Adicionar
          </Button>
        </CardHeader>

        <div className="space-y-2">
          {contas.map((conta) => (
            <div key={conta.id} className="flex items-center justify-between bg-gray-100 rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-mono font-medium text-gray-900">{conta.numero_conta}</p>
                <p className="text-xs text-gray-500">Capital: R$ {conta.capital_alocado?.toLocaleString('pt-BR')}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleContaAtiva(conta.id, !conta.ativa)}
                  className={`text-xs px-2 py-1 rounded-full border transition-colors ${conta.ativa ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                >
                  {conta.ativa ? 'Ativa' : 'Inativa'}
                </button>
              </div>
            </div>
          ))}

          {novasContas.map((conta, i) => (
            <div key={i} className="bg-gray-100 border border-dashed border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-500">Nova conta</span>
                <button type="button" onClick={() => setNovasContas((p) => p.filter((_, idx) => idx !== i))} className="text-gray-500 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Nº da conta" value={conta.numero_conta} onChange={(e) => setNovasContas((p) => p.map((c, idx) => idx === i ? { ...c, numero_conta: e.target.value } : c))} />
                <Input label="Abertura" type="date" value={conta.data_abertura} onChange={(e) => setNovasContas((p) => p.map((c, idx) => idx === i ? { ...c, data_abertura: e.target.value } : c))} />
                <Input label="Capital (R$)" type="number" value={conta.capital_alocado} onChange={(e) => setNovasContas((p) => p.map((c, idx) => idx === i ? { ...c, capital_alocado: e.target.value } : c))} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => router.back()}>Cancelar</Button>
        <Button onClick={handleSalvar} loading={isPending}>
          <Save className="w-4 h-4" />
          Salvar alterações
        </Button>
      </div>
    </div>
  )
}
