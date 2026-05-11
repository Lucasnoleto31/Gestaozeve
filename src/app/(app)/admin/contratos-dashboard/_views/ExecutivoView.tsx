'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import {
  Download, ShieldAlert, TrendingUp, TrendingDown, Activity,
  Trophy, AlertCircle, Layers, Server,
} from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import {
  KpiGrid, ReceitaBlock, MetaBlock, AlertasBlock, Block,
} from '../View'
import { KpiSkeleton, BlockSkeleton } from '../Charts'
import { fmtNum, fmtBRL, fmtBRL2 } from '../_lib/utils'
import { ACTIONS } from '../_lib/dashboardActions'

const PRODUTO_LABEL: Record<string, string> = {
  WIN: 'Mini índice (WIN)',
  WDO: 'Mini dólar (WDO)',
  IND: 'Índice cheio (IND)',
  DOL: 'Dólar cheio (DOL)',
  BIT: 'Bitcoin (BIT)',
  WSP: 'S&P mini (WSP)',
  CCM: 'Milho (CCM)',
  SOL: 'Soja (SOL)',
  OUTRO: 'Outros',
}

const PRODUTO_COLOR: Record<string, string> = {
  WIN: '#1764f4', WDO: '#16a34a', IND: '#a855f7', DOL: '#dc2626',
  BIT: '#f59e0b', WSP: '#06b6d4', CCM: '#84cc16', SOL: '#ec4899',
  OUTRO: '#64748b',
}

const INTENSIDADE_INFO: Record<string, { label: string; color: string; descricao: string }> = {
  leve:  { label: 'Leve (<30%)',     color: '#10b981', descricao: 'Operação saudável' },
  media: { label: 'Média (30-70%)',  color: '#f59e0b', descricao: 'Atenção' },
  alta:  { label: 'Alta (70-95%)',   color: '#f97316', descricao: 'Problemática' },
  total: { label: 'Total (>95%)',    color: '#dc2626', descricao: 'Compulsória / cassino' },
}

