'use client'

import { useEffect, useState } from 'react'
import { Activity, Calendar, Users, Trophy, Layers } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { WinVsWdoBlock, DrilldownModal, Block } from '../_lib/Blocks'
import { BlockSkeleton } from '../Charts'
import type { DrilldownRow, ProdutoDetalhado } from '../actions'
import { getDrilldownDia } from '../actions'
import { KpiCard, KpiRow, Vazio } from '../_lib/Kpi'
import { fmtNum, fmtDataPt, fmtDelta } from '../_lib/utils'

const th = (align: 'left' | 'right') =>
  `px-3 py-2 font-semibold text-gray-500 ${align === 'left' ? 'text-left' : 'text-right'}`
const rowStyle = (i: number) => ({
  borderTop: '1px solid var(--border)',
  background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
})

export function OperacionalView() {
  const { periodo, barra, excluir, corretora } = useDashboardFilters()
  const d = useDashboardData(periodo, barra, excluir, corretora, {
    kpis: true, diario: true, produtos: true, produtosDetalhados: true,
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
    getDrilldownDia(dia, barra, excluir, corretora).then(setDrillRows).catch(() => setDrillErro(true))
  }

  const k = d.kpis
  const ka = d.kpisAnterior
  const rotulo = periodo === 'tudo' ? undefined : 'vs período anterior'
  const totalOperado = d.produtos.reduce((acc, p) => acc + p.lotes_operados, 0)

  return (
    <div className="space-y-5">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      {/* 4 KPIs operacionais — todos do período/filtros */}
      <KpiRow>
        <KpiCard icon={Calendar} label="Pregões" loading={d.loading && !k}
          value={k ? fmtNum(k.num_dias_com_dado) : '—'}
          sub="dias com operação no período" accent="#1764f4" />
        <KpiCard icon={Users} label="Clientes ativos" loading={d.loading && !k}
          value={k ? fmtNum(k.num_clientes_ativos) : '—'}
          sub="contas que operaram" accent="#10b981"
          delta={k && ka ? { atual: k.num_clientes_ativos, anterior: ka.num_clientes_ativos, rotulo, fmt: fmtNum } : null} />
        <KpiCard icon={Activity} label="Lotes por pregão" loading={d.loading && !k}
          value={k ? fmtNum(k.media_diaria) : '—'}
          sub={k?.ultimo_dia_data
            ? `último dia (${fmtDataPt(k.ultimo_dia_data)}): ${fmtNum(k.ultimo_dia_lotes)}`
            : undefined}
          accent="#a855f7"
          delta={k && ka ? { atual: k.media_diaria, anterior: ka.media_diaria, rotulo, fmt: fmtNum } : null} />
        <KpiCard icon={Trophy} label="Melhor dia" loading={d.loading && !k}
          value={k?.maior_dia_data ? fmtNum(k.maior_dia_lotes) : '—'}
          sub={k?.maior_dia_data ? `lotes em ${fmtDataPt(k.maior_dia_data)}` : undefined}
          accent="#0891b2" />
      </KpiRow>

      {/* Gráfico diário WIN vs WDO */}
      {d.loading && d.diario.length === 0
        ? <BlockSkeleton height={320} />
        : <WinVsWdoBlock data={d.diario} onClickDia={abrirDrilldown} />}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Comparativo por produto: dia / mês / mês anterior */}
        <Block title="Ritmo por produto"
          subtitle="Último pregão, mês atual (MTD), mês anterior completo e variação MTD vs mês anterior. Média diária = lotes do período ÷ pregões.">
          {d.produtosDetalhados.length === 0
            ? <Vazio loading={d.loading}>Sem dados no período (ou supabase-s15 ainda não aplicado).</Vazio>
            : <ProdutosDetalhadosTable rows={d.produtosDetalhados} />}
        </Block>

        {/* Volume por produto */}
        <Block title="Volume por produto no período"
          subtitle="Lotes operados/zerados e clientes distintos (por conta) em cada produto.">
          {d.produtos.length === 0
            ? <Vazio loading={d.loading} />
            : (
              <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                <table className="text-xs border-collapse min-w-max w-full">
                  <thead style={{ background: 'var(--surface-2)' }}>
                    <tr>
                      {['Produto', 'Lotes op.', '% do total', 'Lotes ze.', '% zer.', 'Clientes', 'Dias'].map((h, i) => (
                        <th key={i} className={th(i === 0 ? 'left' : 'right')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.produtos.map((p, i) => {
                      const pctTotal = totalOperado > 0 ? (p.lotes_operados / totalOperado) * 100 : 0
                      const pctZe = p.lotes_operados > 0 ? (p.lotes_zerados / p.lotes_operados) * 100 : 0
                      return (
                        <tr key={p.produto} style={rowStyle(i)}>
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
      </div>

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

      {d.isPending && (
        <div className="text-xs text-gray-400 flex items-center gap-2 justify-end">
          <Layers className="w-3 h-3 animate-pulse" /> atualizando…
        </div>
      )}
    </div>
  )
}

function ProdutosDetalhadosTable({ rows }: { rows: ProdutoDetalhado[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
      <table className="text-xs border-collapse min-w-max w-full">
        <thead style={{ background: 'var(--surface-2)' }}>
          <tr>
            {['Produto', 'Último dia', 'Mês atual', 'Mês anterior', 'Δ MTD', 'Período', 'Média/dia'].map((h, i) => (
              <th key={i} className={th(i === 0 ? 'left' : 'right')}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const delta = p.delta_pct_vs_mes_ant
            const color = delta > 0.05 ? '#059669' : delta < -0.05 ? '#dc2626' : '#6b7280'
            return (
              <tr key={p.produto} style={rowStyle(i)}>
                <td className="px-3 py-1.5 font-semibold text-gray-700">{p.produto}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(p.lotes_dia)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtNum(p.lotes_mtd)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtNum(p.lotes_mes_anterior)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold" style={{ color }}>{fmtDelta(delta)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(p.lotes_periodo)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtNum(p.media_diaria)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
