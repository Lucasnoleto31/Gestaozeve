// Resumo de um parceiro: quanto gerou no mês, o saldo, de quais contas veio e os últimos 12 meses.
import Link from 'next/link'
import { comissaoContasMes, comissaoItens, comissaoMensal, comissaoPagamentos, comissaoRegras } from '@/lib/gestao/consultas'
import { lerFaixasComissao, resumirComissao, valorDaFaixa } from '@/lib/gestao/comissao'
import { janelaMeses, mesCurto, mesLongo } from '@/lib/gestao/meses'
import { CORRETORAS, CORRETORA_LABEL, CORRETORA_SLUG, isCorretora } from '@/lib/corretoras'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { LinhaVazia, dataCurta, dataPt, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { TIPO, corretoraNome, hrefComissoes, linhasPorMes, origemTexto, pagamentosDoFiltro, round2, somaLinhas, type FiltroAba } from './comum'

export async function AbaResumo({ parceiro, corretora, mesRef, comissionado, admin }: FiltroAba & { comissionado: boolean; admin: boolean }) {
  const meses = janelaMeses(mesRef, 12)
  const [itens, mensal, eventos, pagamentos, regras] = await Promise.all([
    comissaoItens(parceiro, corretora), comissaoMensal(mesRef, 12, parceiro, corretora), comissaoContasMes(parceiro, corretora, mesRef, 1),
    comissaoPagamentos(parceiro), comissaoRegras(parceiro),
  ])
  const regraAtual = (c: string) => [...regras].filter(r => r.corretora === c).sort((a, b) => b.vigencia.localeCompare(a.vigencia))[0]
  const valorAtivacaoBase = (c: string) => valorDaFaixa(lerFaixasComissao(regraAtual(c)?.metas_ativacao), 1)
  const visiveis = pagamentosDoFiltro(pagamentos, corretora)
  const res = resumirComissao(itens, mensal, visiveis, mesRef, valorAtivacaoBase)
  const prazo = regras[0]?.prazo_ativacao_dias ?? 60
  const corretorasComRegra = CORRETORAS.filter(c => regras.some(r => r.corretora === c))
  const semValorAbertura = corretorasComRegra.filter(c => valorDaFaixa(lerFaixasComissao(regraAtual(c)?.metas_abertura), 1) === 0)
  const filtroCorretora = corretora ? ` na ${CORRETORA_LABEL[corretora]}` : ''
  const mes = mesCurto(mesRef)

  const doMes = eventos.filter(e => e.mes_ref === mesRef)
  const contasDoMes = new Set(doMes.map(e => `${e.cliente_id}:${e.corretora}`)).size
  const comissaoDoMes = doMes.reduce((s, e) => s + e.valor, 0)
  const porMes = linhasPorMes(meses, mensal, visiveis)
  const tot = somaLinhas(porMes)
  const ultimoPagamento = visiveis.reduce<string | null>((m, p) => (m == null || p.data_pagamento > m ? p.data_pagamento : m), null)

  return (
    <>
      {!comissionado && (
        <Alert tone="neutral" title={`${parceiro} vem do campo Parceiro na ficha dos clientes`}>
          Carteira e extrato funcionam normalmente. Para calcular comissão, marque {parceiro} em Parâmetros › Responsáveis (coluna Comissão) e cadastre as regras na aba Pagamentos e regras.
        </Alert>
      )}
      {semValorAbertura.length > 0 && (
        <Alert tone="warn" title={`Abertura sem valor na ${semValorAbertura.map(c => CORRETORA_LABEL[c]).join(' e ')}`}>
          A regra está com R$ 0 por conta aberta. {admin ? 'Preencha as faixas na aba Pagamentos e regras.' : 'Peça ao administrador para preencher as faixas.'}
        </Alert>
      )}

      <KpiRow cols={4}>
        <KpiCard destaque label={`Comissão de ${mes}`} value={res.comissaoMes ? rCurto(res.comissaoMes) : 'R$ 0'}
          sub={`${fmtNum(res.abertasMes)} ${res.abertasMes === 1 ? 'aberta' : 'abertas'} · ${fmtNum(res.ativacoesMes)} ${res.ativacoesMes === 1 ? 'ativada' : 'ativadas'} · ${fmtNum(res.reativadasMes)} ${res.reativadasMes === 1 ? 'reativada' : 'reativadas'}`} />
        <KpiCard label="Saldo a pagar" value={rCurto(res.saldo)} tone={res.saldo < 0 ? 'warn' : 'neutral'}
          sub={res.saldo < 0 ? 'pago acima do gerado até hoje' : `gerado ${rCurto(res.geradoTotal)} menos pago ${rCurto(res.pago)}`} />
        <KpiCard label="Pago até hoje" value={rCurto(res.pago)} sub={visiveis.length ? `${fmtNum(visiveis.length)} ${visiveis.length === 1 ? 'pagamento' : 'pagamentos'} · último em ${dataPt(ultimoPagamento)}` : 'nenhum pagamento lançado'} />
        <KpiCard label="Ainda podem ativar" value={fmtNum(res.pendentes)} sub={res.pendentes ? `contas abertas no prazo de ${prazo} dias · até ${rCurto(res.previsao)} se operarem` : `nenhuma conta aberta dentro do prazo de ${prazo} dias`} />
      </KpiRow>

      <Panel title={`De onde veio a comissão de ${mesLongo(mesRef)}`} subtitle={`Cada abertura, ativação ou reativação do mês${filtroCorretora} e quanto rendeu ao parceiro. Clique no nome para abrir a ficha.`}>
        <div className="tbl-wrap max-h-[70vh]">
          <table className="tbl tbl-dense">
            <thead><tr><th>Cliente</th><th className="col-p2">Corretora</th><th>Evento</th><th className="num">Data</th><th className="col-p3">Origem</th><th className="num">Comissão</th></tr></thead>
            <tbody>
              {doMes.length === 0 && <LinhaVazia colunas={6}>Nenhuma conta com abertura, ativação ou reativação em {mesLongo(mesRef)}{filtroCorretora}.</LinhaVazia>}
              {doMes.map(e => {
                const slug = isCorretora(e.corretora) ? CORRETORA_SLUG[e.corretora] : null
                const t = TIPO[e.tipo]
                return (
                  <tr key={`${e.cliente_id}:${e.corretora}:${e.tipo}:${e.data}`}>
                    <td className="max-w-[260px] truncate font-medium">{slug ? <Link href={`/${slug}/clientes/${e.cliente_id}`} className="link">{e.nome}</Link> : e.nome}</td>
                    <td className="muted col-p2">{corretoraNome(e.corretora)}</td>
                    <td><Badge variant={t.variant}>{t.label}</Badge></td>
                    <td className="num">{dataCurta(e.data)}</td>
                    <td className="muted col-p3">{origemTexto(e.origem, null, e.assessor_nome)}</td>
                    <td className={cn('num font-medium', !e.valor && 'subtle')}>{r0(e.valor)}</td>
                  </tr>
                )
              })}
            </tbody>
            {doMes.length > 0 && (
              <tfoot>
                <tr className="total">
                  <td colSpan={5}>{fmtNum(contasDoMes)} {contasDoMes === 1 ? 'conta' : 'contas'} · {fmtNum(doMes.length)} {doMes.length === 1 ? 'evento' : 'eventos'}</td>
                  <td className="num">{r0(comissaoDoMes)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Panel>

      <Panel title="Mês a mês" subtitle={`12 meses até ${mesLongo(mesRef)}. Clique no mês para ver as contas dele.`}>
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead><tr><th>Mês</th><th className="num col-p2">Abertas</th><th className="num col-p2">Ativadas</th><th className="num col-p2">Reativadas</th><th className="num">Comissão</th><th className="num">Pago</th><th className="num">Falta pagar</th></tr></thead>
            <tbody>
              {[...porMes].reverse().map(x => {
                const atual = x.mes === mesRef
                const falta = round2(x.comissao - x.pago)
                return (
                  <tr key={x.mes} className={cn(atual && 'bg-accent-soft')}>
                    <td className="font-medium"><Link href={hrefComissoes({ parceiro, corretora, mes: x.mes })} className="link">{mesLongo(x.mes)}</Link></td>
                    <td className={cn('num col-p2', !x.aberturas && 'subtle')}>{n0(x.aberturas)}</td>
                    <td className={cn('num col-p2', !x.ativacoes && 'subtle')}>{n0(x.ativacoes)}</td>
                    <td className={cn('num col-p2', !x.reativacoes && 'subtle')}>{n0(x.reativacoes)}</td>
                    <td className={cn('num font-medium', !x.comissao && 'subtle')}>{r0(x.comissao)}</td>
                    <td className={cn('num', !x.pago && 'subtle')}>{r0(x.pago)}</td>
                    <td className={cn('num font-medium', falta < 0 ? 'text-warn' : !falta && 'subtle')} title={falta < 0 ? 'pago acima da comissão do mês' : undefined}>{r0(falta)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="total">
                <td>12 meses</td>
                <td className="num col-p2">{n0(tot.aberturas)}</td>
                <td className="num col-p2">{n0(tot.ativacoes)}</td>
                <td className="num col-p2">{n0(tot.reativacoes)}</td>
                <td className="num">{r0(tot.comissao)}</td>
                <td className="num">{r0(tot.pago)}</td>
                <td className={cn('num', tot.comissao - tot.pago < 0 && 'text-warn')}>{r0(round2(tot.comissao - tot.pago))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    </>
  )
}
