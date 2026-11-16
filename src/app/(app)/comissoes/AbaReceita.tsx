// Resumo de um parceiro com participação na receita (parâmetro parceiros_receita da corretora): quanto
// ele tem a receber no mês, de quais clientes veio, o mês a mês e a regra. Lucas, 16/11/2026: Fabio Ferron
// é a ZEVE INVESTIMENTOS 5 na Genial e recebe metade da corretagem, da zeragem e do incentivo dos clientes dele.
import type { ReactNode } from 'react'
import Link from 'next/link'
import { comissaoPagamentos } from '@/lib/gestao/consultas'
import { participacaoReceita, repasseBtgMensal, type RegrasCorretora } from '@/lib/gestao/consultasParticipacao'
import { pctComum, planilhaReceita, resumirReceita, textoDaRegra, TOTAIS_VAZIOS } from '@/lib/gestao/participacao'
import { nomeArquivoExtrato, rotuloCorretora } from '@/lib/gestao/extrato'
import { mesAtual, mesCurto, mesLongo, parseMes, somarMeses } from '@/lib/gestao/meses'
import { CORRETORA_LABEL, CORRETORA_SLUG } from '@/lib/corretoras'
import { fmtBRL2, fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Alert } from '@/components/ui/Alert'
import { n0, r0 } from '@/components/gestao/Celulas'
import { TabelaReceitaParceiro } from '@/components/gestao/TabelaReceitaParceiro'
import { ExtratoAcoes } from './ExtratoAcoes'
import { fonteKpi, hrefComissoes, pagamentosDoFiltro, round2, type FiltroAba } from './comum'

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
  const inicio = livros.map(l => l.regras[0]?.desde).filter(Boolean).sort()[0] ?? mesRef
  // a parte dele na comissão do BTG, mês a mês, desde o início da regra
  const repasse = btg ? await repasseBtgMensal(parceiro, inicio) : null
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
  const semCodigo = livros.filter(l => l.assessores.length === 0)
  const clientesNosCodigos = livros.reduce((s, l) => s + l.clientes, 0)
  const codigos = livros.flatMap(l => l.assessores)
  const de = (parte: 'pctCorretagem' | 'pctZeragem' | 'pctIncentivo', bruto: number) => {
    const p = pctComum(res.regras, parte)
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

      <KpiRow cols={6}>
        <KpiCard destaque label={`A receber de ${mes}`} value={fmtBRL2(totalMes)} valueClassName={fonteKpi(fmtBRL2(totalMes))}
          sub={`${corrente ? (ultima ? `parcial · lotes até ${ddmm(ultima)}` : 'parcial · sem lotes no mês ainda') : 'corretagem, zeragem e incentivo'}${btgMes > 0 ? ` · inclui ${fmtBRL2(btgMes)} do BTG` : ''}`} />
        <KpiCard label="Corretagem" value={fmtBRL2(t.parteCorretagem)} valueClassName={fonteKpi(fmtBRL2(t.parteCorretagem))} sub={`${de('pctCorretagem', t.corretagem)} · ${fmtNum(t.lotes)} lotes`} />
        <KpiCard label="Zeragem" value={fmtBRL2(t.parteZeragem)} valueClassName={fonteKpi(fmtBRL2(t.parteZeragem))} sub={`${de('pctZeragem', t.zeragem)} · ${fmtNum(t.zerados)} ${t.zerados === 1 ? 'contrato zerado' : 'contratos zerados'}`} />
        <KpiCard label="Incentivo" value={fmtBRL2(t.parteIncentivo)} valueClassName={fonteKpi(fmtBRL2(t.parteIncentivo))} sub={`${de('pctIncentivo', t.incentivo)} · ${fmtNum(t.comFaixa)} ${t.comFaixa === 1 ? 'cliente com faixa' : 'clientes com faixa'}`} />
        <KpiCard label="Saldo a pagar" value={fmtBRL2(saldo)} valueClassName={fonteKpi(fmtBRL2(saldo))} tone={saldo < 0 ? 'warn' : 'neutral'}
          sub={saldo < 0 ? 'pago acima do gerado até hoje' : `gerado ${fmtBRL2(gerado)} menos pago ${fmtBRL2(pago)}`} />
        <KpiCard label={`Giraram em ${mes}`} value={fmtNum(t.ativos)}
          sub={codigos.length ? `de ${fmtNum(clientesNosCodigos)} ${clientesNosCodigos === 1 ? 'cliente' : 'clientes'} com conta no código ${codigos.join(', ')}` : 'nenhum código ligado'} />
      </KpiRow>

      <Panel title={`De onde vem o valor de ${mesLongo(mesRef)}`}
        subtitle={`O que cada cliente de ${parceiro} gerou no mês e quanto disso vai para ele. Corretagem e zeragem são as do sistema, antes do repasse da corretora e de impostos; o incentivo é o da tela Incentivo${corrente ? ' e pode subir até o fim do mês, conforme os pontos' : ''}.`}
        action={<ExtratoAcoes matriz={planilhaReceita(res.linhas.map(c => ({ ...c, corretora: rotuloCorretora(c.corretora) })), variasCorretoras)}
          nomeArquivo={nomeArquivoExtrato(parceiro, mesRef, corretora).replace(/^extrato-/, 'participacao-')} aba="Participação" hrefImpressao={hrefImpressao} />}>
        <div className="tbl-wrap max-h-[70vh]">
          <TabelaReceitaParceiro linhas={res.linhas} totais={res.linhas.length ? t : TOTAIS_VAZIOS} parceiro={parceiro} comCorretora={variasCorretoras}
            vazio={antesDoInicio ? `A regra começa em ${mesLongo(inicio)}.` : `Nenhum cliente de ${parceiro} operou em ${mesLongo(mesRef)}.`} />
        </div>
        {res.linhas.some(c => c.incentivoCliente > 0 && c.incentivo < c.incentivoCliente) && (
          <p className="mt-2 text-label text-fg-subtle">* Cliente que também operou fora do código do parceiro: entra a fração do incentivo que corresponde aos pontos feitos no código.</p>
        )}
      </Panel>

      <Panel title="Mês a mês" subtitle={`Desde ${mesLongo(inicio)}, quando a regra começou. Clique no mês para ver os clientes dele.`}>
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
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
                  <tr key={m} className={cn(m === mesRef && 'bg-accent-soft')}>
                    <td className="font-medium"><Link href={hrefComissoes({ parceiro, corretora, mes: m })} className="link">{mesLongo(m)}</Link></td>
                    <td className={cn('num col-p3', !x.ativos && 'subtle')}>{n0(x.ativos)}</td>
                    <td className={cn('num col-p2', !x.lotes && 'subtle')}>{n0(x.lotes)}</td>
                    <td className={cn('num col-p2', !x.parteCorretagem && 'subtle')}>{r0(x.parteCorretagem)}</td>
                    <td className={cn('num col-p2', !x.parteZeragem && 'subtle')}>{r0(x.parteZeragem)}</td>
                    <td className={cn('num col-p2', !x.parteIncentivo && 'subtle')}>{r0(x.parteIncentivo)}</td>
                    {geradoBtg > 0 && <td className={cn('num col-p2', !doBtg && 'subtle')}>{r0(doBtg)}</td>}
                    <td className={cn('num font-medium', !total && 'subtle')}>{r0(total)}</td>
                    <td className={cn('num', !pg && 'subtle')}>{r0(pg)}</td>
                    <td className={cn('num font-medium', falta < 0 ? 'text-warn' : !falta && 'subtle')} title={falta < 0 ? 'pago acima do valor do mês' : undefined}>{r0(falta)}</td>
                  </tr>
                )
              })}
            </tbody>
            {janela.length > 1 && (
              <tfoot>
                <tr className="total">
                  <td>Desde {mesCurto(inicio)}</td><td className="col-p3" />
                  <td className="num col-p2">{n0(res.porMes.reduce((s, x) => s + x.t.lotes, 0))}</td>
                  <td className="num col-p2">{r0(round2(res.porMes.reduce((s, x) => s + x.t.parteCorretagem, 0)))}</td>
                  <td className="num col-p2">{r0(round2(res.porMes.reduce((s, x) => s + x.t.parteZeragem, 0)))}</td>
                  <td className="num col-p2">{r0(round2(res.porMes.reduce((s, x) => s + x.t.parteIncentivo, 0)))}</td>
                  {geradoBtg > 0 && <td className="num col-p2">{r0(geradoBtg)}</td>}
                  <td className="num">{r0(gerado)}</td>
                  <td className="num">{r0(pagoNaJanela)}</td>
                  <td className={cn('num', gerado - pagoNaJanela < 0 && 'text-warn')}>{r0(round2(gerado - pagoNaJanela))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Panel>

      {extra}

      <Panel title="Como é calculado">
        <ul className="max-w-3xl list-disc space-y-1 pl-5 text-dense text-fg-muted">
          {livros.flatMap(l => l.regras.map(r => (
            <li key={`${l.corretora}:${r.desde}`}>
              <span className="text-fg">{CORRETORA_LABEL[l.corretora]}, desde {mesLongo(r.desde)}</span>: {textoDaRegra(r)} dos clientes {l.assessores.length ? `do código ${l.assessores.join(', ')}` : 'dos códigos ligados a ele'}.
            </li>
          )))}
          <li>Entra o que foi operado enquanto a conta estava no código do parceiro. Corretagem = lotes × tarifa; zeragem = contratos zerados × o valor da zeragem.</li>
          <li>Incentivo = o que a corretora paga pelo cliente no mês, pela faixa de pontos. Enquanto o mês não fecha, o valor é parcial.</li>
          <li>Os percentuais ficam em Parâmetros (Parceiros com participação na receita) e o código do parceiro, em Parâmetros › Assessores. Pagamentos são lançados na aba Pagamentos e regras.</li>
        </ul>
      </Panel>
    </>
  )
}
