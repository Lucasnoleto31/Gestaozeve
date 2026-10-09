export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { comissaoItens, comissaoMensal, comissaoPagamentos, comissaoRegras, parceirosComissionados } from '@/lib/gestao/consultas'
import { lerFaixasComissao, resumirComissao, valorDaFaixa } from '@/lib/gestao/comissao'
import { janelaMeses, mesAtual, mesCurto, mesLongo, parseMes } from '@/lib/gestao/meses'
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

// Comissão de parceiros: abertura (cliente migrado) e ativação (primeira operação dentro do prazo),
// com valores por corretora em faixas mensais (S39). Todo mundo da equipe vê; o admin lança
// pagamentos e regras.
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
        <PageHeader eyebrow="Parceiros · todas as corretoras" title="Comissão de parceiros" description="Abertura e ativação de conta, com valores por corretora e metas mensais." />
        <PageBody>
          <Alert tone="neutral" title="Nenhum parceiro comissionado ainda">
            Marque quem é comissionado em Parâmetros › Responsáveis (coluna Comissão). Se a S39 ainda não rodou no banco, rode primeiro.
          </Alert>
        </PageBody>
      </>
    )
  }

  const [itens, mensal, pagamentos, regras] = await Promise.all([
    comissaoItens(parceiro, corretora), comissaoMensal(mesRef, 12, parceiro, corretora), comissaoPagamentos(parceiro), comissaoRegras(parceiro),
  ])
  const regraAtual = (c: string) => [...regras].filter(r => r.corretora === c).sort((a, b) => b.vigencia.localeCompare(a.vigencia))[0]
  const valorAtivacaoBase = (c: string) => valorDaFaixa(lerFaixasComissao(regraAtual(c)?.metas_ativacao), 1)
  const pagamentosVisiveis = corretora ? pagamentos.filter(p => !p.corretora || p.corretora === corretora) : pagamentos
  const res = resumirComissao(itens, mensal, pagamentosVisiveis, mesRef, valorAtivacaoBase)

  const porMes = new Map<string, { aberturas: number; ativacoes: number; reativacoes: number; comissao: number }>()
  for (const m of mensal) {
    const x = porMes.get(m.mes_ref) ?? { aberturas: 0, ativacoes: 0, reativacoes: 0, comissao: 0 }
    x.aberturas += m.aberturas; x.ativacoes += m.ativacoes; x.reativacoes += m.reativacoes; x.comissao += m.valor_abertura + m.valor_ativacao
    porMes.set(m.mes_ref, x)
  }
  const grafico = meses.map(m => { const x = porMes.get(m); return { label: mesCurto(m), aberturas: x?.aberturas ?? 0, ativacoes: x?.ativacoes ?? 0, reativacoes: x?.reativacoes ?? 0, comissao: Math.round((x?.comissao ?? 0) * 100) / 100 } })
  const totalAbertura = itens.reduce((s, i) => s + i.valor_abertura, 0)
  const totalAtivacao = itens.reduce((s, i) => s + i.valor_ativacao, 0)
  const corretorasComRegra = CORRETORAS.filter(c => regras.some(r => r.corretora === c))
  const semValorAbertura = corretorasComRegra.filter(c => valorDaFaixa(lerFaixasComissao(regraAtual(c)?.metas_abertura), 1) === 0)

  return (
    <>
      <PageHeader
        eyebrow="Parceiros · todas as corretoras"
        title="Comissão de parceiros"
        description={<>Abertura = cliente migrado na corretora. Ativação = primeira operação em até {regras[0]?.prazo_ativacao_dias ?? 60} dias da abertura, uma vez por cliente. O valor por conta segue a faixa alcançada no mês (meta) e vale para todas as contas daquele mês. Reativação = cliente da base que fica {regras[0]?.reativacao_meses ?? 4} meses sem girar (ou nunca girou desde a migração) e volta a operar: vale o valor da ativação e entra na meta do mês. Conta vinda de lead só conta abertura se a migração for depois do lead; se a conta é anterior, só a reativação conta.</>}
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
          <KpiCard label={`Contas abertas em ${mesCurto(mesRef)}`} value={fmtNum(res.abertasMes)} sub={`${fmtNum(res.abertasTotal)} no total`} />
          <KpiCard label={`Ativações em ${mesCurto(mesRef)}`} value={fmtNum(res.ativadasMes)} sub={`${fmtNum(res.reativadasMes)} reativações · ${fmtNum(res.ativadasTotal)} no total · ${fmtNum(res.pendentes)} abertas no prazo`} />
          <KpiCard label={`Comissão em ${mesCurto(mesRef)}`} value={rCurto(res.comissaoMes)} sub="abertura + ativação do mês" />
          <KpiCard label="Previsão de ativações" value={rCurto(res.previsao)} sub={`${fmtNum(res.pendentes)} contas no prazo × valor da ativação`} />
          <KpiCard label="Pago" value={rCurto(res.pago)} sub={`${fmtNum(pagamentosVisiveis.length)} ${pagamentosVisiveis.length === 1 ? 'pagamento' : 'pagamentos'} · gerado ${rCurto(res.geradoTotal)}`} />
          <KpiCard destaque label="Saldo a pagar" value={rCurto(res.saldo)} sub={res.saldo < 0 ? 'pago acima do gerado' : 'gerado até hoje menos o pago'} />
        </KpiRow>

        <Panel title="Aberturas, ativações e comissão por mês" subtitle={`12 meses até ${mesLongo(mesRef)} · barras = contas e eventos, linha = comissão`}>
          <GraficoSeries
            dados={grafico}
            series={[
              { key: 'aberturas', nome: 'Contas abertas', tipo: 'bar' },
              { key: 'ativacoes', nome: 'Ativações', tipo: 'bar' },
              { key: 'reativacoes', nome: 'Reativações', tipo: 'bar' },
              { key: 'comissao', nome: 'Comissão', tipo: 'line', eixo: 'dir', formato: 'brl' },
            ]}
            formatoDir="brl"
            altura={260}
          />
        </Panel>

        <Panel title={`Contas de ${parceiro} · ${fmtNum(itens.length)}`} subtitle="Lead que virou cliente, cliente com o parceiro marcado na ficha ou cliente de um assessor ligado ao parceiro (Parâmetros › Assessores). Clique no nome para abrir a ficha.">
          <div className="tbl-wrap max-h-[70vh]">
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th>Cliente</th><th className="col-p2">Corretora</th><th className="col-p3">Origem</th><th className="col-p2">Abertura</th><th className="col-p2">Ativação</th><th className="col-p3">Prazo até</th><th>Situação</th><th className="col-p2">Reativações</th><th className="num">R$ abertura</th><th className="num">R$ ativação</th>
                </tr>
              </thead>
              <tbody>
                {itens.length === 0 && <LinhaVazia colunas={10}>Nenhuma conta atribuída a {parceiro}{corretora ? ` na ${CORRETORA_LABEL[corretora]}` : ''}.</LinhaVazia>}
                {itens.map(i => {
                  const slug = isCorretora(i.corretora) ? CORRETORA_SLUG[i.corretora] : null
                  return (
                    <tr key={`${i.cliente_id}:${i.corretora}`}>
                      <td className="max-w-[240px] truncate font-medium">{slug ? <Link href={`/${slug}/clientes/${i.cliente_id}`} className="link">{i.nome}</Link> : i.nome}</td>
                      <td className="muted col-p2">{isCorretora(i.corretora) ? CORRETORA_LABEL[i.corretora] : i.corretora}</td>
                      <td className="muted col-p3">{i.origem === 'lead' ? `lead em ${dataCurta(i.data_lead)}` : i.origem === 'assessor' ? `assessor ${i.assessor_nome ?? ''}` : 'parceiro na ficha'}</td>
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
        </Panel>

        <div className="grid gap-8 xl:grid-cols-2">
          <PagamentosComissao parceiro={parceiro} pagamentos={pagamentos} admin={admin} />
          <RegrasComissao parceiro={parceiro} regras={regras} admin={admin} />
        </div>
      </PageBody>
    </>
  )
}
