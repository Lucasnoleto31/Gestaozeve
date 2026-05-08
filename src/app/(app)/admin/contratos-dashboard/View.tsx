'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  TrendingUp, TrendingDown, Calendar, Trophy, Activity,
  Users, FileStack, Layers, Target, RefreshCw, Download, X,
  ShieldAlert, CheckCircle2,
} from 'lucide-react'
import type {
  Periodo, DashboardKpis, ProdutoRow, TopClienteRow,
  DiarioProdutoRow, HeatmapCell, EvolucaoMensalRow, DrilldownRow,
  ReceitaTotal, ReceitaPorAssessor, ReceitaProjecao, MetaAnual,
  AlertaRow, AcuracidadeResumo, AcuracidadePonto,
} from './actions'
import {
  WinVsWdoChart, EvolucaoMensalChart, AcuracidadeChart,
  BlockSkeleton, KpiSkeleton,
} from './Charts'

interface Actions {
  getKpis: (p: Periodo, barra?: string | null) => Promise<DashboardKpis>
  getPorProduto: (p: Periodo, barra?: string | null) => Promise<ProdutoRow[]>
  getTopClientes: (p: Periodo, limit?: number, barra?: string | null) => Promise<TopClienteRow[]>
  getDiarioProduto: (p: Periodo, barra?: string | null) => Promise<DiarioProdutoRow[]>
  getHeatmapDow: (p: Periodo, barra?: string | null) => Promise<HeatmapCell[]>
  getEvolucaoMensal: () => Promise<EvolucaoMensalRow[]>
  getDrilldownDia: (data: string) => Promise<DrilldownRow[]>
  getReceitaTotal: (p: Periodo) => Promise<ReceitaTotal>
  getReceitaPorAssessor: (p: Periodo) => Promise<ReceitaPorAssessor[]>
  getReceitaProjecao: () => Promise<ReceitaProjecao>
  getMetaAnual: () => Promise<MetaAnual>
  getAlertas: (inativoDias?: number, barra?: string | null) => Promise<AlertaRow[]>
  getAcuracidadeResumo: (lookbackDays?: number) => Promise<AcuracidadeResumo>
  getAcuracidadeSerie: (lookbackDays?: number) => Promise<AcuracidadePonto[]>
  getBarrasAtivas: () => Promise<{ barra_nome: string; numero: string | null }[]>
}

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: 'hoje',         label: 'Hoje' },
  { id: 'semana',       label: '7 dias' },
  { id: '30d',          label: '30 dias' },
  { id: 'mes',          label: 'Mês' },
  { id: 'mes_anterior', label: 'Mês anterior' },
  { id: 'tudo',         label: 'Tudo' },
]

// ===========================================================
// Utils
// ===========================================================
const fmtNum = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtNum2 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

function fmtDataPt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const PRODUTO_COLOR: Record<string, string> = {
  WIN: '#1764f4',
  WDO: '#16a34a',
  BIT: '#f59e0b',
  IND: '#a855f7',
  DOL: '#dc2626',
  OUTRO: '#6b7280',
}
const colorFor = (p: string) => PRODUTO_COLOR[p] ?? '#64748b'

