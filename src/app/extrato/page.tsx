export const dynamic = 'force-dynamic'

// Extrato mensal do parceiro para imprimir ou salvar em PDF (S48): página limpa, sempre clara e sem
// a navegação do sistema. Abre a partir da tela Comissões (?parceiro=&mes=AAAA-MM&corretora=&receita=0).
// Parceiro com participação na receita (parceiros_receita) ganha, antes da carteira, o que tem a receber
// no mês e de quais clientes veio.
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { comissaoCarteiraMes, parceirosLista } from '@/lib/gestao/consultas'
import { participacaoReceita, regrasDoParceiroPorCorretora, regrasReceita } from '@/lib/gestao/consultasParticipacao'
import { pctComum, resumirReceita, textoDaRegra } from '@/lib/gestao/participacao'
import { normTexto } from '@/lib/texto'
import { mesAtual, mesCurto, mesLongo, parseMes } from '@/lib/gestao/meses'
import { CORRETORA_LABEL, corretorasDoPerfil, isCorretora } from '@/lib/corretoras'
import { totaisExtrato } from '@/lib/gestao/extrato'
import { fmtBRL2, fmtNum } from '@/lib/format'
import { hojeBrasil } from '@/lib/periodo'
import { Marca } from '@/components/ui/Marca'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { rCurto } from '@/components/gestao/Celulas'
import { TabelaExtrato } from '@/components/gestao/TabelaExtrato'
import { TabelaReceitaParceiro } from '@/components/gestao/TabelaReceitaParceiro'
import { ParticipacaoBtg } from '@/app/(app)/comissoes/ParticipacaoBtg'
import { BotaoImprimir } from './BotaoImprimir'

