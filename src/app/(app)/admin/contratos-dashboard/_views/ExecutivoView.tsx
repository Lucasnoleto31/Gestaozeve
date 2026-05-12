'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import {
  Download, TrendingDown, Users, Activity, DollarSign,
  Layers, AlertCircle, Gauge,
} from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { Block } from '../View'
import { EvolucaoMensalChart, BlockSkeleton } from '../Charts'
import { fmtNum, fmtBRL, fmtBRL2 } from '../_lib/utils'
import { KpiCard, KpiRow } from '../_lib/Kpi'
import { ACTIONS } from '../_lib/dashboardActions'

export function ExecutivoView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    kpis: true, receita: true, meta: true, evolucao: true,
    receitaBrutaLiquida: true, riscoEscritorio: true, alertasExecutivos: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  const pctZeragem = d.kpis && d.kpis.volume_operados > 0
    ? (d.kpis.volume_zerados / d.kpis.volume_operados) * 100
    : 0

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

      <div className="flex justify-end">
        <Link href={`/admin/contratos-dashboard/export?periodo=${periodo}${barra ? `&barra=${encodeURIComponent(barra)}` : ''}`}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
          <Download className="w-3.5 h-3.5" />
          Exportar
        </Link>
      </div>

      {/* 5 KPIs no topo */}
      <KpiRow cols={5}>
        <KpiCard icon={Activity} label="Volume operado"
          value={d.kpis ? fmtNum(d.kpis.volume_operados) : '—'}
          sub="lotes no período" accent="#1764f4" />
        <KpiCard icon={TrendingDown} label="Volume zerado"
          value={d.kpis ? fmtNum(d.kpis.volume_zerados) : '—'}
          sub={`${pctZeragem.toFixed(1)}% do operado`} accent="#dc2626" />
        <KpiCard icon={DollarSign} label="Receita líquida"
          value={d.receitaBL ? fmtBRL2(d.receitaBL.receita_liquida) : '—'}
          sub={d.receitaBL ? `bruta ${fmtBRL(d.receitaBL.receita_bruta)}` : undefined}
          accent="#10b981" />
        <KpiCard icon={Users} label="Clientes ativos"
          value={d.kpis ? fmtNum(d.kpis.num_clientes_ativos) : '—'}
          sub="operaram no período" accent="#a855f7" />
        <KpiCard icon={Gauge} label="Risco do escritório"
          value={d.riscoEsc ? `${d.riscoEsc.indice}/100` : '—'}
          sub={d.riscoEsc?.classificacao ?? '—'}
          accent={riscoColor} valueColor={riscoColor} />
      </KpiRow>

      {/* 1 gráfico principal */}
      <Block title="Evolução mensal" subtitle="Operados (azul) + zerados (vermelho) por mês.">
        {d.isPending && d.evolucao.length === 0
          ? <BlockSkeleton height={280} />
          : <EvolucaoMensalChart data={d.evolucao} />}
      </Block>

      {/* Tabela 1: Receita por barra */}
      <Block title="Receita por barra (período)"
        subtitle="Ordenado por receita total. Coluna líquida aplica % repasse cadastrado em Tarifas.">
        {d.receitaPorAss.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['#', 'Barra', 'Nº', 'Lotes op.', 'Lotes ze.', '% zer.', 'Receita'].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${i <= 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...d.receitaPorAss].sort((a, b) => b.receita_total - a.receita_total).map((r, i) => {
                    const pctZe = r.lotes_operados > 0 ? (r.lotes_zerados / r.lotes_operados) * 100 : 0
                    return (
                      <tr key={r.barra_nome + i}
                        style={{ borderTop: '1px solid var(--border)',
                                 background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                        <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-1.5 font-medium text-gray-700">{r.barra_nome}</td>
                        <td className="px-3 py-1.5 text-gray-500 tabular-nums">{r.numero ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(r.lotes_operados)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtNum(r.lotes_zerados)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{pctZe.toFixed(1)}%</td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-emerald-700">{fmtBRL2(r.receita_total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Block>

      {/* Tabela 2: Alertas executivos agregados */}
      {d.alertasExec.length > 0 && (
        <Block title="Alertas executivos"
          subtitle="Sinais agregados — clique nos cards pra acessar a aba correspondente.">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {d.alertasExec.map((a, i) => {
              const palette = {
                alta:  { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', tx: '#dc2626' },
                media: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', tx: '#d97706' },
                baixa: { bg: 'rgba(23,100,244,0.08)', border: 'rgba(23,100,244,0.3)', tx: '#1764f4' },
              }[a.severidade]
              return (
                <div key={i} className="rounded-xl px-4 py-3 flex items-start gap-3"
                  style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: palette.tx }} />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm" style={{ color: palette.tx }}>{a.titulo}</p>
                    <p className="text-xs text-gray-700 mt-0.5">{a.descricao}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Block>
      )}

      {/* Meta — apenas progresso compacto */}
      {d.meta && d.meta.meta_receita > 0 && (
        <Block title={`Meta ${d.meta.ano}`}
          subtitle={`${d.meta.dias_corridos_restantes} dias corridos restantes · ritmo necessário: ${fmtBRL(d.meta.ritmo_receita_necessario)}/dia`}>
          <div className="space-y-3">
            <MetaProgresso label="Lotes operados" pct={d.meta.pct_lotes}
              realizado={d.meta.realizado_lotes} meta={d.meta.meta_lotes} sufixo=" lotes" />
            <MetaProgresso label="Receita" pct={d.meta.pct_receita}
              realizado={d.meta.realizado_receita} meta={d.meta.meta_receita} isCurrency />
          </div>
        </Block>
      )}

      {/* Indicador de loading inline */}
      {d.isPending && (
        <div className="text-xs text-gray-400 flex items-center gap-2 justify-end">
          <Layers className="w-3 h-3 animate-pulse" /> atualizando…
        </div>
      )}
    </div>
  )
}

function MetaProgresso({ label, pct, realizado, meta, sufixo, isCurrency }: {
  label: string; pct: number; realizado: number; meta: number; sufixo?: string; isCurrency?: boolean
}) {
  const color = pct >= 100 ? '#10b981' : pct >= 75 ? '#1764f4' : pct >= 50 ? '#f59e0b' : '#dc2626'
  const fmt = isCurrency ? fmtBRL : (n: number) => fmtNum(n) + (sufixo ?? '')
  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="tabular-nums font-semibold" style={{ color }}>{pct.toFixed(1)}%</span>
      </div>
      <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(148,163,184,0.2)' }}>
        <div className="h-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <p className="text-xs text-gray-500 mt-1 tabular-nums">{fmt(realizado)} de {fmt(meta)}</p>
    </div>
  )
}
