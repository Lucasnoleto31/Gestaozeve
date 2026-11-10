// As outras abas de um parceiro: Extrato (para enviar), Pagamentos e regras, Carteira e Retorno
// (o que as contas dele renderam ao escritório, comparado com a comissão).
import Link from 'next/link'
import { comissaoCarteiraMes, comissaoContasMes, comissaoItens, comissaoMensal, comissaoPagamentos, comissaoRegras } from '@/lib/gestao/consultas'
import { linhasPlanilha, nomeArquivoExtrato, totaisExtrato } from '@/lib/gestao/extrato'
import { janelaMeses, mesCurto, mesLongo } from '@/lib/gestao/meses'
import { CORRETORA_LABEL, CORRETORA_SLUG, isCorretora } from '@/lib/corretoras'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { LinhaVazia, TRACO, dataCurta, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { TabelaExtrato } from '@/components/gestao/TabelaExtrato'
import { ExtratoAcoes } from './ExtratoAcoes'
import { PagamentosComissao } from './PagamentosComissao'
import { RegrasComissao } from './RegrasComissao'
import { SITUACAO, TIPO, corretoraNome, hrefComissoes, linhasPorMes, origemTexto, round2, somaLinhas, type FiltroAba } from './comum'

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
      <KpiRow cols={4}>
        <KpiCard label="Contas na carteira" value={fmtNum(t.contas)} sub={`de ${parceiro}${filtroCorretora}`} />
        <KpiCard label={`Giraram em ${mesCurto(mesRef)}`} value={fmtNum(t.giraram)} sub={t.contas ? `${fmtNum(Math.round((t.giraram / t.contas) * 100))}% da carteira` : undefined} />
        <KpiCard label={`Lotes em ${mesCurto(mesRef)}`} value={fmtNum(t.lotes_mes)} sub={`${fmtNum(t.lotes_12m)} em 12 meses`} />
        <KpiCard destaque label={`Receita bruta em ${mesCurto(mesRef)}`} value={rCurto(t.receita_mes)} sub={`${rCurto(t.receita_12m)} em 12 meses`} />
      </KpiRow>
      <Panel title={`Extrato de ${mesLongo(mesRef)}`} subtitle="Para enviar ao parceiro: todas as contas da carteira com lotes e receita bruta do mês e dos 12 meses. A planilha e a versão para imprimir têm as mesmas colunas."
        action={<ExtratoAcoes matriz={linhasPlanilha(carteiraMes, true)} nomeArquivo={nomeArquivoExtrato(parceiro, mesRef, corretora)} hrefImpressao={hrefImpressao} />}>
        <div className="tbl-wrap max-h-[75vh]">
          <TabelaExtrato linhas={carteiraMes} comReceita vazio={`Nenhuma conta na carteira de ${parceiro}${filtroCorretora}.`} />
        </div>
      </Panel>
    </>
  )
}

