'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { importarPlataformasAction } from './actions'
import { Button } from '@/components/ui/Button'
import { X, Upload, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

const HEADER_MAP: Record<string, string> = {
  'assessor':               'assessor',
  'cod sinacor cliente':    'conta_sinacor',
  'cod. sinacor cliente':   'conta_sinacor',
  'cod sinacor':            'conta_sinacor',
  'conta sinacor':          'conta_sinacor',
  'cpf/cnpj':               'cpf',
  'cpf':                    'cpf',
  'cnpj':                   'cpf',
  'cliente':                'nome_cliente',
  'nome':                   'nome_cliente',
  'data de receita':        'data_receita',
  'data receita':           'data_receita',
  'data':                   'data_receita',
  'valor':                  'valor',
  'descricao':              'descricao',
  'descrição':              'descricao',
  'descricão':              'descricao',
}

const EXPECTED_COLS = ['ASSESSOR', 'COD SINACOR CLIENTE', 'CPF/CNPJ', 'CLIENTE', 'DATA DE RECEITA', 'VALOR', 'DESCRICAO']

export function ImportarPlataformasModal({ open, onClose }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<{ ok: number; erros: string[]; mes: string | null } | null>(null)

  async function handleImportar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setLoading(true)
    setResultado(null)

    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]

      if (raw.length < 2) {
        setResultado({ ok: 0, erros: ['Planilha vazia ou sem dados.'] })
        setLoading(false)
        return
      }

      const headers = (raw[0] as unknown[]).map((h) => String(h ?? '').toLowerCase().trim())
      const dataRows = raw
        .slice(1)
        .filter((row) => (row as unknown[]).some((c) => c !== null && c !== undefined && c !== ''))

      const rows = dataRows.map((row) => {
        const obj: Record<string, string> = {}
        headers.forEach((h, idx) => {
          const field = HEADER_MAP[h]
          if (field) obj[field] = String((row as unknown[])[idx] ?? '').trim()
        })
        return obj
      })

      const result = await importarPlataformasAction(rows)
      setResultado(result)
      if (result.ok > 0 && result.mes) {
        router.push(`/plataformas?mes=${result.mes}`)
      }
    } catch (err) {
      setResultado({ ok: 0, erros: ['Erro ao processar arquivo: ' + (err instanceof Error ? err.message : String(err))] })
    }

    setLoading(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Importar Plataformas</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!resultado ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Importe registros de plataformas via planilha Excel (.xlsx). O mês de referência é extraído automaticamente da DATA DE RECEITA.
            </p>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">Colunas esperadas na planilha:</p>
              <div className="flex flex-wrap gap-1">
                {EXPECTED_COLS.map((col) => (
                  <span key={col} className="inline-flex px-1.5 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 text-xs rounded font-mono">
                    {col}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Cliente identificado por: <strong>CPF/CNPJ</strong> → <strong>COD SINACOR</strong> → <strong>Nome</strong>
              </p>
            </div>

            <div
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
            >
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600 font-medium">Clique para selecionar o arquivo Excel</p>
              <p className="text-xs text-gray-400 mt-1">Formato: .xlsx</p>
            </div>

            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportar} />

            {loading && (
              <div className="text-center py-4">
                <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2" />
                <p className="text-sm text-gray-500">Processando planilha...</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <p className="text-sm text-emerald-700 font-medium">
                {resultado.ok} registro(s) importado(s) com sucesso.
              </p>
            </div>
            {resultado.erros.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <p className="text-sm text-red-600 font-medium">{resultado.erros.length} erro(s)</p>
                </div>
                {resultado.erros.map((e, i) => (
                  <p key={i} className="text-xs text-red-500 mb-0.5">{e}</p>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setResultado(null)}>
                Nova importação
              </Button>
              <Button className="flex-1" onClick={onClose}>Fechar</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
