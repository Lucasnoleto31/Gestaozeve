'use client'

import { useEffect, useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { Calendar, DollarSign, Target, TrendingUp } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { ChartTooltip } from '../Charts'
import { fmtBRL, fmtBRL2, fmtNum, fmtDataPt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useChartColors } from '@/lib/theme'
import { CORRETORA_LABEL } from '@/lib/corretoras'
import { Panel } from '@/components/ui/Panel'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Alert } from '@/components/ui/Alert'
import { Empty } from '@/components/ui/Skeleton'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'

const CLASSE_CLASS: Record<string, string> = {
  A: 'bg-success-soft text-success',
  B: 'bg-accent-soft text-accent',
  C: 'bg-warning-soft text-warning',
  D: 'bg-surface-3 text-fg-muted',
}
const CLASSE_LABEL: Record<string, string> = {
  A: 'A · Ultra lucrativos',
  B: 'B · Consistentes',
  C: 'C · Sobreviventes',
  D: 'D · Marginais',
}

const MODELO_ZERAGEM: Record<string, string> = {
  tiered: 'escalonada', mesmo_operado: 'igual ao lote', b2b: 'B2B',
}

export function ReceitaView() {
  const { periodo, barra, excluir, corretora } = useDashboardFilters()
  const d = useDashboardData(periodo, barra, excluir, corretora, {
    receita: true, meta: true, kpis: true, curvaAbc: true, receitaBrutaLiquida: true,
  })
  const cores = useChartColors()

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  // Dados do gráfico ABC — top 20 clientes em barras + linha de % acumulado
  const chartData = useMemo(() => d.abc.slice(0, 20).map(r => ({
    nome: r.cliente_nome.slice(0, 18),
    Receita: r.receita_estimada,
    Acumulado: r.pct_acumulado,
  })), [d.abc])

  const abcAgg = ['A', 'B', 'C', 'D'].map(c => {
    const rows = d.abc.filter(r => r.classe === c)
    return { classe: c, num: rows.length, receita: rows.reduce((s, r) => s + r.receita_estimada, 0) }
  })

  const receitaPorBarra = useMemo(() => [...d.receitaPorAss].sort((a, b) => b.receita_total - a.receita_total), [d.receitaPorAss])
  const semTarifa = d.receitaTotal?.num_barras_sem_pricing ?? 0
  const escopoLabel = corretora ? CORRETORA_LABEL[corretora] : 'escritório'

  return (
    <>
      {d.erro && <Alert tone="danger">{d.erro}</Alert>}

      <p className="max-w-4xl text-xs text-fg-muted">
        {d.range.inicio && <>Período <strong className="font-medium text-fg">{fmtDataPt(d.range.inicio)} a {fmtDataPt(d.range.fim)}</strong>. </>}
        Receita estimada = tarifa cadastrada × lotes WIN/WDO (mais a tarifa por produto para IND, DOL, BIT etc., quando cadastrada), com a tarifa da corretora de cada barra; segue corretora, barra e exclusão de cliente.
        Projeção do mês e ritmo da meta valem para o {escopoLabel} inteiro.
        {semTarifa > 0 && <> <strong className="font-medium text-warning">{semTarifa} barra(s) sem tarifa</strong> geram lotes mas não receita.</>}
      </p>

      <KpiRow>
        <KpiCard icon={DollarSign} label="Receita bruta" tone="accent" loading={d.loading && !d.receitaBL}
          value={d.receitaBL ? fmtBRL2(d.receitaBL.receita_bruta) : '—'}
          sub={d.receitaTotal
            ? `operados ${fmtBRL(d.receitaTotal.receita_operados)} · zeragem ${fmtBRL(d.receitaTotal.receita_zeragem)}${d.receitaTotal.receita_outros > 0 ? ` · outros ${fmtBRL(d.receitaTotal.receita_outros)}` : ''}`
            : 'operados + zeragem + outros produtos'} />
        <KpiCard icon={DollarSign} label="Receita líquida" tone="success" loading={d.loading && !d.receitaBL}
          value={d.receitaBL ? fmtBRL2(d.receitaBL.receita_liquida) : '—'}
          sub={d.receitaBL ? `retenção média de ${d.receitaBL.pct_repasse_medio.toFixed(0)}%` : undefined} />
        <KpiCard icon={TrendingUp} label="Projeção do mês atual" tone="violet" loading={d.loading && !d.receitaProj}
          value={d.receitaProj ? fmtBRL(d.receitaProj.projecao_total) : '—'}
          sub={d.receitaProj ? `${fmtBRL(d.receitaProj.receita_consolidada)} até agora · ${d.receitaProj.dias_corridos_restantes} dias úteis restantes` : undefined} />
        <KpiCard icon={d.meta && d.meta.meta_receita > 0 ? Target : Calendar} label="Ritmo necessário" tone="warning" loading={d.loading && !d.meta}
          value={d.meta && d.meta.meta_receita > 0 ? fmtBRL(d.meta.ritmo_receita_necessario) : '—'}
          sub={d.meta && d.meta.meta_receita > 0 ? `por pregão · meta ${d.meta.pct_receita.toFixed(1)}% atingida` : 'sem meta cadastrada'} />
      </KpiRow>

      {/* Receita por barra */}
      <Panel flush title="Receita estimada por barra"
        subtitle="Tarifa da corretora de cada barra × lotes WIN/WDO. Lotes de outros produtos aparecem no volume mas ainda não geram receita aqui.">
        {receitaPorBarra.length === 0
          ? <div className="p-5"><Empty loading={d.loading} /></div>
          : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Barra</th>
                    <th>Nº</th>
                    <th>Tarifa</th>
                    <th>Zeragem</th>
                    <th className="num">Lotes op.</th>
                    <th className="num">Lotes ze.</th>
                    <th className="num">Rec. operados</th>
                    <th className="num">Rec. zeragem</th>
                    <th className="num">Rec. outros</th>
                    <th className="num">Receita</th>
                    <th className="num">Líquida</th>
                  </tr>
                </thead>
                <tbody>
                  {receitaPorBarra.map((r, i) => (
                    <tr key={`${r.corretora}|${r.barra_nome}|${i}`}>
                      <td className="subtle font-semibold tabular-nums">{i + 1}</td>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <span className={cn('font-medium', r.barra_nome === 'Sem barra' ? 'italic text-fg-subtle' : 'text-fg')}>{r.barra_nome}</span>
                          <CorretoraBadge corretora={r.corretora} />
                        </span>
                      </td>
                      <td className="muted tabular-nums">{r.numero ?? '—'}</td>
                      <td className="muted tabular-nums">
                        {r.preco_lote_futuros > 0 ? `${fmtBRL2(r.preco_lote_futuros)}/lote` : <span className="font-medium text-warning">sem tarifa</span>}
                      </td>
                      <td className="muted">
                        {r.modelo_zeragem === 'fixo' ? `fixa ${fmtBRL2(r.preco_zeragem)}` : MODELO_ZERAGEM[r.modelo_zeragem] ?? r.modelo_zeragem}
                      </td>
                      <td className="num">{fmtNum(r.lotes_operados)}</td>
                      <td className="num muted">{fmtNum(r.lotes_zerados)}</td>
                      <td className="num">{fmtBRL2(r.receita_operados)}</td>
                      <td className="num">{fmtBRL2(r.receita_zeragem)}</td>
                      <td className="num muted">{r.receita_outros > 0 ? fmtBRL2(r.receita_outros) : '—'}</td>
                      <td className="num font-semibold text-success">{fmtBRL2(r.receita_total)}</td>
                      <td className="num muted">{fmtBRL2(r.receita_liquida)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Panel>

      {/* Curva ABC */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="Curva ABC — top 20 clientes"
          subtitle="Barras = receita individual · linha = % acumulado. Onde a linha cruza ~70% termina a classe A.">
          {chartData.length === 0
            ? <Empty loading={d.loading} />
            : (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chartData} margin={{ top: 10, right: 8, bottom: 60, left: 0 }}>
                  <CartesianGrid stroke={cores.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="nome" tick={{ fontSize: 9, fill: cores.axis }} angle={-30} textAnchor="end" interval={0} axisLine={{ stroke: cores.grid }} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: cores.axis }} tickFormatter={(v) => 'R$' + (v / 1000).toFixed(0) + 'k'} axisLine={false} tickLine={false} width={52} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: cores.axis }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} axisLine={false} tickLine={false} width={40} />
                  <Tooltip content={<ChartTooltip formatter={(v, name) => name === 'Receita' ? fmtBRL2(v) : `${v.toFixed(1)}%`} />} cursor={{ fill: cores.grid }} />
                  <Bar yAxisId="left" dataKey="Receita" fill={cores.receita} radius={[3, 3, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="Acumulado" stroke={cores.acumulado} strokeWidth={2} dot={{ r: 3, fill: cores.acumulado, strokeWidth: 0 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
        </Panel>

        <Panel flush title="Clientes por classe ABC"
          subtitle={abcAgg.map(a => `${a.classe}: ${a.num}`).join(' · ')}>
          {d.abc.length === 0
            ? <div className="p-5"><Empty loading={d.loading} /></div>
            : (
              <div className="max-h-[360px] overflow-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="w-10">#</th>
                      <th>Cliente</th>
                      <th>Barra</th>
                      <th>Classe</th>
                      <th className="num">Receita</th>
                      <th className="num">%</th>
                      <th className="num">% acum.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.abc.slice(0, 30).map(r => (
                      <tr key={`${r.cliente_id ?? r.cliente_nome}-${r.rank}`}>
                        <td className="subtle font-semibold tabular-nums">{r.rank}</td>
                        <td className="max-w-[200px] truncate font-medium">{r.cliente_nome}</td>
                        <td className="muted max-w-[140px] truncate">{r.assessor_nome ?? '—'}</td>
                        <td>
                          <span className={cn('inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold', CLASSE_CLASS[r.classe] ?? CLASSE_CLASS.D)}>
                            {CLASSE_LABEL[r.classe] ?? r.classe}
                          </span>
                        </td>
                        <td className="num font-semibold text-success">{fmtBRL2(r.receita_estimada)}</td>
                        <td className="num">{r.pct_individual.toFixed(2)}%</td>
                        <td className="num muted">{r.pct_acumulado.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Panel>
      </div>
    </>
  )
}
