export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { importacoesLista, lotesNaoCadastrados, parametrosDaCorretora, painelKpis } from '@/lib/gestao/consultas'
import { fechamentosAplicados } from '@/lib/gestao/consultasFechamento'
import { getProfile } from '@/lib/auth/getProfile'
import { temListaPropria } from '@/lib/corretoras'
import { fmtNum } from '@/lib/format'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { dataCurta, rCurto, TRACO } from '@/components/gestao/Celulas'
import { Importador } from './Importador'
import { FechamentoBtg } from './FechamentoBtg'
import { HistoricoImportacoes } from './HistoricoImportacoes'
import { NaoCadastrados } from './NaoCadastrados'

export default async function ImportarPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const profile = await getProfile()
  if (profile?.role !== 'admin') redirect(`${ctx.base}/painel`)
  const { corretora, base } = ctx
  const fechamentoNaTela = temListaPropria(corretora)   // BTG: o fechamento mensal entra pela planilha do BTG
  const [historico, naoCad, par, kpis, fechamentos] = await Promise.all([
    importacoesLista(corretora), lotesNaoCadastrados(corretora), parametrosDaCorretora(corretora), painelKpis(corretora, null),
    fechamentoNaTela ? fechamentosAplicados(corretora) : Promise.resolve([]),
  ])
  const modoZeragem = par.parametros.find(p => p.chave === 'modo_zeragem')?.valor ?? 'ZERAGEM'
  const zeragemManual = (par.parametros.find(p => p.chave === 'zeragem_manual')?.valor ?? '').trim().toUpperCase() === 'SIM'

  return (
    <>
      <PageHeader
        eyebrow={ctx.eyebrow}
        title="Importar"
        description={`Exports da ${ctx.label}: cadastro de clientes e lotes. Depois de importar, tudo recalcula sozinho. Leads entram pela tela de Leads.`}
      />
      <PageBody>
        <KpiRow cols={5}>
          <KpiCard label="Última data lançada" value={kpis?.ultima_data ? dataCurta(kpis.ultima_data) : TRACO} sub={kpis ? `${fmtNum(kpis.lotes_mes)} lotes no mês de referência` : undefined} />
          <KpiCard label="Clientes cadastrados" value={fmtNum(kpis?.clientes_levados ?? 0)} sub={`${fmtNum(kpis?.total_contas ?? 0)} contas`} />
          <KpiCard label="Receita no mês" value={rCurto(kpis?.receita_mes ?? 0)} />
          <KpiCard label="Linhas sem cliente" value={fmtNum(kpis?.linhas_nao_cadastradas ?? 0)} sub={`${fmtNum(kpis?.lotes_nao_cadastrados ?? 0)} lotes`} tone={kpis?.linhas_nao_cadastradas ? 'warn' : 'neutral'} />
          <KpiCard label="Assessores sem cadastro" value={fmtNum(par.assessoresNaoCadastrados.length)} sub="nos exports, mas não em Parâmetros" tone={par.assessoresNaoCadastrados.length ? 'warn' : 'neutral'} />
        </KpiRow>
        <Importador corretora={corretora} label={ctx.label} modoZeragem={modoZeragem} />
        {fechamentoNaTela && <FechamentoBtg corretora={corretora} base={base} aplicados={fechamentos} zeragemManual={zeragemManual} />}
        <NaoCadastrados corretora={corretora} linhas={naoCad} base={base} />
        <HistoricoImportacoes corretora={corretora} itens={historico} />
      </PageBody>
    </>
  )
}
