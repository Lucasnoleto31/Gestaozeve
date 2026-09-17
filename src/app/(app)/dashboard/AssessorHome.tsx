'use client'

// Início do assessor: só as barras ligadas ao usuário (barras.assessor_id).

import { useEffect, useState } from 'react'
import { Activity, Calendar, TrendingDown, UserMinus, UserPlus, Users } from 'lucide-react'
import { Bar, ComposedChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getAssessorResumo, type AssessorResumo } from './assessor-actions'
import type { Periodo } from '@/lib/periodo'
import { fmtNum, fmtDataPt, labelMesCurto } from '@/lib/format'
import { useChartColors } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Alert } from '@/components/ui/Alert'
import { ChartSkeleton, Empty } from '@/components/ui/Skeleton'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import { ChartTooltip } from '@/app/(app)/admin/contratos-dashboard/Charts'

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: '30d', label: '30 dias' }, { id: '60d', label: '60 dias' }, { id: '90d', label: '90 dias' }, { id: 'ano', label: 'Ano' },
]

export function AssessorHome({ saudacao, nome }: { saudacao: string; nome: string }) {
  const [periodo, setPeriodo] = useState<Periodo>('30d')
  const [dados, setDados] = useState<AssessorResumo | null>(null)
  // Período cuja resposta (ou falha) já chegou: carregando = pedido ≠ período atual
  const [respondido, setRespondido] = useState<Periodo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const cores = useChartColors()
  const carregando = respondido !== periodo

  useEffect(() => {
    let cancelado = false
    getAssessorResumo(periodo)
      .then(r => { if (!cancelado) { setDados(r); setErro(r.erro) } })
      .catch(e => { if (!cancelado) setErro((e as Error).message) })
      .finally(() => { if (!cancelado) setRespondido(periodo) })
    return () => { cancelado = true }
  }, [periodo])

  const barras = dados?.barras ?? []
  const lotes = barras.reduce((s, b) => s + b.lotes_operados, 0)
  const zerados = barras.reduce((s, b) => s + b.lotes_zerados, 0)
  const clientes = barras.reduce((s, b) => s + b.num_clientes, 0)
  const pregoes = barras.reduce((s, b) => Math.max(s, b.num_dias), 0)
  const pararam = (dados?.movimento ?? []).filter(m => m.tipo === 'parou')
  const novos = (dados?.movimento ?? []).filter(m => m.tipo !== 'parou')
  const semBarras = !!dados && dados.disponivel && barras.length === 0
  const evolucao = (dados?.evolucao ?? []).map((r, i, arr) => ({
    mes: labelMesCurto(r.mes_data) + (i === arr.length - 1 ? '*' : ''),
    Operados: r.lotes_operados, Zerados: r.lotes_zerados, Clientes: r.num_clientes,
  }))

  return (
    <>
      <PageHeader
        eyebrow="Visão geral"
        title={`${saudacao}, ${nome}`}
        description={dados?.range.inicio
          ? `Lotes das suas barras de ${fmtDataPt(dados.range.inicio)} a ${fmtDataPt(dados.range.fim)}, comparados ao período anterior de mesma duração.`
          : 'Lotes das suas barras.'}
        actions={
          <div className="seg">
            {PERIODOS.map(p => (
              <button key={p.id} type="button" data-active={periodo === p.id} disabled={carregando} onClick={() => setPeriodo(p.id)}>{p.label}</button>
            ))}
          </div>
        }
      />
      <PageBody>
        {erro && <Alert tone="danger">{erro}</Alert>}
        {dados && !dados.disponivel && (
          <Alert tone="info" title="Visão do assessor ainda não habilitada">
            Peça ao administrador para aplicar o supabase-s16-controle.sql no Supabase.
          </Alert>
        )}
        {semBarras && (
          <Alert tone="info" title="Nenhuma barra ligada ao seu usuário">
            Peça ao administrador para vincular suas barras em Cadastros → Barras (campo &quot;Assessor responsável&quot;).
          </Alert>
        )}

        <KpiRow>
          <KpiCard icon={Activity} tone="accent" label="Lotes operados" loading={carregando && !dados}
            value={fmtNum(lotes)} sub="nas suas barras" />
          <KpiCard icon={TrendingDown} tone="danger" label="Lotes zerados" loading={carregando && !dados}
            value={fmtNum(zerados)} sub={lotes > 0 ? `${((zerados / lotes) * 100).toFixed(1)}% do operado` : undefined} />
          <KpiCard icon={Users} tone="violet" label="Clientes ativos" loading={carregando && !dados}
            value={fmtNum(clientes)} sub="operaram no período" />
          <KpiCard icon={Calendar} tone="info" label="Pregões" loading={carregando && !dados}
            value={fmtNum(pregoes)} sub="dias com operação" />
        </KpiRow>

        <Panel flush title="Minhas barras" subtitle="Lotes, clientes e pregões de cada barra no período.">
          {barras.length === 0
            ? <div className="p-5"><Empty loading={carregando && !dados}>Sem lotes no período.</Empty></div>
            : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Barra</th>
                      <th className="num">Lotes op.</th>
                      <th className="num">Lotes ze.</th>
                      <th className="num">% zer.</th>
                      <th className="num">Clientes</th>
                      <th className="num">Pregões</th>
                    </tr>
                  </thead>
                  <tbody>
                    {barras.map(b => (
                      <tr key={`${b.corretora}|${b.barra_nome}`}>
                        <td><span className="inline-flex items-center gap-2 font-medium">{b.barra_nome}<CorretoraBadge corretora={b.corretora} /></span></td>
                        <td className="num font-semibold">{fmtNum(b.lotes_operados)}</td>
                        <td className="num muted">{fmtNum(b.lotes_zerados)}</td>
                        <td className="num">{b.lotes_operados > 0 ? `${((b.lotes_zerados / b.lotes_operados) * 100).toFixed(1)}%` : '—'}</td>
                        <td className="num">{fmtNum(b.num_clientes)}</td>
                        <td className="num muted">{fmtNum(b.num_dias)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Panel>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Panel title="Evolução mensal" subtitle="Lotes operados e zerados por mês nas suas barras + clientes ativos (linha). * = mês em andamento.">
            {carregando && !dados
              ? <ChartSkeleton height={260} />
              : evolucao.length === 0
                ? <Empty>Sem histórico.</Empty>
                : (
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={evolucao} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke={cores.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11, fill: cores.axis }} axisLine={{ stroke: cores.grid }} tickLine={false} />
                      <YAxis yAxisId="lotes" tick={{ fontSize: 11, fill: cores.axis }} tickFormatter={fmtNum} axisLine={false} tickLine={false} width={48} />
                      <YAxis yAxisId="clientes" orientation="right" tick={{ fontSize: 11, fill: cores.clientes }} tickFormatter={fmtNum} axisLine={false} tickLine={false} width={40} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: cores.grid }} />
                      <Legend wrapperStyle={{ fontSize: 12, color: cores.text }} iconType="circle" />
                      <Bar yAxisId="lotes" dataKey="Operados" fill={cores.operados} radius={[3, 3, 0, 0]} />
                      <Bar yAxisId="lotes" dataKey="Zerados" fill={cores.zerados} radius={[3, 3, 0, 0]} />
                      <Line yAxisId="clientes" type="monotone" dataKey="Clientes" stroke={cores.clientes} strokeWidth={2} dot={{ r: 2, fill: cores.clientes, strokeWidth: 0 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
          </Panel>

          <Panel flush title="Top clientes" subtitle="Quem mais girou nas suas barras no período.">
            {(dados?.topClientes ?? []).length === 0
              ? <div className="p-5"><Empty loading={carregando && !dados} /></div>
              : (
                <div className="overflow-x-auto">
                  <table className="tbl">
                    <thead>
                      <tr><th className="w-10">#</th><th>Cliente</th><th>Barra</th><th className="num">Lotes op.</th><th className="num">% zer.</th></tr>
                    </thead>
                    <tbody>
                      {dados!.topClientes.map((c, i) => (
                        <tr key={`${c.conta ?? c.cliente_nome}-${i}`}>
                          <td className="subtle font-semibold tabular-nums">{i + 1}</td>
                          <td>
                            <p className="max-w-[220px] truncate font-medium">{c.cliente_nome}</p>
                            {c.conta && <p className="text-[10.5px] tabular-nums text-fg-subtle">conta {c.conta}</p>}
                          </td>
                          <td className="muted max-w-[160px] truncate">{c.barra_nome}</td>
                          <td className="num font-medium">{fmtNum(c.lotes_operados)}</td>
                          <td className="num muted">{c.lotes_operados > 0 ? `${((c.lotes_zerados / c.lotes_operados) * 100).toFixed(1)}%` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Panel flush icon={UserMinus} title="Clientes que pararam de operar"
            subtitle="Operaram no período anterior e não apareceram neste. Vale uma ligação.">
            {pararam.length === 0
              ? <div className="p-5"><Empty loading={carregando && !dados}>Ninguém parou no período.</Empty></div>
              : <ListaMovimento rows={pararam} modo="parou" />}
          </Panel>
          <Panel flush icon={UserPlus} title="Novos e que voltaram"
            subtitle="Primeira operação no período, ou clientes que estavam parados e voltaram.">
            {novos.length === 0
              ? <div className="p-5"><Empty loading={carregando && !dados}>Nenhum cliente novo no período.</Empty></div>
              : <ListaMovimento rows={novos} modo="novo" />}
          </Panel>
        </div>
      </PageBody>
    </>
  )
}

function ListaMovimento({ rows, modo }: { rows: AssessorResumo['movimento']; modo: 'parou' | 'novo' }) {
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Barra</th>
            <th className="num">{modo === 'parou' ? 'Lotes no anterior' : 'Lotes no período'}</th>
            <th className="num">{modo === 'parou' ? 'Última operação' : 'Situação'}</th>
            {modo === 'parou' && <th className="num">Dias parado</th>}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 60).map(m => (
            <tr key={`${m.cliente_key}-${m.corretora}`}>
              <td>
                <p className="max-w-[220px] truncate font-medium">{m.cliente_nome}</p>
                {m.conta && <p className="text-[10.5px] tabular-nums text-fg-subtle">conta {m.conta}</p>}
              </td>
              <td className="muted max-w-[160px] truncate">{m.barra_nome}</td>
              <td className="num font-semibold">{fmtNum(modo === 'parou' ? m.lotes_anterior : m.lotes_atual)}</td>
              {modo === 'parou'
                ? <>
                    <td className="num muted">{fmtDataPt(m.ultima_operacao)}</td>
                    <td className={cn('num font-semibold', (m.dias_sem_operar ?? 0) >= 30 ? 'text-danger' : 'text-warning')}>{m.dias_sem_operar ?? '—'}</td>
                  </>
                : <td className="num muted">{m.tipo === 'novo' ? 'novo' : 'voltou'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
