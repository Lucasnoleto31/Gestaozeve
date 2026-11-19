// Giro diário › Período: o total, a média por dia e a tendência de um período, contra o período
// anterior de mesma duração.
// No celular (DESIGN.md §8) a aba abre pela frase (quanto girou contra o período anterior e o ritmo dentro
// do período) e ficam quatro números; "Vs período anterior", "Tendência" e as duas metades descem para
// "Mais números do período", com os mesmos nomes. O computador não muda.
import type { Contexto } from '@/lib/gestao/pagina'
import { diario } from '@/lib/gestao/consultas'
import { LIMIAR_TENDENCIA, MEDIA_MOVEL, resumoPeriodo, serieDoPeriodo } from '@/lib/gestao/giro'
import { diaSemanaCurto } from '@/lib/gestao/mensagens'
import { diasEntre, somarDias } from '@/lib/gestao/meses'
import { fmtDelta, fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Recolhido } from '@/components/ui/Recolhido'
import { TRACO, dataCurta, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { Resumo } from '@/components/gestao/Resumo'
import { LinhaNumero } from './LinhaNumero'
import { ddmm, ehParcial, porLote } from './comum'
import { frasePeriodo } from './frases'

const inteiro = (v: number) => fmtNum(Math.round(v))

export async function AbaPeriodo({ ctx, inicio, fim, ultima, momento: momentoP }: { ctx: Contexto; inicio: string; fim: string; ultima: string | null; momento: Promise<string | null> }) {
  const duracao = diasEntre(inicio, fim) + 1
  const antFim = somarDias(inicio, -1), antIni = somarDias(antFim, -(duracao - 1))
  const [dias, anterior, momento] = await Promise.all([diario(ctx.corretora, inicio, fim), diario(ctx.corretora, antIni, antFim), momentoP])
  const r = resumoPeriodo(dias)
  const serie = serieDoPeriodo(dias)
  const lotesAnt = anterior.reduce((s, d) => s + d.lotes, 0)
  const varAnterior = lotesAnt ? ((r.lotes - lotesAnt) / lotesAnt) * 100 : null
  const tom = r.tendencia === 'Subindo' ? 'gain' : r.tendencia === 'Caindo' ? 'loss' : 'neutral'
  const inclinacao = `${r.inclinacao >= 0 ? '+' : '−'}${Math.abs(r.inclinacao).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`
  // o último dia lançado ainda está correndo e entra no período
  const comParcial = ehParcial(momento) && ultima != null && dias.some(d => d.dia === ultima)

  if (dias.length === 0) {
    return (
      <Panel title="Sem lotes no período">
        <p className="text-dense text-fg-muted">Nenhum lote lançado de {dataCurta(inicio)} a {dataCurta(fim)}{ultima ? `. O último dia lançado é ${dataCurta(ultima)}` : ''}. Escolha outro período acima.</p>
      </Panel>
    )
  }

  // os mesmos textos servem ao cartão (computador) e à linha de "Mais números do período" (celular)
  const anteriorTexto = lotesAnt ? `${fmtNum(lotesAnt)} lotes em ${anterior.length} dias, de ${dataCurta(antIni)} a ${dataCurta(antFim)}` : `sem lotes de ${dataCurta(antIni)} a ${dataCurta(antFim)}`
  const inclinacaoTexto = `${inclinacao} lotes por dia a cada dia com giro`
  const comoATendencia = `A tendência sai de uma reta sobre os lotes de cada dia com giro: sobe ou cai quando a reta anda mais de ${fmtPct(LIMIAR_TENDENCIA * 100, 0)} da média.`
  const corDaVariacao = (v: number | null) => (v == null ? undefined : v > 0.05 ? 'text-gain' : v < -0.05 ? 'text-loss' : undefined)
  const fr = frasePeriodo({ inicio, fim, duracao, lotes: r.lotes, lotesAnteriores: lotesAnt, tendencia: r.tendencia, media: r.media })

  return (
    <>
      {/* Celular: a conclusão do período antes dos números */}
      <div className="md:hidden">
        <Resumo frase={fr.frase} apoio={fr.apoio} nota={comParcial ? `${ddmm(ultima!)} ainda é ${momento}` : undefined} />
      </div>

      <div>
        <KpiRow cols={6}>
          <KpiCard destaque label="Lotes no período" value={fmtNum(r.lotes)}
            sub={<>
              <span className="max-md:hidden">{`${r.dias} dias com giro em ${duracao} · ${fmtNum(r.zerados)} zerados`}</span>
              {/* celular: a comparação mora aqui (o cartão "Vs período anterior" desce para "Mais números do período") */}
              <span className="md:hidden">
                {varAnterior == null ? 'sem base de comparação' : <><span className="font-semibold text-bg">{fmtDelta(varAnterior)}</span> vs {duracao === 1 ? 'o dia anterior' : `os ${fmtNum(duracao)} dias anteriores`}</>}
              </span>
            </>} />
          <KpiCard label="Média por dia" value={inteiro(r.media)} sub={r.melhor ? `maior dia ${fmtNum(r.melhor.lotes)} em ${dataCurta(r.melhor.dia)} (${diaSemanaCurto(r.melhor.dia)})` : undefined} />
          <KpiCard label="Receita no período" value={rCurto(r.receita)} sub={`${porLote(r.receita, r.lotes)} R$/lote`} />
          <KpiCard className="max-md:hidden!" label="Vs período anterior" value={varAnterior == null ? TRACO : fmtDelta(varAnterior)} tone={varAnterior == null ? 'neutral' : varAnterior >= 0 ? 'gain' : 'loss'}
            sub={anteriorTexto} />
          <KpiCard className="max-md:hidden!" label="Tendência" value={r.tendencia} tone={tom} sub={inclinacaoTexto} />
          <KpiCard label="Clientes por dia" value={inteiro(r.clientesMedia)} sub={`máximo ${fmtNum(r.clientesMax)} em um dia · ${fmtNum(r.operacoes)} operações`} />
        </KpiRow>
        <Recolhido tamanho="linha" titulo="Mais números do período" className="md:hidden">
          <LinhaNumero rotulo="Vs período anterior" valor={varAnterior == null ? TRACO : fmtDelta(varAnterior)} apoio={anteriorTexto}
            className={varAnterior == null ? undefined : varAnterior >= 0 ? 'text-gain' : 'text-loss'} />
          <LinhaNumero rotulo="Tendência" valor={r.tendencia} apoio={inclinacaoTexto} dica={comoATendencia}
            className={tom === 'gain' ? 'text-gain' : tom === 'loss' ? 'text-loss' : undefined} />
          <LinhaNumero rotulo="1ª metade" valor={inteiro(r.metade1.media)} apoio={`lotes por dia · ${r.metade1.dias} dias com giro`} />
          <LinhaNumero rotulo="2ª metade" valor={inteiro(r.metade2.media)} apoio={`lotes por dia · ${r.metade2.dias} dias com giro`} />
          <LinhaNumero rotulo="Variação" valor={r.varMetades == null ? TRACO : fmtDelta(r.varMetades)} apoio="da 2ª metade sobre a 1ª" className={corDaVariacao(r.varMetades)} />
          <LinhaNumero rotulo="Dias com giro" valor={fmtNum(r.dias)} apoio={`em ${fmtNum(duracao)} dias do período`} />
          <LinhaNumero rotulo="Zerados" valor={fmtNum(r.zerados)} apoio="no período" />
        </Recolhido>
      </div>

      {/* celular: a legenda fica uma vez só, embaixo do gráfico */}
      <Panel title="Lotes por dia com giro" subtitle={<span className="max-md:hidden">{`Barras = lotes do dia · linha = média móvel de ${MEDIA_MOVEL} dias${comParcial ? ` · ${ddmm(ultima!)} ainda é ${momento}` : ''}.`}</span>}>
        <GraficoSeries
          dados={serie.map(d => ({ label: ddmm(d.dia), lotes: d.lotes, mm: Math.round(d.mm) }))}
          series={[{ key: 'lotes', nome: 'Lotes operados', tipo: 'bar' }, { key: 'mm', nome: `Média móvel (${MEDIA_MOVEL})`, tipo: 'line' }]}
          altura={300}
        />
      </Panel>

      <Panel className="max-md:hidden" title="As duas metades do período" subtitle={comoATendencia}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-5">
          <Numero rotulo="1ª metade" valor={inteiro(r.metade1.media)} nota={`lotes por dia · ${r.metade1.dias} dias com giro`} />
          <Numero rotulo="2ª metade" valor={inteiro(r.metade2.media)} nota={`lotes por dia · ${r.metade2.dias} dias com giro`} />
          <Numero rotulo="Variação" valor={r.varMetades == null ? TRACO : fmtDelta(r.varMetades)} nota="da 2ª metade sobre a 1ª" className={corDaVariacao(r.varMetades)} />
          <Numero rotulo="Melhor dia" valor={r.melhor ? fmtNum(r.melhor.lotes) : TRACO} nota={r.melhor ? `${dataCurta(r.melhor.dia)} (${diaSemanaCurto(r.melhor.dia)})` : undefined} />
          <Numero rotulo="Receita" valor={r0(r.receita)} nota={`${fmtNum(r.operacoes)} linhas de operação`} />
        </dl>
      </Panel>
    </>
  )
}

function Numero({ rotulo, valor, nota, className }: { rotulo: string; valor: string; nota?: string; className?: string }) {
  return (
    <div className="min-w-0">
      <dt className="label">{rotulo}</dt>
      <dd className={cn('mt-1 text-section font-semibold tabular-nums', className)}>{valor}</dd>
      {nota && <p className="text-micro text-fg-subtle">{nota}</p>}
    </div>
  )
}
