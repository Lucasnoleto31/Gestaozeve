export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getProfile } from '@/lib/auth/getProfile'
import { parceirosComParticipacao, parceirosLista } from '@/lib/gestao/consultas'
import { regrasDoParceiroPorCorretora, regrasReceita } from '@/lib/gestao/consultasParticipacao'
import { nomesComRegra, textoDaRegra } from '@/lib/gestao/participacao'
import { parceirosDeComissao } from '@/lib/gestao/comissao'
import { normTexto } from '@/lib/texto'
import { mesAtual, mesLongo, parseMes } from '@/lib/gestao/meses'
import { CORRETORAS, CORRETORA_LABEL, corretorasDoPerfil, isCorretora } from '@/lib/corretoras'
import { fmtNum } from '@/lib/format'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { MesPicker, SelectParam } from '@/components/gestao/Filtros'
import { Abas } from '@/components/gestao/Abas'
import { VisaoGeral } from './VisaoGeral'
import { AbaResumo } from './AbaResumo'
import { AbaReceita } from './AbaReceita'
import { AbaCarteira, AbaExtrato, AbaPagamentos, AbaRetorno } from './AbasParceiro'
import { hrefComissoes } from './comum'

const ABAS = [
  { valor: 'resumo', label: 'Resumo' },
  { valor: 'extrato', label: 'Extrato' },
  { valor: 'pagamentos', label: 'Pagamentos e regras' },
  { valor: 'carteira', label: 'Carteira' },
  { valor: 'retorno', label: 'Retorno' },
]

