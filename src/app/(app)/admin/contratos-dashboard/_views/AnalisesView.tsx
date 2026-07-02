'use client'

import { useEffect, useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts'
import { Gauge, Target, AlertOctagon, Layers } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { Block } from '../_lib/Blocks'
import { fmtNum } from '../_lib/utils'
import { KpiCard, KpiRow } from '../_lib/Kpi'
import { ACTIONS } from '../_lib/dashboardActions'

const CLUSTER_COLOR: Record<string, string> = {
  consistente: '#10b981',
  scalper: '#1764f4',
  swing: '#a855f7',
  agressivo: '#f59e0b',
  emocional: '#dc2626',
  casual: '#94a3b8',
}

const CLUSTER_LABEL: Record<string, string> = {
  consistente: 'Consistentes',
  scalper: 'Scalpers',
  swing: 'Swing',
  agressivo: 'Agressivos',
  emocional: 'Emocionais',
  casual: 'Casuais',
}

const SCORE_CLASS: Record<string, { label: string; color: string }> = {
  premium: { label: 'Premium', color: '#10b981' },
  solido:  { label: 'Sólido',  color: '#1764f4' },
  medio:   { label: 'Médio',   color: '#f59e0b' },
  fragil:  { label: 'Frágil',  color: '#dc2626' },
}

export function AnalisesView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    kpis: true, riscoEscritorio: true,
    scoreCliente: true, clustersClientes: true, correlacoes: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  // Gráfico: distribuição de clusters
  const chartData = useMemo(() => d.clusters.map(c => ({
    cluster: CLUSTER_LABEL[c.cluster] ?? c.cluster,
    'Clientes': c.num_clientes,
    color: CLUSTER_COLOR[c.cluster] ?? '#94a3b8',
  })), [d.clusters])

  const riscoColor = d.riscoEsc?.classificacao === 'critico' ? '#dc2626'
    : d.riscoEsc?.classificacao === 'atencao' ? '#f59e0b' : '#10b981'

  return (
    <div className="space-y-5">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Esta aba usa janelas fixas (últimos 90 dias / histórico) — os filtros de período e barra acima
        <strong> não se aplicam aqui</strong>. Os índices abaixo são heurísticos (0–100, maior = pior).
      </p>

      {/* 4 KPIs analíticos */}
      <KpiRow>
        <KpiCard icon={Gauge} label="Risco escritório"
          value={d.riscoEsc ? `${d.riscoEsc.indice}/100` : '—'}
          sub={d.riscoEsc?.classificacao ?? '—'}
          accent={riscoColor} valueColor={riscoColor} />
        <KpiCard icon={Target} label="Concentração top 3"
          value={d.riscoEsc ? `${d.riscoEsc.fator_concentracao}/100` : '—'}
          sub={d.riscoEsc?.detalhe_concentracao ?? '—'}
          accent="#1764f4" />
        <KpiCard icon={AlertOctagon} label="Fator zeragem"
          value={d.riscoEsc ? `${d.riscoEsc.fator_zeragem}/100` : '—'}
          sub={d.riscoEsc?.detalhe_zeragem ?? '—'}
          accent="#dc2626" />
        <KpiCard icon={Layers} label="Fator inativos"
          value={d.riscoEsc ? `${d.riscoEsc.fator_inativos}/100` : '—'}
          sub={d.riscoEsc?.detalhe_inativos ?? '—'}
          accent="#a855f7" />
      </KpiRow>

      {/* 1 gráfico — distribuição de clusters */}
      <Block title="Clusterização de clientes"
        subtitle="Perfil comportamental nos últimos 90 dias.">
        {chartData.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 38)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={fmtNum} />
                <YAxis type="category" dataKey="cluster" tick={{ fontSize: 11, fill: '#94a3b8' }} width={110} />
                <Tooltip
                  contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }}
                  formatter={(v) => fmtNum(v as number)} />
                <Bar dataKey="Clientes" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
      </Block>

      {/* Tabela 1: detalhamento de clusters */}
      <Block title="Detalhamento por cluster"
        subtitle="Volume, frequência e % zeragem médios por perfil.">
        {d.clusters.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['Perfil', 'Clientes', '% base', '% volume', 'Lotes/dia', '% zer médio', 'Dias/mês'].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.clusters.map((c, i) => (
                    <tr key={c.cluster}
                      style={{ borderTop: '1px solid var(--border)',
                               background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                      <td className="px-3 py-1.5 font-medium">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold"
                          style={{ background: `${CLUSTER_COLOR[c.cluster] ?? '#94a3b8'}20`, color: CLUSTER_COLOR[c.cluster] ?? '#94a3b8' }}>
                          {CLUSTER_LABEL[c.cluster] ?? c.cluster}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(c.num_clientes)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{c.pct_base.toFixed(1)}%</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{c.pct_lotes.toFixed(1)}%</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(c.lotes_medio_dia)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{c.pct_zeragem_medio.toFixed(1)}%</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{c.dias_medio_mes.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Block>

      {/* Tabela 2: score segmentado top 30 */}
      <Block title="Score segmentado — top 30 clientes"
        subtitle="4 dimensões: financeiro (35%), operacional (25%), emocional (20%), retenção (20%).">
        {d.scoreCli.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['#', 'Cliente', 'Classe', 'Total', 'Financ.', 'Oper.', 'Emoc.', 'Reten.'].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${i <= 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.scoreCli.slice(0, 30).map(s => {
                    const klass = SCORE_CLASS[s.classificacao] ?? { label: s.classificacao, color: '#94a3b8' }
                    return (
                      <tr key={`${s.cliente_id ?? s.cliente_nome}-${s.rank}`}
                        onClick={() => { if (s.cliente_id) window.location.href = `/clientes/${s.cliente_id}` }}
                        className={s.cliente_id ? 'cursor-pointer hover:bg-blue-50' : ''}
                        style={{ borderTop: '1px solid var(--border)',
                                 background: s.rank % 2 === 1 ? 'var(--surface)' : 'var(--surface-2)' }}>
                        <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{s.rank}</td>
                        <td className="px-3 py-1.5 font-medium text-gray-700">{s.cliente_nome}</td>
                        <td className="px-3 py-1.5">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold"
                            style={{ background: `${klass.color}20`, color: klass.color }}>
                            {klass.label}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-bold tabular-nums" style={{ color: klass.color }}>
                          {s.score_total}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{s.score_financeiro}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{s.score_operacional}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{s.score_emocional}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{s.score_retencao}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Block>

      {/* Tabela 3: correlações */}
      <Block title="Correlações comportamentais"
        subtitle="Pearson r (90d). |r| ≥ 0.5 forte · 0.3-0.5 moderada · <0.3 fraca.">
        {d.correl.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem amostras suficientes.'}</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['Hipótese', 'r', 'Força', 'Direção', 'Amostras'].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.correl.map((c, i) => {
                    const color = c.forca === 'forte' ? '#dc2626' : c.forca === 'moderada' ? '#f59e0b' : '#94a3b8'
                    return (
                      <tr key={c.par} style={{ borderTop: '1px solid var(--border)',
                               background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                        <td className="px-3 py-1.5 text-gray-700">{c.descricao}</td>
                        <td className="px-3 py-1.5 text-right font-bold tabular-nums" style={{ color }}>{c.r.toFixed(3)}</td>
                        <td className="px-3 py-1.5 text-right text-xs uppercase tracking-wide" style={{ color }}>{c.forca}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">{c.direcao}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{c.num_amostras}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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
