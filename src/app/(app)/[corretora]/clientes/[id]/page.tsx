export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Cake, Mail, MessageCircle, Phone } from 'lucide-react'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { assessoresPorCorretora, clienteContatos, clienteContexto, clienteFicha, responsaveisAtivos } from '@/lib/gestao/consultas'
import { clienteNasOutrasCorretoras, leadsDoCliente } from '@/lib/gestao/consultasFicha'
import { diasOperadosNoMes, giroPorDia, proximoAniversario, proximoPasso, quando, type TomPasso } from '@/lib/gestao/fichaCliente'
import { linkTelefone } from '@/lib/gestao/fila'
import { telefoneCurto } from '@/lib/gestao/listaClientes'
import { getProfile } from '@/lib/auth/getProfile'
import { mesAtual, mesCurto, somarDias } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { MesPicker } from '@/components/gestao/Filtros'
import { Abas } from '@/components/gestao/Abas'
import { NivelBadge, RiscoBadge, SituacaoBadge, StatusBadge, TRACO, dataCurta, dataPt, n0 } from '@/components/gestao/Celulas'
import { CORRETORA_LABEL, CORRETORA_SLUG, temListaPropria } from '@/lib/corretoras'
import { BuscaCliente } from '../BuscaCliente'
import { ExcluirClienteButton } from '../ExcluirClienteButton'
import { FichaEditavel } from './FichaEditavel'
import { Copiar } from './Copiar'
import { AbaResumo } from './AbaResumo'
import { AbaGiro } from './AbaGiro'
import { AbaContas } from './AbaContas'
import { AbaCadastro } from './AbaCadastro'
import { pendenciasDaFicha } from './comum'

const ABAS = [
  { valor: 'resumo', label: 'Resumo' },
  { valor: 'giro', label: 'Giro' },
  { valor: 'contas', label: 'Contas e tarifas' },
  { valor: 'cadastro', label: 'Cadastro' },
]
const COR_PASSO: Record<TomPasso, string> = { gain: 'text-gain', warn: 'text-warn', loss: 'text-loss', neutral: 'text-fg' }
// Aniversário aparece na ficha quando falta até uma semana
const DIAS_ANIVERSARIO = 7

// tel: a partir do telefone do cadastro (55 + DDD + número)
function linkLigar(telefone: string | null): string | null {
  const d = (telefone ?? '').replace(/\D/g, '')
  if (d.length < 10) return null
  return `tel:+${d.startsWith('55') && d.length >= 12 ? d : `55${d}`}`
}

