'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Trash2, Upload, X } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { ImportarContratosModal } from './ImportarContratosModal'
import { deletarImportacaoContrato, exportarTodosContratos, type LogImportacao } from './actions'
import type { CoberturaRow } from '@/app/(app)/admin/contratos-dashboard/actions'
import { CORRETORAS, CORRETORA_LABEL, labelCorretora } from '@/lib/corretoras'
import { fmtNum, fmtNum2, fmtDataPt, fmtDataHoraPt, labelMesCurto } from '@/lib/format'
import { useChartColors } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import { ChartTooltip } from '@/app/(app)/admin/contratos-dashboard/Charts'

interface Resumo {
  total_operados: number
  total_zerados: number
  num_contratos: number
}

interface PorMesRow {
  mes: string
  operados: number
  zerados: number
}

interface PorNomeRow {
  nome: string
  operados: number
  zerados: number
}

interface Contrato {
  id: string
  importacao_id: string
  cliente_id: string | null
  assessor_id: string | null
  data: string | null
  numero_conta: string | null
  cpf: string | null
  cnpj: string | null
  cliente_nome: string | null
  assessor_nome: string | null
  ativo: string | null
  plataforma: string | null
  corretora: string
  lotes_operados: number
  lotes_zerados: number
  cliente?: { id: string; nome: string } | null
}

interface Importacao {
  id: string
  nome_arquivo: string
  corretora: string
  total_linhas: number
  total_lotes_operados: number
  total_lotes_zerados: number
  created_at: string
  autor?: { nome: string } | { nome: string }[] | null
}

interface Props {
  resumo: Resumo
  porMes: PorMesRow[]
  porAssessor: PorNomeRow[]
  porCliente: PorNomeRow[]
  contratos: Contrato[]
  importacoes: Importacao[]
  cobertura: CoberturaRow[] | null
  log: LogImportacao[]
  hoje: string
}

const formatNum = (v: number) => fmtNum2(Number(v ?? 0))
const nomeAutor = (imp: Importacao) => {
  const a = Array.isArray(imp.autor) ? imp.autor[0] : imp.autor
  return a?.nome ?? null
}

