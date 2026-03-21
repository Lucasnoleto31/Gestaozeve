'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { X, Upload, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react'
import { importarContratos, ContratoRow } from './actions'

interface Props {
  open: boolean
  onClose: () => void
}

function parseBrazilianNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return value
  const str = String(value).trim().replace(/\./g, '').replace(',', '.')
  return parseFloat(str) || 0
}

function parseExcelDate(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'number') {
    const date = new Date((value - 25569) * 86400 * 1000)
    return date.toISOString().split('T')[0]
  }
  if (typeof value === 'string') {
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (match) return `${match[3]}-${match[2]}-${match[1]}`
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  }
  return ''
}

const HEADER_MAP: Record<string, keyof ContratoRow> = {
  'data': 'data',
  'número conta': 'numero_conta',
  'numero conta': 'numero_conta',
  'número de conta': 'numero_conta',
  'cpf': 'cpf',
  'cnpj': 'cnpj',
  'cliente': 'cliente_nome',
  'assessor': 'assessor_nome',
  'ativo': 'ativo',
  'plataforma': 'plataforma',
  'lotes operados': 'lotes_operados',
  'lotes zerados': 'lotes_zerados',
}

const NUMBER_FIELDS = new Set<keyof ContratoRow>(['lotes_operados', 'lotes_zerados'])

export function ImportarContratosModal({ open, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<ContratoRow[] | null>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [resultado, setResultado] = useState<{ ok: number } | null>(null)
  const [erro, setErro] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErro('')
    setLoading(true)
    setNomeArquivo(file.name)

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
      const result = await importarContratos(nomeArquivo, preview)
      setResultado({ ok: result.ok })
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar.')
    }
    setLoading(false)
  }

  function handleClose() {
    setPreview(null)
    setResultado(null)
    setErro('')
    setNomeArquivo('')
    if (inputRef.current) inputRef.current.value = ''
    onClose()
  }

  if (!open) return null

  const totalOperados = preview?.reduce((s, r) => s + (r.lotes_operados || 0), 0) ?? 0
  const totalZerados = preview?.reduce((s, r) => s + (r.lotes_zerados || 0), 0) ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Importar Contratos</h2>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        {resultado ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-emerald-900/20 border border-emerald-700/30 rounded-lg px-4 py-3">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <p className="text-sm text-emerald-300">{resultado.ok} linha(s) importada(s) com sucesso.</p>
            </div>
            <Button className="w-full" onClick={handleClose}>Fechar</Button>
          </div>
        ) : preview ? (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-400" />
                <p className="text-sm font-medium text-gray-900 truncate">{nomeArquivo}</p>
              </div>
              <p className="text-sm text-gray-500">{preview.length} linhas detectadas</p>
              <div className="flex gap-4 mt-1">
                <p className="text-sm text-gray-500">
                  Lotes operados:{' '}
                  <span className="text-blue-400 font-medium">
                    {totalOperados.toLocaleString('pt-BR')}
                  </span>
                </p>
                <p className="text-sm text-gray-500">
                  Lotes zerados:{' '}
                  <span className="text-red-400 font-medium">
                    {totalZerados.toLocaleString('pt-BR')}
                  </span>
                </p>
              </div>
            </div>

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
                      <td className="px-3 py-2 text-gray-500">{row.data}</td>
                      <td className="px-3 py-2 text-gray-400 truncate max-w-[130px]">{row.cliente_nome}</td>
                      <td className="px-3 py-2 text-gray-500">{row.assessor_nome}</td>
                      <td className="px-3 py-2 text-blue-400 text-right">{row.lotes_operados}</td>
                      <td className="px-3 py-2 text-red-400 text-right">{row.lotes_zerados}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 6 && (
                <p className="text-xs text-gray-400 text-center py-2">+{preview.length - 6} linhas...</p>
              )}
            </div>

            {erro && (
              <div className="flex items-center gap-2 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-400">{erro}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setPreview(null)}>Voltar</Button>
              <Button className="flex-1" loading={loading} onClick={handleImportar}>Confirmar Importação</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Suba o arquivo Excel com os contratos do período. Os clientes serão vinculados automaticamente
              por número de conta, CPF ou nome.
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
              <div className="flex items-center gap-2 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-400">{erro}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
