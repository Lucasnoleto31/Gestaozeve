'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import {
  Download, TrendingDown, Users, Activity, DollarSign, Layers, CalendarDays,
} from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { Block } from '../_lib/Blocks'
import { EvolucaoMensalChart, BlockSkeleton } from '../Charts'
import { fmtNum, fmtBRL, fmtBRL2 } from '../_lib/utils'
import { KpiCard, KpiRow } from '../_lib/Kpi'
import { ACTIONS } from '../_lib/dashboardActions'
import type { RetencaoMensalRow } from '../actions'

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function labelMesAno(iso: string): string {
  const m = parseInt(iso.slice(5, 7), 10)
  return `${MESES_ABREV[m - 1] ?? iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

export function ExecutivoView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    kpis: true, receita: true, meta: true, evolucao: true,
    receitaBrutaLiquida: true, retencao: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  const pctZeragem = d.kpis && d.kpis.volume_operados > 0
    ? (d.kpis.volume_zerados / d.kpis.volume_operados) * 100
    : null

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

      {/* 5 KPIs no topo — todos respeitam período + barra */}
      <KpiRow cols={5}>
        <KpiCard icon={Activity} label="Volume operado"
          value={d.kpis ? fmtNum(d.kpis.volume_operados) : '—'}
          sub="lotes no período" accent="#1764f4" />
        <KpiCard icon={TrendingDown} label="Volume zerado"
          value={d.kpis ? fmtNum(d.kpis.volume_zerados) : '—'}
          sub={pctZeragem != null ? `${pctZeragem.toFixed(1)}% do operado` : undefined} accent="#dc2626" />
        <KpiCard icon={Users} label="Clientes ativos"
          value={d.kpis ? fmtNum(d.kpis.num_clientes_ativos) : '—'}
          sub="contas que operaram no período" accent="#a855f7" />
        <KpiCard icon={CalendarDays} label="Média diária"
          value={d.kpis ? fmtNum(d.kpis.media_diaria) : '—'}
          sub={d.kpis ? `lotes/pregão · ${d.kpis.num_dias_com_dado} pregões` : undefined} accent="#0891b2" />
        <KpiCard icon={DollarSign} label="Receita estimada"
          value={d.receitaBL ? fmtBRL2(d.receitaBL.receita_liquida) : '—'}
          sub={d.receitaBL ? `líquida · bruta ${fmtBRL(d.receitaBL.receita_bruta)} · só WIN/WDO` : 'só WIN/WDO'}
          accent="#10b981" />
      </KpiRow>

      {/* 1 gráfico principal */}
      <Block title="Evolução mensal"
        subtitle="Lotes operados (azul) e zerados (vermelho) lado a lado + clientes ativos (linha roxa, eixo direito). * = mês em andamento.">
        {d.isPending && d.evolucao.length === 0
          ? <BlockSkeleton height={280} />
          : <EvolucaoMensalChart data={d.evolucao} />}
      </Block>

      {/* Retenção e churn mês a mês */}
      <Block title="Retenção e churn"
        subtitle="Clientes (por número de conta) que operaram no mês e pararam no mês seguinte. Linha marcada como parcial ainda muda com novas importações.">
        {d.retencao.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : <RetencaoTable rows={d.retencao} />}
      </Block>

      {/* Receita por barra */}
      <Block title="Receita estimada por barra (período)"
        subtitle="Tarifa cadastrada em Tarifas × lotes WIN/WDO. Lotes de outros produtos aparecem no volume mas ainda não geram receita aqui.">
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

      {/* Meta — progresso compacto (mostra se qualquer meta estiver cadastrada) */}
      {d.meta && (d.meta.meta_receita > 0 || d.meta.meta_lotes > 0) && (
        <Block title={`Meta ${d.meta.ano}`}
          subtitle={`${d.meta.dias_corridos_restantes} dias úteis restantes · ritmo necessário: ${fmtBRL(d.meta.ritmo_receita_necessario)}/pregão`}>
          <div className="space-y-3">
            {d.meta.meta_lotes > 0 && (
              <MetaProgresso label="Lotes operados" pct={d.meta.pct_lotes}
                realizado={d.meta.realizado_lotes} meta={d.meta.meta_lotes} sufixo=" lotes" />
            )}
            {d.meta.meta_receita > 0 && (
              <MetaProgresso label="Receita" pct={d.meta.pct_receita}
                realizado={d.meta.realizado_receita} meta={d.meta.meta_receita} isCurrency />
            )}
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

// Tabela mensal: Ativos → Continuaram / Pararam → Churn % / Retenção %
function RetencaoTable({ rows }: { rows: RetencaoMensalRow[] }) {
  const churnColor = (pct: number) =>
    pct >= 40 ? '#dc2626' : pct >= 30 ? '#d97706' : '#059669'
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
      <table className="text-xs border-collapse min-w-max w-full">
        <thead style={{ background: 'var(--surface-2)' }}>
          <tr>
            <th className="px-3 py-2 font-semibold text-gray-500 text-left">Mês</th>
            <th className="px-3 py-2 font-semibold text-gray-500 text-right">Ativos no mês</th>
            <th className="px-3 py-2 font-semibold text-gray-500 text-right">Continuaram</th>
            <th className="px-3 py-2 font-semibold text-gray-500 text-right">Pararam</th>
            <th className="px-3 py-2 font-semibold text-gray-500 text-right">Churn %</th>
            <th className="px-3 py-2 font-semibold text-gray-500 text-right">Retenção %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.mes}
              style={{ borderTop: '1px solid var(--border)',
                       background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
              <td className="px-3 py-1.5 font-medium text-gray-700 whitespace-nowrap">
                {labelMesAno(r.mes)} → {labelMesAno(r.mes_seguinte)}{r.parcial ? ' (parcial)' : ''}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(r.ativos)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{fmtNum(r.continuaram)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-red-700">{fmtNum(r.pararam)}</td>
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums" style={{ color: churnColor(r.churn_pct) }}>
                {r.churn_pct.toFixed(1)}%
              </td>
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-gray-700">
                {r.retencao_pct.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