export function ContratosView({ resumo, porMes, porAssessor, porCliente, contratos, importacoes, cobertura, log, hoje }: Props) {
  const router = useRouter()
  const cores = useChartColors()
  const [modalOpen, setModalOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)

  // Filtros (afetam apenas a tabela de lançamentos)
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroAssessor, setFiltroAssessor] = useState('')
  const [filtroAtivo, setFiltroAtivo] = useState('')
  const [filtroPeriodoInicio, setFiltroPeriodoInicio] = useState('')
  const [filtroPeriodoFim, setFiltroPeriodoFim] = useState('')
  const [filtroPlataforma, setFiltroPlataforma] = useState('')
  const [filtroCorretora, setFiltroCorretora] = useState('')

  const assessores = useMemo(() => {
    const set = new Set(contratos.map((c) => c.assessor_nome).filter(Boolean))
    return Array.from(set).sort() as string[]
  }, [contratos])

  const ativos = useMemo(() => {
    const set = new Set(contratos.map((c) => c.ativo).filter(Boolean))
    return Array.from(set).sort() as string[]
  }, [contratos])

  const plataformas = useMemo(() => {
    const set = new Set(contratos.map((c) => c.plataforma).filter(Boolean))
    return Array.from(set).sort() as string[]
  }, [contratos])

  const clientes = useMemo(() => {
    const map = new Map<string, string>()
    contratos.forEach((c) => {
      const nome = c.cliente?.nome ?? c.cliente_nome
      if (nome) map.set(nome, nome)
    })
    return Array.from(map.keys()).sort()
  }, [contratos])

  const temFiltro = filtroCliente || filtroAssessor || filtroAtivo || filtroPeriodoInicio || filtroPeriodoFim || filtroPlataforma || filtroCorretora

  const contratosFiltrados = useMemo(() => {
    return contratos.filter((c) => {
      if (filtroCliente) {
        const nome = c.cliente?.nome ?? c.cliente_nome ?? ''
        if (nome !== filtroCliente) return false
      }
      if (filtroAssessor && c.assessor_nome !== filtroAssessor) return false
      if (filtroAtivo && c.ativo !== filtroAtivo) return false
      if (filtroPlataforma && c.plataforma !== filtroPlataforma) return false
      if (filtroCorretora && c.corretora !== filtroCorretora) return false
      if (filtroPeriodoInicio && c.data && c.data < filtroPeriodoInicio + '-01') return false
      if (filtroPeriodoFim && c.data && c.data > filtroPeriodoFim + '-31') return false
      return true
    })
  }, [contratos, filtroCliente, filtroAssessor, filtroAtivo, filtroPlataforma, filtroCorretora, filtroPeriodoInicio, filtroPeriodoFim])

  const totalOperados = Number(resumo.total_operados ?? 0)
  const totalZerados = Number(resumo.total_zerados ?? 0)
  const pctZerado = totalOperados > 0 ? ((totalZerados / totalOperados) * 100).toFixed(1) : '0'

  const chartMes = useMemo(
    () => porMes.map((r) => ({
      label: labelMesCurto(`${r.mes}-01`),
      Operados: Number(r.operados),
      Zerados: Number(r.zerados),
    })),
    [porMes]
  )

  const chartAssessor = useMemo(
    () => porAssessor.map((r) => ({ nome: r.nome, Operados: Number(r.operados), Zerados: Number(r.zerados) })),
    [porAssessor]
  )

  const chartCliente = useMemo(
    () => porCliente.map((r) => ({ nome: r.nome, Operados: Number(r.operados), Zerados: Number(r.zerados) })),
    [porCliente]
  )

  function limparFiltros() {
    setFiltroCliente('')
    setFiltroAssessor('')
    setFiltroAtivo('')
    setFiltroPeriodoInicio('')
    setFiltroPeriodoFim('')
    setFiltroPlataforma('')
    setFiltroCorretora('')
  }

  async function handleDeletar(id: string) {
    if (!confirm('Desfazer esta importação? Todos os lotes desse arquivo serão removidos.')) return
    setDeletingId(id)
    try {
      await deletarImportacaoContrato(id)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao desfazer.')
    }
    setDeletingId(null)
  }

  async function handleBaixarExcel() {
    setExportando(true)
    try {
      const rows = await exportarTodosContratos()
      const XLSX = await import('xlsx')

      const dataFormatada = rows.map((r) => ({
        Data: r.data
          ? new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
          : '',
        Corretora: labelCorretora(r.corretora),
        'Número Conta': r.numero_conta ?? '',
        Cliente: r.cliente_nome ?? '',
        Barra: r.assessor_nome ?? '',
        Plataforma: r.plataforma ?? '',
        Ativo: r.ativo ?? '',
        'Lotes Operados': r.lotes_operados,
        'Lotes Zerados': r.lotes_zerados,
      }))

      const ws = XLSX.utils.json_to_sheet(dataFormatada)
      ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 40 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Contratos')

      const hojeIso = new Date().toISOString().split('T')[0]
      XLSX.writeFile(wb, `contratos-${hojeIso}.xlsx`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao gerar Excel.')
    }
    setExportando(false)
  }

  const tickStyle = { fill: cores.axis, fontSize: 11 }

  return (
    <>
      <PageHeader
        eyebrow="Lotes"
        title="Importações"
        description="Planilhas de lotes enviadas pelas corretoras. Cada arquivo entra em uma corretora, passa por checagem de duplicidade e pode ser desfeito a qualquer momento."
        stats={[
          { label: 'Registros', value: fmtNum2(Number(resumo.num_contratos ?? 0)) },
          { label: 'Importações', value: importacoes.length },
          { label: 'Lotes operados', value: formatNum(totalOperados), sub: 'histórico completo' },
          { label: 'Lotes zerados', value: formatNum(totalZerados), sub: `${pctZerado}% do operado` },
        ]}
        actions={
          <>
            <Button variant="secondary" onClick={handleBaixarExcel} loading={exportando}>
              <Download className="h-4 w-4" /> Baixar Excel
            </Button>
            <Button onClick={() => setModalOpen(true)}>
              <Upload className="h-4 w-4" /> Importar planilha
            </Button>
          </>
        }
      />

      <PageBody>
        {/* Cobertura de pregões */}
        <Panel title="Cobertura dos últimos 60 dias úteis"
          subtitle="Um quadrado por dia útil e corretora: verde tem lotes importados, vermelho não tem. Os dois últimos dias ficam cinza porque a corretora manda a planilha depois.">
          <Cobertura rows={cobertura} hoje={hoje} />
        </Panel>

        {/* Histórico de importações */}
        <Panel flush title="Histórico de importações"
          subtitle="Arquivos importados, do mais recente pro mais antigo. Desfazer remove todos os lotes do arquivo.">
          {importacoes.length === 0
            ? <p className="px-5 py-8 text-center text-sm text-fg-subtle">Nenhuma importação ainda. Clique em &quot;Importar planilha&quot; pra começar.</p>
            : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Arquivo</th>
                      <th>Corretora</th>
                      <th>Importado em</th>
                      <th>Por</th>
                      <th className="num">Linhas</th>
                      <th className="num">Lotes operados</th>
                      <th className="num">Lotes zerados</th>
                      <th className="w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {importacoes.map((imp) => (
                      <tr key={imp.id}>
                        <td className="max-w-[320px] truncate font-medium">{imp.nome_arquivo || 'Sem nome'}</td>
                        <td><CorretoraBadge corretora={imp.corretora} /></td>
                        <td className="muted whitespace-nowrap">{fmtDataHoraPt(imp.created_at)}</td>
                        <td className="muted">{nomeAutor(imp) ?? <span className="subtle">—</span>}</td>
                        <td className="num muted">{fmtNum2(imp.total_linhas)}</td>
                        <td className="num font-semibold text-accent">{formatNum(imp.total_lotes_operados)}</td>
                        <td className="num text-danger">{formatNum(imp.total_lotes_zerados)}</td>
                        <td>
                          <IconButton tone="danger" title="Desfazer importação" disabled={deletingId === imp.id}
                            onClick={() => handleDeletar(imp.id)}>
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Panel>

        {/* Gráficos — histórico completo */}
        {chartMes.length > 0 && (
          <>
            <Panel title="Evolução mensal" subtitle="Lotes operados e zerados por mês, histórico completo.">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartMes} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={cores.grid} vertical={false} />
                  <XAxis dataKey="label" tick={tickStyle} axisLine={{ stroke: cores.grid }} tickLine={false} />
                  <YAxis tick={tickStyle} axisLine={false} tickLine={false} width={48} />
                  <Tooltip content={<ChartTooltip formatter={formatNum} />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: cores.text }} iconType="plainline" />
                  <Line type="monotone" dataKey="Operados" stroke={cores.operados} strokeWidth={2} dot={{ fill: cores.operados, r: 2.5, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="Zerados" stroke={cores.zerados} strokeWidth={2} dot={{ fill: cores.zerados, r: 2.5, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Panel title="Lotes por barra" subtitle="Operados e zerados, histórico completo.">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartAssessor} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={cores.grid} horizontal={false} />
                    <XAxis type="number" tick={tickStyle} axisLine={false} tickLine={false} />
                    <YAxis dataKey="nome" type="category" width={90} tick={{ ...tickStyle, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip formatter={formatNum} />} cursor={{ fill: cores.grid }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: cores.text }} iconType="circle" />
                    <Bar dataKey="Operados" fill={cores.operados} radius={[0, 3, 3, 0]} stackId="a" />
                    <Bar dataKey="Zerados" fill={cores.zerados} radius={[0, 3, 3, 0]} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>

              <Panel title="Top 10 clientes" subtitle="Operados e zerados, histórico completo.">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartCliente} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={cores.grid} horizontal={false} />
                    <XAxis type="number" tick={tickStyle} axisLine={false} tickLine={false} />
                    <YAxis dataKey="nome" type="category" width={130} tick={{ ...tickStyle, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip formatter={formatNum} />} cursor={{ fill: cores.grid }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: cores.text }} iconType="circle" />
                    <Bar dataKey="Operados" fill={cores.operados} radius={[0, 3, 3, 0]} stackId="a" />
                    <Bar dataKey="Zerados" fill={cores.zerados} radius={[0, 3, 3, 0]} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            </div>
          </>
        )}

        {/* Lançamentos + filtros (filtros afetam só a tabela) */}
        <Panel flush title="Lançamentos"
          subtitle={`${contratosFiltrados.length} de ${contratos.length} registros (últimos 1000 importados). Filtros abaixo valem só para esta tabela.`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
            <select value={filtroCorretora} onChange={(e) => setFiltroCorretora(e.target.value)} className={cn('field-sm', filtroCorretora && 'border-accent')}>
              <option value="">Todas corretoras</option>
              {CORRETORAS.map((c) => <option key={c} value={c}>{CORRETORA_LABEL[c]}</option>)}
            </select>
            <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} className={cn('field-sm max-w-[220px]', filtroCliente && 'border-accent')}>
              <option value="">Todos clientes</option>
              {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filtroAssessor} onChange={(e) => setFiltroAssessor(e.target.value)} className={cn('field-sm max-w-[220px]', filtroAssessor && 'border-accent')}>
              <option value="">Todas barras</option>
              {assessores.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={filtroAtivo} onChange={(e) => setFiltroAtivo(e.target.value)} className={cn('field-sm', filtroAtivo && 'border-accent')}>
              <option value="">Todos ativos</option>
              {ativos.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={filtroPlataforma} onChange={(e) => setFiltroPlataforma(e.target.value)} className={cn('field-sm', filtroPlataforma && 'border-accent')}>
              <option value="">Todas plataformas</option>
              {plataformas.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input type="month" value={filtroPeriodoInicio} onChange={(e) => setFiltroPeriodoInicio(e.target.value)} className={cn('field-sm', filtroPeriodoInicio && 'border-accent')} aria-label="Mês inicial" />
            <span className="text-xs text-fg-subtle">até</span>
            <input type="month" value={filtroPeriodoFim} onChange={(e) => setFiltroPeriodoFim(e.target.value)} className={cn('field-sm', filtroPeriodoFim && 'border-accent')} aria-label="Mês final" />

            {temFiltro && (
              <button type="button" onClick={limparFiltros} className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
                <X className="h-3.5 w-3.5" /> Limpar
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Corretora</th>
                  <th>Nº conta</th>
                  <th>CPF/CNPJ</th>
                  <th>Cliente</th>
                  <th>Barra</th>
                  <th>Ativo</th>
                  <th>Plataforma</th>
                  <th className="num">Lotes operados</th>
                  <th className="num">Lotes zerados</th>
                </tr>
              </thead>
              <tbody>
                {contratosFiltrados.slice(0, 100).map((c) => (
                  <tr key={c.id}>
                    <td className="muted whitespace-nowrap">{c.data ? fmtDataPt(c.data) : '-'}</td>
                    <td><CorretoraBadge corretora={c.corretora} /></td>
                    <td className="muted tabular-nums">{c.numero_conta ?? '-'}</td>
                    <td className="muted tabular-nums">{c.cpf ?? c.cnpj ?? '-'}</td>
                    <td className="max-w-[180px] truncate font-medium">{c.cliente?.nome ?? c.cliente_nome ?? '-'}</td>
                    <td className="muted max-w-[180px] truncate">{c.assessor_nome ?? <span className="subtle italic">Sem barra</span>}</td>
                    <td className="muted">{c.ativo ?? '-'}</td>
                    <td className="muted">{c.plataforma ?? '-'}</td>
                    <td className="num font-medium text-accent">{formatNum(c.lotes_operados)}</td>
                    <td className={cn('num font-medium', c.lotes_zerados > 0 ? 'text-danger' : 'subtle')}>{formatNum(c.lotes_zerados)}</td>
                  </tr>
                ))}
                {contratosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-fg-subtle">Nenhum lançamento encontrado.</td>
                  </tr>
                )}
                {contratosFiltrados.length > 100 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-3 text-center text-xs text-fg-subtle">
                      Exibindo 100 de {contratosFiltrados.length}. Use os filtros para refinar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Log de ações */}
        <Panel flush title="Quem importou e quem desfez"
          subtitle="Registro das últimas 30 ações de importação.">
          {log.length === 0
            ? <p className="px-5 py-6 text-center text-sm text-fg-subtle">Sem registros ainda (o log começa com o supabase-s16).</p>
            : (
              <div className="overflow-x-auto">
                <table className="tbl tbl-dense">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Ação</th>
                      <th>Arquivo</th>
                      <th>Corretora</th>
                      <th>Usuário</th>
                      <th className="num">Linhas</th>
                      <th className="num">Lotes operados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.map(l => (
                      <tr key={l.id}>
                        <td className="muted whitespace-nowrap">{fmtDataHoraPt(l.created_at)}</td>
                        <td><Badge variant={l.acao === 'desfez' ? 'danger' : 'success'}>{l.acao === 'desfez' ? 'Desfez' : 'Importou'}</Badge></td>
                        <td className="max-w-[320px] truncate font-medium">{l.nome_arquivo}</td>
                        <td><CorretoraBadge corretora={l.corretora} /></td>
                        <td className="muted">{l.usuario_nome ?? '—'}</td>
                        <td className="num muted">{fmtNum(l.total_linhas)}</td>
                        <td className="num">{fmtNum(l.total_lotes_operados)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Panel>
      </PageBody>

      <ImportarContratosModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); router.refresh() }}
      />
    </>
  )
}

// ── Cobertura de pregões ───────────────────────────────────────────────────

function Cobertura({ rows, hoje }: { rows: CoberturaRow[] | null; hoje: string }) {
  if (rows === null) {
    return <p className="text-sm text-fg-muted">Indisponível: rode o <code className="rounded bg-surface-3 px-1 py-0.5 text-xs">supabase-s16-controle.sql</code> no SQL Editor do Supabase.</p>
  }
  if (rows.length === 0) return <p className="text-sm text-fg-subtle">Sem dias úteis no intervalo.</p>

  // Dois últimos dias úteis ainda podem estar a caminho (a corretora manda em D+1)
  const dias = Array.from(new Set(rows.map(r => r.dia))).sort()
  const pendentes = new Set(dias.slice(-2))
  const porCorretora = new Map<string, CoberturaRow[]>()
  for (const r of rows) porCorretora.set(r.corretora, [...(porCorretora.get(r.corretora) ?? []), r])

  return (
    <div className="space-y-4">
      {Array.from(porCorretora.entries()).map(([corretora, lista]) => {
        const ordenada = [...lista].sort((a, b) => a.dia.localeCompare(b.dia))
        const faltando = ordenada.filter(r => r.linhas === 0 && !pendentes.has(r.dia) && r.dia <= hoje)
        return (
          <div key={corretora}>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <CorretoraBadge corretora={corretora} size="md" />
              <span className="text-xs text-fg-muted">
                {faltando.length === 0
                  ? <span className="text-success">Todos os dias úteis têm lotes.</span>
                  : <><strong className="font-semibold text-danger">{faltando.length} dia(s) sem lotes:</strong> {faltando.slice(-8).map(r => fmtDataPt(r.dia)).join(', ')}{faltando.length > 8 ? ' …' : ''}</>}
              </span>
            </div>
            <div className="flex flex-wrap gap-[3px]">
              {ordenada.map(r => {
                const pendente = pendentes.has(r.dia)
                const cls = r.linhas > 0 ? 'bg-success' : pendente ? 'bg-surface-3' : 'bg-danger'
                return (
                  <span key={r.dia} title={`${fmtDataPt(r.dia)} · ${r.linhas > 0 ? `${fmtNum(r.lotes_operados)} lotes em ${fmtNum(r.linhas)} linhas` : pendente ? 'ainda pode chegar' : 'sem lotes'}`}
                    className={cn('h-4 w-4 rounded-[3px]', cls, r.linhas > 0 && 'opacity-80')} />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