export function ExecutivoView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    kpis: true, receita: true, meta: true, alertas: true, budget: true,
    produtosDetalhados: true, zeragemDistribuicao: true, receitaBrutaLiquida: true,
    receitaPlataforma: true, receitaClearing: true, scoreQualidade: true,
    metasAssessor: true, alertasExecutivos: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  const budgetCriticas = d.budget.filter(b => b.status !== 'ok')
  const assessoresFora = d.metasAss.filter(m => m.status === 'critico' || m.status === 'atencao')

  return (
    <div className="space-y-6">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      <div className="flex justify-end">
        <Link href={`/admin/contratos-dashboard/export?periodo=${periodo}${barra ? `&barra=${encodeURIComponent(barra)}` : ''}`}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
          <Download className="w-3.5 h-3.5" />
          Exportar (WhatsApp / Story / Feed)
        </Link>
      </div>

      {/* Mapa de alertas executivos — destaque no topo */}
      {d.alertasExec.length > 0 && (
        <Block title="Alertas executivos"
          subtitle="Sinais críticos derivados dos dados — revisão rápida do que precisa de atenção agora.">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {d.alertasExec.map((a, i) => {
              const palette = {
                alta:  { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.4)', tx: '#dc2626' },
                media: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.4)', tx: '#d97706' },
                baixa: { bg: 'rgba(23,100,244,0.1)', border: 'rgba(23,100,244,0.4)', tx: '#1764f4' },
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

      {d.kpis ? <KpiGrid kpis={d.kpis} /> : <KpiSkeleton />}

      {/* Receita Bruta × Líquida — destaque */}
      <Block title="Receita do período (bruta × líquida)"
        subtitle="Bruta = total faturado. Líquida = bruta × % repasse do escritório (cadastrado em Tarifas, default 50%).">
        {d.isPending && !d.receitaBL
          ? <p className="text-sm text-gray-400 py-4">Carregando…</p>
          : !d.receitaBL
          ? <p className="text-sm text-gray-400 py-4">Sem dados.</p>
          : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Receita bruta</p>
                <p className="text-2xl font-bold text-gray-700 tabular-nums mt-1">{fmtBRL2(d.receitaBL.receita_bruta)}</p>
                <p className="text-xs text-gray-500 mt-1">Soma de futuros + zeragem</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, rgba(23,100,244,0.08), rgba(168,85,247,0.08))', border: '1px solid rgba(23,100,244,0.2)' }}>
                <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#1764f4' }}>Receita líquida</p>
                <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: '#1764f4' }}>{fmtBRL2(d.receitaBL.receita_liquida)}</p>
                <p className="text-xs text-gray-500 mt-1">O que o escritório embolsa</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">% repasse médio</p>
                <p className="text-2xl font-bold text-gray-700 tabular-nums mt-1">{d.receitaBL.pct_repasse_medio.toFixed(1)}%</p>
                <p className="text-xs text-gray-500 mt-1">Ponderado pela receita</p>
              </div>
            </div>
          )}
      </Block>

      {/* Receita por plataforma + clearing */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Block title="Volume por plataforma" subtitle="Identifica concentração em uma plataforma específica.">
          {d.receitaPlat.length === 0
            ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados — campo plataforma vazio nas importações.'}</p>
            : (
              <div className="space-y-2">
                {d.receitaPlat.map(p => (
                  <div key={p.plataforma} className="flex items-center justify-between rounded-lg px-3 py-2"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <span className="text-sm font-medium text-gray-700 inline-flex items-center gap-2">
                      <Server className="w-3.5 h-3.5 text-gray-400" />
                      {p.plataforma}
                    </span>
                    <span className="text-xs tabular-nums text-gray-600">
                      {fmtNum(p.lotes_operados)} lotes · {p.num_clientes} clientes
                    </span>
                  </div>
                ))}
              </div>
            )}
        </Block>

        <Block title="Receita por clearing" subtitle="Consolidação por corretora (Genial, XP, BTG, etc).">
          {d.receitaClear.length === 0
            ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
            : (
              <div className="space-y-2">
                {d.receitaClear.map(c => (
                  <div key={c.clearing} className="flex items-center justify-between rounded-lg px-3 py-2"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <span className="text-sm font-medium text-gray-700">{c.clearing}</span>
                    <span className="text-xs tabular-nums">
                      <strong className="text-emerald-700">{fmtBRL(c.receita_total)}</strong>
                      <span className="text-gray-500 ml-2">· {c.num_barras} barras</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
        </Block>
      </div>

      {/* Contratos girados detalhados por produto */}
      <Block title="Contratos girados por produto"
        subtitle="Detalhamento por contrato (dia, MTD, mês anterior, média diária e Δ vs mês anterior).">
        {d.produtosDetalhados.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['Produto', 'Hoje', 'MTD', 'Mês anterior', 'Período', 'Média/dia', 'Δ vs mês ant.'].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.produtosDetalhados.map((p, i) => {
                    const positivo = p.delta_pct_vs_mes_ant >= 0
                    return (
                      <tr key={p.produto + i} style={{ borderTop: '1px solid var(--border)',
                              background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                        <td className="px-3 py-1.5 font-medium text-gray-700">
                          <span className="inline-flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: PRODUTO_COLOR[p.produto] ?? '#64748b' }} />
                            {PRODUTO_LABEL[p.produto] ?? p.produto}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(p.lotes_dia)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtNum(p.lotes_mtd)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtNum(p.lotes_mes_anterior)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(p.lotes_periodo)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(p.media_diaria)}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${positivo ? 'text-emerald-600' : 'text-rose-600'}`}>
                          <span className="inline-flex items-center gap-1 justify-end">
                            {positivo ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {p.delta_pct_vs_mes_ant.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Block>

      {/* Distribuição de zeragem por intensidade */}
      <Block title="Distribuição de zeragem por intensidade"
        subtitle="Classifica cada evento de zeragem (cliente × dia) pela proporção zerada — identifica padrão cassino.">
        {d.zeragemDist.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem zeragens no período.'}</p>
          : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {d.zeragemDist.map(z => {
                const info = INTENSIDADE_INFO[z.intensidade]
                return (
                  <div key={z.intensidade} className="rounded-xl p-4"
                    style={{ background: 'var(--surface)', border: `2px solid ${info.color}33`, borderLeft: `6px solid ${info.color}` }}>
                    <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: info.color }}>
                      {info.label}
                    </p>
                    <p className="text-2xl font-bold text-gray-700 tabular-nums mt-1">{fmtNum(z.lotes_zerados)}</p>
                    <p className="text-xs text-gray-500 mt-1 tabular-nums">{z.num_eventos} eventos · {z.pct_dos_zerados.toFixed(1)}% do total</p>
                    <p className="text-[10px] text-gray-400 mt-1">{info.descricao}</p>
                  </div>
                )
              })}
            </div>
          )}
      </Block>

      {/* Score Qualidade Operacional */}
      <Block title="Score de Qualidade Operacional"
        subtitle="Receita ÷ (1 + zerados/100). Quanto MAIOR, melhor — mais receita por unidade de zeragem.">
        {d.score.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['#', 'Barra', 'Nº', 'Lotes op.', '% ze.', 'Receita', 'Score'].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${i <= 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.score.slice(0, 10).map(s => (
                    <tr key={s.barra_nome + s.rank}
                      style={{ borderTop: '1px solid var(--border)',
                               background: s.rank % 2 === 1 ? 'var(--surface)' : 'var(--surface-2)' }}>
                      <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          {s.rank <= 3 && <Trophy className="w-3 h-3 text-amber-500" />}
                          {s.rank}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-medium text-gray-700">{s.barra_nome}</td>
                      <td className="px-3 py-1.5 text-gray-500 tabular-nums">{s.numero ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(s.lotes_operados)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{s.pct_zeragem.toFixed(1)}%</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700 font-semibold">{fmtBRL(s.receita_total)}</td>
                      <td className="px-3 py-1.5 text-right font-bold tabular-nums" style={{ color: '#1764f4' }}>
                        {fmtNum(s.score_qualidade)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Block>

      {d.receitaTotal
        ? <ReceitaBlock total={d.receitaTotal} porAssessor={d.receitaPorAss} projecao={d.receitaProj} />
        : <BlockSkeleton height={220} />}

      <MetaBlock meta={d.meta} />

      {/* Metas por assessor */}
      {d.metasAss.length > 0 && (
        <Block title="Metas por assessor"
          subtitle={`${assessoresFora.length} barra(s) fora do ritmo. Status: ok (≥95% ritmo), atenção (80-95%), crítico (<80%).`}>
          <div className="space-y-2">
            {d.metasAss.map(m => {
              const palette = {
                ok:       { bar: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.3)',  tx: '#059669' },
                atencao:  { bar: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.3)',  tx: '#d97706' },
                critico:  { bar: '#dc2626', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.3)',   tx: '#dc2626' },
                sem_meta: { bar: '#94a3b8', bg: 'var(--surface)',         border: 'var(--border)',         tx: '#64748b' },
              }[m.status]
              const widthPct = Math.min(100, m.pct_atingido)
              return (
                <div key={m.barra_nome} className="rounded-xl px-4 py-2.5"
                  style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-700 truncate inline-flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-gray-400" />
                      {m.barra_nome}{m.numero ? ` · ${m.numero}` : ''}
                    </span>
                    <span className="text-xs tabular-nums shrink-0 font-semibold" style={{ color: palette.tx }}>
                      {m.pct_atingido.toFixed(1)}% · {fmtBRL(m.realizado_receita)} de {fmtBRL(m.meta_receita)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(148,163,184,0.2)' }}>
                    <div className="h-full transition-all" style={{ width: `${widthPct}%`, background: palette.bar }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Block>
      )}

      {/* Budget de zeragem (existente) */}
      <Block title="Budget de zeragem"
        subtitle={`Limite máximo de % zeragem por barra. ${budgetCriticas.length > 0 ? `${budgetCriticas.length} barra(s) acima de 80% do budget.` : 'Todas dentro do limite.'}`}>
        {d.isPending && d.budget.length === 0
          ? <p className="text-sm text-gray-400 py-4">Carregando…</p>
          : d.budget.length === 0
          ? <p className="text-sm text-gray-400 py-4">Sem dados.</p>
          : (
            <div className="space-y-2">
              {d.budget.map((b) => {
                const isExcedido = b.status === 'excedido'
                const isAtencao = b.status === 'atencao'
                const palette = isExcedido
                  ? { bar: '#dc2626', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.4)', tx: '#dc2626' }
                  : isAtencao
                  ? { bar: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.4)', tx: '#d97706' }
                  : { bar: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.4)', tx: '#059669' }
                const widthPct = Math.min(100, b.consumo_pct)
                return (
                  <div key={b.barra_nome} className="rounded-xl px-4 py-2.5 flex items-center gap-3"
                    style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
                    {(isExcedido || isAtencao) && <ShieldAlert className="w-4 h-4 shrink-0" style={{ color: palette.tx }} />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-700 truncate">
                          {b.barra_nome}{b.numero ? ` · ${b.numero}` : ''}
                        </span>
                        <span className="text-xs tabular-nums shrink-0" style={{ color: palette.tx }}>
                          {b.pct_zeragem.toFixed(1)}% / {b.budget_pct.toFixed(0)}% (consumo {b.consumo_pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(148,163,184,0.2)' }}>
                        <div className="h-full transition-all" style={{ width: `${widthPct}%`, background: palette.bar }} />
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1 tabular-nums">
                        {fmtNum(b.lotes_zerados)} ze. / {fmtNum(b.lotes_operados)} op.
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
      </Block>

      <AlertasBlock data={d.alertas} onPickCliente={(id) => {
        if (id) window.location.href = `/clientes/${id}`
      }} />

      {/* Indicador de loading inline */}
      {d.isPending && (
        <div className="text-xs text-gray-400 flex items-center gap-2 justify-end">
          <Activity className="w-3 h-3 animate-pulse" /> atualizando dados…
        </div>
      )}
    </div>
  )
}
