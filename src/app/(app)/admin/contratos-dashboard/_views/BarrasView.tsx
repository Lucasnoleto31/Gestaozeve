'use client'

import { useEffect, useMemo, useState } from 'react'
import { Layers, TrendingUp, TrendingDown, UserPlus, UserX, DollarSign, Building2, Activity } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { Block } from '../_lib/Blocks'
import { BlockSkeleton } from '../Charts'
import { CorretoraBadge, EvolucaoBarrasChart } from '../ChartsCorretora'
import { fmtNum, fmtBRL, fmtBRL2, fmtDelta, fmtDataPt } from '../_lib/utils'
import { KpiCard, KpiRow, Vazio } from '../_lib/Kpi'
import { CORRETORA_LABEL } from '@/lib/corretoras'
import type { BarraRankingRow } from '../actions'

type Ordem = 'lotes' | 'receita'

const th = (align: 'left' | 'right') =>
  `px-3 py-2 font-semibold text-gray-500 ${align === 'left' ? 'text-left' : 'text-right'}`

function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-gray-300">—</span>
  const positivo = pct > 0.05
  const negativo = pct < -0.05
  const color = positivo ? '#059669' : negativo ? '#dc2626' : '#6b7280'
  const Icon = positivo ? TrendingUp : negativo ? TrendingDown : null
  return (
    <span className="inline-flex items-center gap-1 font-semibold tabular-nums" style={{ color }}>
      {Icon && <Icon className="w-3 h-3" />}{fmtDelta(pct)}
    </span>
  )
}

export function BarrasView() {
  const { periodo, barra, excluir, corretora } = useDashboardFilters()
  const d = useDashboardData(periodo, barra, excluir, corretora, {
    kpis: true, ranking: true, evolucaoBarras: true,
  })
  const [ordem, setOrdem] = useState<Ordem>('lotes')

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  const comparaAnterior = periodo !== 'tudo'

  const ordenado = useMemo(() => {
    const arr = [...d.ranking]
    arr.sort((a, b) => ordem === 'lotes'
      ? b.lotes_operados - a.lotes_operados
      : b.receita_total - a.receita_total)
    return arr
  }, [d.ranking, ordem])

  // KPIs agregados
  const totais = useMemo(() => {
    const t = { barras: 0, lotes: 0, lotesAnt: 0, temAnt: false, zerados: 0, receita: 0, receitaAnt: 0, clientes: 0 }
    d.ranking.forEach(r => {
      t.barras++
      t.lotes += r.lotes_operados
      t.zerados += r.lotes_zerados
      t.receita += r.receita_total
      t.receitaAnt += r.receita_anterior
      t.clientes += r.clientes_ativos
      if (r.lotes_anterior != null) { t.lotesAnt += r.lotes_anterior; t.temAnt = true }
    })
    return t
  }, [d.ranking])
  const pctZer = totais.lotes > 0 ? (totais.zerados / totais.lotes) * 100 : 0

  // Top 5 barras (pela ordenação escolhida) pro gráfico
  const top5 = useMemo(() => ordenado.slice(0, 5).map(r => r.barra_nome), [ordenado])

  return (
    <div className="space-y-5">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          {d.range.inicio && <>Período <strong className="text-gray-700">{fmtDataPt(d.range.inicio)} a {fmtDataPt(d.range.fim)}</strong>{comparaAnterior ? ', comparado ao período anterior de mesma duração' : ''}. </>}
          {corretora && <>Só a <strong className="text-gray-700">{CORRETORA_LABEL[corretora]}</strong>. </>}
          Esta aba compara <strong className="text-gray-700">todas as barras</strong> entre si: o filtro de barra não se aplica aqui.
          Lotes sem assessor na planilha aparecem como <em>Sem barra</em>.
        </p>
        <div className="inline-flex rounded-lg p-0.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          {(['lotes', 'receita'] as Ordem[]).map(o => (
            <button key={o} onClick={() => setOrdem(o)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
              style={ordem === o ? { background: 'var(--blue)', color: '#fff' } : { color: 'var(--muted)' }}>
              {o === 'lotes' ? 'Por lotes' : 'Por receita'}
            </button>
          ))}
        </div>
      </div>

      <KpiRow>
        <KpiCard icon={Building2} label="Barras com operação" loading={d.loading && d.ranking.length === 0}
          value={fmtNum(totais.barras)} sub="no período" accent="#1764f4" />
        <KpiCard icon={Activity} label="Lotes operados" loading={d.loading && d.ranking.length === 0}
          value={fmtNum(totais.lotes)} sub={`${fmtNum(totais.clientes)} clientes (soma por barra)`} accent="#0891b2"
          delta={comparaAnterior && totais.temAnt ? { atual: totais.lotes, anterior: totais.lotesAnt, fmt: fmtNum } : null} />
        <KpiCard icon={DollarSign} label="Receita bruta estimada" loading={d.loading && d.ranking.length === 0}
          value={fmtBRL2(totais.receita)} sub="tarifa × lotes WIN/WDO" accent="#10b981"
          delta={comparaAnterior ? { atual: totais.receita, anterior: totais.receitaAnt, fmt: fmtBRL } : null} />
        <KpiCard icon={TrendingDown} label="% zeragem" loading={d.loading && d.ranking.length === 0}
          value={`${pctZer.toFixed(1)}%`} sub="ponderada pelos lotes" accent="#f59e0b" />
      </KpiRow>

      <Block title={`Evolução das 5 maiores barras (${ordem === 'lotes' ? 'por lotes' : 'por receita'})`}
        subtitle="Lotes operados por mês nos últimos 12 meses. * = mês em andamento.">
        {d.loading && d.evolucaoBarras.length === 0
          ? <BlockSkeleton height={300} />
          : d.evolucaoBarras.length === 0
            ? <Vazio>Indisponível: rode o supabase-s15-barras.sql no SQL Editor do Supabase.</Vazio>
            : <EvolucaoBarrasChart data={d.evolucaoBarras} barras={top5} />}
      </Block>

      <Block title="Ranking de barras"
        subtitle="Período atual vs anterior (mesma duração): lotes, clientes novos e que pararam, retenção, zeragem e receita.">
        {d.ranking.length === 0
          ? <Vazio loading={d.loading} />
          : <RankingTable rows={ordenado} totalLotes={totais.lotes} totalReceita={totais.receita} comparaAnterior={comparaAnterior} />}
      </Block>

      {d.isPending && (
        <div className="text-xs text-gray-400 flex items-center gap-2 justify-end">
          <Layers className="w-3 h-3 animate-pulse" /> atualizando…
        </div>
      )}
    </div>
  )
}