// Comissão de parceiros em dois níveis: a visão geral (quanto cada comissionado gerou no mês, o que foi
// pago e o saldo) e, ao escolher um parceiro, as abas dele — Resumo, Extrato, Pagamentos e regras,
// Carteira e Retorno. Cada aba carrega só o que mostra. Todo mundo da equipe vê; o admin lança
// pagamentos e regras (S39–S54). A lista tem só quem recebe do escritório: os comissionados e quem tem
// participação na receita (na comissão do BTG, em repasse_parceiros, ou em corretagem, zeragem e incentivo
// dos clientes dele, em parceiros_receita); as origens do campo Parceiro da ficha (hero, Instagram…) não entram.
export default async function ComissoesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'vendedor')) redirect('/dashboard')
  const admin = profile.role === 'admin'
  const sp = await searchParams
  const q = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  // comissionados e parceiros com participação na receita, só nas corretoras que o usuário vê; o pedido no
  // endereço casa sem acento nem caixa
  const minhas = corretorasDoPerfil(profile)
  const verBtg = minhas.includes('BTG')
  const [todos, comParticipacao, regrasTodas] = await Promise.all([parceirosLista(), verBtg ? parceirosComParticipacao() : Promise.resolve<string[]>([]), regrasReceita(minhas)])
  const parceiros = parceirosDeComissao(todos, [...comParticipacao, ...nomesComRegra(regrasTodas.flatMap(r => r.regras))])
  const pedido = normTexto(q('parceiro'))
  const parceiroSel = pedido ? parceiros.find(p => normTexto(p.nome) === pedido) ?? null : null
  const corretoraParam = q('corretora')
  const corretora = isCorretora(corretoraParam) ? corretoraParam : null
  const mesRef = parseMes(q('mes')) ?? mesAtual()
  // regras de participação em corretagem, zeragem e incentivo dentro do filtro de corretora
  const regras = corretora ? regrasTodas.filter(r => r.corretora === corretora) : regrasTodas

  const filtros = (
    <>
      <SelectParam param="parceiro" valor={parceiroSel?.nome ?? ''} label="Parceiro" todos="Todos (visão geral)"
        opcoes={parceiros.map(p => ({ valor: p.nome, label: p.comissionado ? `${p.nome} · comissionado` : `${p.nome} · participação na receita` }))} />
      <SelectParam param="corretora" valor={corretora ?? ''} opcoes={CORRETORAS.map(c => ({ valor: c, label: CORRETORA_LABEL[c] }))} label="Corretora" todos="Todas" />
      <MesPicker valor={mesRef} label="Mês" />
    </>
  )

  if (parceiros.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Parceiros · todas as corretoras" title="Comissões" description="Abertura, ativação e reativação de contas por mês, por parceiro." />
        <PageBody>
          <Alert tone="neutral" title="Nenhum parceiro ainda">
            Marque quem é comissionado em Parâmetros › Responsáveis (coluna Comissão). Parceiro com participação na receita entra pelos Parâmetros da corretora.
          </Alert>
        </PageBody>
      </>
    )
  }

  if (!parceiroSel) {
    return (
      <>
        <PageHeader eyebrow="Parceiros · todas as corretoras" title="Comissões" actions={filtros}
          description={`Quanto cada parceiro gerou em ${mesLongo(mesRef)}, o que já foi pago e o saldo a pagar.`} />
        <PageBody>
          <VisaoGeral parceiros={parceiros} corretora={corretora} mesRef={mesRef} verBtg={verBtg} regras={regras} />
        </PageBody>
      </>
    )
  }

  const parceiro = parceiroSel.nome
  // participação em corretagem, zeragem e incentivo (parceiros_receita): em qualquer corretora e dentro do filtro
  const receitaTodas = regrasDoParceiroPorCorretora(regrasTodas, parceiro)
  const receita = regrasDoParceiroPorCorretora(regras, parceiro)
  const temReceita = receitaTodas.length > 0
  // quem só tem participação na comissão do BTG não tem valor por conta: abre no extrato. O Retorno (receita
  // das contas menos a comissão por conta) não serve para quem recebe sobre a própria receita
  const abas = temReceita && !parceiroSel.comissionado ? ABAS.filter(a => a.valor !== 'retorno') : ABAS
  const padrao = parceiroSel.comissionado || temReceita ? 'resumo' : 'extrato'
  const pedida = q('aba')
  const aba = abas.some(a => a.valor === pedida) ? pedida : padrao
  const filtro = { parceiro, corretora, mesRef }
  const naCorretora = (c: string) => `na ${isCorretora(c) ? CORRETORA_LABEL[c] : c}`
  const descricaoReceita = receitaTodas.map(r => `${textoDaRegra(r.regras[r.regras.length - 1])} dos clientes dele ${naCorretora(r.corretora)}`).join('; ')

  return (
    <>
      <PageHeader eyebrow="Comissões" title={parceiro} actions={filtros}
        description={temReceita
          ? `Participação na receita: ${descricaoReceita}.${parceiroSel.comissionado ? ' Também recebe comissão por conta aberta e ativada.' : ''}`
          : parceiroSel.comissionado
            ? `Comissão por abertura, ativação e reativação de conta${corretora ? ` na ${CORRETORA_LABEL[corretora]}` : ''}, em ${mesLongo(mesRef)}.`
            : `Participação na receita do BTG sobre ${fmtNum(parceiroSel.clientes)} ${parceiroSel.clientes === 1 ? 'cliente' : 'clientes'} dele: carteira e extrato; o valor do mês está na visão geral.`}>
        <Link href={hrefComissoes({ corretora, mes: mesRef })} className="link mt-3 inline-flex items-center gap-1 text-label"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />Todos os parceiros</Link>
        <Abas caminho="/comissoes" query={{ parceiro, corretora, mes: mesRef.slice(0, 7) }} valor={aba} opcoes={abas} padrao={padrao} rotulo={`Seções de ${parceiro}`} />
      </PageHeader>
      <PageBody>
        {aba === 'resumo' && temReceita && parceiroSel.comissionado && (
          <Alert tone="warn" title={`${parceiro} recebe comissão por conta e participação na receita`}>
            Os pagamentos lançados abatem dos dois saldos mostrados abaixo. O saldo certo é o da visão geral, que soma os dois valores gerados antes de descontar o que foi pago.
          </Alert>
        )}
        {aba === 'resumo' && temReceita && (receita.length > 0
          ? <AbaReceita {...filtro} regras={receita} admin={admin} />
          : (
            <Alert tone="neutral" title={`${parceiro} não tem participação na receita ${corretora ? naCorretora(corretora) : 'nas suas corretoras'}`}>
              A regra dele vale {receitaTodas.map(r => naCorretora(r.corretora)).join(' e ')}. <Link href={hrefComissoes({ parceiro, mes: mesRef })} className="link">Ver sem o filtro de corretora</Link>. A carteira e o extrato dele aqui ficam nas outras abas.
            </Alert>
          ))}
        {aba === 'resumo' && (parceiroSel.comissionado || !temReceita) && <AbaResumo {...filtro} comissionado={parceiroSel.comissionado} participacao={parceiroSel.participacao} admin={admin} />}
        {aba === 'extrato' && <AbaExtrato {...filtro} />}
        {aba === 'pagamentos' && <AbaPagamentos parceiro={parceiro} admin={admin} comissionado={parceiroSel.comissionado} receita={receitaTodas} />}
        {aba === 'carteira' && <AbaCarteira {...filtro} />}
        {aba === 'retorno' && <AbaRetorno {...filtro} />}
      </PageBody>
    </>
  )
}
