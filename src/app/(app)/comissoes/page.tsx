export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getProfile } from '@/lib/auth/getProfile'
import { parceirosLista } from '@/lib/gestao/consultas'
import { regrasDoParceiroPorCorretora, regrasReceita, repasseBtg } from '@/lib/gestao/consultasParticipacao'
import type { ParceiroRepasse } from '@/lib/gestao/btg'
import { TEXTO_SO_FICHA, inicioDasRegras, nomesComRegra, textoDaRegra } from '@/lib/gestao/participacao'
import { parceirosDeComissao } from '@/lib/gestao/comissao'
import { pessoaNoModelo, remuneracaoDaEquipe } from '@/lib/gestao/consultasRemuneracao'
import { equipe, responsavelDoUsuario } from '@/lib/gestao/guard'
import { mesmaPessoa, normTexto } from '@/lib/texto'
import { mesAtual, mesCurto, mesLongo, parseMes } from '@/lib/gestao/meses'
import { CORRETORAS, CORRETORA_LABEL, corretorasDoPerfil, isCorretora } from '@/lib/corretoras'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { MesPicker, SelectParam } from '@/components/gestao/Filtros'
import { Abas } from '@/components/gestao/Abas'
import { VisaoGeral } from './VisaoGeral'
import { AbaResumo } from './AbaResumo'
import { AbaReceita } from './AbaReceita'
import { AbaRepasseBtg, ParticipacaoBtg } from './ParticipacaoBtg'
import { AbaCarteira, AbaExtrato, AbaPagamentos, AbaRetorno } from './AbasParceiro'
import { AbaExtratoNivel, AbaPagamentosNivel, AbaResumoNivel } from './Equipe'
import { hrefComissoes } from './comum'

