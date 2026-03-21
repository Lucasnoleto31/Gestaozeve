'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { recalcularScore } from './actions'
import { ClienteDadosCHS } from '@/types/cliente'
import { Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  clienteId: string
  dados: ClienteDadosCHS | null
}

const SELECT_CLASS = 'w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'

export function AtualizarDadosCHSModal({ clienteId, dados }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [form, setForm] = useState({
    ultima_operacao: dados?.ultima_operacao ?? '',
    receita_periodo_atual: dados?.receita_periodo_atual?.toString() ?? '0',
    receita_periodo_anterior: dados?.receita_periodo_anterior?.toString() ?? '0',
    volume_periodo_atual: dados?.volume_periodo_atual?.toString() ?? '0',
    volume_periodo_anterior: dados?.volume_periodo_anterior?.toString() ?? '0',
    score_engajamento: dados?.score_engajamento?.toString() ?? '50',
    comportamento_risco: dados?.comportamento_risco ?? 'segue_regras',
    lotes_girados_mes: dados?.lotes_girados_mes?.toString() ?? '0',
    lotes_zerados_mes: dados?.lotes_zerados_mes?.toString() ?? '0',
    dias_operados_mes: dados?.dias_operados_mes?.toString() ?? '0',
    receita_acumulada: dados?.receita_acumulada?.toString() ?? '0',
  })

  function set(key: string, value: string) {
    setForm((p) => ({ ...p, [key]: value }))
  }

  function handleSalvar() {
    startTransition(async () => {
      const supabase = createClient()

      await supabase.from('cliente_dados_chs').upsert({
        cliente_id: clienteId,
        ultima_operacao: form.ultima_operacao || null,
        receita_periodo_atual: parseFloat(form.receita_periodo_atual) || 0,
        receita_periodo_anterior: parseFloat(form.receita_periodo_anterior) || 0,
        volume_periodo_atual: parseFloat(form.volume_periodo_atual) || 0,
        volume_periodo_anterior: parseFloat(form.volume_periodo_anterior) || 0,
        score_engajamento: parseInt(form.score_engajamento) || 50,
        comportamento_risco: form.comportamento_risco,
        lotes_girados_mes: parseFloat(form.lotes_girados_mes) || 0,
        lotes_zerados_mes: parseFloat(form.lotes_zerados_mes) || 0,
        dias_operados_mes: parseInt(form.dias_operados_mes) || 0,
        receita_acumulada: parseFloat(form.receita_acumulada) || 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'cliente_id' })

      await recalcularScore(clienteId)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="secondary" size="sm" className="w-full mt-4" onClick={() => setOpen(true)}>
        <Settings className="w-4 h-4" />
        Atualizar dados operacionais
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Dados operacionais do mês</h3>
            <p className="text-xs text-gray-500 mb-5">Preencha os dados do período atual. O score e os gráficos serão atualizados automaticamente.</p>

            <div className="space-y-5">
              {/* Operações */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Operações</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Última operação" type="date" value={form.ultima_operacao} onChange={(e) => set('ultima_operacao', e.target.value)} />
                  <Input label="Dias operados no mês" type="number" value={form.dias_operados_mes} onChange={(e) => set('dias_operados_mes', e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <Input label="Lotes girados no mês" type="number" value={form.lotes_girados_mes} onChange={(e) => set('lotes_girados_mes', e.target.value)} />
                  <Input label="Lotes zerados no mês" type="number" value={form.lotes_zerados_mes} onChange={(e) => set('lotes_zerados_mes', e.target.value)} />
                </div>
              </div>

              {/* Receita */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Receita</p>
                <div className="grid grid-cols-3 gap-3">
                  <Input label="Receita acumulada (R$)" type="number" value={form.receita_acumulada} onChange={(e) => set('receita_acumulada', e.target.value)} />
                  <Input label="Receita atual (R$)" type="number" value={form.receita_periodo_atual} onChange={(e) => set('receita_periodo_atual', e.target.value)} />
                  <Input label="Receita anterior (R$)" type="number" value={form.receita_periodo_anterior} onChange={(e) => set('receita_periodo_anterior', e.target.value)} />
                </div>
              </div>

              {/* Volume CHS */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Volume (para CHS)</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Volume atual (lotes)" type="number" value={form.volume_periodo_atual} onChange={(e) => set('volume_periodo_atual', e.target.value)} />
                  <Input label="Volume anterior (lotes)" type="number" value={form.volume_periodo_anterior} onChange={(e) => set('volume_periodo_anterior', e.target.value)} />
                </div>
              </div>

              {/* Engajamento e Risco */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Engajamento & Risco</p>
                <div className="mb-3">
                  <label className="text-sm font-medium text-gray-400 block mb-1.5">
                    Score de engajamento (0–100): <span className="text-blue-400">{form.score_engajamento}</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={form.score_engajamento}
                    onChange={(e) => set('score_engajamento', e.target.value)}
                    className="w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Sem engajamento</span>
                    <span>Alto engajamento</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-400">Comportamento de risco</label>
                  <select value={form.comportamento_risco} onChange={(e) => set('comportamento_risco', e.target.value)} className={SELECT_CLASS}>
                    <option value="segue_regras">Segue as regras de risco</option>
                    <option value="oscila">Comportamento oscilante</option>
                    <option value="excesso_risco">Excesso de risco</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSalvar} loading={isPending}>
                Salvar e Recalcular Score
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
