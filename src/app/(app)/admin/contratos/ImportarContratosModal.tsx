'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { X, Upload, CheckCircle, AlertCircle, AlertTriangle, FileSpreadsheet, Loader2 } from 'lucide-react'
import { importarContratos, checarImportacao, type ContratoRow, type ChecagemImportacao } from './actions'
import { CORRETORAS, CORRETORA_COLOR, CORRETORA_LABEL, type Corretora } from '@/lib/corretoras'

interface Props {
  open: boolean
  onClose: () => void
}

function parseBrazilianNumber(value: unknown): number {
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

function parseExcelDate(value: unknown): string {
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
// comparado em lowercase + trim, então acentos e capitalização contam
// só pra legibilidade aqui (a lookup ignora ambos).
const HEADER_MAP: Record<string, keyof ContratoRow> = {
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
function sugerirCorretora(nome: string): Corretora | null {
  const n = nome.toLowerCase()
  if (n.includes('genial')) return 'GENIAL'
  if (n.includes('btg')) return 'BTG'
  if (/(^|[^a-z])xp([^a-z]|$)/.test(n)) return 'XP'
  return null
}

const fmtNum = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

function CorretoraPicker({ value, onChange, disabled }: { value: Corretora; onChange: (c: Corretora) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-2">
      {CORRETORAS.map((c) => {
        const active = c === value
        return (
          <button key={c} type="button" disabled={disabled} onClick={() => onChange(c)}
            className="flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-50"
            style={active
              ? { background: CORRETORA_COLOR[c], borderColor: CORRETORA_COLOR[c], color: '#fff' }
              : { background: '#fff', borderColor: '#e5e7eb', color: '#374151' }}>
            {CORRETORA_LABEL[c]}
          </button>
        )
      })}
    </div>
  )
}

export function ImportarContratosModal({ open, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<ContratoRow[] | null>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [corretora, setCorretora] = useState<Corretora>('GENIAL')
  const [checagem, setChecagem] = useState<ChecagemImportacao | null>(null)
  const [checando, setChecando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: number } | null>(null)
  const [erro, setErro] = useState('')

  // Checa barras desconhecidas sempre que o arquivo ou a corretora mudam
  useEffect(() => {
    if (!preview || preview.length === 0) { setChecagem(null); return }
    let cancelado = false
    setChecando(true)
    checarImportacao(corretora, preview)
      .then(c => { if (!cancelado) setChecagem(c) })
      .catch(() => { if (!cancelado) setChecagem(null) })
      .finally(() => { if (!cancelado) setChecando(false) })
    return () => { cancelado = true }
  }, [preview, corretora])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErro('')
    setLoading(true)
    setNomeArquivo(file.name)
    const sugestao = sugerirCorretora(file.name)
    if (sugestao) setCorretora(sugestao)

    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]

      if (raw.length < 2) {
        setErro('Planilha vazia ou sem dados.')
        setLoading(false)
        return
      }

      const headers = (raw[0] as unknown[]).map((h) =>
        String(h ?? '').toLowerCase().trim()
      )

      const reconhecidos = headers.filter(h => HEADER_MAP[h]).map(h => HEADER_MAP[h])
      if (!reconhecidos.includes('data') || !reconhecidos.includes('lotes_operados')) {
        setErro(`Não encontrei as colunas de data e de lotes operados. Cabeçalhos lidos: ${headers.filter(Boolean).join(', ')}`)
        setLoading(false)
        return
      }

      const rows: ContratoRow[] = raw
        .slice(1)
        .filter((row) => (row as unknown[]).some((c) => c !== null && c !== undefined && c !== ''))
        .map((row) => {
          const obj: Partial<ContratoRow> = {}
          headers.forEach((h, i) => {
            const field = HEADER_MAP[h]
            if (!field) return
            const val = (row as unknown[])[i]
            if (NUMBER_FIELDS.has(field)) {
              (obj as Record<string, unknown>)[field] = parseBrazilianNumber(val)
            } else if (field === 'data') {
              obj.data = parseExcelDate(val)
            } else {
              (obj as Record<string, unknown>)[field] = String(val ?? '').trim()
            }
          })
          return obj as ContratoRow
        })

      setPreview(rows)
    } catch {
      setErro('Erro ao ler o arquivo. Verifique se é um .xlsx válido.')
    }
    setLoading(false)
  }

  async function handleImportar() {
    if (!preview) return
    setLoading(true)
    setErro('')
    try {
      const result = await importarContratos(nomeArquivo, corretora, preview)
      setResultado({ ok: result.ok })
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar.')
    }
    setLoading(false)
  }

  function handleClose() {
    setPreview(null)
    setChecagem(null)
    setResultado(null)
    setErro('')
    setNomeArquivo('')
    setCorretora('GENIAL')
    if (inputRef.current) inputRef.current.value = ''
    onClose()
  }

  if (!open) return null

  const totalOperados = preview?.reduce((s, r) => s + (r.lotes_operados || 0), 0) ?? 0
  const totalZerados = preview?.reduce((s, r) => s + (r.lotes_zerados || 0), 0) ?? 0
  const semData = preview?.filter(r => !r.data).length ?? 0
  const temAvisos = !!checagem && (checagem.desconhecidas.length > 0 || checagem.parecemPlataforma.length > 0 || checagem.semBarra.linhas > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Importar Contratos</h2>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        {resultado ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <p className="text-sm text-emerald-800">
                {resultado.ok} linha(s) importada(s) com sucesso para a {CORRETORA_LABEL[corretora]}.
              </p>
            </div>
            <Button className="w-full" onClick={handleClose}>Fechar</Button>
          </div>
        ) : preview ? (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-500" />
                <p className="text-sm font-medium text-gray-900 truncate">{nomeArquivo}</p>
              </div>
              <p className="text-sm text-gray-500">{preview.length} linhas detectadas{semData > 0 ? ` · ${semData} sem data` : ''}</p>
              <div className="flex gap-4 mt-1">
                <p className="text-sm text-gray-500">
                  Lotes operados:{' '}
                  <span className="text-blue-600 font-medium">{fmtNum(totalOperados)}</span>
                </p>
                <p className="text-sm text-gray-500">
                  Lotes zerados:{' '}
                  <span className="text-red-500 font-medium">{fmtNum(totalZerados)}</span>
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Corretora deste arquivo</p>
              <CorretoraPicker value={corretora} onChange={setCorretora} disabled={loading} />
              <p className="text-[11px] text-gray-400 mt-1">Todas as linhas entram como {CORRETORA_LABEL[corretora]}. Um arquivo por corretora.</p>
            </div>

            {/* Checagem de barras */}
            {checando ? (
              <p className="text-xs text-gray-400 inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Conferindo barras…</p>
            ) : checagem && (
              temAvisos ? (
                <div className="rounded-xl px-4 py-3 space-y-2 text-xs"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)' }}>
                  <p className="font-semibold text-amber-800 inline-flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Confira antes de importar
                  </p>
                  {checagem.semBarra.linhas > 0 && (
                    <p className="text-amber-900">
                      <strong>{checagem.semBarra.linhas} linha(s)</strong> sem assessor ({fmtNum(checagem.semBarra.lotes)} lotes) vão entrar como <em>Sem barra</em>.
                    </p>
                  )}
                  {checagem.parecemPlataforma.length > 0 && (
                    <p className="text-amber-900">
                      Nome de plataforma na coluna de assessor: <strong>{checagem.parecemPlataforma.join(', ')}</strong>. Essas linhas entram como <em>Sem barra</em>.
                    </p>
                  )}
                  {checagem.desconhecidas.length > 0 && (
                    <div className="text-amber-900">
                      <p>Barras que não existem no cadastro da {CORRETORA_LABEL[corretora]} (entram assim mesmo, sem tarifa e sem assessor):</p>
                      <ul className="mt-1 space-y-0.5">
                        {checagem.desconhecidas.slice(0, 8).map(b => (
                          <li key={b.nome} className="flex justify-between gap-3">
                            <span className="font-medium truncate">{b.nome}</span>
                            <span className="tabular-nums text-amber-700 shrink-0">{b.linhas} linhas · {fmtNum(b.lotes)} lotes</span>
                          </li>
                        ))}
                        {checagem.desconhecidas.length > 8 && <li>+{checagem.desconhecidas.length - 8} outras</li>}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-emerald-700 inline-flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Todas as barras do arquivo existem no cadastro da {CORRETORA_LABEL[corretora]}.
                </p>
              )
            )}

            <div className="overflow-x-auto rounded-xl border border-gray-200 max-h-48">
              <table className="text-xs w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium">Data</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium">Cliente</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium">Assessor</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-medium">Operados</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-medium">Zerados</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 6).map((row, i) => (
                    <tr key={i} className="border-t border-gray-200">
                      <td className="px-3 py-2 text-gray-500">{row.data || <span className="text-red-500">sem data</span>}</td>
                      <td className="px-3 py-2 text-gray-500 truncate max-w-[130px]">{row.cliente_nome}</td>
                      <td className="px-3 py-2 text-gray-500">{row.assessor_nome || <span className="text-gray-300 italic">sem barra</span>}</td>
                      <td className="px-3 py-2 text-blue-600 text-right">{row.lotes_operados}</td>
                      <td className="px-3 py-2 text-red-500 text-right">{row.lotes_zerados}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 6 && (
                <p className="text-xs text-gray-400 text-center py-2">+{preview.length - 6} linhas...</p>
              )}
            </div>

            {erro && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-600">{erro}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setPreview(null)}>Voltar</Button>
              <Button className="flex-1" loading={loading} onClick={handleImportar}>
                Importar na {CORRETORA_LABEL[corretora]}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Corretora do arquivo</p>
              <CorretoraPicker value={corretora} onChange={setCorretora} disabled={loading} />
            </div>

            <p className="text-sm text-gray-500">
              Suba o arquivo Excel com os contratos do período de <strong>uma</strong> corretora. Antes de gravar, o sistema
              confere se as barras existem no cadastro, corrige acentos quebrados e avisa sobre linhas sem assessor.
            </p>

            <div
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-600 transition-colors"
            >
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Clique para selecionar o arquivo</p>
              <p className="text-xs text-gray-400 mt-1">Formato: .xlsx</p>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFile}
            />

            {loading && (
              <div className="text-center py-2">
                <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-1" />
                <p className="text-xs text-gray-500">Lendo arquivo...</p>
              </div>
            )}

            {erro && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-600">{erro}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