function RankingTable({ rows, totalLotes, totalReceita, comparaAnterior }: {
  rows: BarraRankingRow[]; totalLotes: number; totalReceita: number; comparaAnterior: boolean
}) {
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
      <table className="text-xs border-collapse min-w-max w-full">
        <thead style={{ background: 'var(--surface-2)' }}>
          <tr>
            <th className={th('left')}>#</th>
            <th className={th('left')}>Barra</th>
            <th className={th('right')}>Lotes op.</th>
            <th className={th('right')}>% lotes</th>
            {comparaAnterior && <th className={th('right')}>Δ lotes</th>}
            <th className={th('right')}>Clientes</th>
            <th className={th('right')}>Novos</th>
            <th className={th('right')}>Churn</th>
            <th className={th('right')}>Retenção</th>
            <th className={th('right')}>% zer.</th>
            <th className={th('right')}>Receita</th>
            <th className={th('right')}>% receita</th>
            {comparaAnterior && <th className={th('right')}>Δ receita</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const semBarra = r.barra_nome === 'Sem barra'
            const shareLotes = totalLotes > 0 ? (r.lotes_operados / totalLotes) * 100 : 0
            const shareRec = totalReceita > 0 ? (r.receita_total / totalReceita) * 100 : 0
            return (
              <tr key={`${r.corretora}|${r.barra_nome}`}
                style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{i + 1}</td>
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-2">
                    <span className={`font-medium ${semBarra ? 'text-gray-400 italic' : 'text-gray-700'}`}>{r.barra_nome}</span>
                    {r.numero && <span className="text-gray-400 tabular-nums">{r.numero}</span>}
                    <CorretoraBadge corretora={r.corretora} />
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtNum(r.lotes_operados)}</td>
                <td className="px-3 py-1.5 text-right">
                  <span className="inline-flex items-center justify-end gap-2">
                    <span className="h-1.5 rounded-full" style={{ width: `${Math.max(2, Math.round(shareLotes * 1.2))}px`, background: '#1764f4', opacity: 0.7 }} />
                    <span className="tabular-nums text-gray-500">{shareLotes.toFixed(1)}%</span>
                  </span>
                </td>
                {comparaAnterior && <td className="px-3 py-1.5 text-right"><Delta pct={r.delta_lotes_pct} /></td>}
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(r.clientes_ativos)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600">
                  <span className="inline-flex items-center gap-1 justify-end"><UserPlus className="w-3 h-3" />{fmtNum(r.clientes_novos)}</span>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-rose-600">
                  <span className="inline-flex items-center gap-1 justify-end"><UserX className="w-3 h-3" />{fmtNum(r.clientes_churn)}</span>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.taxa_retencao.toFixed(1)}%</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.pct_zeragem.toFixed(1)}%</td>
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-emerald-700">{fmtBRL(r.receita_total)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{shareRec.toFixed(1)}%</td>
                {comparaAnterior && <td className="px-3 py-1.5 text-right"><Delta pct={r.delta_receita_pct} /></td>}
              </tr>
            )
          })}
          <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
            <td className="px-3 py-2" />
            <td className="px-3 py-2 font-bold text-gray-800">Total</td>
            <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-800">{fmtNum(totalLotes)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-500">100%</td>
            {comparaAnterior && <td className="px-3 py-2" />}
            <td className="px-3 py-2" colSpan={5} />
            <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700">{fmtBRL(totalReceita)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-500">100%</td>
            {comparaAnterior && <td className="px-3 py-2" />}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
