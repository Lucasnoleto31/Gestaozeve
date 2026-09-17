'use client'

import { useEffect, useMemo } from 'react'
import { Gift, Target, TrendingUp, Users } from 'lucide-react'
import {
  Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { ChartTooltip } from '../Charts'
import { fmtNum, fmtBRL, labelMesAno } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useChartColors } from '@/lib/theme'
import { Panel } from '@/components/ui/Panel'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Alert } from '@/components/ui/Alert'
import { Empty } from '@/components/ui/Skeleton'
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
  const { periodo, barra, excluir, corretora } = useDashboardFilters()
  const d = useDashboardData(periodo, barra, excluir, corretora, {
    kpis: true, incentivo: true, incentivoClientes: true,
  })
  const cores = useChartColors()

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

  const vazio = (msg = 'Sem dados.') => <Empty loading={d.isPending}>{msg}</Empty>

  return (
    <>
      {d.erro && <Alert tone="danger">{d.erro}</Alert>}

      <p className="max-w-4xl text-xs text-fg-muted">
        Pontos do cliente no mês = lotes girados × multiplicador do produto. O incentivo é pago por cliente
        conforme a maior faixa de pontos atingida no mês. Esta aba usa o histórico completo (não segue os filtros de período e corretora) e considera só os lotes da GENIAL, que é a corretora do programa.
        As contas do FABRICIO DA SILVA GONCALVES são somadas e pontuam como um cliente único.
      </p>

      {/* KPIs */}
      <KpiRow>
        <KpiCard icon={Gift} tone="success" label={ultimoMes ? `Incentivo ${labelMesAno(ultimoMes)}` : 'Incentivo do mês'}
          value={ultimoMes ? fmtBRL(totalMes.get(ultimoMes) ?? 0) : '—'} sub="mês em andamento (parcial)" />
        <KpiCard icon={TrendingUp} tone="accent" label={mesAnterior ? `Incentivo ${labelMesAno(mesAnterior)}` : 'Mês anterior'}
          value={mesAnterior ? fmtBRL(totalMes.get(mesAnterior) ?? 0) : '—'} sub="mês fechado" />
        <KpiCard icon={Target} tone="violet" label={`Acumulado ${anoAtual ?? 'ano'}`}
          value={anoAtual ? fmtBRL(acumuladoAno) : '—'} sub={`histórico completo: ${fmtBRL(acumuladoTotal)}`} />
        <KpiCard icon={Users} tone="info" label="Clientes pontuando"
          value={ultimoMes
            ? fmtNum((totalClientesMes.get(ultimoMes) ?? 0) - (piv.clientes.get(0)?.get(ultimoMes) ?? 0))
            : '—'}
          sub={ultimoMes ? `de ${fmtNum(totalClientesMes.get(ultimoMes) ?? 0)} ativos no mês` : undefined} />
      </KpiRow>

      {/* Gráfico do incentivo mês a mês */}
      <Panel title="Incentivo direto por mês" subtitle="Soma do incentivo de todas as faixas. * = mês em andamento.">
        {chartData.length === 0
          ? vazio()
          : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={cores.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: cores.axis }} axisLine={{ stroke: cores.grid }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: cores.axis }} tickFormatter={(v: number) => fmtNum(v)} axisLine={false} tickLine={false} width={56} />
                <Tooltip content={<ChartTooltip formatter={(v) => fmtBRL(v)} />} cursor={{ fill: cores.grid }} />
                <Bar dataKey="Incentivo" fill={cores.incentivo} radius={[3, 3, 0, 0]} animationDuration={400} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
      </Panel>

      {/* Matriz: incentivo R$ por faixa × mês */}
      <Panel flush title="Incentivo por faixa de pontos (R$)"
        subtitle="Valor da faixa × nº de clientes que atingiram a faixa no mês. Última coluna = mês em andamento.">
        {meses.length === 0 ? <div className="p-5">{vazio()}</div> : <MatrizIncentivo piv={piv} modo="valor" />}
      </Panel>

      {/* Matriz: clientes por faixa × mês */}
      <Panel flush title="Clientes por faixa de pontuação"
        subtitle="Cada cliente conta na maior faixa que atingiu no mês. “Resto” = ativos com até 1.000 pontos.">
        {meses.length === 0 ? <div className="p-5">{vazio()}</div> : <MatrizIncentivo piv={piv} modo="clientes" />}
      </Panel>

      {/* Clientes do mês em andamento */}
      <Panel flush title={ultimoMes ? `Pontuação dos clientes — ${labelMesAno(ultimoMes)}` : 'Pontuação dos clientes'}
        subtitle="Quem está pontuando agora e quanto falta pra próxima faixa — bom pra saber quem vale a pena estimular a girar mais.">
        {d.incentivoCli.length === 0
          ? <div className="p-5">{vazio()}</div>
          : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Conta</th>
                    <th>Cliente</th>
                    <th className="num">Lotes</th>
                    <th className="num">Pontos</th>
                    <th className="num">Faixa atual</th>
                    <th className="num">Incentivo</th>
                    <th className="num">Próxima faixa</th>
                  </tr>
                </thead>
                <tbody>
                  {d.incentivoCli.slice(0, 50).map((c, i) => (
                    <tr key={c.conta}>
                      <td className="subtle font-semibold tabular-nums">{i + 1}</td>
                      <td className="muted tabular-nums">{c.conta}</td>
                      <td className="font-medium">{c.cliente_nome}</td>
                      <td className="num muted">{fmtNum(c.lotes_operados)}</td>
                      <td className="num font-semibold">{fmtNum(c.pontos)}</td>
                      <td className="num muted">{c.faixa_min > 0 ? `> ${fmtNum(c.faixa_min)}` : 'Resto'}</td>
                      <td className="num font-semibold text-success">{c.valor_incentivo > 0 ? fmtBRL(c.valor_incentivo) : '—'}</td>
                      <td className="num muted">
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
      </Panel>

      {/* Tabela de pontuação por produto */}
      <Panel title="Tabela de pontuação" subtitle="Multiplicador aplicado a cada lote girado do produto.">
        <div className="flex flex-wrap gap-2">
          {PONTUACAO.map(p => (
            <span key={p.produto} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold tabular-nums text-fg">
              {p.produto} <span className="text-fg-subtle">·</span> {p.mult}×
            </span>
          ))}
        </div>
      </Panel>
    </>
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
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th className="sticky-col">Faixa</th>
            {modo === 'valor' && <th className="num">Valor (R$)</th>}
            {meses.map(m => <th key={m} className="num">{labelMesAno(m)}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map(f => (
            <tr key={f.min}>
              <td className="sticky-col whitespace-nowrap font-medium">{f.label}</td>
              {modo === 'valor' && <td className="num muted">{fmtBRL(f.valor)}</td>}
              {meses.map(m => {
                const v = fonte.get(f.min)?.get(m) ?? 0
                return (
                  <td key={m} className={cn('num', v > 0 ? 'font-medium' : 'subtle')}>{fmt(v)}</td>
                )
              })}
            </tr>
          ))}
          <tr className="total">
            <td className="sticky-col">{modo === 'valor' ? 'Incentivo direto' : 'Total de clientes'}</td>
            {modo === 'valor' && <td />}
            {meses.map(m => (
              <td key={m} className={cn('num', modo === 'valor' && 'text-success')}>
                {modo === 'valor' ? fmtBRL(totalMes.get(m) ?? 0) : fmtNum(totalClientesMes.get(m) ?? 0)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
