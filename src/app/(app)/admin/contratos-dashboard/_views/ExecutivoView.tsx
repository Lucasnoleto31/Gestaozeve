'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  TrendingDown, Users, Activity, DollarSign, Layers, CalendarDays, ArrowRight,
} from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { Block } from '../_lib/Blocks'
import { EvolucaoMensalChart, BlockSkeleton } from '../Charts'
import { EvolucaoCorretoraChart, CorretoraBadge } from '../ChartsCorretora'
import { fmtNum, fmtBRL, fmtBRL2, fmtDelta, fmtDataPt } from '../_lib/utils'
import { KpiCard, KpiRow, Vazio } from '../_lib/Kpi'
import { CORRETORA_COLOR, CORRETORA_LABEL, isCorretora } from '@/lib/corretoras'
import type { RetencaoMensalRow, LotesPorPlataformaRow, ResumoCorretoraRow, MetaAnual, BarraRankingRow, TopClienteRow } from '../actions'

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function labelMesAno(iso: string): string {
  const m = parseInt(iso.slice(5, 7), 10)
  return `${MESES_ABREV[m - 1] ?? iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

const th = (align: 'left' | 'right') =>
  `px-3 py-2 font-semibold text-gray-500 ${align === 'left' ? 'text-left' : 'text-right'}`
const rowStyle = (i: number) => ({
  borderTop: '1px solid var(--border)',
  background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
})

function DeltaTxt({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-gray-300">—</span>
  const color = pct > 0.05 ? '#059669' : pct < -0.05 ? '#dc2626' : '#6b7280'
  return <span className="font-semibold tabular-nums" style={{ color }}>{fmtDelta(pct)}</span>
}

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
    <div className="space-y-5">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
        <p>
          {d.range.inicio && <>Período <strong className="text-gray-700">{fmtDataPt(d.range.inicio)} a {fmtDataPt(d.range.fim)}</strong>. </>}
          {corretora && <>Só a <strong className="text-gray-700">{CORRETORA_LABEL[corretora]}</strong>. </>}
          {excluir && <>Excluindo <strong className="text-gray-700">{excluir}</strong>. </>}
          Projeção do mês e meta valem para o {escopoLabel} inteiro e não seguem barra nem exclusão.
        </p>
      </div>

      {/* KPIs com variação vs período anterior (mesma duração) */}
      <KpiRow cols={5}>
        <KpiCard icon={Activity} label="Volume operado" loading={d.loading && !k}
          value={k ? fmtNum(k.volume_operados) : '—'} sub="lotes no período" accent="#1764f4"
          delta={k && ka ? { atual: k.volume_operados, anterior: ka.volume_operados, rotulo: rotuloAnterior, fmt: fmtNum } : null} />
        <KpiCard icon={TrendingDown} label="Volume zerado" loading={d.loading && !k}
          value={k ? fmtNum(k.volume_zerados) : '—'}
          sub={pctZeragem != null ? `${pctZeragem.toFixed(1)}% do operado` : undefined} accent="#dc2626"
          delta={pctZeragem != null && pctZeragemAnt != null
            ? { atual: pctZeragem, anterior: pctZeragemAnt, menorMelhor: true, rotulo: '% zer. vs anterior', fmt: n => `${n.toFixed(1)}%` }
            : null} />
        <KpiCard icon={Users} label="Clientes ativos" loading={d.loading && !k}
          value={k ? fmtNum(k.num_clientes_ativos) : '—'} sub="contas que operaram" accent="#a855f7"
          delta={k && ka ? { atual: k.num_clientes_ativos, anterior: ka.num_clientes_ativos, rotulo: rotuloAnterior, fmt: fmtNum } : null} />
        <KpiCard icon={CalendarDays} label="Média diária" loading={d.loading && !k}
          value={k ? fmtNum(k.media_diaria) : '—'}
          sub={k ? `lotes/pregão · ${k.num_dias_com_dado} pregões` : undefined} accent="#0891b2"
          delta={k && ka ? { atual: k.media_diaria, anterior: ka.media_diaria, rotulo: rotuloAnterior, fmt: fmtNum } : null} />
        <KpiCard icon={DollarSign} label="Receita estimada" loading={d.loading && !d.receitaBL}
          value={d.receitaBL ? fmtBRL2(d.receitaBL.receita_liquida) : '—'}
          sub={d.receitaBL ? `líquida · bruta ${fmtBRL(d.receitaBL.receita_bruta)} · só WIN/WDO` : 'só WIN/WDO'}
          accent="#10b981"
          delta={d.receitaBL && d.ranking.length > 0 && periodo !== 'tudo'
            ? { atual: d.receitaBL.receita_bruta, anterior: receitaAnterior, rotulo: 'bruta vs anterior', fmt: fmtBRL }
            : null} />
      </KpiRow>

      {/* Corretoras lado a lado */}
      <Block title="Lotes por corretora"
        subtitle="Genial, XP e BTG lado a lado: lotes, participação, zeragem, clientes por conta e receita líquida estimada pela tarifa de cada corretora. Segue período, barra e exclusão de cliente.">
        {d.corretoras.length === 0
          ? <Vazio loading={d.loading}>Indisponível: rode o supabase-s13-corretoras.sql no SQL Editor do Supabase.</Vazio>
          : <CorretorasCards rows={d.corretoras} selecionada={corretora} />}
      </Block>

      {/* Top 10 barras */}
      <Block title="Top 10 barras por lotes"
        subtitle="Quem mais girou no período, com variação contra o período anterior de mesma duração. Ranking completo na aba Barras."
        action={
          <Link href="/admin/contratos-dashboard/barras" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
            Ver todas <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        }>
        {topBarras.length === 0
          ? <Vazio loading={d.loading} />
          : <TopBarrasTable rows={topBarras} totalLotes={totalLotesBarras} mostraDelta={periodo !== 'tudo'} />}
      </Block>

      {/* Evolução mensal */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Block title={`Evolução mensal${corretora ? ` · ${CORRETORA_LABEL[corretora]}` : ''}`}
          subtitle="Lotes operados (azul) e zerados (vermelho) + clientes ativos (linha roxa). * = mês em andamento.">
          {d.loading && d.evolucao.length === 0
            ? <BlockSkeleton height={280} />
            : <EvolucaoMensalChart data={d.evolucao.slice(-12)} />}
        </Block>
        {!corretora ? (
          <Block title="Evolução mensal por corretora"
            subtitle="Lotes operados por mês, empilhados por corretora. Últimos 12 meses · * = mês em andamento.">
            {d.loading && d.evolucaoCorretora.length === 0
              ? <BlockSkeleton height={280} />
              : <EvolucaoCorretoraChart data={d.evolucaoCorretora} />}
          </Block>
        ) : (
          <Block title="Top 10 clientes do período" subtitle="Por lotes operados · % acumulado do total.">
            {d.topClientes.length === 0 ? <Vazio loading={d.loading} /> : <TopClientesTable rows={d.topClientes} />}
          </Block>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {!corretora && (
          <Block title="Top 10 clientes do período" subtitle="Por lotes operados · % acumulado do total.">
            {d.topClientes.length === 0 ? <Vazio loading={d.loading} /> : <TopClientesTable rows={d.topClientes} />}
          </Block>
        )}
        <Block title="Lotes por plataforma"
          subtitle="Plataforma de negociação informada na importação. Segue todos os filtros.">
          {d.plataformas.length === 0 ? <Vazio loading={d.loading} /> : <PlataformasTable rows={d.plataformas} />}
        </Block>
      </div>

      {/* Retenção e churn mês a mês */}
      <Block title="Retenção e churn"
        subtitle="Clientes (por número de conta) que operaram no mês e pararam no mês seguinte. Linha marcada como parcial ainda muda com novas importações.">
        {d.retencao.length === 0 ? <Vazio loading={d.loading} /> : <RetencaoTable rows={d.retencao.slice(-12)} />}
      </Block>

      {/* Meta — escopo (escritório ou corretora) + metas de cada corretora */}
      {mostraMetas && (
        <Block title={`Meta ${d.meta?.ano ?? metasCorr[0]?.ano ?? ''} · ${escopoLabel}`}
          subtitle={d.meta
            ? `${d.meta.dias_corridos_restantes} dias úteis restantes · ritmo necessário: ${fmtBRL(d.meta.ritmo_receita_necessario)}/pregão`
            : undefined}>
          <div className="space-y-3">
            {temMetaEscopo && d.meta && d.meta.meta_lotes > 0 && (
              <MetaProgresso label="Lotes operados" pct={d.meta.pct_lotes}
                realizado={d.meta.realizado_lotes} meta={d.meta.meta_lotes} sufixo=" lotes" />
            )}
            {temMetaEscopo && d.meta && d.meta.meta_receita > 0 && (
              <MetaProgresso label="Receita" pct={d.meta.pct_receita}
                realizado={d.meta.realizado_receita} meta={d.meta.meta_receita} isCurrency />
            )}
            {!temMetaEscopo && (
              <p className="text-xs text-gray-500">Sem meta cadastrada para o escritório inteiro. Metas por corretora abaixo.</p>
            )}
            {!corretora && metasCorr.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                {metasCorr.map(m => <MetaCorretoraMini key={m.corretora} meta={m} />)}
              </div>
            )}
          </div>
        </Block>
      )}

      {d.isPending && (
        <div className="text-xs text-gray-400 flex items-center gap-2 justify-end">
          <Layers className="w-3 h-3 animate-pulse" /> atualizando…
        </div>
      )}
    </div>
  )
}

// Cards Genial / XP / BTG lado a lado
function CorretorasCards({ rows, selecionada }: { rows: ResumoCorretoraRow[]; selecionada: string | null }) {
  const totalOp = rows.reduce((s, r) => s + r.lotes_operados, 0)
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {rows.map(r => {
        const c = isCorretora(r.corretora) ? r.corretora : null
        const color = c ? CORRETORA_COLOR[c] : '#64748b'
        const share = totalOp > 0 ? (r.lotes_operados / totalOp) * 100 : 0
        const pctZe = r.lotes_operados > 0 ? (r.lotes_zerados / r.lotes_operados) * 100 : 0
        const ativa = selecionada === r.corretora
        const apagada = selecionada != null && !ativa
        return (
          <div key={r.corretora} className="rounded-xl p-4"
            style={{ background: 'var(--surface)', border: `1px solid ${ativa ? color : 'var(--border)'}`,
                     borderLeft: `4px solid ${color}`, opacity: apagada ? 0.55 : 1 }}>
            <div className="flex items-center justify-between">
              <CorretoraBadge corretora={r.corretora} size="md" />
              <span className="text-xs text-gray-500 tabular-nums">{share.toFixed(1)}% do total</span>
            </div>
            <p className="text-2xl font-bold tabular-nums mt-2 text-gray-800">{fmtNum(r.lotes_operados)}</p>
            <p className="text-xs text-gray-500">lotes operados</p>
            <div className="w-full h-1.5 rounded-full overflow-hidden mt-2" style={{ background: 'rgba(148,163,184,0.2)' }}>
              <div className="h-full" style={{ width: `${Math.min(100, share)}%`, background: color }} />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 text-xs">
              <span className="text-gray-500">Zerados</span>
              <span className="text-right tabular-nums text-gray-700">{fmtNum(r.lotes_zerados)} <span className="text-gray-400">({pctZe.toFixed(1)}%)</span></span>
              <span className="text-gray-500">Clientes</span>
              <span className="text-right tabular-nums text-gray-700">{fmtNum(r.num_clientes)}</span>
              <span className="text-gray-500">Pregões</span>
              <span className="text-right tabular-nums text-gray-700">{fmtNum(r.num_dias)}</span>
              <span className="text-gray-500">Receita líquida</span>
              <span className="text-right tabular-nums font-semibold text-emerald-700">{fmtBRL2(r.receita_liquida)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TopBarrasTable({ rows, totalLotes, mostraDelta }: { rows: BarraRankingRow[]; totalLotes: number; mostraDelta: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
      <table className="text-xs border-collapse w-full min-w-max">
        <thead style={{ background: 'var(--surface-2)' }}>
          <tr>
            <th className={th('left')}>#</th>
            <th className={th('left')}>Barra</th>
            <th className={th('right')}>Lotes op.</th>
            <th className={th('left')}>Participação</th>
            {mostraDelta && <th className={th('right')}>Δ lotes</th>}
            <th className={th('right')}>Clientes</th>
            <th className={th('right')}>% zer.</th>
            <th className={th('right')}>Receita</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const share = totalLotes > 0 ? (r.lotes_operados / totalLotes) * 100 : 0
            const semBarra = r.barra_nome === 'Sem barra'
            return (
              <tr key={`${r.corretora}|${r.barra_nome}`} style={rowStyle(i)}>
                <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{i + 1}</td>
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-2">
                    <span className={`font-medium ${semBarra ? 'text-gray-400 italic' : 'text-gray-700'}`}>{r.barra_nome}</span>
                    {r.numero && <span className="text-gray-400 tabular-nums">{r.numero}</span>}
                    <CorretoraBadge corretora={r.corretora} />
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtNum(r.lotes_operados)}</td>
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 rounded-full" style={{ width: `${Math.max(3, Math.round(share * 1.2))}px`, background: '#1764f4', opacity: 0.7 }} />
                    <span className="tabular-nums text-gray-500">{share.toFixed(1)}%</span>
                  </span>
                </td>
                {mostraDelta && <td className="px-3 py-1.5 text-right"><DeltaTxt pct={r.delta_lotes_pct} /></td>}
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(r.clientes_ativos)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.pct_zeragem.toFixed(1)}%</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-emerald-700">{fmtBRL(r.receita_total)}</td>
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
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
      <table className="text-xs border-collapse w-full">
        <thead style={{ background: 'var(--surface-2)' }}>
          <tr>
            <th className={th('left')}>#</th>
            <th className={th('left')}>Cliente</th>
            <th className={th('right')}>Lotes op.</th>
            <th className={th('right')}>% zer.</th>
            <th className={th('right')}>% acum.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const pctZe = c.lotes_operados > 0 ? (c.lotes_zerados / c.lotes_operados) * 100 : 0
            return (
              <tr key={`${c.cliente_nome}-${c.rank}`} style={rowStyle(i)}>
                <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{c.rank}</td>
                <td className="px-3 py-1.5">
                  <p className="font-medium text-gray-700 truncate max-w-[220px]">{c.cliente_nome}</p>
                  {c.assessor_nome && <p className="text-[10px] text-gray-400 truncate max-w-[220px]">{c.assessor_nome}</p>}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtNum(c.lotes_operados)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{pctZe.toFixed(1)}%</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{c.pct_acumulado.toFixed(1)}%</td>
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
  const color = c ? CORRETORA_COLOR[c] : '#64748b'
  const linha = (label: string, pct: number, realizado: string, alvo: string) => (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <span className="tabular-nums font-semibold" style={{ color }}>{pct.toFixed(1)}%</span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden mt-1" style={{ background: 'rgba(148,163,184,0.2)' }}>
        <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">{realizado} de {alvo}</p>
    </div>
  )
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
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
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
      <table className="text-xs border-collapse w-full">
        <thead style={{ background: 'var(--surface-2)' }}>
          <tr>
            {['Plataforma', 'Lotes op.', '% do total', '% zer.', 'Clientes'].map((h, i) => (
              <th key={i} className={th(i === 0 ? 'left' : 'right')}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const pctTotal = totalOp > 0 ? (r.lotes_operados / totalOp) * 100 : 0
            const pctZe = r.lotes_operados > 0 ? (r.lotes_zerados / r.lotes_operados) * 100 : 0
            return (
              <tr key={r.plataforma} style={rowStyle(i)}>
                <td className="px-3 py-1.5 font-semibold text-gray-700">{r.plataforma}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtNum(r.lotes_operados)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                  <span className="inline-flex items-center justify-end gap-2">
                    <span className="h-1.5 rounded-full"
                      style={{ width: `${Math.max(2, Math.round(pctTotal * 0.8))}px`, background: '#1764f4', opacity: 0.7 }} />
                    {pctTotal.toFixed(1)}%
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{pctZe.toFixed(1)}%</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(r.num_clientes)}</td>
              </tr>
            )
          })}
          <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
            <td className="px-3 py-2 font-bold text-gray-800">Total</td>
            <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-800">{fmtNum(totalOp)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-500">100%</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold">
              {totalOp > 0 ? `${((totalZe / totalOp) * 100).toFixed(1)}%` : '—'}
            </td>
            <td className="px-3 py-2" />
          </tr>
        </tbody>
      </table>
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
            <th className={th('left')}>Mês</th>
            <th className={th('right')}>Ativos no mês</th>
            <th className={th('right')}>Continuaram</th>
            <th className={th('right')}>Pararam</th>
            <th className={th('right')}>Churn %</th>
            <th className={th('right')}>Retenção %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.mes} style={rowStyle(i)}>
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

