// Normalização de textos vindos das planilhas das corretoras.
// Vale tanto no servidor (importação) quanto no cliente (preview).

// Bytes 0x80–0xBF do Mac Roman: quando um arquivo UTF-8 é lido como Mac Roman,
// 'Ã' (C3 83) vira '√É'. Esta tabela desfaz isso.
const MACROMAN_HI = 'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø'

// Desfaz os dois mojibakes que já apareceram nas importações:
//   'MARANHÃƒO'  (UTF-8 lido como Latin-1, às vezes duas vezes)
//   'MARANH√ÉO'  (UTF-8 lido como Mac Roman)
export function corrigirMojibake(s: string): string {
  let out = s
  // Mac Roman: '√' + char → byte C3 + byte da tabela
  out = out.replace(/√(.)/g, (m, ch: string) => {
    const i = MACROMAN_HI.indexOf(ch)
    if (i < 0) return m
    try { return decodeURIComponent(`%C3%${(0x80 + i).toString(16).toUpperCase()}`) } catch { return m }
  })
  // Latin-1: pares 'Ã'/'Â' + byte de continuação (até 2 rodadas, caso tenha sido codificado duas vezes)
  for (let rodada = 0; rodada < 2; rodada++) {
    if (!/[ÂÃ][-¿]/.test(out)) break
    try {
      const bytes = Array.from(out).map(ch => ch.charCodeAt(0))
      if (bytes.some(b => b > 0xff)) break
      const pct = bytes.map(b => `%${b.toString(16).padStart(2, '0').toUpperCase()}`).join('')
      const decodificado = decodeURIComponent(pct)
      if (decodificado.includes('�')) break
      out = decodificado
    } catch { break }
  }
  return out
}

export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Nome de barra como o banco compara (norm_barra): maiúsculo, sem acento,
// sem sujeira de codificação, espaços colapsados.
export function normalizarBarra(s: string | null | undefined): string {
  if (!s) return ''
  return semAcento(corrigirMojibake(String(s)))
    .toUpperCase()
    .replace(/[^A-Z0-9 .&/()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Nome de cliente: só conserta codificação e espaços (mantém maiúsculas/minúsculas)
export function normalizarNome(s: string | null | undefined): string {
  if (!s) return ''
  return corrigirMojibake(String(s)).replace(/\s+/g, ' ').trim()
}

// Nomes de plataforma que já apareceram na coluna de assessor por engano
export const PLATAFORMAS_CONHECIDAS = [
  'NELOGICA', 'NELOGICA_DT', 'NELOGICA_HB', 'METATRADER', 'TRYD', 'TRYD_DT',
  'SMARTTBOT', 'FLEXSCAN', 'TRADING_VIEW', 'PROTRADER', 'PROFIT', 'PROFIT PRO',
]

export function pareceNomeDePlataforma(barra: string): boolean {
  const n = normalizarBarra(barra).replace(/ /g, '_')
  return PLATAFORMAS_CONHECIDAS.some(p => p.replace(/ /g, '_') === n)
}
