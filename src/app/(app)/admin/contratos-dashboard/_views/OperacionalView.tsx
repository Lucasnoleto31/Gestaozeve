'use client'

import { useEffect, useState } from 'react'
import { Activity, Calendar, Users, Trophy, TrendingDown } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { WinVsWdoBlock, DrilldownModal, Block } from '../_lib/Blocks'
import { BlockSkeleton } from '../Charts'
import type { DrilldownRow } from '../actions'
import { getDrilldownDia } from '../actions'
import { ACTIONS } from '../_lib/dashboardActions'
import { KpiCard, KpiRow } from '../_lib/Kpi'
import { fmtNum, fmtDataPt } from '../_lib/utils'

export function OperacionalView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    kpis: true, diario: true, produtos: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  const [drillData, setDrillData] = useState<string | null>(null)
  const [drillRows, setDrillRows] = useState<DrilldownRow[]>([])
  const [drillErro, setDrillErro] = useState(false)
  function abrirDrilldown(dia: string) {
    setDrillData(dia); setDrillRows([]); setDrillErro(false)
    getDrilldownDia(dia, barra).then(setDrillRows).catch(() => setDrillErro(true))
  }

  const totalOperado = d.produtos.reduce((acc, p) => acc + p.lotes_operados, 0)

  return (
    <div className="space-y-5">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      {/* 4 KPIs operacionais — todos do período/barra filtrados */}
      <KpiRow>
        <KpiCard icon={Calendar} label="Pregões"
          value={d.kpis ? fmtNum(d.kpis.num_dias_com_dado) : '—'}
          sub="dias com operação no período" accent="#1764f4" />
        <KpiCard icon={Users} label="Clientes ativos"
          value={d.kpis ? fmtNum(d.kpis.num_clientes_ativos) : '—'}
          sub="contas que operaram no período" accent="#10b981" />
        <KpiCard icon={Activity} label="Lotes por pregão"
          value={d.kpis ? fmtNum(d.kpis.media_diaria) : '—'}
          sub={d.kpis?.ultimo_dia_data
            ? `último dia (${fmtDataPt(d.kpis.ultimo_dia_data)}): ${fmtNum(d.kpis.ultimo_dia_lotes)}`
            : undefined}
          accent="#a855f7" />
        <KpiCard icon={Trophy} label="Melhor dia"
          value={d.kpis?.maior_dia_data ? fmtNum(d.kpis.maior_dia_lotes) : '—'}
          sub={d.kpis?.maior_dia_data ? `lotes em ${fmtDataPt(d.kpis.maior_dia_data)}` : undefined}
          accent="#0891b2" />
      </KpiRow>

      {/* Gráfico diário WIN vs WDO */}
      {d.isPending && d.diario.length === 0
        ? <BlockSkeleton height={320} />
        : <WinVsWdoBlock data={d.diario} onClickDia={abrirDrilldown} />}

      {/* Volume por produto */}
      <Block title="Volume por produto (período)"
        subtitle="Lotes operados/zerados e clientes distintos (por conta) em cada produto.">
        {d.produtos.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados no período.'}</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['Produto', 'Lotes op.', '% do total', 'Lotes ze.', '% zer.', 'Clientes', 'Dias'].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.produtos.map((p, i) => {
                    const pctTotal = totalOperado > 0 ? (p.lotes_operados / totalOperado) * 100 : 0
                    const pctZe = p.lotes_operados > 0 ? (p.lotes_zerados / p.lotes_operados) * 100 : 0
                    return (
                      <tr key={p.produto}
                        style={{ borderTop: '1px solid var(--border)',
                                 background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                        <td className="px-3 py-1.5 font-semibold text-gray-700">{p.produto}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtNum(p.lotes_operados)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{pctTotal.toFixed(1)}%</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtNum(p.lotes_zerados)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{pctZe.toFixed(1)}%</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(p.num_clientes)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtNum(p.num_dias)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Block>

      {drillData && (
        drillErro
          ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: 'rgba(15,23,42,0.7)' }} onClick={() => setDrillData(null)}>
              <div className="rounded-2xl p-6 text-sm"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: '#ef4444' }}>
                Falha ao carregar o detalhe do dia. Clique pra fechar.
              </div>
            </div>
          )
          : <DrilldownModal data={drillData} rows={drillRows} onClose={() => setDrillData(null)} />
      )}

      {/* loading inline */}
      {d.isPending && (
        <div className="text-xs text-gray-400 flex items-center gap-2 justify-end">
          <TrendingDown className="w-3 h-3 animate-pulse" /> atualizando…
        </div>
      )}
    </div>
  )
}
