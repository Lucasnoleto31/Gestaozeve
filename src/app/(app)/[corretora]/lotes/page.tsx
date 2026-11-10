export const dynamic = 'force-dynamic'

import { contexto, periodoDaUrl, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { ultimaData } from '@/lib/gestao/consultas'
import { diasEntre, ehIso } from '@/lib/gestao/meses'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { PeriodoPicker } from '@/components/gestao/Filtros'
import { Abas } from '@/components/gestao/Abas'
import { dataCurta } from '@/components/gestao/Celulas'
import { BotaoWhatsApp } from './BotaoWhatsApp'
import { AbaAgora } from './AbaAgora'
import { AbaPeriodo } from './AbaPeriodo'
import { AbaDiaADia } from './AbaDiaADia'
import { diaCurto, momentoDoUltimoDia } from './comum'

const ABAS = [
  { valor: 'agora', label: 'Agora' },
  { valor: 'periodo', label: 'Período' },
  { valor: 'dias', label: 'Dia a dia' },
]

// O Giro diário em três abas, uma pergunta por aba: Agora (como foi o último dia lançado e como estão
// a semana e o mês), Período (o giro está subindo ou caindo) e Dia a dia (a tabela de cada dia, que abre
// as operações). Cada aba carrega só as consultas dela; o período escolhido vale para as duas últimas.
export default async function GiroDiarioPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { corretora, q } = ctx
  const aba = ABAS.some(a => a.valor === q.aba) ? q.aba : 'agora'
  const { inicio, fim } = periodoDaUrl(q, 90)
  const duracao = diasEntre(inicio, fim) + 1
  const ultima = await ultimaData(corretora)
  // em que ponto do dia está o último lançamento: corre junto com as consultas da aba
  const momento = momentoDoUltimoDia(corretora, ultima)
  const comPeriodo = aba !== 'agora'
  const descricao: Record<string, string> = {
    agora: ultima
      ? `O último dia lançado (${diaCurto(ultima)}), a semana e o mês dele, contra a semana e o mês anteriores no mesmo ponto.`
      : 'O último dia lançado, a semana e o mês dele.',
    periodo: `O giro de ${dataCurta(inicio)} a ${dataCurta(fim)}: total, média por dia e tendência, contra os ${duracao} dias anteriores.`,
    dias: `Cada dia com giro de ${dataCurta(inicio)} a ${dataCurta(fim)}.`,
  }

  return (
    <>
      <PageHeader
        eyebrow={ctx.eyebrow}
        title="Giro diário"
        description={descricao[aba]}
        actions={<>{ultima && <BotaoWhatsApp corretora={corretora} dia={ultima} />}{comPeriodo && <PeriodoPicker inicio={inicio} fim={fim} />}</>}
      >
        <Abas caminho={`${ctx.base}/lotes`} query={{ inicio: ehIso(q.inicio) ? q.inicio : null, fim: ehIso(q.fim) ? q.fim : null }}
          valor={aba} opcoes={ABAS} padrao="agora" rotulo="Seções do giro diário" />
      </PageHeader>
      <PageBody>
        {aba === 'agora' && <AbaAgora ctx={ctx} ultima={ultima} momento={momento} />}
        {aba === 'periodo' && <AbaPeriodo ctx={ctx} inicio={inicio} fim={fim} ultima={ultima} momento={momento} />}
        {aba === 'dias' && <AbaDiaADia ctx={ctx} inicio={inicio} fim={fim} ultima={ultima} momento={momento} />}
      </PageBody>
    </>
  )
}
