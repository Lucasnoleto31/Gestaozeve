// Giro diário › Agora: o último dia lançado, a semana e o mês dele, contra a semana e o mês
// anteriores no mesmo ponto, e quem mais girou no dia.
// No celular (DESIGN.md §8) a aba abre pela frase com a conclusão do dia; ficam quatro números (os outros
// dois e o maior dia vão para "Mais números do mês"), a lista de quem mais girou vem antes do gráfico e
// cada cliente é um item que abre a ficha. O computador não muda.
import Link from 'next/link'
import type { Contexto } from '@/lib/gestao/pagina'
import { diario, topClientes } from '@/lib/gestao/consultas'
import { situacaoAtual } from '@/lib/gestao/giro'
import { diaSemanaCurto } from '@/lib/gestao/mensagens'
import { mesCurto, somarMeses } from '@/lib/gestao/meses'
import { MESES_LONGOS, fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DeltaPill, KpiCard, KpiRow, type KpiDelta } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Recolhido } from '@/components/ui/Recolhido'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { BarraCelula, LinhaVazia, TRACO, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { Resumo } from '@/components/gestao/Resumo'
import { BotaoWhatsApp } from './BotaoWhatsApp'
import { LinhaNumero } from './LinhaNumero'
import { ddmm, diaCurto, ehParcial, porLote } from './comum'
import { fraseAgora } from './frases'

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
  const diasComGiro = `${m.dias.length} ${m.dias.length === 1 ? 'dia' : 'dias'} com giro`
  const deltaMedia: KpiDelta | null = ant ? { atual: m.media, anterior: ant.media, rotulo: `vs ${mesCurto(ant.mes)}`, fmt: inteiro, neutro: parcial } : null
  const clientesNoDia = `em ${ddmm(ultima)} · máximo no mês ${fmtNum(m.clientesMax)}`
  // a frase sai dos mesmos valores e das mesmas condições dos cartões (sem média, sem semana passada…)
  const fr = fraseAgora({
    ultima, lotes: dia?.lotes ?? 0, mediaDoMes: dia && m.dias.length > 1 ? m.media : null,
    semana: { lotes: semana.lotes, anterior: semana.anterior }, mes: { lotes: m.lotes, noMesmoPonto: mesmoPonto }, parcial,
  })

  return (
    <>
      {/* Celular: a conclusão do dia e, logo abaixo, o WhatsApp (que no computador fica no cabeçalho) */}
      <div className="space-y-3 md:hidden">
        <Resumo frase={fr.frase} apoio={fr.apoio} nota={parcial ? momento : undefined} />
        <BotaoWhatsApp corretora={ctx.corretora} dia={ultima} />
      </div>

      <div>
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
          {/* no celular ficam quatro números à vista: estes dois descem para "Mais números do mês" */}
          <KpiCard className="max-md:hidden!" label="Média por dia no mês" value={inteiro(m.media)} delta={deltaMedia} sub={diasComGiro} />
          <KpiCard className="max-md:hidden!" label="Clientes com giro" value={fmtNum(dia?.clientes ?? 0)} sub={clientesNoDia} />
        </KpiRow>
        <Recolhido tamanho="linha" titulo="Mais números do mês" className="md:hidden">
          <LinhaNumero rotulo="Média por dia no mês" valor={inteiro(m.media)} apoio={<>{deltaMedia && <><DeltaPill delta={deltaMedia} /> · </>}{diasComGiro}</>} />
          <LinhaNumero rotulo="Clientes com giro" valor={fmtNum(dia?.clientes ?? 0)} apoio={clientesNoDia} />
          {m.melhor && <LinhaNumero rotulo="Maior dia do mês" valor={fmtNum(m.melhor.lotes)} apoio={`em ${diaCurto(m.melhor.dia)}`} />}
        </Recolhido>
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        {/* celular: quem mais girou vem antes do gráfico, e a legenda comprida vira uma linha curta */}
        <Panel className="max-md:order-2" title={`Os dias de ${nomeMes}`}
          subtitle={<>
            <span className="max-md:hidden">{`Barras = lotes de cada dia com giro${ant ? ` · linha = média por dia de ${mesCurto(ant.mes)} (${inteiro(ant.media)})` : ''}${m.melhor ? ` · maior dia ${fmtNum(m.melhor.lotes)} em ${ddmm(m.melhor.dia)}` : ''}.`}</span>
            {ant && <span className="md:hidden">A linha é a média por dia de {mesCurto(ant.mes)}: {inteiro(ant.media)}.</span>}
          </>}>
          <GraficoSeries
            dados={dadosGrafico}
            series={[{ key: 'lotes', nome: 'Lotes do dia', tipo: 'bar' }, ...(ant ? [{ key: 'mediaAnt', nome: `Média por dia de ${mesCurto(ant.mes)}`, tipo: 'line' as const }] : [])]}
            altura={280} legenda={false}
          />
        </Panel>

        <Panel title={`Quem mais girou em ${ddmm(ultima)}`}
          subtitle={<span className="max-md:hidden">{`Os ${TOP} maiores giros do dia${parcial ? ` (${momento})` : ''} e a fatia de cada um.`}</span>}
          action={<Link href={`${ctx.base}/lotes/${ultima}`} className="link text-dense max-md:hidden">Operações do dia</Link>}>
          <div className="tbl-wrap">
            {/* celular: cada cliente é um item (nome inteiro e lotes à direita; embaixo, a receita e a fatia do dia) e a linha abre a ficha */}
            <table className="tbl tbl-dense tbl-lista lista-abre">
              <thead><tr><th>Cliente</th><th className="num">Lotes</th><th className="num col-p2">Receita</th><th className="num">% do dia</th></tr></thead>
              <tbody>
                {top.length === 0 && <LinhaVazia colunas={4}>Sem lotes no dia.</LinhaVazia>}
                {top.map((c, i) => (
                  // conta sem cadastro não tem ficha para abrir: no celular a linha fica sem a seta
                  <tr key={`${c.cliente_id ?? c.cliente_nome}-${i}`} className={c.cliente_id ? undefined : 'sem-seta'}>
                    <td className="cel-titulo max-w-[280px] truncate">
                      {c.cliente_id
                        ? <Link href={`${ctx.base}/clientes/${c.cliente_id}`} className="link">{c.cliente_nome}</Link>
                        : <><span className="text-warn" title="Conta não cadastrada">{c.cliente_nome}</span><span className="block text-label font-normal text-warn md:hidden">conta não cadastrada</span></>}
                    </td>
                    <td className="num cel-valor" data-rotulo="lotes"><BarraCelula valor={c.lotes} max={top[0]?.lotes ?? 0} largura={56} className="max-md:[&>span:first-child]:hidden" /></td>
                    {/* celular: sem o cabeçalho "Receita", o traço sozinho parece dado faltando; ali diz em palavras */}
                    <td className="num col-p2 cel-sub">{c.receita ? r0(c.receita) : <><span className="max-md:hidden">{TRACO}</span><span className="md:hidden">sem receita</span></>}</td>
                    <td className="num cel-sub">{fmtPct(c.pct_lotes)}<span className="md:hidden"> dos lotes do dia</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* celular: o atalho para as operações do dia vira um botão no fim da lista */}
          <Link href={`${ctx.base}/lotes/${ultima}`} className={cn(buttonClasses('secondary', 'md'), 'mt-3 w-full max-md:min-h-[44px] md:hidden')}>Operações do dia</Link>
        </Panel>
      </div>
    </>
  )
}
