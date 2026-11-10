// Funil › Histórico: os últimos 12 meses — o resultado de cada mês (pela data do evento) e o que
// aconteceu com os leads de cada mês de entrada.
import Link from 'next/link'
import { funilMensal, funilResultado, funilSafra } from '@/lib/gestao/consultas'
import { fmtMedia } from '@/lib/gestao/contatos'
import { janelaMeses, mesCurto, mesInput } from '@/lib/gestao/meses'
import { cn } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { LinhaVazia, TRACO, n0, p1, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { MESES_INATIVO, RESULTADO_VAZIO, pct, somaSafra } from './comum'
import type { FunilResultadoRow, FunilSafraBase } from '@/lib/gestao/tipos'

export async function AbaHistorico({ mesRef }: { mesRef: string }) {
  const meses = janelaMeses(mesRef, 12)
  const [resultado, safra, mensal] = await Promise.all([funilResultado(mesRef, 12, MESES_INATIVO), funilSafra(mesRef, 12), funilMensal(mesRef, 12)])
  const m = new Map(mensal.map(x => [x.mes_ref, x]))
  const s = new Map(safra.map(x => [x.mes_ref, x]))
  const resultadoDesc = [...resultado].reverse()
  const chavesR = (Object.keys(RESULTADO_VAZIO) as (keyof FunilResultadoRow)[]).filter(k => k !== 'mes_ref')
  const totR = Object.fromEntries(chavesR.map(k => [k, resultado.reduce((acc, x) => acc + (x[k] as number), 0)])) as Omit<FunilResultadoRow, 'mes_ref'>
  const tudo = somaSafra(safra)
  const colMes = (i: number) => (i < meses.length - 4 ? 'col-p2' : '')
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

  return (
    <>
      <Panel title="Leads por mês de entrada" subtitle="Quantos entraram em cada mês e, deles, quantos tombaram (abriram a conta), operaram e se perderam até hoje.">
        <GraficoSeries dados={grafico} altura={260}
          series={[{ key: 'entraram', nome: 'Entraram', tipo: 'bar' }, { key: 'tombaram', nome: 'Tombaram', tipo: 'bar', cor: 'neutral' }, { key: 'operaram', nome: 'Operaram', tipo: 'bar', cor: 'gain' }, { key: 'perdidos', nome: 'Perdidos', tipo: 'bar', cor: 'loss' }]} />
      </Panel>

      <Panel title="Resultado de cada mês" subtitle={`Pela data do evento, todas as corretoras juntas: leads fechados, contas novas, ativados (1ª operação) e reativados (voltaram após ${MESES_INATIVO} meses), com a receita bruta de cada tipo. Clique no mês para abri-lo.`}>
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead>
              <tr>
                <th>Mês</th><th className="num">Ganhos</th><th className="num">Perdidos</th><th className="num">Contas novas</th><th className="num">Ativados</th><th className="num">Reativados</th>
                <th className="num">Receita</th><th className="num col-p2">de novos</th><th className="num col-p2">de ativados</th><th className="num col-p2">de reativados</th><th className="num col-p3">da carteira</th>
              </tr>
            </thead>
            <tbody>
              {resultadoDesc.length === 0 && <LinhaVazia colunas={11}>Sem resultado: rode a S51 no Supabase.</LinhaVazia>}
              {resultadoDesc.map(x => (
                <tr key={x.mes_ref} className={cn(x.mes_ref === mesRef && 'bg-accent-soft')}>
                  <td className="font-medium"><Link href={`/funil?mes=${mesInput(x.mes_ref)}`} className="link">{mesCurto(x.mes_ref)}</Link></td>
                  <td className={cn('num font-semibold', x.ganhos ? 'text-gain' : 'subtle')}>{n0(x.ganhos)}</td>
                  <td className={cn('num', x.perdidos ? 'text-loss' : 'subtle')}>{n0(x.perdidos)}</td>
                  <td className={cn('num', !x.contas_novas && 'subtle')}>{n0(x.contas_novas)}</td>
                  <td className={cn('num', !x.ativados && 'subtle')}>{n0(x.ativados)}</td>
                  <td className={cn('num', !x.reativados && 'subtle')}>{n0(x.reativados)}</td>
                  <td className={cn('num font-semibold', !x.receita_total && 'subtle')}>{r0(x.receita_total)}</td>
                  <td className={cn('num col-p2', !x.receita_novos && 'subtle')}>{r0(x.receita_novos)}</td>
                  <td className={cn('num col-p2', !x.receita_ativados && 'subtle')}>{r0(x.receita_ativados)}</td>
                  <td className={cn('num col-p2', !x.receita_reativados && 'subtle')}>{r0(x.receita_reativados)}</td>
                  <td className={cn('num col-p3', !x.receita_carteira && 'subtle')}>{r0(x.receita_carteira)}</td>
                </tr>
              ))}
            </tbody>
            {resultadoDesc.length > 1 && (
              <tfoot>
                <tr className="total">
                  <td>12 meses</td>
                  <td className="num">{n0(totR.ganhos)}</td>
                  <td className="num">{n0(totR.perdidos)}</td>
                  <td className="num">{n0(totR.contas_novas)}</td>
                  <td className="num">{n0(totR.ativados)}</td>
                  <td className="num">{n0(totR.reativados)}</td>
                  <td className="num">{r0(totR.receita_total)}</td>
                  <td className="num col-p2">{r0(totR.receita_novos)}</td>
                  <td className="num col-p2">{r0(totR.receita_ativados)}</td>
                  <td className="num col-p2">{r0(totR.receita_reativados)}</td>
                  <td className="num col-p3">{r0(totR.receita_carteira)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Panel>

      <Panel title="O que aconteceu com os leads de cada mês" subtitle={`Cada coluna é o mês em que o lead entrou; os números contam o que aconteceu com ele até hoje. De ${mesCurto(meses[0])} a ${mesCurto(mesRef)}.`}>
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead><tr><th className="sticky-col min-w-[240px]">Indicador</th>{meses.map((x, i) => <th key={x} className={cn('num', colMes(i), x === mesRef && 'text-fg')}>{mesCurto(x)}</th>)}<th className="num">12 m</th></tr></thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.label}>
                  <td className={cn('sticky-col', l.destaque === 'sub' && 'pl-6 text-fg-muted', l.destaque === 'bold' && 'font-semibold', l.destaque === 'gain' && 'text-gain', l.destaque === 'loss' && 'text-loss')}>{l.label}</td>
                  {meses.map((x, i) => { const v = l.valor(s.get(x)); return <td key={x} className={cn('num', colMes(i), !v && 'subtle', x === mesRef && 'bg-surface-2', l.destaque === 'gain' && v && 'text-gain', l.destaque === 'loss' && v && 'text-loss')}>{l.fmt(v)}</td> })}
                  <td className="num font-semibold">{l.total == null ? '' : l.fmt(l.total)}</td>
                </tr>
              ))}
              <tr>
                <td className="sticky-col">Tempo médio até fechar (dias)</td>
                {meses.map((x, i) => { const v = m.get(x)?.dias_fechar ?? null; return <td key={x} className={cn('num', colMes(i), !v && 'subtle', x === mesRef && 'bg-surface-2')}>{v == null ? TRACO : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td> })}
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}
