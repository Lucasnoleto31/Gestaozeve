// Giro diário › Agora: o último dia lançado, a semana e o mês dele, contra a semana e o mês
// anteriores no mesmo ponto, e quem mais girou no dia.
import Link from 'next/link'
import type { Contexto } from '@/lib/gestao/pagina'
import { diario, topClientes } from '@/lib/gestao/consultas'
import { situacaoAtual } from '@/lib/gestao/giro'
import { diaSemanaCurto } from '@/lib/gestao/mensagens'
import { mesCurto, somarMeses } from '@/lib/gestao/meses'
import { MESES_LONGOS, fmtNum, fmtPct } from '@/lib/format'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { BarraCelula, LinhaVazia, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { ddmm, diaCurto, ehParcial, porLote } from './comum'

const TOP = 8
const inteiro = (v: number) => fmtNum(Math.round(v))

export async function AbaAgora({ ctx, ultima, momento: momentoP }: { ctx: Contexto; ultima: string | null; momento: Promise<string | null> }) {
  if (!ultima) {
    await momentoP
    return (
      <Panel title="Sem lotes lançados">
        <p className="text-dense text-fg-muted">Nenhum lote lançado ainda nesta corretora. O giro aparece aqui depois da primeira importação.</p>
      </Panel>
    )
  }
  const mes = `${ultima.slice(0, 7)}-01`
  const [dias, top, momento] = await Promise.all([
    diario(ctx.corretora, somarMeses(mes, -1), ultima),
    topClientes(ctx.corretora, ultima, ultima, null, TOP),
    momentoP,
  ])
  const s = situacaoAtual(dias, ultima)
  const { dia, semana, mes: m, mesAnterior: ant } = s
  const parcial = ehParcial(momento)
  const nomeMes = MESES_LONGOS[Number(ultima.slice(5, 7)) - 1]
  // só compara com o mês anterior quando ele tem pelo menos os mesmos dias com giro
  const mesmoPonto = ant && ant.diasNoPonto === m.dias.length && ant.noMesmoPonto > 0 ? ant.noMesmoPonto : null
  // (a chave não pode se chamar "ref": o recharts espalha cada linha de dados nas barras)
  const dadosGrafico = m.dias.map(d => ({ label: ddmm(d.dia), lotes: d.lotes, ...(ant ? { mediaAnt: Math.round(ant.media) } : {}) }))

  return (
    <>
      <KpiRow cols={6}>
        <KpiCard destaque label={`Lotes em ${diaCurto(ultima)}`} value={fmtNum(dia?.lotes ?? 0)}
          delta={dia && m.dias.length > 1 ? { atual: dia.lotes, anterior: m.media, rotulo: 'vs média do mês', fmt: inteiro, neutro: parcial } : null}
          sub={`${parcial ? `${momento} · ` : ''}${fmtNum(dia?.operacoes ?? 0)} operações`} />
        <KpiCard label="Lotes na semana" value={fmtNum(semana.lotes)}
          delta={semana.anterior ? { atual: semana.lotes, anterior: semana.anterior, rotulo: `vs semana passada até ${diaSemanaCurto(ultima)}`, fmt: inteiro, neutro: parcial } : null}
          sub={`desde ${diaCurto(semana.inicio)}`} />
        <KpiCard label="Lotes no mês" value={fmtNum(m.lotes)}
          delta={mesmoPonto ? { atual: m.lotes, anterior: mesmoPonto, rotulo: `vs ${mesCurto(ant!.mes)} em ${m.dias.length} ${m.dias.length === 1 ? 'dia' : 'dias'}`, fmt: inteiro, neutro: parcial } : null}
          sub={`até ${ddmm(ultima)}`} />
        <KpiCard label="Receita no mês" value={rCurto(m.receita)} sub={`${porLote(m.receita, m.lotes)} R$/lote · ${fmtNum(m.zerados)} zerados`} />
        <KpiCard label="Média por dia no mês" value={inteiro(m.media)}
          delta={ant ? { atual: m.media, anterior: ant.media, rotulo: `vs ${mesCurto(ant.mes)}`, fmt: inteiro, neutro: parcial } : null}
          sub={`${m.dias.length} ${m.dias.length === 1 ? 'dia' : 'dias'} com giro`} />
        <KpiCard label="Clientes com giro" value={fmtNum(dia?.clientes ?? 0)} sub={`em ${ddmm(ultima)} · máximo no mês ${fmtNum(m.clientesMax)}`} />
      </KpiRow>

      <div className="grid gap-8 xl:grid-cols-2">
        <Panel title={`Os dias de ${nomeMes}`}
          subtitle={`Barras = lotes de cada dia com giro${ant ? ` · linha = média por dia de ${mesCurto(ant.mes)} (${inteiro(ant.media)})` : ''}${m.melhor ? ` · maior dia ${fmtNum(m.melhor.lotes)} em ${ddmm(m.melhor.dia)}` : ''}.`}>
          <GraficoSeries
            dados={dadosGrafico}
            series={[{ key: 'lotes', nome: 'Lotes do dia', tipo: 'bar' }, ...(ant ? [{ key: 'mediaAnt', nome: `Média por dia de ${mesCurto(ant.mes)}`, tipo: 'line' as const }] : [])]}
            altura={280} legenda={false}
          />
        </Panel>

        <Panel title={`Quem mais girou em ${ddmm(ultima)}`}
          subtitle={`Os ${TOP} maiores giros do dia${parcial ? ` (${momento})` : ''} e a fatia de cada um.`}
          action={<Link href={`${ctx.base}/lotes/${ultima}`} className="link text-dense">Operações do dia</Link>}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead><tr><th>Cliente</th><th className="num">Lotes</th><th className="num col-p2">Receita</th><th className="num">% do dia</th></tr></thead>
              <tbody>
                {top.length === 0 && <LinhaVazia colunas={4}>Sem lotes no dia.</LinhaVazia>}
                {top.map((c, i) => (
                  <tr key={`${c.cliente_id ?? c.cliente_nome}-${i}`}>
                    <td className="max-w-[280px] truncate">
                      {c.cliente_id
                        ? <Link href={`${ctx.base}/clientes/${c.cliente_id}`} className="link">{c.cliente_nome}</Link>
                        : <span className="text-warn" title="Conta não cadastrada">{c.cliente_nome}</span>}
                    </td>
                    <td className="num"><BarraCelula valor={c.lotes} max={top[0]?.lotes ?? 0} largura={56} /></td>
                    <td className="num col-p2">{r0(c.receita)}</td>
                    <td className="num">{fmtPct(c.pct_lotes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  )
}
