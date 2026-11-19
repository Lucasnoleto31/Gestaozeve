'use client'

// Gráficos (recharts) com a paleta do tema. Dados já vêm prontos das páginas.
import {
  Bar, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
  type LabelProps,
} from 'recharts'
import { useEffect, useId, useRef, useState } from 'react'
import { useChartColors } from '@/lib/theme'
import { fmtBRL, fmtNum, fmtPct } from '@/lib/format'

// 'dec' = número com duas casas (R$ por lote), que em 'num' e 'brl' arredondaria para zero
export type Formato = 'num' | 'brl' | 'pct' | 'dec'
const dec2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const FMT: Record<Formato, (v: number) => string> = { num: fmtNum, brl: fmtBRL, pct: v => fmtPct(v, 1), dec: dec2 }
const compacto = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`
  : Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k` : fmtNum(v))

export type Serie = { key: string; nome: string; cor?: string; tipo?: 'bar' | 'line'; eixo?: 'esq' | 'dir'; empilhar?: string; formato?: Formato; tracejada?: boolean }
// Linha de referência horizontal (uma meta, um teto) no eixo da esquerda. `ate` = rótulo da categoria onde a
// linha termina (o prazo da meta); sem ele, atravessa o gráfico inteiro.
export type LinhaDeReferencia = { valor: number; rotulo: string; ate?: string }

// Cores nomeadas (as páginas são Server Components e não enxergam a paleta do tema).
// Padrão: série por valor (tinta → apagado). colorido: paleta de matizes (página Gráficos).
// 'gain' e 'loss' (os nomes do Kpi e do resto do sistema) pedem o verde e o vermelho nas duas paletas: sem
// eles a palavra ia como cor e a barra saía preta, invisível no tema escuro (Funil › Mês e › Histórico).
function corDe(cor: string | undefined, c: ReturnType<typeof useChartColors>, i: number, colorido = false): string {
  if (cor === 'gain') return c.coresNomeadas.bom
  if (cor === 'loss') return c.coresNomeadas.ruim
  if (colorido) {
    if (!cor) return c.cores[i % c.cores.length]
    if (cor === 'success') return c.coresNomeadas.bom
    if (cor === 'danger') return c.coresNomeadas.ruim
    if (cor === 'accent') return c.coresNomeadas.acento
    if (cor === 'violet') return c.coresNomeadas.violeta
    if (cor === 'neutral') return c.text
    return cor
  }
  if (!cor) return c.palette[i % c.palette.length]
  if (cor === 'success') return c.incentivo
  if (cor === 'danger') return c.zerados
  if (cor === 'accent') return c.operados
  if (cor === 'violet') return c.clientes
  if (cor === 'neutral') return c.text
  return cor
}

// Celular (DESIGN.md §8): o gráfico mede o espaço que recebe e, abaixo de 500 px numa janela de celular,
// fica mais baixo, com letra de 12 px, poucas marcas no eixo e o número da última barra escrito. As duas
// condições juntas garantem que o computador não muda, mesmo num painel estreito.
const LIMITE_CELULAR = 500
function useLarguraNoCelular() {
  const ref = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(0)   // 0 = computador (ou ainda não medido)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const janela = window.matchMedia('(max-width: 767.98px)')
    const medir = () => { const w = el.clientWidth; setLargura(janela.matches && w > 0 && w < LIMITE_CELULAR ? w : 0) }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    janela.addEventListener('change', medir)
    return () => { ro.disconnect(); janela.removeEventListener('change', medir) }
  }, [])
  return [ref, largura] as const
}
const LETRA_CELULAR = 12
const ALTURA_MAX_CELULAR = 220

// No celular, marcas do eixo em passo fixo contadas a partir da última categoria (a mais nova fica sempre
// escrita): com "preserveStartEnd" o recharts pulava dias sem regra. Até 6 categorias, todas.
function marcasDoEixo(rotulos: (string | number)[], max = 5): (string | number)[] | undefined {
  const n = rotulos.length
  if (n <= 6) return undefined
  const passo = Math.ceil(n / max)
  const marcas: (string | number)[] = []
  for (let i = n - 1; i >= 0; i -= passo) marcas.unshift(rotulos[i])
  return marcas
}

function useTooltipStyle() {
  const c = useChartColors()
  return {
    contentStyle: { background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8, fontSize: 13, color: c.text, boxShadow: 'none' },
    labelStyle: { color: c.text, fontWeight: 600 },
    itemStyle: { color: c.text },
  }
}

