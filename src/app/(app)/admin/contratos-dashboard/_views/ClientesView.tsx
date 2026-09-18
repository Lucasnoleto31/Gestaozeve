'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, RotateCcw, UserMinus, UserPlus, Users } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import { fmtNum, fmtDataPt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CORRETORA_LABEL, labelCorretora } from '@/lib/corretoras'
import type { ClienteMovimentoRow } from '@/lib/movimento'
import { Panel } from '@/components/ui/Panel'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Alert } from '@/components/ui/Alert'
import { Empty } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'

export function ClientesView() {
  const { periodo, barra, excluir, corretora } = useDashboardFilters()
  const d = useDashboardData(periodo, barra, excluir, corretora, {
    kpis: true, movimento: true, topClientes: true,
  })
  const [exportando, setExportando] = useState(false)

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  const pararam = useMemo(() => d.movimento.filter(m => m.tipo === 'parou'), [d.movimento])
  const novos = useMemo(() => d.movimento.filter(m => m.tipo === 'novo'), [d.movimento])
  const voltaram = useMemo(() => d.movimento.filter(m => m.tipo === 'voltou'), [d.movimento])
  const lotesPararam = pararam.reduce((s, m) => s + m.lotes_anterior, 0)
  const lotesNovos = novos.reduce((s, m) => s + m.lotes_atual, 0)
  const lotesVoltaram = voltaram.reduce((s, m) => s + m.lotes_atual, 0)

  const k = d.kpis
  const ka = d.kpisAnterior
  const comparaAnterior = periodo !== 'tudo'
  const rotulo = comparaAnterior ? 'vs período anterior' : undefined

  async function baixarExcel() {
    setExportando(true)
    try {
      const XLSX = await import('xlsx')
      const linhas = (lista: ClienteMovimentoRow[]) => lista.map(m => ({
        Cliente: m.cliente_nome,
        Conta: m.conta ?? '',
        'CPF/CNPJ': m.documento ?? '',
        Corretora: labelCorretora(m.corretora),
        Barra: m.barra_nome,
        'Lotes no período': m.lotes_atual,
        'Lotes no período anterior': m.lotes_anterior,
        'Primeira operação': m.primeira_operacao ? fmtDataPt(m.primeira_operacao) : '',
        'Última operação': m.ultima_operacao ? fmtDataPt(m.ultima_operacao) : '',
        'Dias sem operar': m.dias_sem_operar ?? '',
      }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas(pararam)), 'Pararam')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas(novos)), 'Novos')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas(voltaram)), 'Voltaram')
      XLSX.writeFile(wb, `clientes-movimento-${d.range.inicio}-${d.range.fim}.xlsx`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao gerar Excel.')
    }
    setExportando(false)
  }

  return (
    <>
      {d.erro && <Alert tone="danger">{d.erro}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-xs text-fg-muted">
          {d.range.inicio && <>Período <strong className="font-medium text-fg">{fmtDataPt(d.range.inicio)} a {fmtDataPt(d.range.fim)}</strong>{comparaAnterior ? ', comparado ao período anterior de mesma duração' : ''}. </>}
          {corretora && <>Só a <strong className="font-medium text-fg">{CORRETORA_LABEL[corretora]}</strong>. </>}
          Cliente = CPF/CNPJ (as contas do mesmo cliente contam uma vez). <strong className="font-medium text-fg">Parou</strong> = operou no período anterior e não operou neste.
          <strong className="font-medium text-fg"> Novo</strong> = primeira operação da vida dentro do período. <strong className="font-medium text-fg">Voltou</strong> = já era cliente, ficou parado e operou de novo.
        </p>
        <Button size="sm" variant="secondary" onClick={baixarExcel} loading={exportando} disabled={d.movimento.length === 0}>
          <Download className="h-3.5 w-3.5" /> Baixar Excel
        </Button>
      </div>

      <KpiRow>
        <KpiCard icon={Users} tone="accent" label="Clientes ativos" loading={d.loading && !k}
          value={k ? fmtNum(k.num_clientes_ativos) : '—'} sub="operaram no período"
          delta={k && ka && comparaAnterior ? { atual: k.num_clientes_ativos, anterior: ka.num_clientes_ativos, rotulo, fmt: fmtNum } : null} />
        <KpiCard icon={UserMinus} tone="danger" label="Pararam de operar" loading={d.loading && d.movimento.length === 0}
          value={fmtNum(pararam.length)} sub={pararam.length > 0 ? `${fmtNum(lotesPararam)} lotes no período anterior` : 'ninguém parou'} />
        <KpiCard icon={UserPlus} tone="success" label="Novos clientes" loading={d.loading && d.movimento.length === 0}
          value={fmtNum(novos.length)} sub={novos.length > 0 ? `${fmtNum(lotesNovos)} lotes no período` : 'primeira operação no período'} />
        <KpiCard icon={RotateCcw} tone="info" label="Voltaram a operar" loading={d.loading && d.movimento.length === 0}
          value={fmtNum(voltaram.length)} sub={voltaram.length > 0 ? `${fmtNum(lotesVoltaram)} lotes no período` : 'estavam parados no período anterior'} />
      </KpiRow>

      <Panel flush title="Quem parou de operar"
        subtitle="Clientes que giraram no período anterior e não apareceram neste. Ordenados pelos lotes que giravam: os primeiros são os que mais fazem falta.">
        {pararam.length === 0
          ? <div className="p-5"><Empty loading={d.loading && d.movimento.length === 0}>{!comparaAnterior ? 'Escolha um período (30, 60, 90 dias, ano ou datas) para comparar com o anterior.' : 'Ninguém parou de operar no período (ou supabase-s16 ainda não aplicado).'}</Empty></div>
          : <MovimentoTable rows={pararam} modo="parou" />}
      </Panel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel flush title="Novos clientes" subtitle="Primeira operação da vida dentro do período.">
          {novos.length === 0
            ? <div className="p-5"><Empty loading={d.loading && d.movimento.length === 0}>Nenhum cliente novo no período.</Empty></div>
            : <MovimentoTable rows={novos} modo="novo" />}
        </Panel>
        <Panel flush title="Voltaram a operar" subtitle="Já eram clientes, não operaram no período anterior e voltaram neste.">
          {voltaram.length === 0
            ? <div className="p-5"><Empty loading={d.loading && d.movimento.length === 0}>Ninguém voltou no período.</Empty></div>
            : <MovimentoTable rows={voltaram} modo="voltou" />}
        </Panel>
      </div>

      <Panel flush title="Top 10 clientes do período" subtitle="Por lotes operados · % acumulado do total.">
        {d.topClientes.length === 0
          ? <div className="p-5"><Empty loading={d.loading} /></div>
          : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Cliente</th>
                    <th>Barra</th>
                    <th className="num">Lotes op.</th>
                    <th className="num">% zer.</th>
                    <th className="num">% acum.</th>
                  </tr>
                </thead>
                <tbody>
                  {d.topClientes.map(c => {
                    const pctZe = c.lotes_operados > 0 ? (c.lotes_zerados / c.lotes_operados) * 100 : 0
                    return (
                      <tr key={`${c.cliente_nome}-${c.rank}`}>
                        <td className="subtle font-semibold tabular-nums">{c.rank}</td>
                        <td className="max-w-[260px] truncate font-medium">{c.cliente_nome}</td>
                        <td className="muted max-w-[200px] truncate">{c.assessor_nome ?? <span className="subtle italic">Sem barra</span>}</td>
                        <td className="num font-medium">{fmtNum(c.lotes_operados)}</td>
                        <td className="num muted">{pctZe.toFixed(1)}%</td>
                        <td className="num muted">{c.pct_acumulado.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Panel>
    </>
  )
}

function MovimentoTable({ rows, modo }: { rows: ClienteMovimentoRow[]; modo: 'parou' | 'novo' | 'voltou' }) {
  const LIMITE = 150
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th className="w-10">#</th>
            <th>Cliente</th>
            <th>Conta</th>
            <th>Barra</th>
            {modo === 'parou'
              ? <>
                  <th className="num">Lotes no anterior</th>
                  <th className="num">Última operação</th>
                  <th className="num">Dias parado</th>
                  <th className="num">Cliente desde</th>
                </>
              : <>
                  <th className="num">Lotes no período</th>
                  <th className="num">{modo === 'novo' ? 'Primeira operação' : 'Cliente desde'}</th>
                  <th className="num">Última operação</th>
                </>}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, LIMITE).map((m, i) => (
            <tr key={`${m.cliente_key}-${m.corretora}`}>
              <td className="subtle font-semibold tabular-nums">{i + 1}</td>
              <td>
                <p className="max-w-[260px] truncate font-medium">{m.cliente_nome}</p>
                {m.documento && <p className="text-[10.5px] tabular-nums text-fg-subtle">{m.documento}</p>}
              </td>
              <td className="muted tabular-nums">{m.conta ?? '—'}</td>
              <td>
                <span className="inline-flex items-center gap-2">
                  <span className={cn('max-w-[200px] truncate', m.barra_nome === 'Sem barra' ? 'italic text-fg-subtle' : 'text-fg')}>{m.barra_nome}</span>
                  <CorretoraBadge corretora={m.corretora} />
                </span>
              </td>
              {modo === 'parou'
                ? <>
                    <td className="num font-semibold">{fmtNum(m.lotes_anterior)}</td>
                    <td className="num muted">{fmtDataPt(m.ultima_operacao)}</td>
                    <td className={cn('num font-semibold', (m.dias_sem_operar ?? 0) >= 30 ? 'text-danger' : 'text-warning')}>{m.dias_sem_operar ?? '—'}</td>
                    <td className="num muted">{fmtDataPt(m.primeira_operacao)}</td>
                  </>
                : <>
                    <td className="num font-semibold">{fmtNum(m.lotes_atual)}</td>
                    <td className="num muted">{fmtDataPt(m.primeira_operacao)}</td>
                    <td className="num muted">{fmtDataPt(m.ultima_operacao)}</td>
                  </>}
            </tr>
          ))}
          {rows.length > LIMITE && (
            <tr>
              <td colSpan={8} className="px-4 py-3 text-center text-xs text-fg-subtle">
                Exibindo {LIMITE} de {rows.length}. A lista completa vai no Excel.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
