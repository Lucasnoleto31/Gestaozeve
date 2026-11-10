// Giro diário › Período: o total, a média por dia e a tendência de um período, contra o período
// anterior de mesma duração.
import type { Contexto } from '@/lib/gestao/pagina'
import { diario } from '@/lib/gestao/consultas'
import { LIMIAR_TENDENCIA, MEDIA_MOVEL, resumoPeriodo, serieDoPeriodo } from '@/lib/gestao/giro'
import { diaSemanaCurto } from '@/lib/gestao/mensagens'
import { diasEntre, somarDias } from '@/lib/gestao/meses'
import { fmtDelta, fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { TRACO, dataCurta, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { ddmm, ehParcial, porLote } from './comum'

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

  return (
    <>
      <KpiRow cols={6}>
        <KpiCard destaque label="Lotes no período" value={fmtNum(r.lotes)} sub={`${r.dias} dias com giro em ${duracao} · ${fmtNum(r.zerados)} zerados`} />
        <KpiCard label="Média por dia" value={inteiro(r.media)} sub={r.melhor ? `maior dia ${fmtNum(r.melhor.lotes)} em ${dataCurta(r.melhor.dia)} (${diaSemanaCurto(r.melhor.dia)})` : undefined} />
        <KpiCard label="Receita no período" value={rCurto(r.receita)} sub={`${porLote(r.receita, r.lotes)} R$/lote`} />
        <KpiCard label="Vs período anterior" value={varAnterior == null ? TRACO : fmtDelta(varAnterior)} tone={varAnterior == null ? 'neutral' : varAnterior >= 0 ? 'gain' : 'loss'}
          sub={lotesAnt ? `${fmtNum(lotesAnt)} lotes em ${anterior.length} dias, de ${dataCurta(antIni)} a ${dataCurta(antFim)}` : `sem lotes de ${dataCurta(antIni)} a ${dataCurta(antFim)}`} />
        <KpiCard label="Tendência" value={r.tendencia} tone={tom} sub={`${inclinacao} lotes por dia a cada dia com giro`} />
        <KpiCard label="Clientes por dia" value={inteiro(r.clientesMedia)} sub={`máximo ${fmtNum(r.clientesMax)} em um dia · ${fmtNum(r.operacoes)} operações`} />
      </KpiRow>

      <Panel title="Lotes por dia com giro" subtitle={`Barras = lotes do dia · linha = média móvel de ${MEDIA_MOVEL} dias${comParcial ? ` · ${ddmm(ultima!)} ainda é ${momento}` : ''}.`}>
        <GraficoSeries
          dados={serie.map(d => ({ label: ddmm(d.dia), lotes: d.lotes, mm: Math.round(d.mm) }))}
          series={[{ key: 'lotes', nome: 'Lotes operados', tipo: 'bar' }, { key: 'mm', nome: `Média móvel (${MEDIA_MOVEL})`, tipo: 'line' }]}
          altura={300}
        />
      </Panel>

      <Panel title="As duas metades do período"
        subtitle={`A tendência sai de uma reta sobre os lotes de cada dia com giro: sobe ou cai quando a reta anda mais de ${fmtPct(LIMIAR_TENDENCIA * 100, 0)} da média.`}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-5">
          <Numero rotulo="1ª metade" valor={inteiro(r.metade1.media)} nota={`lotes por dia · ${r.metade1.dias} dias com giro`} />
          <Numero rotulo="2ª metade" valor={inteiro(r.metade2.media)} nota={`lotes por dia · ${r.metade2.dias} dias com giro`} />
          <Numero rotulo="Variação" valor={r.varMetades == null ? TRACO : fmtDelta(r.varMetades)} nota="da 2ª metade sobre a 1ª"
            className={r.varMetades == null ? undefined : r.varMetades > 0.05 ? 'text-gain' : r.varMetades < -0.05 ? 'text-loss' : undefined} />
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
