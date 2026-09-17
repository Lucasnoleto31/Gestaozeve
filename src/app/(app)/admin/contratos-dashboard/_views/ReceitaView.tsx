'use client'

import { useEffect, useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { DollarSign, TrendingUp, Calendar, Layers, Target } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { Block } from '../_lib/Blocks'
import { CorretoraBadge } from '../ChartsCorretora'
import { fmtBRL, fmtBRL2, fmtNum, fmtDataPt } from '../_lib/utils'
import { KpiCard, KpiRow, Vazio } from '../_lib/Kpi'
import { CORRETORA_LABEL } from '@/lib/corretoras'

const CLASSE_COLOR: Record<string, string> = {
  A: '#10b981', B: '#1764f4', C: '#f59e0b', D: '#94a3b8',
}
const CLASSE_LABEL: Record<string, string> = {
  A: 'A · Ultra lucrativos',
  B: 'B · Consistentes',
  C: 'C · Sobreviventes',
  D: 'D · Marginais',
}

const th = (align: 'left' | 'right') =>
  `px-3 py-2 font-semibold text-gray-500 ${align === 'left' ? 'text-left' : 'text-right'}`
const rowStyle = (i: number) => ({
  borderTop: '1px solid var(--border)',
  background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
})

export function ReceitaView() {
  const { periodo, barra, excluir, corretora } = useDashboardFilters()
  const d = useDashboardData(periodo, barra, excluir, corretora, {
    receita: true, meta: true, kpis: true, curvaAbc: true, receitaBrutaLiquida: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  // Dados do gráfico ABC — top 20 clientes em barras + linha de % acumulado
  const chartData = useMemo(() => d.abc.slice(0, 20).map(r => ({
    nome: r.cliente_nome.slice(0, 18),
    receita: r.receita_estimada,
    acumulado: r.pct_acumulado,
  })), [d.abc])

  const abcAgg = ['A', 'B', 'C', 'D'].map(c => {
    const rows = d.abc.filter(r => r.classe === c)
    return { classe: c, num: rows.length, receita: rows.reduce((s, r) => s + r.receita_estimada, 0) }
  })

  const receitaPorBarra = useMemo(() => [...d.receitaPorAss].sort((a, b) => b.receita_total - a.receita_total), [d.receitaPorAss])
  const semTarifa = d.receitaTotal?.num_barras_sem_pricing ?? 0
  const escopoLabel = corretora ? CORRETORA_LABEL[corretora] : 'escritório'

  return (
    <div className="space-y-5">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      <p className="text-xs text-gray-500">
        {d.range.inicio && <>Período <strong className="text-gray-700">{fmtDataPt(d.range.inicio)} a {fmtDataPt(d.range.fim)}</strong>. </>}
        Receita estimada = tarifa cadastrada × lotes WIN/WDO, com a tarifa da corretora de cada barra; segue corretora, barra e exclusão de cliente.
        Projeção do mês e ritmo da meta valem para o {escopoLabel} inteiro.
        {semTarifa > 0 && <> <strong className="text-amber-700">{semTarifa} barra(s) sem tarifa</strong> geram lotes mas não receita.</>}
      </p>

      <KpiRow>
        <KpiCard icon={DollarSign} label="Receita bruta" loading={d.loading && !d.receitaBL}
          value={d.receitaBL ? fmtBRL2(d.receitaBL.receita_bruta) : '—'}
          sub={d.receitaTotal ? `operados ${fmtBRL(d.receitaTotal.receita_operados)} · zeragem ${fmtBRL(d.receitaTotal.receita_zeragem)}` : 'operados + zeragem'}
          accent="#1764f4" />
        <KpiCard icon={DollarSign} label="Receita líquida" loading={d.loading && !d.receitaBL}
          value={d.receitaBL ? fmtBRL2(d.receitaBL.receita_liquida) : '—'}
          sub={d.receitaBL ? `retenção média de ${d.receitaBL.pct_repasse_medio.toFixed(0)}%` : undefined}
          accent="#10b981" />
        <KpiCard icon={TrendingUp} label="Projeção do mês atual" loading={d.loading && !d.receitaProj}
          value={d.receitaProj ? fmtBRL(d.receitaProj.projecao_total) : '—'}
          sub={d.receitaProj ? `${fmtBRL(d.receitaProj.receita_consolidada)} até agora · ${d.receitaProj.dias_corridos_restantes} dias úteis restantes` : undefined}
          accent="#a855f7" />
        <KpiCard icon={d.meta && d.meta.meta_receita > 0 ? Target : Calendar} label="Ritmo necessário" loading={d.loading && !d.meta}
          value={d.meta && d.meta.meta_receita > 0 ? fmtBRL(d.meta.ritmo_receita_necessario) : '—'}
          sub={d.meta && d.meta.meta_receita > 0 ? `por pregão · meta ${d.meta.pct_receita.toFixed(1)}% atingida` : 'sem meta cadastrada'}
          accent="#f59e0b" />
      </KpiRow>

      {/* Receita por barra */}
      <Block title="Receita estimada por barra"
        subtitle="Tarifa da corretora de cada barra × lotes WIN/WDO. Lotes de outros produtos aparecem no volume mas ainda não geram receita aqui.">
        {receitaPorBarra.length === 0
          ? <Vazio loading={d.loading} />
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['#', 'Barra', 'Nº', 'Tarifa', 'Zeragem', 'Lotes op.', 'Lotes ze.', 'Rec. operados', 'Rec. zeragem', 'Receita', 'Líquida'].map((h, i) => (
                      <th key={i} className={th(i <= 4 ? 'left' : 'right')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {receitaPorBarra.map((r, i) => (
                    <tr key={`${r.corretora}|${r.barra_nome}|${i}`} style={rowStyle(i)}>
                      <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-1.5">
                        <span className="inline-flex items-center gap-2">
                          <span className={`font-medium ${r.barra_nome === 'Sem barra' ? 'text-gray-400 italic' : 'text-gray-700'}`}>{r.barra_nome}</span>
                          <CorretoraBadge corretora={r.corretora} />
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-gray-500 tabular-nums">{r.numero ?? '—'}</td>
                      <td className="px-3 py-1.5 text-gray-500 tabular-nums">
                        {r.preco_lote_futuros > 0 ? `${fmtBRL2(r.preco_lote_futuros)}/lote` : <span className="text-amber-700">sem tarifa</span>}
                      </td>
                      <td className="px-3 py-1.5 text-gray-500">
                        {r.modelo_zeragem === 'tiered' ? 'escalonada' : r.modelo_zeragem === 'fixo' ? `fixa ${fmtBRL2(r.preco_zeragem)}` : r.modelo_zeragem === 'mesmo_operado' ? 'igual ao lote' : 'B2B'}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(r.lotes_operados)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtNum(r.lotes_zerados)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtBRL2(r.receita_operados)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtBRL2(r.receita_zeragem)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-emerald-700">{fmtBRL2(r.receita_total)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{fmtBRL2(r.receita_liquida)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Block>

      {/* Curva ABC */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Block title="Curva ABC — top 20 clientes"
          subtitle="Barras = receita individual · linha = % acumulado. Onde a linha cruza ~70% termina a classe A.">
          {chartData.length === 0
            ? <Vazio loading={d.loading} />
            : (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chartData} margin={{ top: 10, right: 16, bottom: 60, left: 0 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
                  <XAxis dataKey="nome" tick={{ fontSize: 9, fill: '#94a3b8' }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => 'R$' + (v/1000).toFixed(0) + 'k'} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }}
                    formatter={(v, name) => name === 'receita' ? fmtBRL2(v as number) : `${(v as number).toFixed(1)}%`} />
                  <Bar yAxisId="left" dataKey="receita" fill="#1764f4" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="acumulado" stroke="#dc2626" strokeWidth={2} dot={{ r: 3, fill: '#dc2626' }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
        </Block>

        <Block title="Clientes por classe ABC"
          subtitle={abcAgg.map(a => `${a.classe}: ${a.num}`).join(' · ')}>
          {d.abc.length === 0
            ? <Vazio loading={d.loading} />
            : (
              <div className="overflow-x-auto rounded-xl border max-h-[360px]" style={{ borderColor: 'var(--border)' }}>
                <table className="text-xs border-collapse min-w-max w-full">
                  <thead className="sticky top-0" style={{ background: 'var(--surface-2)' }}>
                    <tr>
                      {['#', 'Cliente', 'Barra', 'Classe', 'Receita', '%', '% acum.'].map((h, i) => (
                        <th key={i} className={th(i <= 3 ? 'left' : 'right')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.abc.slice(0, 30).map((r, i) => {
                      const color = CLASSE_COLOR[r.classe]
                      return (
                        <tr key={`${r.cliente_id ?? r.cliente_nome}-${r.rank}`} style={rowStyle(i)}>
                          <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{r.rank}</td>
                          <td className="px-3 py-1.5 font-medium text-gray-700 truncate max-w-[200px]">{r.cliente_nome}</td>
                          <td className="px-3 py-1.5 text-gray-500 truncate max-w-[140px]">{r.assessor_nome ?? '—'}</td>
                          <td className="px-3 py-1.5">
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap"
                              style={{ background: `${color}20`, color }}>
                              {CLASSE_LABEL[r.classe]}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-emerald-700">{fmtBRL2(r.receita_estimada)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{r.pct_individual.toFixed(2)}%</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{r.pct_acumulado.toFixed(2)}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </Block>
      </div>

      {d.isPending && (
        <div className="text-xs text-gray-400 flex items-center gap-2 justify-end">
          <Layers className="w-3 h-3 animate-pulse" /> atualizando…
        </div>
      )}
    </div>
  )
}
