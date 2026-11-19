export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { giroDiario, incentivoHistorico, incentivoMes, parametrosDaCorretora, receitaMensal, ultimaData } from '@/lib/gestao/consultas'
import { getProfile } from '@/lib/auth/getProfile'
import { configBtg } from '@/lib/gestao/btg'
import { projetarIncentivo, projetarMes, variacaoMensal } from '@/lib/gestao/projecao'
import { fraseDoIncentivo, maisPertoDeSubir } from '@/lib/gestao/incentivoTela'
import { doPrimeiroComDado } from '@/lib/gestao/receitaTela'
import { janelaMeses, limitesDoMes, mesCurto, somarMeses } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Recolhido } from '@/components/ui/Recolhido'
import { MesPicker } from '@/components/gestao/Filtros'
import { Resumo } from '@/components/gestao/Resumo'
import { LinhaVazia, TRACO, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { TabelaIncentivo } from './TabelaIncentivo'
import { IncentivoAtp } from './IncentivoAtp'

// Incentivo: quanto falta para a próxima meta, quando bate e quanto de prêmio está em jogo.
// São dois programas diferentes, cada um com a sua tela e as suas regras (não se misturam):
//  - BTG: ATP Turbo Receita, metas de comissão acumulada com prazo (IncentivoAtp);
//  - Genial: pontos por cliente no mês, que caem em faixas de bônus (esta página).
// Redesenho de nov/26: a frase no topo, 4 cartões, um gráfico de eixo único e a tabela em 7 colunas;
// multiplicadores, faixas e o histórico mês a mês ficam recolhidos.
export default async function IncentivoPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { corretora, mesRef, base } = ctx
  // Tudo em paralelo; cada modelo usa a sua parte (antes eram três idas ao banco em sequência)
  const [par, serie, linhas, hist, ultima, giro, profile] = await Promise.all([
    parametrosDaCorretora(corretora), receitaMensal(corretora, null), incentivoMes(corretora, mesRef), incentivoHistorico(corretora, mesRef, 12), ultimaData(corretora),
    giroDiario(corretora, somarMeses(mesRef, -24), limitesDoMes(mesRef).fim), getProfile(),
  ])
  const cfg = configBtg(par.parametros)
  const hoje = fmtDate(hojeBrasil())
  // Fechamento previsto do mês corrente pelo perfil intra-mês do histórico (o mesmo do Painel)
  const proj = projetarMes(giro, mesRef, ultima, hoje)

  // BTG: programa ATP Turbo Receita (metas de comissão acumulada), não pontos por lote
  if (cfg.modelo === 'ATP') {
    return (
      <>
        <PageHeader eyebrow={ctx.eyebrow} title="Incentivo" />
        <PageBody>
          <IncentivoAtp cfg={cfg} serie={serie} hoje={hoje} ultimaData={ultima} ritmoBase={ctx.q.ritmo} base={base} label={ctx.label} corretora={corretora} admin={profile?.role === 'admin'}
            projecaoAtual={proj.parcial && proj.metodo === 'historico' ? proj.receita.projetado : null} />
        </PageBody>
      </>
    )
  }

  const total = linhas.reduce((s, l) => s + l.valor_incentivo, 0)
  const comFaixa = linhas.filter(l => l.valor_incentivo > 0)
  const pontos = linhas.reduce((s, l) => s + l.pontos, 0)
  const lotes = linhas.reduce((s, l) => s + l.lotes, 0)
  const total12 = hist.reduce((s, h) => s + h.incentivo, 0)
  const maior = comFaixa[0]
  const proximo = maisPertoDeSubir(linhas)
  const primeiraFaixa = par.faixas[0]?.pontos_min ?? 1000
  const histMap = new Map(hist.map(h => [h.mes_ref, h]))
  const mult = par.multiplicadores.map(m => `${m.produto} ×${m.pontos}`).join(' · ')
  // meses da janela a partir do primeiro com pontos
  const meses = doPrimeiroComDado(janelaMeses(mesRef, 12), m => { const h = histMap.get(m); return !!h && (h.pontos > 0 || h.incentivo > 0) })
  // Fechamento previsto: os pontos de cada cliente crescem no fator do mês (perfil do histórico) e
  // voltam às faixas; variação contra o mês anterior fica sem cor enquanto o mês está parcial
  const incentivoProj = proj.parcial ? projetarIncentivo(linhas, proj.fator.lotes, par.faixas) : null
  const anterior = histMap.get(proj.mesAnterior)
  const variacao = (atual: number, ant: number | undefined, fmt: (n: number) => string) => variacaoMensal(atual, ant, proj.mesAnterior, proj.parcial, fmt)

  return (
    <>
      <PageHeader eyebrow={ctx.eyebrow} title="Incentivo" actions={<MesPicker valor={mesRef} />} />
      <PageBody>
        <Resumo
          frase={fraseDoIncentivo({ mesRef, total, comFaixa: comFaixa.length, previsto: incentivoProj ? incentivoProj.total : null, anterior: anterior?.incentivo ?? null, primeiraFaixa })}
          apoio={proximo ? `Mais perto de subir de faixa: ${proximo.nome}, faltam ${fmtNum(proximo.pontos_faltantes ?? 0)} pontos para passar de ${fmtNum(proximo.proxima_faixa ?? 0)}.` : null} />

        {/* Celular (DESIGN.md §8.5): só o incentivo do mês fica como cartão, na largura toda (lado a lado o rótulo
            quebrava e os dois números ficavam desalinhados); clientes com faixa e 12 meses viram linha.
            "Mais perto de subir" sai da vista: a linha logo abaixo da frase já diz quem é e quantos pontos faltam.
            Com o mês em andamento a variação contra o mês fechado ("mês parcial") dá lugar, no celular, a
            "deve fechar em"; a de clientes com faixa fica em "ver os números mês a mês" (coluna Com faixa). */}
        <KpiRow cols={4} principalLargo>
          <KpiCard destaque label={`Incentivo em ${mesCurto(mesRef)}`} value={rCurto(total)} delta={variacao(total, anterior?.incentivo, rCurto)}
            // no computador o envoltório do "deve fechar em" também sai, para o apoio do cartão ficar como era
            className={cn(incentivoProj && 'max-md:[&_.kpi-delta]:hidden! md:[&_.kpi-apoio>span:has(>[data-celular])]:hidden')}
            sub={incentivoProj ? <span data-celular className="md:hidden">deve fechar em {rCurto(incentivoProj.total)}</span> : undefined}
            dica={`Bônus pago pela ${ctx.label} por cliente: pontos = lotes × multiplicador do produto; a faixa é o maior mínimo de pontos que o cliente ultrapassou no mês.`} />
          <KpiCard label="Clientes com faixa" value={fmtNum(comFaixa.length)} sub={linhas.length ? `${fmtPct((comFaixa.length / linhas.length) * 100, 0)} dos ${fmtNum(linhas.length)} que pontuam` : undefined}
            className={cn(incentivoProj && 'max-md:[&_.kpi-delta]:hidden!')}
            delta={variacao(comFaixa.length, anterior?.clientes_com_faixa, fmtNum)} />
          <KpiCard label="Mais perto de subir" value={proximo ? `${fmtNum(proximo.pontos_faltantes ?? 0)} pontos` : TRACO} className="max-md:hidden!"
            sub={proximo ? <span className="block truncate" title={proximo.nome}>{proximo.nome} · para passar de {fmtNum(proximo.proxima_faixa ?? 0)}</span> : 'ninguém a caminho de outra faixa'} />
          <KpiCard label="Incentivo em 12 meses" value={rCurto(total12)} sub={meses.length ? `${mesCurto(meses[0])} a ${mesCurto(mesRef)}` : undefined} />
        </KpiRow>

        <Panel title="Incentivo por mês" subtitle={incentivoProj ? <>
          <span className="max-md:hidden">{mesCurto(mesRef)} ainda está em andamento: deve fechar em {rCurto(incentivoProj.total)}, com {fmtNum(incentivoProj.comFaixa)} clientes em faixa{incentivoProj.sobem ? ` (${fmtNum(incentivoProj.sobem)} sobem)` : ''}.</span>
          {/* celular: o valor previsto já está no cartão logo acima; fica só o que ele não diz */}
          <span className="md:hidden">Deve fechar com {fmtNum(incentivoProj.comFaixa)} clientes com faixa{incentivoProj.sobem ? ` (${fmtNum(incentivoProj.sobem)} sobem)` : ''}.</span>
        </> : undefined}>
          {meses.length === 0 ? <p className="py-10 text-center text-dense text-fg-subtle">Sem pontos na janela.</p> : (
            <>
              <GraficoSeries dados={meses.map(m => ({ label: mesCurto(m), incentivo: histMap.get(m)?.incentivo ?? 0 }))}
                series={[{ key: 'incentivo', nome: 'Incentivo', tipo: 'bar', formato: 'brl' }]} formato="brl" altura={240} legenda={false} />
              <Recolhido tamanho="linha" titulo="ver os números mês a mês">
                {/* matriz mês a mês continua tabela no celular (§8.6): os pontos de cada mês voltam à vista. Para as
                    cinco colunas caberem em 358 px sem rolar de lado, o título da coluna pode quebrar ("Com faixa") */}
                <div className="tbl-wrap">
                  <table className="tbl tbl-dense max-md:[&_td]:px-1.5 max-md:[&_th]:px-1.5 max-md:[&_th]:whitespace-normal">
                    <thead><tr><th>Mês</th><th className="num col-p2 max-md:table-cell">Pontos</th><th className="num"><span className="md:hidden">Pontuando</span><span className="hidden md:inline">Clientes pontuando</span></th><th className="num">Com faixa</th><th className="num">Incentivo</th></tr></thead>
                    <tbody>
                      {meses.map(m => {
                        const h = histMap.get(m)
                        return (
                          <tr key={m} className={cn(m === mesRef && 'font-semibold')}>
                            <td>{mesCurto(m)}</td><td className="num col-p2 max-md:table-cell">{n0(h?.pontos)}</td><td className="num">{n0(h?.clientes_pontuando)}</td><td className="num">{n0(h?.clientes_com_faixa)}</td><td className="num">{rCurto(h?.incentivo)}</td>
                          </tr>
                        )
                      })}
                      <tr className="total"><td>Total</td><td className="num col-p2 max-md:table-cell">{n0(hist.reduce((s, h) => s + h.pontos, 0))}</td><td></td><td></td><td className="num">{rCurto(total12)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </Recolhido>
            </>
          )}
        </Panel>

        <TabelaIncentivo linhas={linhas} base={base} mesRef={mesRef} />

        <Recolhido titulo="Faixas e regras" resumo="multiplicadores, quantos clientes em cada faixa e os pontos do mês">
          <div className="grid gap-8 xl:grid-cols-2">
            <Panel title="Faixas" subtitle="O cliente recebe o valor da maior faixa que ultrapassou no mês.">
              <div className="tbl-wrap">
                <table className="tbl tbl-dense w-full">
                  <thead><tr><th>Faixa de pontos</th><th className="num">Incentivo</th><th className="num">Clientes</th></tr></thead>
                  <tbody>
                    {par.faixas.length === 0 && <LinhaVazia colunas={3}>Sem faixas cadastradas.</LinhaVazia>}
                    {par.faixas.length > 0 && <tr><td className="muted">Até {fmtNum(primeiraFaixa)}</td><td className="num subtle">{TRACO}</td><td className="num">{n0(linhas.length - comFaixa.length)}</td></tr>}
                    {par.faixas.map(f => {
                      const n = linhas.filter(l => l.faixa_min === f.pontos_min).length
                      return <tr key={f.pontos_min}><td>Mais de {fmtNum(f.pontos_min)}</td><td className="num">{r0(f.valor)}</td><td className={cn('num', !n && 'subtle')}>{n0(n)}</td></tr>
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
            <Panel title="Regras em vigor" subtitle={<Link href={`${base}/parametros`} className="link">editar em Parâmetros</Link>}>
              <dl className="space-y-4 text-dense">
                <div><dt className="label">Multiplicadores (pontos por lote)</dt><dd className="mt-0.5 text-fg-muted">{mult || 'nenhum cadastrado'}</dd></div>
                {par.consolidados.length > 0 && <div><dt className="label">Consolidados (somam pelo nome)</dt><dd className="mt-0.5 text-fg-muted">{par.consolidados.map(c => c.nome).join(', ')}</dd></div>}
                <div><dt className="label">Pontos em {mesCurto(mesRef)}</dt><dd className="mt-0.5 tabular-nums text-fg">{fmtNum(pontos)} <span className="text-fg-muted">em {fmtNum(lotes)} lotes{incentivoProj ? `; fecha em ${fmtNum(Math.round(incentivoProj.pontos))} pontos` : ''}</span></dd></div>
                <div><dt className="label">Maior incentivo do mês</dt><dd className="mt-0.5 text-fg">{maior ? <>{maior.nome} <span className="text-fg-muted">· {rCurto(maior.valor_incentivo)} · mais de {fmtNum(maior.faixa_min)} pontos</span></> : <span className="text-fg-muted">ninguém com faixa</span>}</dd></div>
              </dl>
            </Panel>
          </div>
        </Recolhido>
      </PageBody>
    </>
  )
}
