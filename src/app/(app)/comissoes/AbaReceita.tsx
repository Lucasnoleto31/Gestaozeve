// Resumo de um parceiro com participação na receita (parâmetro parceiros_receita da corretora): quanto
// ele tem a receber no mês, de quais clientes veio, o mês a mês e a regra. Lucas, 16/11/2026: Fabio Ferron
// é a ZEVE INVESTIMENTOS 5 na Genial e recebe metade da corretagem, da zeragem e do incentivo dos clientes dele.
import type { ReactNode } from 'react'
import Link from 'next/link'
import { comissaoPagamentos } from '@/lib/gestao/consultas'
import { participacaoReceita, repasseBtgMensal, type RegrasCorretora } from '@/lib/gestao/consultasParticipacao'
import { inicioDasRegras, pctComum, planilhaReceita, resumirReceita, textoDaRegraCom, TOTAIS_VAZIOS } from '@/lib/gestao/participacao'
import { nomeArquivoExtrato, rotuloCorretora } from '@/lib/gestao/extrato'
import { mesAtual, mesCurto, mesLongo, parseMes, somarMeses } from '@/lib/gestao/meses'
import { CORRETORA_LABEL, CORRETORA_SLUG } from '@/lib/corretoras'
import { fmtBRL2, fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Alert } from '@/components/ui/Alert'
import { Recolhido } from '@/components/ui/Recolhido'
import { Resumo } from '@/components/gestao/Resumo'
import { n0, r0 } from '@/components/gestao/Celulas'
import { TabelaReceitaParceiro } from '@/components/gestao/TabelaReceitaParceiro'
import { ExtratoAcoes } from './ExtratoAcoes'
import { alemDoLimite, fonteKpi, hrefComissoes, listaDireita, pagamentosDoFiltro, round2, type FiltroAba } from './comum'
import { MostrarMais } from './MostrarMais'
import { RecolheNoCelular } from '@/components/ui/RecolheNoCelular'

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

