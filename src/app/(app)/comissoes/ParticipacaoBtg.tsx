// A parte de um parceiro na comissão do BTG (parâmetro repasse_parceiros). Lucas, 16/11/2026, sobre o
// parceiro Fabio Ferron: "BTG: corretagem | zeragem | igual foi com a Atual Capital mês passado".
// Dois usos:
//  - AbaRepasseBtg: o Resumo de quem só tem essa participação (Atual Capital): quanto tem a receber no mês,
//    de quais clientes veio, o mês a mês com o que foi pago e o saldo. Antes o Resumo dela mostrava
//    "Comissão R$ 0" e mandava olhar a visão geral (Lucas, 16/11: "o problema continua").
//  - ParticipacaoBtg: o bloco do BTG na página de quem também tem participação na receita de outra
//    corretora (Fabio Ferron) e, sem links, na versão para imprimir.
// A conta é a do Painel do BTG (calcularRepasse). O valor entra no gerado e no saldo a pagar do parceiro.
import Link from 'next/link'
import { comissaoPagamentos, ultimaData } from '@/lib/gestao/consultas'
import { participacaoBtg, repasseBtgMensal, type ParticipacaoBtg as DadosDoMes } from '@/lib/gestao/consultasParticipacao'
import { nomeArquivoExtrato, type Celula } from '@/lib/gestao/extrato'
import { mesAtual, mesCurto, mesLongo, parseMes, somarMeses } from '@/lib/gestao/meses'
import { fmtBRL2, fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Alert } from '@/components/ui/Alert'
import { n0, r0 } from '@/components/gestao/Celulas'
import { ExtratoAcoes } from './ExtratoAcoes'
import { fonteKpi, hrefComissoes, pagamentosDoFiltro, round2, type FiltroAba } from './comum'

const pct = (v: number) => fmtPct(v, Number.isInteger(v) ? 0 : 1).replace('%', ' %')
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const textoDaRegraBtg = (b: DadosDoMes, parceiro: string) =>
  `A comissão que o BTG paga sobre os clientes dele (corretagem e zeragem) paga o imposto de ${pct(b.impostoPct)} e ${parceiro} leva ${pct(b.regra.pctParceiro)} do que sobra${b.comFicha ? '; no cliente marcado "pela ficha", leva o percentual dele na lista de parceiros da ficha' : ''}.`
