// Painel › Mês a mês: como evoluiu. O gráfico e uma tabela só com os meses que têm dados, em blocos (base,
// giro, receita, comissão, parceiros e leads). Por padrão aparece o essencial de cada bloco; "todas as
// linhas" abre a conta completa do fechamento (bruta, impostos, clientes diretos, cada parceiro, fora do
// giro e Banking passo a passo), que antes ficava tudo junto numa tabela de mais de 40 linhas.
// No celular (DESIGN.md §8) a aba abre pela frase com os três meses mais novos; a tabela vem antes do
// gráfico, mostra primeiro os meses mais novos e leva o Total para uma lista recolhida.
import { Fragment } from 'react'
import Link from 'next/link'
import type { Contexto } from '@/lib/gestao/pagina'
import { comissaoMensal, funilMensal, painelResumo } from '@/lib/gestao/consultas'
import { janelaMeses, mesAtual as mesDeHoje, mesCurto, mesLongo } from '@/lib/gestao/meses'
import type { FunilMensalRow, PainelMensalRow } from '@/lib/gestao/tipos'
import { fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { Recolhido } from '@/components/ui/Recolhido'
import { TRACO, n0, n2, p1, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { Resumo } from '@/components/gestao/Resumo'
import { economiaDoPainel } from '@/lib/gestao/economiaPainel'
import { custosDoPainel, haCustosFixos, parametroCustosFixos } from '@/lib/gestao/consultasCustos'
import { getProfile } from '@/lib/auth/getProfile'
import { fraseDaCobertura, resultadoDepoisDosCustos, type CustosDoMes, type ItemCustoMes } from '@/lib/gestao/custos'
import { normTexto } from '@/lib/texto'
import { fraseDosMeses } from './frases'
import { ChaveCustos, custosNaQuery, semCustosNaUrl } from './ChaveCustos'

// A coluna do nome da linha no celular: mais estreita (sobra lugar para dois meses) e com o nome inteiro,
// quebrando em linhas. O "!" é preciso porque a regra da base para a primeira coluna (46vw, sem quebra,
// reticências) fica fora de camada e vence os utilitários.
const COL_NOME = 'max-md:min-w-[9.5rem] max-md:max-w-[9.5rem]! max-md:whitespace-normal!'
// Cada mês com metade do que sobra da tela (largura menos as margens e a coluna do nome): cabem dois meses
// inteiros, sem um terceiro cortado ao meio (número cortado parece outro número)
const COL_MES = 'max-md:min-w-[calc((100vw-11.5rem)/2)]'

type Linha = {
  label: string
  valores: (number | null)[]
  fmt: (v: number | null) => string
  destaque?: 'bold' | 'total' | 'sub'
  total?: boolean                 // soma os meses na última coluna
  so?: 'principal' | 'todas'      // sem isto, a linha aparece nas duas visões
  perda?: boolean                 // negativo na cor de perda (o resultado depois dos custos e as partes dos sócios)
}
type Bloco = { titulo: string; linhas: Linha[] }

export async function AbaMeses({ ctx, todas }: { ctx: Contexto; todas: boolean }) {
  const { corretora, mesRef, base } = ctx
  const janela = janelaMeses(mesRef, 12)
  // custos do escritório (só com cadeia de repasse, hoje o BTG): a chave custos_fixos é lida sozinha e começa
  // junto com a economia; a remuneração da equipe só é lida quando há pessoa em vigor na janela. Sem custo
  // lançado, nada a mais. O uso fica condicionado a comRepasse (custoDe, abaixo).
  // "Sem custos" (a chave da aba, ?custos=sem): os custos não são lidos e a aba sai como era antes deles
  const semCustos = semCustosNaUrl(ctx.q)
  const paramCustosP = parametroCustosFixos(corretora)
  const custosP = paramCustosP.then(p => (!semCustos && haCustosFixos(p, janela)
    ? custosDoPainel(p, janela)
    : new Map<string, CustosDoMes>()))
  const [eco, funil, comissoes, painel, custos, profile, paramCustos] = await Promise.all([
    economiaDoPainel(corretora, mesRef),
    funilMensal(mesRef, 12),
    comissaoMensal(mesRef, 12, null, corretora),
    todas ? painelResumo(corretora, mesRef) : Promise.resolve(null),   // só para o "% ativos do total levado"
    custosP,
    getProfile(),
    paramCustosP,
  ])
  // o valor de cada pessoa da equipe só para o admin (em Comissões, só o admin e a própria pessoa veem)
  const verEquipe = profile?.role === 'admin'
  const { cfg, atp, comRepasse, mensal, mensalPorMes, repasseDe, foraDe, bankingDe, liquidoCom, temFora, temBanking, parceirosComReceita, pctGeralSempre } = eco
  const temExtras = temFora || temBanking
  const temLivros = parceirosComReceita.length > 0

  // Só os meses com dados da corretora: do primeiro com base ou giro até o mês de referência
  const comDado = (m: string) => { const x = mensalPorMes.get(m); return !!x && (x.lotes > 0 || x.receita > 0 || x.clientes_ativos > 0 || x.migrados_acumulados > 0 || x.novas_migracoes > 0 || x.entradas > 0) }
  const primeiro = janela.findIndex(comDado)
  const meses = primeiro < 0 ? janela.slice(-1) : janela.slice(primeiro)
  // a chave "Com custos | Sem custos" só aparece quando algum mês mostrado tem custo lançado
  const temChave = comRepasse && haCustosFixos(paramCustos, meses)
  const chaveCustos = (className: string) => (temChave ? <ChaveCustos caminho={`${base}/painel`} query={ctx.q} className={className} /> : null)

  const funilPorMes = new Map(funil.map(f => [f.mes_ref, f]))
  // Comissão de parceiros (abertura e ativação de conta) nesta corretora, somando os parceiros. Nos meses com
  // custo, o valor de quem já está descontado em Equipe (com valor) sai da soma, como na conta do Resumo; sem
  // custo, nada muda. As contagens continuam de todos.
  const descontadoNoMes = (mes: string, parceiro: string) => comRepasse && !!custos.get(mes)?.itens.some(i => i.tipo !== 'valor' && i.valor != null && normTexto(i.nome) === normTexto(parceiro))
  const comissaoPorMes = new Map<string, { valor: number; aberturas: number; ativacoes: number }>()
  for (const c of comissoes) {
    const x = comissaoPorMes.get(c.mes_ref) ?? { valor: 0, aberturas: 0, ativacoes: 0 }
    if (!descontadoNoMes(c.mes_ref, c.parceiro)) x.valor += c.valor_abertura + c.valor_ativacao
    x.aberturas += c.aberturas; x.ativacoes += c.ativacoes + c.reativacoes
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
  // Custos do escritório (Parâmetros › custos_fixos): só com cadeia de repasse e algum custo em vigor nos
  // meses mostrados. Sem isso, nenhuma linha muda.
  const custoDe = (mes: string) => (comRepasse ? custos.get(mes) : undefined)
  const comCusto = (mes: string) => !!custoDe(mes)?.temCusto
  const temCustos = meses.some(comCusto)
  const ehEquipe = (i: ItemCustoMes) => i.tipo !== 'valor'
  const chaveItem = (i: ItemCustoMes) => `${i.tipo}|${normTexto(i.nome)}`
  // cada item que aparece em algum mês, uma vez só, na ordem dos custos (custos mensais, depois a equipe)
  const itensJanela: ItemCustoMes[] = []
  for (const m of meses) for (const i of custoDe(m)?.itens ?? []) if (!itensJanela.some(x => chaveItem(x) === chaveItem(i))) itensJanela.push(i)
  const nomesEquipe = [...new Set(itensJanela.filter(ehEquipe).map(i => i.nome))]
  const juntar = (nomes: string[]) => (nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`)
  // a comissão líquida do escritório do mês (a mesma da linha da tabela) menos os custos; null no mês sem custo
  const resultadoDoMes = (mes: string) => {
    if (!comCusto(mes)) return null
    const x = mensalPorMes.get(mes)
    return resultadoDepoisDosCustos(liquidoCom(mes, x ? repasseDe(x).liquido : 0), custoDe(mes))
  }
  // negativo com o sinal de menos (é quanto falta), como na conta do Resumo
  const rs = (v: number | null) => (v == null ? TRACO : v < 0 ? `− ${rCurto(-v)}` : rCurto(v))
  // Para quem não é admin, uma linha só por mês, sem linha por item: nem a das pessoas nem a dos custos
  // mensais (o total menos os custos mensais daria a equipe por subtração). Para o admin, tudo separado.
  const linhasCustosSeparadas: Linha[] = [
    ...(itensJanela.some(i => !ehEquipe(i)) ? [{ label: '(–) Custos mensais', valores: porMes(m => (custoDe(m)?.itens.some(i => !ehEquipe(i)) ? custoDe(m)!.mensais : null)), fmt: rr, destaque: 'sub', total: true, so: 'principal' } as Linha] : []),
    ...(nomesEquipe.length ? [{ label: `(–) Equipe (${juntar(nomesEquipe)})`, valores: porMes(m => (custoDe(m)?.itens.some(ehEquipe) ? custoDe(m)!.equipe : null)), fmt: rr, destaque: 'sub', total: true, so: 'principal' } as Linha] : []),
    ...itensJanela.map((it): Linha => ({
      label: `(–) ${it.nome}${it.tipo === 'equipe' ? ' (fixo e comissões)' : it.tipo === 'equipe-btg' ? ` (parte do ${ctx.label})` : ''}`,
      valores: porMes(m => custoDe(m)?.itens.find(i => chaveItem(i) === chaveItem(it))?.valor ?? null),
      fmt: rr, destaque: 'sub', total: true, so: 'todas',
    })),
  ]
  const linhasCustos: Linha[] = temCustos ? [
    ...(verEquipe
      ? linhasCustosSeparadas
      : [{ label: '(–) Custos do escritório', valores: porMes(m => custoDe(m)?.total ?? null), fmt: rr, destaque: 'sub', total: true } as Linha]),
    // sem Total: a soma só dos meses com custo não fecha com a comissão líquida dos 12 meses
    { label: 'Resultado depois dos custos', valores: porMes(resultadoDoMes), fmt: rs, destaque: 'bold', perda: true },
  ] : []
  // pessoa da equipe sem valor em Comissões num mês: a conta segue sem ela e a nota avisa
  const semValor = temCustos
    ? [...new Set(meses.flatMap(m => (custoDe(m)?.itens ?? []).filter(i => ehEquipe(i) && i.valor == null).map(i => `${i.nome} (${mesLongo(m)})`)))]
    : []
  // a frase da cobertura: desde quando a comissão líquida cobre os custos
  const cobertura = temCustos
    ? fraseDaCobertura(meses.map(m => ({ mes: m, resultado: resultadoDoMes(m), emAndamento: m === mesRef && mesRef === mesDeHoje() })))
    : null

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
            // com cliente de percentual próprio na ficha (S61) o percentual do mês não é o geral: sai do rótulo
            { label: `(–) Parte do parceiro ${p.nome}${pctGeralSempre(p.nome) ? ` (${fmtPct(p.pctParceiro, 0)})` : ''}, a repassar`, valores: de(x => x.parceiro), fmt: rr, destaque: 'sub', total: true, so: 'todas' },
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
      ...linhasCustos,
      // nos meses com custo, cada sócio leva a sua parte do resultado depois dos custos (negativa = quanto cobre)
      ...cfg.participacoes.map((p): Linha => (temCustos
        ? {
          label: `${p.nome} (${fmtPct(p.pct, 0)})`,
          valores: porMes(m => {
            const res = resultadoDoMes(m)
            if (res != null) return (res * p.pct) / 100
            const x = mensalPorMes.get(m)
            return x ? (liquidoCom(m, repasseDe(x).liquido) * p.pct) / 100 : null
          }),
          fmt: rs, destaque: 'sub', total: true, perda: true,
        }
        : { label: `${p.nome} (${fmtPct(p.pct, 0)})`, valores: rep((r, m) => (liquidoCom(m.mes_ref, r.liquido) * p.pct) / 100), fmt: rr, destaque: 'sub', total: true })),
      { label: 'Líquido do giro ÷ receita do giro', valores: rep((r, m) => (m.receita ? (r.liquido / m.receita) * 100 : null)), fmt: pp, destaque: 'sub', so: 'todas' },
    ],
  } : null
  const blocoParceiros: Bloco = {
    titulo: 'Parceiros e leads',
    linhas: [
      ...(comissoes.length ? [
        { label: `Comissão de parceiros por conta (abertura e ativação${temCustos && nomesEquipe.length ? '; sem quem já está na Equipe' : ''})`, valores: porMes(m => comissaoPorMes.get(m)?.valor ?? null), fmt: rr, total: true } as Linha,
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
  const hrefLinhas = `${base}/painel?${custosNaQuery(ctx.q)}${ctx.mesEscolhido ? `mes=${mesRef.slice(0, 7)}&` : ''}aba=meses${todas ? '' : '&linhas=todas'}`
  const periodo = meses.length > 1 ? `${mesCurto(meses[0])} a ${mesCurto(mesRef)}` : mesCurto(mesRef)
  const somaDe = (l: Linha) => (l.total ? l.valores.reduce<number>((s, v) => s + (v ?? 0), 0) : null)

  // A frase do celular: os três meses mais novos na linha de total da tabela (receita total; no BTG, a
  // comissão líquida do escritório), com os mesmos valores dela. A aba não carrega o último dia lançado:
  // "em andamento" é o mês do calendário.
  const linhaTotal = [blocoReceita, blocoComissao].flatMap(b => b?.linhas ?? []).find(l => l.destaque === 'total')
  const frase = linhaTotal
    ? fraseDosMeses(linhaTotal.label.toLowerCase(), meses.map((m, i) => ({ mes: m, valor: linhaTotal.valores[i] })).reverse().slice(0, 3), mesRef === mesDeHoje())
    : null
  // A explicação da comissão: rodapé no computador, recolhida no celular (o mesmo texto nos dois)
  const notaComissao = comRepasse && (
    <>
      A comissão segue o fechamento mensal do {ctx.label} (Parâmetros): no mês já fechado vale o percentual que o {ctx.label} pagou; nos outros, as faixas.
      {todas && ` A receita bruta do ${ctx.label} é maior que a receita do giro porque o preço cobrado do cliente embute ${fmtPct(cfg.impostosEmbutidosPct, 2)} de impostos e a tarifa cadastrada (R$/lote) é o valor sem eles.`}
      {todas && temLivros && ' Os clientes de parceiros com participação na comissão seguem a divisão combinada com cada parceiro: imposto, parte do parceiro e o que fica para o escritório.'}
      {temExtras && ' O fora do giro e o Banking vêm das planilhas do mês (Importar), já com a parte do escritório e o imposto de lá.'}
      {temCustos && (nomesEquipe.length
        ? ' Os custos do escritório vêm de Parâmetros. No mês em andamento, os custos mensais são os do mês inteiro e a equipe é o valor de hoje.'
        : ' Os custos do escritório vêm de Parâmetros; no mês em andamento entram os do mês inteiro.')}
      {semValor.length > 0 && ` Sem valor em Comissões: ${juntar(semValor)}. A conta segue sem esse valor.`}
      {' '}A conta de um mês só, explicada, está na aba Resumo ({mesLongo(mesRef)}).
    </>
  )

  // Uma coluna só, com a ordem trocada no celular: a frase e a tabela vêm antes do gráfico (a tabela tem
  // de começar na primeira tela). O espaço entre os blocos é o mesmo que a página dava.
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      {(frase || temChave) && (
        <div className="md:hidden">
          {frase && <Resumo frase={frase} apoio={cobertura} />}
          {/* logo abaixo da frase que fala dos custos: um toque mostra a aba sem eles */}
          {chaveCustos(frase ? 'mt-3' : '')}
        </div>
      )}

      <Panel className="max-md:order-last" title="Lotes, receita e clientes ativos"
        subtitle={<>
          <span className="max-md:hidden">{`${periodo} · receita = corretagem + zeragem${atp ? '' : ' + incentivo'}`}</span>
          {/* no celular os dois eixos não dizem o que medem: uma linha curta diz */}
          <span className="md:hidden">Barras: lotes. Linha: receita em R$.</span>
        </>}>
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
        subtitle={<>
          <span className="max-md:hidden">{`${periodo}; o último mês pode estar parcial. ${todas ? 'A conta completa do fechamento, passo a passo.' : 'O essencial de cada bloco.'}${cobertura ? ` ${cobertura}` : ''}`}</span>
          <span className="md:hidden">{meses.length > 2 ? 'Arraste para ver os meses anteriores.' : periodo}</span>
        </>}
        action={<>{chaveCustos('max-md:hidden')}<Link href={hrefLinhas} scroll={false} className="link text-label max-md:-my-3 max-md:inline-block max-md:py-3">{todas ? 'mostrar só o essencial' : `ver todas as linhas (${totalLinhas})`}</Link></>}>
        {/* com poucos meses a tabela não se estica pela tela toda: os números ficam perto dos rótulos.
            No celular a matriz continua tabela (DESIGN.md §8.6), com todos os meses: a moldura nasce rolada
            para os mais novos (direção invertida só na moldura; a tabela continua da esquerda para a direita),
            o nome da linha quebra em vez de cortar e o Total vai para a lista recolhida logo abaixo. */}
        <div className="tbl-wrap max-md:[direction:rtl]" style={meses.length <= 6 ? { maxWidth: 520 + (meses.length + 1) * 130 } : undefined}>
          <table className="tbl tbl-dense max-md:[direction:ltr]">
            <thead>
              <tr>
                <th className={cn('sticky-col min-w-[200px]', COL_NOME)}>Indicador</th>
                {meses.map(m => <th key={m} className={cn('num', COL_MES, m === mesRef && 'text-fg')}>{mesCurto(m)}</th>)}
                {meses.length > 1 && <th className="num max-md:hidden">Total</th>}
              </tr>
            </thead>
            {blocos.map(b => (
              <tbody key={b.titulo}>
                <tr>
                  <td className={cn('sticky-col border-b-0 pb-1 pt-5', COL_NOME)}><span className="label whitespace-nowrap max-md:whitespace-normal">{b.titulo}</span></td>
                  <td colSpan={meses.length + (meses.length > 1 ? 1 : 0)} className="border-b-0 pb-1 pt-5" />
                </tr>
                {b.linhas.map(l => {
                  const soma = somaDe(l)
                  return (
                    <tr key={l.label} className={l.destaque === 'total' ? 'total' : ''}>
                      <td className={cn('sticky-col', COL_NOME, l.destaque === 'sub' && 'pl-6 text-fg-muted max-md:pl-4', l.destaque === 'bold' && 'font-semibold')}>{l.label}</td>
                      {l.valores.map((v, i) => (
                        <td key={i} className={cn('num', (v == null || v === 0) && 'subtle', l.destaque === 'bold' && 'font-semibold', l.perda && v != null && v < 0 && 'text-loss')}>{l.fmt(v)}</td>
                      ))}
                      {meses.length > 1 && <td className={cn('num font-semibold max-md:hidden', l.perda && soma != null && soma < 0 && 'text-loss')}>{soma == null ? '' : l.fmt(soma)}</td>}
                    </tr>
                  )
                })}
              </tbody>
            ))}
          </table>
        </div>
        {/* a coluna Total do computador: no celular, uma lista de nome e soma, só com as linhas que se somam */}
        {meses.length > 1 && (
          <Recolhido tamanho="linha" titulo={`Total de ${periodo}`} className="mt-2 md:hidden">
            <table className="tbl w-full">
              <tbody>
                {blocos.map(b => {
                  const somaveis = b.linhas.filter(l => l.total)
                  if (!somaveis.length) return null
                  return (
                    <Fragment key={b.titulo}>
                      <tr><td colSpan={2} className="border-b-0 pb-1 pt-4"><span className="label">{b.titulo}</span></td></tr>
                      {somaveis.map(l => {
                        const soma = somaDe(l)
                        const negativo = !!l.perda && soma != null && soma < 0
                        return (
                          <tr key={l.label} className={l.destaque === 'total' ? 'total' : ''}>
                            <td className={cn(l.destaque === 'sub' && 'pl-6 text-fg-muted', l.destaque === 'bold' && 'font-semibold')}>{l.label}</td>
                            <td className={cn('num align-top', negativo ? 'text-loss' : l.destaque === 'sub' && 'text-fg-muted', l.destaque === 'bold' && 'font-semibold')}>{l.fmt(soma)}</td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </Recolhido>
        )}
        {notaComissao && (
          <>
            <p className="mt-3 max-w-4xl text-micro text-fg-subtle max-md:hidden">{notaComissao}</p>
            <Recolhido tamanho="linha" titulo="Como a comissão é calculada" className="md:hidden">
              <p className="text-label text-fg-muted">{notaComissao}</p>
            </Recolhido>
          </>
        )}
      </Panel>
    </div>
  )
}
