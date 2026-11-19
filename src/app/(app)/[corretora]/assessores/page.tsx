export const dynamic = 'force-dynamic'

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { termosDaCorretora } from '@/lib/corretoras'
import { assessoresMensal, assessoresResumo, clientesPorAssessor, giroDiario, parametrosDaCorretora, topClientes, ultimaData } from '@/lib/gestao/consultas'
import { projetarMes, variacaoDe, variacaoMensal } from '@/lib/gestao/projecao'
import { doPrimeiroComDado } from '@/lib/gestao/receitaTela'
import { evolucaoDoTime, fraseDoTime, montarPessoas, nomeDeFrase, PESO_NA_FRASE, pessoasAVista, type PessoaDoTime } from '@/lib/gestao/responsaveisTela'
import { janelaMeses, limitesDoMes, mesCurto, somarMeses } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { Dica } from '@/components/ui/Dica'
import { Recolhido } from '@/components/ui/Recolhido'
import { RecolheNoCelular } from '@/components/ui/RecolheNoCelular'
import { MostrarMais } from '@/components/ui/MostrarMais'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { MesPicker } from '@/components/gestao/Filtros'
import { Resumo } from '@/components/gestao/Resumo'
import { Tendencia } from '@/components/gestao/Tendencia'
import { BarraCelula, LinhaVazia, TRACO, n0, n2, r0, rCurto } from '@/components/gestao/Celulas'
import type { TopClienteRow } from '@/lib/gestao/tipos'
import { EvolucaoTime } from './EvolucaoTime'
import { RolarAteAberta, SetaDaLinha } from './NoCelular'

// Responsáveis: como está cada pessoa do time e quem precisa de ajuda. No BTG cada linha é um responsável;
// na Genial, um código de assessor (ZEVE INVESTIMENTOS n) com a pessoa ligada a ele ao lado.
// Redesenho de nov/26: a tela era o resumo em 14 colunas, duas matrizes de 12 meses e dois top 20.
// Agora: a frase, 4 cartões, uma linha por pessoa (cartões quando são poucas, lista de 7 colunas quando
// são muitas), o detalhe da pessoa escolhida (?assessor=, como antes) e um gráfico só de evolução.
// No celular (18/11/2026, DESIGN.md §8) as duas corretoras usam a mesma lista: a tabela de 7 colunas vira
// uma linha por pessoa (nome, clientes ativos e lotes embaixo, receita e variação à direita) e a linha
// inteira abre o detalhe logo abaixo dela. Os cartões de pessoa do BTG ficam só no computador. Dois dos
// quatro cartões do topo descem para depois da lista, e os códigos que não pesam na receita ficam atrás
// de "ver os outros". O computador não muda.
const ATE_QUANTAS_EM_CARTOES = 6
const MUITAS_VEZES = 900   // acima de 10 vezes o mês anterior o percentual não diz nada: vira "mais de 10×"

// Celular: o lugar do número à direita, com a seta de abrir depois dele
const LISTA = { '--lista-direita': '7.5rem' } as CSSProperties
const VALOR = 'cel-valor max-md:!right-6'
// a lista dos 5 clientes fica dentro da de pessoas e herdaria a largura dela; o número aqui é mais curto
const LISTA_DE_CLIENTES = { '--lista-direita': '5.25rem' } as CSSProperties
// Celular: o link do nome pega a linha inteira e fica por cima do número (que é posicionado e, sem isto,
// ficaria na frente do toque)
const LINHA_INTEIRA = "max-md:!static max-md:!no-underline max-md:after:absolute max-md:after:inset-0 max-md:after:z-[1] max-md:after:content-['']"
// Celular: linha que só aparece depois de "ver os outros". É o mesmo texto do ALEM_NO_CELULAR da base,
// escrito aqui porque esta página roda no servidor e uma constante importada de um arquivo 'use client'
// chega aqui como referência, não como o texto (a classe não pegava e a lista abria inteira).
const ALEM_NO_CELULAR = 'max-md:group-data-[tudo=false]/mais:hidden!'
// Celular, linha de apoio: o nome do número vai escrito depois dele (data-sufixo da base), com espaço que
// não quebra, para a linha partir no "·" e não no meio de "clientes ativos"
const sufixo = (texto: string) => texto.replace(/ /g, '\u00a0')

