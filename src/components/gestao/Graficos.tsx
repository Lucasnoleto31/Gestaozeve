'use client'

// Gráficos (recharts) com a paleta do tema. Dados já vêm prontos das páginas.
import {
  Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useChartColors } from '@/lib/theme'
import { fmtBRL, fmtNum, fmtPct } from '@/lib/format'

export type Formato = 'num' | 'brl' | 'pct'
const FMT: Record<Formato, (v: number) => string> = { num: fmtNum, brl: fmtBRL, pct: v => fmtPct(v, 1) }
const compacto = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`
  : Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k` : fmtNum(v))

export type Serie = { key: string; nome: string; cor?: string; tipo?: 'bar' | 'line'; eixo?: 'esq' | 'dir'; empilhar?: string; formato?: Formato }

// Cores nomeadas (as páginas são Server Components e não enxergam a paleta do tema)
function corDe(cor: string | undefined, c: ReturnType<typeof useChartColors>, i: number): string {
  if (!cor) return c.palette[i % c.palette.length]
  if (cor === 'success') return c.incentivo
  if (cor === 'danger') return c.zerados
  if (cor === 'accent') return c.operados
  if (cor === 'violet') return c.clientes
  return cor
}

function useTooltipStyle() {
  const c = useChartColors()
  return {
    contentStyle: { background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: c.text },
    labelStyle: { color: c.text, fontWeight: 600 },
    itemStyle: { color: c.text },
  }
}

// Barras/linhas por categoria (meses, semanas, dias)
export function GraficoSeries({ dados, series, altura = 260, formato = 'num', formatoDir, legenda = true, margemEsq }: {
  dados: Record<string, string | number>[]
  series: Serie[]
  altura?: number
  formato?: Formato
  formatoDir?: Formato
  legenda?: boolean
  margemEsq?: number
}) {
  const c = useChartColors()
  const tt = useTooltipStyle()
  const temDir = series.some(s => s.eixo === 'dir')
  const fmtEsq = formato === 'brl' ? (v: number) => `R$ ${compacto(v)}` : formato === 'pct' ? (v: number) => `${v}%` : compacto
  const fmtDirAxis = formatoDir === 'brl' ? (v: number) => `R$ ${compacto(v)}` : formatoDir === 'pct' ? (v: number) => `${v}%` : compacto
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <ComposedChart data={dados} margin={{ top: 8, right: temDir ? 8 : 12, left: margemEsq ?? 0, bottom: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: c.axis, fontSize: 11 }} axisLine={{ stroke: c.grid }} tickLine={false} interval="preserveStartEnd" />
        <YAxis yAxisId="esq" tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtEsq} width={54} />
        {temDir && <YAxis yAxisId="dir" orientation="right" tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtDirAxis} width={54} />}
        <Tooltip
          {...tt}
          cursor={{ fill: c.grid }}
          formatter={(v, nome, item) => {
            const s = series.find(x => x.nome === nome || x.key === (item as { dataKey?: string }).dataKey)
            const f = FMT[s?.formato ?? (s?.eixo === 'dir' ? (formatoDir ?? formato) : formato)]
            return [f(Number(v)), String(nome)]
          }}
        />
        {legenda && <Legend wrapperStyle={{ fontSize: 11, color: c.text }} iconSize={10} />}
        {series.map((s, i) => {
          const cor = corDe(s.cor, c, i)
          return s.tipo === 'line'
            ? <Line key={s.key} yAxisId={s.eixo === 'dir' ? 'dir' : 'esq'} type="monotone" dataKey={s.key} name={s.nome} stroke={cor} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
            : <Bar key={s.key} yAxisId={s.eixo === 'dir' ? 'dir' : 'esq'} dataKey={s.key} name={s.nome} fill={cor} stackId={s.empilhar} radius={s.empilhar ? 0 : [3, 3, 0, 0]} maxBarSize={38} />
        })}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// Rosca (mix de plataforma, funil da base)
export function GraficoRosca({ dados, altura = 240, formato = 'num', cores }: {
  dados: { nome: string; valor: number }[]
  altura?: number
  formato?: Formato
  cores?: string[]
}) {
  const c = useChartColors()
  const tt = useTooltipStyle()
  const total = dados.reduce((s, d) => s + d.valor, 0)
  const paleta = cores ?? c.palette
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <PieChart>
        <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius="55%" outerRadius="85%" paddingAngle={1} stroke="none">
          {dados.map((_, i) => <Cell key={i} fill={paleta[i % paleta.length]} />)}
        </Pie>
        <Tooltip {...tt} formatter={(v, nome) => [`${FMT[formato](Number(v))} (${total ? fmtPct((Number(v) / total) * 100, 1) : '0%'})`, String(nome)]} />
        <Legend wrapperStyle={{ fontSize: 11, color: c.text }} iconSize={10} layout="vertical" align="right" verticalAlign="middle" />
      </PieChart>
    </ResponsiveContainer>
  )
}

// Barras horizontais (top clientes, leads por corretora)
export function GraficoBarrasH({ dados, altura, formato = 'num', cor, larguraRotulo = 150 }: {
  dados: { nome: string; valor: number }[]
  altura?: number
  formato?: Formato
  cor?: string
  larguraRotulo?: number
}) {
  const c = useChartColors()
  const tt = useTooltipStyle()
  const h = altura ?? Math.max(120, dados.length * 26 + 24)
  return (
    <ResponsiveContainer width="100%" height={h}>
      <ComposedChart data={dados} layout="vertical" margin={{ top: 4, right: 48, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={c.grid} horizontal={false} />
        <XAxis type="number" tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={compacto} />
        <YAxis type="category" dataKey="nome" width={larguraRotulo} tick={{ fill: c.text, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip {...tt} cursor={{ fill: c.grid }} formatter={v => [FMT[formato](Number(v)), '']} />
        <Bar dataKey="valor" fill={corDe(cor, c, 0)} radius={[0, 3, 3, 0]} maxBarSize={18} label={{ position: 'right', fill: c.text, fontSize: 11, formatter: (v: unknown) => FMT[formato](Number(v)) }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
