'use client'

import { useEffect, useMemo } from 'react'
import { Gift, TrendingUp, Users, Target, Layers } from 'lucide-react'
import {
  Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { Block } from '../_lib/Blocks'
import { KpiCard, KpiRow } from '../_lib/Kpi'
import { fmtNum, fmtBRL } from '../_lib/utils'
import { ACTIONS } from '../_lib/dashboardActions'
import type { IncentivoMensalRow } from '../actions'

// Faixas do programa de incentivo (pontos → R$ por cliente que atingiu a faixa)
const FAIXAS: { min: number; valor: number; label: string }[] = [
  { min: 1_000_000, valor: 49_000, label: 'Mais de 1.000.000' },
  { min: 750_000,   valor: 42_000, label: 'Mais de 750.000' },
  { min: 500_000,   valor: 31_500, label: 'Mais de 500.000' },
  { min: 300_000,   valor: 21_000, label: 'Mais de 300.000' },
  { min: 150_000,   valor: 12_000, label: 'Mais de 150.000' },
  { min: 50_000,    valor: 5_000,  label: 'Mais de 50.000' },
  { min: 10_000,    valor: 1_000,  label: 'Mais de 10.000' },
  { min: 5_000,     valor: 500,    label: 'Mais de 5.000' },
  { min: 1_000,     valor: 200,    label: 'Mais de 1.000' },
]

// Multiplicador de pontos por produto (tabela de pontuação do programa)
const PONTUACAO: { produto: string; mult: number }[] = [
  { produto: 'BIT', mult: 4 }, { produto: 'DI1', mult: 1 }, { produto: 'DOL', mult: 5 },
  { produto: 'ETR', mult: 3 }, { produto: 'GLD', mult: 3 }, { produto: 'IND', mult: 3 },
  { produto: 'SOL', mult: 3 }, { produto: 'WDO', mult: 2 }, { produto: 'WIN', mult: 1 },
  { produto: 'WSP', mult: 1 },
]

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function labelMesAno(iso: string): string {
  const m = parseInt(iso.slice(5, 7), 10)
  return `${MESES_ABREV[m - 1] ?? iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

// Pivota as linhas (mes, faixa) em matrizes por faixa × mês
function pivotIncentivo(rows: IncentivoMensalRow[]) {
  const meses = Array.from(new Set(rows.map(r => r.mes))).sort()
  const valor = new Map<number, Map<string, number>>()    // faixa_min → mes → R$
  const clientes = new Map<number, Map<string, number>>() // faixa_min → mes → nº clientes
  const totalMes = new Map<string, number>()              // mes → R$ (incentivo direto)
  const totalClientesMes = new Map<string, number>()      // mes → nº clientes ativos

  rows.forEach(r => {
    if (!valor.has(r.faixa_min)) { valor.set(r.faixa_min, new Map()); clientes.set(r.faixa_min, new Map()) }
    valor.get(r.faixa_min)!.set(r.mes, r.valor_total)
    clientes.get(r.faixa_min)!.set(r.mes, r.num_clientes)
    totalMes.set(r.mes, (totalMes.get(r.mes) ?? 0) + r.valor_total)
    totalClientesMes.set(r.mes, (totalClientesMes.get(r.mes) ?? 0) + r.num_clientes)
  })
  return { meses, valor, clientes, totalMes, totalClientesMes }
}

export function IncentivoView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    kpis: true, incentivo: true, incentivoClientes: true,
  })

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  const piv = useMemo(() => pivotIncentivo(d.incentivo), [d.incentivo])
  const { meses, totalMes, totalClientesMes } = piv

  const ultimoMes = meses[meses.length - 1] ?? null
  const mesAnterior = meses[meses.length - 2] ?? null
  const anoAtual = ultimoMes?.slice(0, 4)
  const acumuladoAno = meses
    .filter(m => anoAtual && m.startsWith(anoAtual))
    .reduce((acc, m) => acc + (totalMes.get(m) ?? 0), 0)
  const acumuladoTotal = meses.reduce((acc, m) => acc + (totalMes.get(m) ?? 0), 0)

  const chartData = meses.map((m, i) => ({
    mes: labelMesAno(m).replace('/20', '/') + (i === meses.length - 1 ? '*' : ''),
    Incentivo: totalMes.get(m) ?? 0,
  }))

  return (
    <div className="space-y-5">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Pontos do cliente no mês = lotes girados × multiplicador do produto. O incentivo é pago por cliente
        conforme a maior faixa de pontos atingida no mês. Esta aba usa o histórico completo (não segue o filtro de período).
      </p>

      {/* KPIs */}
      <KpiRow>
        <KpiCard icon={Gift} label={ultimoMes ? `Incentivo ${labelMesAno(ultimoMes)}` : 'Incentivo do mês'}
          value={ultimoMes ? fmtBRL(totalMes.get(ultimoMes) ?? 0) : '—'}
          sub="mês em andamento (parcial)" accent="#10b981" />
        <KpiCard icon={TrendingUp} label={mesAnterior ? `Incentivo ${labelMesAno(mesAnterior)}` : 'Mês anterior'}
          value={mesAnterior ? fmtBRL(totalMes.get(mesAnterior) ?? 0) : '—'}
          sub="mês fechado" accent="#1764f4" />
        <KpiCard icon={Target} label={`Acumulado ${anoAtual ?? 'ano'}`}
          value={anoAtual ? fmtBRL(acumuladoAno) : '—'}
          sub={`histórico completo: ${fmtBRL(acumuladoTotal)}`} accent="#a855f7" />
        <KpiCard icon={Users} label="Clientes pontuando"
          value={ultimoMes
            ? fmtNum((totalClientesMes.get(ultimoMes) ?? 0) - (piv.clientes.get(0)?.get(ultimoMes) ?? 0))
            : '—'}
          sub={ultimoMes ? `de ${fmtNum(totalClientesMes.get(ultimoMes) ?? 0)} ativos no mês` : undefined}
          accent="#0891b2" />
      </KpiRow>

      {/* Gráfico do incentivo mês a mês */}
      <Block title="Incentivo direto por mês" subtitle="Soma do incentivo de todas as faixas. * = mês em andamento.">
        {chartData.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.15)" strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v: number) => fmtNum(v)} />
                <Tooltip formatter={(v) => fmtBRL(Number(v))}
                  contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.2)',
                                  borderRadius: 12, color: '#e2e8f0', fontSize: 12 }} />
                <Bar dataKey="Incentivo" fill="#10b981" radius={[4, 4, 0, 0]} animationDuration={400} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
      </Block>

      {/* Matriz: incentivo R$ por faixa × mês */}
      <Block title="Incentivo por faixa de pontos (R$)"
        subtitle="Valor da faixa × nº de clientes que atingiram a faixa no mês. Última coluna = mês em andamento.">
        {meses.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : <MatrizIncentivo piv={piv} modo="valor" />}
      </Block>

      {/* Matriz: clientes por faixa × mês */}
      <Block title="Clientes por faixa de pontuação"
        subtitle="Cada cliente conta na maior faixa que atingiu no mês. “Resto” = ativos com até 1.000 pontos.">
        {meses.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : <MatrizIncentivo piv={piv} modo="clientes" />}
      </Block>

      {/* Clientes do mês em andamento */}
      <Block title={ultimoMes ? `Pontuação dos clientes — ${labelMesAno(ultimoMes)}` : 'Pontuação dos clientes'}
        subtitle="Quem está pontuando agora e quanto falta pra próxima faixa — bom pra saber quem vale a pena estimular a girar mais.">
        {d.incentivoCli.length === 0
          ? <p className="text-sm text-gray-400 py-4">{d.isPending ? 'Carregando…' : 'Sem dados.'}</p>
          : (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="text-xs border-collapse min-w-max w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {['#', 'Conta', 'Cliente', 'Lotes', 'Pontos', 'Faixa atual', 'Incentivo', 'Próxima faixa'].map((h, i) => (
                      <th key={i} className={`px-3 py-2 font-semibold text-gray-500 ${i <= 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.incentivoCli.slice(0, 50).map((c, i) => (
                    <tr key={c.conta}
                      style={{ borderTop: '1px solid var(--border)',
                               background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                      <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-1.5 text-gray-500 tabular-nums">{c.conta}</td>
                      <td className="px-3 py-1.5 font-medium text-gray-700">{c.cliente_nome}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtNum(c.lotes_operados)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtNum(c.pontos)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                        {c.faixa_min > 0 ? `> ${fmtNum(c.faixa_min)}` : 'Resto'}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-emerald-700">
                        {c.valor_incentivo > 0 ? fmtBRL(c.valor_incentivo) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                        {c.proxima_faixa != null && c.pontos_faltantes != null
                          ? `faltam ${fmtNum(c.pontos_faltantes)} p/ > ${fmtNum(c.proxima_faixa)}`
                          : 'faixa máxima'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Block>

      {/* Tabela de pontuação por produto */}
      <Block title="Tabela de pontuação" subtitle="Multiplicador aplicado a cada lote girado do produto.">
        <div className="flex flex-wrap gap-2">
          {PONTUACAO.map(p => (
            <span key={p.produto} className="px-3 py-1.5 rounded-lg text-xs font-semibold tabular-nums"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}>
              {p.produto} <span className="text-gray-400">·</span> {p.mult}×
            </span>
          ))}
        </div>
      </Block>

      {d.isPending && (
        <div className="text-xs text-gray-400 flex items-center gap-2 justify-end">
          <Layers className="w-3 h-3 animate-pulse" /> atualizando…
        </div>
      )}
    </div>
  )
}

// Matriz faixa × mês (valores em R$ ou nº de clientes), com coluna de faixa fixa
function MatrizIncentivo({ piv, modo }: {
  piv: ReturnType<typeof pivotIncentivo>
  modo: 'valor' | 'clientes'
}) {
  const { meses, valor, clientes, totalMes, totalClientesMes } = piv
  const fonte = modo === 'valor' ? valor : clientes
  const fmt = modo === 'valor'
    ? (n: number) => (n > 0 ? fmtBRL(n) : '—')
    : (n: number) => (n > 0 ? fmtNum(n) : '—')

  // No modo clientes, inclui a linha "Resto" (faixa_min = 0)
  const linhas = modo === 'clientes'
    ? [...FAIXAS, { min: 0, valor: 0, label: 'Resto' }]
    : FAIXAS

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
      <table className="text-xs border-collapse min-w-max w-full">
        <thead style={{ background: 'var(--surface-2)' }}>
          <tr>
            <th className="px-3 py-2 font-semibold text-gray-500 text-left sticky left-0 z-10"
              style={{ background: 'var(--surface-2)' }}>Faixa</th>
            {modo === 'valor' && <th className="px-3 py-2 font-semibold text-gray-500 text-right">Valor (R$)</th>}
            {meses.map(m => (
              <th key={m} className="px-3 py-2 font-semibold text-gray-500 text-right whitespace-nowrap">
                {labelMesAno(m)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((f, i) => (
            <tr key={f.min}
              style={{ borderTop: '1px solid var(--border)',
                       background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
              <td className="px-3 py-1.5 font-medium text-gray-700 whitespace-nowrap sticky left-0 z-10"
                style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                {f.label}
              </td>
              {modo === 'valor' && (
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmtBRL(f.valor)}</td>
              )}
              {meses.map(m => {
                const v = fonte.get(f.min)?.get(m) ?? 0
                return (
                  <td key={m} className={`px-3 py-1.5 text-right tabular-nums ${v > 0 ? 'font-medium text-gray-700' : 'text-gray-300'}`}>
                    {fmt(v)}
                  </td>
                )
              })}
            </tr>
          ))}
          {/* Linha de total */}
          <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
            <td className="px-3 py-2 font-bold text-gray-800 sticky left-0 z-10"
              style={{ background: 'var(--surface-2)' }}>
              {modo === 'valor' ? 'Incentivo direto' : 'Total de clientes'}
            </td>
            {modo === 'valor' && <td />}
            {meses.map(m => (
              <td key={m} className="px-3 py-2 text-right tabular-nums font-bold"
                style={{ color: modo === 'valor' ? '#059669' : 'var(--ink)' }}>
                {modo === 'valor' ? fmtBRL(totalMes.get(m) ?? 0) : fmtNum(totalClientesMes.get(m) ?? 0)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
