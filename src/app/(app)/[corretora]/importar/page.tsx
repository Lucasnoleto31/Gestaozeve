export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { importacoesLista, lotesNaoCadastrados, parametrosDaCorretora, painelKpis } from '@/lib/gestao/consultas'
import { fechamentosAplicados } from '@/lib/gestao/consultasFechamento'
import { extrasAplicados } from '@/lib/gestao/consultasBanking'
import { getProfile } from '@/lib/auth/getProfile'
import { temListaPropria } from '@/lib/corretoras'
import { fmtDataHoraPt, fmtNum } from '@/lib/format'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { RecolheNoCelular } from '@/components/ui/RecolheNoCelular'
import { Resumo } from '@/components/gestao/Resumo'
import { ehRegistroDoFechamento } from './registros'
import { dataCurta, rCurto, TRACO } from '@/components/gestao/Celulas'
import { Importador } from './Importador'
import { FechamentoBtg } from './FechamentoBtg'
import { BankingDelta } from './BankingDelta'
import { HistoricoImportacoes } from './HistoricoImportacoes'
import { NaoCadastrados } from './NaoCadastrados'

export default async function ImportarPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const profile = await getProfile()
  if (profile?.role !== 'admin') redirect(`${ctx.base}/painel`)
  const { corretora, base } = ctx
  const fechamentoNaTela = temListaPropria(corretora)   // BTG: o fechamento mensal entra pela planilha do BTG
  const [historico, naoCad, par, kpis, fechamentos, extras] = await Promise.all([
    importacoesLista(corretora), lotesNaoCadastrados(corretora), parametrosDaCorretora(corretora), painelKpis(corretora, null),
    fechamentoNaTela ? fechamentosAplicados(corretora) : Promise.resolve([]),
    fechamentoNaTela ? extrasAplicados(corretora) : Promise.resolve([]),   // o que o BTG paga fora dos lotes: fora do giro e Banking
  ])
  const modoZeragem = par.parametros.find(p => p.chave === 'modo_zeragem')?.valor ?? 'ZERAGEM'
  const zeragemManual = (par.parametros.find(p => p.chave === 'zeragem_manual')?.valor ?? '').trim().toUpperCase() === 'SIM'
  // A frase do celular usa só o que a página já carregou: os cartões, as contas sem cliente e o histórico
  const linhasSemCliente = kpis?.linhas_nao_cadastradas ?? 0
  const semCadastro = par.assessoresNaoCadastrados.length
  const pendencias = [
    linhasSemCliente ? `${fmtNum(linhasSemCliente)} ${linhasSemCliente === 1 ? 'linha' : 'linhas'} sem cliente (${fmtNum(naoCad.length)} ${naoCad.length === 1 ? 'conta' : 'contas'})` : null,
    semCadastro ? `${fmtNum(semCadastro)} ${semCadastro === 1 ? 'assessor sem cadastro' : 'assessores sem cadastro'}` : null,
  ].filter((p): p is string => !!p)
  // a última subida de um arquivo de lotes de verdade (o fechamento e o Banking também são gravados como lotes)
  const ultimaSubida = historico.find(i => i.tipo === 'lotes' && !ehRegistroDoFechamento(i))

  return (
    <>
      <PageHeader
        eyebrow={ctx.eyebrow}
        title="Importar"
        description={`Exports da ${ctx.label}: cadastro de clientes e lotes. Depois de importar, tudo recalcula sozinho. Leads entram pela tela de Leads.`}
      />
      <PageBody>
        {/* Só no celular (DESIGN.md §8.2): a tela abre pela resposta (até que dia os lotes estão lançados, a
            última importação e o que falta arrumar) e logo depois vem o botão de escolher o arquivo. Os cinco
            cartões continuam, atrás de "Mais números"; no computador nada muda. */}
        <div className="md:hidden">
          <Resumo
            frase={`Lotes lançados até ${kpis?.ultima_data ? dataCurta(kpis.ultima_data) : TRACO}. ${pendencias.length ? `Falta arrumar: ${pendencias.join(' e ')}.` : 'Nada pendente.'}`}
            apoio={ultimaSubida ? `Última importação de lotes: ${fmtDataHoraPt(ultimaSubida.created_at)} · ${ultimaSubida.nome_arquivo}` : null}
            nota={naoCad.length > 0 ? <a href="#nao-cadastrados" className="link">Ver as contas sem cliente</a> : undefined}
          />
        </div>
        <RecolheNoCelular titulo="Mais números" tamanho="linha">
        <KpiRow cols={5}>
          <KpiCard label="Última data lançada" value={kpis?.ultima_data ? dataCurta(kpis.ultima_data) : TRACO} sub={kpis ? `${fmtNum(kpis.lotes_mes)} lotes no mês de referência` : undefined} />
          <KpiCard label="Clientes cadastrados" value={fmtNum(kpis?.clientes_levados ?? 0)} sub={`${fmtNum(kpis?.total_contas ?? 0)} contas`} />
          <KpiCard label="Receita no mês" value={rCurto(kpis?.receita_mes ?? 0)} />
          <KpiCard label="Linhas sem cliente" value={fmtNum(kpis?.linhas_nao_cadastradas ?? 0)} sub={`${fmtNum(kpis?.lotes_nao_cadastrados ?? 0)} lotes`} tone={kpis?.linhas_nao_cadastradas ? 'warn' : 'neutral'} />
          <KpiCard label="Assessores sem cadastro" value={fmtNum(par.assessoresNaoCadastrados.length)} sub="nos exports, mas não em Parâmetros" tone={par.assessoresNaoCadastrados.length ? 'warn' : 'neutral'} />
        </KpiRow>
        </RecolheNoCelular>
        <Importador corretora={corretora} label={ctx.label} modoZeragem={modoZeragem} />
        {/* BTG: os dois envios do mês e o que já foi gravado ficam numa linha só no celular (é uma vez por mês);
            o espaçamento de dentro repete o da página, então o computador fica igual */}
        {fechamentoNaTela && (
          <RecolheNoCelular titulo="Fechamento e Banking do mês"
            resumo={`${fmtNum(fechamentos.length)} ${fechamentos.length === 1 ? 'fechamento aplicado' : 'fechamentos aplicados'} · ${fmtNum(extras.length)} ${extras.length === 1 ? 'registro' : 'registros'} de fora do giro e Banking gravados`}>
            <div className="space-y-6 md:space-y-8">
              <FechamentoBtg corretora={corretora} base={base} aplicados={fechamentos} zeragemManual={zeragemManual} />
              <BankingDelta corretora={corretora} base={base} aplicados={extras} />
            </div>
          </RecolheNoCelular>
        )}
        <NaoCadastrados corretora={corretora} linhas={naoCad} base={base} />
        <HistoricoImportacoes corretora={corretora} itens={historico} />
      </PageBody>
    </>
  )
}
