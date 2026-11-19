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
import { Resumo } from '@/components/gestao/Resumo'
import { LinhaVazia, dataCurta, dataPt, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { TIPO, alemDoLimite, corretoraNome, hrefComissoes, linhasPorMes, listaDireita, origemTexto, pagamentosDoFiltro, round2, somaLinhas, type FiltroAba } from './comum'
import { MostrarMais } from './MostrarMais'
import { SeloLista } from './SeloLista'

// fraseNoCelular = false quando a mesma aba já abre pela frase da participação (AbaReceita ou AbaRepasseBtg, logo
// acima): duas frases com dois saldos diferentes deixariam a tela sem uma resposta só
export async function AbaResumo({ parceiro, corretora, mesRef, comissionado, participacao = false, admin, fraseNoCelular = true }: FiltroAba & { comissionado: boolean; participacao?: boolean; admin: boolean; fraseNoCelular?: boolean }) {
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
      {!comissionado && (participacao ? (
        <Alert tone="neutral" title={`${parceiro} recebe participação na receita do BTG`}>
          Não há comissão por conta aberta ou ativada. O valor do mês está na visão geral (Participação na receita · BTG); aqui ficam a carteira e o extrato dos clientes dele.
        </Alert>
      ) : (
        <Alert tone="neutral" title={`${parceiro} vem do campo Parceiro na ficha dos clientes`}>
          Carteira e extrato funcionam normalmente. Para calcular comissão, marque {parceiro} em Parâmetros › Responsáveis (coluna Comissão) e cadastre as regras na aba Pagamentos e regras.
        </Alert>
      ))}
      {semValorAbertura.length > 0 && (
        <Alert tone="warn" title={`Abertura sem valor na ${semValorAbertura.map(c => CORRETORA_LABEL[c]).join(' e ')}`}>
          A regra está com R$ 0 por conta aberta. {admin ? 'Preencha as faixas na aba Pagamentos e regras.' : 'Peça ao administrador para preencher as faixas.'}
        </Alert>
      )}

      {/* Celular: a resposta em uma frase, com os mesmos números dos dois primeiros cartões */}
      {comissionado && fraseNoCelular && (
        <div className="md:hidden">
          <Resumo frase={`${parceiro} gerou ${res.comissaoMes ? rCurto(res.comissaoMes) : 'R$ 0'} de comissão em ${mes}${filtroCorretora}. ${
            res.saldo > 0 ? `O saldo a pagar até hoje é de ${rCurto(res.saldo)}.` : res.saldo < 0 ? `Já foram pagos ${rCurto(-res.saldo)} acima do gerado até hoje.` : 'Tudo o que foi gerado até hoje já foi pago.'}`} />
        </div>
      )}

      <KpiRow cols={4}>
        <KpiCard destaque label={`Comissão de ${mes}`} value={res.comissaoMes ? rCurto(res.comissaoMes) : 'R$ 0'}
          sub={`${fmtNum(res.abertasMes)} ${res.abertasMes === 1 ? 'aberta' : 'abertas'} · ${fmtNum(res.ativacoesMes)} ${res.ativacoesMes === 1 ? 'ativada' : 'ativadas'} · ${fmtNum(res.reativadasMes)} ${res.reativadasMes === 1 ? 'reativada' : 'reativadas'}`} />
        <KpiCard label="Saldo a pagar" value={rCurto(res.saldo)} tone={res.saldo < 0 ? 'warn' : 'neutral'}
          sub={res.saldo < 0 ? 'pago acima do gerado até hoje' : `gerado ${rCurto(res.geradoTotal)} menos pago ${rCurto(res.pago)}`} />
        <KpiCard label="Pago até hoje" value={rCurto(res.pago)} sub={visiveis.length ? `${fmtNum(visiveis.length)} ${visiveis.length === 1 ? 'pagamento' : 'pagamentos'} · último em ${dataPt(ultimoPagamento)}` : 'nenhum pagamento lançado'} />
        <KpiCard label="Ainda podem ativar" value={fmtNum(res.pendentes)} sub={res.pendentes ? `contas abertas no prazo de ${prazo} dias · até ${rCurto(res.previsao)} se operarem` : `nenhuma conta aberta dentro do prazo de ${prazo} dias`} />
      </KpiRow>

      {/* No celular cada conta é uma linha que abre a ficha (tbl-lista): o evento, a data, a corretora (sem filtro)
          e a origem na linha de apoio; a comissão à direita. A lista corre com a página, 10 linhas por vez. */}
      <Panel title={`De onde veio a comissão de ${mesLongo(mesRef)}`} subtitle={<>Cada abertura, ativação ou reativação do mês{filtroCorretora} e quanto rendeu ao parceiro.<span className="max-md:hidden"> Clique no nome para abrir a ficha.</span></>}>
        <MostrarMais total={doMes.length}>
        <div className="tbl-wrap max-h-[70vh]">
          <table className="tbl tbl-dense tbl-lista lista-abre" style={listaDireita('6.5rem')}>
            <thead><tr><th>Cliente</th><th className="col-p2">Corretora</th><th>Evento</th><th className="num">Data</th><th className="col-p3">Origem</th><th className="num">Comissão</th></tr></thead>
            <tbody>
              {doMes.length === 0 && <LinhaVazia colunas={6}>Nenhuma conta com abertura, ativação ou reativação em {mesLongo(mesRef)}{filtroCorretora}.</LinhaVazia>}
              {doMes.map((e, i) => {
                const slug = isCorretora(e.corretora) ? CORRETORA_SLUG[e.corretora] : null
                const t = TIPO[e.tipo]
                return (
                  <tr key={`${e.cliente_id}:${e.corretora}:${e.tipo}:${e.data}`} className={alemDoLimite(i)}>
                    <td className="cel-titulo max-w-[260px] truncate font-medium">{slug ? <Link href={`/${slug}/clientes/${e.cliente_id}`} className="link">{e.nome}</Link> : e.nome}</td>
                    <td className={cn('muted col-p2', !corretora && 'cel-sub')}>{corretoraNome(e.corretora)}</td>
                    <td className="cel-sub"><SeloLista variante={t.variant}>{t.label}</SeloLista></td>
                    <td className="num cel-sub">{dataCurta(e.data)}</td>
                    <td className="muted col-p3 cel-sub">{origemTexto(e.origem, null, e.assessor_nome)}</td>
                    <td className={cn('num cel-valor font-medium', !e.valor && 'subtle')}><span className={cn(!e.valor && 'max-md:text-fg-subtle')}>{r0(e.valor)}</span></td>
                  </tr>
                )
              })}
            </tbody>
            {doMes.length > 0 && (
              <tfoot>
                <tr className="total">
                  <td colSpan={5} className="cel-titulo">{fmtNum(contasDoMes)} {contasDoMes === 1 ? 'conta' : 'contas'} · {fmtNum(doMes.length)} {doMes.length === 1 ? 'evento' : 'eventos'}</td>
                  <td className="num cel-valor">{r0(comissaoDoMes)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        </MostrarMais>
      </Panel>

      {/* No celular cada mês é uma linha que abre o mês: a comissão à direita; abertas, ativadas, reativadas, o que
          foi pago e o que falta na linha de apoio (só o que tem valor). O destaque do mês aberto fica no computador. */}
      <Panel title="Mês a mês" subtitle={<>12 meses até {mesLongo(mesRef)}.<span className="max-md:hidden"> Clique no mês para ver as contas dele.</span></>}>
        <div className="tbl-wrap">
          <table className="tbl tbl-dense tbl-lista lista-abre" style={listaDireita('6.75rem')}>
            <thead><tr><th>Mês</th><th className="num col-p2">Abertas</th><th className="num col-p2">Ativadas</th><th className="num col-p2">Reativadas</th><th className="num">Comissão</th><th className="num">Pago</th><th className="num">Falta pagar</th></tr></thead>
            <tbody>
              {[...porMes].reverse().map(x => {
                const atual = x.mes === mesRef
                const falta = round2(x.comissao - x.pago)
                return (
                  <tr key={x.mes} className={cn(atual && 'md:bg-accent-soft')}>
                    <td className="cel-titulo font-medium"><Link href={hrefComissoes({ parceiro, corretora, mes: x.mes })} className="link">{mesLongo(x.mes)}</Link></td>
                    <td className={cn('num col-p2 cel-sub', !x.aberturas && 'subtle vazio')}>{n0(x.aberturas)}<span className="md:hidden"> {x.aberturas === 1 ? 'aberta' : 'abertas'}</span></td>
                    <td className={cn('num col-p2 cel-sub', !x.ativacoes && 'subtle vazio')}>{n0(x.ativacoes)}<span className="md:hidden"> {x.ativacoes === 1 ? 'ativada' : 'ativadas'}</span></td>
                    <td className={cn('num col-p2 cel-sub', !x.reativacoes && 'subtle vazio')}>{n0(x.reativacoes)}<span className="md:hidden"> {x.reativacoes === 1 ? 'reativada' : 'reativadas'}</span></td>
                    <td className={cn('num cel-valor font-medium', !x.comissao && 'subtle')}><span className={cn(!x.comissao && 'max-md:text-fg-subtle')}>{r0(x.comissao)}</span></td>
                    <td className={cn('num cel-sub', !x.pago && 'subtle vazio')} data-rotulo="pago">{r0(x.pago)}</td>
                    <td className={cn('num cel-sub font-medium max-md:font-normal', falta < 0 ? 'text-warn' : !falta && 'subtle vazio')} data-rotulo={falta < 0 ? 'pago\u00a0a\u00a0mais' : 'falta\u00a0pagar'} title={falta < 0 ? 'pago acima da comissão do mês' : undefined}>
                      <span className={cn(falta < 0 && 'max-md:hidden')}>{r0(falta)}</span>{falta < 0 && <span className="text-warn md:hidden">{r0(-falta)}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="total">
                <td className="cel-titulo">12 meses</td>
                <td className={cn('num col-p2 cel-sub', !tot.aberturas && 'vazio')}>{n0(tot.aberturas)}<span className="md:hidden"> {tot.aberturas === 1 ? 'aberta' : 'abertas'}</span></td>
                <td className={cn('num col-p2 cel-sub', !tot.ativacoes && 'vazio')}>{n0(tot.ativacoes)}<span className="md:hidden"> {tot.ativacoes === 1 ? 'ativada' : 'ativadas'}</span></td>
                <td className={cn('num col-p2 cel-sub', !tot.reativacoes && 'vazio')}>{n0(tot.reativacoes)}<span className="md:hidden"> {tot.reativacoes === 1 ? 'reativada' : 'reativadas'}</span></td>
                <td className="num cel-valor">{r0(tot.comissao)}</td>
                <td className={cn('num cel-sub', !tot.pago && 'vazio')} data-rotulo="pago">{r0(tot.pago)}</td>
                <td className={cn('num cel-sub', tot.comissao - tot.pago < 0 && 'text-warn', !round2(tot.comissao - tot.pago) && 'vazio')} data-rotulo={'falta\u00a0pagar'}>{r0(round2(tot.comissao - tot.pago))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    </>
  )
}
