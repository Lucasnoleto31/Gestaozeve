// Aba "Distribuir" da Fila: o que antes era a tela Oportunidades de cada corretora. Os grupos da tela
// Clientes que podem render mais sem lead novo (Em risco, Inativos, Nunca operaram, Em abertura), numa
// lista já ordenada por onde começar; marcando as linhas, as contas vão para um atendente e caem na fila
// do dia dele. A corretora vem do endereço (?corretora=) e o grupo também (?grupo=).
import Link from 'next/link'
import { responsaveisAtivos } from '@/lib/gestao/consultas'
import { baseDeOportunidades } from '@/lib/gestao/consultasOportunidades'
import { classificar, fraseDeDistribuir, GRUPOS_DISTRIBUIR, hrefDistribuir, MESES_RECENTE, type TipoOportunidade } from '@/lib/gestao/oportunidades'
import { CORRETORA_LABEL, CORRETORA_SLUG, type Corretora } from '@/lib/corretoras'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum } from '@/lib/format'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Resumo } from '@/components/gestao/Resumo'
import { rCurto } from '@/components/gestao/Celulas'
import { TabelaOportunidades } from './TabelaOportunidades'

const ROTULO: Record<TipoOportunidade, string> = { risco: 'Em risco', reativar: 'Inativos', ativar: 'Nunca operaram', abertura: 'Em abertura' }
const reais = (v: number) => (v ? rCurto(v) : 'R$ 0')

export async function Distribuir({ corretora, corretoras, grupo }: { corretora: Corretora; corretoras: Corretora[]; grupo: TipoOportunidade }) {
  const [clientes, responsaveis] = await Promise.all([baseDeOportunidades(corretora), responsaveisAtivos()])
  const o = classificar(clientes, fmtDate(hojeBrasil()))
  const r = o.resumo
  const label = CORRETORA_LABEL[corretora]

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <nav className="flex flex-wrap items-center gap-2" aria-label="Grupos para distribuir">
          {GRUPOS_DISTRIBUIR.map(g => (
            <Link key={g} href={hrefDistribuir(corretora, g)} scroll={false} className="chip" data-active={g === grupo} aria-current={g === grupo ? 'page' : undefined}>
              {ROTULO[g]}<span className="tabular-nums text-fg-subtle">{fmtNum(r[g].contas)}</span>
            </Link>
          ))}
        </nav>
        {corretoras.length > 1 && (
          <nav className="flex items-center gap-2" aria-label="Corretora">
            <span className="label">Corretora</span>
            {corretoras.map(c => <Link key={c} href={hrefDistribuir(c, grupo)} scroll={false} className="chip" data-active={c === corretora} aria-current={c === corretora ? 'page' : undefined}>{CORRETORA_LABEL[c]}</Link>)}
          </nav>
        )}
      </div>

      <Resumo frase={fraseDeDistribuir(grupo, r, label)} />

      {grupo === 'risco' && (
        <KpiRow cols={4}>
          <KpiCard destaque label="Rendiam por mês" value={reais(r.risco.potencialMes)} sub={`os ${fmtNum(r.risco.contas)} clientes em risco, quando giravam`}
            dica="Soma do que cada cliente em risco rendia por mês: a receita de todo o histórico dele dividida pelos meses em que girou." />
          <KpiCard label="Pararam e em queda" value={`${fmtNum(r.risco.pararam)} e ${fmtNum(r.risco.emQueda)}`} sub="pararam há dias · giram bem menos que antes" tone={r.risco.pararam ? 'loss' : 'neutral'} />
          <KpiCard label="Giram em outra corretora" value={fmtNum(r.risco.giramFora)} sub={r.risco.giramFora ? 'não estão perdidos: só giram menos aqui' : 'ninguém girando em outra corretora'} />
          <KpiCard label="Sem atendente" value={fmtNum(r.risco.foraDaCampanha)} sub={`${fmtNum(r.risco.contatados)} já ${r.risco.contatados === 1 ? 'contatado' : 'contatados'}`} tone={r.risco.foraDaCampanha ? 'warn' : 'neutral'} />
        </KpiRow>
      )}
      {grupo === 'reativar' && (
        <KpiRow cols={4}>
          <KpiCard destaque label="Rendiam por mês" value={reais(r.reativar.potencialMes)} sub={`os ${fmtNum(r.reativar.contas)} inativos, quando giravam`}
            dica="Soma do que cada inativo rendia por mês: a receita de todo o histórico dele dividida pelos meses em que girou." />
          <KpiCard label={`Pararam há até ${MESES_RECENTE} meses`} value={fmtNum(r.reativar.recentes)} sub={`rendiam ${reais(r.reativar.potencialRecentes)} por mês · os mais fáceis de trazer de volta`} />
          <KpiCard label="Giram em outra corretora" value={fmtNum(r.reativar.giramFora)} sub={r.reativar.giramFora ? `só não giram aqui · rendiam ${reais(r.reativar.potencialGiramFora)} por mês` : 'nenhum inativo girando em outra corretora'} />
          <KpiCard label="Sem atendente" value={fmtNum(r.reativar.foraDaCampanha)} sub={`${fmtNum(r.reativar.contatados)} já ${r.reativar.contatados === 1 ? 'contatado' : 'contatados'}`} tone={r.reativar.foraDaCampanha ? 'warn' : 'neutral'} />
        </KpiRow>
      )}
      {grupo === 'ativar' && (
        <KpiRow cols={4}>
          <KpiCard destaque label="Prioridade alta" value={fmtNum(r.ativar.prioridade)} sub={`das ${fmtNum(r.ativar.contas)} contas que nunca operaram`}
            dica="Giram em outra corretora, migraram há pouco, disseram que já operam ou declararam patrimônio alto." />
          <KpiCard label="Giram em outra corretora" value={fmtNum(r.ativar.giramFora)} sub={r.ativar.giramFora ? 'já operam: falta trazer os lotes para cá' : 'ninguém girando em outra corretora'} />
          <KpiCard label="Já operam" value={fmtNum(r.ativar.jaOperam)} sub={`disseram no formulário · ${fmtNum(r.ativar.recentes)} migraram há até 90 dias`} />
          <KpiCard label="Sem atendente" value={fmtNum(r.ativar.foraDaCampanha)} sub={`${fmtNum(r.ativar.contatados)} já ${r.ativar.contatados === 1 ? 'contatado' : 'contatados'}`} tone={r.ativar.foraDaCampanha ? 'warn' : 'neutral'} />
        </KpiRow>
      )}
      {grupo === 'abertura' && (
        <KpiRow cols={4}>
          <KpiCard destaque label="Já giram" value={fmtNum(r.abertura.jaGiram)} sub={`${fmtNum(r.abertura.lotes12m)} lotes em 12 meses · falta só migrar a conta`} />
          <KpiCard label="Giram em outra corretora" value={fmtNum(r.abertura.giramFora)} sub={r.abertura.giramFora ? 'operam lá enquanto a conta abre aqui' : 'ninguém girando em outra corretora'} />
          <KpiCard label="Em abertura" value={fmtNum(r.abertura.contas)} sub="contas que ainda não migraram" />
          <KpiCard label="Sem contato registrado" value={fmtNum(r.abertura.semContato)} sub="ninguém anotou conversa com o cliente" />
        </KpiRow>
      )}

      <TabelaOportunidades key={`${corretora}-${grupo}`} tipo={grupo} linhas={o[grupo]} corretora={corretora} base={`/${CORRETORA_SLUG[corretora]}`}
        atendentes={responsaveis.filter(x => x.atende_clientes).map(x => x.nome)} />
    </>
  )
}