// Barras/linhas por categoria (meses, semanas, dias)
export function GraficoSeries({ dados, series, altura = 260, formato = 'num', formatoDir, legenda = true, margemEsq, colorido = false, aoClicar, linhas }: {
  dados: Record<string, string | number>[]
  series: Serie[]
  altura?: number
  formato?: Formato
  formatoDir?: Formato
  legenda?: boolean
  margemEsq?: number
  colorido?: boolean   // paleta de matizes em vez de série por valor
  aoClicar?: (indice: number) => void   // clique numa categoria (a coluna inteira, não só a barra): índice em `dados`
  linhas?: LinhaDeReferencia[]          // metas: linhas horizontais com rótulo, no eixo da esquerda
}) {
  const c = useChartColors()
  const tt = useTooltipStyle()
  // Gradiente por série (tinta .95 → .32, de cima para baixo), com id único por gráfico
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const gradId = (key: string) => `g${uid}-${key.replace(/[^a-zA-Z0-9]/g, '')}`
  const temDir = series.some(s => s.eixo === 'dir')
  const fmtEsq = formato === 'brl' ? (v: number) => `R$ ${compacto(v)}` : formato === 'pct' ? (v: number) => `${v}%` : formato === 'dec' ? dec2 : compacto
  const fmtDirAxis = formatoDir === 'brl' ? (v: number) => `R$ ${compacto(v)}` : formatoDir === 'pct' ? (v: number) => `${v}%` : compacto
  const [medidor, larguraCel] = useLarguraNoCelular()
  const cel = larguraCel > 0
  const letra = cel ? LETRA_CELULAR : 11
  const barras = series.filter(s => s.tipo !== 'line')
  // trilho atrás da barra: com duas ou mais séries lado a lado, no celular, virava código de barras
  const comTrilho = !cel || (barras.length === 1 && !barras[0].empilhar)
  // barras lado a lado por categoria (cada pilha conta uma): com muitas na largura do celular, o vão encolhe
  const gruposDeBarra = barras.filter(s => !s.empilhar).length + new Set(barras.filter(s => s.empilhar).map(s => s.empilhar)).size
  // série única: o número da última categoria escrito em cima dela (no toque o balão é difícil de abrir)
  const unica = cel && series.length === 1 && !series[0].empilhar ? series[0] : null
  const fmtUnica = unica ? FMT[unica.formato ?? (unica.eixo === 'dir' ? (formatoDir ?? formato) : formato)] : null
  const rotuloDoUltimo = (p: LabelProps) => {
    const v = Number(p.value)
    if (p.index !== dados.length - 1 || !fmtUnica || !Number.isFinite(v) || v === 0) return null
    // na faixa de cima, acima da última coluna e alinhado pela direita dela, com o rótulo da categoria: em
    // cima da barra o texto invadia as barras vizinhas, mais altas (a última costuma ser a parcial)
    const x = Number(p.x ?? 0) + Number(p.width ?? 0)
    return <text x={x} y={14} textAnchor="end" fill={c.text} fontSize={LETRA_CELULAR} fontWeight={600}>{`${dados[dados.length - 1].label}: ${fmtUnica(v)}`}</text>
  }
  const marcas = cel ? marcasDoEixo(dados.map(d => d.label)) : undefined
  // celular com linha: os pontos da primeira e da última categoria ficam colados nas bordas e o rótulo do
  // eixo era cortado ("nov/2"); um respiro nas pontas traz os dois para dentro (barras já têm o vão delas)
  const folgaDaLinha = cel && series.some(s => s.tipo === 'line') ? { padding: { left: 14, right: 18 } } : {}
  return (
    <div ref={medidor} className="w-full min-w-0">
    <ResponsiveContainer width="100%" height={cel ? Math.min(altura, ALTURA_MAX_CELULAR) : altura}>
      <ComposedChart data={dados} margin={{ top: unica ? 22 : 8, right: temDir ? 8 : 12, left: margemEsq ?? 0, bottom: 0 }}
        // no celular, com muitas categorias, a barra fica mais larga (o vão padrão de 10 % a deixava em 4 px)
        {...(cel && dados.length * gruposDeBarra > 24 ? { barCategoryGap: '8%', barGap: 1 } : {})}
        onClick={aoClicar ? st => { const i = Number(st?.activeTooltipIndex); if (Number.isInteger(i) && i >= 0 && i < dados.length) aoClicar(i) } : undefined}>
        <defs>
          {series.filter(s => s.tipo !== 'line').map((s, i) => {
            const cor = corDe(s.cor, c, series.indexOf(s), colorido)
            return (
              <linearGradient key={s.key + i} id={gradId(s.key)} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cor} stopOpacity={0.95} />
                <stop offset="100%" stopColor={cor} stopOpacity={0.32} />
              </linearGradient>
            )
          })}
        </defs>
        <CartesianGrid stroke={c.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: c.axis, fontSize: letra }} axisLine={{ stroke: c.grid }} tickLine={false}
          {...(marcas ? { ticks: marcas, interval: 0 } : { interval: cel ? 0 : 'preserveStartEnd' as const })} {...folgaDaLinha} />
        {/* em reais o rótulo é mais largo ("R$ 500k"): com 54 px ele quebrava em duas linhas */}
        <YAxis yAxisId="esq" tick={{ fill: c.axis, fontSize: letra }} axisLine={false} tickLine={false} tickFormatter={fmtEsq} width={formato === 'brl' ? 62 : 54} />
        {temDir && <YAxis yAxisId="dir" orientation="right" tick={{ fill: c.axis, fontSize: letra }} axisLine={false} tickLine={false} tickFormatter={fmtDirAxis} width={54} />}
        <Tooltip
          {...tt}
          cursor={{ fill: c.grid }}
          formatter={(v, nome, item) => {
            const s = series.find(x => x.nome === nome || x.key === (item as { dataKey?: string }).dataKey)
            const f = FMT[s?.formato ?? (s?.eixo === 'dir' ? (formatoDir ?? formato) : formato)]
            return [f(Number(v)), String(nome)]
          }}
        />
        {legenda && <Legend wrapperStyle={{ fontSize: letra, color: c.text }} iconSize={10} itemSorter={null} />}
        {series.map((s, i) => {
          const cor = corDe(s.cor, c, i, colorido)
          const rotulo = unica === s ? <LabelList dataKey={s.key} content={rotuloDoUltimo} /> : null
          return s.tipo === 'line'
            ? <Line key={s.key} yAxisId={s.eixo === 'dir' ? 'dir' : 'esq'} type="monotone" dataKey={s.key} name={s.nome} stroke={cor} strokeWidth={2} strokeDasharray={s.tracejada ? '5 5' : undefined} dot={false} activeDot={{ r: 3 }} isAnimationActive={false}>{rotulo}</Line>
            : <Bar key={s.key} yAxisId={s.eixo === 'dir' ? 'dir' : 'esq'} dataKey={s.key} name={s.nome} fill={`url(#${gradId(s.key)})`} stroke="none" background={s.empilhar || !comTrilho ? undefined : { fill: c.track }} stackId={s.empilhar} radius={s.empilhar ? 0 : [4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>{rotulo}</Bar>
        })}
        {linhas?.map(l => {
          const fim = l.ate && dados.some(d => d.label === l.ate) ? l.ate : null
          return (
            <ReferenceLine key={l.rotulo} yAxisId="esq" ifOverflow="extendDomain" stroke={c.axis} strokeDasharray="3 4" strokeWidth={1}
              {...(fim ? { segment: [{ x: String(dados[0].label), y: l.valor }, { x: fim, y: l.valor }] as const } : { y: l.valor })}
              label={{ value: l.rotulo, position: 'insideBottomLeft', fill: c.axis, fontSize: letra }} />
          )
        })}
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  )
}

