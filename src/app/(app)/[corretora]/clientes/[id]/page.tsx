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
import { MomentoBadge, NivelBadge, TRACO, dataCurta, dataPt, n0 } from '@/components/gestao/Celulas'
import { CORRETORA_LABEL, CORRETORA_SLUG, temListaPropria } from '@/lib/corretoras'
import { BuscaCliente } from '../BuscaCliente'
import { ExcluirClienteButton } from '../ExcluirClienteButton'
import { FichaEditavel } from './FichaEditavel'
import { opcoesOrigem as lerOpcoesOrigem } from '@/lib/gestao/consultasOrigens'
import { parceirosDeParticipacao, parceirosDoCliente } from '@/lib/gestao/consultasParceirosCliente'
import { resumoDaLista } from '@/lib/gestao/parceirosCliente'
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

// A ficha do cliente. Em cima, quem é, como está (um selo só, o mesmo da lista de Clientes) e como falar
// com ele; logo abaixo, "Agora": a situação em uma frase, o que ela pede, o atendimento (último contato,
// retorno combinado, último giro) e se o cliente também está nas outras corretoras. O resto vem em quatro
// abas, uma pergunta por aba: Resumo (os números do mês, o giro e os contatos), Giro (o que e como
// opera), Contas e tarifas, Cadastro (com o status e as datas de entrada e migração).
// Lucas, 16/11/2026: "eu mesmo estou perdido com essas páginas". Saíram os quatro selos de estado, a
// faixa de datas que repetia o último giro e os campos vazios do cabeçalho.
export default async function ConsultaClientePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { id } = await params
  if (!id) notFound()
  const { corretora, mesRef, base } = ctx
  const aba = ABAS.some(a => a.valor === ctx.q.aba) ? ctx.q.aba : 'resumo'
  const [profile, ficha, responsaveis, assessoresTodos, contatos, opcoesOrigem, listaParceiros, opcoesParceiros, outras, contexto360, leads] = await Promise.all([
    getProfile(), clienteFicha(corretora, id, mesRef), responsaveisAtivos(), assessoresPorCorretora(), clienteContatos(corretora, id), lerOpcoesOrigem(),
    // vários parceiros no mesmo cliente, cada um com o seu percentual (S61)
    parceirosDoCliente(corretora, id), parceirosDeParticipacao(corretora),
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

  // Quem cuida do cliente e desde quando: só o que está preenchido (responsável vazio é informação: ninguém cuida)
  const temParceiro = !!resumo?.parceiro && !/^direto$/i.test(resumo.parceiro)
  // quem divide o que o cliente gera neste mês; com lista, o campo Parceiro fica só como origem
  const divisao = resumoDaLista(listaParceiros.linhas, mesAtual())
  const quemCuida: { rotulo: string; valor: string; dica?: string }[] = [
    ...(resumo?.assessor_nome ? [{ rotulo: 'Assessor', valor: resumo.assessor_nome }] : []),
    { rotulo: 'Responsável', valor: resumo?.responsavel ?? 'ninguém' },
    ...(temParceiro ? [{ rotulo: divisao ? 'Origem' : 'Parceiro', valor: resumo!.parceiro! }] : []),
    ...(divisao ? [{ rotulo: 'Parceiros', valor: divisao, dica: `Parte de cada parceiro em tudo o que o cliente gerar ${corretora === 'BTG' ? 'no' : 'na'} ${CORRETORA_LABEL[corretora]}, em qualquer código nosso` }] : []),
    ...(resumo?.ativador ? [{ rotulo: 'Campanha de ativação', valor: resumo.ativador, dica: 'Atendente da campanha de ativação; não mexe no responsável nem na comissão' }] : []),
    ...(resumo?.data_migracao ? [{ rotulo: 'Migrou em', valor: dataPt(resumo.data_migracao) }] : resumo?.data_entrada ? [{ rotulo: 'Entrou em', valor: dataPt(resumo.data_entrada) }] : []),
  ]

  return (
    <>
      <PageHeader
        eyebrow={`${ctx.eyebrow} · Ficha do cliente`}
        title={<Link href={`${base}/clientes${mesParam ? `?mes=${mesParam}` : ''}`} className="inline-flex items-center gap-2 text-fg hover:text-accent"><ArrowLeft className="h-5 w-5" aria-hidden />Clientes</Link>}
        actions={<><BuscaCliente corretora={corretora} base={base} placeholder="Abrir outra ficha: nome, CPF, conta…" /><MesPicker valor={mesRef} /></>}
      />
      <PageBody>
        <div className="space-y-4">
          {/* Quem é, como está (um selo só, o mesmo da lista) e como falar com ele */}
          <section className="panel p-5 md:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-section font-semibold text-accent" aria-hidden>{iniciais}</div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-title font-semibold tracking-tight text-fg">{cadastro.nome}</h2>
                    {resumo && <MomentoBadge cliente={resumo} />}
                    {resumo?.nivel && <NivelBadge nivel={resumo.nivel} media={resumo.lotes_media_3m} />}
                  </div>
                  <dl className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-dense">
                    <div className="flex min-w-0 items-center gap-2">
                      <dt className="text-fg-subtle">Telefone</dt>
                      <dd className="min-w-0">{cadastro.telefone ? <Copiar valor={cadastro.telefone.replace(/\D/g, '')} rotulo="o telefone">{telefoneCurto(cadastro.telefone)}</Copiar> : TRACO}</dd>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <dt className="text-fg-subtle">Conta</dt>
                      <dd className="min-w-0">
                        {resumo?.conta_principal ? <Copiar valor={resumo.conta_principal} rotulo="a conta">{resumo.conta_principal}</Copiar> : TRACO}
                        {contas.length > 1 && <Link href={hrefAba('contas')} className="ml-1.5 text-fg-subtle hover:text-fg" title="Ver todas as contas">+{contas.length - 1}</Link>}
                      </dd>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <dt className="text-fg-subtle">CPF/CNPJ</dt>
                      <dd className="min-w-0">{cadastro.documento ? <Copiar valor={cadastro.documento} rotulo="o CPF/CNPJ">{cadastro.documento}</Copiar> : TRACO}</dd>
                    </div>
                    {cadastro.email && (
                      <div className="flex min-w-0 items-center gap-2">
                        <dt className="text-fg-subtle">E-mail</dt>
                        <dd className="min-w-0 truncate"><a href={`mailto:${cadastro.email}`} className="hover:text-accent hover:underline">{cadastro.email}</a></dd>
                      </div>
                    )}
                  </dl>
                  <dl className="mt-1.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-dense">
                    {quemCuida.map(q => (
                      <div key={q.rotulo} className="flex min-w-0 items-center gap-2" title={q.dica}>
                        <dt className="text-fg-subtle">{q.rotulo}</dt>
                        <dd className={cn('min-w-0 truncate', q.valor === 'ninguém' ? 'text-fg-subtle' : 'text-fg-muted')}>{q.valor}</dd>
                      </div>
                    ))}
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
                  opcoesOrigem={opcoesOrigem}
                  parceiros={{ linhas: listaParceiros.linhas, opcoes: opcoesParceiros, disponivel: listaParceiros.disponivel, mesCorrente: mesAtual() }}
                  contas={contas.filter(x => (x.status as string) !== 'Não cadastrada').map(x => ({ id: x.conta_id, conta: x.conta }))}
                  abrirInicial={ctx.q.editar === '1'}
                />
                {temListaPropria(corretora) && admin && <ExcluirClienteButton corretora={corretora} clienteId={id} nome={cadastro.nome} base={base} variante="botao" />}
              </div>
            </div>
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
                <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-4 text-dense sm:grid-cols-3 lg:col-span-3">
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
                    <p className="text-micro text-fg-muted">
                      {resumo?.ultimo_giro ? quando(resumo.ultimo_giro, hoje) : resumo?.data_migracao ? `migrou ${quando(resumo.data_migracao, hoje)}` : 'sem lote lançado'}
                      {noMes?.operados ? ` · ${fmtNum(noMes.operados)} ${noMes.operados === 1 ? 'dia' : 'dias'} com giro em ${mesCurto(mesRef)}` : ''}
                    </p>
                  </div>
                </dl>
              </div>
              {outras.length > 0 && (
                <ul className="mt-5 space-y-2 border-t border-line pt-4 text-dense">
                  {outras.map(o => (
                    <li key={o.corretora} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-fg-subtle">Também na</span>
                      <Link href={`/${CORRETORA_SLUG[o.corretora]}/clientes/${id}`} className="link font-semibold">{CORRETORA_LABEL[o.corretora]}</Link>
                      <MomentoBadge cliente={o.resumo} />
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
        {aba === 'cadastro' && <AbaCadastro ficha={ficha} pendencias={pendencias} divisao={divisao} />}
      </PageBody>
    </>
  )
}
