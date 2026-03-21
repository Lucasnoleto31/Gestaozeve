'use client'

import { getClassificacaoConfig } from '@/lib/chs/calculator'
import { Classificacao, Tendencia } from '@/types/cliente'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface ScoreGaugeProps {
  score: number
  classificacao: Classificacao
  tendencia: Tendencia
  size?: 'sm' | 'md' | 'lg'
}

export function ScoreGauge({ score, classificacao, tendencia, size = 'md' }: ScoreGaugeProps) {
  const config = getClassificacaoConfig(classificacao)
  const radius = size === 'lg' ? 54 : size === 'md' ? 40 : 28
  const stroke = size === 'lg' ? 8 : size === 'md' ? 6 : 5
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const svgSize = (radius + stroke) * 2 + 4

  const TendenciaIcon = tendencia === 'subindo' ? TrendingUp : tendencia === 'caindo' ? TrendingDown : Minus
  const tendenciaColor = tendencia === 'subindo' ? 'text-emerald-400' : tendencia === 'caindo' ? 'text-red-400' : 'text-gray-500'

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: svgSize, height: svgSize }}>
        <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={radius}
            fill="none"
            stroke="#1f2937"
            strokeWidth={stroke}
          />
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={radius}
            fill="none"
            stroke={config.color}
            strokeWidth={stroke}
            strokeDasharray={`${progress} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${svgSize / 2} ${svgSize / 2})`}
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-bold leading-none ${size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-lg' : 'text-sm'}`}
            style={{ color: config.color }}
          >
            {Math.round(score)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <span className={`text-xs font-medium ${config.text}`}>{config.label}</span>
        <TendenciaIcon className={`w-3 h-3 ${tendenciaColor}`} />
      </div>
    </div>
  )
}

export function ScoreBadge({ score, classificacao }: { score: number; classificacao: Classificacao }) {
  const config = getClassificacaoConfig(classificacao)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border ${config.bg} ${config.border} ${config.text}`}>
      <span className="font-bold">{Math.round(score)}</span>
      <span>{config.label}</span>
    </span>
  )
}
