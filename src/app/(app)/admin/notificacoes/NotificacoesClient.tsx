'use client'

import { useState } from 'react'
import { Bell, Send, CheckCircle, AlertTriangle, Clock, TrendingDown, RefreshCw } from 'lucide-react'

const tipoConfig: Record<string, { label: string; cor: string; icone: string }> = {
  risco:              { label: 'Score em Risco',         cor: 'text-red-500',    icone: '🔴' },
  followup_atrasado:  { label: 'Follow-up Atrasado',     cor: 'text-amber-500',  icone: '📅' },
  sem_operar_30:      { label: '30 dias sem operar',     cor: 'text-amber-500',  icone: '⏰' },
  sem_operar_60:      { label: '60 dias sem operar',     cor: 'text-orange-500', icone: '⚠️' },
  sem_operar_90:      { label: '90 dias sem operar',     cor: 'text-red-600',    icone: '🚨' },
}

function formatarData(dt: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(dt))
}

interface Log {
  id: string
  tipo: string
  enviado_em: string
  canal: string
  cliente: { nome: string } | null
  assessor: { nome: string } | null
}

interface Props {
  logs: Log[]
  contagem: Record<string, number>
}

export function NotificacoesClient({ logs, contagem }: Props) {
  const [disparando, setDisparando] = useState(false)
  const [resultado, setResultado] = useState<{ enviados: number; erros: number; detalhes: string[] } | null>(null)
  const [erro, setErro] = useState('')

  async function dispararAgora() {
    if (!confirm('Disparar notificações agora para todos os assessores? Esta ação enviará e-mails reais.')) return
    setDisparando(true)
    setResultado(null)
    setErro('')
    try {
      const res = await fetch('/api/cron/notificacoes')
      const data = await res.json()
      if (data.ok) {
        setResultado({ enviados: data.enviados, erros: data.erros, detalhes: data.detalhes ?? [] })
      } else {
        setErro(data.error ?? 'Erro desconhecido')
      }
    } catch (e) {
      setErro(String(e))
    }
    setDisparando(false)
  }

  const totalEnviado = Object.values(contagem).reduce((a, b) => a + b, 0)

  return (
    <div>
      {/* Hero */}
      <div
        className="relative overflow-hidden px-8 pt-10 pb-8"
        style={{ background: 'linear-gradient(140deg, #0A1628 0%, #0F2550 50%, #1764F4 100%)' }}
      >
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4 mb-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300 mb-1.5">Sistema</p>
              <h1 className="text-2xl font-bold text-white tracking-tight">Notificações</h1>
              <p className="text-sm text-blue-100/60 mt-1">
                Alertas automáticos para assessores — rodam diariamente às 8h
              </p>
            </div>
            <button
              onClick={dispararAgora}
              disabled={disparando}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-all"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              {disparando
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Disparando...</>
                : <><Send className="w-4 h-4" /> Disparar agora</>
              }
            </button>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Object.entries(tipoConfig).map(([tipo, cfg]) => (
              <div key={tipo} className="rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <p className="text-xs text-white/50 mb-1">{cfg.icone} {cfg.label}</p>
                <p className="text-2xl font-bold text-white">{contagem[tipo] ?? 0}</p>
                <p className="text-xs text-white/40">enviados</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Resultado do disparo manual */}
      {resultado && (
        <div className="mx-6 mt-4 rounded-xl p-4" style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <p className="text-sm font-semibold text-green-800">
              {resultado.enviados} notificação{resultado.enviados !== 1 ? 'ões' : ''} enviada{resultado.enviados !== 1 ? 's' : ''}
              {resultado.erros > 0 && ` · ${resultado.erros} erro${resultado.erros > 1 ? 's' : ''}`}
            </p>
          </div>
          {resultado.detalhes.length > 0 && (
            <ul className="text-xs text-green-700 space-y-0.5 ml-6">
              {resultado.detalhes.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          )}
        </div>
      )}
      {erro && (
        <div className="mx-6 mt-4 rounded-xl p-4" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
          <p className="text-sm font-semibold text-red-700">Erro: {erro}</p>
        </div>
      )}

      {/* Tabela de logs */}
      <div className="p-6">
        <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--border)' }}>
          <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <Bell className="w-4 h-4 text-gray-400" />
            <p className="text-sm font-semibold text-gray-700">Histórico de envios</p>
            <span className="ml-auto text-xs text-gray-400">{logs.length} registros</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--surface-3)', borderBottom: '1px solid var(--border)' }}>
                  {['Tipo', 'Cliente', 'Assessor', 'Canal', 'Enviado em'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">
                      Nenhuma notificação enviada ainda.
                    </td>
                  </tr>
                )}
                {logs.map(log => {
                  const cfg = tipoConfig[log.tipo]
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${cfg?.cor ?? 'text-gray-500'}`}>
                          {cfg?.icone} {cfg?.label ?? log.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{log.cliente?.nome ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{log.assessor?.nome ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{log.canal}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{formatarData(log.enviado_em)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
