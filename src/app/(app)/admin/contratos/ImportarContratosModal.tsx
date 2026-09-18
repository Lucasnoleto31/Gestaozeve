'use client'

import { useState, useRef, useEffect } from 'react'
import { Upload, CheckCircle2, FileSpreadsheet, Loader2 } from 'lucide-react'
import { importarContratos, checarImportacao, type ChecagemImportacao } from './actions'
import { lerPlanilha, sugerirCorretora, type ContratoRow } from '@/lib/importacao/parse'
import { CORRETORAS, CORRETORA_COLOR, CORRETORA_LABEL, type Corretora } from '@/lib/corretoras'
import { fmtNum, fmtDataPt, fmtDataHoraPt } from '@/lib/format'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'

interface Props {
  open: boolean
  onClose: () => void
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
  const [forcar, setForcar] = useState(false)
  const [resultado, setResultado] = useState<{ ok: number; inferidas: number } | null>(null)
  const [erro, setErro] = useState('')

  // Checagens (barras, sem barra, duplicidade) sempre que o arquivo ou a corretora mudam
  useEffect(() => {
    if (!preview || preview.length === 0) { setChecagem(null); return }
    let cancelado = false
    setChecando(true)
    setForcar(false)
    checarImportacao(corretora, nomeArquivo, preview)
      .then(c => { if (!cancelado) setChecagem(c) })
      .catch(() => { if (!cancelado) setChecagem(null) })
      .finally(() => { if (!cancelado) setChecando(false) })
    return () => { cancelado = true }
  }, [preview, corretora, nomeArquivo])

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
      const leitura = lerPlanilha(raw)
      if (!leitura.ok) setErro(leitura.erro)
      else setPreview(leitura.rows)
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
      const result = await importarContratos(nomeArquivo, corretora, preview, { forcar })
      setResultado(result)
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
    setForcar(false)
    if (inputRef.current) inputRef.current.value = ''
    onClose()
  }

  const totalOperados = preview?.reduce((s, r) => s + (r.lotes_operados || 0), 0) ?? 0
  const totalZerados = preview?.reduce((s, r) => s + (r.lotes_zerados || 0), 0) ?? 0
  const semData = preview?.filter(r => !r.data).length ?? 0
  const dup = checagem?.duplicidade
  // Só período já coberto bloqueia; nome de arquivo repetido é normal (a corretora exporta sempre com o mesmo nome)
  const temDuplicidade = !!dup?.sobreposicao
  const mesmoNome = !!dup?.mesmoArquivo && !dup?.sobreposicao
  const temAvisos = !!checagem && (checagem.desconhecidas.length > 0 || checagem.parecemPlataforma.length > 0 || checagem.semBarra.linhas > 0)
  const podeImportar = !loading && !checando && (!temDuplicidade || forcar)

  const footer = resultado
    ? <Button onClick={handleClose}>Fechar</Button>
    : preview
      ? (
        <>
          <Button variant="secondary" onClick={() => setPreview(null)} disabled={loading}>Voltar</Button>
          <Button loading={loading} disabled={!podeImportar} onClick={handleImportar}>Importar na {CORRETORA_LABEL[corretora]}</Button>
        </>
      )
      : <Button variant="secondary" onClick={handleClose}>Cancelar</Button>

  return (
    <Modal open={open} onClose={handleClose} size="lg" title="Importar planilha de lotes"
      subtitle={preview ? 'Passo 2 de 2 · confira e confirme' : 'Passo 1 de 2 · corretora e arquivo'} footer={footer}>
      {resultado ? (
        <Alert tone="success" title={`${fmtNum(resultado.ok)} linha(s) importada(s) na ${CORRETORA_LABEL[corretora]}.`}>
          {resultado.inferidas > 0
            ? `${fmtNum(resultado.inferidas)} linha(s) sem assessor receberam a barra do cliente. Os painéis já refletem os novos lotes.`
            : 'Os painéis já refletem os novos lotes.'}
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
              {checagem?.periodo.inicio && <span>{fmtDataPt(checagem.periodo.inicio)} a {fmtDataPt(checagem.periodo.fim)}</span>}
              <span>Operados <strong className="font-semibold text-accent">{fmtNum(totalOperados)}</strong></span>
              <span>Zerados <strong className="font-semibold text-danger">{fmtNum(totalZerados)}</strong></span>
            </div>
          </div>

          <div>
            <p className="label mb-1.5">Corretora deste arquivo</p>
            <CorretoraPicker value={corretora} onChange={setCorretora} disabled={loading} />
            <p className="mt-1 text-[11px] text-fg-subtle">Todas as linhas entram como {CORRETORA_LABEL[corretora]}. Um arquivo por corretora.</p>
          </div>

          {checando ? (
            <p className="inline-flex items-center gap-2 text-xs text-fg-subtle"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Conferindo duplicidade e barras…</p>
          ) : checagem && (
            <>
              {/* Duplicidade: bloqueia até o usuário assumir */}
              {mesmoNome && dup?.mesmoArquivo && (
                <p className="text-xs text-fg-muted">
                  Um arquivo com este nome já entrou na {CORRETORA_LABEL[corretora]} em {fmtDataHoraPt(dup.mesmoArquivo.created_at)} ({fmtNum(dup.mesmoArquivo.total_linhas)} linhas),
                  mas cobria outras datas. Tudo certo: as datas deste arquivo ainda não foram importadas.
                </p>
              )}

              {temDuplicidade && (
                <Alert tone="danger" title="Este período já foi importado">
                  <div className="space-y-1.5 text-xs">
                    {dup?.sobreposicao && (
                      <div>
                        <p>
                          Já existem <strong>{fmtNum(dup.sobreposicao.linhas)} linhas</strong>
                          {dup.sobreposicao.lotes > 0 ? ` (${fmtNum(dup.sobreposicao.lotes)} lotes)` : ''} da {CORRETORA_LABEL[corretora]} entre {fmtDataPt(checagem.periodo.inicio)} e {fmtDataPt(checagem.periodo.fim)}.
                        </p>
                        {dup.sobreposicao.importacoes.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {dup.sobreposicao.importacoes.slice(0, 5).map(i => (
                              <li key={i.importacao_id} className="flex justify-between gap-3">
                                <span className="truncate font-medium">{i.nome_arquivo}</span>
                                <span className="shrink-0 tabular-nums">{fmtDataPt(i.data_min)} a {fmtDataPt(i.data_max)} · {fmtNum(i.linhas)} linhas</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    <p>Importar de novo <strong>duplica os lotes</strong> no ranking, na receita e na meta. Para corrigir um arquivo, desfaça a importação antiga no histórico e importe o novo.</p>
                    <label className="mt-1 flex cursor-pointer items-center gap-2 font-medium">
                      <input type="checkbox" checked={forcar} onChange={e => setForcar(e.target.checked)} className="h-4 w-4 accent-[var(--danger)]" />
                      Importar mesmo assim (sei o que estou fazendo)
                    </label>
                  </div>
                </Alert>
              )}

              {temAvisos ? (
                <Alert tone="warning" title="Confira antes de importar">
                  <div className="space-y-1.5 text-xs">
                    {checagem.semBarra.linhas > 0 && (
                      <p>
                        <strong>{fmtNum(checagem.semBarra.linhas)} linha(s)</strong> sem assessor ({fmtNum(checagem.semBarra.lotes)} lotes).
                        {checagem.semBarra.atribuiveis
                          ? checagem.semBarra.atribuiveis.linhas > 0
                            ? <> <strong>{fmtNum(checagem.semBarra.atribuiveis.linhas)}</strong> delas ({fmtNum(checagem.semBarra.atribuiveis.lotes)} lotes) ganham a barra que o cliente já tem; o resto entra como <em>Sem barra</em>.</>
                            : <> Nenhuma tem cliente conhecido: entram como <em>Sem barra</em>.</>
                          : <> Entram como <em>Sem barra</em> (a atribuição pelo cliente precisa do supabase-s16).</>}
                      </p>
                    )}
                    {checagem.parecemPlataforma.length > 0 && (
                      <p>Nome de plataforma na coluna de assessor: <strong>{checagem.parecemPlataforma.join(', ')}</strong>. Essas linhas contam como sem assessor.</p>
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
              ) : !temDuplicidade && (
                <p className="inline-flex items-center gap-1.5 text-xs text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Nada a corrigir: barras conhecidas, sem linhas sem assessor e sem duplicidade.
                </p>
              )}
            </>
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
            confere se o arquivo ou o período já foram importados, se as barras existem no cadastro, corrige acentos quebrados
            e atribui a barra do cliente às linhas que vieram sem assessor.
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
