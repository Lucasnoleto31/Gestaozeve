// As outras abas de um parceiro: Extrato (para enviar), Pagamentos e regras, Carteira e Retorno
// (o que as contas dele renderam ao escritório, comparado com a comissão).
import Link from 'next/link'
import { comissaoCarteiraMes, comissaoContasMes, comissaoItens, comissaoMensal, comissaoPagamentos, comissaoRegras } from '@/lib/gestao/consultas'
import type { RegrasCorretora } from '@/lib/gestao/consultasParticipacao'
import type { ParceiroRepasse } from '@/lib/gestao/btg'
import { textoDaRegraCom } from '@/lib/gestao/participacao'
import { listaDaCorretora } from '@/lib/gestao/consultasParceirosCliente'
import { emVigor } from '@/lib/gestao/parceirosCliente'
import { getProfile } from '@/lib/auth/getProfile'
import { normTexto } from '@/lib/texto'
import { linhasPlanilha, nomeArquivoExtrato, totaisExtrato } from '@/lib/gestao/extrato'
import { janelaMeses, mesAtual, mesCurto, mesLongo } from '@/lib/gestao/meses'
import { CORRETORA_LABEL, CORRETORA_SLUG, corretorasDoPerfil, isCorretora, type Corretora } from '@/lib/corretoras'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Dica } from '@/components/ui/Dica'
import { Resumo } from '@/components/gestao/Resumo'
import { LinhaVazia, TRACO, dataCurta, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { TabelaExtrato } from '@/components/gestao/TabelaExtrato'
import { ExtratoAcoes } from './ExtratoAcoes'
import { PagamentosComissao } from './PagamentosComissao'
import { RegrasComissao } from './RegrasComissao'
import { MostrarMais } from './MostrarMais'
import { RecolheNoCelular } from '@/components/ui/RecolheNoCelular'
import { SeloLista } from './SeloLista'
import { SITUACAO, TIPO, alemDoLimite, corretoraNome, hrefComissoes, linhasPorMes, listaDireita, origemTexto, round2, somaLinhas, type FiltroAba } from './comum'

// A carteira e o extrato vêm dos critérios de sempre (lead, campo Parceiro da ficha, código do assessor…).
// O cliente em que o parceiro está só na lista de parceiros da ficha (S61), com percentual próprio, pode não
// estar neles: a nota diz quantos são e onde aparecem, para as abas não parecerem incompletas.
async function NotaDaLista({ parceiro, corretora }: { parceiro: string; corretora: Corretora | null }) {
  const profile = await getProfile()
  const minhas = profile ? corretorasDoPerfil(profile) : []
  const listas = await Promise.all(minhas.filter(c => !corretora || c === corretora).map(c => listaDaCorretora(c)))
  const mes = mesAtual()
  const n = new Set(listas.flat().filter(l => normTexto(l.parceiro) === normTexto(parceiro) && emVigor(l, mes)).map(l => `${l.corretora}:${l.cliente_id}`)).size
  if (!n) return null
  return (
    <p className="mt-3 text-label text-fg-subtle max-md:text-fg-muted">
      {parceiro} também está na lista de parceiros da ficha de {fmtNum(n)} {n === 1 ? 'cliente' : 'clientes'}, com percentual próprio. O valor de cada um aparece no Resumo, mesmo quando o cliente não está nesta carteira.
    </p>
  )
}

// ── Extrato ──────────────────────────────────────────────────────────────────
export async function AbaExtrato({ parceiro, corretora, mesRef }: FiltroAba) {
  const carteiraMes = await comissaoCarteiraMes(parceiro, corretora, mesRef)
  const t = totaisExtrato(carteiraMes)
  const filtroCorretora = corretora ? ` na ${CORRETORA_LABEL[corretora]}` : ''
  const hrefImpressao = (() => {
    const p = new URLSearchParams({ parceiro, mes: mesRef.slice(0, 7) })
    if (corretora) p.set('corretora', corretora)
    return `/extrato?${p.toString()}`
  })()
  return (
    <>
      {/* filtro de corretora que sobrou de outro parceiro: diz que aqui não há nada e mostra a saída */}
      {corretora && carteiraMes.length === 0 && (
        <Alert tone="neutral" title={`${parceiro} não tem contas na ${CORRETORA_LABEL[corretora]}`}>
          O filtro de corretora está na {CORRETORA_LABEL[corretora]}. <Link href={hrefComissoes({ parceiro, mes: mesRef, aba: 'extrato' })} className="link">Ver todas as corretoras</Link>.
        </Alert>
      )}
      {/* Celular (DESIGN.md §8): a frase diz quantas contas giraram; os dois cartões ficam com a receita e os lotes
          do mês (a ordem do computador volta por classe) e as contagens, que a frase já traz, saem da faixa */}
      {t.contas > 0 && (
        <div className="md:hidden">
          <Resumo frase={`${fmtNum(t.giraram)} das ${fmtNum(t.contas)} contas de ${parceiro}${filtroCorretora} giraram em ${mesCurto(mesRef)} (${fmtNum(Math.round((t.giraram / t.contas) * 100))}% da carteira).`} />
        </div>
      )}
      <KpiRow cols={4}>
        <KpiCard destaque className="md:order-4" label={`Receita bruta em ${mesCurto(mesRef)}`} value={rCurto(t.receita_mes)} sub={`${rCurto(t.receita_12m)} em 12 meses`} />
        <KpiCard className="md:order-3" label={`Lotes em ${mesCurto(mesRef)}`} value={fmtNum(t.lotes_mes)} sub={`${fmtNum(t.lotes_12m)} em 12 meses`} />
        <KpiCard className={cn('md:order-1', t.contas > 0 && 'max-md:hidden!')} label="Contas na carteira" value={fmtNum(t.contas)} sub={`de ${parceiro}${filtroCorretora}`} />
        <KpiCard className={cn('md:order-2', t.contas > 0 && 'max-md:hidden!')} label={`Giraram em ${mesCurto(mesRef)}`} value={fmtNum(t.giraram)} sub={t.contas ? `${fmtNum(Math.round((t.giraram / t.contas) * 100))}% da carteira` : undefined} />
      </KpiRow>
      <Panel title={`Extrato de ${mesLongo(mesRef)}`}
        subtitle={<><span className="max-md:hidden">Para enviar ao parceiro: todas as contas da carteira com lotes e receita bruta do mês e dos 12 meses. A planilha e a versão para imprimir têm as mesmas colunas.</span><span className="md:hidden">Para enviar ao parceiro. A planilha e a versão para imprimir trazem todas as colunas: conta, abertura, zerados e os 12 meses.</span></>}
        action={<ExtratoAcoes matriz={linhasPlanilha(carteiraMes, true)} nomeArquivo={nomeArquivoExtrato(parceiro, mesRef, corretora)} hrefImpressao={hrefImpressao} />}>
        <MostrarMais total={carteiraMes.length}>
        <div className="tbl-wrap max-h-[75vh]">
          <TabelaExtrato linhas={carteiraMes} comReceita vazio={`Nenhuma conta na carteira de ${parceiro}${filtroCorretora}.`} classeLinha={alemDoLimite} />
        </div>
        </MostrarMais>
        <NotaDaLista parceiro={parceiro} corretora={corretora} />
      </Panel>
    </>
  )
}

// ── Pagamentos e regras ──────────────────────────────────────────────────────
// receita = regras de participação em corretagem, zeragem e incentivo do parceiro (parceiros_receita), por
// corretora. Quem só recebe assim não tem regra por conta: o bloco de regras de abertura e ativação some.
// btg = a regra do mesmo parceiro na divisão da comissão do BTG (repasse_parceiros), quando ele tem.
export async function AbaPagamentos({ parceiro, admin, comissionado = true, receita = [], btg = null }: { parceiro: string; admin: boolean; comissionado?: boolean; receita?: RegrasCorretora[]; btg?: ParceiroRepasse | null }) {
  const [pagamentos, regras] = await Promise.all([comissaoPagamentos(parceiro), comissaoRegras(parceiro)])
  const prazo = regras[0]?.prazo_ativacao_dias ?? 60
  const mesesReativacao = regras[0]?.reativacao_meses ?? 4
  // regras por conta: para o comissionado, para quem já tem alguma e para quem não recebe de outro jeito
  const porConta = comissionado || regras.length > 0 || (receita.length === 0 && !btg)
  return (
    <>
      {/* No celular a aba abre pelos pagamentos; os blocos de regra em texto ficam recolhidos, um toque cada */}
      <div className={cn('grid gap-8 max-md:gap-6', porConta && 'xl:grid-cols-2')}>
        <PagamentosComissao parceiro={parceiro} pagamentos={pagamentos} admin={admin} />
        {porConta && <RegrasComissao parceiro={parceiro} regras={regras} admin={admin} />}
      </div>
      {(receita.length > 0 || btg) && (
        <RecolheNoCelular titulo="Regra de participação">
        <Panel title={<span className="max-md:hidden">Regra de participação</span>} subtitle={`O que ${parceiro} recebe sobre o que os clientes dele geram. O valor de cada mês e o saldo estão na aba Resumo.`}>
          <ul className="max-w-3xl list-disc space-y-1 pl-5 text-dense text-fg-muted">
            {receita.flatMap(r => r.regras.map(x => (
              <li key={`${r.corretora}:${x.desde}`}><span className="text-fg">{CORRETORA_LABEL[r.corretora]}, desde {mesLongo(x.desde)}</span>: {textoDaRegraCom(x, 'dos clientes dos códigos de assessor ligados a ele')}.</li>
            )))}
            {btg && (
              <li><span className="text-fg">BTG</span>: {btg.pctParceiro.toLocaleString('pt-BR')} % da comissão que o BTG paga sobre os clientes dele (corretagem e zeragem), depois do imposto; clientes dele são os que têm {parceiro} no campo Parceiro da ficha.</li>
            )}
            <li>Cliente com lista de parceiros na ficha (Editar › Parceiros do cliente): vale o percentual de {parceiro} na lista, em qualquer código nosso, no lugar da regra geral.</li>
            <li>Onde mudar: {receita.length > 0 ? 'os percentuais ficam nos Parâmetros da corretora (Parceiros com participação na receita) e o código do parceiro, em Parâmetros › Assessores, coluna Parceiro' : ''}{receita.length > 0 && btg ? '; ' : ''}{btg ? 'a divisão do BTG fica em Parâmetros › BTG › Repasse' : ''}.</li>
          </ul>
        </Panel>
        </RecolheNoCelular>
      )}
      {porConta && (
        <RecolheNoCelular titulo="Como a comissão é calculada">
        <Panel title={<span className="max-md:hidden">Como a comissão é calculada</span>}>
          <ul className="max-w-3xl list-disc space-y-1 pl-5 text-dense text-fg-muted">
            <li><span className="text-fg">Abertura</span>: conta migrada na corretora.</li>
            <li><span className="text-fg">Ativação</span>: primeira operação em até {prazo} dias da abertura.</li>
            <li><span className="text-fg">Reativação</span>: cliente da carteira que volta a operar depois de {mesesReativacao} meses sem girar (vale como ativação).</li>
            <li>O valor por conta segue a faixa alcançada no mês, pela regra vigente na data do evento.</li>
            <li>Conta atribuída na campanha de ativação não gera abertura: só ativação e reativação.</li>
          </ul>
        </Panel>
        </RecolheNoCelular>
      )}
    </>
  )
}

// ── Carteira ─────────────────────────────────────────────────────────────────
export async function AbaCarteira({ parceiro, corretora }: FiltroAba) {
  const itens = await comissaoItens(parceiro, corretora)
  const filtroCorretora = corretora ? ` na ${CORRETORA_LABEL[corretora]}` : ''
  const abertas = itens.filter(i => i.data_abertura).length
  const reativacoes = itens.reduce((s, i) => s + i.reativacoes, 0)
  const ativacoes = itens.filter(i => i.ativou_no_prazo).length + reativacoes
  const noPrazo = itens.filter(i => i.situacao === 'Aberto, no prazo').length
  const totalAbertura = itens.reduce((s, i) => s + i.valor_abertura, 0)
  const totalAtivacao = itens.reduce((s, i) => s + i.valor_ativacao, 0)
  const entram = 'Entram: lead que virou cliente, cliente com o parceiro na ficha, cliente de um assessor ligado ao parceiro, cliente cujo responsável interno é o parceiro e conta atribuída a ele na campanha de ativação.'
  return (
    <>
      {/* Celular (DESIGN.md §8): a frase com as contagens e os dois totais, que no computador são a linha de total */}
      {itens.length > 0 && (
        <div className="md:hidden">
          <Resumo frase={`A carteira de ${parceiro}${filtroCorretora} tem ${fmtNum(itens.length)} ${itens.length === 1 ? 'conta' : 'contas'}: ${fmtNum(abertas)} abertas, ${fmtNum(ativacoes)} ativações e ${fmtNum(noPrazo)} ainda no prazo.`}
            apoio={`Somam ${totalAbertura ? r0(totalAbertura) : 'R$ 0'} de abertura e ${totalAtivacao ? r0(totalAtivacao) : 'R$ 0'} de ativação.`} />
        </div>
      )}
      {/* No celular quem entra na carteira fica atrás do "i" ao lado do título; cada conta é uma linha que abre a
          ficha (tbl-lista): a situação primeiro, depois as datas e o que rendeu de abertura e de ativação (só o que
          tem valor). A linha de apoio é uma célula só de celular, para a situação vir na frente. */}
      <Panel title={<>Carteira · {fmtNum(itens.length)} contas<Dica className="ml-1.5 md:hidden" texto={entram} /></>} subtitle={<span className="max-md:hidden">{entram}</span>}>
        <MostrarMais total={itens.length}>
        <div className="tbl-wrap max-h-[75vh]">
          <table className="tbl tbl-dense tbl-lista lista-abre">
            <thead>
              <tr>
                <th>Cliente</th><th className="col-p2">Corretora</th><th className="col-p3">Origem</th><th className="col-p2">Abertura</th><th className="col-p2">Ativação</th><th className="col-p3">Prazo até</th>
                <th>Situação</th><th className="col-p2">Reativações</th><th className="num">R$ abertura</th><th className="num">R$ ativação</th>
              </tr>
            </thead>
            <tbody>
              {itens.length === 0 && <LinhaVazia colunas={10}>Nenhuma conta atribuída a {parceiro}{filtroCorretora}.</LinhaVazia>}
              {itens.map((i, n) => {
                const slug = isCorretora(i.corretora) ? CORRETORA_SLUG[i.corretora] : null
                const apoio = [
                  corretora ? null : corretoraNome(i.corretora),
                  i.data_abertura ? `aberta em ${dataCurta(i.data_abertura)}` : null,
                  i.data_ativacao ? `ativada em ${dataCurta(i.data_ativacao)}` : i.data_abertura && i.situacao === 'Aberto, no prazo' ? `prazo até ${dataCurta(i.limite_ativacao)}` : null,
                  i.reativacoes ? `${fmtNum(i.reativacoes)} ${i.reativacoes === 1 ? 'reativação' : 'reativações'}, última em ${dataCurta(i.ultima_reativacao)}` : null,
                  i.valor_abertura ? `abertura ${r0(i.valor_abertura)}` : null,
                  i.valor_ativacao ? `ativação ${r0(i.valor_ativacao)}` : null,
                ].filter(Boolean)
                return (
                  <tr key={`${i.cliente_id}:${i.corretora}`} className={alemDoLimite(n)}>
                    <td className="cel-titulo max-w-[240px] truncate font-medium">{slug ? <Link href={`/${slug}/clientes/${i.cliente_id}`} className="link">{i.nome}</Link> : i.nome}</td>
                    <td className="cel-sub md:hidden"><SeloLista variante={SITUACAO[i.situacao] ?? 'neutral'}>{i.situacao}</SeloLista>{apoio.map(a => ` · ${a}`).join('')}</td>
                    <td className="muted col-p2">{corretoraNome(i.corretora)}</td>
                    <td className="muted col-p3">{origemTexto(i.origem, i.data_lead, i.assessor_nome)}</td>
                    <td className="num col-p2">{dataCurta(i.data_abertura)}</td>
                    <td className="num col-p2">{dataCurta(i.data_ativacao)}</td>
                    <td className="num col-p3">{i.data_abertura ? dataCurta(i.limite_ativacao) : TRACO}</td>
                    <td><Badge variant={SITUACAO[i.situacao] ?? 'neutral'}>{i.situacao}</Badge></td>
                    <td className={cn('col-p2', !i.reativacoes && 'subtle')}>{i.reativacoes ? `${fmtNum(i.reativacoes)} · última ${dataCurta(i.ultima_reativacao)}` : TRACO}</td>
                    <td className={cn('num', !i.valor_abertura && 'subtle')}>{r0(i.valor_abertura)}</td>
                    <td className={cn('num', !i.valor_ativacao && 'subtle')}>{r0(i.valor_ativacao)}</td>
                  </tr>
                )
              })}
            </tbody>
            {itens.length > 0 && (
              <tfoot>
                <tr className="total">
                  <td colSpan={6} className="cel-titulo">{fmtNum(abertas)} abertas · {fmtNum(ativacoes)} ativações</td>
                  <td className={cn('cel-sub', !noPrazo && 'vazio')}>{n0(noPrazo)} no prazo</td>
                  <td className={cn('col-p2 cel-sub', !reativacoes && 'vazio')}>{n0(reativacoes)} reativações</td>
                  <td className={cn('num cel-sub', !totalAbertura && 'vazio')} data-rotulo="abertura">{r0(totalAbertura)}</td>
                  <td className={cn('num cel-sub', !totalAtivacao && 'vazio')} data-rotulo="ativação">{r0(totalAtivacao)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        </MostrarMais>
        <NotaDaLista parceiro={parceiro} corretora={corretora} />
      </Panel>
    </>
  )
}

// ── Retorno ──────────────────────────────────────────────────────────────────
export async function AbaRetorno({ parceiro, corretora, mesRef }: FiltroAba) {
  const meses = janelaMeses(mesRef, 12)
  const [mensal, eventos] = await Promise.all([comissaoMensal(mesRef, 12, parceiro, corretora), comissaoContasMes(parceiro, corretora, mesRef, 1)])
  const porMes = linhasPorMes(meses, mensal, [])
  const tot = somaLinhas(porMes)
  const doMesLinha = porMes.find(x => x.mes === mesRef) ?? porMes[porMes.length - 1]
  const liquidoMes = doMesLinha.receita - doMesLinha.comissao
  const mes = mesCurto(mesRef)
  const grafico = porMes.map(x => ({ label: mesCurto(x.mes), receita: round2(x.receita), comissao: round2(x.comissao) }))
  const doMes = eventos.filter(e => e.mes_ref === mesRef)
  // a receita da conta entra uma vez, mesmo com dois eventos no mês
  const unicas = [...new Map(doMes.map(e => [`${e.cliente_id}:${e.corretora}`, e])).values()]
  const lotes = unicas.reduce((s, e) => s + e.lotes_mes, 0), receita = unicas.reduce((s, e) => s + e.receita_mes, 0), desde = unicas.reduce((s, e) => s + e.receita_desde, 0)

  const sobreOGrafico = 'Receita bruta (corretagem, zeragem e avulsas, antes de repasse e impostos) das contas com abertura, ativação ou reativação em cada mês, ao lado da comissão paga por elas.'
  const sobreAsContas = 'A receita bruta que cada conta do mês gerou no próprio mês e do mês do evento até hoje.'
  return (
    <>
      {/* Celular (DESIGN.md §8): a conta da aba em uma frase, com os mesmos números dos cartões */}
      <div className="md:hidden">
        <Resumo frase={`As contas de ${mes} renderam ${doMesLinha.receita ? rCurto(doMesLinha.receita) : 'R$ 0'} e a comissão por elas foi de ${doMesLinha.comissao ? rCurto(doMesLinha.comissao) : 'R$ 0'}: líquido do escritório de ${liquidoMes ? rCurto(liquidoMes) : 'R$ 0'}.`} />
      </div>

      {/* No celular os dois primeiros ficam como cartão e os outros viram linha: o líquido do escritório (a resposta
          da aba) vem na frente; a ordem do computador volta por classe */}
      <KpiRow cols={4}>
        <KpiCard destaque className="md:order-3" label="Líquido do escritório" value={rCurto(liquidoMes)} sub={liquidoMes < 0 ? 'conta nova rende pouco no primeiro mês' : 'receita das contas do mês menos a comissão'} />
        <KpiCard className="md:order-1" label={`Receita das contas de ${mes}`} value={rCurto(doMesLinha.receita)} sub={`${fmtNum(doMesLinha.contas)} ${doMesLinha.contas === 1 ? 'conta com evento' : 'contas com evento'} no mês`} />
        <KpiCard className="md:order-2" label={`Comissão de ${mes}`} value={rCurto(doMesLinha.comissao)} sub="abertura, ativação e reativação" />
        <KpiCard className="md:order-4" label={`Carteira inteira em ${mes}`} value={rCurto(doMesLinha.carteira)} sub="receita bruta de todas as contas do parceiro" />
      </KpiRow>

      {/* No celular a explicação vai para o "i" ao lado do título e cada mês é uma linha que abre o mês (tbl-lista):
          o líquido do escritório à direita; contas, receita e comissão na linha de apoio. A carteira inteira do
          mês está no mês aberto (a última linha sob os cartões). O destaque do mês aberto fica só no computador. */}
      <Panel title={<>Receita e comissão por mês<Dica className="ml-1.5 md:hidden" texto={sobreOGrafico} /></>} subtitle={<span className="max-md:hidden">{sobreOGrafico}</span>}>
        <GraficoSeries dados={grafico} formato="brl" altura={240}
          series={[{ key: 'receita', nome: 'Receita bruta das contas', tipo: 'bar' }, { key: 'comissao', nome: 'Comissão', tipo: 'bar' }]} />
        <div className="tbl-wrap mt-4">
          <table className="tbl tbl-dense tbl-lista lista-abre" style={listaDireita('7rem')}>
            <thead><tr><th>Mês</th><th className="num col-p2">Contas</th><th className="num">Receita bruta</th><th className="num">Comissão</th><th className="num">Líquido do escritório</th><th className="num col-p3">Carteira inteira</th></tr></thead>
            <tbody>
              {[...porMes].reverse().map(x => {
                const liquido = x.receita - x.comissao
                return (
                  <tr key={x.mes} className={cn(x.mes === mesRef && 'md:bg-accent-soft')}>
                    <td className="cel-titulo font-medium"><Link href={hrefComissoes({ parceiro, corretora, mes: x.mes, aba: 'retorno' })} className="link">{mesLongo(x.mes)}</Link></td>
                    <td className={cn('num col-p2 cel-sub', !x.contas && 'subtle vazio')}>{n0(x.contas)}<span className="md:hidden"> {x.contas === 1 ? 'conta' : 'contas'}</span></td>
                    <td className={cn('num cel-sub', !x.receita && 'subtle vazio')} data-rotulo={'receita\u00a0bruta'}>{r0(x.receita)}</td>
                    <td className={cn('num cel-sub', !x.comissao && 'subtle vazio')} data-rotulo="comissão">{r0(x.comissao)}</td>
                    <td className={cn('num cel-valor font-medium', liquido < 0 ? 'text-loss' : !liquido && 'subtle')}><span className={cn(liquido < 0 ? 'max-md:text-loss' : !liquido && 'max-md:text-fg-subtle')}>{r0(liquido)}</span></td>
                    <td className={cn('num col-p3', !x.carteira && 'subtle')}>{r0(x.carteira)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="total">
                <td className="cel-titulo">12 meses</td>
                <td className={cn('num col-p2 cel-sub', !tot.contas && 'vazio')}>{n0(tot.contas)}<span className="md:hidden"> {tot.contas === 1 ? 'conta' : 'contas'}</span></td>
                <td className={cn('num cel-sub', !tot.receita && 'vazio')} data-rotulo={'receita\u00a0bruta'}>{r0(tot.receita)}</td>
                <td className={cn('num cel-sub', !tot.comissao && 'vazio')} data-rotulo="comissão">{r0(tot.comissao)}</td>
                <td className={cn('num cel-valor', tot.receita - tot.comissao < 0 && 'text-loss')}>{r0(tot.receita - tot.comissao)}</td>
                <td className={cn('num col-p3 cel-sub', !tot.carteira && 'vazio')} data-rotulo={'carteira\u00a0inteira'}>{r0(tot.carteira)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      {/* No celular cada conta é uma linha que abre a ficha: o evento, os lotes, a receita do mês e a comissão na
          linha de apoio; a receita desde o evento (o retorno da conta) à direita */}
      <Panel title={<>Contas de {mesLongo(mesRef)} · quanto renderam<Dica className="ml-1.5 md:hidden" texto={sobreAsContas} /></>} subtitle={<span className="max-md:hidden">{sobreAsContas}</span>}>
        <MostrarMais total={doMes.length}>
        <div className="tbl-wrap max-h-[70vh]">
          <table className="tbl tbl-dense tbl-lista lista-abre" style={listaDireita('7rem')}>
            <thead><tr><th>Cliente</th><th className="col-p2">Corretora</th><th>Evento</th><th className="num col-p2">Lotes no mês</th><th className="num">Receita no mês</th><th className="num">Receita desde então</th><th className="num">Comissão</th></tr></thead>
            <tbody>
              {doMes.length === 0 && <LinhaVazia colunas={7}>Nenhuma conta com evento em {mesLongo(mesRef)}.</LinhaVazia>}
              {doMes.map((e, i) => {
                const slug = isCorretora(e.corretora) ? CORRETORA_SLUG[e.corretora] : null
                const t = TIPO[e.tipo]
                return (
                  <tr key={`${e.cliente_id}:${e.corretora}:${e.tipo}:${e.data}`} className={alemDoLimite(i)}>
                    <td className="cel-titulo max-w-[240px] truncate font-medium">{slug ? <Link href={`/${slug}/clientes/${e.cliente_id}`} className="link">{e.nome}</Link> : e.nome}</td>
                    <td className={cn('muted col-p2', !corretora && 'cel-sub')}>{corretoraNome(e.corretora)}</td>
                    <td className="cel-sub"><SeloLista variante={t.variant}>{t.label}</SeloLista></td>
                    <td className={cn('num col-p2 cel-sub', !e.lotes_mes && 'subtle vazio')}>{n0(e.lotes_mes)}<span className="md:hidden"> {e.lotes_mes === 1 ? 'lote no mês' : 'lotes no mês'}</span></td>
                    <td className={cn('num cel-sub', !e.receita_mes && 'subtle vazio')} data-rotulo={'receita\u00a0no\u00a0mês'}>{r0(e.receita_mes)}</td>
                    <td className={cn('num cel-valor', !e.receita_desde && 'subtle')} data-rotulo={'desde\u00a0então'}><span className={cn(!e.receita_desde && 'max-md:text-fg-subtle')}>{r0(e.receita_desde)}</span></td>
                    <td className={cn('num cel-sub', !e.valor && 'subtle vazio')} data-rotulo="comissão">{r0(e.valor)}</td>
                  </tr>
                )
              })}
            </tbody>
            {doMes.length > 0 && (
              <tfoot>
                <tr className="total">
                  <td colSpan={3} className="cel-titulo">{fmtNum(unicas.length)} {unicas.length === 1 ? 'conta' : 'contas'}</td>
                  <td className={cn('num col-p2 cel-sub', !lotes && 'vazio')}>{n0(lotes)}<span className="md:hidden"> {lotes === 1 ? 'lote no mês' : 'lotes no mês'}</span></td>
                  <td className={cn('num cel-sub', !receita && 'vazio')} data-rotulo={'receita\u00a0no\u00a0mês'}>{r0(receita)}</td>
                  <td className="num cel-valor" data-rotulo={'desde\u00a0então'}>{r0(desde)}</td>
                  <td className="num cel-sub" data-rotulo="comissão">{r0(doMes.reduce((s, e) => s + e.valor, 0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        </MostrarMais>
      </Panel>
    </>
  )
}
