// Funil › Calendário: o mês dia a dia. Em cada dia, quantos leads foram ganhos, quantos foram perdidos e
// quantos clientes pararam de girar; clicar no dia abre a lista (Lucas, 17/11/2026). Os ganhos e os perdidos
// usam o mesmo critério dos cartões da aba Mês (data de fechamento do lead), então os totais são os mesmos.
// "Parou de girar" = o último dia em que o cliente operou, para quem não voltou e já está há pelo menos N
// pregões sem operar (1, 3 ou 5, no seletor). Nada saiu de outra aba: o gráfico "Ganhos por dia" da aba Mês
// continua lá.
import { CORRETORA_LABEL, type Corretora } from '@/lib/corretoras'
import { clientesQuePararam, leadsFechados } from '@/lib/gestao/consultasCalendario'
import { diasDoCalendario, doMes } from '@/lib/gestao/calendario'
import { variacaoMensal } from '@/lib/gestao/projecao'
import { mesAtual, mesCurto, mesLongo, somarMeses } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum } from '@/lib/format'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Resumo } from '@/components/gestao/Resumo'
import { SegParam } from '@/components/gestao/Filtros'
import { CalendarioDoMes } from './CalendarioDoMes'

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const plural = (n: number, um: string, varios: string) => `${fmtNum(n)} ${n === 1 ? um : varios}`

export async function AbaCalendario({ mesRef, corretoras, minimo }: { mesRef: string; corretoras: Corretora[]; minimo: number }) {
  const hoje = fmtDate(hojeBrasil())
  const anterior = somarMeses(mesRef, -1)
  // o mês e o anterior saem das mesmas leituras: o anterior é a comparação dos cartões
  const [fechados, parou] = await Promise.all([leadsFechados(anterior, mesRef), clientesQuePararam(corretoras, anterior, hoje, minimo)])
  const ganhos = doMes(fechados.ganhos, mesRef), perdidos = doMes(fechados.perdidos, mesRef), parados = doMes(parou.parados, mesRef)
  const antes = { ganhos: doMes(fechados.ganhos, anterior).length, perdidos: doMes(fechados.perdidos, anterior).length, parados: doMes(parou.parados, anterior).length }
  const dias = diasDoCalendario(mesRef, ganhos, perdidos, parados)
  const parcial = mesRef >= mesAtual()
  const mes = mesCurto(mesRef)
  const pregoes = minimo === 1 ? '1 pregão' : `${minimo} pregões`
  const lancados = parou.ultimas.filter(u => u.dia).map(u => `${CORRETORA_LABEL[u.corretora]} até ${ddmm(u.dia as string)}`).join(' · ')

  return (
    <>
      <Resumo
        frase={`Em ${mesLongo(mesRef)}${parcial ? ', até hoje' : ''}: ${plural(ganhos.length, 'lead ganho', 'leads ganhos')}, ${plural(perdidos.length, 'perdido', 'perdidos')} e ${plural(parados.length, 'cliente parou de girar e não voltou', 'clientes pararam de girar e não voltaram')}.`}
        nota={lancados ? `Lotes lançados: ${lancados}.` : undefined} />

      <KpiRow cols={3}>
        <KpiCard label={`Ganhos em ${mes}`} value={fmtNum(ganhos.length)} delta={variacaoMensal(ganhos.length, antes.ganhos || null, anterior, parcial, fmtNum)}
          dica="Leads fechados como Ganho, pela data de fechamento. É o mesmo número do cartão Ganhos da aba Mês." />
        <KpiCard label={`Perdidos em ${mes}`} value={fmtNum(perdidos.length)} delta={{ ...variacaoMensal(perdidos.length, antes.perdidos || null, anterior, parcial, fmtNum), menorMelhor: true }}
          dica="Leads fechados como Perdido, pela data de fechamento. É o mesmo número do cartão Perdidos da aba Mês." />
        <KpiCard label={`Pararam de girar em ${mes}`} value={fmtNum(parados.length)} delta={{ ...variacaoMensal(parados.length, antes.parados || null, anterior, parcial, fmtNum), menorMelhor: true }}
          dica={`Clientes que operaram pela última vez em um dia do mês e não voltaram. Só entra quem já está há pelo menos ${pregoes} sem operar (pregão = dia com lote lançado na corretora).`} />
      </KpiRow>

      <Panel title={`${mesLongo(mesRef)} dia a dia`} subtitle="Clique em um dia para ver quem foi ganho, quem foi perdido e quem parou de girar."
        action={<>
          <span className="label">Parado há pelo menos</span>
          <SegParam param="parado" valor={String(minimo)} opcoes={[{ valor: '1', label: '1 pregão' }, { valor: '3', label: '3' }, { valor: '5', label: '5' }]} />
        </>}>
        <CalendarioDoMes mes={mesRef} hoje={hoje} dias={dias} ganhos={ganhos} perdidos={perdidos} parados={parados} />
      </Panel>
    </>
  )
}
