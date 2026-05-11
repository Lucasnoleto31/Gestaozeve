'use client'

import { useEffect, useState } from 'react'
import { Activity, Clock, Users, Calendar, Heart, AlertTriangle, Skull } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import {
  PorProdutoBlock, WinVsWdoBlock, HeatmapBlock, EvolucaoMensalBlock,
  DrilldownModal, Block,
} from '../View'
import { BlockSkeleton } from '../Charts'
import type { DrilldownRow } from '../actions'
import { getDrilldownDia } from '../actions'
import { ACTIONS } from '../_lib/dashboardActions'
import { fmtNum, fmtNum2 } from '../_lib/utils'

const INTENSIDADE_INFO: Record<string, { label: string; color: string; descricao: string }> = {
  leve:  { label: 'Leve (<30%)',     color: '#10b981', descricao: 'Operação saudável' },
  media: { label: 'Média (30-70%)',  color: '#f59e0b', descricao: 'Atenção' },
  alta:  { label: 'Alta (70-95%)',   color: '#f97316', descricao: 'Problemática' },
  total: { label: 'Total (>95%)',    color: '#dc2626', descricao: 'Compulsória / cassino' },
}

const SOBREV_INFO = {
  saudavel:   { label: 'Saudável',    color: '#10b981', icon: Heart },
  atencao:    { label: 'Atenção',     color: '#f59e0b', icon: AlertTriangle },
  alto_risco: { label: 'Alto risco',  color: '#dc2626', icon: Skull },
}

