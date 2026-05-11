'use client'

import { useEffect } from 'react'
import { Zap, Target, Activity as ActivityIcon, AlertOctagon, Flame, Users as UsersIcon } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { Block } from '../View'
import { BlockSkeleton, CohortHeatmap, LtvBarChart } from '../Charts'
import { fmtNum, fmtBRL2, fmtDataPt } from '../_lib/utils'
import { ACTIONS } from '../_lib/dashboardActions'

const CLUSTER_INFO: Record<string, { label: string; color: string; icon: React.ElementType; descricao: string }> = {
  consistente: { label: 'Consistentes',  color: '#10b981', icon: Target,        descricao: 'Baixa %zer + alta frequência. Base sustentável.' },
  scalper:     { label: 'Scalpers',      color: '#1764f4', icon: Zap,           descricao: 'Alta frequência + volume diário alto. Operam quase todos os dias.' },
  swing:       { label: 'Swing',         color: '#a855f7', icon: ActivityIcon,  descricao: 'Baixa frequência com volume mensal. Operam poucos dias com peso.' },
  agressivo:   { label: 'Agressivos',    color: '#f59e0b', icon: Flame,         descricao: 'Lotes/dia no top 10% + %zer alta. Risco elevado.' },
  emocional:   { label: 'Emocionais',    color: '#dc2626', icon: AlertOctagon,  descricao: 'Alta %zer + frequência. Padrão cassino, candidato a churn.' },
  casual:      { label: 'Casuais',       color: '#94a3b8', icon: UsersIcon,     descricao: 'Volume e frequência baixos. Pouco impacto na receita.' },
}

const SCORE_CLASS: Record<string, { label: string; color: string }> = {
  premium: { label: 'Premium',  color: '#10b981' },
  solido:  { label: 'Sólido',   color: '#1764f4' },
  medio:   { label: 'Médio',    color: '#f59e0b' },
  fragil:  { label: 'Frágil',   color: '#dc2626' },
}

