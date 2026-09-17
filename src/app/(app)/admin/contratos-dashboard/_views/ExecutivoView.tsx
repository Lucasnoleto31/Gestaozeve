'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Activity, ArrowRight, CalendarDays, DollarSign, TrendingDown, Users } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { EvolucaoMensalChart } from '../Charts'
import { EvolucaoCorretoraChart } from '../ChartsCorretora'
import { fmtNum, fmtBRL, fmtBRL2, fmtDataPt, labelMesAno } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CORRETORA_COLOR, CORRETORA_LABEL, isCorretora } from '@/lib/corretoras'
import { Panel } from '@/components/ui/Panel'
import { KpiCard, KpiRow, DeltaText } from '@/components/ui/Kpi'
import { Alert } from '@/components/ui/Alert'
import { ChartSkeleton, Empty } from '@/components/ui/Skeleton'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import { MetaProgress, ProgressBar, ShareBar } from '@/components/ui/Progress'
import type {
  RetencaoMensalRow, LotesPorPlataformaRow, ResumoCorretoraRow, MetaAnual, BarraRankingRow, TopClienteRow,
} from '../actions'

export function ExecutivoView() {
  const { periodo, barra, excluir, corretora } = useDashboardFilters()
  const d = useDashboardData(periodo, barra, excluir, corretora, {
    kpis: true, receita: true, meta: true, metasCorretoras: true, evolucao: true,
    receitaBrutaLiquida: true, retencao: true, plataformas: true,
    corretoras: true, evolucaoCorretora: true, ranking: true, topClientes: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  const k = d.kpis
  const ka = d.kpisAnterior
  const pctZeragem = k && k.volume_operados > 0 ? (k.volume_zerados / k.volume_operados) * 100 : null
  const pctZeragemAnt = ka && ka.volume_operados > 0 ? (ka.volume_zerados / ka.volume_operados) * 100 : null

  // Receita bruta do período anterior vem do ranking (soma das barras)
  const receitaAnterior = useMemo(() => d.ranking.reduce((s, r) => s + r.receita_anterior, 0), [d.ranking])
  const topBarras = useMemo(() => [...d.ranking].sort((a, b) => b.lotes_operados - a.lotes_operados).slice(0, 10), [d.ranking])
  const totalLotesBarras = useMemo(() => d.ranking.reduce((s, r) => s + r.lotes_operados, 0), [d.ranking])

  const temMetaEscopo = !!d.meta && (d.meta.meta_receita > 0 || d.meta.meta_lotes > 0)
  const metasCorr = d.metasCorretoras.filter(m => m.meta_receita > 0 || m.meta_lotes > 0)
  const mostraMetas = temMetaEscopo || (!corretora && metasCorr.length > 0)
  const escopoLabel = corretora ? CORRETORA_LABEL[corretora] : 'escritório'
  const rotuloAnterior = periodo === 'tudo' ? undefined : 'vs período anterior'

  return (
    <>
      {d.erro && <Alert tone="danger">{d.erro}</Alert>}

      <p className="text-xs text-fg-muted">
        {d.range.inicio && <>Período <strong className="font-medium text-fg">{fmtDataPt(d.range.inicio)} a {fmtDataPt(d.range.fim)}</strong>. </>}
        {corretora && <>Só a <strong className="font-medium text-fg">{CORRETORA_LABEL[corretora]}</strong>. </>}
        {excluir && <>Excluindo <strong className="font-medium text-fg">{excluir}</strong>. </>}
        Projeção do mês e meta valem para o {escopoLabel} inteiro e não seguem barra nem exclusão.
      </p>

      {/* KPIs com variação vs período anterior (mesma duração) */}
      <KpiRow cols={5}>
        <KpiCard icon={Activity} label="Volume operado" tone="accent" loading={d.loading && !k}
          value={k ? fmtNum(k.volume_operados) : '—'} sub="lotes no período"
          delta={k && ka ? { atual: k.volume_operados, anterior: ka.volume_operados, rotulo: rotuloAnterior, fmt: fmtNum } : null} />
        <KpiCard icon={TrendingDown} label="Volume zerado" tone="danger" loading={d.loading && !k}
          value={k ? fmtNum(k.volume_zerados) : '—'}
          sub={pctZeragem != null ? `${pctZeragem.toFixed(1)}% do operado` : undefined}
          delta={pctZeragem != null && pctZeragemAnt != null
            ? { atual: pctZeragem, anterior: pctZeragemAnt, menorMelhor: true, rotulo: '% zer. vs anterior', fmt: n => `${n.toFixed(1)}%` }
            : null} />
        <KpiCard icon={Users} label="Clientes ativos" tone="violet" loading={d.loading && !k}
          value={k ? fmtNum(k.num_clientes_ativos) : '—'} sub="contas que operaram"
          delta={k && ka ? { atual: k.num_clientes_ativos, anterior: ka.num_clientes_ativos, rotulo: rotuloAnterior, fmt: fmtNum } : null} />
        <KpiCard icon={CalendarDays} label="Média diária" tone="info" loading={d.loading && !k}
          value={k ? fmtNum(k.media_diaria) : '—'}
          sub={k ? `lotes/pregão · ${k.num_dias_com_dado} pregões` : undefined}
          delta={k && ka ? { atual: k.media_diaria, anterior: ka.media_diaria, rotulo: rotuloAnterior, fmt: fmtNum } : null} />
        <KpiCard icon={DollarSign} label="Receita estimada" tone="success" loading={d.loading && !d.receitaBL}
          value={d.receitaBL ? fmtBRL2(d.receitaBL.receita_liquida) : '—'}
          sub={d.receitaBL ? `líquida · bruta ${fmtBRL(d.receitaBL.receita_bruta)} · só WIN/WDO` : 'só WIN/WDO'}
          delta={d.receitaBL && d.ranking.length > 0 && periodo !== 'tudo'
            ? { atual: d.receitaBL.receita_bruta, anterior: receitaAnterior, rotulo: 'bruta vs anterior', fmt: fmtBRL }
            : null} />
      </KpiRow>

      {/* Corretoras lado a lado */}
      <Panel title="Lotes por corretora"
        subtitle="Genial, XP e BTG lado a lado: lotes, participação, zeragem, clientes por conta e receita líquida estimada pela tarifa de cada corretora. Segue período, barra e exclusão de cliente.">
        {d.corretoras.length === 0
          ? <Empty loading={d.loading}>Indisponível: rode o supabase-s13-corretoras.sql no SQL Editor do Supabase.</Empty>
          : <CorretorasCards rows={d.corretoras} selecionada={corretora} />}
      </Panel>

      {/* Top 10 barras */}
      <Panel flush title="Top 10 barras por lotes"
        subtitle="Quem mais girou no período, com variação contra o período anterior de mesma duração."
        action={
          <Link href="/admin/contratos-dashboard/barras" className="link inline-flex items-center gap-1 text-xs">
            Ranking completo <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }>
        {topBarras.length === 0
          ? <div className="p-5"><Empty loading={d.loading} /></div>
          : <TopBarrasTable rows={topBarras} totalLotes={totalLotesBarras} mostraDelta={periodo !== 'tudo'} />}
      </Panel>

      {/* Evolução mensal */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title={`Evolução mensal${corretora ? ` · ${CORRETORA_LABEL[corretora]}` : ''}`}
          subtitle="Lotes operados e zerados por mês + clientes ativos (linha). * = mês em andamento.">
          {d.loading && d.evolucao.length === 0
            ? <ChartSkeleton height={280} />
            : <EvolucaoMensalChart data={d.evolucao.slice(-12)} />}
        </Panel>
        {!corretora ? (
          <Panel title="Evolução mensal por corretora"
            subtitle="Lotes operados por mês, empilhados por corretora. Últimos 12 meses · * = mês em andamento.">
            {d.loading && d.evolucaoCorretora.length === 0
              ? <ChartSkeleton height={280} />
              : <EvolucaoCorretoraChart data={d.evolucaoCorretora} />}
          </Panel>
        ) : (
          <Panel flush title="Top 10 clientes do período" subtitle="Por lotes operados · % acumulado do total.">
            {d.topClientes.length === 0 ? <div className="p-5"><Empty loading={d.loading} /></div> : <TopClientesTable rows={d.topClientes} />}
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {!corretora && (
          <Panel flush title="Top 10 clientes do período" subtitle="Por lotes operados · % acumulado do total.">
            {d.topClientes.length === 0 ? <div className="p-5"><Empty loading={d.loading} /></div> : <TopClientesTable rows={d.topClientes} />}
          </Panel>
        )}
        <Panel flush title="Lotes por plataforma"
          subtitle="Plataforma de negociação informada na importação. Segue todos os filtros.">
          {d.plataformas.length === 0 ? <div className="p-5"><Empty loading={d.loading} /></div> : <PlataformasTable rows={d.plataformas} />}
        </Panel>
      </div>

      {/* Retenção e churn mês a mês */}
      <Panel flush title="Retenção e churn"
        subtitle="Clientes (por número de conta) que operaram no mês e pararam no mês seguinte. Linha marcada como parcial ainda muda com novas importações.">
        {d.retencao.length === 0 ? <div className="p-5"><Empty loading={d.loading} /></div> : <RetencaoTable rows={d.retencao.slice(-12)} />}
      </Panel>

      {/* Meta — escopo (escritório ou corretora) + metas de cada corretora */}
      {mostraMetas && (
        <Panel title={`Meta ${d.meta?.ano ?? metasCorr[0]?.ano ?? ''} · ${escopoLabel}`}
          subtitle={d.meta
            ? `${d.meta.dias_corridos_restantes} dias úteis restantes · ritmo necessário: ${fmtBRL(d.meta.ritmo_receita_necessario)}/pregão`
            : undefined}>
          <div className="space-y-4">
            {temMetaEscopo && d.meta && d.meta.meta_lotes > 0 && (
              <MetaProgress label="Lotes operados" pct={d.meta.pct_lotes}
                realizado={fmtNum(d.meta.realizado_lotes)} alvo={`${fmtNum(d.meta.meta_lotes)} lotes`} />
            )}
            {temMetaEscopo && d.meta && d.meta.meta_receita > 0 && (
              <MetaProgress label="Receita" pct={d.meta.pct_receita}
                realizado={fmtBRL(d.meta.realizado_receita)} alvo={fmtBRL(d.meta.meta_receita)} />
            )}
            {!temMetaEscopo && (
              <p className="text-xs text-fg-muted">Sem meta cadastrada para o escritório inteiro. Metas por corretora abaixo.</p>
            )}
            {!corretora && metasCorr.length > 0 && (
              <div className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-3">
                {metasCorr.map(m => <MetaCorretoraMini key={m.corretora} meta={m} />)}
              </div>
            )}
          </div>
        </Panel>
      )}
    </>
  )
}

// Cards Genial / XP / BTG lado a lado
function CorretorasCards({ rows, selecionada }: { rows: ResumoCorretoraRow[]; selecionada: string | null }) {
  const totalOp = rows.reduce((s, r) => s + r.lotes_operados, 0)
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {rows.map(r => {
        const c = isCorretora(r.corretora) ? r.corretora : null
        const color = c ? CORRETORA_COLOR[c] : 'var(--fg-subtle)'
        const share = totalOp > 0 ? (r.lotes_operados / totalOp) * 100 : 0
        const pctZe = r.lotes_operados > 0 ? (r.lotes_zerados / r.lotes_operados) * 100 : 0
        const ativa = selecionada === r.corretora
        const apagada = selecionada != null && !ativa
        return (
          <div key={r.corretora}
            className={cn('rounded-[10px] border border-line bg-surface-2 p-4', apagada && 'opacity-60')}
            style={{ borderLeft: `3px solid ${color}`, boxShadow: ativa ? `0 0 0 1px ${color}` : undefined }}>
            <div className="flex items-center justify-between">
              <CorretoraBadge corretora={r.corretora} size="md" />
              <span className="text-xs tabular-nums text-fg-muted">{share.toFixed(1)}% do total</span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-fg">{fmtNum(r.lotes_operados)}</p>
            <p className="text-xs text-fg-muted">lotes operados</p>
            <ProgressBar pct={share} color={color} className="mt-2" />
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-fg-muted">Zerados</dt>
              <dd className="text-right tabular-nums text-fg">{fmtNum(r.lotes_zerados)} <span className="text-fg-subtle">({pctZe.toFixed(1)}%)</span></dd>
              <dt className="text-fg-muted">Clientes</dt>
              <dd className="text-right tabular-nums text-fg">{fmtNum(r.num_clientes)}</dd>
              <dt className="text-fg-muted">Pregões</dt>
              <dd className="text-right tabular-nums text-fg">{fmtNum(r.num_dias)}</dd>
              <dt className="text-fg-muted">Receita líquida</dt>
              <dd className="text-right font-semibold tabular-nums text-success">{fmtBRL2(r.receita_liquida)}</dd>
            </dl>
          </div>
        )
      })}
    </div>
  )
}

function TopBarrasTable({ rows, totalLotes, mostraDelta }: { rows: BarraRankingRow[]; totalLotes: number; mostraDelta: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th className="w-10">#</th>
            <th>Barra</th>
            <th className="num">Lotes op.</th>
            <th className="num">Participação</th>
            {mostraDelta && <th className="num">Δ lotes</th>}
            <th className="num">Clientes</th>
            <th className="num">% zer.</th>
            <th className="num">Receita</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const share = totalLotes > 0 ? (r.lotes_operados / totalLotes) * 100 : 0
            const semBarra = r.barra_nome === 'Sem barra'
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
                <td className="num"><ShareBar pct={share} /></td>
                {mostraDelta && <td className="num"><DeltaText pct={r.delta_lotes_pct} /></td>}
                <td className="num">{fmtNum(r.clientes_ativos)}</td>
                <td className="num">{r.pct_zeragem.toFixed(1)}%</td>
                <td className="num font-semibold text-success">{fmtBRL(r.receita_total)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TopClientesTable({ rows }: { rows: TopClienteRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th className="w-10">#</th>
            <th>Cliente</th>
            <th className="num">Lotes op.</th>
            <th className="num">% zer.</th>
            <th className="num">% acum.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(c => {
            const pctZe = c.lotes_operados > 0 ? (c.lotes_zerados / c.lotes_operados) * 100 : 0
            return (
              <tr key={`${c.cliente_nome}-${c.rank}`}>
                <td className="subtle font-semibold tabular-nums">{c.rank}</td>
                <td>
                  <p className="max-w-[240px] truncate font-medium text-fg">{c.cliente_nome}</p>
                  {c.assessor_nome && <p className="max-w-[240px] truncate text-[10.5px] text-fg-subtle">{c.assessor_nome}</p>}
                </td>
                <td className="num font-medium">{fmtNum(c.lotes_operados)}</td>
                <td className="num muted">{pctZe.toFixed(1)}%</td>
                <td className="num muted">{c.pct_acumulado.toFixed(1)}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Meta de uma corretora em formato compacto
function MetaCorretoraMini({ meta }: { meta: MetaAnual }) {
  const c = isCorretora(meta.corretora) ? meta.corretora : null
  const color = c ? CORRETORA_COLOR[c] : 'var(--fg-subtle)'
  const linha = (label: string, pct: number, realizado: string, alvo: string) => (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-fg-muted">{label}</span>
        <span className="font-semibold tabular-nums" style={{ color }}>{pct.toFixed(1)}%</span>
      </div>
      <ProgressBar pct={pct} color={color} className="mt-1" />
      <p className="mt-0.5 text-[10.5px] tabular-nums text-fg-subtle">{realizado} de {alvo}</p>
    </div>
  )
  return (
    <div className="rounded-[10px] border border-line bg-surface-2 p-3">
      <CorretoraBadge corretora={meta.corretora} size="md" />
      {meta.meta_lotes > 0 && linha('Lotes', meta.pct_lotes, fmtNum(meta.realizado_lotes), fmtNum(meta.meta_lotes))}
      {meta.meta_receita > 0 && linha('Receita', meta.pct_receita, fmtBRL(meta.realizado_receita), fmtBRL(meta.meta_receita))}
    </div>
  )
}

// Tabela de lotes por plataforma com barra de participação e linha de total
function PlataformasTable({ rows }: { rows: LotesPorPlataformaRow[] }) {
  const totalOp = rows.reduce((s, r) => s + r.lotes_operados, 0)
  const totalZe = rows.reduce((s, r) => s + r.lotes_zerados, 0)
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Plataforma</th>
            <th className="num">Lotes op.</th>
            <th className="num">% do total</th>
            <th className="num">% zer.</th>
            <th className="num">Clientes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const pctTotal = totalOp > 0 ? (r.lotes_operados / totalOp) * 100 : 0
            const pctZe = r.lotes_operados > 0 ? (r.lotes_zerados / r.lotes_operados) * 100 : 0
            return (
              <tr key={r.plataforma}>
                <td className="font-medium">{r.plataforma}</td>
                <td className="num font-medium">{fmtNum(r.lotes_operados)}</td>
                <td className="num"><ShareBar pct={pctTotal} width={56} /></td>
                <td className="num">{pctZe.toFixed(1)}%</td>
                <td className="num">{fmtNum(r.num_clientes)}</td>
              </tr>
            )
          })}
          <tr className="total">
            <td>Total</td>
            <td className="num">{fmtNum(totalOp)}</td>
            <td className="num muted">100%</td>
            <td className="num">{totalOp > 0 ? `${((totalZe / totalOp) * 100).toFixed(1)}%` : '—'}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// Tabela mensal: Ativos → Continuaram / Pararam → Churn % / Retenção %
function RetencaoTable({ rows }: { rows: RetencaoMensalRow[] }) {
  const churnClass = (pct: number) => pct >= 40 ? 'text-danger' : pct >= 30 ? 'text-warning' : 'text-success'
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Mês</th>
            <th className="num">Ativos no mês</th>
            <th className="num">Continuaram</th>
            <th className="num">Pararam</th>
            <th className="num">Churn %</th>
            <th className="num">Retenção %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.mes}>
              <td className="whitespace-nowrap font-medium">
                {labelMesAno(r.mes)} → {labelMesAno(r.mes_seguinte)}{r.parcial ? <span className="subtle"> (parcial)</span> : ''}
              </td>
              <td className="num">{fmtNum(r.ativos)}</td>
              <td className="num text-success">{fmtNum(r.continuaram)}</td>
              <td className="num text-danger">{fmtNum(r.pararam)}</td>
              <td className={cn('num font-semibold', churnClass(r.churn_pct))}>{r.churn_pct.toFixed(1)}%</td>
              <td className="num font-semibold">{r.retencao_pct.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