// Rosca (mix de plataforma, funil da base)
export function GraficoRosca({ dados, altura = 240, formato = 'num', cores, colorido = false }: {
  dados: { nome: string; valor: number }[]
  altura?: number
  formato?: Formato
  cores?: string[]
  colorido?: boolean
}) {
  const c = useChartColors()
  const tt = useTooltipStyle()
  const total = dados.reduce((s, d) => s + d.valor, 0)
  const paleta = cores ?? (colorido ? c.cores : c.palette)
  const pctDe = (v: number) => (total ? fmtPct((v / total) * 100, 1) : '0%')
  const [medidor, larguraCel] = useLarguraNoCelular()
  const cel = larguraCel > 0
  // celular: as fatias que nem aparecem (menos de 0,5 %) saíam na legenda como "0,0%", uma por linha;
  // ficam juntas numa linha só, com os nomes, para nenhuma sumir. O texto vai na cor do texto (na cor da
  // fatia o amarelo e o azul-claro somem no tema claro); a cor fica no quadradinho.
  const visiveis = dados.map((d, i) => ({ ...d, cor: paleta[i % paleta.length] })).filter(d => total > 0 && d.valor / total >= 0.005)
  const miudas = dados.filter(d => !(total > 0 && d.valor / total >= 0.005))
  const legendaCelular = () => (
    <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-2" style={{ fontSize: LETRA_CELULAR, color: c.text }}>
      {visiveis.map(d => (
        <li key={d.nome} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 shrink-0" style={{ background: d.cor }} aria-hidden />
          {d.nome} {pctDe(d.valor)}
        </li>
      ))}
      {miudas.length > 0 && <li className="basis-full text-center" style={{ color: c.axis }}>Menos de 0,5%: {miudas.map(d => d.nome).join(', ')}</li>}
    </ul>
  )
  return (
    <div ref={medidor} className="w-full min-w-0">
    <ResponsiveContainer width="100%" height={altura}>
      <PieChart>
        <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius="55%" outerRadius="85%" paddingAngle={1} stroke="none" isAnimationActive={false}>
          {dados.map((_, i) => <Cell key={i} fill={paleta[i % paleta.length]} />)}
        </Pie>
        <Tooltip {...tt} formatter={(v, nome) => [`${FMT[formato](Number(v))} (${pctDe(Number(v))})`, String(nome)]} />
        {cel
          // celular: legenda embaixo, na ordem das fatias (da maior para a menor) e com a parte de cada uma,
          // que no computador só aparece no balão (no toque ele quase não abre)
          ? <Legend layout="horizontal" align="center" verticalAlign="bottom" content={legendaCelular} />
          : <Legend wrapperStyle={{ fontSize: 11, color: c.text }} iconSize={10} layout="vertical" align="right" verticalAlign="middle" />}
      </PieChart>
    </ResponsiveContainer>
    </div>
  )
}

