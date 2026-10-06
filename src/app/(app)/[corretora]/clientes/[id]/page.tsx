export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, Check, Info } from 'lucide-react'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { clienteFicha, clientesLista } from '@/lib/gestao/consultas'
import { getProfile } from '@/lib/auth/getProfile'
import { janelaMeses, mesCurto, mesLongo } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { MesPicker } from '@/components/gestao/Filtros'
import { BarraCelula, CelulaCalor, LinhaVazia, SituacaoBadge, StatusBadge, TRACO, dataPt, n0, n2, r0, rCurto } from '@/components/gestao/Celulas'
import { BuscaCliente } from '../BuscaCliente'
import { FichaEditavel } from './FichaEditavel'
import { TarifasCliente } from './TarifasCliente'

export default async function ConsultaClientePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { id } = await params
  if (!id) notFound()
  const { corretora, mesRef, base } = ctx
  const [profile, ficha, todos] = await Promise.all([getProfile(), clienteFicha(corretora, id, mesRef), clientesLista(corretora, mesRef)])
  const { resumo, cadastro, contas, mensal, tarifas, extrato, porAtivo } = ficha
  if (!cadastro) notFound()
  const admin = profile?.role === 'admin'
  const meses = janelaMeses(mesRef, 12)
  const mensalPorMes = new Map(mensal.map(m => [m.mes_ref, m]))
  const colMes = (i: number) => (i < meses.length - 4 ? 'col-p2' : '')

  // Posição do cliente entre os demais (lotes 12m) e comparações do mês
  const ordenados = todos.filter(c => c.lotes_12m > 0)
  const posicao = ordenados.findIndex(c => c.cliente_id === id)
  const receitaTotalMes = todos.reduce((s, c) => s + c.receita_mes, 0)
  const ativos = todos.filter(c => c.lotes_mes > 0)
  const mediaAtivos = ativos.length ? ativos.reduce((s, c) => s + c.lotes_mes, 0) / ativos.length : 0
  const assessoresContas = new Set(contas.map(c => c.assessor_nome ?? ''))
  const total12 = mensal.reduce((a, m) => ({ lotes: a.lotes + m.lotes, zerados: a.zerados + m.zerados, receita: a.receita + m.receita, pontos: a.pontos + m.pontos }), { lotes: 0, zerados: 0, receita: 0, pontos: 0 })
  const maxMes = Math.max(0, ...mensal.map(m => m.lotes))
  const totalAtivo = porAtivo.reduce((s, a) => s + a.lotes, 0)

  const alertas: { estado: 'ok' | 'info' | 'warn'; texto: string }[] = [
    { estado: cadastro.documento ? 'ok' : 'warn', texto: cadastro.documento ? 'CPF/CNPJ cadastrado' : 'Sem CPF/CNPJ no cadastro' },
    { estado: cadastro.telefone ? 'ok' : 'warn', texto: cadastro.telefone ? 'Telefone cadastrado' : 'Sem telefone' },
    { estado: assessoresContas.size > 1 ? 'info' : 'ok', texto: assessoresContas.size > 1 ? `Contas com assessores diferentes (${[...assessoresContas].filter(Boolean).join(', ')})` : 'Mesmo assessor em todas as contas' },
    { estado: resumo?.status === 'Migrado' && !resumo.data_migracao ? 'warn' : 'ok', texto: resumo?.status === 'Migrado' && !resumo.data_migracao ? 'Migrado sem data de migração' : 'Datas consistentes' },
    { estado: resumo?.situacao === 'Ativo' ? 'ok' : 'info', texto: `Cliente ${resumo?.situacao?.toLowerCase() ?? 'sem contas'}` },
    { estado: contas.length > 1 ? 'info' : 'ok', texto: contas.length > 1 ? `${contas.length} contas vinculadas · a ficha usa a conta principal; o giro soma todas` : 'Uma conta' },
    { estado: resumo?.data_entrada ? 'ok' : 'info', texto: resumo?.data_entrada ? 'Data de entrada preenchida' : 'Sem data de entrada (campo manual)' },
  ]
  const ICONE = { ok: Check, info: Info, warn: AlertTriangle } as const
  const COR = { ok: 'text-gain', info: 'text-fg-subtle', warn: 'text-warn' } as const

  return (
    <>
      <PageHeader
        eyebrow={`${ctx.eyebrow} · Consulta`}
        title={cadastro.nome}
        description={<>{cadastro.documento ?? 'sem CPF/CNPJ'} · {cadastro.telefone ?? 'sem telefone'} · {cadastro.email ?? 'sem e-mail'} · <Link href={`${base}/clientes`} className="link">voltar à lista</Link></>}
        actions={<><BuscaCliente corretora={corretora} base={base} /><MesPicker valor={mesRef} /></>}
      />
      <PageBody>
        <KpiRow cols={6}>
          <KpiCard label="Responsável" value={resumo?.responsavel ?? TRACO} sub={resumo?.assessor_nome ?? 'sem assessor'} />
          <KpiCard label="Parceiro" value={resumo?.parceiro ?? 'Direto'} sub={resumo?.data_entrada ? `entrou em ${dataPt(resumo.data_entrada)}` : 'sem data de entrada'} />
          <KpiCard label="Situação" value={resumo ? <SituacaoBadge situacao={resumo.situacao} mesesSemGiro={resumo.meses_sem_giro} /> : TRACO} sub={resumo ? <StatusBadge status={resumo.status} /> : undefined} />
          <KpiCard label={`Lotes em ${mesCurto(mesRef)}`} value={n0(resumo?.lotes_mes)} sub={`${n0(resumo?.zerados_mes)} zerados`} />
          <KpiCard label={`Receita em ${mesCurto(mesRef)}`} value={rCurto(resumo?.receita_mes)} sub={receitaTotalMes ? `${fmtPct(((resumo?.receita_mes ?? 0) / receitaTotalMes) * 100)} da receita do mês` : undefined} />
          <KpiCard label="Lotes 12 meses" value={n0(resumo?.lotes_12m)} sub={posicao >= 0 ? `${posicao + 1}º de ${fmtNum(ordenados.length)} · ${rCurto(resumo?.receita_12m)}` : 'sem giro na janela'} />
        </KpiRow>

        <div className="grid gap-5 xl:grid-cols-3">
          <Panel variant="card" title="Ficha cadastral" subtitle="Dados do export; os campos manuais podem ser editados."
            action={<FichaEditavel corretora={corretora} clienteId={id} admin={admin} cadastro={cadastro} manuais={{ data_entrada: resumo?.data_entrada ?? null, parceiro: resumo?.parceiro ?? null, observacoes: resumo?.observacoes ?? null, motivo_recusa: resumo?.motivo_recusa ?? null }} />}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-dense">
              <dt className="text-fg-muted">Cliente</dt><dd className="font-medium">{cadastro.nome}</dd>
              <dt className="text-fg-muted">CPF/CNPJ</dt><dd className="tabular-nums">{cadastro.documento ?? TRACO}</dd>
              <dt className="text-fg-muted">Telefone</dt><dd className="tabular-nums">{cadastro.telefone ?? TRACO}</dd>
              <dt className="text-fg-muted">E-mail</dt><dd className="truncate">{cadastro.email ?? TRACO}</dd>
              <dt className="text-fg-muted">Status</dt><dd>{resumo ? <StatusBadge status={resumo.status} /> : TRACO}</dd>
              <dt className="text-fg-muted">Responsável</dt><dd>{resumo?.responsavel ?? TRACO}</dd>
              <dt className="text-fg-muted">Parceiro</dt><dd>{resumo?.parceiro ?? 'Direto'}</dd>
              <dt className="text-fg-muted">Corretagem (R$/lote)</dt><dd className="tabular-nums">{resumo ? n2(resumo.tarifa) : TRACO}</dd>
              <dt className="text-fg-muted">Data de entrada</dt><dd className="tabular-nums">{dataPt(resumo?.data_entrada)}</dd>
              <dt className="text-fg-muted">Data de migração</dt><dd className="tabular-nums">{dataPt(resumo?.data_migracao)}</dd>
              <dt className="text-fg-muted">Dias até migrar</dt><dd className="tabular-nums">{resumo?.dias_ate_migrar ?? TRACO}</dd>
              <dt className="text-fg-muted">Contas {ctx.label}</dt><dd className="tabular-nums">{contas.map(c => c.conta).join(' · ') || TRACO}</dd>
              <dt className="text-fg-muted">Perfil</dt><dd>{cadastro.perfil ?? TRACO}{cadastro.perfil_suitability ? ` · ${cadastro.perfil_suitability}` : ''}</dd>
              <dt className="text-fg-muted">UF / profissão</dt><dd>{cadastro.uf ?? TRACO}{cadastro.profissao ? ` · ${cadastro.profissao}` : ''}</dd>
              <dt className="text-fg-muted">Observações</dt><dd className="whitespace-pre-wrap">{resumo?.observacoes ?? TRACO}</dd>
              <dt className="text-fg-muted">Motivo da recusa</dt><dd>{resumo?.motivo_recusa ?? TRACO}</dd>
            </dl>
          </Panel>

          <Panel variant="card" title="Indicadores" subtitle={`Referência ${mesCurto(mesRef)} · janela de 12 meses`}>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-dense">
              <dt className="text-fg-muted">Lotes no mês</dt><dd className="num font-semibold">{n0(resumo?.lotes_mes)}</dd>
              <dt className="text-fg-muted">Lotes zerados no mês</dt><dd className="num">{n0(resumo?.zerados_mes)}</dd>
              <dt className="text-fg-muted">Receita no mês</dt><dd className="num font-semibold">{r0(resumo?.receita_mes)}</dd>
              <dt className="text-fg-muted">Lotes 12 meses</dt><dd className="num font-semibold">{n0(resumo?.lotes_12m)}</dd>
              <dt className="text-fg-muted">Receita 12 meses</dt><dd className="num">{r0(resumo?.receita_12m)}</dd>
              <dt className="text-fg-muted">Lotes no histórico</dt><dd className="num">{n0(resumo?.lotes_total)}</dd>
              <dt className="text-fg-muted">Último giro</dt><dd className="num">{dataPt(resumo?.ultimo_giro)}</dd>
              <dt className="text-fg-muted">Meses sem giro</dt><dd className="num">{resumo?.meses_sem_giro ?? TRACO}</dd>
              <dt className="text-fg-muted">Ranking por lotes 12 m</dt><dd className="num">{posicao >= 0 ? `${posicao + 1}º de ${fmtNum(ordenados.length)}` : TRACO}</dd>
              <dt className="text-fg-muted">% da receita do mês</dt><dd className="num">{receitaTotalMes && resumo ? fmtPct((resumo.receita_mes / receitaTotalMes) * 100) : TRACO}</dd>
              <dt className="text-fg-muted">Lotes vs média dos ativos</dt><dd className="num">{mediaAtivos && resumo?.lotes_mes ? `${(resumo.lotes_mes / mediaAtivos).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×` : TRACO}</dd>
              <dt className="text-fg-muted">Pontos (incentivo) 12 m</dt><dd className="num">{n0(total12.pontos)}</dd>
            </dl>
          </Panel>

          <div className="space-y-5">
            <Panel variant="card" title="Alertas do cliente">
              <ul className="space-y-2 text-dense">
                {alertas.map((a, i) => {
                  const Icone = ICONE[a.estado]
                  return (
                    <li key={i} className="flex items-start gap-2">
                      <Icone className={cn('mt-0.5 h-4 w-4 shrink-0', COR[a.estado])} aria-hidden />
                      <span className={a.estado === 'warn' ? 'text-warn' : 'text-fg-muted'}>{a.texto}</span>
                    </li>
                  )
                })}
                {resumo?.alertas.map(a => <li key={a} className="flex items-center gap-2"><Badge variant="warn">{a}</Badge></li>)}
              </ul>
            </Panel>
            <TarifasCliente corretora={corretora} clienteId={id} tarifas={tarifas} admin={admin} tarifaAtual={resumo?.tarifa ?? 0} />
          </div>
        </div>

        <Panel title={`Contas · ${contas.length}`} subtitle="A conta principal representa o cliente nas contagens; lotes e receita somam todas.">
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th>Conta</th><th className="col-p3">Com dígito</th><th className="col-p2">Situação</th><th>Status</th><th className="col-p2">Migração</th><th className="col-p2">Assessor</th><th className="col-p3">Filial</th>
                  <th className="num">Lotes</th><th className="num col-p2">Lotes 12 m</th><th className="num col-p3">Zerados</th><th className="num col-p2">Receita</th><th className="col-p3">Último giro</th>
                </tr>
              </thead>
              <tbody>
                {contas.length === 0 && <LinhaVazia colunas={12}>Nenhuma conta nesta corretora.</LinhaVazia>}
                {contas.map(c => (
                  <tr key={c.conta_id ?? `lotes:${c.conta}`} className={c.conta_id ? '' : 'opacity-80'}>
                    <td className="num font-medium">{c.conta}{c.principal && <span className="ml-1.5 text-micro text-accent">principal</span>}</td>
                    <td className="num muted col-p3">{c.conta_digito ?? TRACO}</td>
                    <td className="col-p2">{c.situacao_conta ?? TRACO}</td>
                    <td>{c.conta_id ? <StatusBadge status={c.status} /> : <span title="Conta que só aparece nos lotes; ligada ao cliente pelo nome ou ID"><Badge variant="warn">só nos lotes</Badge></span>}</td>
                    <td className="num col-p2">{dataPt(c.data_habilitacao)}</td><td className="muted col-p2">{c.assessor_nome ?? TRACO}</td><td className="muted col-p3">{c.filial ?? TRACO}</td>
                    <td className="num">{n0(c.lotes)}</td><td className="num col-p2">{n0(c.lotes_12m)}</td><td className="num col-p3">{n0(c.zerados)}</td>
                    <td className="num col-p2">{r0(c.receita)}</td><td className="num col-p3">{dataPt(c.ultimo_giro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Giro mensal" subtitle={`De ${mesCurto(meses[0])} a ${mesCurto(mesRef)}`}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead>
                <tr><th className="sticky-col">Indicador</th>{meses.map((m, i) => <th key={m} className={cn('num', colMes(i), m === mesRef && 'text-fg')}>{mesCurto(m)}</th>)}<th className="num">12 m</th></tr>
              </thead>
              <tbody>
                <tr><td className="sticky-col font-semibold">Lotes operados</td>{meses.map((m, i) => <CelulaCalor key={m} valor={mensalPorMes.get(m)?.lotes ?? 0} max={maxMes} className={colMes(i)} />)}<td className="num font-semibold">{n0(total12.lotes)}</td></tr>
                <tr><td className="sticky-col">Lotes zerados</td>{meses.map((m, i) => <td key={m} className={cn('num', colMes(i), !mensalPorMes.get(m)?.zerados && 'subtle')}>{n0(mensalPorMes.get(m)?.zerados)}</td>)}<td className="num font-semibold">{n0(total12.zerados)}</td></tr>
                <tr><td className="sticky-col">Receita</td>{meses.map((m, i) => <td key={m} className={cn('num', colMes(i), !mensalPorMes.get(m)?.receita && 'subtle')}>{r0(mensalPorMes.get(m)?.receita)}</td>)}<td className="num font-semibold">{r0(total12.receita)}</td></tr>
                <tr><td className="sticky-col">Pontos (incentivo)</td>{meses.map((m, i) => <td key={m} className={cn('num', colMes(i), !mensalPorMes.get(m)?.pontos && 'subtle')}>{n0(mensalPorMes.get(m)?.pontos)}</td>)}<td className="num font-semibold">{n0(total12.pontos)}</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-8 xl:grid-cols-3">
          <Panel className="xl:col-span-2" title="Extrato de lotes" subtitle={`Lançamentos mais recentes (até 400) · ${mesLongo(mesRef)} em destaque`}>
            <div className="tbl-wrap max-h-[520px]">
              <table className="tbl tbl-dense">
                <thead>
                  <tr><th>Data</th><th className="col-p3">Conta</th><th>Ativo</th><th className="col-p2">Plataforma</th><th className="col-p3">Modo</th><th className="num">Operados</th><th className="num col-p2">Zerados</th><th className="num col-p3">Tarifa</th><th className="num">Rec. corretagem</th><th className="num col-p2">Rec. zeragem</th><th className="col-p3">Nome no relatório</th></tr>
                </thead>
                <tbody>
                  {extrato.length === 0 && <LinhaVazia colunas={11}>Sem lançamentos.</LinhaVazia>}
                  {extrato.map(l => (
                    <tr key={l.id} className={l.data.startsWith(mesRef.slice(0, 7)) ? '' : 'text-fg-muted'}>
                      <td className="num">{dataPt(l.data)}</td><td className="num muted col-p3">{l.conta ?? TRACO}</td><td className="font-medium">{l.ativo ?? TRACO}</td>
                      <td className="muted col-p2">{l.plataforma ?? TRACO}</td><td className="muted col-p3">{l.modo ?? TRACO}</td>
                      <td className="num">{n0(l.lotes_operados)}</td><td className={cn('num col-p2', !l.lotes_zerados && 'subtle')}>{n0(l.lotes_zerados)}</td>
                      <td className="num col-p3">{n2(l.tarifa)}</td><td className="num">{r0(l.receita_corretagem)}</td><td className={cn('num col-p2', !l.receita_zeragem && 'subtle')}>{r0(l.receita_zeragem)}</td>
                      <td className="muted col-p3">{l.nome_cliente ?? TRACO}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Por ativo" subtitle="Todo o histórico do cliente.">
            <div className="tbl-wrap max-h-[520px]">
              <table className="tbl tbl-dense">
                <thead><tr><th>Ativo</th><th className="num">Lotes</th><th className="num">% lotes</th><th className="num col-p2">Receita</th></tr></thead>
                <tbody>
                  {porAtivo.length === 0 && <LinhaVazia colunas={4}>Sem lançamentos.</LinhaVazia>}
                  {porAtivo.map(a => (
                    <tr key={a.ativo}>
                      <td className="font-medium">{a.ativo}</td>
                      <td className="num"><BarraCelula valor={a.lotes} max={porAtivo[0]?.lotes ?? 0} largura={56} /></td>
                      <td className="num">{totalAtivo ? fmtPct((a.lotes / totalAtivo) * 100) : TRACO}</td>
                      <td className="num col-p2">{r0(a.receita)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </PageBody>
    </>
  )
}
