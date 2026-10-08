export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Check, Info, MessageCircle } from 'lucide-react'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { assessoresPorCorretora, clienteContexto, clienteFicha, responsaveisAtivos } from '@/lib/gestao/consultas'
import { getProfile } from '@/lib/auth/getProfile'
import { janelaMeses, mesCurto, mesLongo } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { MesPicker } from '@/components/gestao/Filtros'
import { CelulaCalor, LinhaVazia, SituacaoBadge, StatusBadge, TRACO, dataCurta, dataPt, n0, n2, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { temListaPropria } from '@/lib/corretoras'
import { BuscaCliente } from '../BuscaCliente'
import { ExcluirClienteButton } from '../ExcluirClienteButton'
import { FichaEditavel } from './FichaEditavel'
import { TarifasCliente } from './TarifasCliente'

// Link de WhatsApp a partir do telefone do cadastro (55 + DDD + número)
function linkWhatsApp(telefone: string | null): string | null {
  if (!telefone) return null
  const d = telefone.replace(/\D/g, '')
  if (d.length < 10) return null
  return `https://wa.me/${d.startsWith('55') && d.length >= 12 ? d : `55${d}`}`
}

export default async function ConsultaClientePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { id } = await params
  if (!id) notFound()
  const { corretora, mesRef, base } = ctx
  const [profile, ficha, contexto360, responsaveis, assessoresTodos] = await Promise.all([getProfile(), clienteFicha(corretora, id, mesRef), clienteContexto(corretora, id, mesRef), responsaveisAtivos(), assessoresPorCorretora()])
  const { resumo, cadastro, contas, mensal, tarifas, extrato, porAtivo } = ficha
  if (!cadastro) notFound()
  const admin = profile?.role === 'admin'
  const meses = janelaMeses(mesRef, 12)
  const mensalPorMes = new Map(mensal.map(m => [m.mes_ref, m]))
  const colMes = (i: number) => (i < meses.length - 4 ? 'col-p2' : '')

  // Posição do cliente entre os demais (lotes 12m) e comparações do mês, calculadas no banco
  const posicao = contexto360.posicao
  const receitaTotalMes = contexto360.receita_total_mes
  const mediaAtivos = contexto360.media_lotes_ativos
  const assessoresContas = new Set(contas.map(c => c.assessor_nome ?? ''))
  const total12 = mensal.reduce((a, m) => ({ lotes: a.lotes + m.lotes, zerados: a.zerados + m.zerados, receita: a.receita + m.receita, pontos: a.pontos + m.pontos }), { lotes: 0, zerados: 0, receita: 0, pontos: 0 })
  const maxMes = Math.max(0, ...mensal.map(m => m.lotes))
  const totalAtivo = porAtivo.reduce((s, a) => s + a.lotes, 0)
  const iniciais = cadastro.nome.trim().split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  const whatsapp = linkWhatsApp(cadastro.telefone)
  const grafico = meses.map(m => { const x = mensalPorMes.get(m); return { label: mesCurto(m), lotes: x?.lotes ?? 0, receita: x?.receita ?? 0 } })

  const alertas: { estado: 'ok' | 'info' | 'warn'; texto: string }[] = [
    { estado: cadastro.documento ? 'ok' : 'warn', texto: cadastro.documento ? 'CPF/CNPJ cadastrado' : 'Sem CPF/CNPJ no cadastro' },
    { estado: cadastro.telefone ? 'ok' : 'warn', texto: cadastro.telefone ? 'Telefone cadastrado' : 'Sem telefone' },
    { estado: resumo?.status === 'Migrado' && !resumo.data_migracao ? 'warn' : 'ok', texto: resumo?.status === 'Migrado' && !resumo.data_migracao ? 'Migrado sem data de migração' : 'Datas consistentes' },
    { estado: resumo?.data_entrada ? 'ok' : 'info', texto: resumo?.data_entrada ? 'Data de entrada preenchida' : 'Sem data de entrada (campo manual)' },
    { estado: resumo?.grupo_corretagem === 'Vinculado' ? 'ok' : resumo?.grupo_corretagem ? 'warn' : 'info',
      texto: resumo?.grupo_corretagem === 'Vinculado' ? 'Vinculado ao grupo de corretagem'
        : resumo?.grupo_corretagem === 'Bloqueado' ? 'Grupo de corretagem bloqueado pelo banco: pedir o desbloqueio'
        : resumo?.grupo_corretagem === 'Não vinculado' ? 'Fora do grupo de corretagem' : 'Grupo de corretagem não informado (campo manual)' },
    ...(assessoresContas.size > 1 ? [{ estado: 'info' as const, texto: `Contas com assessores diferentes: ${[...assessoresContas].filter(Boolean).join(', ')}` }] : []),
    ...(contas.length > 1 ? [{ estado: 'info' as const, texto: `${contas.length} contas · a ficha usa a principal; lotes e receita somam todas` }] : []),
    ...(resumo?.alertas.filter(a => !/^\d+ contas$/.test(a) && a !== 'sem CPF/CNPJ' && a !== 'sem telefone' && a !== 'sem data de entrada' && a !== 'migrado sem data' && a !== 'fora do grupo de corretagem' && a !== 'grupo de corretagem bloqueado').map(a => ({ estado: 'warn' as const, texto: a[0].toUpperCase() + a.slice(1) })) ?? []),
  ]
  const ICONE = { ok: Check, info: Info, warn: AlertTriangle } as const
  const COR = { ok: 'text-gain', info: 'text-fg-subtle', warn: 'text-warn' } as const
  const pendencias = alertas.filter(a => a.estado === 'warn').length

  const linhaTempo = [
    { rotulo: 'Entrada', data: resumo?.data_entrada ?? null, nota: resumo?.parceiro ? `parceiro ${resumo.parceiro}` : 'direto' },
    { rotulo: 'Migração', data: resumo?.data_migracao ?? null, nota: resumo?.dias_ate_migrar != null ? `${resumo.dias_ate_migrar} dias depois da entrada` : resumo?.status ?? '' },
    { rotulo: 'Último giro', data: resumo?.ultimo_giro ?? null, nota: resumo?.meses_sem_giro ? `${resumo.meses_sem_giro} ${resumo.meses_sem_giro === 1 ? 'mês' : 'meses'} sem giro` : resumo?.ultimo_giro ? 'girou no mês de referência' : 'nunca girou' },
  ]

  return (
    <>
      <PageHeader
        eyebrow={`${ctx.eyebrow} · Consulta`}
        title={<Link href={`${base}/clientes`} className="inline-flex items-center gap-2 text-fg hover:text-accent"><ArrowLeft className="h-5 w-5" aria-hidden />Cliente</Link>}
        actions={<><BuscaCliente corretora={corretora} base={base} /><MesPicker valor={mesRef} /></>}
      />
      <PageBody>
        {/* Identidade e linha do tempo */}
        <section className="panel p-5 md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-section font-semibold text-accent" aria-hidden>{iniciais}</div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-title font-semibold tracking-tight text-fg">{cadastro.nome}</h2>
                  {resumo && <StatusBadge status={resumo.status} />}
                  {resumo && <SituacaoBadge situacao={resumo.situacao} mesesSemGiro={resumo.meses_sem_giro} />}
                </div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-dense sm:grid-cols-[auto_1fr_auto_1fr]">
                  <dt className="text-fg-subtle">CPF/CNPJ</dt><dd className="tabular-nums">{cadastro.documento ?? TRACO}</dd>
                  <dt className="text-fg-subtle">Telefone</dt><dd className="tabular-nums">{cadastro.telefone ?? TRACO}</dd>
                  <dt className="text-fg-subtle">E-mail</dt><dd className="truncate">{cadastro.email ?? TRACO}</dd>
                  <dt className="text-fg-subtle">Conta</dt><dd className="tabular-nums">{resumo?.conta_principal ?? TRACO}{contas.length > 1 ? <span className="text-fg-subtle"> +{contas.length - 1}</span> : ''}</dd>
                  <dt className="text-fg-subtle">Assessor</dt><dd className="truncate">{resumo?.assessor_nome ?? TRACO}</dd>
                  <dt className="text-fg-subtle">Responsável</dt><dd>{resumo?.responsavel ?? TRACO}</dd>
                </dl>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className={buttonClasses('secondary', 'sm')}><MessageCircle className="h-4 w-4" aria-hidden />WhatsApp</a>}
              <FichaEditavel
                corretora={corretora} clienteId={id} admin={admin} cadastro={cadastro}
                manuais={{ data_entrada: resumo?.data_entrada ?? null, parceiro: resumo?.parceiro ?? null, observacoes: resumo?.observacoes ?? null, motivo_recusa: resumo?.motivo_recusa ?? null, grupo_corretagem: resumo?.grupo_corretagem ?? null }}
                manual={ficha.manual}
                responsaveis={responsaveis.filter(r => r.atende_clientes).map(r => r.nome)}
                assessores={assessoresTodos[corretora]}
                statusAutomatico={ficha.manual.status ? null : (resumo?.status ?? null)}
                temConta={(resumo?.n_contas ?? 0) > 0}
                contas={contas.filter(x => (x.status as string) !== 'Não cadastrada').map(x => ({ id: x.conta_id, conta: x.conta }))}
                abrirInicial={ctx.q.editar === '1'}
              />
              {temListaPropria(corretora) && admin && <ExcluirClienteButton corretora={corretora} clienteId={id} nome={cadastro.nome} base={base} variante="botao" />}
            </div>
          </div>

          <ol className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-3">
            {linhaTempo.map(p => (
              <li key={p.rotulo} className="relative pl-4">
                <span className={cn('absolute left-0 top-1.5 h-2 w-2 rounded-full', p.data ? 'bg-accent' : 'bg-line-strong')} aria-hidden />
                <p className="label">{p.rotulo}</p>
                <p className={cn('mt-0.5 text-section font-semibold tabular-nums', !p.data && 'text-fg-subtle')}>{p.data ? dataPt(p.data) : TRACO}</p>
                <p className="text-micro text-fg-muted">{p.nota}</p>
              </li>
            ))}
          </ol>
        </section>

        <KpiRow cols={6}>
          <KpiCard label={`Lotes em ${mesCurto(mesRef)}`} value={n0(resumo?.lotes_mes)} sub={`${n0(resumo?.zerados_mes)} zerados${mediaAtivos && resumo?.lotes_mes ? ` · ${(resumo.lotes_mes / mediaAtivos).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× a média dos ativos` : ''}`} />
          <KpiCard label={`Receita em ${mesCurto(mesRef)}`} value={rCurto(resumo?.receita_mes)} sub={receitaTotalMes && resumo?.receita_mes ? `${fmtPct((resumo.receita_mes / receitaTotalMes) * 100)} da receita do mês` : undefined} />
          <KpiCard destaque label="Lotes 12 meses" value={n0(resumo?.lotes_12m)} sub={posicao != null ? `${posicao}º de ${fmtNum(contexto360.com_giro)} clientes` : 'sem giro na janela'} />
          <KpiCard label="Receita 12 meses" value={rCurto(resumo?.receita_12m)} sub={`${n0(total12.pontos)} pontos de incentivo`} />
          <KpiCard label="Lotes no histórico" value={n0(resumo?.lotes_total)} sub={`${n0(total12.zerados)} zerados em 12 m`} />
          <KpiCard label="Tarifa vigente" value={resumo ? `${n2(resumo.tarifa)} R$/lote` : TRACO} sub={tarifas.length ? 'tarifa própria do cliente' : 'tarifa do assessor'} />
        </KpiRow>

        <div className="grid gap-8 xl:grid-cols-3">
          <div className="min-w-0 space-y-8 xl:col-span-2">
            <Panel title="Giro mensal" subtitle={`Lotes operados e receita de ${mesCurto(meses[0])} a ${mesCurto(mesRef)}.`}>
              <GraficoSeries
                dados={grafico}
                series={[{ key: 'lotes', nome: 'Lotes operados', tipo: 'bar' }, { key: 'receita', nome: 'Receita', tipo: 'line', eixo: 'dir', formato: 'brl' }]}
                formatoDir="brl"
                altura={220}
              />
              <div className="tbl-wrap mt-4">
                <table className="tbl tbl-dense">
                  <thead>
                    <tr><th className="sticky-col">Indicador</th>{meses.map((m, i) => <th key={m} className={cn('num', colMes(i), m === mesRef && 'text-fg')}>{mesCurto(m)}</th>)}<th className="num">12 m</th></tr>
                  </thead>
                  <tbody>
                    <tr><td className="sticky-col font-semibold">Lotes operados</td>{meses.map((m, i) => <CelulaCalor key={m} valor={mensalPorMes.get(m)?.lotes ?? 0} max={maxMes} className={colMes(i)} />)}<td className="num font-semibold">{n0(total12.lotes)}</td></tr>
                    <tr><td className="sticky-col">Lotes zerados</td>{meses.map((m, i) => <td key={m} className={cn('num', colMes(i), !mensalPorMes.get(m)?.zerados && 'subtle')}>{n0(mensalPorMes.get(m)?.zerados)}</td>)}<td className="num font-semibold">{n0(total12.zerados)}</td></tr>
                    <tr><td className="sticky-col">Receita</td>{meses.map((m, i) => <td key={m} className={cn('num', colMes(i), !mensalPorMes.get(m)?.receita && 'subtle')}>{rCurto(mensalPorMes.get(m)?.receita)}</td>)}<td className="num font-semibold">{rCurto(total12.receita)}</td></tr>
                    <tr><td className="sticky-col">Pontos</td>{meses.map((m, i) => <td key={m} className={cn('num', colMes(i), !mensalPorMes.get(m)?.pontos && 'subtle')}>{n0(mensalPorMes.get(m)?.pontos)}</td>)}<td className="num font-semibold">{n0(total12.pontos)}</td></tr>
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title={`Contas · ${contas.length}`} subtitle="A conta principal representa o cliente nas contagens; lotes e receita somam todas.">
              <div className="tbl-wrap">
                <table className="tbl tbl-dense">
                  <thead>
                    <tr>
                      <th>Conta</th><th className="col-p2">Situação</th><th>Status</th><th className="col-p2">Migração</th><th className="col-p3">Assessor</th>
                      <th className="num">Lotes</th><th className="num col-p2">Lotes 12 m</th><th className="num col-p2">Receita</th><th className="col-p3">Último giro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contas.length === 0 && <LinhaVazia colunas={9}>Nenhuma conta nesta corretora.</LinhaVazia>}
                    {contas.map(c => (
                      <tr key={c.conta_id ?? `lotes:${c.conta}`}>
                        <td className="num font-medium">{c.conta}{c.conta_digito && <span className="ml-1 text-micro text-fg-subtle">{c.conta_digito}</span>}{c.principal && <span className="ml-1.5 text-micro text-accent">principal</span>}</td>
                        <td className="muted col-p2">{c.situacao_conta ?? TRACO}</td>
                        <td>{c.conta_id ? <StatusBadge status={c.status} /> : <span title="Conta que só aparece nos lotes; ligada ao cliente pelo nome ou ID"><Badge variant="warn">só nos lotes</Badge></span>}</td>
                        <td className="num col-p2">{dataPt(c.data_habilitacao)}</td>
                        <td className="max-w-[160px] truncate muted col-p3">{c.assessor_nome ?? TRACO}</td>
                        <td className={cn('num', !c.lotes && 'subtle')}>{n0(c.lotes)}</td>
                        <td className={cn('num col-p2', !c.lotes_12m && 'subtle')}>{n0(c.lotes_12m)}</td>
                        <td className={cn('num col-p2', !c.receita && 'subtle')}>{r0(c.receita)}</td>
                        <td className="num col-p3">{dataPt(c.ultimo_giro)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="Extrato de lotes" subtitle={`Lançamentos mais recentes (até 400) · ${mesLongo(mesRef)} em destaque.`}>
              <div className="tbl-wrap max-h-[520px]">
                <table className="tbl tbl-dense">
                  <thead>
                    <tr><th>Data</th><th className="col-p3">Conta</th><th>Ativo</th><th className="col-p2">Plataforma</th><th className="col-p3">Modo</th><th className="num">Operados</th><th className="num col-p2">Zerados</th><th className="num col-p3">Tarifa</th><th className="num">Receita</th></tr>
                  </thead>
                  <tbody>
                    {extrato.length === 0 && <LinhaVazia colunas={9}>Sem lançamentos.</LinhaVazia>}
                    {extrato.map(l => (
                      <tr key={l.id} className={cn(!l.data.startsWith(mesRef.slice(0, 7)) && 'text-fg-muted')}>
                        <td className="num">{dataCurta(l.data)}</td><td className="num muted col-p3">{l.conta ?? TRACO}</td><td className="font-medium">{l.ativo ?? TRACO}</td>
                        <td className="muted col-p2">{l.plataforma ?? TRACO}</td><td className="muted col-p3">{l.modo ?? TRACO}</td>
                        <td className={cn('num', !l.lotes_operados && 'subtle')}>{n0(l.lotes_operados)}</td><td className={cn('num col-p2', !l.lotes_zerados && 'subtle')}>{n0(l.lotes_zerados)}</td>
                        <td className="num col-p3">{n2(l.tarifa)}</td><td className="num">{r0(l.receita_corretagem + l.receita_zeragem)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div className="min-w-0 space-y-5">
            <Panel variant="card" title="Pendências" subtitle={pendencias ? `${pendencias} ${pendencias === 1 ? 'item' : 'itens'} para resolver` : 'Cadastro completo'}>
              <ul className="space-y-2 text-dense">
                {alertas.map((a, i) => {
                  const Icone = ICONE[a.estado]
                  return (
                    <li key={i} className="flex items-start gap-2">
                      <Icone className={cn('mt-0.5 h-4 w-4 shrink-0', COR[a.estado])} aria-hidden />
                      <span className={a.estado === 'warn' ? 'text-fg' : 'text-fg-muted'}>{a.texto}</span>
                    </li>
                  )
                })}
              </ul>
            </Panel>

            <TarifasCliente corretora={corretora} clienteId={id} tarifas={tarifas} admin={admin} tarifaAtual={resumo?.tarifa ?? 0} />

            <Panel variant="card" title="Por ativo" subtitle="Todo o histórico · participação nos lotes.">
              {porAtivo.length === 0 ? (
                <p className="text-dense text-fg-subtle">Sem lançamentos.</p>
              ) : (
                <ul className="space-y-2.5">
                  {porAtivo.slice(0, 8).map(a => (
                    <li key={a.ativo}>
                      <div className="flex items-baseline justify-between gap-3 text-dense">
                        <span className="font-medium">{a.ativo}</span>
                        <span className="tabular-nums text-fg-muted">{n0(a.lotes)} · {totalAtivo ? fmtPct((a.lotes / totalAtivo) * 100, 0) : TRACO}</span>
                      </div>
                      <div className="bar-track mt-1 h-1.5" aria-hidden><div className="bar-fill" style={{ width: `${totalAtivo ? (a.lotes / totalAtivo) * 100 : 0}%`, opacity: 0.7 }} /></div>
                    </li>
                  ))}
                  {porAtivo.length > 8 && <li className="text-micro text-fg-subtle">+ {porAtivo.length - 8} ativos com menos lotes</li>}
                </ul>
              )}
            </Panel>

            <Panel variant="card" title="Cadastro" subtitle="Dados do export da corretora.">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-dense">
                <dt className="text-fg-subtle">Tipo</dt><dd>{cadastro.tipo_pessoa ?? TRACO}</dd>
                <dt className="text-fg-subtle">Perfil</dt><dd>{cadastro.perfil ?? TRACO}{cadastro.perfil_suitability ? ` · ${cadastro.perfil_suitability}` : ''}</dd>
                <dt className="text-fg-subtle">UF</dt><dd>{cadastro.uf ?? TRACO}</dd>
                <dt className="text-fg-subtle">Profissão</dt><dd>{cadastro.profissao ?? TRACO}</dd>
                <dt className="text-fg-subtle">Nascimento</dt><dd className="tabular-nums">{dataPt(cadastro.dt_nascimento)}</dd>
                <dt className="text-fg-subtle">Rendimentos</dt><dd className="tabular-nums">{cadastro.rendimentos != null ? rCurto(cadastro.rendimentos) : TRACO}</dd>
                <dt className="text-fg-subtle">Patrimônio</dt><dd className="tabular-nums">{cadastro.patrimonio != null ? rCurto(cadastro.patrimonio) : TRACO}</dd>
                <dt className="text-fg-subtle">Parceiro</dt><dd>{resumo?.parceiro ?? 'Direto'}</dd>
                <dt className="text-fg-subtle">Grupo de corretagem</dt><dd className={resumo?.grupo_corretagem === 'Bloqueado' ? 'text-loss' : resumo?.grupo_corretagem === 'Não vinculado' ? 'text-warn' : undefined}>{resumo?.grupo_corretagem ?? 'Não informado'}</dd>
              </dl>
              {(resumo?.observacoes || resumo?.motivo_recusa) && (
                <div className="mt-4 space-y-2 border-t border-line pt-3 text-dense">
                  {resumo?.observacoes && <p><span className="text-fg-subtle">Observações · </span><span className="whitespace-pre-wrap">{resumo.observacoes}</span></p>}
                  {resumo?.motivo_recusa && <p><span className="text-fg-subtle">Motivo da recusa · </span>{resumo.motivo_recusa}</p>}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </PageBody>
    </>
  )
}
