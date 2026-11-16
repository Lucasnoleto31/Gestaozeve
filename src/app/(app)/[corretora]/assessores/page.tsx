export const dynamic = 'force-dynamic'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { termosDaCorretora } from '@/lib/corretoras'
import { assessoresMensal, assessoresResumo, clientesPorAssessor, giroDiario, parametrosDaCorretora, topClientes, ultimaData } from '@/lib/gestao/consultas'
import { projetarMes, variacaoDe, variacaoMensal } from '@/lib/gestao/projecao'
import { doPrimeiroComDado } from '@/lib/gestao/receitaTela'
import { evolucaoDoTime, fraseDoTime, montarPessoas, type PessoaDoTime } from '@/lib/gestao/responsaveisTela'
import { janelaMeses, limitesDoMes, mesCurto, somarMeses } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { Dica } from '@/components/ui/Dica'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { MesPicker } from '@/components/gestao/Filtros'
import { Resumo } from '@/components/gestao/Resumo'
import { Tendencia } from '@/components/gestao/Tendencia'
import { BarraCelula, LinhaVazia, TRACO, n0, n2, r0, rCurto } from '@/components/gestao/Celulas'
import type { TopClienteRow } from '@/lib/gestao/tipos'
import { EvolucaoTime } from './EvolucaoTime'

