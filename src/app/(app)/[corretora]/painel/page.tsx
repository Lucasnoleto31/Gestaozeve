export const dynamic = 'force-dynamic'

import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { mesLongo } from '@/lib/gestao/meses'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { MesPicker } from '@/components/gestao/Filtros'
import { Abas } from '@/components/gestao/Abas'
import { AbaResumo } from './AbaResumo'
import { AbaMeses } from './AbaMeses'
import { AbaClientes } from './AbaClientes'
import { PARAM_CUSTOS, semCustosNaUrl } from './ChaveCustos'

const ABAS = [
  { valor: 'resumo', label: 'Resumo' },
  { valor: 'meses', label: 'Mês a mês' },
  { valor: 'clientes', label: 'Clientes' },
]

// O Painel em três abas, uma pergunta por aba (Lucas, 16/11/2026: a página única "virou uma bagunça"):
// Resumo (como está o mês: seis números, a conta do mês em poucas linhas, o que pede atenção e onde o mês
// deve fechar), Mês a mês (como evoluiu: gráfico e a tabela por blocos, com a conta completa do fechamento
// em "todas as linhas") e Clientes (como está a base: status, quem cuida, risco, plataformas e quem mais
// gira). Cada aba carrega só as consultas dela; o mês escolhido vale para as três.
export default async function PainelPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const aba = ABAS.some(a => a.valor === ctx.q.aba) ? ctx.q.aba : 'resumo'
  const mes = `${mesLongo(ctx.mesRef)}${ctx.mesEscolhido ? '' : ' (último mês com lotes)'}`
  const descricao: Record<string, string> = {
    resumo: `Como está ${mes}: o que entrou, o que ficou para o escritório e o que pede atenção.`,
    meses: `Como evoluiu até ${mes}: base, giro e dinheiro, mês a mês.`,
    clientes: `A base de clientes em ${mes}: status, quem cuida, quem está em risco e quem mais gira.`,
  }

  return (
    <>
      <PageHeader eyebrow={ctx.eyebrow} title="Painel" description={descricao[aba]} actions={<MesPicker valor={ctx.mesRef} />}>
        {/* a escolha "sem custos" (ChaveCustos, nas abas Resumo e Mês a mês) segue de uma aba para a outra */}
        <Abas caminho={`${ctx.base}/painel`} query={{ mes: ctx.mesEscolhido ? ctx.mesRef.slice(0, 7) : null, [PARAM_CUSTOS]: semCustosNaUrl(ctx.q) ? 'sem' : null }} valor={aba} opcoes={ABAS} padrao="resumo" rotulo="Seções do painel" />
      </PageHeader>
      <PageBody>
        {aba === 'resumo' && <AbaResumo ctx={ctx} />}
        {aba === 'meses' && <AbaMeses ctx={ctx} todas={ctx.q.linhas === 'todas'} />}
        {aba === 'clientes' && <AbaClientes ctx={ctx} />}
      </PageBody>
    </>
  )
}