export function AnalisesView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    cohort: true, ltv: true, kpis: true,
    scoreCliente: true, clustersClientes: true, correlacoes: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  const top15 = d.ltv.slice(0, 15)

  return (
    <div className="space-y-6">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      {/* Clusterização */}
      <Block title="Clusterização de clientes"
        subtitle="Segmentação heurística por comportamento operacional (90 dias). Identifica perfis para campanhas e gestão.">
        {d.clusters.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {d.clusters.map(c => {
                const info = CLUSTER_INFO[c.cluster]
                const Icon = info.icon
                return (
                  <div key={c.cluster} className="rounded-xl p-4"
                    style={{ background: 'var(--surface)', border: `2px solid ${info.color}33`, borderLeft: `6px solid ${info.color}` }}>
                    <p className="text-xs uppercase tracking-widest font-semibold inline-flex items-center gap-2" style={{ color: info.color }}>
                      <Icon className="w-3.5 h-3.5" /> {info.label}
                    </p>
                    <p className="text-2xl font-bold text-gray-700 tabular-nums mt-1">{c.num_clientes} <span className="text-sm text-gray-400">clientes</span></p>
                    <p className="text-xs text-gray-500 mt-1">
                      {c.pct_base.toFixed(1)}% da base · {c.pct_lotes.toFixed(1)}% do volume
                    </p>
                    <p className="text-xs text-gray-500 mt-1 tabular-nums">
                      {fmtNum(c.lotes_medio_dia)} lotes/dia · {c.dias_medio_mes.toFixed(1)} dias/mês · {c.pct_zeragem_medio.toFixed(1)}% zer
                    </p>
                    <p className="text-[10px] text-gray-400 mt-2 leading-tight">{info.descricao}</p>
                  </div>
                )
              })}
            </div>
          )}
      </Block>

      {/* Correlações */}
      <Block title="Correlações comportamentais"
        subtitle="Pearson r entre pares de sinais (90 dias por cliente). |r| > 0.5 = forte · 0.3-0.5 = moderada · <0.3 = fraca.">
        {d.correl.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem amostras suficientes.'}</p>
          : (
            <div className="space-y-2">
              {d.correl.map(c => {
                const forcaColor = c.forca === 'forte' ? '#dc2626' : c.forca === 'moderada' ? '#f59e0b' : c.forca === 'fraca' ? '#94a3b8' : '#cbd5e1'
                const direcaoIcon = c.direcao === 'positiva' ? '↑' : c.direcao === 'negativa' ? '↓' : '→'
                return (
                  <div key={c.par} className="rounded-xl p-3"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${forcaColor}` }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-700">{c.descricao}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {c.par} · {c.num_amostras} amostras
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-bold tabular-nums" style={{ color: forcaColor }}>
                          {direcaoIcon} {c.r.toFixed(3)}
                        </p>
                        <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: forcaColor }}>
                          {c.forca} · {c.direcao}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
      </Block>

      {/* Score segmentado do cliente */}
      <Block title="Score segmentado do cliente (top 30)"
        subtitle="4 dimensões: financeiro (35%), operacional (25%), emocional (20%), retenção (20%). Total >75 = premium · 50-75 = sólido · 30-50 = médio · <30 = frágil.">
        {d.scoreCli.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['#', 'Cliente', 'Barra', 'Classe', 'Total', 'Financeiro', 'Operacional', 'Emocional', 'Retenção'].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${i <= 3 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.scoreCli.slice(0, 30).map(s => {
                    const klass = SCORE_CLASS[s.classificacao]
                    return (
                      <tr key={`${s.cliente_id ?? s.cliente_nome}-${s.rank}`}
                        onClick={() => { if (s.cliente_id) window.location.href = `/clientes/${s.cliente_id}` }}
                        className={s.cliente_id ? 'cursor-pointer hover:bg-blue-50' : ''}
                        style={{ borderTop: '1px solid var(--border)',
                                 background: s.rank % 2 === 1 ? 'var(--surface)' : 'var(--surface-2)' }}>
                        <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{s.rank}</td>
                        <td className="px-3 py-1.5 font-medium text-gray-700">{s.cliente_nome}</td>
                        <td className="px-3 py-1.5 text-gray-500">{s.assessor_nome ?? '—'}</td>
                        <td className="px-3 py-1.5">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold"
                            style={{ background: `${klass.color}20`, color: klass.color }}>
                            {klass.label}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-bold tabular-nums" style={{ color: klass.color }}>
                          {s.score_total}
                        </td>
                        <ScoreCell value={s.score_financeiro} />
                        <ScoreCell value={s.score_operacional} />
                        <ScoreCell value={s.score_emocional} />
                        <ScoreCell value={s.score_retencao} />
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Block>

      {/* Cohort + LTV (existentes mantidos) */}
      <Block title="Cohort de retenção"
        subtitle="Para cada mês de entrada (primeira operação), % de clientes que continuam operando nos meses seguintes. M0 = 100% por definição.">
        {d.isPending && d.cohort.length === 0
          ? <BlockSkeleton height={300} />
          : <CohortHeatmap data={d.cohort} />}
      </Block>

      <Block title="LTV — Top 15 clientes por receita estimada"
        subtitle="Receita acumulada life-to-date (futuros + zeragem aplicando pricing por barra). Barra cinza = média mensal.">
        {d.isPending && top15.length === 0
          ? <BlockSkeleton height={400} />
          : <LtvBarChart data={top15} />}
      </Block>

      <Block title="Top 50 clientes — detalhamento LTV"
        subtitle="Mesma lista do LTV com colunas adicionais. Clique em um cliente pra abrir o perfil.">
        {d.isPending && d.ltv.length === 0
          ? <p className="text-sm text-gray-400 py-4">Carregando…</p>
          : d.ltv.length === 0
          ? <p className="text-sm text-gray-400 py-4">Sem dados.</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {[
                      { l: '#', a: 'left' },
                      { l: 'Cliente', a: 'left' },
                      { l: 'Barra', a: 'left' },
                      { l: 'Primeira op.', a: 'left' },
                      { l: 'Última op.', a: 'left' },
                      { l: 'Meses', a: 'right' },
                      { l: 'Lotes op.', a: 'right' },
                      { l: 'Lotes ze.', a: 'right' },
                      { l: 'Receita LTV', a: 'right' },
                      { l: 'Méd./mês', a: 'right' },
                    ].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${h.a === 'left' ? 'text-left' : 'text-right'}`}>
                        {h.l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.ltv.map((c) => (
                    <tr key={`${c.cliente_id ?? c.cliente_nome}-${c.rank}`}
                      onClick={() => { if (c.cliente_id) window.location.href = `/clientes/${c.cliente_id}` }}
                      className={c.cliente_id ? 'cursor-pointer hover:bg-blue-50' : ''}
                      style={{ borderTop: '1px solid var(--border)',
                               background: c.rank % 2 === 1 ? 'var(--surface)' : 'var(--surface-2)' }}>
                      <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{c.rank}</td>
                      <td className="px-3 py-1.5 font-medium text-gray-700">{c.cliente_nome}</td>
                      <td className="px-3 py-1.5 text-gray-500">{c.assessor_nome ?? '—'}</td>
                      <td className="px-3 py-1.5 text-gray-500 tabular-nums">{fmtDataPt(c.primeira_op)}</td>
                      <td className="px-3 py-1.5 text-gray-500 tabular-nums">{fmtDataPt(c.ultima_op)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{c.meses_ativo}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(c.lotes_operados)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtNum(c.lotes_zerados)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-emerald-700">{fmtBRL2(c.receita_estimada)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{fmtBRL2(c.receita_media_mensal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Block>
    </div>
  )
}

function ScoreCell({ value }: { value: number }) {
  const color = value >= 70 ? '#10b981' : value >= 40 ? '#1764f4' : value >= 20 ? '#f59e0b' : '#dc2626'
  return (
    <td className="px-3 py-1.5 text-right tabular-nums">
      <div className="inline-flex items-center gap-2 justify-end">
        <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(148,163,184,0.2)' }}>
          <div className="h-full transition-all" style={{ width: `${Math.min(100, value)}%`, background: color }} />
        </div>
        <span className="font-semibold w-7 text-right" style={{ color }}>{value}</span>
      </div>
    </td>
  )
}