const pctFicha = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} %`

// Os clientes do parceiro no BTG que geraram receita no mês e quanto cada um rende a ele
function TabelaDoMes({ b, impressao }: { b: DadosDoMes; impressao?: boolean }) {
  return (
    <table className="tbl tbl-dense">
      <thead><tr><th>Cliente</th><th className="num">Lotes</th><th className={cn('num', !impressao && 'col-p2')}>Receita</th><th className="num">A receber</th></tr></thead>
      <tbody>
        {b.clientes.map(c => (
          <tr key={c.cliente_id}>
            <td className="max-w-[260px] truncate font-medium">
              {impressao ? c.nome : <Link href={`/btg/clientes/${c.cliente_id}`} className="link">{c.nome}</Link>}
              {c.pctFicha != null && <span className="block text-micro font-normal text-fg-subtle" title="Está na lista de parceiros da ficha deste cliente e leva este percentual da comissão dele, depois do imposto">pela ficha · {pctFicha(c.pctFicha)}</span>}
            </td>
            <td className={cn('num', !c.lotes && 'subtle')}>{n0(c.lotes)}</td>
            <td className={cn('num', !impressao && 'col-p2')}>{r0(c.receita)}</td>
            <td className="num font-semibold">{r0(c.parte)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="total">
          <td>{fmtNum(b.clientes.length)} {b.clientes.length === 1 ? 'cliente' : 'clientes'}</td>
          <td className="num">{n0(b.clientes.reduce((s, c) => s + c.lotes, 0))}</td>
          <td className={cn('num', !impressao && 'col-p2')}>{r0(b.receita)}</td>
          <td className="num">{r0(b.parte)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

// Contas do parceiro que giraram no mês mas ainda não estão como migradas na ficha: a receita delas não entra
// na divisão (nem aqui nem no Painel do BTG). O aviso leva à ficha, que é onde se corrige.
function ForaDaConta({ b, mesRef }: { b: DadosDoMes; mesRef: string }) {
  if (!b.foraDaConta.length) return null
  const total = round2(b.foraDaConta.reduce((s, c) => s + c.receita, 0))
  const uma = b.foraDaConta.length === 1
  return (
    <Alert tone="warn" title={`${uma ? '1 conta girou' : `${fmtNum(b.foraDaConta.length)} contas giraram`} em ${mesLongo(mesRef)} e ainda não ${uma ? 'entra' : 'entram'} na conta: ${fmtBRL2(total)} de receita`}>
      {b.foraDaConta.map((c, i) => (
        <span key={c.cliente_id}>{i > 0 && ', '}<Link href={`/btg/clientes/${c.cliente_id}`} className="link">{c.nome}</Link> ({c.situacao.toLowerCase()}, {fmtBRL2(c.receita)})</span>
      ))}. A divisão só conta as contas com a situação Migrado. Corrija a situação na ficha do cliente e o valor passa a entrar aqui e no Painel do BTG.
    </Alert>
  )
}

const semReceita = (b: DadosDoMes, parceiro: string, mesRef: string, desde: string | null = null) =>
  desde && mesRef < desde ? `Nada em ${mesLongo(mesRef)}: a participação de ${parceiro} começa em ${mesLongo(desde)}.` : `Nada em ${mesLongo(mesRef)}: ${b.contas > 0
    ? `nenhuma das ${fmtNum(b.contas)} ${b.contas === 1 ? 'conta dele' : 'contas dele'} no BTG gerou receita no mês.`
    : `ainda não há cliente do BTG com ${parceiro} no campo Parceiro da ficha. Para um cliente contar, escolha ${parceiro} nesse campo, na ficha dele no BTG.`}`

// ── Resumo de quem só tem a participação na comissão do BTG ───────────────────
// desde = primeiro mês que conta ('AAAA-MM-01'), para quem também tem regra de participação na receita de
// outra corretora e está vendo só o BTG; sem ele, vale todo o histórico (Atual Capital).
export async function AbaRepasseBtg({ parceiro, corretora, mesRef, desde = null }: FiltroAba & { desde?: string | null }) {
  const [b, livro, pagamentos, ultima] = await Promise.all([participacaoBtg(parceiro, mesRef, desde), repasseBtgMensal(parceiro, desde), comissaoPagamentos(parceiro), ultimaData('BTG')])
  if (!b || !livro) return null
  const visiveis = pagamentosDoFiltro(pagamentos, corretora)
  const gerado = round2(livro.meses.reduce((s, m) => s + m.parte, 0))
  const pago = visiveis.reduce((s, p) => s + p.valor, 0)
  const saldo = round2(gerado - pago)
  const mes = mesCurto(mesRef)
  const corrente = mesRef === mesAtual()
  const noMes = ultima && ultima.startsWith(mesRef.slice(0, 7)) ? ultima : null
  const situacao = b.fechado ? 'pelo fechamento do mês' : corrente ? (noMes ? `prévia · lotes até ${ddmm(noMes)}` : 'prévia · sem lotes no mês ainda') : 'prévia pelas faixas de comissão'

  // Mês a mês: do primeiro mês com valor até hoje (ou até o mês pedido, se for depois), com o que foi pago
  const porMes = new Map(livro.meses.map(m => [m.mes, m]))
  const pagoPorMes = new Map<string, number>()
  for (const p of visiveis) { const m = parseMes(p.mes_ref); if (m) pagoPorMes.set(m, (pagoPorMes.get(m) ?? 0) + p.valor) }
  const inicio = [livro.meses[0]?.mes, ...pagoPorMes.keys(), mesRef].filter((m): m is string => !!m).sort()[0]
  const fim = mesRef > mesAtual() ? mesRef : mesAtual()
  const janela: string[] = []
  for (let m = inicio; m <= fim && janela.length < 60; m = somarMeses(m, 1)) janela.push(m)
  const pagoNaJanela = janela.reduce((s, m) => s + (pagoPorMes.get(m) ?? 0), 0)

  const matriz: Celula[][] = [
    ['Cliente', ...(b.comFicha ? ['Percentual pela ficha (%)'] : []), 'Lotes no mês', 'Receita (R$)', 'A receber (R$)'],
    ...b.clientes.map<Celula[]>(c => [c.nome, ...(b.comFicha ? [c.pctFicha] : []), c.lotes, round2(c.receita), c.parte]),
    [`Total · ${b.clientes.length} ${b.clientes.length === 1 ? 'cliente' : 'clientes'}`, ...(b.comFicha ? [null] : []), b.clientes.reduce((s, c) => s + c.lotes, 0), round2(b.receita), round2(b.parte)],
  ]
  const hrefImpressao = `/extrato?${new URLSearchParams({ parceiro, mes: mesRef.slice(0, 7), corretora: 'BTG' }).toString()}`

  return (
    <>
      <KpiRow cols={4}>
        <KpiCard destaque label={`A receber de ${mes}`} value={fmtBRL2(b.parte)} valueClassName={fonteKpi(fmtBRL2(b.parte))} sub={b.receita > 0 ? situacao : 'sem receita dos clientes dele no mês'} />
        <KpiCard label="Receita dos clientes dele" value={fmtBRL2(b.receita)} valueClassName={fonteKpi(fmtBRL2(b.receita))}
          sub={`${fmtNum(b.clientes.length)} de ${fmtNum(b.contas)} ${b.contas === 1 ? 'conta girou' : 'contas giraram'} · corretagem e zeragem`} />
        <KpiCard label="Comissão do BTG sobre eles" value={fmtBRL2(b.comissao)} valueClassName={fonteKpi(fmtBRL2(b.comissao))}
          sub={b.receita > 0 ? `${pct(Math.round(b.pctComissao * 10) / 10)} da receita líquida · imposto ${fmtBRL2(b.imposto)}` : undefined} />
        <KpiCard label="Saldo a pagar" value={fmtBRL2(saldo)} valueClassName={fonteKpi(fmtBRL2(saldo))} tone={saldo < 0 ? 'warn' : 'neutral'}
          sub={saldo < 0 ? 'pago acima do gerado até hoje' : `gerado ${fmtBRL2(gerado)} menos pago ${fmtBRL2(pago)}`} />
      </KpiRow>

      <Panel title={`De onde vem o valor de ${mesLongo(mesRef)}`}
        subtitle={`${textoDaRegraBtg(b, parceiro)} Abaixo, os clientes dele que geraram receita no mês e quanto cada um rende a ele.`}
        action={<ExtratoAcoes matriz={matriz} nomeArquivo={nomeArquivoExtrato(parceiro, mesRef, 'BTG').replace(/^extrato-/, 'participacao-')} aba="Participação" hrefImpressao={hrefImpressao} />}>
        {b.receita > 0
          ? <div className="tbl-wrap max-h-[70vh]"><TabelaDoMes b={b} /></div>
          : <p className="max-w-3xl text-dense text-fg-muted">{semReceita(b, parceiro, mesRef, desde)}</p>}
      </Panel>
      <ForaDaConta b={b} mesRef={mesRef} />

      <Panel title="Mês a mês" subtitle="A parte dele em cada mês e o que já foi pago. Clique no mês para ver os clientes dele.">
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead>
              <tr>
                <th>Mês</th><th className="num col-p2">Receita dos clientes</th><th className="num col-p2">Comissão do BTG</th>
                <th className="num">A receber</th><th className="num">Pago</th><th className="num">Falta pagar</th>
              </tr>
            </thead>
            <tbody>
              {[...janela].reverse().map(m => {
                const x = porMes.get(m)
                const parte = x?.parte ?? 0
                const pg = pagoPorMes.get(m) ?? 0
                const falta = round2(parte - pg)
                return (
                  <tr key={m} className={cn(m === mesRef && 'bg-accent-soft')}>
                    <td className="font-medium">
                      <Link href={hrefComissoes({ parceiro, corretora, mes: m })} className="link">{mesLongo(m)}</Link>
                      {x && !x.fechado && <span className="ml-1.5 font-normal text-fg-subtle max-sm:ml-0 max-sm:block" title="Mês ainda sem o percentual do fechamento: o valor é uma prévia pelas faixas de comissão">prévia</span>}
                    </td>
                    <td className={cn('num col-p2', !x?.receita && 'subtle')}>{r0(x?.receita)}</td>
                    <td className={cn('num col-p2', !x?.comissao && 'subtle')}>{r0(x?.comissao)}</td>
                    <td className={cn('num font-medium', !parte && 'subtle')}>{r0(parte)}</td>
                    <td className={cn('num', !pg && 'subtle')}>{r0(pg)}</td>
                    <td className={cn('num font-medium', falta < 0 ? 'text-warn' : !falta && 'subtle')} title={falta < 0 ? 'pago acima do valor do mês' : undefined}>{r0(falta)}</td>
                  </tr>
                )
              })}
            </tbody>
            {janela.length > 1 && (
              <tfoot>
                <tr className="total">
                  <td>Desde {mesCurto(inicio)}</td>
                  <td className="num col-p2">{r0(round2(livro.meses.reduce((s, m) => s + m.receita, 0)))}</td>
                  <td className="num col-p2">{r0(round2(livro.meses.reduce((s, m) => s + m.comissao, 0)))}</td>
                  <td className="num">{r0(gerado)}</td>
                  <td className="num">{r0(pagoNaJanela)}</td>
                  <td className={cn('num', gerado - pagoNaJanela < 0 && 'text-warn')}>{r0(round2(gerado - pagoNaJanela))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Panel>

      <Panel title="Como é calculado">
        <ul className="max-w-3xl list-disc space-y-1 pl-5 text-dense text-fg-muted">
          <li>{textoDaRegraBtg(b, parceiro)} O escritório fica com {pct(b.regra.pctEscritorio)} do restante.</li>
          <li>Clientes dele no BTG são os que têm {parceiro} no campo Parceiro da ficha. O cliente com lista de parceiros na ficha (Editar › Parceiros do cliente) segue só a lista: cada parceiro dela leva o percentual dele da comissão do cliente, depois do imposto.</li>
          <li>No mês já fechado vale o percentual de comissão do fechamento do BTG; antes disso o valor é uma prévia pelas faixas de comissão.</li>
          <li>Os percentuais ficam em Parâmetros › BTG › Repasse. Pagamentos são lançados na aba Pagamentos e regras.</li>
        </ul>
      </Panel>
    </>
  )
}

// ── Bloco do BTG na página de quem também tem participação na receita de outra corretora, e no extrato
// para imprimir de qualquer parceiro do repasse. `dados` = o mês já lido por quem chama (evita ler de novo);
// `desde` = primeiro mês que conta, como em AbaRepasseBtg.
export async function ParticipacaoBtg({ parceiro, mesRef, impressao, desde = null, dados }: { parceiro: string; mesRef: string; impressao?: boolean; desde?: string | null; dados?: DadosDoMes | null }) {
  const b = dados === undefined ? await participacaoBtg(parceiro, mesRef, desde) : dados
  if (!b) return null
  // no papel o bloco só aparece quando há valor
  if (impressao && b.receita <= 0) return null
  const mes = mesCurto(mesRef)
  return (
    <Panel title="BTG · participação na comissão" subtitle={`${textoDaRegraBtg(b, parceiro)} Clientes dele no BTG são os que têm ${parceiro} no campo Parceiro da ficha ou na lista de parceiros dela.`}>
      {b.receita > 0 ? (
        <>
          <KpiRow cols={3}>
            <KpiCard label={`Parte de ${parceiro} em ${mes}`} value={fmtBRL2(b.parte)} valueClassName={fonteKpi(fmtBRL2(b.parte))} sub={b.comFicha ? `sobre ${fmtBRL2(b.comissao - b.imposto)} de comissão líquida, pelo percentual de cada cliente` : `${pct(b.regra.pctParceiro)} de ${fmtBRL2(b.comissao - b.imposto)}`} />
            <KpiCard label="Receita dos clientes dele" value={fmtBRL2(b.receita)} valueClassName={fonteKpi(fmtBRL2(b.receita))} sub={`${fmtNum(b.clientes.length)} ${b.clientes.length === 1 ? 'cliente girou' : 'clientes giraram'} · corretagem e zeragem`} />
            <KpiCard label="Comissão do BTG sobre eles" value={fmtBRL2(b.comissao)} valueClassName={fonteKpi(fmtBRL2(b.comissao))} sub={`${pct(Math.round(b.pctComissao * 10) / 10)} da receita líquida · imposto ${fmtBRL2(b.imposto)}`} />
          </KpiRow>
          <div className="tbl-wrap mt-4"><TabelaDoMes b={b} impressao={impressao} /></div>
        </>
      ) : (
        <p className="max-w-3xl text-dense text-fg-muted">{semReceita(b, parceiro, mesRef, desde)}</p>
      )}
      {!impressao && b.foraDaConta.length > 0 && <div className="mt-3"><ForaDaConta b={b} mesRef={mesRef} /></div>}
      <p className="mt-3 max-w-3xl text-label text-fg-subtle">
        Mesma conta do Painel do BTG{b.fechado ? ', com o percentual de comissão do fechamento do mês' : '; antes do fechamento do mês é uma prévia pelas faixas de comissão'}.
        {impressao ? '' : ' Este valor entra no total a receber e no saldo a pagar dele.'}
      </p>
    </Panel>
  )
}