// Variação da receita da pessoa: número inteiro (no mês em andamento a base é uma estimativa)
function VariacaoPessoa({ v }: { v: number }) {
  if (v > MUITAS_VEZES) return <span className="font-semibold text-gain">mais de 10×</span>
  const arredondado = Math.round(v)
  return <span className={cn('font-semibold tabular-nums', arredondado > 0 ? 'text-gain' : arredondado < 0 ? 'text-loss' : 'text-fg-muted')}>{arredondado > 0 ? '+' : arredondado < 0 ? '−' : ''}{Math.abs(arredondado)}%</span>
}

export default async function ResponsaveisPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { corretora, mesRef, base, q } = ctx
  const lim = limitesDoMes(mesRef)
  const mesAnt = somarMeses(mesRef, -1)
  const hoje = fmtDate(hojeBrasil())
  const sel = q.assessor ?? ''

  const [resumo, mensal, clientes, giro, ultima, par, topSel] = await Promise.all([
    assessoresResumo(corretora, mesRef),
    assessoresMensal(corretora, mesRef, 12),
    clientesPorAssessor(corretora, mesRef),
    giroDiario(corretora, somarMeses(mesRef, -24), lim.fim), ultimaData(corretora),
    parametrosDaCorretora(corretora),
    sel ? topClientes(corretora, lim.inicio, lim.fim, sel, 5) : Promise.resolve([] as TopClienteRow[]),
  ])

  // A corretora no mês: previsão e comparação com o mesmo ponto do mês anterior (as mesmas da tela Receita)
  const proj = projetarMes(giro, mesRef, ultima, hoje)
  const r = proj.receita
  // parte do mês anterior que a corretora já tinha feito neste ponto (1 = mês fechado; null = sem mês anterior)
  const fracaoMesmoPonto = r.anteriorTotal ? (proj.parcial ? (r.anteriorMesmoPonto != null ? r.anteriorMesmoPonto / r.anteriorTotal : null) : 1) : null
  // meses da janela a partir do primeiro com dado (o BTG começou em set/26)
  const meses = doPrimeiroComDado(janelaMeses(mesRef, 12), m => mensal.some(x => x.mes_ref.slice(0, 7) === m.slice(0, 7) && (x.lotes > 0 || x.receita > 0)))
  const pessoas = montarPessoas({ resumo, mensal, clientes, meses, mesRef, fracaoMesmoPonto })
  const evolucao = evolucaoDoTime(mensal, meses, resumo.map(a => a.assessor_nome))
  const escolhida = sel ? pessoas.find(p => p.nome === sel) ?? null : null

  const totalReceita = resumo.reduce((s, a) => s + a.receita, 0)
  const totalLotes = resumo.reduce((s, a) => s + a.lotes, 0)
  // "clientes ativos" soma por pessoa (um cliente com conta em duas pessoas aparece nas duas)
  const clientesAtivos = resumo.reduce((s, a) => s + a.clientes_ativos, 0)
  const ativosAnterior = mensal.filter(m => m.mes_ref.slice(0, 7) === mesAnt.slice(0, 7)).reduce((s, m) => s + m.clientes, 0)
  const contasNovas = pessoas.reduce((s, p) => s + p.contasNovas, 0)
  const comLotes = resumo.filter(a => a.lotes > 0).length
  const cadastrados = par.assessores.filter(a => a.ativo).length
  const porCodigo = termosDaCorretora(corretora).assessor !== 'Responsável'
  const unidade = porCodigo ? 'códigos de assessor' : 'responsáveis'
  const emCartoes = pessoas.filter(p => p.receita > 0 || p.lotes > 0).length <= ATE_QUANTAS_EM_CARTOES
  const comparadoCom = proj.parcial ? `mesmo ponto de ${mesCurto(mesAnt)}` : mesCurto(mesAnt)
  const dicaDaVariacao = proj.parcial
    ? `Receita da pessoa contra ${mesCurto(mesAnt)} até o mesmo ponto do mês. Não há lotes por dia por pessoa: a base é o mês anterior dela vezes a parte que a corretora já tinha feito neste ponto (uma estimativa).`
    : `Receita da pessoa contra ${mesCurto(mesAnt)} inteiro.`
  // celular: a lista fica logo abaixo da frase e mostra também quem a frase não compara; o "i" diz o corte
  // (a frase é a mesma do computador e não muda aqui)
  const dicaDaVariacaoNoCelular = `${dicaDaVariacao} A frase do topo compara só quem tinha ${Math.round(PESO_NA_FRASE * 100)} % ou mais da receita do time em ${mesCurto(mesAnt)}.`

  const hrefDe = (nome: string | null) => {
    const p = new URLSearchParams()
    if (nome) p.set('assessor', nome)
    if (ctx.mesEscolhido) p.set('mes', mesRef.slice(0, 7))
    const qs = p.toString()
    return `${base}/assessores${qs ? `?${qs}` : ''}`
  }
  const tituloDaTendencia = (p: PessoaDoTime) => meses.map((m, i) => `${mesCurto(m)} ${rCurto(p.tendencia[i])}${proj.parcial && m === mesRef ? ' (em andamento)' : ''}`).join(' · ')
  const daCorretora = `${ctx.label === 'BTG' ? 'do' : 'da'} ${ctx.label}`
  const detalhe = escolhida ? (
    <DetalhePessoa p={escolhida} top={topSel} base={base} mesRef={mesRef} mesAnt={mesAnt} fechar={hrefDe(null)}
      daCorretora={daCorretora} parcial={proj.parcial} meses={meses} lotesPorMes={evolucao.pessoas.find(x => x.nome === escolhida.nome)?.lotes ?? []} />
  ) : null

  // Celular: quem fica à vista na lista e quem vai para trás de "ver os outros"
  const aVista = pessoasAVista(pessoas, sel)
  const outros = pessoas.filter(p => !aVista.has(p.nome))
  const receitaDosOutros = outros.reduce((s, p) => s + p.receita, 0)
  const algumaVariacao = pessoas.some(p => p.variacao != null)

  // Os dois cartões que não respondem à pergunta da tela: no computador fecham a faixa do topo; no celular
  // descem para depois da lista (a frase de apoio do topo já diz os dois números)
  const cartaoClientesAtivos = (className?: string) => (
    <KpiCard className={className} label="Clientes ativos" value={fmtNum(clientesAtivos)} delta={variacaoMensal(clientesAtivos, ativosAnterior || null, mesAnt, proj.parcial, fmtNum)}
      dica="Clientes com lotes no mês, somados por pessoa: quem tem conta com duas pessoas conta nas duas." />
  )
  const cartaoComLotes = (className?: string) => (
    <KpiCard className={className} label="Com lotes no mês" value={`${comLotes} de ${cadastrados}`} sub={`${unidade} cadastrados em Parâmetros`} />
  )

  // A lista de pessoas. No computador é a tabela de 7 colunas (com mais de 6 pessoas); no celular, a lista
  // das duas corretoras: cada célula diz o papel (DESIGN.md §8.6) e o que fica sem papel está no detalhe.
  // `detalheNaLinha`: o detalhe da pessoa aberta vai numa linha logo abaixo dela (Genial). Com cartões no
  // computador (BTG) o detalhe fica fora da tabela, montado uma vez só (ver `lista`).
  const tabela = (lista: PessoaDoTime[], detalheNaLinha: boolean, className?: string) => (
    <div className={cn('tbl-wrap', className)}>
      <table className="tbl tbl-dense tbl-lista" style={LISTA}>
        <thead>
          <tr>
            <th>{porCodigo ? 'Código do assessor' : 'Responsável'}</th><th className="num col-p2">Clientes ativos</th><th className="num col-p3">Contas novas</th><th className="num col-p2">Lotes no mês</th>
            <th className="num"><span className="inline-flex items-center gap-1">Receita no mês<Dica texto={`Embaixo do valor, a variação. ${dicaDaVariacao}`} /></span></th>
            <th className="num col-p2">% da receita</th><th className="col-p3">Tendência</th>
          </tr>
        </thead>
        <tbody>
          {lista.length === 0 && <LinhaVazia colunas={7}>Sem lotes na janela.</LinhaVazia>}
          {lista.map(p => {
            const ativa = p.nome === sel
            const parada = p.receita <= 0 && p.lotes <= 0
            const semCadastro = p.detalhe.tarifa == null
            // celular: o estado em palavras, só quando há o que dizer (no computador é o traço ou o vazio)
            const estado = parada ? 'sem lotes no mês' : p.variacao == null && algumaVariacao ? `sem ${mesCurto(mesAnt)} para comparar` : null
            return [
              <tr key={p.nome} className={cn(ativa && 'bg-surface-2 max-md:!border-b-0 max-md:bg-transparent', !aVista.has(p.nome) && ALEM_NO_CELULAR)}>
                <td className="cel-titulo max-w-[280px]">
                  <Link href={hrefDe(ativa ? null : p.nome)} scroll={false} className={cn('link font-medium', parada && 'text-fg-muted', LINHA_INTEIRA)} aria-expanded={ativa}>
                    {/* celular: o nome como a frase do topo o escreve; o endereço leva o nome original */}
                    <span className="max-md:hidden">{p.nome}</span><span className="md:hidden">{nomeDeFrase(p.nome)}</span>
                    <SetaDaLinha aberta={ativa} />
                  </Link>
                  {p.pessoa && <span className="ml-2 text-micro text-fg-muted">{p.pessoa}</span>}
                  {semCadastro && <Badge variant="warn" className="ml-2 max-md:hidden">sem cadastro</Badge>}
                </td>
                <td className={cn('cel-sub md:hidden', !estado && !semCadastro && 'vazio')}>
                  {estado}{estado && semCadastro && ' · '}{semCadastro && <Badge variant="warn">sem cadastro</Badge>}
                </td>
                <td className={cn('num col-p2 cel-sub', !p.clientesAtivos && 'subtle vazio')} data-sufixo={sufixo(p.clientesAtivos === 1 ? 'cliente ativo' : 'clientes ativos')}>{n0(p.clientesAtivos)}</td>
                <td className={cn('num col-p3', !p.contasNovas && 'subtle')}>{n0(p.contasNovas)}</td>
                <td className={cn('num col-p2 cel-sub', !p.lotes && 'subtle vazio')} data-sufixo={p.lotes === 1 ? 'lote' : 'lotes'}>{n0(p.lotes)}</td>
                <td className={cn('num', VALOR)}>
                  <span className={cn('font-semibold max-md:font-bold', !p.receita && 'subtle')}>{rCurto(p.receita)}</span>
                  {p.variacao != null && <span className="block text-micro"><VariacaoPessoa v={p.variacao} /></span>}
                </td>
                <td className="num col-p2">{p.receita > 0 ? fmtPct(p.pctReceita) : TRACO}</td>
                <td className="col-p3"><Tendencia valores={p.tendencia} parcial={proj.parcial} titulo={tituloDaTendencia(p)} /></td>
              </tr>,
              detalheNaLinha && ativa && detalhe ? <tr key={`${p.nome}-detalhe`} className="bg-surface-2 max-md:!min-h-0 max-md:bg-transparent max-md:!pt-0"><td colSpan={7} className="!whitespace-normal">{detalhe}</td></tr> : null,
            ]
          })}
        </tbody>
      </table>
    </div>
  )
  // Com cartões no computador (BTG), o detalhe aparece no fim da grade no computador e logo abaixo da pessoa
  // no celular. Para não montar o detalhe duas vezes, a lista do celular se parte em duas tabelas em volta
  // dele: até a pessoa aberta e depois dela. No computador as duas tabelas não aparecem e o detalhe fica
  // onde sempre esteve, depois dos cartões.
  const iAberta = emCartoes && escolhida ? pessoas.indexOf(escolhida) : -1
  const temDepois = iAberta >= 0 && iAberta < pessoas.length - 1
  const lista = !emCartoes ? tabela(pessoas, true) : iAberta < 0 ? tabela(pessoas, false, 'md:hidden') : (
    <>
      {tabela(pessoas.slice(0, iAberta + 1), false, 'md:hidden')}
      {/* celular: o mesmo respiro e o mesmo fio da linha de detalhe da Genial */}
      <div className={cn('mt-4 max-md:mt-0 max-md:pb-3', temDepois && 'max-md:border-b max-md:border-line')}>{detalhe}</div>
      {temDepois && tabela(pessoas.slice(iAberta + 1), false, 'md:hidden')}
    </>
  )

  return (
    <>
      <PageHeader eyebrow={ctx.eyebrow} title="Responsáveis" actions={<MesPicker valor={mesRef} />} />
      <PageBody>
        <Resumo frase={fraseDoTime(pessoas, mesRef, proj.parcial)}
          apoio={resumo.length ? `${fmtNum(comLotes)} ${unidade} com lotes no mês, ${fmtNum(clientesAtivos)} clientes ativos e ${contasNovas === 1 ? '1 conta nova' : `${fmtNum(contasNovas)} contas novas`}.` : null} />

        <KpiRow cols={4}>
          <KpiCard destaque label={`Receita em ${mesCurto(mesRef)}`} value={rCurto(totalReceita)} delta={variacaoDe(proj, proj.receita, rCurto)}
            dica="Corretagem mais zeragem dos lotes de todas as pessoas no mês." />
          <KpiCard label={`Lotes em ${mesCurto(mesRef)}`} value={fmtNum(totalLotes)} delta={variacaoDe(proj, proj.lotes, fmtNum)} />
          {cartaoClientesAtivos('max-md:!hidden')}
          {cartaoComLotes('max-md:!hidden')}
        </KpiRow>

        <Panel title="Cada pessoa no mês"
          subtitle={<>
            <span className="max-md:hidden">{emCartoes ? 'Um clique na pessoa mostra os 5 maiores clientes dela.' : `${fmtNum(pessoas.length)} ${unidade}, do que mais rendeu para o que menos rendeu. Um clique no nome mostra os 5 maiores clientes.`}</span>
            {/* celular: a base da variação é dita uma vez aqui, com a conta atrás do "i" (o cabeçalho da tabela, que a explica no computador, não existe na lista) */}
            {algumaVariacao && <span className="md:hidden">Variação contra {proj.parcial ? 'o ' : ''}{comparadoCom}<Dica className="ml-1.5" texto={dicaDaVariacaoNoCelular} /></span>}
          </>}>
          {/* computador, até 6 pessoas: um cartão por pessoa. No celular vale a lista de baixo. */}
          {emCartoes && <div className="max-md:hidden">
            {pessoas.length === 0 ? <p className="py-10 text-center text-dense text-fg-subtle">Sem lotes na janela.</p> : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {pessoas.map(p => {
                  const ativa = p.nome === sel
                  return (
                    <Link key={p.nome} href={hrefDe(ativa ? null : p.nome)} scroll={false} aria-current={ativa ? 'true' : undefined}
                      className={cn('panel block min-w-0 p-4 transition-colors hover:bg-surface-2', ativa && 'ring-2 ring-fg')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-section font-semibold text-fg">{p.nome}</p>
                          <p className="text-micro text-fg-muted">{fmtPct(p.pctReceita, 0)} da receita {ctx.label === 'BTG' ? 'do' : 'da'} {ctx.label}{p.pessoa ? ` · ${p.pessoa}` : ''}</p>
                        </div>
                        <Tendencia valores={p.tendencia} parcial={proj.parcial} titulo={tituloDaTendencia(p)} />
                      </div>
                      <p className="mt-3 text-kpi font-bold tabular-nums tracking-tight text-fg">{rCurto(p.receita)}</p>
                      <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-micro text-fg-subtle">
                        {p.variacao != null ? <><VariacaoPessoa v={p.variacao} /><span>{p.variacao > MUITAS_VEZES ? 'o' : 'vs'} {comparadoCom}</span></> : <span>sem {mesCurto(mesAnt)} para comparar</span>}
                      </p>
                      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
                        <div><dt className="label">Clientes ativos</dt><dd className="mt-0.5 font-semibold tabular-nums text-fg">{n0(p.clientesAtivos)}</dd></div>
                        <div><dt className="label">Contas novas</dt><dd className="mt-0.5 font-semibold tabular-nums text-fg">{n0(p.contasNovas)}</dd></div>
                        <div><dt className="label">Lotes</dt><dd className="mt-0.5 font-semibold tabular-nums text-fg">{n0(p.lotes)}</dd></div>
                      </dl>
                    </Link>
                  )
                })}
              </div>
            )}
            {proj.parcial && pessoas.some(p => p.variacao != null) && <p className="mt-2 flex items-center gap-1.5 text-label text-fg-subtle">Como a variação é calculada<Dica texto={dicaDaVariacao} /></p>}
          </div>}
          {outros.length > 0 ? (
            // celular: quem não pesa na receita fica atrás de "ver os outros", no fim da lista (a lista não é
            // o último bloco da tela: o gráfico vem depois)
            // (o rótulo não repete "códigos de assessor": a lista inteira é deles, e o rótulo longo quebrava em duas linhas)
            <MostrarMais rotulo={`ver os outros ${fmtNum(outros.length)} (${receitaDosOutros > 0 ? `${rCurto(receitaDosOutros)} no mês` : 'sem receita no mês'})`}>
              {lista}
            </MostrarMais>
          ) : <div className="min-w-0">{lista}</div>}
        </Panel>

        {/* celular: os dois números que saíram do topo, como linhas. Os dois primeiros filhos, vazios, fazem a
            base desenhá-los como linha (do terceiro em diante) e não como cartão */}
        <KpiRow cols={4} className="md:hidden">
          <span hidden /><span hidden />
          {cartaoClientesAtivos()}{cartaoComLotes()}
        </KpiRow>

        {sel && !escolhida && <p className="text-dense text-fg-muted">{sel} não tem lotes nos últimos 12 meses. <Link href={hrefDe(null)} className="link">Ver todos</Link></p>}

        <EvolucaoTime evolucao={evolucao} mesRef={mesRef} parcial={proj.parcial} />
      </PageBody>
    </>
  )
}

