// Leitura das planilhas de lotes das corretoras (puro: roda no navegador e nos testes).

import type { Corretora } from '@/lib/corretoras'

export interface ContratoRow {
  data: string
  numero_conta: string
  cpf: string
  cnpj: string
  cliente_nome: string
  assessor_nome: string
  ativo: string
  plataforma: string
  lotes_operados: number
  lotes_zerados: number
}

export function parseBrazilianNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return value
  let str = String(value).trim().replace(/\s/g, '').replace(/^R\$/i, '')
  if (str === '') return 0
  const hasComma = str.includes(',')
  const hasDot = str.includes('.')
  if (hasComma && hasDot) {
    // o separador mais à direita é o decimal: '1.234,56' (BR) ou '1,234.56' (US)
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) str = str.replace(/\./g, '').replace(',', '.')
    else str = str.replace(/,/g, '')
  } else if (hasComma) {
    str = str.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(str)) {
    // só pontos em grupos de 3 → milhar BR ('1.234' = 1234); '10.5' segue decimal
    str = str.replace(/\./g, '')
  }
  return parseFloat(str) || 0
}

export function parseExcelDate(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'number') {
    // serial do Excel; parte fracionária é hora — descarta
    const date = new Date((Math.floor(value) - 25569) * 86400 * 1000)
    return date.toISOString().split('T')[0]
  }
  if (typeof value === 'string') {
    const v = value.trim()
    // dd/mm/yyyy (com ou sem hora, dia/mês com 1 ou 2 dígitos)
    const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\sT].*)?$/)
    if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
    // yyyy-mm-dd (com ou sem hora)
    const iso = v.match(/^(\d{4}-\d{2}-\d{2})(?:[\sT].*)?$/)
    if (iso) return iso[1]
  }
  return ''
}

// Variações de cabeçalho que já vimos em planilhas reais. Tudo é
// comparado em lowercase + trim.
export const HEADER_MAP: Record<string, keyof ContratoRow> = {
  // Data
  'data': 'data',
  'data pregão': 'data',
  'data pregao': 'data',
  'dt': 'data',
  // Conta
  'número conta': 'numero_conta',
  'numero conta': 'numero_conta',
  'número de conta': 'numero_conta',
  'numero de conta': 'numero_conta',
  'conta': 'numero_conta',
  'nº conta': 'numero_conta',
  'no conta': 'numero_conta',
  // CPF / CNPJ
  'cpf': 'cpf',
  'cnpj': 'cnpj',
  'cpf/cnpj': 'cpf',
  'cpf cnpj': 'cpf',
  // Cliente
  'cliente': 'cliente_nome',
  'nome cliente': 'cliente_nome',
  'nome do cliente': 'cliente_nome',
  // Assessor / barra
  'assessor': 'assessor_nome',
  'aai': 'assessor_nome',
  'agente': 'assessor_nome',
  'barra': 'assessor_nome',
  'parceiro': 'assessor_nome',
  'parceiro comercial': 'assessor_nome',
  'nome assessor': 'assessor_nome',
  'nome do assessor': 'assessor_nome',
  'cód. assessor': 'assessor_nome',
  'cod. assessor': 'assessor_nome',
  'código assessor': 'assessor_nome',
  'codigo assessor': 'assessor_nome',
  'assessoria': 'assessor_nome',
  // Ativo
  'ativo': 'ativo',
  'produto': 'ativo',
  // Plataforma
  'plataforma': 'plataforma',
  // Lotes
  'lotes operados': 'lotes_operados',
  'qtd operada': 'lotes_operados',
  'quantidade operada': 'lotes_operados',
  'qtd lotes operados': 'lotes_operados',
  'lotes zerados': 'lotes_zerados',
  'qtd zerada': 'lotes_zerados',
  'quantidade zerada': 'lotes_zerados',
  'qtd lotes zerados': 'lotes_zerados',
}

const NUMBER_FIELDS = new Set<keyof ContratoRow>(['lotes_operados', 'lotes_zerados'])

// Tenta adivinhar a corretora pelo nome do arquivo (só sugestão; o usuário confirma)
export function sugerirCorretora(nome: string): Corretora | null {
  const n = nome.toLowerCase()
  if (n.includes('genial')) return 'GENIAL'
  if (n.includes('btg')) return 'BTG'
  if (/(^|[^a-z])xp([^a-z]|$)/.test(n)) return 'XP'
  return null
}

export type LeituraPlanilha =
  | { ok: true; rows: ContratoRow[]; headers: string[] }
  | { ok: false; erro: string }

// Converte a matriz da planilha (1ª linha = cabeçalho) em linhas de contrato.
// Linhas totalmente vazias são ignoradas.
export function lerPlanilha(raw: unknown[][]): LeituraPlanilha {
  if (!raw || raw.length < 2) return { ok: false, erro: 'Planilha vazia ou sem dados.' }

  const headers = (raw[0] as unknown[]).map(h => String(h ?? '').toLowerCase().trim())
  const reconhecidos = headers.filter(h => HEADER_MAP[h]).map(h => HEADER_MAP[h])
  if (!reconhecidos.includes('data') || !reconhecidos.includes('lotes_operados')) {
    return {
      ok: false,
      erro: `Não encontrei as colunas de data e de lotes operados. Cabeçalhos lidos: ${headers.filter(Boolean).join(', ')}`,
    }
  }

  const rows: ContratoRow[] = raw
    .slice(1)
    .filter(row => (row as unknown[]).some(c => c !== null && c !== undefined && c !== ''))
    .map(row => {
      const obj: Record<string, unknown> = {
        data: '', numero_conta: '', cpf: '', cnpj: '', cliente_nome: '', assessor_nome: '',
        ativo: '', plataforma: '', lotes_operados: 0, lotes_zerados: 0,
      }
      headers.forEach((h, i) => {
        const field = HEADER_MAP[h]
        if (!field) return
        const val = (row as unknown[])[i]
        if (NUMBER_FIELDS.has(field)) obj[field] = parseBrazilianNumber(val)
        else if (field === 'data') obj.data = parseExcelDate(val)
        else obj[field] = String(val ?? '').trim()
      })
      return obj as unknown as ContratoRow
    })

  return { ok: true, rows, headers }
}
