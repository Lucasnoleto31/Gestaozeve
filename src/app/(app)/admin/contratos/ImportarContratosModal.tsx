'use client'

import { useState, useRef, useEffect } from 'react'
import { Upload, CheckCircle2, FileSpreadsheet, Loader2 } from 'lucide-react'
import { importarContratos, checarImportacao, type ContratoRow, type ChecagemImportacao } from './actions'
import { CORRETORAS, CORRETORA_COLOR, CORRETORA_LABEL, type Corretora } from '@/lib/corretoras'
import { fmtNum } from '@/lib/format'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'

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

function CorretoraPicker({ value, onChange, disabled }: { value: Corretora; onChange: (c: Corretora) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {CORRETORAS.map((c) => {
        const active = c === value
        return (
          <button key={c} type="button" disabled={disabled} onClick={() => onChange(c)}
            className="chip h-9 justify-center text-sm font-semibold"
            data-active={active}
            style={active ? { background: CORRETORA_COLOR[c], borderColor: CORRETORA_COLOR[c], color: '#fff' } : undefined}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? '#fff' : CORRETORA_COLOR[c] }} />
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

  const totalOperados = preview?.reduce((s, r) => s + (r.lotes_operados || 0), 0) ?? 0
  const totalZerados = preview?.reduce((s, r) => s + (r.lotes_zerados || 0), 0) ?? 0
  const semData = preview?.filter(r => !r.data).length ?? 0
  const temAvisos = !!checagem && (checagem.desconhecidas.length > 0 || checagem.parecemPlataforma.length > 0 || checagem.semBarra.linhas > 0)

  const footer = resultado
    ? <Button onClick={handleClose}>Fechar</Button>
    : preview
      ? (
        <>
          <Button variant="secondary" onClick={() => setPreview(null)} disabled={loading}>Voltar</Button>
          <Button loading={loading} onClick={handleImportar}>Importar na {CORRETORA_LABEL[corretora]}</Button>
        </>
      )
      : <Button variant="secondary" onClick={handleClose}>Cancelar</Button>

  return (
    <Modal open={open} onClose={handleClose} size="lg" title="Importar planilha de lotes"
      subtitle={preview ? 'Passo 2 de 2 · confira e confirme' : 'Passo 1 de 2 · corretora e arquivo'} footer={footer}>
      {resultado ? (
        <Alert tone="success" title={`${resultado.ok} linha(s) importada(s) na ${CORRETORA_LABEL[corretora]}.`}>
          Os painéis já refletem os novos lotes.
        </Alert>
      ) : preview ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-surface-2 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-accent" />
              <p className="truncate text-sm font-medium text-fg">{nomeArquivo}</p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
              <span>{preview.length} linhas{semData > 0 ? ` · ${semData} sem data` : ''}</span>
              <span>Operados <strong className="font-semibold text-accent">{fmtNum(totalOperados)}</strong></span>
              <span>Zerados <strong className="font-semibold text-danger">{fmtNum(totalZerados)}</strong></span>
            </div>
          </div>

          <div>
            <p className="label mb-1.5">Corretora deste arquivo</p>
            <CorretoraPicker value={corretora} onChange={setCorretora} disabled={loading} />
            <p className="mt-1 text-[11px] text-fg-subtle">Todas as linhas entram como {CORRETORA_LABEL[corretora]}. Um arquivo por corretora.</p>
          </div>

          {/* Checagem de barras */}
          {checando ? (
            <p className="inline-flex items-center gap-2 text-xs text-fg-subtle"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Conferindo barras…</p>
          ) : checagem && (
            temAvisos ? (
              <Alert tone="warning" title="Confira antes de importar">
                <div className="space-y-1.5 text-xs">
                  {checagem.semBarra.linhas > 0 && (
                    <p><strong>{checagem.semBarra.linhas} linha(s)</strong> sem assessor ({fmtNum(checagem.semBarra.lotes)} lotes) vão entrar como <em>Sem barra</em>.</p>
                  )}
                  {checagem.parecemPlataforma.length > 0 && (
                    <p>Nome de plataforma na coluna de assessor: <strong>{checagem.parecemPlataforma.join(', ')}</strong>. Essas linhas entram como <em>Sem barra</em>.</p>
                  )}
                  {checagem.desconhecidas.length > 0 && (
                    <div>
                      <p>Barras que não existem no cadastro da {CORRETORA_LABEL[corretora]} (entram assim mesmo, sem tarifa e sem assessor):</p>
                      <ul className="mt-1 space-y-0.5">
                        {checagem.desconhecidas.slice(0, 8).map(b => (
                          <li key={b.nome} className="flex justify-between gap-3">
                            <span className="truncate font-medium">{b.nome}</span>
                            <span className="shrink-0 tabular-nums">{b.linhas} linhas · {fmtNum(b.lotes)} lotes</span>
                          </li>
                        ))}
                        {checagem.desconhecidas.length > 8 && <li>+{checagem.desconhecidas.length - 8} outras</li>}
                      </ul>
                    </div>
                  )}
                </div>
              </Alert>
            ) : (
              <p className="inline-flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> Todas as barras do arquivo existem no cadastro da {CORRETORA_LABEL[corretora]}.
              </p>
            )
          )}

          <div className="tbl-wrap max-h-52">
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Assessor</th>
                  <th className="num">Operados</th>
                  <th className="num">Zerados</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 6).map((row, i) => (
                  <tr key={i}>
                    <td className="muted whitespace-nowrap">{row.data || <span className="text-danger">sem data</span>}</td>
                    <td className="max-w-[160px] truncate">{row.cliente_nome}</td>
                    <td className="muted max-w-[160px] truncate">{row.assessor_nome || <span className="subtle italic">sem barra</span>}</td>
                    <td className="num text-accent">{row.lotes_operados}</td>
                    <td className="num text-danger">{row.lotes_zerados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 6 && (
              <p className="py-2 text-center text-xs text-fg-subtle">+{preview.length - 6} linhas…</p>
            )}
          </div>

          {erro && <Alert tone="danger">{erro}</Alert>}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="label mb-1.5">Corretora do arquivo</p>
            <CorretoraPicker value={corretora} onChange={setCorretora} disabled={loading} />
          </div>

          <p className="text-sm text-fg-muted">
            Suba o Excel com os lotes de <strong className="font-semibold text-fg">uma</strong> corretora. Antes de gravar, o sistema
            confere se as barras existem no cadastro, corrige acentos quebrados e avisa sobre linhas sem assessor.
          </p>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center rounded-[10px] border-2 border-dashed border-line-strong bg-surface-2 px-6 py-9 text-center hover:border-accent hover:bg-accent-soft"
          >
            <Upload className="mb-2 h-7 w-7 text-fg-subtle" />
            <span className="text-sm font-medium text-fg">Clique para selecionar o arquivo</span>
            <span className="mt-1 text-xs text-fg-subtle">Formato: .xlsx</span>
          </button>

          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />

          {loading && (
            <p className="inline-flex items-center gap-2 text-xs text-fg-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo arquivo…</p>
          )}

          {erro && <Alert tone="danger">{erro}</Alert>}
        </div>
      )}
    </Modal>
  )
}
