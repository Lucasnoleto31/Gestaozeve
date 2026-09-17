'use client'

import { useEffect, useState } from 'react'
import { Activity, Calendar, Trophy, Users } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { WinVsWdoBlock, DrilldownModal } from '../_lib/Blocks'
import type { DrilldownRow, ProdutoDetalhado } from '../actions'
import { getDrilldownDia } from '../actions'
import { fmtNum, fmtDataPt } from '@/lib/format'
import { Panel } from '@/components/ui/Panel'
import { KpiCard, KpiRow, DeltaText } from '@/components/ui/Kpi'
import { Alert } from '@/components/ui/Alert'
import { ChartSkeleton, Empty } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'

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
    <>
      {d.erro && <Alert tone="danger">{d.erro}</Alert>}

      {/* 4 KPIs operacionais — todos do período/filtros */}
      <KpiRow>
        <KpiCard icon={Calendar} label="Pregões" tone="accent" loading={d.loading && !k}
          value={k ? fmtNum(k.num_dias_com_dado) : '—'} sub="dias com operação no período" />
        <KpiCard icon={Users} label="Clientes ativos" tone="success" loading={d.loading && !k}
          value={k ? fmtNum(k.num_clientes_ativos) : '—'} sub="contas que operaram"
          delta={k && ka ? { atual: k.num_clientes_ativos, anterior: ka.num_clientes_ativos, rotulo, fmt: fmtNum } : null} />
        <KpiCard icon={Activity} label="Lotes por pregão" tone="violet" loading={d.loading && !k}
          value={k ? fmtNum(k.media_diaria) : '—'}
          sub={k?.ultimo_dia_data ? `último dia (${fmtDataPt(k.ultimo_dia_data)}): ${fmtNum(k.ultimo_dia_lotes)}` : undefined}
          delta={k && ka ? { atual: k.media_diaria, anterior: ka.media_diaria, rotulo, fmt: fmtNum } : null} />
        <KpiCard icon={Trophy} label="Melhor dia" tone="info" loading={d.loading && !k}
          value={k?.maior_dia_data ? fmtNum(k.maior_dia_lotes) : '—'}
          sub={k?.maior_dia_data ? `lotes em ${fmtDataPt(k.maior_dia_data)}` : undefined} />
      </KpiRow>

      {/* Gráfico diário WIN vs WDO */}
      {d.loading && d.diario.length === 0
        ? <Panel title="Volume diário — WIN vs WDO"><ChartSkeleton height={320} /></Panel>
        : <WinVsWdoBlock data={d.diario} onClickDia={abrirDrilldown} />}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* Comparativo por produto: dia / mês / mês anterior */}
        <Panel flush title="Ritmo por produto"
          subtitle="Último pregão, mês atual (MTD), mês anterior completo e variação MTD vs mês anterior. Média diária = lotes do período ÷ pregões.">
          {d.produtosDetalhados.length === 0
            ? <div className="p-5"><Empty loading={d.loading}>Sem dados no período (ou supabase-s15 ainda não aplicado).</Empty></div>
            : <ProdutosDetalhadosTable rows={d.produtosDetalhados} />}
        </Panel>

        {/* Volume por produto */}
        <Panel flush title="Volume por produto no período"
          subtitle="Lotes operados/zerados e clientes distintos (por conta) em cada produto.">
          {d.produtos.length === 0
            ? <div className="p-5"><Empty loading={d.loading} /></div>
            : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th className="num">Lotes op.</th>
                      <th className="num">% do total</th>
                      <th className="num">Lotes ze.</th>
                      <th className="num">% zer.</th>
                      <th className="num">Clientes</th>
                      <th className="num">Dias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.produtos.map(p => {
                      const pctTotal = totalOperado > 0 ? (p.lotes_operados / totalOperado) * 100 : 0
                      const pctZe = p.lotes_operados > 0 ? (p.lotes_zerados / p.lotes_operados) * 100 : 0
                      return (
                        <tr key={p.produto}>
                          <td className="font-semibold">{p.produto}</td>
                          <td className="num font-medium">{fmtNum(p.lotes_operados)}</td>
                          <td className="num muted">{pctTotal.toFixed(1)}%</td>
                          <td className="num muted">{fmtNum(p.lotes_zerados)}</td>
                          <td className="num">{pctZe.toFixed(1)}%</td>
                          <td className="num">{fmtNum(p.num_clientes)}</td>
                          <td className="num muted">{fmtNum(p.num_dias)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </Panel>
      </div>

      {drillData && (
        drillErro
          ? (
            <Modal open onClose={() => setDrillData(null)} size="sm" title="Detalhe do dia">
              <Alert tone="danger">Falha ao carregar o detalhe do dia. Tente de novo.</Alert>
            </Modal>
          )
          : <DrilldownModal data={drillData} rows={drillRows} onClose={() => setDrillData(null)} />
      )}
    </>
  )
}

function ProdutosDetalhadosTable({ rows }: { rows: ProdutoDetalhado[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Produto</th>
            <th className="num">Último dia</th>
            <th className="num">Mês atual</th>
            <th className="num">Mês anterior</th>
            <th className="num">Δ MTD</th>
            <th className="num">Período</th>
            <th className="num">Média/dia</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.produto}>
              <td className="font-semibold">{p.produto}</td>
              <td className="num">{fmtNum(p.lotes_dia)}</td>
              <td className="num font-medium">{fmtNum(p.lotes_mtd)}</td>
              <td className="num muted">{fmtNum(p.lotes_mes_anterior)}</td>
              <td className="num"><DeltaText pct={p.delta_pct_vs_mes_ant} /></td>
              <td className="num">{fmtNum(p.lotes_periodo)}</td>
              <td className="num muted">{fmtNum(p.media_diaria)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