// A ficha do cliente. Em cima, quem é e como falar com ele; logo abaixo, "Agora": a situação em uma
// frase, o que ela pede, o atendimento (último contato, retorno combinado, dias operados) e se o
// cliente também está nas outras corretoras. O resto vem em quatro abas, uma pergunta por aba: Resumo
// (como está, contatos e lead de origem), Giro (o que e como opera), Contas e tarifas, Cadastro.
export default async function ConsultaClientePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { id } = await params
  if (!id) notFound()
  const { corretora, mesRef, base } = ctx
  const aba = ABAS.some(a => a.valor === ctx.q.aba) ? ctx.q.aba : 'resumo'
  const [profile, ficha, responsaveis, assessoresTodos, contatos, outras, contexto360, leads] = await Promise.all([
    getProfile(), clienteFicha(corretora, id, mesRef), responsaveisAtivos(), assessoresPorCorretora(), clienteContatos(corretora, id),
    // o mesmo cliente nas outras corretoras entra no "Agora", que aparece em todas as abas
    clienteNasOutrasCorretoras(corretora, id),
    aba === 'resumo' ? clienteContexto(corretora, id, mesRef) : null,
    aba === 'resumo' ? leadsDoCliente(id) : null,
  ])
  const { resumo, cadastro, contas, extrato } = ficha
  if (!cadastro) notFound()
  const admin = profile?.role === 'admin'
  const hoje = fmtDate(hojeBrasil())
  const mesParam = ctx.mesEscolhido ? mesRef.slice(0, 7) : null
  const hrefAba = (a: string) => {
    const p = new URLSearchParams()
    if (mesParam) p.set('mes', mesParam)
    if (a !== 'resumo') p.set('aba', a)
    const qs = p.toString()
    return `${base}/clientes/${id}${qs ? `?${qs}` : ''}`
  }

  const iniciais = cadastro.nome.trim().split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  const whatsapp = linkTelefone(cadastro.telefone)
  const ligar = linkLigar(cadastro.telefone)
  const pendencias = pendenciasDaFicha(ficha)

  // Agora: a situação em uma frase e o atendimento
  const giro = giroPorDia(extrato)
  const noMes = diasOperadosNoMes(giro, mesRef)
  const ultimoContato = contatos[0] ?? null
  const retorno = ficha.manual.proximo_contato
  const passo = resumo ? proximoPasso(resumo, { hoje, mes: mesCurto(mesRef), mesParcial: mesRef === mesAtual(), contatos: contatos.length, ultimoContato: ultimoContato?.data ?? null, proximoContato: retorno }) : null
  const niver = proximoAniversario(cadastro.dt_nascimento, hoje)

  const linhaTempo = [
    { rotulo: 'Entrada', data: resumo?.data_entrada ?? null, nota: resumo?.parceiro && !/^direto$/i.test(resumo.parceiro) ? `parceiro ${resumo.parceiro}` : 'direto' },
    { rotulo: 'Migração', data: resumo?.data_migracao ?? null, nota: resumo?.dias_ate_migrar != null ? `${resumo.dias_ate_migrar} dias depois da entrada` : resumo?.status ?? '' },
    { rotulo: 'Último giro', data: resumo?.ultimo_giro ?? null, nota: resumo?.meses_sem_giro ? `${resumo.meses_sem_giro} ${resumo.meses_sem_giro === 1 ? 'mês' : 'meses'} sem giro` : resumo?.ultimo_giro ? 'girou no mês de referência' : 'nunca girou' },
  ]

  return (
    <>
      <PageHeader
        eyebrow={`${ctx.eyebrow} · Consulta`}
        title={<Link href={`${base}/clientes${mesParam ? `?mes=${mesParam}` : ''}`} className="inline-flex items-center gap-2 text-fg hover:text-accent"><ArrowLeft className="h-5 w-5" aria-hidden />Cliente</Link>}
        actions={<><BuscaCliente corretora={corretora} base={base} placeholder="Abrir outra ficha: nome, CPF, conta…" /><MesPicker valor={mesRef} /></>}
      />
      <PageBody>
        <div className="space-y-4">
          {/* Quem é e como falar com ele */}
          <section className="panel p-5 md:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-section font-semibold text-accent" aria-hidden>{iniciais}</div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-title font-semibold tracking-tight text-fg">{cadastro.nome}</h2>
                    {resumo && <StatusBadge status={resumo.status} />}
                    {resumo && <SituacaoBadge situacao={resumo.situacao} mesesSemGiro={resumo.meses_sem_giro} />}
                    {resumo?.nivel && <NivelBadge nivel={resumo.nivel} media={resumo.lotes_media_3m} />}
                    {resumo?.risco && <RiscoBadge risco={resumo.risco} diasSemGiro={resumo.dias_sem_giro} />}
                  </div>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-dense sm:grid-cols-[auto_1fr_auto_1fr]">
                    <dt className="text-fg-subtle">Telefone</dt>
                    <dd className="min-w-0">{cadastro.telefone ? <Copiar valor={cadastro.telefone.replace(/\D/g, '')} rotulo="o telefone">{telefoneCurto(cadastro.telefone)}</Copiar> : TRACO}</dd>
                    <dt className="text-fg-subtle">CPF/CNPJ</dt>
                    <dd className="min-w-0">{cadastro.documento ? <Copiar valor={cadastro.documento} rotulo="o CPF/CNPJ">{cadastro.documento}</Copiar> : TRACO}</dd>
                    <dt className="text-fg-subtle">Conta</dt>
                    <dd className="min-w-0">
                      {resumo?.conta_principal ? <Copiar valor={resumo.conta_principal} rotulo="a conta">{resumo.conta_principal}</Copiar> : TRACO}
                      {contas.length > 1 && <Link href={hrefAba('contas')} className="ml-1.5 text-fg-subtle hover:text-fg" title="Ver todas as contas">+{contas.length - 1}</Link>}
                    </dd>
                    <dt className="text-fg-subtle">E-mail</dt>
                    <dd className="min-w-0 truncate">{cadastro.email ? <a href={`mailto:${cadastro.email}`} className="hover:text-accent hover:underline">{cadastro.email}</a> : TRACO}</dd>
                    <dt className="text-fg-subtle">Assessor</dt><dd className="truncate">{resumo?.assessor_nome ?? TRACO}</dd>
                    <dt className="text-fg-subtle">Responsável</dt><dd>{resumo?.responsavel ?? TRACO}</dd>
                    <dt className="text-fg-subtle">Ativação</dt><dd title="Atendente da campanha de ativação; não mexe no responsável nem na comissão">{resumo?.ativador ?? <span className="text-fg-subtle">fora da campanha</span>}</dd>
                    <dt className="text-fg-subtle">Parceiro</dt><dd>{resumo?.parceiro ?? <span className="text-fg-subtle">direto</span>}</dd>
                  </dl>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className={buttonClasses('secondary', 'sm')}><MessageCircle className="h-4 w-4" aria-hidden />WhatsApp</a>}
                {ligar && <a href={ligar} className={buttonClasses('secondary', 'sm')}><Phone className="h-4 w-4" aria-hidden />Ligar</a>}
                {cadastro.email && <a href={`mailto:${cadastro.email}`} className={cn(buttonClasses('secondary', 'sm'), 'md:hidden')}><Mail className="h-4 w-4" aria-hidden />E-mail</a>}
                <FichaEditavel
                  corretora={corretora} clienteId={id} admin={admin} cadastro={cadastro}
                  manuais={{ data_entrada: resumo?.data_entrada ?? null, parceiro: resumo?.parceiro ?? null, observacoes: resumo?.observacoes ?? null, motivo_recusa: resumo?.motivo_recusa ?? null, grupo_corretagem: resumo?.grupo_corretagem ?? null }}
                  manual={ficha.manual}
                  responsaveis={responsaveis.filter(r => r.atende_clientes).map(r => r.nome)}
                  atendentes={responsaveis.filter(r => r.atende_clientes).map(r => r.nome)}
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

          {/* Agora: a situação em uma frase, o que ela pede e o atendimento */}
          {passo && (
            <section className="panel p-5 md:p-6" aria-label="Situação do cliente agora">
              <div className="grid gap-5 lg:grid-cols-5">
                <div className="min-w-0 lg:col-span-2">
                  <p className="label">{ctx.mesEscolhido ? `Situação em ${mesCurto(mesRef)}` : 'Agora'}</p>
                  <p className={cn('mt-1 text-section font-semibold', COR_PASSO[passo.tom])}>{passo.titulo}</p>
                  <p className="mt-1 text-dense text-fg-muted">{passo.texto}</p>
                  {niver && niver.emDias <= DIAS_ANIVERSARIO && (
                    <p className="mt-2 flex items-center gap-1.5 text-dense">
                      <Cake className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                      {niver.emDias === 0 ? `Faz ${niver.idade} anos hoje.` : `Aniversário ${quando(somarDias(hoje, niver.emDias), hoje)} (${niver.data}): faz ${niver.idade} anos.`}
                    </p>
                  )}
                </div>
                <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-4 text-dense lg:col-span-3 lg:grid-cols-4">
                  <div className="min-w-0">
                    <dt className="label">Último contato</dt>
                    <dd className={cn('mt-1 font-semibold tabular-nums', !ultimoContato && 'text-fg-subtle')}>{ultimoContato ? dataCurta(ultimoContato.data) : 'nenhum'}</dd>
                    <p className="text-micro text-fg-muted">
                      {ultimoContato ? <>{quando(ultimoContato.data, hoje)}{ultimoContato.criado_por_nome ? ` · ${ultimoContato.criado_por_nome}` : ''} · {fmtNum(contatos.length)} no total</> : 'ainda sem contato registrado'}
                    </p>
                    {ultimoContato?.nota && <p className="mt-1 line-clamp-2 text-micro text-fg-muted" title={ultimoContato.nota}>“{ultimoContato.nota}”</p>}
                  </div>
                  <div className="min-w-0">
                    <dt className="label">Próximo contato</dt>
                    <dd className={cn('mt-1 font-semibold tabular-nums', !retorno ? 'text-fg-subtle' : retorno <= hoje && 'text-warn')}>{retorno ? dataCurta(retorno) : 'não marcado'}</dd>
                    <p className="text-micro text-fg-muted">{retorno ? `retorno combinado · ${quando(retorno, hoje)}` : <Link href={`${hrefAba('resumo')}#contatos`} className="hover:text-fg hover:underline">marcar em Contatos</Link>}</p>
                  </div>
                  <div className="min-w-0">
                    <dt className="label">Último giro</dt>
                    <dd className={cn('mt-1 font-semibold tabular-nums', !resumo?.ultimo_giro && 'text-fg-subtle')}>{resumo?.ultimo_giro ? dataCurta(resumo.ultimo_giro) : 'nunca girou'}</dd>
                    <p className="text-micro text-fg-muted">{resumo?.ultimo_giro ? quando(resumo.ultimo_giro, hoje) : resumo?.data_migracao ? `migrou ${quando(resumo.data_migracao, hoje)}` : 'sem lote lançado'}</p>
                  </div>
                  <div className="min-w-0">
                    <dt className="label">Dias com giro em {mesCurto(mesRef)}</dt>
                    <dd className={cn('mt-1 font-semibold tabular-nums', !noMes?.operados && 'text-fg-subtle')}>{noMes ? fmtNum(noMes.operados) : TRACO}</dd>
                    <p className="text-micro text-fg-muted">{noMes?.operados ? `média de ${fmtNum(Math.round(noMes.mediaPorDia))} lotes por dia operado` : noMes ? 'não operou no mês' : 'extrato não cobre o mês inteiro'}</p>
                  </div>
                </dl>
              </div>
              {outras.length > 0 && (
                <ul className="mt-5 space-y-2 border-t border-line pt-4 text-dense">
                  {outras.map(o => (
                    <li key={o.corretora} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-fg-subtle">Também na</span>
                      <Link href={`/${CORRETORA_SLUG[o.corretora]}/clientes/${id}`} className="link font-semibold">{CORRETORA_LABEL[o.corretora]}</Link>
                      <SituacaoBadge situacao={o.resumo.situacao} mesesSemGiro={o.resumo.meses_sem_giro} />
                      <span className="text-fg-muted">
                        {o.resumo.lotes_12m > 0
                          ? <>{n0(o.resumo.lotes_mes)} lotes no mês · {n0(o.resumo.lotes_12m)} em 12 meses · último giro em {dataCurta(o.resumo.ultimo_giro)}</>
                          : <>sem lotes em 12 meses{o.resumo.data_migracao ? ` · migrou em ${dataCurta(o.resumo.data_migracao)}` : ''}</>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <Abas caminho={`${base}/clientes/${id}`} query={{ mes: mesParam }} valor={aba} opcoes={ABAS} padrao="resumo" rotulo="Seções da ficha" />
        </div>

        {aba === 'resumo' && contexto360 && leads && (
          <AbaResumo ctx={ctx} id={id} ficha={ficha} contexto360={contexto360} leads={leads} contatos={contatos} giro={giro} pendencias={pendencias} hrefAba={hrefAba} />
        )}
        {aba === 'giro' && <AbaGiro ctx={ctx} ficha={ficha} giro={giro} />}
        {aba === 'contas' && <AbaContas ctx={ctx} id={id} ficha={ficha} admin={admin} />}
        {aba === 'cadastro' && <AbaCadastro ficha={ficha} pendencias={pendencias} />}
      </PageBody>
    </>
  )
}
