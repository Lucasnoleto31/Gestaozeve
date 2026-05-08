'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { AcuracidadeBlock, Block } from '../View'
import { fmtNum } from '../_lib/utils'
import { ACTIONS } from '../_lib/dashboardActions'
import { holtWintersAdd } from '../_lib/holtWinters'
import { getInsightsIA, type InsightsResposta } from '../actions'

export function ForecastView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    acuracidade: true, kpis: true, evolucao: true,
    receita: true, meta: true, alertas: true, topClientes: true, produtos: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  // Aplica Holt-Winters mensal (sazonal trimestral, horizonte 4 meses)
  const forecastData = useMemo(() => {
    if (d.evolucao.length < 3) return []
    const ordenado = [...d.evolucao].sort((a, b) => a.mes_data.localeCompare(b.mes_data))
    const valores = ordenado.map(e => e.lotes_operados)
    const hw = holtWintersAdd(valores, { seasonLen: 3, horizon: 4 })
    const fmt = (iso: string) => {
      const dd = new Date(iso + 'T00:00:00')
      return dd.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
        .replace('.', '').toLowerCase()
    }
    const histor = ordenado.map((e, i) => ({
      mes: fmt(e.mes_data),
      Realizado: e.lotes_operados,
      Ajustado: Math.round(hw.fitted[i] ?? 0),
      Forecast: null as number | null,
    }))
    // Próximos 4 meses estimados
    const ultimoMes = new Date(ordenado[ordenado.length - 1].mes_data + 'T00:00:00')
    const future = hw.forecast.map((v, i) => {
      const dd = new Date(ultimoMes); dd.setMonth(dd.getMonth() + i + 1)
      const iso = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-01`
      return {
        mes: fmt(iso),
        Realizado: null as number | null,
        Ajustado: null as number | null,
        Forecast: Math.round(v),
      }
    })
    return [...histor, ...future]
  }, [d.evolucao])

  // Insights via OpenAI (manual — botão)
  const [insights, setInsights] = useState<InsightsResposta | null>(null)
  const [isPendingIA, startTransitionIA] = useTransition()

  function gerarInsights() {
    if (!d.kpis) return
    startTransitionIA(async () => {
      const r = await getInsightsIA({
        periodo,
        kpis: d.kpis!,
        receita: d.receitaTotal,
        meta: d.meta,
        topClientes: d.topClientes,
        alertas: d.alertas,
        porProduto: d.produtos,
      })
      setInsights(r)
    })
  }

  return (
    <div className="space-y-6">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      <Block title="Forecast — próximos 4 meses (Holt-Winters)"
        subtitle="Sazonalidade trimestral aplicada sobre histórico mensal. Linha tracejada = previsão.">
        {forecastData.length === 0
          ? <p className="text-sm text-gray-400 py-4">Sem dados históricos suficientes.</p>
          : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={forecastData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={fmtNum} />
                <Tooltip
                  contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.2)',
                                  borderRadius: 12, color: '#e2e8f0', fontSize: 12 }}
                  formatter={(v) => typeof v === 'number' ? fmtNum(v) : String(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="rect" />
                <ReferenceLine y={0} stroke="#475569" />
                <Area type="monotone" dataKey="Ajustado" stroke="#94a3b8" fill="rgba(148,163,184,0.15)"
                  strokeWidth={1.5} strokeDasharray="3 3" />
                <Line type="monotone" dataKey="Realizado" stroke="#1764f4" strokeWidth={2.5}
                  dot={{ r: 2, fill: '#1764f4' }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="Forecast" stroke="#a855f7" strokeWidth={2.5}
                  strokeDasharray="6 4" dot={{ r: 3, fill: '#a855f7' }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
      </Block>

      <AcuracidadeBlock resumo={d.acuracidade} serie={d.acuracidadeSerie} />

      <Block title="Insights automáticos (IA)"
        subtitle="Análise gerada por OpenAI a partir dos KPIs, receita, meta, top clientes e alertas do período."
        action={
          <button onClick={gerarInsights} disabled={isPendingIA || !d.kpis}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 cursor-pointer"
            style={{ background: 'var(--blue)', color: '#fff' }}>
            {isPendingIA ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {isPendingIA ? 'Analisando…' : insights ? 'Regenerar' : 'Gerar insights'}
          </button>
        }>
        {!insights && !isPendingIA && (
          <p className="text-sm text-gray-400 py-4">
            Clique em &quot;Gerar insights&quot; pra receber 3-5 conclusões automáticas dos dados deste período.
          </p>
        )}
        {insights?.erro && (
          <div className="rounded-xl px-4 py-3 text-sm flex items-start gap-2"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b' }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{insights.erro}</span>
          </div>
        )}
        {insights && insights.insights.length > 0 && (
          <div className="space-y-3">
            {insights.insights.map((ins, i) => {
              const palette = {
                positivo: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.4)', tx: '#059669' },
                atencao:  { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.4)', tx: '#d97706' },
                critico:  { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.4)', tx: '#dc2626' },
                info:     { bg: 'rgba(23,100,244,0.1)', border: 'rgba(23,100,244,0.4)', tx: '#1764f4' },
              }[ins.severidade] ?? { bg: 'rgba(23,100,244,0.1)', border: 'rgba(23,100,244,0.4)', tx: '#1764f4' }
              return (
                <div key={i} className="rounded-xl px-4 py-3"
                  style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
                  <p className="font-semibold text-sm mb-1" style={{ color: palette.tx }}>{ins.titulo}</p>
                  <p className="text-xs text-gray-700">{ins.descricao}</p>
                </div>
              )
            })}
            {insights.gerado_em && (
              <p className="text-[10px] text-gray-400">
                Gerado em {new Date(insights.gerado_em).toLocaleString('pt-BR')} · {insights.modelo}
              </p>
            )}
          </div>
        )}
      </Block>
    </div>
  )
}