const ABAS = [
  { valor: 'resumo', label: 'Resumo' },
  { valor: 'extrato', label: 'Extrato' },
  { valor: 'pagamentos', label: 'Pagamentos e regras' },
  { valor: 'carteira', label: 'Carteira' },
  { valor: 'retorno', label: 'Retorno' },
]
// Quem está na remuneração por níveis: o Retorno compara receita com comissão por conta, que não existe mais
const ABAS_NIVEL = ABAS.filter(a => a.valor !== 'retorno')

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
  const [todos, noBtg, regrasTodas] = await Promise.all([parceirosLista(), verBtg ? repasseBtg() : Promise.resolve<ParceiroRepasse[]>([]), regrasReceita(minhas)])
  // O valor de cada pessoa da equipe (os comissionados) só para o admin e para a própria pessoa (Lucas, 18/11/2026,
  // na remuneração por níveis); os parceiros com participação na receita seguem visíveis para a equipe
  const eu = admin ? null : await responsavelDoUsuario((await equipe()).db, profile.nome ?? '')
  const parceiros = parceirosDeComissao(todos, [...noBtg.map(r => r.nome), ...nomesComRegra(regrasTodas.flatMap(r => r.regras))])
    .filter(p => admin || !p.comissionado || mesmaPessoa(p.nome, eu))
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
          <VisaoGeral parceiros={parceiros} corretora={corretora} mesRef={mesRef} verBtg={verBtg} regras={regras} regrasTodas={regrasTodas} />
        </PageBody>
      </>
    )
  }

  const parceiro = parceiroSel.nome
  // participação em corretagem, zeragem e incentivo (parceiros_receita): em qualquer corretora e dentro do filtro
  const receitaTodas = regrasDoParceiroPorCorretora(regrasTodas, parceiro)
  const receita = regrasDoParceiroPorCorretora(regras, parceiro)
  const temReceita = receitaTodas.length > 0
  // no BTG o parceiro pode seguir a divisão da comissão (repasse_parceiros): só ela (Atual Capital) ou junto
  // com a participação na receita de outra corretora (Fabio Ferron)
  const regraBtg = noBtg.find(r => normTexto(r.nome) === normTexto(parceiro)) ?? null
  const mostraBtg = !!regraBtg && (!corretora || corretora === 'BTG')
  const participa = temReceita || !!regraBtg
  // remuneração por níveis (S62): a partir do mês de entrada, Resumo, Extrato e regras do nível
  const rem = parceiroSel.comissionado ? await remuneracaoDaEquipe() : null
  const pessoaModelo = rem ? pessoaNoModelo(rem, parceiro) : null
  const noModelo = !!pessoaModelo && mesRef >= pessoaModelo.nivelDesde
  // o Retorno (receita das contas menos a comissão por conta) não serve para quem recebe sobre a própria receita
  const abas = noModelo ? ABAS_NIVEL : participa && !parceiroSel.comissionado ? ABAS.filter(a => a.valor !== 'retorno') : ABAS
  const padrao = 'resumo'
  const pedida = q('aba')
  const aba = abas.some(a => a.valor === pedida) ? pedida : padrao
  const filtro = { parceiro, corretora, mesRef }
  const naCorretora = (c: string) => `na ${isCorretora(c) ? CORRETORA_LABEL[c] : c}`
  const descricaoReceita = receitaTodas.map(r => {
    const ultima = r.regras[r.regras.length - 1]
    // quem só entra pela lista de parceiros das fichas não tem percentual geral nem código
    return ultima.soFicha ? `${TEXTO_SO_FICHA}, ${naCorretora(r.corretora)}` : `${textoDaRegra(ultima)} dos clientes dele ${naCorretora(r.corretora)}`
  }).join('; ')
  const descricaoBtg = regraBtg ? `${regraBtg.pctParceiro.toLocaleString('pt-BR')} % da comissão que o BTG paga sobre os clientes dele, depois do imposto` : ''
  // quem também tem regra de participação na receita (a do parâmetro) só conta o BTG a partir do início dela
  const inicioReceita = inicioDasRegras(receitaTodas.flatMap(r => r.regras))
  const blocoBtg = mostraBtg ? <ParticipacaoBtg parceiro={parceiro} mesRef={mesRef} desde={inicioReceita} /> : null

  return (
    <>
      <PageHeader eyebrow="Comissões" title={parceiro} tituloNoCelular actions={filtros}
        description={pessoaModelo
          ? noModelo
            ? `Remuneração por níveis desde ${mesCurto(pessoaModelo.nivelDesde)}: fixo do nível, cada conta pelo valor do nível e bônus da base ativa${corretora ? `, na ${CORRETORA_LABEL[corretora]}` : ''}, em ${mesLongo(mesRef)}.`
            : `Comissão por abertura, ativação e reativação de conta em ${mesLongo(mesRef)}. A partir de ${mesCurto(pessoaModelo.nivelDesde)}, remuneração por níveis.`
          : temReceita
          ? `Participação na receita: ${descricaoReceita}${regraBtg ? `; no BTG, ${descricaoBtg}` : ''}.${parceiroSel.comissionado ? ' Também recebe comissão por conta aberta e ativada.' : ''}`
          : regraBtg
            ? `Participação na comissão do BTG: ${descricaoBtg}.${parceiroSel.comissionado ? ' Também recebe comissão por conta aberta e ativada.' : ''}`
            : `Comissão por abertura, ativação e reativação de conta${corretora ? ` na ${CORRETORA_LABEL[corretora]}` : ''}, em ${mesLongo(mesRef)}.`}>
        <Link href={hrefComissoes({ corretora, mes: mesRef })} className="link mt-3 inline-flex items-center gap-1 text-label"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />Todos os parceiros</Link>
        <Abas caminho="/comissoes" query={{ parceiro, corretora, mes: mesRef.slice(0, 7) }} valor={aba} opcoes={abas} padrao={padrao} rotulo={`Seções de ${parceiro}`} />
      </PageHeader>
      <PageBody>
        {aba === 'resumo' && participa && parceiroSel.comissionado && (
          <Alert tone="warn" title={`${parceiro} recebe comissão por conta e participação na receita`}>
            Os pagamentos lançados abatem dos dois saldos mostrados abaixo. O saldo certo é o da visão geral, que soma os dois valores gerados antes de descontar o que foi pago.
          </Alert>
        )}
        {/* participação em corretagem, zeragem e incentivo (com a parte do BTG somada, quando ele também tem) */}
        {aba === 'resumo' && receita.length > 0 && <AbaReceita {...filtro} regras={receita} admin={admin} btg={mostraBtg} extra={blocoBtg} />}
        {/* só a participação na comissão do BTG: a Atual Capital sempre, ou outro parceiro com o filtro no BTG */}
        {aba === 'resumo' && receita.length === 0 && mostraBtg && (
          <>
            <AbaRepasseBtg {...filtro} desde={inicioReceita} />
            {temReceita && (
              <Alert tone="neutral" title={`O restante da participação de ${parceiro} vale ${receitaTodas.map(r => naCorretora(r.corretora)).join(' e ')}`}>
                <Link href={hrefComissoes({ parceiro, mes: mesRef })} className="link">Ver sem o filtro de corretora</Link>, com o valor a receber de todas as corretoras, os pagamentos e o saldo.
              </Alert>
            )}
          </>
        )}
        {/* filtro numa corretora em que o parceiro não tem participação */}
        {aba === 'resumo' && participa && receita.length === 0 && !mostraBtg && (
          <Alert tone="neutral" title={`${parceiro} não tem participação ${corretora ? naCorretora(corretora) : 'nas suas corretoras'}`}>
            A participação dele vale {[...receitaTodas.map(r => naCorretora(r.corretora)), ...(regraBtg ? ['no BTG'] : [])].join(' e ')}. <Link href={hrefComissoes({ parceiro, mes: mesRef })} className="link">Ver sem o filtro de corretora</Link>. A carteira e o extrato dele aqui ficam nas outras abas.
          </Alert>
        )}
        {aba === 'resumo' && parceiroSel.comissionado && !noModelo && <AbaResumo {...filtro} comissionado participacao={parceiroSel.participacao} admin={admin} />}
        {aba === 'resumo' && noModelo && <AbaResumoNivel {...filtro} />}
        {aba === 'extrato' && (noModelo ? <AbaExtratoNivel {...filtro} /> : <AbaExtrato {...filtro} />)}
        {aba === 'pagamentos' && (pessoaModelo
          ? <AbaPagamentosNivel parceiro={parceiro} admin={admin} />
          : <AbaPagamentos parceiro={parceiro} admin={admin} comissionado={parceiroSel.comissionado} receita={receitaTodas} btg={regraBtg} />)}
        {aba === 'carteira' && <AbaCarteira {...filtro} />}
        {aba === 'retorno' && <AbaRetorno {...filtro} />}
      </PageBody>
    </>
  )
}
