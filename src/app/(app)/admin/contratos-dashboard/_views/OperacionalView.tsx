'use client'

import { useEffect, useState } from 'react'
import { Activity, Heart, AlertTriangle, Skull, Calendar, Users, TrendingDown } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { WinVsWdoBlock, DrilldownModal, Block } from '../View'
import { BlockSkeleton } from '../Charts'
import type { DrilldownRow } from '../actions'
import { getDrilldownDia } from '../actions'
import { ACTIONS } from '../_lib/dashboardActions'
import { KpiCard, KpiRow } from '../_lib/Kpi'
import { fmtNum, fmtNum2 } from '../_lib/utils'

const SOBREV_INFO = {
  saudavel:   { color: '#10b981', icon: Heart },
  atencao:    { color: '#f59e0b', icon: AlertTriangle },
  alto_risco: { color: '#dc2626', icon: Skull },
}

export function OperacionalView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    diario: true, kpis: true,
    fluxoOperacional: true, indiceSobrevivencia: true, riscoOperacional: true,
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
    <div className="space-y-5">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      {/* 4 KPIs operacionais */}
      <KpiRow>
        <KpiCard icon={Calendar} label="Sessões"
          value={d.fluxoOp ? fmtNum(d.fluxoOp.num_sessoes) : '—'}
          sub={d.fluxoOp ? `${d.fluxoOp.taxa_atividade.toFixed(0)}% dos ${d.fluxoOp.num_dias_corridos} dias` : undefined}
          accent="#1764f4" />
        <KpiCard icon={Users} label="Clientes ativos"
          value={d.fluxoOp ? fmtNum(d.fluxoOp.num_clientes_ativos) : '—'}
          sub={d.fluxoOp ? `${fmtNum2(d.fluxoOp.sessoes_por_cliente)} sessões/cliente` : undefined}
          accent="#10b981" />
        <KpiCard icon={Activity} label="Lotes/dia"
          value={d.fluxoOp ? fmtNum(d.fluxoOp.ticket_medio_diario) : '—'}
          sub={d.fluxoOp ? `${fmtNum2(d.fluxoOp.lotes_por_sessao)} por sessão` : undefined}
          accent="#a855f7" />
        <KpiCard icon={sobrevConf?.icon ?? Heart} label="Índice sobrevivência"
          value={sobrev ? (sobrev.indice >= 999 ? '∞' : fmtNum2(sobrev.indice)) : '—'}
          sub={sobrev ? `${sobrev.num_sobreviventes} sobr / ${sobrev.num_zerados} zer` : undefined}
          accent={sobrevConf?.color ?? '#94a3b8'}
          valueColor={sobrevConf?.color} />
      </KpiRow>

      {/* 1 gráfico principal */}
      {d.isPending && d.diario.length === 0
        ? <BlockSkeleton height={320} />
        : <WinVsWdoBlock data={d.diario} onClickDia={abrirDrilldown} />}

      {/* Tabela: clientes em risco operacional */}
      <Block title="Clientes em risco operacional"
        subtitle="Score 0-100 (15d atual vs 16-30d anterior) — frequência, volume, eventos de zeragem total e elevação do % zeragem.">
        {d.riscoOp.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Nenhum cliente em risco detectado.'}</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['#', 'Cliente', 'Barra', 'Score', 'Lotes', '% ze', 'Motivo'].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${i <= 2 || i === 6 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.riscoOp.map(r => {
                    const palette = r.score_risco >= 70
                      ? { bg: 'rgba(239,68,68,0.08)', tx: '#dc2626' }
                      : r.score_risco >= 50
                      ? { bg: 'rgba(245,158,11,0.08)', tx: '#d97706' }
                      : { bg: 'rgba(23,100,244,0.04)', tx: '#1764f4' }
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
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(r.lotes_atual)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.pct_ze_atual.toFixed(1)}%</td>
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

      {/* loading inline */}
      {d.isPending && (
        <div className="text-xs text-gray-400 flex items-center gap-2 justify-end">
          <TrendingDown className="w-3 h-3 animate-pulse" /> atualizando…
        </div>
      )}
    </div>
  )
}
