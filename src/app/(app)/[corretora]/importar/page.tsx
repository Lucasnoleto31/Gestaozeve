export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { importacoesLista, lotesNaoCadastrados, parametrosDaCorretora, painelKpis } from '@/lib/gestao/consultas'
import { getProfile } from '@/lib/auth/getProfile'
import { fmtNum } from '@/lib/format'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { dataCurta, rCurto, TRACO } from '@/components/gestao/Celulas'
import { Importador } from './Importador'
import { HistoricoImportacoes } from './HistoricoImportacoes'
import { NaoCadastrados } from './NaoCadastrados'

export default async function ImportarPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const profile = await getProfile()
  if (profile?.role !== 'admin') redirect(`${ctx.base}/painel`)
  const { corretora, base } = ctx
  const [historico, naoCad, par, kpis] = await Promise.all([
    importacoesLista(corretora), lotesNaoCadastrados(corretora), parametrosDaCorretora(corretora), painelKpis(corretora, null),
  ])
  const modoZeragem = par.parametros.find(p => p.chave === 'modo_zeragem')?.valor ?? 'ZERAGEM'

  return (
    <>
      <PageHeader
        eyebrow={ctx.eyebrow}
        title="Importar"
        description={`Cole aqui os exports da ${ctx.label}: o cadastro de clientes (25 colunas, DT_PARTITION … ID_ASSESSOR) e os lotes (export "Export", 9 ou 13 colunas). Leads entram pela tela de Leads. Depois de importar, tudo recalcula sozinho.`}
      />
      <PageBody>
        <KpiRow cols={5}>
          <KpiCard label="Última data lançada" value={kpis?.ultima_data ? dataCurta(kpis.ultima_data) : TRACO} sub={kpis ? `${fmtNum(kpis.lotes_mes)} lotes no mês de referência` : undefined} />
          <KpiCard label="Clientes cadastrados" value={fmtNum(kpis?.clientes_levados ?? 0)} sub={`${fmtNum(kpis?.total_contas ?? 0)} contas`} tone="success" />
          <KpiCard label="Receita no mês de ref." value={rCurto(kpis?.receita_mes ?? 0)} tone="success" />
          <KpiCard label="Linhas com cliente não cadastrado" value={fmtNum(kpis?.linhas_nao_cadastradas ?? 0)} sub={`${fmtNum(kpis?.lotes_nao_cadastrados ?? 0)} lotes sem cliente`} tone={kpis?.linhas_nao_cadastradas ? 'warning' : 'neutral'} />
          <KpiCard label="Assessores não cadastrados" value={fmtNum(par.assessoresNaoCadastrados.length)} sub="aparecem nos exports mas não em Parâmetros" tone={par.assessoresNaoCadastrados.length ? 'warning' : 'neutral'} />
        </KpiRow>
        <Importador corretora={corretora} label={ctx.label} modoZeragem={modoZeragem} />
        <NaoCadastrados corretora={corretora} linhas={naoCad} base={base} />
        <HistoricoImportacoes corretora={corretora} itens={historico} />
      </PageBody>
    </>
  )
}