// Responsáveis: como está cada pessoa do time e quem precisa de ajuda. No BTG cada linha é um responsável;
// na Genial, um código de assessor (ZEVE INVESTIMENTOS n) com a pessoa ligada a ele ao lado.
// Redesenho de nov/26: a tela era o resumo em 14 colunas, duas matrizes de 12 meses e dois top 20.
// Agora: a frase, 4 cartões, uma linha por pessoa (cartões quando são poucas, lista de 7 colunas quando
// são muitas), o detalhe da pessoa escolhida (?assessor=, como antes) e um gráfico só de evolução.
const ATE_QUANTAS_EM_CARTOES = 6
const MUITAS_VEZES = 900   // acima de 10 vezes o mês anterior o percentual não diz nada: vira "mais de 10×"

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

  const hrefDe = (nome: string | null) => {
    const p = new URLSearchParams()
    if (nome) p.set('assessor', nome)
    if (ctx.mesEscolhido) p.set('mes', mesRef.slice(0, 7))
    const qs = p.toString()
    return `${base}/assessores${qs ? `?${qs}` : ''}`
  }
  const tituloDaTendencia = (p: PessoaDoTime) => meses.map((m, i) => `${mesCurto(m)} ${rCurto(p.tendencia[i])}${proj.parcial && m === mesRef ? ' (em andamento)' : ''}`).join(' · ')
  const detalhe = escolhida ? <DetalhePessoa p={escolhida} top={topSel} base={base} mesRef={mesRef} mesAnt={mesAnt} fechar={hrefDe(null)} /> : null

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
          <KpiCard label="Clientes ativos" value={fmtNum(clientesAtivos)} delta={variacaoMensal(clientesAtivos, ativosAnterior || null, mesAnt, proj.parcial, fmtNum)}
            dica="Clientes com lotes no mês, somados por pessoa: quem tem conta com duas pessoas conta nas duas." />
          <KpiCard label="Com lotes no mês" value={`${comLotes} de ${cadastrados}`} sub={`${unidade} cadastrados em Parâmetros`} />
        </KpiRow>

        {emCartoes ? (
          <Panel title="Cada pessoa no mês" subtitle="Um clique na pessoa mostra os 5 maiores clientes dela.">
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
            {detalhe && <div className="mt-4">{detalhe}</div>}
          </Panel>
        ) : (
          <Panel title="Cada pessoa no mês" subtitle={`${fmtNum(pessoas.length)} ${unidade}, do que mais rendeu para o que menos rendeu. Um clique no nome mostra os 5 maiores clientes.`}>
            <div className="tbl-wrap">
              <table className="tbl tbl-dense">
                <thead>
                  <tr>
                    <th>{porCodigo ? 'Código do assessor' : 'Responsável'}</th><th className="num col-p2">Clientes ativos</th><th className="num col-p3">Contas novas</th><th className="num col-p2">Lotes no mês</th>
                    <th className="num"><span className="inline-flex items-center gap-1">Receita no mês<Dica texto={`Embaixo do valor, a variação. ${dicaDaVariacao}`} /></span></th>
                    <th className="num col-p2">% da receita</th><th className="col-p3">Tendência</th>
                  </tr>
                </thead>
                <tbody>
                  {pessoas.length === 0 && <LinhaVazia colunas={7}>Sem lotes na janela.</LinhaVazia>}
                  {pessoas.map(p => {
                    const ativa = p.nome === sel
                    const parada = p.receita <= 0 && p.lotes <= 0
                    return [
                      <tr key={p.nome} className={cn(ativa && 'bg-surface-2')}>
                        <td className="max-w-[280px]">
                          <Link href={hrefDe(ativa ? null : p.nome)} scroll={false} className={cn('link font-medium', parada && 'text-fg-muted')} aria-expanded={ativa}>{p.nome}</Link>
                          {p.pessoa && <span className="ml-2 text-micro text-fg-muted">{p.pessoa}</span>}
                          {p.detalhe.tarifa == null && <Badge variant="warn" className="ml-2">sem cadastro</Badge>}
                        </td>
                        <td className={cn('num col-p2', !p.clientesAtivos && 'subtle')}>{n0(p.clientesAtivos)}</td>
                        <td className={cn('num col-p3', !p.contasNovas && 'subtle')}>{n0(p.contasNovas)}</td>
                        <td className={cn('num col-p2', !p.lotes && 'subtle')}>{n0(p.lotes)}</td>
                        <td className="num">
                          <span className={cn('font-semibold', !p.receita && 'subtle')}>{rCurto(p.receita)}</span>
                          {p.variacao != null && <span className="block text-micro"><VariacaoPessoa v={p.variacao} /></span>}
                        </td>
                        <td className="num col-p2">{p.receita > 0 ? fmtPct(p.pctReceita) : TRACO}</td>
                        <td className="col-p3"><Tendencia valores={p.tendencia} parcial={proj.parcial} titulo={tituloDaTendencia(p)} /></td>
                      </tr>,
                      ativa && detalhe ? <tr key={`${p.nome}-detalhe`} className="bg-surface-2"><td colSpan={7} className="!whitespace-normal">{detalhe}</td></tr> : null,
                    ]
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
        {sel && !escolhida && <p className="text-dense text-fg-muted">{sel} não tem lotes nos últimos 12 meses. <Link href={hrefDe(null)} className="link">Ver todos</Link></p>}

        <EvolucaoTime evolucao={evolucao} mesRef={mesRef} parcial={proj.parcial} />
      </PageBody>
    </>
  )
}

// O detalhe da pessoa escolhida: os 5 maiores clientes dela no mês e o que saiu da tabela principal
// (zerados, corretagem e zeragem, lotes por cliente, tarifa e os 12 meses), com o atalho para a lista de Clientes.
function DetalhePessoa({ p, top, base, mesRef, mesAnt, fechar }: { p: PessoaDoTime; top: TopClienteRow[]; base: string; mesRef: string; mesAnt: string; fechar: string }) {
  const a = p.detalhe
  const item = (rotulo: string, valor: ReactNode, apoio?: string) => (
    <div><dt className="label">{rotulo}</dt><dd className="mt-0.5 font-medium tabular-nums text-fg">{valor}</dd>{apoio && <dd className="text-micro text-fg-muted">{apoio}</dd>}</div>
  )
  return (
    <section className="min-w-0 py-2" aria-label={`Detalhe de ${p.nome}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-dense font-semibold text-fg">{p.nome}{p.pessoa ? ` · ${p.pessoa}` : ''}: os 5 maiores clientes em {mesCurto(mesRef)}</h3>
        <div className="flex items-center gap-2">
          <Link href={`${base}/clientes?assessor=${encodeURIComponent(p.nome)}`} className={buttonClasses('secondary', 'xs')}>Ver todos os clientes</Link>
          <Link href={fechar} scroll={false} className={buttonClasses('ghost', 'xs')} aria-label="Fechar o detalhe"><X className="h-3.5 w-3.5" aria-hidden />Fechar</Link>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead><tr><th>Cliente</th><th className="num">Lotes</th><th className="num">Receita</th><th className="num col-p2">% dos lotes</th></tr></thead>
            <tbody>
              {top.length === 0 && <LinhaVazia colunas={4}>Sem lotes no mês.</LinhaVazia>}
              {top.map((c, i) => (
                <tr key={`${c.cliente_id ?? c.cliente_nome}-${i}`}>
                  <td className="max-w-[240px] truncate">{c.cliente_id ? <Link href={`${base}/clientes/${c.cliente_id}`} className="link">{c.cliente_nome}</Link> : <span className="text-warn" title="Conta sem cliente cadastrado">{c.cliente_nome}</span>}</td>
                  <td className="num"><span className="md:hidden">{n0(c.lotes)}</span><span className="hidden md:inline"><BarraCelula valor={c.lotes} max={top[0]?.lotes ?? 0} largura={56} /></span></td>
                  <td className="num">{r0(c.receita)}</td>
                  <td className="num col-p2">{fmtPct(c.pct_lotes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-dense md:grid-cols-3 xl:grid-cols-2">
          {item('Clientes ativos', n0(p.clientesAtivos), p.clientesAtivos ? `${n2(Math.round((p.lotes / p.clientesAtivos) * 10) / 10)} lotes por cliente` : undefined)}
          {item('Contas novas no mês', n0(p.contasNovas))}
          {item('Corretagem', r0(a.receita_corretagem))}
          {item('Zeragem', r0(a.receita_zeragem), a.zerados ? `${fmtNum(a.zerados)} contratos zerados` : 'nenhum contrato zerado')}
          {item('Tarifa', a.tarifa == null ? <span className="text-warn">sem cadastro em Parâmetros</span> : n2(a.tarifa), a.tarifa == null ? undefined : `R$ por lote${a.tipo_zeragem === 'FIXA' ? ' · zeragem fixa' : ''}`)}
          {item(`Lotes em ${mesCurto(mesAnt)}`, n0(a.lotes_mes_anterior), 'mês inteiro')}
          {item('Lotes em 12 meses', n0(a.lotes_12m))}
          {item('Receita em 12 meses', rCurto(a.receita_12m))}
        </dl>
      </div>
    </section>
  )
}