// Barras horizontais (top clientes, leads por corretora)
export function GraficoBarrasH({ dados, altura, formato = 'num', cor, larguraRotulo = 150, colorido = false }: {
  dados: { nome: string; valor: number }[]
  altura?: number
  formato?: Formato
  cor?: string
  larguraRotulo?: number
  colorido?: boolean
}) {
  const c = useChartColors()
  const tt = useTooltipStyle()
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const corBarra = corDe(cor, c, 0, colorido)
  const [medidor, larguraCel] = useLarguraNoCelular()
  const cel = larguraCel > 0
  const letra = cel ? LETRA_CELULAR : 11
  // celular: o rótulo fica com no máximo 40 % da largura (com 170 px sobrava pouco para a barra) e cada
  // linha ganha altura para o nome que quebra em duas linhas não encostar no vizinho
  const rotuloW = cel ? Math.min(larguraRotulo, Math.round(larguraCel * 0.4)) : larguraRotulo
  const h = altura ?? Math.max(120, dados.length * (cel ? 34 : 26) + 24)
  return (
    <div ref={medidor} className="w-full min-w-0">
    <ResponsiveContainer width="100%" height={h}>
      <ComposedChart data={dados} layout="vertical" margin={{ top: 4, right: 48, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id={`gh${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={corBarra} stopOpacity={0.95} />
            <stop offset="100%" stopColor={corBarra} stopOpacity={0.45} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={c.grid} strokeDasharray="2 4" horizontal={false} />
        <XAxis type="number" tick={{ fill: c.axis, fontSize: letra }} axisLine={false} tickLine={false} tickFormatter={compacto} />
        <YAxis type="category" dataKey="nome" width={rotuloW} tick={{ fill: c.text, fontSize: letra }} axisLine={false} tickLine={false} />
        <Tooltip {...tt} cursor={{ fill: c.grid }} formatter={v => [FMT[formato](Number(v)), '']} />
        <Bar dataKey="valor" fill={`url(#gh${uid})`} background={{ fill: c.track }} radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false} label={{ position: 'right', fill: c.text, fontSize: letra, formatter: (v: unknown) => FMT[formato](Number(v)) }} />
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  )
}
