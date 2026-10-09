export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { comissaoContasMes, comissaoItens, comissaoMensal, comissaoPagamentos, comissaoRegras, parceirosComissionados } from '@/lib/gestao/consultas'
import { lerFaixasComissao, resumirComissao, valorDaFaixa } from '@/lib/gestao/comissao'
import { janelaMeses, mesAtual, mesCurto, mesLongo, parseMes } from '@/lib/gestao/meses'
import type { ComissaoContaMes, ComissaoItem, ComissaoMensalRow, ComissaoPagamento } from '@/lib/gestao/tipos'
import { CORRETORAS, CORRETORA_LABEL, CORRETORA_SLUG, isCorretora } from '@/lib/corretoras'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Alert } from '@/components/ui/Alert'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import { MesPicker, SelectParam } from '@/components/gestao/Filtros'
import { LinhaVazia, TRACO, dataCurta, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { PagamentosComissao } from './PagamentosComissao'
import { RegrasComissao } from './RegrasComissao'

const SITUACAO: Record<string, BadgeVariant> = {
  'Ativado': 'gain', 'Reativado': 'gain', 'Aberto, no prazo': 'accent', 'Prazo vencido': 'warn', 'Operou fora do prazo': 'warn',
  'Conta anterior ao lead': 'neutral', 'Em processamento': 'neutral', 'Recusou': 'loss',
}
const TIPO: Record<ComissaoContaMes['tipo'], { label: string; variant: BadgeVariant }> = {
  abertura: { label: 'Abertura', variant: 'accent' },
  ativacao: { label: 'Ativação', variant: 'gain' },
  reativacao: { label: 'Reativação', variant: 'warn' },
}
const CORRETORA_NOME = (c: string) => (isCorretora(c) ? CORRETORA_LABEL[c] : c)
const round2 = (v: number) => Math.round(v * 100) / 100

function origemTexto(origem: ComissaoItem['origem'], dataLead: string | null, assessor: string | null): string {
  if (origem === 'lead') return dataLead ? `lead em ${dataCurta(dataLead)}` : 'lead'
  if (origem === 'assessor') return `assessor ${assessor ?? ''}`.trim()
  if (origem === 'responsavel') return 'responsável interno' + (assessor ? ` · ${assessor}` : '')
  return 'parceiro na ficha'
}

type LinhaMes = { mes: string; aberturas: number; ativacoes: number; reativacoes: number; contas: number; receita: number; carteira: number; comissao: number; pago: number }
const linhaVazia = (mes: string): LinhaMes => ({ mes, aberturas: 0, ativacoes: 0, reativacoes: 0, contas: 0, receita: 0, carteira: 0, comissao: 0, pago: 0 })

// Soma o mensal (por corretora) e os pagamentos em uma linha por mês da janela
function linhasPorMes(meses: string[], mensal: ComissaoMensalRow[], pagamentos: ComissaoPagamento[]): LinhaMes[] {
  const porMes = new Map<string, LinhaMes>()
  const linha = (m: string) => { let x = porMes.get(m); if (!x) { x = linhaVazia(m); porMes.set(m, x) } return x }
  for (const r of mensal) {
    const x = linha(r.mes_ref)
    x.aberturas += r.aberturas; x.ativacoes += r.ativacoes; x.reativacoes += r.reativacoes; x.contas += r.contas_mes
    x.receita += r.receita_contas; x.carteira += r.receita_carteira; x.comissao += r.valor_abertura + r.valor_ativacao
  }
  for (const p of pagamentos) { const m = parseMes(p.mes_ref); if (m) linha(m).pago += p.valor }
  return meses.map(m => linha(m))
}

// Comissão de parceiros, organizada por mês: contas abertas, ativadas e reativadas, quais são as
// contas de cada mês, a receita bruta que geraram, a comissão do parceiro e o que ficou para o
// escritório (S39–S43). Todo mundo da equipe vê; o admin lança pagamentos e regras.
export default async function ComissoesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'vendedor')) redirect('/dashboard')
  const admin = profile.role === 'admin'
  const sp = await searchParams
  const q = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  const parceiros = await parceirosComissionados()
  const parceiro = parceiros.includes(q('parceiro')) ? q('parceiro') : (parceiros[0] ?? null)
  const corretoraParam = q('corretora')
  const corretora = isCorretora(corretoraParam) ? corretoraParam : null
  const mesRef = parseMes(q('mes')) ?? mesAtual()
  const meses = janelaMeses(mesRef, 12)

  if (!parceiro) {
    return (
      <>
        <PageHeader eyebrow="Parceiros · todas as corretoras" title="Comissão de parceiros" description="Abertura, ativação e reativação de contas por mês, com a receita que as contas geraram." />
        <PageBody>
          <Alert tone="neutral" title="Nenhum parceiro comissionado ainda">
            Marque quem é comissionado em Parâmetros › Responsáveis (coluna Comissão). Se a S39 ainda não rodou no banco, rode primeiro.
          </Alert>
        </PageBody>
      </>
    )
  }

  const [itens, mensal, eventos, pagamentos, regras] = await Promise.all([
    comissaoItens(parceiro, corretora), comissaoMensal(mesRef, 12, parceiro, corretora), comissaoContasMes(parceiro, corretora, mesRef, 12),
    comissaoPagamentos(parceiro), comissaoRegras(parceiro),
  ])
  const regraAtual = (c: string) => [...regras].filter(r => r.corretora === c).sort((a, b) => b.vigencia.localeCompare(a.vigencia))[0]
  const valorAtivacaoBase = (c: string) => valorDaFaixa(lerFaixasComissao(regraAtual(c)?.metas_ativacao), 1)
  const pagamentosVisiveis = corretora ? pagamentos.filter(p => !p.corretora || p.corretora === corretora) : pagamentos
  const res = resumirComissao(itens, mensal, pagamentosVisiveis, mesRef, valorAtivacaoBase)
  const prazo = regras[0]?.prazo_ativacao_dias ?? 60
  const mesesReativacao = regras[0]?.reativacao_meses ?? 4

  const porMes = linhasPorMes(meses, mensal, pagamentosVisiveis)
  const tabelaMeses = [...porMes].reverse()
  const tot = porMes.reduce((t, x) => ({
    mes: '', aberturas: t.aberturas + x.aberturas, ativacoes: t.ativacoes + x.ativacoes, reativacoes: t.reativacoes + x.reativacoes, contas: t.contas + x.contas,
    receita: t.receita + x.receita, carteira: t.carteira + x.carteira, comissao: t.comissao + x.comissao, pago: t.pago + x.pago,
  }), linhaVazia(''))
  const grafico = porMes.map(x => ({ label: mesCurto(x.mes), aberturas: x.aberturas, ativacoes: x.ativacoes, reativacoes: x.reativacoes, comissao: round2(x.comissao), receita: round2(x.receita) }))

  // contas do mês selecionado: um evento por linha; a receita da conta entra uma vez no rodapé
  const doMes = eventos.filter(e => e.mes_ref === mesRef)
  const contasDoMes = new Map<string, ComissaoContaMes>()
  for (const e of doMes) contasDoMes.set(`${e.cliente_id}:${e.corretora}`, e)
  const contasUnicas = [...contasDoMes.values()]
  const lotesDoMes = contasUnicas.reduce((s, e) => s + e.lotes_mes, 0)
  const receitaDoMes = contasUnicas.reduce((s, e) => s + e.receita_mes, 0)
  const receitaDesde = contasUnicas.reduce((s, e) => s + e.receita_desde, 0)
  const comissaoDoMes = doMes.reduce((s, e) => s + e.valor, 0)
  const hrefMes = (m: string) => {
    const p = new URLSearchParams()
    if (parceiro) p.set('parceiro', parceiro)
    if (corretora) p.set('corretora', corretora)
    p.set('mes', m.slice(0, 7))
    return `/comissoes?${p.toString()}`
  }

  const totalAbertura = itens.reduce((s, i) => s + i.valor_abertura, 0)
  const totalAtivacao = itens.reduce((s, i) => s + i.valor_ativacao, 0)
  const corretorasComRegra = CORRETORAS.filter(c => regras.some(r => r.corretora === c))
  const semValorAbertura = corretorasComRegra.filter(c => valorDaFaixa(lerFaixasComissao(regraAtual(c)?.metas_abertura), 1) === 0)
  const filtroCorretora = corretora ? ` na ${CORRETORA_LABEL[corretora]}` : ''

  return (
    <>
      <PageHeader
        eyebrow="Parceiros · todas as corretoras"
        title="Comissão de parceiros"
        description={<>Abertura = conta migrada na corretora. Ativação = primeira operação em até {prazo} dias da abertura. Reativação = cliente da carteira que volta a operar depois de {mesesReativacao} meses sem girar (vale como ativação). A comissão segue a faixa alcançada no mês, pela regra vigente na data do evento.</>}
        actions={<>
          <SelectParam param="parceiro" valor={parceiro} opcoes={parceiros.map(p => ({ valor: p, label: p }))} label="Parceiro" todos={null} />
          <SelectParam param="corretora" valor={corretora ?? ''} opcoes={CORRETORAS.map(c => ({ valor: c, label: CORRETORA_LABEL[c] }))} label="Corretora" todos="Todas" />
          <MesPicker valor={mesRef} />
        </>}
      />
      <PageBody>
        {semValorAbertura.length > 0 && (
          <Alert tone="warn" title={`Abertura sem valor na ${semValorAbertura.map(c => CORRETORA_LABEL[c]).join(' e ')}`}>
            A regra está com R$ 0 por conta aberta. {admin ? 'Preencha as faixas em "Regras" abaixo (formato mínimo no mês:R$ por conta, separado por ponto e vírgula).' : 'Peça ao administrador para preencher as faixas.'}
          </Alert>
        )}

        <KpiRow cols={6}>
          <KpiCard label={`Contas abertas · ${mesCurto(mesRef)}`} value={fmtNum(res.abertasMes)} sub={`${fmtNum(res.abertasTotal)} na carteira`} />
          <KpiCard label={`Ativadas · ${mesCurto(mesRef)}`} value={fmtNum(res.ativacoesMes)} sub={`1ª operação em até ${prazo} dias · ${fmtNum(res.pendentes)} ainda no prazo`} />
          <KpiCard label={`Reativadas · ${mesCurto(mesRef)}`} value={fmtNum(res.reativadasMes)} sub={`voltaram a operar após ${mesesReativacao} meses parados`} />
          <KpiCard label={`Receita bruta das contas · ${mesCurto(mesRef)}`} value={rCurto(res.receitaMes)} sub={`${fmtNum(res.contasMes)} ${res.contasMes === 1 ? 'conta' : 'contas'} do mês · carteira inteira ${rCurto(res.receitaCarteiraMes)}`} />
          <KpiCard label={`Comissão de ${parceiro} · ${mesCurto(mesRef)}`} value={rCurto(res.comissaoMes)} sub="abertura + ativação + reativação" />
          <KpiCard destaque label={`Líquido do escritório · ${mesCurto(mesRef)}`} value={rCurto(res.liquidoMes)} sub={res.liquidoMes < 0 ? 'comissão acima da receita das contas do mês' : 'receita bruta das contas do mês menos a comissão'} />
        </KpiRow>

        <Panel title="Mês a mês" subtitle={`12 meses até ${mesLongo(mesRef)} · clique no mês para ver as contas dele. Receita bruta = corretagem, zeragem e operações avulsas das contas com evento no mês, antes de repasse e impostos.`}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th>Mês</th><th className="num">Abertas</th><th className="num">Ativadas</th><th className="num">Reativadas</th><th className="num col-p3">Contas</th>
                  <th className="num">Receita bruta</th><th className="num">Comissão</th><th className="num">Líquido escritório</th><th className="num col-p2">Pago</th>
                </tr>
              </thead>
              <tbody>
                {tabelaMeses.map(x => {
                  const liquido = x.receita - x.comissao
                  const atual = x.mes === mesRef
                  return (
                    <tr key={x.mes} className={cn(atual && 'bg-accent-soft')}>
                      <td className="font-medium"><Link href={hrefMes(x.mes)} className="link">{mesLongo(x.mes)}</Link>{atual && <span className="muted"> · selecionado</span>}</td>
                      <td className="num">{n0(x.aberturas)}</td>
                      <td className="num">{n0(x.ativacoes)}</td>
                      <td className="num">{n0(x.reativacoes)}</td>
                      <td className="num col-p3">{n0(x.contas)}</td>
                      <td className="num">{r0(x.receita)}</td>
                      <td className="num">{r0(x.comissao)}</td>
                      <td className={cn('num', liquido < 0 && 'text-loss')}>{r0(liquido)}</td>
                      <td className="num col-p2">{r0(x.pago)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="total">
                  <td>12 meses</td>
                  <td className="num">{n0(tot.aberturas)}</td>
                  <td className="num">{n0(tot.ativacoes)}</td>
                  <td className="num">{n0(tot.reativacoes)}</td>
                  <td className="num col-p3">{n0(tot.contas)}</td>
                  <td className="num">{r0(tot.receita)}</td>
                  <td className="num">{r0(tot.comissao)}</td>
                  <td className={cn('num', tot.receita - tot.comissao < 0 && 'text-loss')}>{r0(tot.receita - tot.comissao)}</td>
                  <td className="num col-p2">{r0(tot.pago)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>

        <Panel title="Contas e comissão por mês" subtitle="Barras = contas abertas, ativadas e reativadas · linhas = comissão e receita bruta das contas do mês">
          <GraficoSeries
            dados={grafico}
            series={[
              { key: 'aberturas', nome: 'Abertas', tipo: 'bar' },
              { key: 'ativacoes', nome: 'Ativadas', tipo: 'bar' },
              { key: 'reativacoes', nome: 'Reativadas', tipo: 'bar' },
              { key: 'comissao', nome: 'Comissão', tipo: 'line', eixo: 'dir', formato: 'brl' },
              { key: 'receita', nome: 'Receita bruta', tipo: 'line', eixo: 'dir', formato: 'brl' },
            ]}
            formatoDir="brl"
            altura={260}
          />
        </Panel>

        <Panel title={`Contas de ${mesLongo(mesRef)} · ${fmtNum(contasDoMes.size)}`} subtitle="Cada abertura, ativação ou reativação do mês, com a receita bruta que a conta gerou no mês e do mês do evento até hoje. Clique no nome para abrir a ficha.">
          <div className="tbl-wrap max-h-[70vh]">
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th>Cliente</th><th className="col-p2">Corretora</th><th>Evento</th><th className="num">Data</th><th className="col-p3">Origem</th>
                  <th className="num col-p3">Lotes no mês</th><th className="num">Receita bruta no mês</th><th className="num col-p2">Receita desde então</th><th className="num">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {doMes.length === 0 && <LinhaVazia colunas={9}>Nenhuma conta com abertura, ativação ou reativação em {mesLongo(mesRef)}{filtroCorretora}.</LinhaVazia>}
                {doMes.map(e => {
                  const slug = isCorretora(e.corretora) ? CORRETORA_SLUG[e.corretora] : null
                  const t = TIPO[e.tipo]
                  return (
                    <tr key={`${e.cliente_id}:${e.corretora}:${e.tipo}:${e.data}`}>
                      <td className="max-w-[240px] truncate font-medium">{slug ? <Link href={`/${slug}/clientes/${e.cliente_id}`} className="link">{e.nome}</Link> : e.nome}</td>
                      <td className="muted col-p2">{CORRETORA_NOME(e.corretora)}</td>
                      <td><Badge variant={t.variant}>{t.label}</Badge></td>
                      <td className="num">{dataCurta(e.data)}</td>
                      <td className="muted col-p3">{origemTexto(e.origem, null, e.assessor_nome)}</td>
                      <td className={cn('num col-p3', !e.lotes_mes && 'subtle')}>{n0(e.lotes_mes)}</td>
                      <td className={cn('num', !e.receita_mes && 'subtle')}>{r0(e.receita_mes)}</td>
                      <td className={cn('num col-p2', !e.receita_desde && 'subtle')}>{r0(e.receita_desde)}</td>
                      <td className={cn('num', !e.valor && 'subtle')}>{r0(e.valor)}</td>
                    </tr>
                  )
                })}
              </tbody>
              {doMes.length > 0 && (
                <tfoot>
                  <tr className="total">
                    <td colSpan={5}>{fmtNum(contasDoMes.size)} {contasDoMes.size === 1 ? 'conta' : 'contas'} · {fmtNum(doMes.length)} {doMes.length === 1 ? 'evento' : 'eventos'}</td>
                    <td className="num col-p3">{n0(lotesDoMes)}</td>
                    <td className="num">{r0(receitaDoMes)}</td>
                    <td className="num col-p2">{r0(receitaDesde)}</td>
                    <td className="num">{r0(comissaoDoMes)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Panel>

        <KpiRow cols={4}>
          <KpiCard label="Comissão gerada até hoje" value={rCurto(res.geradoTotal)} sub={`${fmtNum(res.abertasTotal)} abertas · ${fmtNum(res.ativadasTotal)} ativações (com reativações)`} />
          <KpiCard label="Previsão de ativações" value={rCurto(res.previsao)} sub={`${fmtNum(res.pendentes)} ${res.pendentes === 1 ? 'conta' : 'contas'} no prazo × valor da ativação`} />
          <KpiCard label="Pago" value={rCurto(res.pago)} sub={`${fmtNum(pagamentosVisiveis.length)} ${pagamentosVisiveis.length === 1 ? 'pagamento' : 'pagamentos'}`} />
          <KpiCard label="Saldo a pagar" value={rCurto(res.saldo)} tone={res.saldo < 0 ? 'loss' : 'neutral'} sub={res.saldo < 0 ? 'pago acima do gerado' : 'gerado até hoje menos o pago'} />
        </KpiRow>

        <div className="grid gap-8 xl:grid-cols-2">
          <PagamentosComissao parceiro={parceiro} pagamentos={pagamentos} admin={admin} />
          <RegrasComissao parceiro={parceiro} regras={regras} admin={admin} />
        </div>

        <Panel title={`Carteira de ${parceiro} · ${fmtNum(itens.length)} contas`} subtitle="Lead que virou cliente, cliente com o parceiro marcado na ficha, cliente de um assessor ligado ao parceiro (Parâmetros › Assessores) ou cliente cujo responsável interno é o parceiro (na ficha ou herdado do assessor).">
          <details>
            <summary className="cursor-pointer text-label text-fg-muted hover:text-fg">
              Mostrar todas as contas · {fmtNum(res.abertasTotal)} abertas, {fmtNum(res.ativadasTotal)} ativações, {fmtNum(res.pendentes)} no prazo, {fmtNum(res.reativadasTotal)} reativações
            </summary>
            <div className="tbl-wrap mt-3 max-h-[60vh]">
              <table className="tbl tbl-dense">
                <thead>
                  <tr>
                    <th>Cliente</th><th className="col-p2">Corretora</th><th className="col-p3">Origem</th><th className="col-p2">Abertura</th><th className="col-p2">Ativação</th><th className="col-p3">Prazo até</th><th>Situação</th><th className="col-p2">Reativações</th><th className="num">R$ abertura</th><th className="num">R$ ativação</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.length === 0 && <LinhaVazia colunas={10}>Nenhuma conta atribuída a {parceiro}{filtroCorretora}.</LinhaVazia>}
                  {itens.map(i => {
                    const slug = isCorretora(i.corretora) ? CORRETORA_SLUG[i.corretora] : null
                    return (
                      <tr key={`${i.cliente_id}:${i.corretora}`}>
                        <td className="max-w-[240px] truncate font-medium">{slug ? <Link href={`/${slug}/clientes/${i.cliente_id}`} className="link">{i.nome}</Link> : i.nome}</td>
                        <td className="muted col-p2">{CORRETORA_NOME(i.corretora)}</td>
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
                      <td colSpan={6}>{fmtNum(res.abertasTotal)} abertas · {fmtNum(res.ativadasTotal)} ativações</td>
                      <td>{n0(res.pendentes)} no prazo</td>
                      <td className="col-p2">{n0(res.reativadasTotal)} reativações</td>
                      <td className="num">{r0(totalAbertura)}</td>
                      <td className="num">{r0(totalAtivacao)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </details>
        </Panel>
      </PageBody>
    </>
  )
}
