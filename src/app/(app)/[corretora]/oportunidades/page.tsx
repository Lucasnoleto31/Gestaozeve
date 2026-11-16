export const dynamic = 'force-dynamic'

import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { responsaveisAtivos } from '@/lib/gestao/consultas'
import { baseDeOportunidades } from '@/lib/gestao/consultasOportunidades'
import { classificar, MESES_RECENTE, type TipoOportunidade } from '@/lib/gestao/oportunidades'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum } from '@/lib/format'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Abas } from '@/components/gestao/Abas'
import { rCurto } from '@/components/gestao/Celulas'
import { TabelaOportunidades } from './TabelaOportunidades'

const TIPOS: TipoOportunidade[] = ['risco', 'reativar', 'ativar', 'abertura']

// Oportunidades da base: quem já é cliente da corretora e pode render mais sem lead novo. As abas são os
// grupos da tela Clientes (menos quem está operando), com os mesmos números, cada uma numa lista já
// ordenada por onde começar: Em risco (segurar, pelo que rendiam), Inativos (reativar, pelo que rendiam),
// Nunca operaram (ativar, pelos sinais de que estão quentes) e Em abertura (acompanhar). Marcando as
// linhas, as contas vão para a campanha de ativação e caem na Minha fila do atendente.
export default async function OportunidadesPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { corretora, base, q } = ctx
  const aba: TipoOportunidade = TIPOS.includes(q.aba as TipoOportunidade) ? (q.aba as TipoOportunidade) : 'risco'
  const [clientes, responsaveis] = await Promise.all([baseDeOportunidades(corretora), responsaveisAtivos()])
  const o = classificar(clientes, fmtDate(hojeBrasil()))
  const r = o.resumo
  const descricao: Record<TipoOportunidade, string> = {
    risco: 'Em risco: caíram ou pararam há pouco. São os primeiros a chamar, do que mais rendia para o que menos rendia.',
    reativar: 'Inativos: sem giro há mais de 3 meses, do que mais rendia para o que menos rendia.',
    ativar: 'Nunca operaram: a conta migrou e ainda não girou. Das mais quentes para as mais frias; quem gira em outra corretora vem primeiro.',
    abertura: 'Em abertura: contas que ainda não migraram; as que já giram vêm primeiro.',
  }

  return (
    <>
      <PageHeader eyebrow={ctx.eyebrow} title="Oportunidades"
        description={`Quem já é cliente e pode render mais sem lead novo, nos mesmos grupos da tela Clientes. ${descricao[aba]} Marque as linhas e atribua à campanha: as contas caem na Minha fila do atendente.`}>
        <Abas caminho={`${base}/oportunidades`} query={{}} valor={aba} padrao="risco" rotulo="Grupos de oportunidade"
          opcoes={[
            { valor: 'risco', label: 'Em risco', conta: fmtNum(r.risco.contas) },
            { valor: 'reativar', label: 'Inativos', conta: fmtNum(r.reativar.contas) },
            { valor: 'ativar', label: 'Nunca operaram', conta: fmtNum(r.ativar.contas) },
            { valor: 'abertura', label: 'Em abertura', conta: fmtNum(r.abertura.contas) },
          ]} />
      </PageHeader>
      <PageBody>
        {aba === 'risco' && (
          <KpiRow cols={5}>
            <KpiCard destaque label="Rendiam por mês" value={r.risco.potencialMes ? rCurto(r.risco.potencialMes) : 'R$ 0'}
              sub={`soma do que os ${fmtNum(r.risco.contas)} clientes em risco rendiam nos meses em que giraram`} />
            <KpiCard label="Pararam" value={fmtNum(r.risco.pararam)} sub="giraram nos últimos 3 meses e estão sem giro há dias" tone={r.risco.pararam ? 'loss' : 'neutral'} />
            <KpiCard label="Em queda" value={fmtNum(r.risco.emQueda)} sub="girando bem menos que a média dos 3 meses anteriores" tone={r.risco.emQueda ? 'warn' : 'neutral'} />
            <KpiCard label="Giram em outra corretora" value={fmtNum(r.risco.giramFora)} sub={r.risco.giramFora ? 'não estão perdidos: só giram menos aqui' : 'ninguém girando em outra corretora'} />
            <KpiCard label="Fora da campanha" value={fmtNum(r.risco.foraDaCampanha)} sub={`sem atendente trabalhando a conta · ${fmtNum(r.risco.contatados)} já ${r.risco.contatados === 1 ? "contatado" : "contatados"}`} />
          </KpiRow>
        )}
        {aba === 'reativar' && (
          <KpiRow cols={5}>
            <KpiCard destaque label="Rendiam por mês" value={r.reativar.potencialMes ? rCurto(r.reativar.potencialMes) : 'R$ 0'}
              sub={`soma do que os ${fmtNum(r.reativar.contas)} inativos rendiam nos meses em que giraram`} />
            <KpiCard label="Giram em outra corretora" value={fmtNum(r.reativar.giramFora)}
              sub={r.reativar.giramFora ? `não estão perdidos: só não giram aqui · rendiam ${rCurto(r.reativar.potencialGiramFora)} por mês` : 'nenhum inativo girando em outra corretora'} />
            <KpiCard label={`Pararam há até ${MESES_RECENTE} meses`} value={fmtNum(r.reativar.recentes)}
              sub={`rendiam ${rCurto(r.reativar.potencialRecentes)} por mês · os mais fáceis de trazer de volta`} />
            <KpiCard label="Fora da campanha" value={fmtNum(r.reativar.foraDaCampanha)} sub="inativos sem atendente trabalhando a conta" tone={r.reativar.foraDaCampanha ? 'warn' : 'neutral'} />
            <KpiCard label="Já contatados" value={fmtNum(r.reativar.contatados)} sub="com contato registrado na ficha" />
          </KpiRow>
        )}
        {aba === 'ativar' && (
          <KpiRow cols={5}>
            <KpiCard destaque label="Prioridade alta" value={fmtNum(r.ativar.prioridade)} sub="giram em outra corretora, migraram há pouco, já operam ou declararam patrimônio alto" />
            <KpiCard label="Giram em outra corretora" value={fmtNum(r.ativar.giramFora)} sub={r.ativar.giramFora ? 'já operam: falta trazer o giro para cá' : 'ninguém girando em outra corretora'} />
            <KpiCard label="Nunca operaram" value={fmtNum(r.ativar.contas)} sub={`${fmtNum(r.ativar.recentes)} migraram há até 90 dias`} />
            <KpiCard label="Já operam" value={fmtNum(r.ativar.jaOperam)} sub="disseram no formulário que já operam" />
            <KpiCard label="Fora da campanha" value={fmtNum(r.ativar.foraDaCampanha)} sub={`${fmtNum(r.ativar.contatados)} já ${r.ativar.contatados === 1 ? "contatado" : "contatados"}`} tone={r.ativar.foraDaCampanha ? 'warn' : 'neutral'} />
          </KpiRow>
        )}
        {aba === 'abertura' && (
          <KpiRow cols={4}>
            <KpiCard destaque label="Já giram" value={fmtNum(r.abertura.jaGiram)} sub={`${fmtNum(r.abertura.lotes12m)} lotes em 12 meses · falta só migrar a conta`} />
            <KpiCard label="Giram em outra corretora" value={fmtNum(r.abertura.giramFora)} sub={r.abertura.giramFora ? 'operam lá enquanto a conta abre aqui' : 'ninguém girando em outra corretora'} />
            <KpiCard label="Em abertura" value={fmtNum(r.abertura.contas)} sub="contas que ainda não migraram" />
            <KpiCard label="Sem contato registrado" value={fmtNum(r.abertura.semContato)} sub="ninguém anotou conversa com o cliente" />
          </KpiRow>
        )}
        <TabelaOportunidades key={aba} tipo={aba} linhas={o[aba]}
          corretora={corretora} base={base} atendentes={responsaveis.filter(x => x.atende_clientes).map(x => x.nome)} />
      </PageBody>
    </>
  )
}
