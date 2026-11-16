import { cn } from '@/lib/utils'

// Linha de tendência (sparkline): só a forma da série, sem eixos nem números. A cor vem do texto em volta.
// Com `parcial`, o último ponto é o mês em andamento: o trecho final fica tracejado e o ponto vazado, para a
// queda de um mês pela metade não ser lida como tendência. `titulo` vira a dica nativa (os valores por mês).
export function Tendencia({ valores, parcial = false, largura = 96, altura = 28, titulo, className }: {
  valores: number[]
  parcial?: boolean
  largura?: number
  altura?: number
  titulo?: string
  className?: string
}) {
  const max = Math.max(0, ...valores)
  if (valores.length < 2 || max <= 0) return <span className="text-fg-subtle">–</span>
  const px = 3, py = 4
  const x = (i: number) => px + (i * (largura - 2 * px)) / (valores.length - 1)
  const y = (v: number) => altura - py - (Math.max(0, v) / max) * (altura - 2 * py)
  const ponto = (i: number) => `${x(i).toFixed(1)},${y(valores[i]).toFixed(1)}`
  const fim = valores.length - 1
  const firmes = valores.map((_, i) => i).slice(0, parcial ? fim : fim + 1)
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} className={cn('inline-block shrink-0 overflow-visible text-fg-muted', className)} role="img" aria-label={titulo ?? 'Tendência da receita mês a mês'}>
      {titulo && <title>{titulo}</title>}
      {firmes.length > 1 && <polyline points={firmes.map(ponto).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />}
      {parcial && <line x1={x(fim - 1)} y1={y(valores[fim - 1])} x2={x(fim)} y2={y(valores[fim])} stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 3" strokeLinecap="round" />}
      <circle cx={x(fim)} cy={y(valores[fim])} r="2.2" fill={parcial ? 'var(--bg)' : 'currentColor'} stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
