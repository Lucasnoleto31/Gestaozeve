'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import { Sparkles, Loader2, AlertTriangle, TrendingUp, Target, Activity, Layers } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { Block } from '../_lib/Blocks'
import { fmtNum } from '../_lib/utils'
import { KpiCard, KpiRow } from '../_lib/Kpi'
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

  // Holt-Winters mensal — o último mês está em andamento (parcial) e
  // entraria como observação cheia, puxando nível/tendência pra baixo: fica fora.
  const { forecastData, forecastProxMes } = useMemo(() => {
    const fechados = [...d.evolucao]
      .sort((a, b) => a.mes_data.localeCompare(b.mes_data))
      .slice(0, -1)
    if (fechados.length < 3) return { forecastData: [], forecastProxMes: null as number | null }
    const ordenado = fechados
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
    return { forecastData: [...histor, ...future], forecastProxMes: hw.forecast[0] ?? null }
  }, [d.evolucao])

  const [insights, setInsights] = useState<InsightsResposta | null>(null)
  const [isPendingIA, startTransitionIA] = useTransition()

  function gerarInsights() {
    if (!d.kpis) return
    startTransitionIA(async () => {
      const r = await getInsightsIA({
        periodo, kpis: d.kpis!, receita: d.receitaTotal, meta: d.meta,
        topClientes: d.topClientes, alertas: d.alertas, porProduto: d.produtos,
      })
      setInsights(r)
    })
  }

  return (
    <div className="space-y-5">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      {/* 4 KPIs preditivos */}
      <KpiRow>
        <KpiCard icon={TrendingUp} label="Forecast próx. mês"
          value={forecastProxMes != null ? fmtNum(Math.round(forecastProxMes)) : '—'}
          sub="lotes operados · meses fechados" accent="#a855f7" />
        <KpiCard icon={Target} label="Variação diária"
          value={d.acuracidade ? `${d.acuracidade.mape.toFixed(1)}%` : '—'}
          sub={d.acuracidade ? `vs média móvel 7d · ${d.acuracidade.num_dias}d` : undefined}
          accent="#1764f4" />
        <KpiCard icon={Activity} label="Tendência recente"
          value={d.acuracidade ? `${d.acuracidade.vies > 0 ? '+' : ''}${d.acuracidade.vies.toFixed(1)}` : '—'}
          sub={d.acuracidade
            ? (d.acuracidade.vies_label === 'subestima' ? 'acima da média 7d'
              : d.acuracidade.vies_label === 'superestima' ? 'abaixo da média 7d'
              : d.acuracidade.vies_label)
            : '—'}
          accent="#10b981" />
        <KpiCard icon={Sparkles} label="Insights IA"
          value={insights ? `${insights.insights.length}` : '—'}
          sub={isPendingIA ? 'gerando…' : insights ? 'gerados' : 'clique "Gerar"'}
          accent="#f59e0b" />
      </KpiRow>

      {/* 1 gráfico — Forecast Holt-Winters */}
      <Block title="Previsão de volume — próximos 4 meses"
        subtitle="Suavização exponencial (Holt-Winters) sobre os meses fechados — o mês em andamento fica fora. Linha azul = realizado, roxa tracejada = previsão.">
        {forecastData.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'São necessários pelo menos 4 meses de histórico.'}</p>
          : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={forecastData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={fmtNum} />
                <Tooltip
                  contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }}
                  formatter={(v) => typeof v === 'number' ? fmtNum(v) : String(v)} />
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

      {/* Tabela: acuracidade dia a dia */}
      <Block title="Volume diário vs média móvel"
        subtitle="Últimos 30 dias. “Previsto” = média móvel dos 7 pregões anteriores (referência simples, não um modelo). Erro % = desvio do dia vs essa média.">
        {d.acuracidadeSerie.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['Data', 'Previsto', 'Realizado', 'Erro', '% Erro'].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.acuracidadeSerie.slice(-30).reverse().map((p, i) => {
                    const erroColor = p.pct_erro != null && p.pct_erro > 20 ? 'text-rose-600'
                      : p.pct_erro != null && p.pct_erro > 10 ? 'text-amber-600' : 'text-emerald-700'
                    return (
                      <tr key={p.data}
                        style={{ borderTop: '1px solid var(--border)',
                                 background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                        <td className="px-3 py-1.5 text-gray-700 tabular-nums">{p.data}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(p.previsto)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(p.realizado)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(p.erro)}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${erroColor}`}>
                          {p.pct_erro != null ? `${p.pct_erro.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Block>

      {/* Insights IA — botão lateral */}
      <Block title="Insights automáticos (IA)"
        subtitle="Análise generativa via OpenAI sobre KPIs, receita, meta e alertas."
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
          <div className="space-y-2">
            {insights.insights.map((ins, i) => {
              const palette = {
                positivo: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)', tx: '#059669' },
                atencao:  { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', tx: '#d97706' },
                critico:  { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', tx: '#dc2626' },
                info:     { bg: 'rgba(23,100,244,0.08)', border: 'rgba(23,100,244,0.3)', tx: '#1764f4' },
              }[ins.severidade] ?? { bg: 'rgba(23,100,244,0.08)', border: 'rgba(23,100,244,0.3)', tx: '#1764f4' }
              return (
                <div key={i} className="rounded-xl px-4 py-3"
                  style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
                  <p className="font-semibold text-sm mb-1" style={{ color: palette.tx }}>{ins.titulo}</p>
                  <p className="text-xs text-gray-700">{ins.descricao}</p>
                </div>
              )
            })}
            <p className="text-[10px] text-gray-400">
              Gerado em {new Date(insights.gerado_em).toLocaleString('pt-BR')} · {insights.modelo}
            </p>
          </div>
        )}
      </Block>

      {d.isPending && (
        <div className="text-xs text-gray-400 flex items-center gap-2 justify-end">
          <Layers className="w-3 h-3 animate-pulse" /> atualizando…
        </div>
      )}
    </div>
  )
}
