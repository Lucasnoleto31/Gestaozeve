// Holt-Winters aditivo para forecast de séries com sazonalidade.
// Implementação enxuta (sem dependências); roda no client.
//
// Notação:
//   l_t = α(y_t - s_{t-L}) + (1-α)(l_{t-1} + b_{t-1})
//   b_t = β(l_t - l_{t-1}) + (1-β) b_{t-1}
//   s_t = γ(y_t - l_t) + (1-γ) s_{t-L}
//   ŷ_{t+h} = l_t + h·b_t + s_{t-L+((h-1) mod L)+1}
//
// Para séries curtas (n < 2·L), faz fallback pra Holt linear (sem sazonalidade).

export type HWResult = {
  fitted: number[]
  forecast: number[]
  level: number
  trend: number
  seasonal: number[]
}

export function holtWintersAdd(
  values: number[],
  opts: { seasonLen?: number; horizon?: number; alpha?: number; beta?: number; gamma?: number } = {},
): HWResult {
  const seasonLen = opts.seasonLen ?? 4
  const horizon = opts.horizon ?? Math.max(seasonLen, 4)
  const alpha = opts.alpha ?? 0.5
  const beta  = opts.beta  ?? 0.3
  const gamma = opts.gamma ?? 0.4

  const n = values.length
  if (n === 0) return { fitted: [], forecast: [], level: 0, trend: 0, seasonal: [] }

  // Fallback: Holt linear (sem sazonal) quando dados insuficientes
  if (n < 2 * seasonLen) {
    const slope = n >= 2 ? (values[n - 1] - values[0]) / (n - 1) : 0
    const last = values[n - 1]
    const fc = Array.from({ length: horizon }, (_, i) => Math.max(0, last + slope * (i + 1)))
    return { fitted: values.slice(), forecast: fc, level: last, trend: slope, seasonal: [] }
  }

  // Inicialização
  const seasons = Math.floor(n / seasonLen)
  const avg: number[] = []
  for (let s = 0; s < seasons; s++) {
    let sum = 0
    for (let i = 0; i < seasonLen; i++) sum += values[s * seasonLen + i]
    avg.push(sum / seasonLen)
  }
  const seasonal: number[] = new Array(n).fill(0)
  for (let i = 0; i < seasonLen; i++) {
    let sum = 0
    for (let s = 0; s < seasons; s++) sum += values[s * seasonLen + i] - avg[s]
    seasonal[i] = sum / seasons
  }

  let level = avg[0] - seasonal[0]
  let trend = seasons >= 2 ? (avg[seasons - 1] - avg[0]) / ((seasons - 1) * seasonLen) : 0

  const fitted: number[] = new Array(n).fill(0)
  for (let t = 0; t < n; t++) {
    const sPrev = t < seasonLen ? seasonal[t] : seasonal[t - seasonLen]
    if (t === 0) {
      fitted[t] = level + sPrev
    } else {
      fitted[t] = level + trend + sPrev
    }
    const newLevel = alpha * (values[t] - sPrev) + (1 - alpha) * (level + trend)
    const newTrend = beta * (newLevel - level) + (1 - beta) * trend
    seasonal[t] = gamma * (values[t] - newLevel) + (1 - gamma) * sPrev
    level = newLevel
    trend = newTrend
  }

  const fc: number[] = []
  for (let h = 1; h <= horizon; h++) {
    const sIdx = n - seasonLen + ((h - 1) % seasonLen)
    const s = seasonal[sIdx]
    fc.push(Math.max(0, level + h * trend + s))
  }

  return { fitted, forecast: fc, level, trend, seasonal }
}
