'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, Building2, DollarSign, TrendingDown, UserPlus, UserX } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { EvolucaoBarrasChart } from '../ChartsCorretora'
import { fmtNum, fmtBRL, fmtBRL2, fmtDataPt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CORRETORA_LABEL } from '@/lib/corretoras'
import { Panel } from '@/components/ui/Panel'
import { KpiCard, KpiRow, DeltaText } from '@/components/ui/Kpi'
import { Alert } from '@/components/ui/Alert'
import { ChartSkeleton, Empty } from '@/components/ui/Skeleton'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import { ShareBar } from '@/components/ui/Progress'
import type { BarraRankingRow } from '../actions'

type Ordem = 'lotes' | 'receita'

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
  const carregandoRanking = d.loading && d.ranking.length === 0

  return (
    <>
      {d.erro && <Alert tone="danger">{d.erro}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-xs text-fg-muted">
          {d.range.inicio && <>Período <strong className="font-medium text-fg">{fmtDataPt(d.range.inicio)} a {fmtDataPt(d.range.fim)}</strong>{comparaAnterior ? ', comparado ao período anterior de mesma duração' : ''}. </>}
          {corretora && <>Só a <strong className="font-medium text-fg">{CORRETORA_LABEL[corretora]}</strong>. </>}
          Esta aba compara <strong className="font-medium text-fg">todas as barras</strong> entre si: o filtro de barra não se aplica aqui.
          Lotes sem assessor na planilha aparecem como <em>Sem barra</em>.
        </p>
        <div className="seg">
          {(['lotes', 'receita'] as Ordem[]).map(o => (
            <button key={o} type="button" data-active={ordem === o} onClick={() => setOrdem(o)}>
              {o === 'lotes' ? 'Por lotes' : 'Por receita'}
            </button>
          ))}
        </div>
      </div>

      <KpiRow>
        <KpiCard icon={Building2} label="Barras com operação" tone="accent" loading={carregandoRanking}
          value={fmtNum(totais.barras)} sub="no período" />
        <KpiCard icon={Activity} label="Lotes operados" tone="info" loading={carregandoRanking}
          value={fmtNum(totais.lotes)} sub={`${fmtNum(totais.clientes)} clientes (soma por barra)`}
          delta={comparaAnterior && totais.temAnt ? { atual: totais.lotes, anterior: totais.lotesAnt, fmt: fmtNum } : null} />
        <KpiCard icon={DollarSign} label="Receita bruta estimada" tone="success" loading={carregandoRanking}
          value={fmtBRL2(totais.receita)} sub="tarifa × lotes WIN/WDO"
          delta={comparaAnterior ? { atual: totais.receita, anterior: totais.receitaAnt, fmt: fmtBRL } : null} />
        <KpiCard icon={TrendingDown} label="% zeragem" tone="warning" loading={carregandoRanking}
          value={`${pctZer.toFixed(1)}%`} sub="ponderada pelos lotes" />
      </KpiRow>

      <Panel title={`Evolução das 5 maiores barras (${ordem === 'lotes' ? 'por lotes' : 'por receita'})`}
        subtitle="Lotes operados por mês nos últimos 12 meses. * = mês em andamento.">
        {d.loading && d.evolucaoBarras.length === 0
          ? <ChartSkeleton height={300} />
          : d.evolucaoBarras.length === 0
            ? <Empty>Indisponível: rode o supabase-s15-barras.sql no SQL Editor do Supabase.</Empty>
            : <EvolucaoBarrasChart data={d.evolucaoBarras} barras={top5} />}
      </Panel>

      <Panel flush title="Ranking de barras"
        subtitle="Período atual vs anterior (mesma duração): lotes, clientes novos e que pararam, retenção, zeragem e receita.">
        {d.ranking.length === 0
          ? <div className="p-5"><Empty loading={d.loading} /></div>
          : <RankingTable rows={ordenado} totalLotes={totais.lotes} totalReceita={totais.receita} comparaAnterior={comparaAnterior} />}
      </Panel>
    </>
  )
}

function RankingTable({ rows, totalLotes, totalReceita, comparaAnterior }: {
  rows: BarraRankingRow[]; totalLotes: number; totalReceita: number; comparaAnterior: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th className="w-10">#</th>
            <th>Barra</th>
            <th className="num">Lotes op.</th>
            <th className="num">% lotes</th>
            {comparaAnterior && <th className="num">Δ lotes</th>}
            <th className="num">Clientes</th>
            <th className="num">Novos</th>
            <th className="num">Churn</th>
            <th className="num">Retenção</th>
            <th className="num">% zer.</th>
            <th className="num">Receita</th>
            <th className="num">% receita</th>
            {comparaAnterior && <th className="num">Δ receita</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const semBarra = r.barra_nome === 'Sem barra'
            const shareLotes = totalLotes > 0 ? (r.lotes_operados / totalLotes) * 100 : 0
            const shareRec = totalReceita > 0 ? (r.receita_total / totalReceita) * 100 : 0
            return (
              <tr key={`${r.corretora}|${r.barra_nome}`}>
                <td className="subtle font-semibold tabular-nums">{i + 1}</td>
                <td>
                  <span className="inline-flex items-center gap-2">
                    <span className={cn('font-medium', semBarra ? 'italic text-fg-subtle' : 'text-fg')}>{r.barra_nome}</span>
                    {r.numero && <span className="subtle tabular-nums">{r.numero}</span>}
                    <CorretoraBadge corretora={r.corretora} />
                  </span>
                </td>
                <td className="num font-semibold">{fmtNum(r.lotes_operados)}</td>
                <td className="num"><ShareBar pct={shareLotes} /></td>
                {comparaAnterior && <td className="num"><DeltaText pct={r.delta_lotes_pct} icon /></td>}
                <td className="num">{fmtNum(r.clientes_ativos)}</td>
                <td className="num text-success">
                  <span className="inline-flex items-center justify-end gap-1"><UserPlus className="h-3 w-3" />{fmtNum(r.clientes_novos)}</span>
                </td>
                <td className="num text-danger">
                  <span className="inline-flex items-center justify-end gap-1"><UserX className="h-3 w-3" />{fmtNum(r.clientes_churn)}</span>
                </td>
                <td className="num">{r.taxa_retencao.toFixed(1)}%</td>
                <td className="num">{r.pct_zeragem.toFixed(1)}%</td>
                <td className="num font-semibold text-success">{fmtBRL(r.receita_total)}</td>
                <td className="num muted">{shareRec.toFixed(1)}%</td>
                {comparaAnterior && <td className="num"><DeltaText pct={r.delta_receita_pct} icon /></td>}
              </tr>
            )
          })}
          <tr className="total">
            <td />
            <td>Total</td>
            <td className="num">{fmtNum(totalLotes)}</td>
            <td className="num muted">100%</td>
            {comparaAnterior && <td />}
            <td colSpan={5} />
            <td className="num text-success">{fmtBRL(totalReceita)}</td>
            <td className="num muted">100%</td>
            {comparaAnterior && <td />}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