// O detalhe da pessoa escolhida: os 5 maiores clientes dela no mês e o que saiu da tabela principal
// (zerados, corretagem e zeragem, lotes por cliente, tarifa e os 12 meses), com o atalho para a lista de Clientes.
// No celular o detalhe abre colado na linha da pessoa, como um cartão, e muda de ordem (por CSS, sem repetir
// nada): primeiro como ela está no mês (a fatia da receita, as contas novas e o mês anterior em palavras,
// que é a base da variação), depois os 5 clientes em lista, os dois botões no tamanho do dedo e, recolhidos,
// "Mais números" (os 8 números do computador) e "Mês a mês" (a coluna Tendência, com os valores escritos).
function DetalhePessoa({ p, top, base, mesRef, mesAnt, fechar, daCorretora, parcial, meses, lotesPorMes }: {
  p: PessoaDoTime; top: TopClienteRow[]; base: string; mesRef: string; mesAnt: string; fechar: string
  daCorretora: string        // "da Genial", "do BTG"
  parcial: boolean
  meses: string[]            // os meses de p.tendencia
  lotesPorMes: number[]      // lotes da pessoa nos mesmos meses
}) {
  const a = p.detalhe
  const item = (rotulo: string, valor: ReactNode, apoio?: string, className?: string) => (
    <div className={className}><dt className="label">{rotulo}</dt><dd className="mt-0.5 font-medium tabular-nums text-fg">{valor}</dd>{apoio && <dd className="text-micro text-fg-muted">{apoio}</dd>}</div>
  )
  const anterior = mesCurto(mesAnt)
  const contasNovas = p.contasNovas === 0 ? 'nenhuma conta nova' : p.contasNovas === 1 ? '1 conta nova' : `${fmtNum(p.contasNovas)} contas novas`
  return (
    <section className="min-w-0 py-2 max-md:flex max-md:flex-col max-md:gap-3 max-md:rounded-lg max-md:bg-surface max-md:p-4" aria-label={`Detalhe de ${p.nome}`}>
      <RolarAteAberta />
      <div className="space-y-1 md:hidden">
        <p className="text-dense text-fg">{p.receita > 0 ? `${fmtPct(p.pctReceita, 0)} da receita ${daCorretora}` : 'Sem receita no mês'} · {contasNovas} no mês</p>
        <p className="text-label text-fg-muted">
          {p.receitaAnterior <= 0 ? `Sem receita em ${anterior}.`
            : parcial && p.base != null ? `Neste ponto de ${anterior}: cerca de ${rCurto(p.base)}. O mês de ${anterior} inteiro: ${rCurto(p.receitaAnterior)}.`
            : `Em ${anterior}: ${rCurto(p.receitaAnterior)}.`}
        </p>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 max-md:contents">
        <h3 className="text-dense font-semibold text-fg max-md:mt-1">
          <span className="max-md:hidden">{p.nome}{p.pessoa ? ` · ${p.pessoa}` : ''}: os 5 maiores clientes em {mesCurto(mesRef)}</span>
          {/* celular: o nome já está na linha de cima; o título diz a ordem da lista (por lotes) */}
          <span className="md:hidden">Os 5 clientes com mais lotes em {mesCurto(mesRef)}</span>
        </h3>
        <div className="flex items-center gap-2 max-md:order-1">
          <Link href={`${base}/clientes?assessor=${encodeURIComponent(p.nome)}`} className={cn(buttonClasses('secondary', 'xs'), 'max-md:h-11 max-md:flex-1 max-md:text-dense')}>Ver todos os clientes</Link>
          <Link href={fechar} scroll={false} className={cn(buttonClasses('ghost', 'xs'), 'max-md:h-11 max-md:px-3 max-md:text-dense')} aria-label="Fechar o detalhe"><X className="h-3.5 w-3.5" aria-hidden />Fechar</Link>
        </div>
      </div>
      <div className="grid gap-6 max-md:contents xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="tbl-wrap">
          <table className="tbl tbl-dense tbl-lista lista-abre" style={LISTA_DE_CLIENTES}>
            <thead><tr><th>Cliente</th><th className="num">Lotes</th><th className="num">Receita</th><th className="num col-p2">% dos lotes</th></tr></thead>
            <tbody>
              {top.length === 0 && <LinhaVazia colunas={4}>Sem lotes no mês.</LinhaVazia>}
              {top.map((c, i) => (
                // conta sem cliente cadastrado não leva a lugar nenhum: sem a seta de abrir
                <tr key={`${c.cliente_id ?? c.cliente_nome}-${i}`} className={cn(!c.cliente_id && 'sem-seta')}>
                  <td className="cel-titulo max-w-[240px] truncate">
                    {c.cliente_id ? <Link href={`${base}/clientes/${c.cliente_id}`} className="link max-md:after:z-[1]">{c.cliente_nome}</Link> : (
                      <>
                        <span className="text-warn" title="Conta sem cliente cadastrado">{c.cliente_nome}</span>
                        <span className="block text-label font-normal text-warn md:hidden">conta sem cliente cadastrado</span>
                      </>
                    )}
                  </td>
                  {/* celular: a lista vem por lotes, então o número grande à direita é o de lotes (a receita
                      vai para a linha de apoio); senão a coluna de reais parece fora de ordem */}
                  <td className="num cel-valor" data-rotulo={c.lotes === 1 ? 'lote' : 'lotes'}><span className="md:hidden">{n0(c.lotes)}</span><span className="hidden md:inline"><BarraCelula valor={c.lotes} max={top[0]?.lotes ?? 0} largura={56} /></span></td>
                  <td className="num cel-sub"><span className="max-md:hidden">{r0(c.receita)}</span><span className="md:hidden">{rCurto(c.receita)}</span></td>
                  <td className="num col-p2 cel-sub" data-sufixo={sufixo('dos lotes')}>{fmtPct(c.pct_lotes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <RecolheNoCelular tamanho="linha" titulo="Mais números" className="max-md:order-2">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-dense max-md:pb-2 md:grid-cols-3 xl:grid-cols-2">
            {item('Clientes ativos', n0(p.clientesAtivos), p.clientesAtivos ? `${n2(Math.round((p.lotes / p.clientesAtivos) * 10) / 10)} lotes por cliente` : undefined)}
            {item('Contas novas no mês', n0(p.contasNovas))}
            {item('Corretagem', r0(a.receita_corretagem))}
            {item('Zeragem', r0(a.receita_zeragem), a.zerados ? `${fmtNum(a.zerados)} contratos zerados` : 'nenhum contrato zerado')}
            {/* celular: tarifa zero (o BTG cobra por operação) seria um traço com a unidade solta embaixo */}
            {item('Tarifa', a.tarifa == null ? <span className="text-warn">sem cadastro em Parâmetros</span> : n2(a.tarifa), a.tarifa == null ? undefined : `R$ por lote${a.tipo_zeragem === 'FIXA' ? ' · zeragem fixa' : ''}`, a.tarifa === 0 ? 'max-md:hidden' : undefined)}
            {item(`Lotes em ${mesCurto(mesAnt)}`, n0(a.lotes_mes_anterior), 'mês inteiro')}
            {item('Lotes em 12 meses', n0(a.lotes_12m))}
            {item('Receita em 12 meses', rCurto(a.receita_12m))}
          </dl>
        </RecolheNoCelular>
      </div>
      {/* celular: a coluna Tendência da tabela, com o valor de cada mês escrito (no computador os valores
          são a dica do mouse sobre a linha) */}
      <Recolhido tamanho="linha" titulo="Mês a mês" resumo={<Tendencia valores={p.tendencia} parcial={parcial} largura={72} altura={22} />} className="max-md:order-3 max-md:-mt-3 md:hidden">
        <table className="tbl w-full">
          <thead><tr><th className="max-md:bg-transparent">Mês</th><th className="num max-md:bg-transparent">Receita</th><th className="num max-md:bg-transparent">Lotes</th></tr></thead>
          <tbody>
            {meses.map((m, i) => (
              <tr key={m}>
                <td>{mesCurto(m)}{parcial && m === mesRef && <span className="text-fg-muted"> (em andamento)</span>}</td>
                <td className={cn('num', !p.tendencia[i] && 'subtle')}>{rCurto(p.tendencia[i])}</td>
                <td className={cn('num', !lotesPorMes[i] && 'subtle')}>{n0(lotesPorMes[i])}</td>
              </tr>
            )).reverse()}
          </tbody>
        </table>
      </Recolhido>
    </section>
  )
}