// ── Pagamentos e regras ──────────────────────────────────────────────────────
export async function AbaPagamentos({ parceiro, admin }: { parceiro: string; admin: boolean }) {
  const [pagamentos, regras] = await Promise.all([comissaoPagamentos(parceiro), comissaoRegras(parceiro)])
  const prazo = regras[0]?.prazo_ativacao_dias ?? 60
  const mesesReativacao = regras[0]?.reativacao_meses ?? 4
  return (
    <>
      <div className="grid gap-8 xl:grid-cols-2">
        <PagamentosComissao parceiro={parceiro} pagamentos={pagamentos} admin={admin} />
        <RegrasComissao parceiro={parceiro} regras={regras} admin={admin} />
      </div>
      <Panel title="Como a comissão é calculada">
        <ul className="max-w-3xl list-disc space-y-1 pl-5 text-dense text-fg-muted">
          <li><span className="text-fg">Abertura</span>: conta migrada na corretora.</li>
          <li><span className="text-fg">Ativação</span>: primeira operação em até {prazo} dias da abertura.</li>
          <li><span className="text-fg">Reativação</span>: cliente da carteira que volta a operar depois de {mesesReativacao} meses sem girar (vale como ativação).</li>
          <li>O valor por conta segue a faixa alcançada no mês, pela regra vigente na data do evento.</li>
          <li>Conta atribuída na campanha de ativação não gera abertura: só ativação e reativação.</li>
        </ul>
      </Panel>
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
  return (
    <Panel title={`Carteira · ${fmtNum(itens.length)} contas`}
      subtitle="Entram: lead que virou cliente, cliente com o parceiro na ficha, cliente de um assessor ligado ao parceiro, cliente cujo responsável interno é o parceiro e conta atribuída a ele na campanha de ativação.">
      <div className="tbl-wrap max-h-[75vh]">
        <table className="tbl tbl-dense">
          <thead>
            <tr>
              <th>Cliente</th><th className="col-p2">Corretora</th><th className="col-p3">Origem</th><th className="col-p2">Abertura</th><th className="col-p2">Ativação</th><th className="col-p3">Prazo até</th>
              <th>Situação</th><th className="col-p2">Reativações</th><th className="num">R$ abertura</th><th className="num">R$ ativação</th>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 && <LinhaVazia colunas={10}>Nenhuma conta atribuída a {parceiro}{filtroCorretora}.</LinhaVazia>}
            {itens.map(i => {
              const slug = isCorretora(i.corretora) ? CORRETORA_SLUG[i.corretora] : null
              return (
                <tr key={`${i.cliente_id}:${i.corretora}`}>
                  <td className="max-w-[240px] truncate font-medium">{slug ? <Link href={`/${slug}/clientes/${i.cliente_id}`} className="link">{i.nome}</Link> : i.nome}</td>
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
                <td colSpan={6}>{fmtNum(abertas)} abertas · {fmtNum(ativacoes)} ativações</td>
                <td>{n0(noPrazo)} no prazo</td>
                <td className="col-p2">{n0(reativacoes)} reativações</td>
                <td className="num">{r0(totalAbertura)}</td>
                <td className="num">{r0(totalAtivacao)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Panel>
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

  return (
    <>
      <KpiRow cols={4}>
        <KpiCard label={`Receita das contas de ${mes}`} value={rCurto(doMesLinha.receita)} sub={`${fmtNum(doMesLinha.contas)} ${doMesLinha.contas === 1 ? 'conta com evento' : 'contas com evento'} no mês`} />
        <KpiCard label={`Comissão de ${mes}`} value={rCurto(doMesLinha.comissao)} sub="abertura, ativação e reativação" />
        <KpiCard destaque label="Líquido do escritório" value={rCurto(liquidoMes)} sub={liquidoMes < 0 ? 'conta nova rende pouco no primeiro mês' : 'receita das contas do mês menos a comissão'} />
        <KpiCard label={`Carteira inteira em ${mes}`} value={rCurto(doMesLinha.carteira)} sub="receita bruta de todas as contas do parceiro" />
      </KpiRow>

      <Panel title="Receita e comissão por mês" subtitle="Receita bruta (corretagem, zeragem e avulsas, antes de repasse e impostos) das contas com abertura, ativação ou reativação em cada mês, ao lado da comissão paga por elas.">
        <GraficoSeries dados={grafico} formato="brl" altura={240}
          series={[{ key: 'receita', nome: 'Receita bruta das contas', tipo: 'bar' }, { key: 'comissao', nome: 'Comissão', tipo: 'bar' }]} />
        <div className="tbl-wrap mt-4">
          <table className="tbl tbl-dense">
            <thead><tr><th>Mês</th><th className="num col-p2">Contas</th><th className="num">Receita bruta</th><th className="num">Comissão</th><th className="num">Líquido do escritório</th><th className="num col-p3">Carteira inteira</th></tr></thead>
            <tbody>
              {[...porMes].reverse().map(x => {
                const liquido = x.receita - x.comissao
                return (
                  <tr key={x.mes} className={cn(x.mes === mesRef && 'bg-accent-soft')}>
                    <td className="font-medium"><Link href={hrefComissoes({ parceiro, corretora, mes: x.mes, aba: 'retorno' })} className="link">{mesLongo(x.mes)}</Link></td>
                    <td className={cn('num col-p2', !x.contas && 'subtle')}>{n0(x.contas)}</td>
                    <td className={cn('num', !x.receita && 'subtle')}>{r0(x.receita)}</td>
                    <td className={cn('num', !x.comissao && 'subtle')}>{r0(x.comissao)}</td>
                    <td className={cn('num font-medium', liquido < 0 ? 'text-loss' : !liquido && 'subtle')}>{r0(liquido)}</td>
                    <td className={cn('num col-p3', !x.carteira && 'subtle')}>{r0(x.carteira)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="total">
                <td>12 meses</td>
                <td className="num col-p2">{n0(tot.contas)}</td>
                <td className="num">{r0(tot.receita)}</td>
                <td className="num">{r0(tot.comissao)}</td>
                <td className={cn('num', tot.receita - tot.comissao < 0 && 'text-loss')}>{r0(tot.receita - tot.comissao)}</td>
                <td className="num col-p3">{r0(tot.carteira)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      <Panel title={`Contas de ${mesLongo(mesRef)} · quanto renderam`} subtitle="A receita bruta que cada conta do mês gerou no próprio mês e do mês do evento até hoje.">
        <div className="tbl-wrap max-h-[70vh]">
          <table className="tbl tbl-dense">
            <thead><tr><th>Cliente</th><th className="col-p2">Corretora</th><th>Evento</th><th className="num col-p2">Lotes no mês</th><th className="num">Receita no mês</th><th className="num">Receita desde então</th><th className="num">Comissão</th></tr></thead>
            <tbody>
              {doMes.length === 0 && <LinhaVazia colunas={7}>Nenhuma conta com evento em {mesLongo(mesRef)}.</LinhaVazia>}
              {doMes.map(e => {
                const slug = isCorretora(e.corretora) ? CORRETORA_SLUG[e.corretora] : null
                const t = TIPO[e.tipo]
                return (
                  <tr key={`${e.cliente_id}:${e.corretora}:${e.tipo}:${e.data}`}>
                    <td className="max-w-[240px] truncate font-medium">{slug ? <Link href={`/${slug}/clientes/${e.cliente_id}`} className="link">{e.nome}</Link> : e.nome}</td>
                    <td className="muted col-p2">{corretoraNome(e.corretora)}</td>
                    <td><Badge variant={t.variant}>{t.label}</Badge></td>
                    <td className={cn('num col-p2', !e.lotes_mes && 'subtle')}>{n0(e.lotes_mes)}</td>
                    <td className={cn('num', !e.receita_mes && 'subtle')}>{r0(e.receita_mes)}</td>
                    <td className={cn('num', !e.receita_desde && 'subtle')}>{r0(e.receita_desde)}</td>
                    <td className={cn('num', !e.valor && 'subtle')}>{r0(e.valor)}</td>
                  </tr>
                )
              })}
            </tbody>
            {doMes.length > 0 && (
              <tfoot>
                <tr className="total">
                  <td colSpan={3}>{fmtNum(unicas.length)} {unicas.length === 1 ? 'conta' : 'contas'}</td>
                  <td className="num col-p2">{n0(lotes)}</td>
                  <td className="num">{r0(receita)}</td>
                  <td className="num">{r0(desde)}</td>
                  <td className="num">{r0(doMes.reduce((s, e) => s + e.valor, 0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Panel>
    </>
  )
}
