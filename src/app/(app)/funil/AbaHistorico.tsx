// Funil › Histórico: os últimos 12 meses — o resultado de cada mês (pela data do evento) e o que
// aconteceu com os leads de cada mês de entrada.
//
// No celular (DESIGN.md §8) a aba abre pela frase (o mês contra o anterior) e o resultado de cada mês vira
// lista: o mês, os ganhos e as contas novas, e a receita à direita; tocar no mês abre a aba Mês dele, onde
// estão os perdidos, os ativados e a receita por tipo (que também entram na linha com "Mais números"). A matriz de indicadores continua tabela (é mês a mês),
// com todos os meses e os mais novos primeiro. O gráfico vai para o fim, recolhido. O computador não muda.
import Link from 'next/link'
import { funilMensal, funilResultado, funilSafra } from '@/lib/gestao/consultas'
import { fmtMedia } from '@/lib/gestao/contatos'
import { janelaMeses, mesAtual, mesCurto, mesInput, mesLongo, somarMeses } from '@/lib/gestao/meses'
import { cn } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { Resumo } from '@/components/gestao/Resumo'
import { LinhaVazia, TRACO, n0, p1, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { DicaNoTitulo, Palavra } from './Celular'
import { RecolheNoCelular } from '@/components/ui/RecolheNoCelular'
import { MaisNumeros } from './MaisNumeros'
import { LISTA_LARGA, MESES_INATIVO, RESULTADO_VAZIO, celApoio, celMais, pct, plural, somaSafra } from './comum'
import type { FunilResultadoRow, FunilSafraBase } from '@/lib/gestao/tipos'

// Nome de cada receita por tipo na linha de apoio do celular ("receita de novos R$ ..."): o espaço que não
// quebra mantém o nome inteiro na mesma linha, colado ao valor
const ROTULO_RECEITA = { novos: 'receita\u00a0de\u00a0novos', ativados: 'de\u00a0ativados', reativados: 'de\u00a0reativados', carteira: 'da\u00a0carteira' }

// Coluna de mês (e a dos 12 m) da matriz, no celular: duas cabem inteiras ao lado da coluna presa de 10.5rem
// (a página tem 1rem de margem de cada lado), então a primeira à vista nunca aparece cortada
const COLUNA_MATRIZ = 'max-md:min-w-[calc((100vw-2rem-10.5rem)/2)]'

export async function AbaHistorico({ mesRef }: { mesRef: string }) {
  const meses = janelaMeses(mesRef, 12)
  const [resultado, safra, mensal] = await Promise.all([funilResultado(mesRef, 12, MESES_INATIVO), funilSafra(mesRef, 12), funilMensal(mesRef, 12)])
  const m = new Map(mensal.map(x => [x.mes_ref, x]))
  const s = new Map(safra.map(x => [x.mes_ref, x]))
  const resultadoDesc = [...resultado].reverse()
  const chavesR = (Object.keys(RESULTADO_VAZIO) as (keyof FunilResultadoRow)[]).filter(k => k !== 'mes_ref')
  const totR = Object.fromEntries(chavesR.map(k => [k, resultado.reduce((acc, x) => acc + (x[k] as number), 0)])) as Omit<FunilResultadoRow, 'mes_ref'>
  const tudo = somaSafra(safra)
  const grafico = meses.map(x => ({ label: mesCurto(x), entraram: s.get(x)?.recebidos ?? m.get(x)?.recebidos ?? 0, tombaram: s.get(x)?.ativados ?? 0, operaram: s.get(x)?.com_giro ?? 0, perdidos: s.get(x)?.perdidos_funil ?? 0 }))

  const contatosPorGanho = (x: Pick<FunilSafraBase, 'contatos_ganhos' | 'ganhos_contatados'> | undefined) => (x && x.ganhos_contatados ? x.contatos_ganhos / x.ganhos_contatados : null)
  type Linha = { label: string; valor: (x: FunilSafraBase | undefined) => number | null; fmt: (v: number | null) => string; total: number | null; destaque?: 'sub' | 'bold' | 'gain' | 'loss' }
  const nn = (v: number | null) => (v == null ? TRACO : n0(v))
  const pp = (v: number | null) => (v == null ? TRACO : p1(v))
  const rr = (v: number | null) => (v == null ? TRACO : rCurto(v))
  const mm = (v: number | null) => (v == null ? TRACO : (fmtMedia(v) ?? TRACO))
  const linhas: Linha[] = [
    { label: 'Leads que entraram', valor: x => x?.recebidos ?? null, fmt: nn, total: tudo.recebidos, destaque: 'bold' },
    { label: 'já eram clientes ao entrar', valor: x => x?.ja_clientes ?? null, fmt: nn, total: tudo.ja_clientes, destaque: 'sub' },
    { label: 'Contatados', valor: x => x?.contatados ?? null, fmt: nn, total: tudo.contatados },
    { label: '% contatados', valor: x => (x ? pct(x.contatados, x.recebidos) : null), fmt: pp, total: pct(tudo.contatados, tudo.recebidos), destaque: 'sub' },
    { label: 'contatos por lead ganho (média)', valor: contatosPorGanho, fmt: mm, total: contatosPorGanho(tudo), destaque: 'sub' },
    { label: 'Em contato (ainda abertos)', valor: x => x?.em_contato ?? null, fmt: nn, total: tudo.em_contato },
    { label: 'Perdidos', valor: x => x?.perdidos_funil ?? null, fmt: nn, total: tudo.perdidos_funil, destaque: 'loss' },
    { label: 'Tombaram (abriram a conta)', valor: x => x?.ativados ?? null, fmt: nn, total: tudo.ativados, destaque: 'bold' },
    { label: '% tombaram sobre os que entraram', valor: x => (x ? pct(x.ativados, x.recebidos) : null), fmt: pp, total: pct(tudo.ativados, tudo.recebidos), destaque: 'sub' },
    { label: 'ainda em abertura', valor: x => x?.contas_em_abertura ?? null, fmt: nn, total: tudo.contas_em_abertura, destaque: 'sub' },
    { label: 'Operaram (abriram a conta e giraram)', valor: x => x?.com_giro ?? null, fmt: nn, total: tudo.com_giro, destaque: 'gain' },
    { label: '% operaram sobre os que tombaram', valor: x => (x ? pct(x.com_giro, x.ativados) : null), fmt: pp, total: pct(tudo.com_giro, tudo.ativados), destaque: 'sub' },
    { label: 'Lotes operados por esses leads', valor: x => x?.lotes ?? null, fmt: nn, total: tudo.lotes },
    { label: 'Receita deixada por esses leads', valor: x => x?.receita ?? null, fmt: rr, total: tudo.receita, destaque: 'gain' },
  ]

  // A frase do celular: o mês aberto e o anterior, com os números das colunas Ganhos, Contas novas e Receita
  const parcial = mesRef >= mesAtual()
  const mesAnterior = somarMeses(mesRef, -1)
  const doMes = (x: FunilResultadoRow | undefined) => {
    const partes = x ? [
      x.ganhos ? plural(x.ganhos, 'lead ganho', 'leads ganhos') : null,
      x.contas_novas ? plural(x.contas_novas, 'conta nova', 'contas novas') : null,
      x.receita_total ? `${rCurto(x.receita_total)} de receita` : null,
    ].filter(Boolean) : []
    return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}` : partes[0] ?? null
  }
  const agora = doMes(resultado.find(x => x.mes_ref === mesRef)), antes = doMes(resultado.find(x => x.mes_ref === mesAnterior))
  const frase = agora ? `Em ${mesLongo(mesRef)}${parcial ? ', até hoje' : ''}: ${agora}.` : `${mesLongo(mesRef)} ainda sem lead ganho, conta nova ou receita.`
  const apoio = antes ? `${mesLongo(mesAnterior)} fechou com ${antes}.` : null
  // de quando em diante há lead ganho ou perdido (a linha "12 meses" soma só esses meses)
  const fechadosDesde = resultado.find(x => x.ganhos > 0 || x.perdidos > 0)?.mes_ref ?? null

  const explica = {
    resultado: `Pela data do evento, todas as corretoras juntas: leads fechados, contas novas, ativados (1ª operação) e reativados (voltaram após ${MESES_INATIVO} meses), com a receita bruta de cada tipo.`,
    leads: `Cada coluna é o mês em que o lead entrou; os números contam o que aconteceu com ele até hoje. De ${mesCurto(meses[0])} a ${mesCurto(mesRef)}.`,
  }

  return (
    <>
      {resultado.length > 0 && <div className="md:hidden"><Resumo frase={frase} apoio={apoio} /></div>}

      {/* celular: o gráfico vai para o fim, recolhido; a resposta da aba é a lista dos meses */}
      <RecolheNoCelular className="max-md:order-last max-md:mt-6" titulo="Leads por mês de entrada" resumo="gráfico dos que entraram, tombaram, operaram e se perderam">
        <Panel title={<span className="max-md:hidden">Leads por mês de entrada</span>} subtitle={<span className="max-md:hidden">Quantos entraram em cada mês e, deles, quantos tombaram (abriram a conta), operaram e se perderam até hoje.</span>}>
          <GraficoSeries dados={grafico} altura={260}
            series={[{ key: 'entraram', nome: 'Entraram', tipo: 'bar' }, { key: 'tombaram', nome: 'Tombaram', tipo: 'bar', cor: 'neutral' }, { key: 'operaram', nome: 'Operaram', tipo: 'bar', cor: 'gain' }, { key: 'perdidos', nome: 'Perdidos', tipo: 'bar', cor: 'loss' }]} />
        </Panel>
      </RecolheNoCelular>

      <Panel title={<>Resultado de cada mês<DicaNoTitulo texto={explica.resultado} /></>}
        subtitle={<><span className="max-md:hidden">{explica.resultado} Clique no mês para abri-lo.</span><span className="md:hidden">Cada mês abre na aba Mês, com os perdidos, os ativados e a receita por tipo.</span></>}>
        {/* celular: cada mês mostra os ganhos e as contas novas; perdidos, ativados, reativados e a receita por
            tipo entram na linha de apoio com "Mais números" (e estão na aba Mês, que a linha abre) */}
        <MaisNumeros>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense tbl-lista lista-abre" style={LISTA_LARGA}>
              <thead>
                <tr>
                  <th>Mês</th><th className="num">Ganhos</th><th className="num">Perdidos</th><th className="num">Contas novas</th><th className="num">Ativados</th><th className="num">Reativados</th>
                  <th className="num">Receita</th><th className="num col-p2">de novos</th><th className="num col-p2">de ativados</th><th className="num col-p2">de reativados</th><th className="num col-p3">da carteira</th>
                </tr>
              </thead>
              <tbody>
                {resultadoDesc.length === 0 && <LinhaVazia colunas={11}>Sem resultado: rode a S51 no Supabase.</LinhaVazia>}
                {resultadoDesc.map(x => (
                  <tr key={x.mes_ref} className={cn(x.mes_ref === mesRef && 'bg-accent-soft max-md:bg-transparent')}>
                    <td className="cel-titulo font-medium"><Link href={`/funil?mes=${mesInput(x.mes_ref)}`} className="link">{mesCurto(x.mes_ref)}</Link></td>
                    {/* os ganhos aparecem (mesmo zero) quando há perdidos: a primeira célula da linha de apoio tem de
                        ser uma que aparece sempre, senão a seguinte ganha um "·" na frente */}
                    <td className={cn('num font-semibold', x.ganhos ? 'text-gain' : 'subtle', celApoio(x.ganhos > 0 || x.perdidos > 0))}>{n0(x.ganhos)}<Palavra n={x.ganhos} um="ganho" varios="ganhos" /></td>
                    <td className={cn('num', x.perdidos ? 'text-loss' : 'subtle', celMais(x.perdidos > 0))}>{n0(x.perdidos)}<Palavra n={x.perdidos} um="perdido" varios="perdidos" /></td>
                    <td className={cn('num', !x.contas_novas && 'subtle', celApoio(x.contas_novas > 0))}>{n0(x.contas_novas)}<Palavra n={x.contas_novas} um="conta nova" varios="contas novas" /></td>
                    <td className={cn('num', !x.ativados && 'subtle', celMais(x.ativados > 0))}>{n0(x.ativados)}<Palavra n={x.ativados} um="ativado" varios="ativados" /></td>
                    <td className={cn('num', !x.reativados && 'subtle', celMais(x.reativados > 0))}>{n0(x.reativados)}<Palavra n={x.reativados} um="reativado" varios="reativados" /></td>
                    <td className={cn('num cel-valor font-semibold', !x.receita_total && 'subtle')} data-rotulo="receita">{r0(x.receita_total)}</td>
                    <td className={cn('num col-p2', !x.receita_novos && 'subtle', celMais(x.receita_novos > 0))} data-rotulo={ROTULO_RECEITA.novos}>{r0(x.receita_novos)}</td>
                    <td className={cn('num col-p2', !x.receita_ativados && 'subtle', celMais(x.receita_ativados > 0))} data-rotulo={ROTULO_RECEITA.ativados}>{r0(x.receita_ativados)}</td>
                    <td className={cn('num col-p2', !x.receita_reativados && 'subtle', celMais(x.receita_reativados > 0))} data-rotulo={ROTULO_RECEITA.reativados}>{r0(x.receita_reativados)}</td>
                    <td className={cn('num col-p3', !x.receita_carteira && 'subtle', celMais(x.receita_carteira > 0))} data-rotulo={ROTULO_RECEITA.carteira}>{r0(x.receita_carteira)}</td>
                  </tr>
                ))}
              </tbody>
              {resultadoDesc.length > 1 && (
                <tfoot>
                  {/* celular: como nos meses, ganhos e contas novas; o resto com "Mais números" */}
                  <tr className="total">
                    <td className="cel-titulo">
                      12 meses
                      {fechadosDesde && fechadosDesde !== meses[0] && <span className="block text-label font-normal text-fg-muted md:hidden">leads ganhos e perdidos só a partir de {mesCurto(fechadosDesde)}</span>}
                    </td>
                    <td className={cn('num', celApoio(totR.ganhos > 0 || totR.perdidos > 0))}>{n0(totR.ganhos)}<Palavra n={totR.ganhos} um="ganho" varios="ganhos" /></td>
                    <td className={cn('num', celMais(totR.perdidos > 0))}>{n0(totR.perdidos)}<Palavra n={totR.perdidos} um="perdido" varios="perdidos" /></td>
                    <td className={cn('num', celApoio(totR.contas_novas > 0))}>{n0(totR.contas_novas)}<Palavra n={totR.contas_novas} um="conta nova" varios="contas novas" /></td>
                    <td className={cn('num', celMais(totR.ativados > 0))}>{n0(totR.ativados)}<Palavra n={totR.ativados} um="ativado" varios="ativados" /></td>
                    <td className={cn('num', celMais(totR.reativados > 0))}>{n0(totR.reativados)}<Palavra n={totR.reativados} um="reativado" varios="reativados" /></td>
                    <td className="num cel-valor" data-rotulo="receita">{r0(totR.receita_total)}</td>
                    <td className={cn('num col-p2', celMais(totR.receita_novos > 0))} data-rotulo={ROTULO_RECEITA.novos}>{r0(totR.receita_novos)}</td>
                    <td className={cn('num col-p2', celMais(totR.receita_ativados > 0))} data-rotulo={ROTULO_RECEITA.ativados}>{r0(totR.receita_ativados)}</td>
                    <td className={cn('num col-p2', celMais(totR.receita_reativados > 0))} data-rotulo={ROTULO_RECEITA.reativados}>{r0(totR.receita_reativados)}</td>
                    <td className={cn('num col-p3', celMais(totR.receita_carteira > 0))} data-rotulo={ROTULO_RECEITA.carteira}>{r0(totR.receita_carteira)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </MaisNumeros>
      </Panel>

      {/* Matriz mês a mês: continua tabela no celular (DESIGN.md §8.6). Ali aparecem todos os meses (antes só os
          quatro últimos), a moldura abre na ponta dos meses mais novos (rolagem da direita para a esquerda, com
          a tabela na ordem de sempre) e o nome do indicador quebra em duas linhas em vez de ser cortado. */}
      <Panel title={<>O que aconteceu com os leads de cada mês<DicaNoTitulo texto={explica.leads} /></>}
        subtitle={<><span className="max-md:hidden">{explica.leads}</span><span className="md:hidden">Os meses mais novos aparecem primeiro; arraste para o lado para ver os anteriores.</span></>}>
        <div className="tbl-wrap max-md:[direction:rtl]">
          <table className="tbl tbl-dense max-md:[direction:ltr]">
            <thead><tr><th className="sticky-col min-w-[240px] max-md:min-w-[10.5rem]">Indicador</th>{meses.map(x => <th key={x} className={cn('num', COLUNA_MATRIZ, x === mesRef && 'text-fg')}>{mesCurto(x)}</th>)}<th className={cn('num', COLUNA_MATRIZ)}>12 m</th></tr></thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.label}>
                  <td className={cn('sticky-col max-md:whitespace-normal!', l.destaque === 'sub' && 'pl-6 text-fg-muted', l.destaque === 'bold' && 'font-semibold', l.destaque === 'gain' && 'text-gain', l.destaque === 'loss' && 'text-loss')}>{l.label}</td>
                  {meses.map(x => { const v = l.valor(s.get(x)); return <td key={x} className={cn('num', !v && 'subtle', x === mesRef && 'bg-surface-2', l.destaque === 'gain' && v && 'text-gain', l.destaque === 'loss' && v && 'text-loss')}>{l.fmt(v)}</td> })}
                  <td className="num font-semibold">{l.total == null ? '' : l.fmt(l.total)}</td>
                </tr>
              ))}
              <tr>
                <td className="sticky-col max-md:whitespace-normal!">Tempo médio até fechar (dias)</td>
                {meses.map(x => { const v = m.get(x)?.dias_fechar ?? null; return <td key={x} className={cn('num', !v && 'subtle', x === mesRef && 'bg-surface-2')}>{v == null ? TRACO : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td> })}
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}
