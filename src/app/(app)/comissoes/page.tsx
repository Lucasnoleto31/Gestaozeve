export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getProfile } from '@/lib/auth/getProfile'
import { parceirosLista } from '@/lib/gestao/consultas'
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
// pagamentos e regras (S39–S54).
export default async function ComissoesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'vendedor')) redirect('/dashboard')
  const admin = profile.role === 'admin'
  const sp = await searchParams
  const q = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  // comissionados e parceiros das fichas/assessores; o pedido no endereço casa sem acento nem caixa
  const parceiros = await parceirosLista()
  const pedido = normTexto(q('parceiro'))
  const parceiroSel = pedido ? parceiros.find(p => normTexto(p.nome) === pedido) ?? null : null
  const corretoraParam = q('corretora')
  const corretora = isCorretora(corretoraParam) ? corretoraParam : null
  const mesRef = parseMes(q('mes')) ?? mesAtual()

  const filtros = (
    <>
      <SelectParam param="parceiro" valor={parceiroSel?.nome ?? ''} label="Parceiro" todos="Todos (visão geral)"
        opcoes={parceiros.map(p => ({ valor: p.nome, label: p.comissionado ? `${p.nome} · comissionado` : `${p.nome} · ${fmtNum(p.clientes)} ${p.clientes === 1 ? 'ficha' : 'fichas'}` }))} />
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
            Marque quem é comissionado em Parâmetros › Responsáveis (coluna Comissão) ou preencha o campo Parceiro na ficha dos clientes.
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
          <VisaoGeral parceiros={parceiros} corretora={corretora} mesRef={mesRef} verBtg={corretorasDoPerfil(profile).includes('BTG')} />
        </PageBody>
      </>
    )
  }

  const parceiro = parceiroSel.nome
  const padrao = parceiroSel.comissionado ? 'resumo' : 'extrato'   // parceiro só da ficha não tem comissão: abre no extrato
  const pedida = q('aba')
  const aba = ABAS.some(a => a.valor === pedida) ? pedida : padrao
  const filtro = { parceiro, corretora, mesRef }

  return (
    <>
      <PageHeader eyebrow="Comissões" title={parceiro} actions={filtros}
        description={parceiroSel.comissionado
          ? `Comissão por abertura, ativação e reativação de conta${corretora ? ` na ${CORRETORA_LABEL[corretora]}` : ''}, em ${mesLongo(mesRef)}.`
          : `Parceiro do campo da ficha (${fmtNum(parceiroSel.clientes)} ${parceiroSel.clientes === 1 ? 'ficha' : 'fichas'}): carteira e extrato; sem comissão cadastrada.`}>
        <Link href={hrefComissoes({ corretora, mes: mesRef })} className="link mt-3 inline-flex items-center gap-1 text-label"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />Todos os parceiros</Link>
        <Abas caminho="/comissoes" query={{ parceiro, corretora, mes: mesRef.slice(0, 7) }} valor={aba} opcoes={ABAS} padrao={padrao} rotulo={`Seções de ${parceiro}`} />
      </PageHeader>
      <PageBody>
        {aba === 'resumo' && <AbaResumo {...filtro} comissionado={parceiroSel.comissionado} admin={admin} />}
        {aba === 'extrato' && <AbaExtrato {...filtro} />}
        {aba === 'pagamentos' && <AbaPagamentos parceiro={parceiro} admin={admin} />}
        {aba === 'carteira' && <AbaCarteira {...filtro} />}
        {aba === 'retorno' && <AbaRetorno {...filtro} />}
      </PageBody>
    </>
  )
}
