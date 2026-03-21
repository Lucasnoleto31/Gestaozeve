'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchBarras } from '@/app/(app)/admin/barras/actions'
import { Button } from '@/components/ui/Button'
import { X, Upload, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

// ── Parsing helpers ──────────────────────────────────────────────────────────

function parseBRDate(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'number') {
    // Excel serial date
    const date = new Date((value - 25569) * 86400 * 1000)
    return date.toISOString().split('T')[0]
  }
  const str = String(value).trim()
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (match) return `${match[3]}-${match[2]}-${match[1]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  return null
}

function parseBRCurrency(value: unknown): number | null {
  if (!value) return null
  const str = String(value).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(str)
  return isNaN(n) ? null : n
}

function normalizeSexo(v: string): string | null {
  const u = v.toUpperCase().trim()
  if (u === 'M' || u === 'MASCULINO') return 'masculino'
  if (u === 'F' || u === 'FEMININO') return 'feminino'
  return null
}

function normalizeEstadoCivil(v: string): string | null {
  const u = v.toUpperCase().trim()
  if (u.startsWith('CASADO')) return 'casado'
  if (u.startsWith('SOLTEIRO')) return 'solteiro'
  if (u.startsWith('DIVORCIADO') || u.startsWith('SEPARADO')) return 'divorciado'
  if (u.startsWith('VIÚVO') || u.startsWith('VIUVO')) return 'viuvo'
  if (u.includes('UNIÃO') || u.includes('UNIAO') || u.includes('ESTÁVEL') || u.includes('ESTAVEL')) return 'uniao_estavel'
  return null
}

function normalizePerfilGenial(v: string): string {
  const u = v.toUpperCase().trim()
  if (u === 'DIGITAL') return 'digital'
  if (u === 'PREMIUM') return 'premium'
  return 'sem_informacao'
}

function normalizeSuitability(v: string): string | null {
  const u = v.toLowerCase().trim()
  if (u.includes('conservador')) return 'conservador'
  if (u.includes('moderado')) return 'moderado'
  if (u.includes('arrojado')) return 'arrojado'
  if (u.includes('agressivo')) return 'agressivo'
  return null
}

function normalizeStatus(v: string): string {
  return v.toUpperCase().trim() === 'ATIVA' ? 'ativo' : 'inativo'
}

// ── Header → field mapping ───────────────────────────────────────────────────

const HEADER_MAP: Record<string, string> = {
  'tipo pessoa':       'tipo_pessoa',
  'conta sinacor':     'conta_sinacor',
  'cpf':               'cpf',
  'nome':              'nome',
  'nascimento':        'data_nascimento',
  'sexo':              'sexo',
  'estado':            'estado',
  'assessor':          'assessor_nome',
  'patrimonio':        'patrimonio',
  'patrimônio':        'patrimonio',
  'email':             'email',
  'habilitacao':       'data_habilitacao',
  'habilitação':       'data_habilitacao',
  'estado civil':      'estado_civil',
  'profissao':         'profissao',
  'profissão':         'profissao',
  'perfil':            'perfil_genial',
  'suitability':       'perfil_investidor',
  'telefone celular':  'telefone',
  'telefone':          'telefone',
  'celular':           'telefone',
  'situacao_conta':    'situacao_conta',
  'situação_conta':    'situacao_conta',
  'situacao conta':    'situacao_conta',
  'situação conta':    'situacao_conta',
}

const EXPECTED_COLS = [
  'TIPO PESSOA', 'CONTA SINACOR', 'CPF', 'NOME', 'NASCIMENTO', 'SEXO',
  'ESTADO', 'ASSESSOR', 'PATRIMONIO', 'EMAIL', 'HABILITACAO',
  'ESTADO CIVIL', 'PROFISSAO', 'PERFIL', 'SUITABILITY', 'TELEFONE CELULAR', 'SITUACAO_CONTA',
]

// ── Component ────────────────────────────────────────────────────────────────

export function ImportarClientesModal({ open, onClose }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<{ ok: number; erros: string[] } | null>(null)
  const [assessores, setAssessores] = useState<{ id: string; nome: string }[]>([])
  const [barras, setBarras] = useState<{ nome: string; assessor_id: string | null; influenciador_id: string | null }[]>([])

  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    supabase
      .from('profiles')
      .select('id, nome')
      .in('role', ['admin', 'vendedor'])
      .order('nome')
      .then(({ data }) => { if (data) setAssessores(data) })
    fetchBarras().then((data) => setBarras(data))
  }, [open])

  async function handleImportar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so same file can be re-selected
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

      const supabase = createClient()
      const assessorMap = new Map(assessores.map((a) => [a.nome.toUpperCase().trim(), a.id]))
      const barraMap = new Map(barras.map((b) => [b.nome.toUpperCase().trim(), b]))

      let ok = 0
      const erros: string[] = []

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i] as unknown[]
        const raw: Record<string, unknown> = {}
        headers.forEach((h, idx) => {
          const field = HEADER_MAP[h]
          if (field) raw[field] = row[idx]
        })

        const cpf = String(raw.cpf ?? '').replace(/\D/g, '')
        if (!cpf || cpf.length < 11) {
          erros.push(`Linha ${i + 2}: CPF inválido "${raw.cpf}"`)
          continue
        }

        // Resolve assessor and influenciador — first by barra map, then by direct name
        let assessorId: string | null = null
        let influenciadorId: string | null = null
        if (raw.assessor_nome) {
          const nomeUpper = String(raw.assessor_nome).toUpperCase().trim()
          const barra = barraMap.get(nomeUpper)
          if (barra) {
            assessorId = barra.assessor_id
            influenciadorId = barra.influenciador_id
          } else {
            // fallback: match direct profile name
            assessorId = assessorMap.get(nomeUpper) ?? null
          }
        }

        const contaSinacor = raw.conta_sinacor ? String(raw.conta_sinacor).trim() : null
        const isAtiva = raw.situacao_conta
          ? normalizeStatus(String(raw.situacao_conta)) === 'ativo'
          : true

        const record: Record<string, unknown> = {
          cpf,
          nome:              String(raw.nome ?? '').trim() || 'Sem nome',
          email:             raw.email ? String(raw.email).trim().toLowerCase() || null : null,
          telefone:          raw.telefone ? String(raw.telefone).replace(/\D/g, '') || null : null,
          tipo_pessoa:       raw.tipo_pessoa ? String(raw.tipo_pessoa).trim().toUpperCase() : null,
          data_nascimento:   parseBRDate(raw.data_nascimento),
          data_habilitacao:  parseBRDate(raw.data_habilitacao),
          sexo:              raw.sexo ? normalizeSexo(String(raw.sexo)) : null,
          estado:            raw.estado ? String(raw.estado).trim().toUpperCase() : null,
          estado_civil:      raw.estado_civil ? normalizeEstadoCivil(String(raw.estado_civil)) : null,
          patrimonio:        raw.patrimonio ? parseBRCurrency(raw.patrimonio) : null,
          profissao:         raw.profissao ? String(raw.profissao).trim() : null,
          perfil_genial:     raw.perfil_genial ? normalizePerfilGenial(String(raw.perfil_genial)) : null,
          perfil_investidor: raw.perfil_investidor ? normalizeSuitability(String(raw.perfil_investidor)) : null,
          situacao_conta:    raw.situacao_conta ? String(raw.situacao_conta).trim() : null,
          status:            isAtiva ? 'ativo' : 'inativo',
          assessor_id:       assessorId,
          influenciador_id:  influenciadorId,
        }

        const { data: clienteUpserted, error } = await supabase
          .from('clientes')
          .upsert(record, { onConflict: 'cpf' })
          .select('id')
          .single()

        if (error) {
          erros.push(`Linha ${i + 2} (${String(raw.nome ?? '').trim()}): ${error.message}`)
          continue
        }

        // Upsert the Genial account (CONTA SINACOR) into cliente_contas
        if (clienteUpserted && contaSinacor) {
          await supabase.from('cliente_contas').upsert(
            {
              cliente_id:    clienteUpserted.id,
              numero_conta:  contaSinacor,
              ativa:         isAtiva,
              capital_alocado: 0,
            },
            { onConflict: 'numero_conta' }
          )
        }

        ok++
      }

      setResultado({ ok, erros })
      if (ok > 0) router.refresh()
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
            <h2 className="text-lg font-semibold text-gray-900">Importar Clientes</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!resultado ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Importe clientes via planilha Excel (.xlsx). CPFs duplicados serão atualizados automaticamente.
            </p>

            {/* Expected columns */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">Colunas esperadas na planilha:</p>
              <div className="flex flex-wrap gap-1">
                {EXPECTED_COLS.map((col) => (
                  <span
                    key={col}
                    className="inline-flex px-1.5 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 text-xs rounded font-mono"
                  >
                    {col}
                  </span>
                ))}
              </div>
            </div>

            <div
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
            >
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600 font-medium">Clique para selecionar o arquivo Excel</p>
              <p className="text-xs text-gray-400 mt-1">Formato: .xlsx — separadores de tabulação ou vírgula</p>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImportar}
            />

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
                {resultado.ok} cliente(s) importado(s) com sucesso.
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