// ===========================================================
// Card / containers reutilizáveis
// ===========================================================
export function Block({ title, subtitle, action, children }:
  { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }
) {
  return (
    <section className="rounded-2xl p-5"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <header className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

function KpiCard({ icon: Icon, label, value, sub, color = 'text-gray-900', bg = 'bg-blue-50', iconColor = 'text-blue-600' }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  color?: string; bg?: string; iconColor?: string;
}) {
  return (
    <div className="rounded-xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${bg}`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </span>
        <span className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">{label}</span>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ===========================================================
// Filtro de período (pílulas)
// ===========================================================
function PeriodoFilter({ value, onChange, isLoading, datasetMax, barras, barraSelecionada, onBarraChange }: {
  value: Periodo; onChange: (p: Periodo) => void; isLoading: boolean; datasetMax: string | null;
  barras: { barra_nome: string; numero: string | null }[];
  barraSelecionada: string | null;
  onBarraChange: (b: string | null) => void;
}) {
  return (
    <div className="rounded-2xl p-4 flex flex-wrap items-center gap-3"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Período</span>
      <div className="flex flex-wrap gap-1.5">
        {PERIODOS.map(p => {
          const active = p.id === value
          return (
            <button key={p.id} onClick={() => onChange(p.id)} disabled={isLoading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              style={active
                ? { background: 'var(--blue)', color: '#fff' }
                : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
              {p.label}
            </button>
          )
        })}
      </div>

      <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold ml-2">Barra</span>
      <select
        value={barraSelecionada ?? ''}
        onChange={e => onBarraChange(e.target.value || null)}
        disabled={isLoading}
        className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 cursor-pointer"
        style={{ background: barraSelecionada ? 'var(--blue)' : 'var(--surface)',
                 color: barraSelecionada ? '#fff' : 'var(--muted)',
                 border: '1px solid var(--border)', minWidth: 200 }}>
        <option value="">Todas as barras</option>
        {barras.map(b => (
          <option key={b.barra_nome} value={b.barra_nome}>
            {b.barra_nome}{b.numero ? ` · ${b.numero}` : ''}
          </option>
        ))}
      </select>

      <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
        {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
        {datasetMax && (
          <span title="Data mais recente no dataset">
            Dataset até <strong className="text-gray-700">{fmtDataPt(datasetMax)}</strong>
          </span>
        )}
      </div>
    </div>
  )
}

// ===========================================================
// KPI Grid
// ===========================================================
export function KpiGrid({ kpis }: { kpis: DashboardKpis }) {
  const ratio = kpis.media_30d > 0
    ? ((kpis.volume_hoje - kpis.media_30d) / kpis.media_30d) * 100
    : null
  const ratioLbl = ratio == null ? '—'
    : `${ratio > 0 ? '+' : ''}${ratio.toFixed(1)}%`
  const ratioColor = ratio == null ? 'text-gray-400'
    : ratio >= 0 ? 'text-emerald-600' : 'text-red-600'
  const TrendIcon = ratio != null && ratio < 0 ? TrendingDown : TrendingUp
  const pctZeramento = kpis.volume_operados > 0
    ? (kpis.volume_zerados / kpis.volume_operados) * 100 : 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard icon={FileStack} label="Lotes operados (período)"
        value={fmtNum(kpis.volume_operados)} sub={`${fmtNum(kpis.num_dias_com_dado)} dia(s) com dado`} />
      <KpiCard icon={Layers} label="Lotes zerados (período)"
        value={fmtNum(kpis.volume_zerados)} sub={`${pctZeramento.toFixed(1)}% de zeramento`}
        bg="bg-red-50" iconColor="text-red-500" color="text-red-700" />
      <KpiCard icon={Users} label="Clientes ativos"
        value={fmtNum(kpis.num_clientes_ativos)} sub="com volume operado no período"
        bg="bg-emerald-50" iconColor="text-emerald-600" />
      <KpiCard icon={Trophy} label="Maior dia em lotes"
        value={fmtNum(kpis.maior_dia_lotes)}
        sub={kpis.maior_dia_data ? fmtDataPt(kpis.maior_dia_data) : '—'}
        bg="bg-amber-50" iconColor="text-amber-600" />
      <KpiCard icon={Activity} label="Volume hoje"
        value={fmtNum(kpis.volume_hoje)} sub={`Média 30d: ${fmtNum(kpis.media_30d)}`} />
      <KpiCard icon={TrendIcon} label="Hoje vs média 30d"
        value={ratioLbl} sub="janela móvel encerrada ontem"
        bg="bg-blue-50" iconColor="text-blue-600" color={ratioColor} />
      <KpiCard icon={Calendar} label="Dataset mais recente"
        value={fmtDataPt(kpis.dataset_max)} sub="última data importada" />
    </div>
  )
}

// ===========================================================
// Cards por produto (WIN/WDO/BIT/...)
// ===========================================================
export function PorProdutoBlock({ data }: { data: ProdutoRow[] }) {
  const total = data.reduce((s, r) => s + r.lotes_operados, 0) || 1
  return (
    <Block title="Volume por produto" subtitle="Operados e zerados por código (WIN, WDO, etc.)">
      {data.length === 0
        ? <p className="text-sm text-gray-400 py-4">Sem dados.</p>
        : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.map(r => {
              const pct = (r.lotes_operados / total) * 100
              const cor = colorFor(r.produto)
              return (
                <div key={r.produto} className="rounded-xl p-3"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold tracking-wider" style={{ color: cor }}>{r.produto}</span>
                    <span className="text-[10px] text-gray-400 font-semibold">{pct.toFixed(1)}%</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900 tabular-nums">{fmtNum(r.lotes_operados)}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Zerados: <span className="text-gray-700">{fmtNum(r.lotes_zerados)}</span> · {fmtNum(r.num_clientes)} cli
                  </p>
                  <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div style={{ width: `${pct}%`, background: cor, height: '100%' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
    </Block>
  )
}

// ===========================================================
// Pareto top 20 clientes
// ===========================================================
export function TopClientesParetoBlock({ data, onPickCliente }:
  { data: TopClienteRow[]; onPickCliente?: (id: string | null) => void }
) {
  const max = Math.max(1, ...data.map(r => r.lotes_operados))
  return (
    <Block title="Pareto · Top 20 clientes (operados)"
      subtitle="Pontos onde o volume está concentrado — clique no nome pra abrir o cliente"
    >
      {data.length === 0
        ? <p className="text-sm text-gray-400 py-4">Sem dados.</p>
        : (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
            <table className="text-xs border-collapse min-w-max w-full">
              <thead style={{ background: 'var(--surface-2)' }}>
                <tr>
                  {['#', 'Cliente', 'Assessor', 'Operados', 'Zerados', '% acum'].map((h, i) => (
                    <th key={i}
                      className={`px-3 py-2 font-semibold text-gray-500 border-r last:border-r-0 ${i <= 2 ? 'text-left' : 'text-right'}`}
                      style={{ borderColor: 'var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((r, idx) => (
                  <tr key={`${r.cliente_id ?? r.cliente_nome}-${idx}`}
                    style={{ borderTop: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                    <td className="px-3 py-1.5 font-semibold text-gray-700 tabular-nums">{r.rank}</td>
                    <td className="px-3 py-1.5">
                      <button onClick={() => onPickCliente?.(r.cliente_id)}
                        className="text-blue-600 hover:underline text-left">
                        {r.cliente_nome}
                      </button>
                    </td>
                    <td className="px-3 py-1.5 text-gray-500">{r.assessor_nome ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-gray-900 font-semibold">{fmtNum(r.lotes_operados)}</span>
                        <span className="inline-block h-1.5 rounded-full" style={{
                          width: `${(r.lotes_operados / max) * 80}px`, background: 'var(--blue)',
                        }} />
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtNum(r.lotes_zerados)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-gray-700">{r.pct_acumulado.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Block>
  )
}

// ===========================================================
// WIN vs WDO diário (gráfico SVG simples + média móvel 7d)
// ===========================================================
export function WinVsWdoBlock({ data, onClickDia }: { data: DiarioProdutoRow[]; onClickDia: (data: string) => void }) {
  return (
    <Block title="WIN vs WDO — diário"
      subtitle="Lotes operados por dia. Linha pontilhada = média móvel 7 dias. Clique num ponto pra abrir o dia."
    >
      <WinVsWdoChart data={data} onClickDia={onClickDia} />
    </Block>
  )
}

// ===========================================================
// Heatmap dia da semana × semana do mês
// ===========================================================
export function HeatmapBlock({ data }: { data: HeatmapCell[] }) {
  const max = Math.max(1, ...data.map(r => r.media_diaria))
  const dows = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const semanas = Array.from(new Set(data.map(r => r.semana_mes))).sort()
  const map = new Map<string, HeatmapCell>()
  data.forEach(r => map.set(`${r.dow}|${r.semana_mes}`, r))
  const colorAt = (v: number) => {
    if (v <= 0) return '#f9fafb'
    const t = Math.min(1, v / max)
    if (t < 0.2) return '#dbeafe'
    if (t < 0.4) return '#93c5fd'
    if (t < 0.6) return '#60a5fa'
    if (t < 0.8) return '#3b82f6'
    return '#1d4ed8'
  }
  return (
    <Block title="Heatmap · dia da semana × semana do mês"
      subtitle="Média diária de lotes operados — quanto mais escuro, maior o volume típico."
    >
      {data.length === 0
        ? <p className="text-sm text-gray-400 py-4">Sem dados.</p>
        : (
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-gray-400 font-medium" />
                  {semanas.map(w => <th key={w} className="px-2 py-1 text-gray-500 font-medium">Sem {w}</th>)}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map(dow => ( // só úteis, segunda a sexta
                  <tr key={dow}>
                    <td className="px-2 py-1 text-gray-500 font-medium">{dows[dow]}</td>
                    {semanas.map(w => {
                      const c = map.get(`${dow}|${w}`)
                      const v = c?.media_diaria ?? 0
                      return (
                        <td key={w} className="px-1 py-1">
                          <div className="rounded-md text-center font-semibold tabular-nums"
                            style={{
                              background: colorAt(v),
                              color: v / max > 0.5 ? '#fff' : '#0f172a',
                              padding: '8px 10px', minWidth: 56,
                            }}
                            title={c ? `${dows[dow]} · semana ${w} · ${c.num_dias} dia(s) · média ${fmtNum2(v)}` : 'sem dados'}>
                            {v > 0 ? fmtNum(v) : '—'}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Block>
  )
}

// ===========================================================
// Evolução mensal — Recharts BarChart stacked
// ===========================================================
export function EvolucaoMensalBlock({ data }: { data: EvolucaoMensalRow[] }) {
  return (
    <Block title="Evolução mensal" subtitle="Lotes operados + zerados por mês.">
      <EvolucaoMensalChart data={data} />
    </Block>
  )
}

// ===========================================================
// Receita & Meta
// ===========================================================
const fmtBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtBRL2 = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function ReceitaBlock({ total, porAssessor, projecao }:
  { total: ReceitaTotal | null; porAssessor: ReceitaPorAssessor[]; projecao: ReceitaProjecao | null }
) {
  return (
    <Block title="Receita (período)"
      subtitle="Calculada com base nas tarifas cadastradas em /admin/assessor-pricing — apenas WIN/WDO no momento."
    >
      {!total
        ? <p className="text-sm text-gray-400 py-4">Carregando…</p>
        : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <KpiCard icon={Activity} label="Operados (R$)"
                value={fmtBRL(total.receita_operados)} sub="lotes WIN/WDO × tarifa" />
              <KpiCard icon={Layers} label="Zeragem (R$)"
                value={fmtBRL(total.receita_zeragem)} sub={total.receita_zeragem > 0 ? 'modelos fixo / mesmo_operado' : '0 onde modelo = b2b'}
                bg="bg-red-50" iconColor="text-red-600" color={total.receita_zeragem > 0 ? 'text-red-700' : 'text-gray-400'} />
              <KpiCard icon={Trophy} label="Total (R$)"
                value={fmtBRL(total.receita_total)} sub="soma operados + zeragem"
                bg="bg-emerald-50" iconColor="text-emerald-600" color="text-emerald-700" />
              <KpiCard icon={Target} label="Projeção do mês"
                value={projecao ? fmtBRL(projecao.projecao_total) : '—'}
                sub={projecao ? `consolidado ${fmtBRL(projecao.receita_consolidada)} · faltam ${projecao.dias_corridos_restantes}d` : ''}
                bg="bg-violet-50" iconColor="text-violet-600" color="text-violet-700" />
            </div>

            {total.num_barras_sem_pricing > 0 && (
              <div className="text-xs px-3 py-2 mb-3 rounded-xl"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', color: '#92400e' }}>
                {total.num_barras_sem_pricing} de {total.num_barras} barras sem tarifa cadastrada — receita pode estar subestimada.
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['Barra', 'Nº', 'R$/lote', 'Modelo zeragem', 'Lotes op.', 'Lotes ze.', 'Receita op.', 'Receita ze.', 'Total'].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 border-r last:border-r-0 ${i <= 3 ? 'text-left' : 'text-right'}`}
                        style={{ borderColor: 'var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porAssessor.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">Sem dados.</td></tr>
                  )}
                  {porAssessor.map((r, i) => (
                    <tr key={r.barra_nome + i}
                      style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                      <td className="px-3 py-1.5 font-medium text-gray-700">{r.barra_nome}</td>
                      <td className="px-3 py-1.5 text-gray-500 tabular-nums">{r.numero ?? '—'}</td>
                      <td className="px-3 py-1.5 tabular-nums text-gray-500">
                        {r.preco_lote_futuros > 0 ? fmtBRL2(r.preco_lote_futuros) : <span className="text-amber-600">—</span>}
                      </td>
                      <td className="px-3 py-1.5 text-gray-500">{r.modelo_zeragem}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(r.lotes_operados)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtNum(r.lotes_zerados)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtBRL(r.receita_operados)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtBRL(r.receita_zeragem)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-emerald-700">{fmtBRL(r.receita_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
    </Block>
  )
}

export function MetaBlock({ meta }: { meta: MetaAnual | null }) {
  if (!meta) return null
  const noMeta = meta.meta_lotes <= 0 && meta.meta_receita <= 0
  if (noMeta) {
    return (
      <Block title={`Meta ${meta.ano || new Date().getFullYear()}`}
        subtitle="Sem meta cadastrada para o ano corrente."
        action={
          <a href="/admin/metas" className="text-xs text-blue-600 hover:underline">Configurar meta →</a>
        }
      >
        <p className="text-sm text-gray-400 py-4">Cadastre meta em <strong>/admin/metas</strong> para ver o tracking aqui.</p>
      </Block>
    )
  }
  const colorPct = (pct: number) => pct >= 100 ? '#10b981' : pct >= 70 ? '#3b82f6' : pct >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <Block title={`Meta ${meta.ano}`} subtitle={`${meta.dias_corridos_restantes} dia(s) corridos restantes no ano`}
      action={<a href="/admin/metas" className="text-xs text-blue-600 hover:underline">Editar meta →</a>}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ProgressBar
          label="Lotes operados"
          realizado={meta.realizado_lotes}
          meta={meta.meta_lotes}
          pct={meta.pct_lotes}
          colorBar={colorPct(meta.pct_lotes)}
          fmt={fmtNum}
          ritmoLabel={`Ritmo necessário: ${fmtNum(meta.ritmo_lotes_necessario)} lotes/dia`}
        />
        <ProgressBar
          label="Receita (R$)"
          realizado={meta.realizado_receita}
          meta={meta.meta_receita}
          pct={meta.pct_receita}
          colorBar={colorPct(meta.pct_receita)}
          fmt={fmtBRL}
          ritmoLabel={`Ritmo necessário: ${fmtBRL(meta.ritmo_receita_necessario)}/dia`}
        />
      </div>
    </Block>
  )
}

function ProgressBar({ label, realizado, meta, pct, colorBar, fmt, ritmoLabel }: {
  label: string; realizado: number; meta: number; pct: number; colorBar: string; fmt: (n: number) => string; ritmoLabel: string;
}) {
  const w = Math.min(100, Math.max(0, pct))
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{label}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color: colorBar }}>{pct.toFixed(1)}%</span>
      </div>
      <div className="text-base font-bold tabular-nums text-gray-900">
        {fmt(realizado)} <span className="text-xs font-medium text-gray-400">de {fmt(meta)}</span>
      </div>
      <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div style={{ width: `${w}%`, background: colorBar, height: '100%', transition: 'width .3s' }} />
      </div>
      <p className="text-[11px] text-gray-500 mt-1.5">{ritmoLabel}</p>
    </div>
  )
}

// ===========================================================
// Alertas
// ===========================================================
const ALERTA_LABEL: Record<AlertaRow['tipo'], string> = {
  inativo: 'Inativo',
  esfriando: 'Esfriando',
  zeragem_alta: 'Zeragem alta',
  zeragem_concentrada: 'Zeragem concentrada',
}
const ALERTA_COLOR: Record<AlertaRow['tipo'], { bg: string; text: string }> = {
  inativo:              { bg: 'rgba(99,102,241,0.1)',  text: '#4338ca' },
  esfriando:            { bg: 'rgba(59,130,246,0.1)',  text: '#1d4ed8' },
  zeragem_alta:         { bg: 'rgba(239,68,68,0.1)',   text: '#b91c1c' },
  zeragem_concentrada:  { bg: 'rgba(220,38,38,0.15)',  text: '#991b1b' },
}

export function AlertasBlock({ data, onPickCliente }:
  { data: AlertaRow[]; onPickCliente?: (id: string | null) => void }
) {
  const counts = data.reduce<Record<string, number>>((acc, r) => {
    acc[r.tipo] = (acc[r.tipo] ?? 0) + 1; return acc
  }, {})
  return (
    <Block title={`Alertas de qualidade (${data.length})`}
      subtitle="Heurísticas: clientes esfriando, com muita zeragem, inativos. Configurações são fixas no SQL."
    >
      {data.length === 0
        ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600 py-3">
            <CheckCircle2 className="w-4 h-4" /> Nenhum alerta — base saudável no momento.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(counts).map(([tipo, n]) => {
                const t = tipo as AlertaRow['tipo']
                const c = ALERTA_COLOR[t]
                return (
                  <span key={t} className="text-xs px-2 py-1 rounded-full font-semibold"
                    style={{ background: c.bg, color: c.text }}>
                    {ALERTA_LABEL[t]} · {n}
                  </span>
                )
              })}
            </div>
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['Tipo', 'Cliente', 'Assessor', 'Métrica', 'Valor', 'Detalhe'].map((h, i) => (
                      <th key={i} className="px-3 py-2 font-semibold text-gray-500 border-r last:border-r-0 text-left"
                        style={{ borderColor: 'var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((r, i) => {
                    const c = ALERTA_COLOR[r.tipo]
                    return (
                      <tr key={`${r.tipo}-${r.cliente_id ?? r.cliente_nome}-${i}`}
                        style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                        <td className="px-3 py-1.5">
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                            style={{ background: c.bg, color: c.text }}>
                            {ALERTA_LABEL[r.tipo]}
                          </span>
                          {r.severidade === 'alta' && <ShieldAlert className="w-3 h-3 inline ml-1 text-red-500" />}
                        </td>
                        <td className="px-3 py-1.5">
                          <button onClick={() => onPickCliente?.(r.cliente_id)}
                            className="text-blue-600 hover:underline text-left">
                            {r.cliente_nome}
                          </button>
                        </td>
                        <td className="px-3 py-1.5 text-gray-500">{r.assessor_nome ?? '—'}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.metric_label}</td>
                        <td className="px-3 py-1.5 font-semibold text-gray-700 tabular-nums">{r.metric_value}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.detalhe}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
    </Block>
  )
}

// ===========================================================
// Acuracidade do modelo
// ===========================================================
export function AcuracidadeBlock({ resumo, serie }: { resumo: AcuracidadeResumo | null; serie: AcuracidadePonto[] }) {
  if (!resumo) return null
  if (resumo.num_dias === 0) {
    return (
      <Block title="Acuracidade do modelo (60 dias)" subtitle="Sem dados suficientes para avaliar.">
        <p className="text-sm text-gray-400 py-3">Aguardando histórico mínimo de 7 dias úteis.</p>
      </Block>
    )
  }

  const viesColor = resumo.vies_label === 'subestima' ? '#10b981'
                  : resumo.vies_label === 'superestima' ? '#dc2626'
                  : resumo.vies_label === 'equilibrado' ? '#3b82f6' : '#94a3b8'

  return (
    <Block title="Acuracidade do modelo (média móvel 7d)"
      subtitle="Compara o realizado com a previsão (média dos 7 dias úteis anteriores). MAPE = erro absoluto médio."
    >
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <KpiCard icon={Activity} label="MAPE" value={`${resumo.mape.toFixed(1)}%`}
          sub={`${resumo.num_dias} dias avaliados`} />
        <KpiCard icon={TrendingUp} label="Viés" value={fmtNum2(resumo.vies)}
          sub={resumo.vies_label}
          color={viesColor === '#10b981' ? 'text-emerald-700' : viesColor === '#dc2626' ? 'text-red-700' : 'text-blue-700'} />
        <KpiCard icon={CheckCircle2} label="Diagnóstico"
          value={resumo.vies_label === 'subestima' ? 'Subestima' :
                 resumo.vies_label === 'superestima' ? 'Superestima' :
                 resumo.vies_label === 'equilibrado' ? 'Equilibrado' : '—'}
          sub={resumo.vies_label === 'subestima' ? 'realizado > previsto'
            : resumo.vies_label === 'superestima' ? 'realizado < previsto'
            : 'erro médio próximo de zero'} />
      </div>

      {serie.length > 0 && (
        <div>
          <AcuracidadeChart serie={serie} />
          <div className="flex flex-wrap gap-3 text-xs mt-1 px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1 rounded" style={{ background: '#94a3b8' }} />
              <span className="text-gray-500">Previsto (MM7d)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1 rounded" style={{ background: 'var(--blue)' }} />
              <span className="text-gray-500">Realizado</span>
            </span>
          </div>
        </div>
      )}
    </Block>
  )
}

// ===========================================================
// Drill-down modal (com export PNG via canvas)
// ===========================================================
export function DrilldownModal({ data, rows, onClose }: { data: string; rows: DrilldownRow[]; onClose: () => void }) {
  const totals = rows.find(r => r.tipo === 'totals')
  const top_op = rows.filter(r => r.tipo === 'top_girou').sort((a, b) => a.rank - b.rank)
  const top_ze = rows.filter(r => r.tipo === 'top_zerou').sort((a, b) => a.rank - b.rank)

  function exportPng() {
    const c = document.createElement('canvas')
    c.width = 1200; c.height = 630
    const g = c.getContext('2d')!
    // background gradiente
    const grad = g.createLinearGradient(0, 0, 0, 630)
    grad.addColorStop(0, '#0b1220'); grad.addColorStop(1, '#1e293b')
    g.fillStyle = grad
    g.fillRect(0, 0, c.width, c.height)
    // marca + título
    g.fillStyle = '#26E07F'
    g.fillRect(48, 48, 6, 36)
    g.font = '600 14px sans-serif'
    g.fillStyle = '#94a3b8'
    g.fillText('ZeveAI · Lotes do dia', 64, 62)
    g.font = 'bold 40px sans-serif'
    g.fillStyle = '#ffffff'
    g.fillText(fmtDataPt(data), 64, 98)
    // totais
    const op = totals?.lotes_operados ?? 0
    const ze = totals?.lotes_zerados ?? 0
    g.font = '600 13px sans-serif'
    g.fillStyle = '#64748b'
    g.fillText('LOTES OPERADOS', 64, 156)
    g.font = 'bold 56px sans-serif'
    g.fillStyle = '#ffffff'
    g.fillText(fmtNum(op), 64, 210)
    g.font = '600 13px sans-serif'
    g.fillStyle = '#64748b'
    g.fillText('LOTES ZERADOS', 480, 156)
    g.font = 'bold 56px sans-serif'
    g.fillStyle = '#ffffff'
    g.fillText(fmtNum(ze), 480, 210)
    g.font = '600 13px sans-serif'
    g.fillStyle = '#64748b'
    g.fillText('% ZERAMENTO', 880, 156)
    g.font = 'bold 56px sans-serif'
    g.fillStyle = '#ffffff'
    const pctZ = op > 0 ? (ze / op) * 100 : 0
    g.fillText(`${pctZ.toFixed(1)}%`, 880, 210)
    // separador
    g.fillStyle = '#1e293b'
    g.fillRect(64, 256, c.width - 128, 1)
    // top 3 operou
    g.font = 'bold 18px sans-serif'
    g.fillStyle = '#26E07F'
    g.fillText('TOP 3 · QUEM MAIS GIROU', 64, 296)
    top_op.slice(0, 3).forEach((r, i) => {
      const y = 332 + i * 52
      g.font = 'bold 24px sans-serif'
      g.fillStyle = '#94a3b8'
      g.fillText(`${r.rank}`, 64, y)
      g.font = 'bold 22px sans-serif'
      g.fillStyle = '#ffffff'
      g.fillText(r.cliente_nome.slice(0, 32), 100, y)
      g.font = 'bold 22px sans-serif'
      g.fillStyle = '#26E07F'
      g.textAlign = 'right'
      g.fillText(fmtNum(r.lotes_operados), 580, y)
      g.textAlign = 'start'
    })
    // top 3 zerou
    g.font = 'bold 18px sans-serif'
    g.fillStyle = '#f87171'
    g.fillText('TOP 3 · QUEM MAIS ZEROU', 640, 296)
    top_ze.slice(0, 3).forEach((r, i) => {
      const y = 332 + i * 52
      g.font = 'bold 24px sans-serif'
      g.fillStyle = '#94a3b8'
      g.fillText(`${r.rank}`, 640, y)
      g.font = 'bold 22px sans-serif'
      g.fillStyle = '#ffffff'
      g.fillText(r.cliente_nome.slice(0, 32), 676, y)
      g.font = 'bold 22px sans-serif'
      g.fillStyle = '#f87171'
      g.textAlign = 'right'
      g.fillText(fmtNum(r.lotes_zerados), 1136, y)
      g.textAlign = 'start'
    })
    // footer
    g.font = '500 12px sans-serif'
    g.fillStyle = '#64748b'
    g.fillText(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 64, 590)
    c.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lotes-${data}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.7)' }}>
      <div className="rounded-2xl w-full max-w-3xl p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <header className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Detalhe do dia</p>
            <h3 className="text-xl font-bold text-gray-900">{fmtDataPt(data)}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportPng}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
              <Download className="w-3.5 h-3.5" /> Compartilhar PNG
            </button>
            <button onClick={onClose}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl p-3 text-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Operados</p>
            <p className="text-2xl font-bold text-blue-700 tabular-nums">{fmtNum(totals?.lotes_operados ?? 0)}</p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Zerados</p>
            <p className="text-2xl font-bold text-red-700 tabular-nums">{fmtNum(totals?.lotes_zerados ?? 0)}</p>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">% Zeramento</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {(totals?.lotes_operados ?? 0) > 0
                ? `${(((totals?.lotes_zerados ?? 0) / (totals?.lotes_operados ?? 1)) * 100).toFixed(1)}%`
                : '—'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-widest mb-2">Top 3 — quem mais girou</p>
            <ul className="space-y-1.5">
              {top_op.length === 0 && <li className="text-sm text-gray-400">—</li>}
              {top_op.map(r => (
                <li key={r.rank} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-700"><strong>{r.rank}.</strong> {r.cliente_nome}</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">{fmtNum(r.lotes_operados)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-red-700 uppercase tracking-widest mb-2">Top 3 — quem mais zerou</p>
            <ul className="space-y-1.5">
              {top_ze.length === 0 && <li className="text-sm text-gray-400">—</li>}
              {top_ze.map(r => (
                <li key={r.rank} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-700"><strong>{r.rank}.</strong> {r.cliente_nome}</span>
                  <span className="font-semibold text-red-700 tabular-nums">{fmtNum(r.lotes_zerados)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// ===========================================================
// View principal
// ===========================================================
export function ContratosDashboardView({ actions }: { actions: Actions }) {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [barra, setBarra] = useState<string | null>(null)
  const [barras, setBarras] = useState<{ barra_nome: string; numero: string | null }[]>([])
  const [isPending, startTransition] = useTransition()

  const [kpis, setKpis] = useState<DashboardKpis | null>(null)
  const [produtos, setProdutos] = useState<ProdutoRow[]>([])
  const [topClientes, setTopClientes] = useState<TopClienteRow[]>([])
  const [diarioProd, setDiarioProd] = useState<DiarioProdutoRow[]>([])
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([])
  const [evolucao, setEvolucao] = useState<EvolucaoMensalRow[]>([])
  const [receitaTotal, setReceitaTotal] = useState<ReceitaTotal | null>(null)
  const [receitaPorAss, setReceitaPorAss] = useState<ReceitaPorAssessor[]>([])
  const [receitaProj, setReceitaProj] = useState<ReceitaProjecao | null>(null)
  const [meta, setMeta] = useState<MetaAnual | null>(null)
  const [alertas, setAlertas] = useState<AlertaRow[]>([])
  const [acuracidade, setAcuracidade] = useState<AcuracidadeResumo | null>(null)
  const [acuracidadeSerie, setAcuracidadeSerie] = useState<AcuracidadePonto[]>([])
  const [erro, setErro] = useState<string | null>(null)

  const [drillData, setDrillData] = useState<string | null>(null)
  const [drillRows, setDrillRows] = useState<DrilldownRow[]>([])

  function carregar(p: Periodo, b: string | null) {
    setErro(null)
    startTransition(async () => {
      try {
        const [kp, pp, tc, dp, hm, ev, rt, ra, rp, m, al, ac, as] = await Promise.all([
          actions.getKpis(p, b),
          actions.getPorProduto(p, b),
          actions.getTopClientes(p, 20, b),
          actions.getDiarioProduto(p, b),
          actions.getHeatmapDow(p, b),
          actions.getEvolucaoMensal(),
          actions.getReceitaTotal(p),
          actions.getReceitaPorAssessor(p),
          actions.getReceitaProjecao(),
          actions.getMetaAnual(),
          actions.getAlertas(30, b),
          actions.getAcuracidadeResumo(60),
          actions.getAcuracidadeSerie(60),
        ])
        setKpis(kp); setProdutos(pp); setTopClientes(tc)
        setDiarioProd(dp); setHeatmap(hm); setEvolucao(ev)
        setReceitaTotal(rt); setReceitaPorAss(ra); setReceitaProj(rp); setMeta(m)
        setAlertas(al); setAcuracidade(ac); setAcuracidadeSerie(as)
      } catch (err) {
        setErro((err as Error).message ?? 'Falha ao carregar dados')
      }
    })
  }

  // Carrega lista de barras 1x na montagem
  useEffect(() => {
    actions.getBarrasAtivas().then(setBarras).catch(() => {})
  }, [actions])

  // setState ocorre depois de `await` dentro de startTransition — não é síncrono dentro do effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(periodo, barra) }, [periodo, barra])

  function abrirDrilldown(d: string) {
    setDrillData(d)
    setDrillRows([])
    actions.getDrilldownDia(d).then(setDrillRows).catch(err => setErro((err as Error).message))
  }

  return (
    <div className="px-6 lg:px-8 py-6 space-y-6">
      <PeriodoFilter
        value={periodo}
        onChange={setPeriodo}
        isLoading={isPending}
        datasetMax={kpis?.dataset_max ?? null}
        barras={barras}
        barraSelecionada={barra}
        onBarraChange={setBarra}
      />

      {erro && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {erro}
        </div>
      )}

      {kpis ? <KpiGrid kpis={kpis} /> : <KpiSkeleton />}

      <ReceitaBlock total={receitaTotal} porAssessor={receitaPorAss} projecao={receitaProj} />

      <MetaBlock meta={meta} />

      {isPending && produtos.length === 0
        ? <BlockSkeleton height={140} />
        : <PorProdutoBlock data={produtos} />}

      {isPending && diarioProd.length === 0
        ? <BlockSkeleton height={320} />
        : <WinVsWdoBlock data={diarioProd} onClickDia={abrirDrilldown} />}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <HeatmapBlock data={heatmap} />
        <EvolucaoMensalBlock data={evolucao} />
      </div>

      <TopClientesParetoBlock data={topClientes} onPickCliente={(id) => {
        if (id) window.location.href = `/clientes/${id}`
      }} />

      {/* Fase 3 — alertas + acuracidade ficam recolhidos por padrão pra
          reduzir ruído visual no topo do dashboard. */}
      <details className="rounded-2xl"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <summary className="cursor-pointer select-none px-5 py-4 flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900">
          <span className="text-blue-600">▸</span>
          Mais ferramentas — alertas de qualidade e acuracidade do modelo
          <span className="ml-auto text-xs text-gray-500 font-normal">
            {alertas.length} alerta{alertas.length === 1 ? '' : 's'} · acuracidade {acuracidade?.num_dias ?? 0} dias
          </span>
        </summary>
        <div className="p-5 pt-0 grid grid-cols-1 xl:grid-cols-2 gap-6">
          <AlertasBlock data={alertas} onPickCliente={(id) => { if (id) window.location.href = `/clientes/${id}` }} />
          <AcuracidadeBlock resumo={acuracidade} serie={acuracidadeSerie} />
        </div>
      </details>

      {drillData && <DrilldownModal data={drillData} rows={drillRows} onClose={() => setDrillData(null)} />}
    </div>
  )
}