// btg = o parceiro também segue a divisão da comissão do BTG (repasse_parceiros): a parte dele lá, a partir
// do início desta regra, soma no valor a receber e no saldo. extra = o bloco do BTG, antes de "Como é calculado".
export async function AbaReceita({ parceiro, corretora, mesRef, regras, admin, btg = false, extra }: FiltroAba & { regras: RegrasCorretora[]; admin: boolean; btg?: boolean; extra?: ReactNode }) {
  const [livros, pagamentos] = await Promise.all([
    Promise.all(regras.map(r => participacaoReceita(r.corretora, r.regras, parceiro))),
    comissaoPagamentos(parceiro),
  ])
  const visiveis = pagamentosDoFiltro(pagamentos, corretora)
  const res = resumirReceita(livros, mesRef)
  const t = res.mes
  const pago = visiveis.reduce((s, p) => s + p.valor, 0)
  const variasCorretoras = livros.length > 1
  const mes = mesCurto(mesRef)
  // a parte dele na comissão do BTG, mês a mês: os clientes sem lista na ficha contam a partir do início da
  // regra geral dele (a do parâmetro); o cliente com lista de parceiros conta desde o começo da linha dele
  const repasse = btg ? await repasseBtgMensal(parceiro, inicioDasRegras(livros.flatMap(l => l.regras))) : null
  // o mês a mês começa na primeira regra (a geral ou a da lista das fichas) ou no primeiro mês com valor no BTG
  const inicio = [...livros.map(l => l.regras[0]?.desde), repasse?.meses[0]?.mes].filter((m): m is string => !!m).sort()[0] ?? mesRef
  const btgPorMes = new Map((repasse?.meses ?? []).map(m => [m.mes, m.parte]))
  const btgMes = btgPorMes.get(mesRef) ?? 0
  const geradoBtg = round2((repasse?.meses ?? []).reduce((s, m) => s + m.parte, 0))
  const gerado = round2(res.gerado + geradoBtg)
  const totalMes = round2(t.total + btgMes)
  const saldo = round2(gerado - pago)
  const antesDoInicio = mesRef < inicio
  // mês corrente: os lotes vão até o último dia importado
  const corrente = mesRef === mesAtual()
  const ultima = livros.map(l => l.ultimaData).filter((d): d is string => !!d && d.startsWith(mesRef.slice(0, 7))).sort().at(-1) ?? null
  // regra geral sem código de assessor ligado (quem só entra pela lista das fichas não precisa de código)
  const semCodigo = livros.filter(l => l.assessores.length === 0 && l.regras.some(r => !r.soFicha))
  const naFicha = livros.reduce((s, l) => s + l.clientesFicha, 0)
  const temFicha = naFicha > 0 || res.linhas.some(c => c.pctFicha != null) || livros.some(l => l.regras.some(r => r.soFicha))
  const clientesNosCodigos = livros.reduce((s, l) => s + l.clientes, 0)
  const codigos = livros.flatMap(l => l.assessores)
  const de = (parte: 'pctCorretagem' | 'pctZeragem' | 'pctIncentivo', bruto: number) => {
    const p = pctComum(res.regras, parte, res.linhas)
    return `${p ? `${p} de ` : 'sobre '}${fmtBRL2(bruto)}`
  }

  // Mês a mês: do início da regra até hoje (ou até o mês pedido, se for depois), com o que foi pago
  const fim = mesRef > mesAtual() ? mesRef : mesAtual()
  const janela: string[] = []
  for (let m = inicio; m <= fim && janela.length < 60; m = somarMeses(m, 1)) janela.push(m)
  const porMes = new Map(res.porMes.map(x => [x.mes, x.t]))
  const pagoPorMes = new Map<string, number>()
  for (const p of visiveis) { const m = parseMes(p.mes_ref); if (m) pagoPorMes.set(m, (pagoPorMes.get(m) ?? 0) + p.valor) }
  const pagoNaJanela = janela.reduce((s, m) => s + (pagoPorMes.get(m) ?? 0), 0)

  const hrefImpressao = (() => {
    const p = new URLSearchParams({ parceiro, mes: mesRef.slice(0, 7) })
    if (corretora) p.set('corretora', corretora)
    return `/extrato?${p.toString()}`
  })()
  // a divisão do valor do mês e quantos giraram: quatro cartões no computador; no celular, um recolhido
  const divisao = [
    { label: 'Corretagem', valor: fmtBRL2(t.parteCorretagem), dinheiro: true, sub: `${de('pctCorretagem', t.corretagem)} · ${fmtNum(t.lotes)} lotes` },
    { label: 'Zeragem', valor: fmtBRL2(t.parteZeragem), dinheiro: true, sub: `${de('pctZeragem', t.zeragem)} · ${fmtNum(t.zerados)} ${t.zerados === 1 ? 'contrato zerado' : 'contratos zerados'}` },
    { label: 'Incentivo', valor: fmtBRL2(t.parteIncentivo), dinheiro: true, sub: `${de('pctIncentivo', t.incentivo)} · ${fmtNum(t.comFaixa)} ${t.comFaixa === 1 ? 'cliente com faixa' : 'clientes com faixa'}` },
    {
      label: `Giraram em ${mes}`, valor: fmtNum(t.ativos), dinheiro: false,
      sub: [codigos.length ? `de ${fmtNum(clientesNosCodigos)} ${clientesNosCodigos === 1 ? 'cliente' : 'clientes'} com conta no código ${codigos.join(', ')}` : null,
        naFicha ? `${fmtNum(naFicha)} ${naFicha === 1 ? 'cliente' : 'clientes'} pela lista da ficha` : null].filter(Boolean).join(' · ') || 'nenhum código ligado',
    },
  ]

  return (
    <>
      {semCodigo.map(l => (
        <Alert key={l.corretora} tone="warn" title={`Nenhum código de assessor ligado a ${parceiro} na ${CORRETORA_LABEL[l.corretora]}`}>
          A regra existe, mas falta dizer quais clientes são dele. {admin ? <>Escolha {parceiro} na coluna Parceiro do assessor em <Link href={`/${CORRETORA_SLUG[l.corretora]}/parametros`} className="link">Parâmetros › Assessores</Link>.</> : 'Peça ao administrador para ligar o código do assessor em Parâmetros.'}
        </Alert>
      ))}
      {antesDoInicio && (
        <Alert tone="neutral" title={`A participação de ${parceiro} começa em ${mesLongo(inicio)}`}>
          Antes disso nada é devido a ele. <Link href={hrefComissoes({ parceiro, corretora, mes: inicio })} className="link">Ver {mesLongo(inicio)}</Link>.
        </Alert>
      )}

      {/* Celular (DESIGN.md §8): a página do parceiro abre pelo número dele, em uma frase: quanto tem a receber no
          mês e o saldo a pagar. São os mesmos valores dos cartões "A receber" e "Saldo a pagar". */}
      {!antesDoInicio && (
        <div className="md:hidden">
          <Resumo frase={`${parceiro} tem ${fmtBRL2(totalMes)} a receber de ${mes}${corrente ? (ultima ? `, parcial (lotes até ${ddmm(ultima)})` : ', parcial (sem lotes no mês ainda)') : ''}. ${
            saldo > 0 ? `O saldo a pagar até hoje é de ${fmtBRL2(saldo)}.` : saldo < 0 ? `Já foram pagos ${fmtBRL2(-saldo)} acima do gerado até hoje.` : 'Tudo o que foi gerado até hoje já foi pago.'}`} />
        </div>
      )}

      {/* No celular ficam os dois cartões que respondem à página (a receber e saldo: a ordem do computador volta por
          classe) e a divisão por corretagem, zeragem e incentivo desce para um recolhido logo abaixo */}
      <KpiRow cols={6}>
        <KpiCard destaque label={`A receber de ${mes}`} value={fmtBRL2(totalMes)} valueClassName={fonteKpi(fmtBRL2(totalMes))}
          sub={`${corrente ? (ultima ? `parcial · lotes até ${ddmm(ultima)}` : 'parcial · sem lotes no mês ainda') : 'corretagem, zeragem e incentivo'}${btgMes > 0 ? ` · inclui ${fmtBRL2(btgMes)} do BTG` : ''}`} />
        <KpiCard className="md:order-4" label="Saldo a pagar" value={fmtBRL2(saldo)} valueClassName={fonteKpi(fmtBRL2(saldo))} tone={saldo < 0 ? 'warn' : 'neutral'}
          sub={saldo < 0 ? 'pago acima do gerado até hoje' : `gerado ${fmtBRL2(gerado)} menos pago ${fmtBRL2(pago)}`} />
        {divisao.map((d, i) => <KpiCard key={d.label} className={cn('max-md:hidden!', i < 3 ? 'md:order-1' : 'md:order-5')} label={d.label} value={d.valor} valueClassName={d.dinheiro ? fonteKpi(d.valor) : undefined} sub={d.sub} />)}
      </KpiRow>
      <Recolhido tamanho="linha" titulo="Corretagem, zeragem e incentivo" className="md:hidden">
        <dl className="divide-y divide-line">
          {divisao.map(d => (
            <div key={d.label} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0"><dt className="text-dense text-fg">{d.label}</dt><dd className="text-label text-fg-muted">{d.sub}</dd></div>
              <dd className="num shrink-0 text-dense font-semibold text-fg">{d.valor}</dd>
            </div>
          ))}
        </dl>
      </Recolhido>

      <Panel title={`De onde vem o valor de ${mesLongo(mesRef)}`}
        subtitle={<>O que cada cliente de {parceiro} gerou no mês e quanto disso vai para ele.<span className="max-md:hidden"> Corretagem e zeragem são as do sistema, antes do repasse da corretora e de impostos; o incentivo é o da tela Incentivo{corrente ? ' e pode subir até o fim do mês, conforme os pontos' : ''}.</span></>}
        action={<ExtratoAcoes matriz={planilhaReceita(res.linhas.map(c => ({ ...c, corretora: rotuloCorretora(c.corretora) })), variasCorretoras)}
          nomeArquivo={nomeArquivoExtrato(parceiro, mesRef, corretora).replace(/^extrato-/, 'participacao-')} aba="Participação" hrefImpressao={hrefImpressao} />}>
        <MostrarMais total={res.linhas.length}>
        <div className="tbl-wrap max-h-[70vh]">
          <TabelaReceitaParceiro linhas={res.linhas} totais={res.linhas.length ? t : TOTAIS_VAZIOS} parceiro={parceiro} comCorretora={variasCorretoras}
            classeLinha={alemDoLimite}
            vazio={antesDoInicio ? `A regra começa em ${mesLongo(inicio)}.` : `Nenhum cliente de ${parceiro} operou em ${mesLongo(mesRef)}.`} />
        </div>
        </MostrarMais>
        {res.linhas.some(c => c.incentivoCliente > 0 && c.incentivo < c.incentivoCliente) && (
          <p className="mt-2 text-label text-fg-subtle max-md:text-fg-muted">* Cliente que também operou fora do código do parceiro: entra a fração do incentivo que corresponde aos pontos feitos no código.</p>
        )}
        {res.linhas.some(c => c.pctFicha != null) && (
          <p className="mt-2 text-label text-fg-subtle max-md:text-fg-muted">Cliente marcado “pela ficha”: {parceiro} está na lista de parceiros da ficha dele e leva esse percentual do que o cliente gerou no mês, em qualquer código nosso.</p>
        )}
      </Panel>

      {/* No celular cada mês é uma linha que abre o mês (tbl-lista): o valor a receber à direita; os lotes, o que foi
          pago e o que falta na linha de apoio. A divisão por corretagem, zeragem, incentivo e BTG de cada mês está
          no mês aberto (o recolhido lá de cima). O destaque do mês aberto fica só no computador. */}
      <Panel title="Mês a mês" subtitle={<>Desde {mesLongo(inicio)}, quando a regra começou.<span className="max-md:hidden"> Clique no mês para ver os clientes dele.</span></>}>
        <div className="tbl-wrap">
          <table className="tbl tbl-dense tbl-lista lista-abre" style={listaDireita('7rem')}>
            <thead>
              <tr>
                <th>Mês</th><th className="num col-p3">Giraram</th><th className="num col-p2">Lotes</th><th className="num col-p2">Corretagem</th><th className="num col-p2">Zeragem</th>
                <th className="num col-p2">Incentivo</th>{geradoBtg > 0 && <th className="num col-p2">BTG</th>}<th className="num">A receber</th><th className="num">Pago</th><th className="num">Falta pagar</th>
              </tr>
            </thead>
            <tbody>
              {[...janela].reverse().map(m => {
                const x = porMes.get(m) ?? TOTAIS_VAZIOS
                const pg = pagoPorMes.get(m) ?? 0
                const doBtg = btgPorMes.get(m) ?? 0
                const total = round2(x.total + doBtg)
                const falta = round2(total - pg)
                return (
                  <tr key={m} className={cn(m === mesRef && 'md:bg-accent-soft')}>
                    <td className="cel-titulo font-medium"><Link href={hrefComissoes({ parceiro, corretora, mes: m })} className="link">{mesLongo(m)}</Link></td>
                    <td className={cn('num col-p3', !x.ativos && 'subtle')}>{n0(x.ativos)}</td>
                    <td className={cn('num col-p2 cel-sub', !x.lotes && 'subtle vazio')}>{n0(x.lotes)}<span className="md:hidden"> {x.lotes === 1 ? 'lote' : 'lotes'}</span></td>
                    <td className={cn('num col-p2', !x.parteCorretagem && 'subtle')}>{r0(x.parteCorretagem)}</td>
                    <td className={cn('num col-p2', !x.parteZeragem && 'subtle')}>{r0(x.parteZeragem)}</td>
                    <td className={cn('num col-p2', !x.parteIncentivo && 'subtle')}>{r0(x.parteIncentivo)}</td>
                    {geradoBtg > 0 && <td className={cn('num col-p2 cel-sub', !doBtg && 'subtle vazio')} data-rotulo="inclui">{r0(doBtg)}<span className="md:hidden"> do BTG</span></td>}
                    <td className={cn('num cel-valor font-medium', !total && 'subtle')}><span className={cn(!total && 'max-md:text-fg-subtle')}>{r0(total)}</span></td>
                    <td className={cn('num cel-sub', !pg && 'subtle vazio')} data-rotulo="pago">{r0(pg)}</td>
                    <td className={cn('num cel-sub font-medium max-md:font-normal', falta < 0 ? 'text-warn' : !falta && 'subtle vazio')} data-rotulo={falta < 0 ? 'pago\u00a0a\u00a0mais' : 'falta\u00a0pagar'} title={falta < 0 ? 'pago acima do valor do mês' : undefined}>
                      <span className={cn(falta < 0 && 'max-md:hidden')}>{r0(falta)}</span>{falta < 0 && <span className="text-warn md:hidden">{r0(-falta)}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {janela.length > 1 && (
              <tfoot>
                <tr className="total">
                  <td className="cel-titulo">Desde {mesCurto(inicio)}</td><td className="col-p3" />
                  <td className="num col-p2 cel-sub">{n0(res.porMes.reduce((s, x) => s + x.t.lotes, 0))}<span className="md:hidden"> lotes</span></td>
                  <td className="num col-p2 cel-sub" data-rotulo="corretagem">{r0(round2(res.porMes.reduce((s, x) => s + x.t.parteCorretagem, 0)))}</td>
                  <td className="num col-p2 cel-sub" data-rotulo="zeragem">{r0(round2(res.porMes.reduce((s, x) => s + x.t.parteZeragem, 0)))}</td>
                  <td className="num col-p2 cel-sub" data-rotulo="incentivo">{r0(round2(res.porMes.reduce((s, x) => s + x.t.parteIncentivo, 0)))}</td>
                  {geradoBtg > 0 && <td className="num col-p2 cel-sub" data-rotulo="BTG">{r0(geradoBtg)}</td>}
                  <td className="num cel-valor">{r0(gerado)}</td>
                  <td className={cn('num cel-sub', !pagoNaJanela && 'vazio')} data-rotulo="pago">{r0(pagoNaJanela)}</td>
                  <td className={cn('num cel-sub', gerado - pagoNaJanela < 0 && 'text-warn', !round2(gerado - pagoNaJanela) && 'vazio')} data-rotulo={'falta\u00a0pagar'}>{r0(round2(gerado - pagoNaJanela))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Panel>

      {extra}

      <RecolheNoCelular titulo="Como é calculado">
      <Panel title={<span className="max-md:hidden">Como é calculado</span>}>
        <ul className="max-w-3xl list-disc space-y-1 pl-5 text-dense text-fg-muted">
          {livros.flatMap(l => l.regras.map(r => (
            <li key={`${l.corretora}:${r.desde}`}>
              <span className="text-fg">{CORRETORA_LABEL[l.corretora]}, desde {mesLongo(r.desde)}</span>: {textoDaRegraCom(r, `dos clientes ${l.assessores.length ? `do código ${l.assessores.join(', ')}` : 'dos códigos ligados a ele'}`)}.
            </li>
          )))}
          {temFicha && <li>Cliente com lista de parceiros na ficha: {parceiro} leva o percentual dele na lista, sobre a corretagem e a zeragem do cliente em qualquer código nosso (e sobre o incentivo, quando a regra dele tem incentivo). Esse cliente deixa de contar pelo código do assessor.</li>}
          <li>Entra o que foi operado enquanto a conta estava no código do parceiro. Corretagem = lotes × tarifa; zeragem = contratos zerados × o valor da zeragem.</li>
          <li>Incentivo = o que a corretora paga pelo cliente no mês, pela faixa de pontos. Enquanto o mês não fecha, o valor é parcial.</li>
          <li>Os percentuais ficam em Parâmetros (Parceiros com participação na receita) e o código do parceiro, em Parâmetros › Assessores. A lista de parceiros de um cliente fica na ficha dele (Editar › Parceiros do cliente). Pagamentos são lançados na aba Pagamentos e regras.</li>
        </ul>
      </Panel>
      </RecolheNoCelular>
    </>
  )
}