export function OperacionalView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    produtos: true, diario: true, heatmap: true, evolucao: true, kpis: true,
    fluxoOperacional: true, indiceSobrevivencia: true,
    zeragemDistribuicao: true, riscoOperacional: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  const [drillData, setDrillData] = useState<string | null>(null)
  const [drillRows, setDrillRows] = useState<DrilldownRow[]>([])
  function abrirDrilldown(dia: string) {
    setDrillData(dia); setDrillRows([])
    getDrilldownDia(dia).then(setDrillRows).catch(() => {})
  }

  const sobrev = d.indiceSobr
  const sobrevConf = sobrev ? SOBREV_INFO[sobrev.classificacao] : null

  return (
    <div className="space-y-6">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      {/* Bloco 1 — Fluxo Operacional (KPIs) */}
      <Block title="Fluxo operacional"
        subtitle="Métricas de atividade no período. Quanto maior taxa de atividade e sessões/cliente, mais consistente é a base.">
        {!d.fluxoOp
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard icon={Calendar} label="Sessões no período"
                value={fmtNum(d.fluxoOp.num_sessoes)}
                sub={`${d.fluxoOp.taxa_atividade.toFixed(1)}% dos ${d.fluxoOp.num_dias_corridos} dias`}
                accent="#1764f4" />
              <KpiCard icon={Users} label="Clientes ativos"
                value={fmtNum(d.fluxoOp.num_clientes_ativos)}
                sub={`média ${fmtNum2(d.fluxoOp.sessoes_por_cliente)} sessões/cliente`}
                accent="#10b981" />
              <KpiCard icon={Activity} label="Lotes / sessão"
                value={fmtNum2(d.fluxoOp.lotes_por_sessao)}
                sub="média por cliente×dia"
                accent="#a855f7" />
              <KpiCard icon={Clock} label="Lotes / dia"
                value={fmtNum(d.fluxoOp.ticket_medio_diario)}
                sub="ticket diário consolidado"
                accent="#f59e0b" />
            </div>
          )}
      </Block>

      {/* Bloco 2 — Indice de Sobrevivência */}
      <Block title="Índice de Sobrevivência"
        subtitle="Sobreviventes (operaram com zeragem <95% em algum dia) ÷ zerados (sempre zerados >95%). >5 saudável · 1-5 atenção · <1 alto risco.">
        {!sobrev
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-xl p-4 col-span-1 md:col-span-2"
                style={{ background: sobrevConf ? `${sobrevConf.color}15` : 'var(--surface)',
                         border: `2px solid ${sobrevConf?.color ?? '#94a3b8'}40`,
                         borderLeft: `6px solid ${sobrevConf?.color ?? '#94a3b8'}` }}>
                <div className="flex items-start gap-3">
                  {sobrevConf && <sobrevConf.icon className="w-6 h-6 mt-1" style={{ color: sobrevConf.color }} />}
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: sobrevConf?.color }}>
                      {sobrevConf?.label}
                    </p>
                    <p className="text-4xl font-bold mt-1 tabular-nums" style={{ color: sobrevConf?.color }}>
                      {sobrev.indice >= 999 ? '∞' : fmtNum2(sobrev.indice)}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      {sobrev.num_sobreviventes} sobreviventes / {sobrev.num_zerados} zerados
                    </p>
                  </div>
                </div>
              </div>
              <KpiCard label="Total clientes" value={fmtNum(sobrev.num_clientes_total)}
                sub="que operaram no período" accent="#64748b" />
              <KpiCard label="% sobreviventes" value={`${sobrev.pct_sobreviventes.toFixed(1)}%`}
                sub="da base ativa" accent="#10b981" />
            </div>
          )}
      </Block>

      {/* Bloco 3 — Distribuição de zeragem (mesma da Executivo, repete aqui pra contexto operacional) */}
      <Block title="Distribuição de zeragem por intensidade"
        subtitle="Cada evento = cliente × dia com zeragem > 0. Identifica padrões compulsivos.">
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

      {/* Existentes — produtos e séries diárias */}
      {d.isPending && d.produtos.length === 0
        ? <BlockSkeleton height={140} />
        : <PorProdutoBlock data={d.produtos} />}

      {d.isPending && d.diario.length === 0
        ? <BlockSkeleton height={320} />
        : <WinVsWdoBlock data={d.diario} onClickDia={abrirDrilldown} />}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <HeatmapBlock data={d.heatmap} />
        <EvolucaoMensalBlock data={d.evolucao} />
      </div>

      {/* Bloco 4 — Clientes em Risco Operacional */}
      <Block title="Clientes em risco operacional"
        subtitle="Score 0-100 baseado em 4 sinais (15d atual vs 16-30d anterior): aumento de frequência, volume, eventos de zeragem total, e elevação do % de zeragem. >70 = crítico, 50-70 = atenção, 25-50 = monitorar.">
        {d.riscoOp.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Nenhum cliente em risco detectado.'}</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {[
                      { l: '#', a: 'left' },
                      { l: 'Cliente', a: 'left' },
                      { l: 'Barra', a: 'left' },
                      { l: 'Score', a: 'right' },
                      { l: 'Dias', a: 'right' },
                      { l: 'Lotes (atual)', a: 'right' },
                      { l: '% ze (atual / ant)', a: 'right' },
                      { l: 'Eventos total', a: 'right' },
                      { l: 'Motivo', a: 'left' },
                    ].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${h.a === 'left' ? 'text-left' : 'text-right'}`}>
                        {h.l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.riscoOp.map(r => {
                    const palette = r.score_risco >= 70
                      ? { bg: 'rgba(239,68,68,0.1)', tx: '#dc2626' }
                      : r.score_risco >= 50
                      ? { bg: 'rgba(245,158,11,0.1)', tx: '#d97706' }
                      : { bg: 'rgba(23,100,244,0.05)', tx: '#1764f4' }
                    return (
                      <tr key={`${r.cliente_id ?? r.cliente_nome}-${r.rank}`}
                        onClick={() => { if (r.cliente_id) window.location.href = `/clientes/${r.cliente_id}` }}
                        className={r.cliente_id ? 'cursor-pointer hover:bg-blue-50' : ''}
                        style={{ borderTop: '1px solid var(--border)', background: palette.bg }}>
                        <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{r.rank}</td>
                        <td className="px-3 py-1.5 font-medium text-gray-700">{r.cliente_nome}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.assessor_nome ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right font-bold tabular-nums" style={{ color: palette.tx }}>
                          {r.score_risco}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.dias_atual} / {r.dias_anterior}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(r.lotes_atual)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {r.pct_ze_atual.toFixed(1)}% / {r.pct_ze_anterior.toFixed(1)}%
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.eventos_zer_atual} / {r.eventos_zer_anterior}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-600">{r.motivo}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Block>

      {drillData && <DrilldownModal data={drillData} rows={drillRows} onClose={() => setDrillData(null)} />}
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, sub, accent }: {
  icon?: React.ElementType
  label: string
  value: string
  sub?: string
  accent: string
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${accent}` }}>
      <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold inline-flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" style={{ color: accent }} />}
        {label}
      </p>
      <p className="text-2xl font-bold text-gray-700 tabular-nums mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}
