// Painel › Mês a mês: como evoluiu. O gráfico e uma tabela só com os meses que têm dados, em blocos (base,
// giro, receita, comissão, parceiros e leads). Por padrão aparece o essencial de cada bloco; "todas as
// linhas" abre a conta completa do fechamento (bruta, impostos, clientes diretos, cada parceiro, fora do
// giro e Banking passo a passo), que antes ficava tudo junto numa tabela de mais de 40 linhas.
import Link from 'next/link'
import type { Contexto } from '@/lib/gestao/pagina'
import { comissaoMensal, funilMensal, painelResumo } from '@/lib/gestao/consultas'
import { janelaMeses, mesCurto, mesLongo } from '@/lib/gestao/meses'
import type { FunilMensalRow, PainelMensalRow } from '@/lib/gestao/tipos'
import { fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { TRACO, n0, n2, p1, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { economiaDoPainel } from './economia'

type Linha = {
  label: string
  valores: (number | null)[]
  fmt: (v: number | null) => string
  destaque?: 'bold' | 'total' | 'sub'
  total?: boolean                 // soma os meses na última coluna
  so?: 'principal' | 'todas'      // sem isto, a linha aparece nas duas visões
}
type Bloco = { titulo: string; linhas: Linha[] }

export async function AbaMeses({ ctx, todas }: { ctx: Contexto; todas: boolean }) {
  const { corretora, mesRef, base } = ctx
  const [eco, funil, comissoes, painel] = await Promise.all([
    economiaDoPainel(corretora, mesRef),
    funilMensal(mesRef, 12),
    comissaoMensal(mesRef, 12, null, corretora),
    todas ? painelResumo(corretora, mesRef) : Promise.resolve(null),   // só para o "% ativos do total levado"
  ])
  const { cfg, atp, comRepasse, mensal, mensalPorMes, repasseDe, foraDe, bankingDe, liquidoCom, temFora, temBanking, parceirosComReceita } = eco
  const temExtras = temFora || temBanking
  const temLivros = parceirosComReceita.length > 0

  // Só os meses com dados da corretora: do primeiro com base ou giro até o mês de referência
  const janela = janelaMeses(mesRef, 12)
  const comDado = (m: string) => { const x = mensalPorMes.get(m); return !!x && (x.lotes > 0 || x.receita > 0 || x.clientes_ativos > 0 || x.migrados_acumulados > 0 || x.novas_migracoes > 0 || x.entradas > 0) }
  const primeiro = janela.findIndex(comDado)
  const meses = primeiro < 0 ? janela.slice(-1) : janela.slice(primeiro)
  // No celular só os 3 últimos meses ficam visíveis (os outros em telas ≥ 768 px)
  const colMes = (i: number) => (i < meses.length - 3 ? 'col-p2' : '')

  const funilPorMes = new Map(funil.map(f => [f.mes_ref, f]))
  // Comissão de parceiros (abertura e ativação de conta) nesta corretora, somando os parceiros
  const comissaoPorMes = new Map<string, { valor: number; aberturas: number; ativacoes: number }>()
  for (const c of comissoes) {
    const x = comissaoPorMes.get(c.mes_ref) ?? { valor: 0, aberturas: 0, ativacoes: 0 }
    x.valor += c.valor_abertura + c.valor_ativacao; x.aberturas += c.aberturas; x.ativacoes += c.ativacoes + c.reativacoes
    comissaoPorMes.set(c.mes_ref, x)
  }

  const col = (fn: (m: PainelMensalRow | undefined, f: FunilMensalRow | undefined) => number | null) => meses.map(m => fn(mensalPorMes.get(m), funilPorMes.get(m)))
  const porMes = (fn: (mes: string) => number | null) => meses.map(fn)
  const nn = (v: number | null) => (v == null ? TRACO : n0(v))
  const rr = (v: number | null) => (v == null ? TRACO : rCurto(v))
  const rc = (v: number | null) => (v == null ? TRACO : r0(v))   // com centavos: fora do giro e Banking ainda são de poucos reais
  const pp = (v: number | null) => (v == null ? TRACO : p1(v))
  const levados = painel?.resumo.levados ?? 0

  const blocoBase: Bloco = {
    titulo: 'Base de clientes',
    linhas: [
      { label: 'Clientes migrados (acumulado)', valores: col(m => m?.migrados_acumulados ?? null), fmt: nn },
      { label: 'Novas migrações', valores: col(m => m?.novas_migracoes ?? null), fmt: nn, total: true },
      { label: 'Clientes levados (data de entrada)', valores: col(m => m?.entradas ?? null), fmt: nn, total: true, so: 'todas' },
      { label: 'Clientes ativos', valores: col(m => m?.clientes_ativos ?? null), fmt: nn, destaque: 'bold' },
      { label: '% ativos da base migrada', valores: col(m => (m && m.migrados_acumulados ? (m.clientes_ativos / m.migrados_acumulados) * 100 : null)), fmt: pp, destaque: 'sub', so: 'todas' },
      { label: '% ativos do total levado', valores: col(m => (m && levados ? (m.clientes_ativos / levados) * 100 : null)), fmt: pp, destaque: 'sub', so: 'todas' },
    ],
  }
  const blocoGiro: Bloco = {
    titulo: 'Giro',
    linhas: [
      { label: 'Lotes girados', valores: col(m => m?.lotes ?? null), fmt: nn, destaque: 'bold', total: true },
      { label: 'Lotes zerados', valores: col(m => m?.zerados ?? null), fmt: nn, total: true },
      ...(mensal.some(m => m.posicao > 0) ? [{ label: 'Posição (ações e contratos carregados, fora dos lotes)', valores: col(m => m?.posicao ?? null), fmt: nn, destaque: 'sub', total: true, so: 'todas' } as Linha] : []),
      { label: 'Lotes por cliente ativo', valores: col(m => (m && m.clientes_ativos ? m.lotes / m.clientes_ativos : null)), fmt: v => (v == null ? TRACO : n2(Math.round(v * 10) / 10)), so: 'todas' },
    ],
  }
  const blocoReceita: Bloco = {
    titulo: comRepasse ? 'Receita do giro (o que os clientes geram)' : 'Receita',
    linhas: [
      { label: 'Corretagem', valores: col(m => m?.receita_corretagem ?? null), fmt: rr, total: true },
      { label: 'Zeragem', valores: col(m => m?.receita_zeragem ?? null), fmt: rr, total: true },
      ...(mensal.some(m => m.receita_acoes > 0 || m.acoes_operacoes > 0) ? [
        { label: 'Corretagem fixa (ações, cripto e posições)', valores: col(m => m?.receita_acoes ?? null), fmt: rr, total: true, so: 'todas' } as Linha,
        { label: 'operações de ações e cripto (day trade)', valores: col(m => m?.acoes_operacoes ?? null), fmt: nn, destaque: 'sub', total: true, so: 'todas' } as Linha,
      ] : []),
      ...(atp ? [] : [{ label: `Incentivo ${ctx.label}`, valores: col(m => m?.incentivo ?? null), fmt: rr, total: true } as Linha]),
      // com cadeia de repasse o resultado vem no bloco seguinte; sem ela, a receita total é o resultado
      { label: comRepasse ? 'Receita do giro' : 'Receita total', valores: col(m => (m ? eco.receitaTotal(m) : null)), fmt: rr, destaque: comRepasse ? 'bold' : 'total', total: true },
    ],
  }

  // A mesma ordem do fechamento mensal: bruta → líquida → comissão → Delta → imposto → parceiros → líquida
  const rep = (fn: (r: ReturnType<typeof repasseDe>, m: PainelMensalRow) => number | null) => col(m => (m ? fn(repasseDe(m), m) : null))
  // fora do giro e Banking: uma linha no essencial (o líquido) e os quatro passos em "todas as linhas"
  const quatro = (nome: string, curto: string, de: (mes: string) => ReturnType<typeof foraDe>, rotulo: string): Linha[] => [
    { label: `${nome} (líquido)`, valores: porMes(m => de(m)?.liquida ?? null), fmt: rc, total: true, so: 'principal' },
    { label: `${nome}: comissão do ${ctx.label} (${rotulo})`, valores: porMes(m => de(m)?.comissao ?? null), fmt: rc, total: true, so: 'todas' },
    { label: `parte do escritório no ${curto}`, valores: porMes(m => de(m)?.parte ?? null), fmt: rc, destaque: 'sub', total: true, so: 'todas' },
    { label: `(–) Imposto do ${curto}`, valores: porMes(m => de(m)?.imposto ?? null), fmt: rc, destaque: 'sub', total: true, so: 'todas' },
    { label: `${nome}: comissão líquida`, valores: porMes(m => de(m)?.liquida ?? null), fmt: rc, destaque: 'bold', total: true, so: 'todas' },
  ]
  const blocoComissao: Bloco | null = comRepasse ? {
    titulo: `Comissão (o que o ${ctx.label} paga e o que fica)`,
    linhas: [
      { label: `Receita bruta ${ctx.label}: preço pago pelo cliente, receita ÷ (1 − ${fmtPct(cfg.impostosEmbutidosPct, 2)} de impostos no preço)`, valores: rep(r => r.bruta), fmt: rr, destaque: 'sub', total: true, so: 'todas' },
      { label: `(–) Impostos ${ctx.label} ${fmtPct(cfg.impostoBtgPct, 2)}`, valores: rep(r => r.impostoBtg), fmt: rr, destaque: 'sub', total: true, so: 'todas' },
      { label: `Receita líquida ${ctx.label}`, valores: rep(r => r.liquida), fmt: rr, total: true, so: 'todas' },
      { label: `Comissão ${ctx.label} (% efetivo)`, valores: rep((r, m) => (m.receita ? r.pctEfetivo : null)), fmt: pp, destaque: 'sub', so: 'todas' },
      { label: `Comissão que o ${ctx.label} paga`, valores: rep(r => r.comissao), fmt: rr, destaque: 'bold', total: true },
      // o essencial: três descontos somados; em "todas as linhas", cada passo do fechamento
      { label: temLivros ? '(–) Delta e terceiros' : '(–) Delta', valores: rep(r => r.delta + r.parceiros.reduce((s, p) => s + p.terceiros, 0)), fmt: rr, destaque: 'sub', total: true, so: 'principal' },
      { label: '(–) Imposto', valores: rep(r => r.imposto + r.parceiros.reduce((s, p) => s + p.imposto, 0)), fmt: rr, destaque: 'sub', total: true, so: 'principal' },
      ...(temLivros ? [{ label: `(–) Parceiros, a repassar (${parceirosComReceita.map(p => p.nome).join(', ')})`, valores: rep(r => r.repasseParceiros), fmt: rr, destaque: 'sub', total: true, so: 'principal' } as Linha] : []),
      ...(temLivros ? [{ label: 'Clientes diretos: comissão', valores: rep(r => r.comissaoDireta), fmt: rr, total: true, so: 'todas' } as Linha] : []),
      { label: `(–) Delta ${fmtPct(cfg.deltaPct, 0)}${temLivros ? ' sobre a comissão dos diretos' : ''}`, valores: rep(r => r.delta), fmt: rr, destaque: 'sub', total: true, so: 'todas' },
      { label: temLivros ? 'Comissão do escritório nos clientes diretos' : 'Comissão do escritório', valores: rep(r => r.comissaoEscritorio), fmt: rr, total: true, so: 'todas' },
      { label: `(–) Imposto ${fmtPct(cfg.impostoPct, 1)}`, valores: rep(r => r.imposto), fmt: rr, destaque: 'sub', total: true, so: 'todas' },
      // clientes de parceiros com participação (só os que têm receita na janela): imposto, parte do parceiro e o que fica
      ...(temLivros ? [
        { label: 'Comissão líquida dos clientes diretos', valores: rep(r => r.liquidoDireto), fmt: rr, total: true, so: 'todas' } as Linha,
        ...parceirosComReceita.flatMap((p): Linha[] => {
          const de = (fn: (x: ReturnType<typeof repasseDe>['parceiros'][number]) => number) => rep(r => { const x = r.parceiros.find(y => y.nome === p.nome); return x ? fn(x) : 0 })
          return [
            { label: `Clientes do parceiro ${p.nome}: comissão`, valores: de(x => x.comissao), fmt: rr, total: true, so: 'todas' },
            { label: `(–) Imposto ${fmtPct(cfg.impostoPct, 1)} · ${p.nome}`, valores: de(x => x.imposto), fmt: rr, destaque: 'sub', total: true, so: 'todas' },
            { label: `(–) Parte do parceiro ${p.nome} (${fmtPct(p.pctParceiro, 0)}), a repassar`, valores: de(x => x.parceiro), fmt: rr, destaque: 'sub', total: true, so: 'todas' },
            { label: `(–) Delta e terceiros (${fmtPct(100 - p.pctEscritorio, 0)} do restante) · ${p.nome}`, valores: de(x => x.terceiros), fmt: rr, destaque: 'sub', total: true, so: 'todas' },
            { label: `Comissão líquida do escritório nos clientes de ${p.nome}`, valores: de(x => x.escritorio), fmt: rr, total: true, so: 'todas' },
          ]
        }),
      ] : []),
      // sem nada fora dos lotes gravado, o líquido do giro já é a comissão líquida do escritório
      ...(temExtras ? [{ label: 'Líquido do giro', valores: rep(r => r.liquido), fmt: rr, destaque: 'bold', total: true } as Linha] : []),
      ...(temFora ? quatro('Fora do giro', 'fora do giro', foraDe, 'CDB, saldo remunerado, aluguel, fundos…') : []),
      ...(temBanking ? quatro('Banking', 'Banking', bankingDe, 'cartão, saldo remunerado e outros produtos bancários') : []),
      { label: 'Comissão líquida do escritório', valores: rep((r, m) => liquidoCom(m.mes_ref, r.liquido)), fmt: rr, destaque: 'total', total: true },
      ...cfg.participacoes.map((p): Linha => ({ label: `${p.nome} (${fmtPct(p.pct, 0)})`, valores: rep((r, m) => (liquidoCom(m.mes_ref, r.liquido) * p.pct) / 100), fmt: rr, destaque: 'sub', total: true })),
      { label: 'Líquido do giro ÷ receita do giro', valores: rep((r, m) => (m.receita ? (r.liquido / m.receita) * 100 : null)), fmt: pp, destaque: 'sub', so: 'todas' },
    ],
  } : null
  const blocoParceiros: Bloco = {
    titulo: 'Parceiros e leads',
    linhas: [
      ...(comissoes.length ? [
        { label: 'Comissão de parceiros por conta (abertura e ativação)', valores: porMes(m => comissaoPorMes.get(m)?.valor ?? null), fmt: rr, total: true } as Linha,
        { label: 'contas abertas por parceiros', valores: porMes(m => comissaoPorMes.get(m)?.aberturas ?? null), fmt: nn, destaque: 'sub', total: true, so: 'todas' } as Linha,
        { label: 'ativações por parceiros (inclui reativações)', valores: porMes(m => comissaoPorMes.get(m)?.ativacoes ?? null), fmt: nn, destaque: 'sub', total: true, so: 'todas' } as Linha,
      ] : []),
      { label: 'Leads recebidos (todas as corretoras)', valores: col((_, f) => f?.recebidos ?? null), fmt: nn, total: true },
      { label: 'dos quais já eram clientes', valores: col((_, f) => f?.ja_clientes ?? null), fmt: nn, destaque: 'sub', total: true, so: 'todas' },
      { label: 'Leads ganhos (data do fechamento)', valores: col((_, f) => f?.ganhos ?? null), fmt: nn, total: true },
    ],
  }
  const blocos = [blocoBase, blocoGiro, blocoReceita, blocoComissao, blocoParceiros]
    .filter((b): b is Bloco => b != null)
    .map(b => ({ ...b, linhas: b.linhas.filter(l => !l.so || l.so === (todas ? 'todas' : 'principal')) }))
    .filter(b => b.linhas.length > 0)
  const totalLinhas = [blocoBase, blocoGiro, blocoReceita, blocoComissao, blocoParceiros].reduce((s, b) => s + (b?.linhas.filter(l => l.so !== 'principal').length ?? 0), 0)

  const grafico = meses.map(m => {
    const x = mensalPorMes.get(m)
    return { label: mesCurto(m), lotes: x?.lotes ?? 0, receita: x ? eco.receitaTotal(x) : 0, ativos: x?.clientes_ativos ?? 0 }
  })
  const hrefLinhas = `${base}/painel?${ctx.mesEscolhido ? `mes=${mesRef.slice(0, 7)}&` : ''}aba=meses${todas ? '' : '&linhas=todas'}`
  const periodo = meses.length > 1 ? `${mesCurto(meses[0])} a ${mesCurto(mesRef)}` : mesCurto(mesRef)

  return (
    <>
      <Panel title="Lotes, receita e clientes ativos" subtitle={`${periodo} · receita = corretagem + zeragem${atp ? '' : ' + incentivo'}`}>
        <GraficoSeries
          dados={grafico}
          series={[
            { key: 'lotes', nome: 'Lotes girados', tipo: 'bar' },
            { key: 'receita', nome: 'Receita total', tipo: 'line', eixo: 'dir', formato: 'brl' },
            { key: 'ativos', nome: 'Clientes ativos', tipo: 'line', eixo: 'dir', formato: 'num' },
          ]}
          formato="num"
          formatoDir="num"
          altura={260}
        />
      </Panel>

      <Panel title={todas ? 'Mês a mês · todas as linhas' : 'Mês a mês'}
        subtitle={`${periodo}; o último mês pode estar parcial. ${todas ? 'A conta completa do fechamento, passo a passo.' : 'O essencial de cada bloco.'}`}
        action={<Link href={hrefLinhas} scroll={false} className="link text-label">{todas ? 'mostrar só o essencial' : `ver todas as linhas (${totalLinhas})`}</Link>}>
        {/* com poucos meses a tabela não se estica pela tela toda: os números ficam perto dos rótulos */}
        <div className="tbl-wrap" style={meses.length <= 6 ? { maxWidth: 520 + (meses.length + 1) * 130 } : undefined}>
          <table className="tbl tbl-dense">
            <thead>
              <tr>
                <th className="sticky-col min-w-[200px]">Indicador</th>
                {meses.map((m, i) => <th key={m} className={cn('num', colMes(i), m === mesRef && 'text-fg')}>{mesCurto(m)}</th>)}
                {meses.length > 1 && <th className="num">Total</th>}
              </tr>
            </thead>
            {blocos.map(b => (
              <tbody key={b.titulo}>
                <tr>
                  <td className="sticky-col border-b-0 pb-1 pt-5"><span className="label whitespace-nowrap">{b.titulo}</span></td>
                  <td colSpan={meses.length + (meses.length > 1 ? 1 : 0)} className="border-b-0 pb-1 pt-5" />
                </tr>
                {b.linhas.map(l => {
                  const soma = l.total ? l.valores.reduce<number>((s, v) => s + (v ?? 0), 0) : null
                  return (
                    <tr key={l.label} className={l.destaque === 'total' ? 'total' : ''}>
                      <td className={cn('sticky-col', l.destaque === 'sub' && 'pl-6 text-fg-muted', l.destaque === 'bold' && 'font-semibold')}>{l.label}</td>
                      {l.valores.map((v, i) => (
                        <td key={i} className={cn('num', colMes(i), (v == null || v === 0) && 'subtle', l.destaque === 'bold' && 'font-semibold')}>{l.fmt(v)}</td>
                      ))}
                      {meses.length > 1 && <td className="num font-semibold">{soma == null ? '' : l.fmt(soma)}</td>}
                    </tr>
                  )
                })}
              </tbody>
            ))}
          </table>
        </div>
        {comRepasse && (
          <p className="mt-3 max-w-4xl text-micro text-fg-subtle">
            A comissão segue o fechamento mensal do {ctx.label} (Parâmetros): no mês já fechado vale o percentual que o {ctx.label} pagou; nos outros, as faixas.
            {todas && ` A receita bruta do ${ctx.label} é maior que a receita do giro porque o preço cobrado do cliente embute ${fmtPct(cfg.impostosEmbutidosPct, 2)} de impostos e a tarifa cadastrada (R$/lote) é o valor sem eles.`}
            {todas && temLivros && ' Os clientes de parceiros com participação na comissão seguem a divisão combinada com cada parceiro: imposto, parte do parceiro e o que fica para o escritório.'}
            {temExtras && ' O fora do giro e o Banking vêm das planilhas do mês (Importar), já com a parte do escritório e o imposto de lá.'}
            {' '}A conta de um mês só, explicada, está na aba Resumo ({mesLongo(mesRef)}).
          </p>
        )}
      </Panel>
    </>
  )
}