export default async function ExtratoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'vendedor')) redirect('/login')
  const sp = await searchParams
  const q = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  const parceiros = await parceirosLista()
  const pedido = normTexto(q('parceiro'))
  const parceiro = (parceiros.find(p => normTexto(p.nome) === pedido) ?? parceiros[0])?.nome ?? null
  if (!parceiro) redirect('/comissoes')
  const corretoraParam = q('corretora')
  const corretora = isCorretora(corretoraParam) ? corretoraParam : null
  const mesRef = parseMes(q('mes')) ?? mesAtual()
  const comReceita = q('receita') !== '0'
  // participação na receita: só nas corretoras que o usuário vê, dentro do filtro, e só no extrato com receita
  const minhas = corretorasDoPerfil(profile)
  const regrasDele = comReceita ? regrasDoParceiroPorCorretora(await regrasReceita(minhas), parceiro) : []
  const regras = corretora ? regrasDele.filter(r => r.corretora === corretora) : regrasDele
  // quem tem essa participação e também segue a divisão da comissão do BTG ganha o bloco do BTG (só quando há valor)
  const comBtg = regrasDele.length > 0 && minhas.includes('BTG') && (!corretora || corretora === 'BTG')
  const [linhas, livros] = await Promise.all([
    comissaoCarteiraMes(parceiro, corretora, mesRef),
    Promise.all(regras.map(r => participacaoReceita(r.corretora, r.regras, parceiro))),
  ])
  const t = totaisExtrato(linhas)
  const emitido = hojeBrasil().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  // o bloco só aparece do mês em que a regra começa em diante
  const inicio = livros.map(l => l.regras[0]?.desde).filter(Boolean).sort()[0] ?? null
  const part = inicio && mesRef >= inicio ? resumirReceita(livros, mesRef) : null
  const ultima = livros.map(l => l.ultimaData).filter((d): d is string => !!d && d.startsWith(mesRef.slice(0, 7))).sort().at(-1) ?? null
  const parcial = mesRef === mesAtual()
  const de = (parte: 'pctCorretagem' | 'pctZeragem' | 'pctIncentivo', bruto: number) => {
    const p = part ? pctComum(part.regras, parte) : ''
    return `${p ? `${p} de ` : 'sobre '}${fmtBRL2(bruto)}`
  }

  return (
    <div className="claro min-h-screen bg-bg text-fg" style={{ colorScheme: 'light' }}>
      <div className="mx-auto max-w-5xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <div className="flex items-center gap-2"><Marca className="h-6 w-8" /><span className="text-section font-semibold">Zeve Controle</span></div>
            <h1 className="mt-4 text-title font-bold">Extrato de {parceiro}</h1>
            <p className="mt-1 text-dense text-fg-muted">
              {mesLongo(mesRef)}{corretora ? ` · ${CORRETORA_LABEL[corretora]}` : ' · todas as corretoras'} · emitido em {emitido}
            </p>
          </div>
          <BotaoImprimir />
        </header>

        {part && (
          <section className="mt-6">
            <h2 className="text-section font-semibold">Participação na receita</h2>
            <p className="mt-0.5 text-dense text-fg-muted">
              {livros.map(l => `${textoDaRegra(l.regras[l.regras.length - 1])} dos clientes ${l.assessores.length ? `do código ${l.assessores.join(', ')}` : 'dele'} na ${CORRETORA_LABEL[l.corretora]}`).join('; ')}.
              {parcial ? ` Mês em andamento: ${ultima ? `lotes até ${ultima.slice(8, 10)}/${ultima.slice(5, 7)}` : 'sem lotes ainda'}; o incentivo pode subir até o fechamento.` : ''}
            </p>
            <KpiRow cols={4} className="my-4">
              <KpiCard label={`A receber de ${mesCurto(mesRef)}`} value={fmtBRL2(part.mes.total)} sub={parcial ? 'parcial' : 'corretagem, zeragem e incentivo'} />
              <KpiCard label="Corretagem" value={fmtBRL2(part.mes.parteCorretagem)} sub={`${de('pctCorretagem', part.mes.corretagem)} · ${fmtNum(part.mes.lotes)} lotes`} />
              <KpiCard label="Zeragem" value={fmtBRL2(part.mes.parteZeragem)} sub={`${de('pctZeragem', part.mes.zeragem)} · ${fmtNum(part.mes.zerados)} ${part.mes.zerados === 1 ? 'contrato zerado' : 'contratos zerados'}`} />
              <KpiCard label="Incentivo" value={fmtBRL2(part.mes.parteIncentivo)} sub={`${de('pctIncentivo', part.mes.incentivo)} · ${fmtNum(part.mes.comFaixa)} ${part.mes.comFaixa === 1 ? 'cliente com faixa' : 'clientes com faixa'}`} />
            </KpiRow>
            <div className="tbl-wrap">
              <TabelaReceitaParceiro linhas={part.linhas} totais={part.mes} parceiro={parceiro} comCorretora={livros.length > 1} impressao vazio={`Nenhum cliente de ${parceiro} operou em ${mesLongo(mesRef)}.`} />
            </div>
          </section>
        )}
        {comBtg && <div className="mt-8"><ParticipacaoBtg parceiro={parceiro} mesRef={mesRef} impressao /></div>}
        {(part || comBtg) && <h2 className="mt-8 text-section font-semibold">Carteira completa</h2>}

        <KpiRow cols={comReceita ? 3 : 2} className={part ? 'mb-6 mt-3' : 'my-6'}>
          <KpiCard label="Contas na carteira" value={fmtNum(t.contas)} sub={`${fmtNum(t.giraram)} ${t.giraram === 1 ? 'girou' : 'giraram'} em ${mesCurto(mesRef)}`} />
          <KpiCard label={`Lotes em ${mesCurto(mesRef)}`} value={fmtNum(t.lotes_mes)} sub={`${fmtNum(t.lotes_12m)} nos 12 meses até ${mesCurto(mesRef)}`} />
          {comReceita && <KpiCard label={`Receita bruta em ${mesCurto(mesRef)}`} value={rCurto(t.receita_mes)} sub={`${rCurto(t.receita_12m)} nos 12 meses`} />}
        </KpiRow>

        <div className="tbl-wrap">
          <TabelaExtrato linhas={linhas} comReceita={comReceita} impressao vazio={`Nenhuma conta na carteira de ${parceiro}${corretora ? ` na ${CORRETORA_LABEL[corretora]}` : ''}.`} />
        </div>

        <p className="mt-6 text-label text-fg-subtle">
          Contas atribuídas ao parceiro: lead ganho, parceiro informado na ficha, assessor ligado ao parceiro ou responsável interno.
          Lotes = contratos operados no mês, pelo relatório da corretora.{comReceita ? ' Receita bruta = corretagem, zeragem e operações avulsas, antes de repasse e impostos.' : ''}
          {part ? ' Participação na receita: entra o que foi operado enquanto a conta estava no código do parceiro; corretagem = lotes × tarifa, zeragem = contratos zerados × o valor da zeragem e incentivo = o que a corretora paga pelo cliente no mês, pela faixa de pontos.' : ''}
        </p>
      </div>
    </div>
  )
}
