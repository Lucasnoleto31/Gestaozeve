// Funil › Equipe: quem fez o quê — os leads de cada responsável, os contatos com leads e com clientes
// e a campanha de ativação por atendente.
import { contatosClientesParaResumo, contatosParaResumo, funilAtivacoesPorAtendente, funilSafraPor, responsaveisAtivos } from '@/lib/gestao/consultas'
import { fmtMedia, resumoContatosClientesPorAtendente, resumoContatosPorAtendente, somaAtivacoes, type ResumoAtendente, type ResumoContatosClientes } from '@/lib/gestao/contatos'
import { janelaMeses, mesCurto, mesLongo, somarMeses } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Alert } from '@/components/ui/Alert'
import { LinhaVazia, TRACO, n0, r0 } from '@/components/gestao/Celulas'
import { MESES_INATIVO, type PeriodoFunil } from './comum'
import type { AtivacaoAtendenteRow } from '@/lib/gestao/tipos'

export async function AbaEquipe({ mesRef, periodo }: { mesRef: string; periodo: PeriodoFunil }) {
  const soMes = periodo === 'mes'
  const meses = janelaMeses(mesRef, 12)
  const inicio = soMes ? mesRef : meses[0]
  const rotulo = soMes ? mesLongo(mesRef) : `${mesCurto(meses[0])} a ${mesCurto(mesRef)}`
  const [dados, contatosCli, equipe, ativacoes, porResp] = await Promise.all([
    contatosParaResumo(), contatosClientesParaResumo(), responsaveisAtivos(), funilAtivacoesPorAtendente(mesRef, MESES_INATIVO), funilSafraPor('responsavel', mesRef, soMes ? 1 : 12),
  ])
  const contatosAt = resumoContatosPorAtendente(dados.contatos, dados.leads, inicio, somarMeses(mesRef, 1))
  const contatosCliAt = resumoContatosClientesPorAtendente(contatosCli, equipe.map(r => r.nome), inicio, somarMeses(mesRef, 1))
  const camp = ativacoes ? somaAtivacoes(ativacoes) : null
  const media = (x: number, n: number) => (n ? fmtMedia(x / n) : TRACO)

  return (
    <>
      <KpiRow cols={4}>
        <KpiCard label="Contatos com leads" value={fmtNum(contatosAt.total.contatos)} sub={`${fmtNum(contatosAt.total.leads)} leads · ${media(contatosAt.total.contatos, contatosAt.total.dias)} por dia com contato`} />
        <KpiCard label="Ganhos dos contatados" value={fmtNum(contatosAt.total.ganhos)} tone={contatosAt.total.ganhos ? 'gain' : 'neutral'} sub={contatosAt.total.ganhos ? `${media(contatosAt.total.contatos_ganhos, contatosAt.total.ganhos)} contatos até ganhar` : 'leads contatados no período que viraram Ganho'} />
        <KpiCard label="Contatos com clientes" value={fmtNum(contatosCliAt.total.contatos)} sub={`${fmtNum(contatosCliAt.total.clientes)} clientes · campanha de ativação e reativação`} />
        <KpiCard label={`Campanha em ${mesCurto(mesRef)}`} value={camp ? `${fmtNum(camp.ativados)} · ${fmtNum(camp.reativados)}` : TRACO} sub={camp ? `1ª operação · reativadas, de ${fmtNum(camp.contas)} contas na campanha` : 'campanha de ativação ainda não ativada'} />
      </KpiRow>

      <Panel title={`Leads de ${rotulo} por responsável`} subtitle="Os leads que entraram no período, atribuídos a cada pessoa, e até onde chegaram: tombaram = abriram a conta; operaram = já giraram.">
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead>
              <tr>
                <th>Responsável</th><th className="num">Entraram</th><th className="num col-p2">Contatados</th><th className="num col-p2">Em contato</th><th className="num col-p2">Perdidos</th>
                <th className="num">Tombaram</th><th className="num">Operaram</th><th className="num col-p2">% tombaram</th><th className="num col-p3">Lotes</th><th className="num">Receita</th>
              </tr>
            </thead>
            <tbody>
              {porResp.length === 0 && <LinhaVazia colunas={10}>Sem leads em {rotulo}.</LinhaVazia>}
              {porResp.map(g => (
                <tr key={g.grupo}>
                  <td className="font-medium">{g.grupo}</td>
                  <td className="num">{n0(g.recebidos)}</td>
                  <td className="num col-p2">{n0(g.contatados)}</td>
                  <td className="num col-p2">{n0(g.em_contato)}</td>
                  <td className={cn('num col-p2', g.perdidos_funil ? 'text-loss' : 'subtle')}>{n0(g.perdidos_funil)}</td>
                  <td className={cn('num font-semibold', !g.ativados && 'subtle')}>{n0(g.ativados)}</td>
                  <td className={cn('num font-semibold', g.com_giro ? 'text-gain' : 'subtle')}>{n0(g.com_giro)}</td>
                  <td className="num col-p2">{g.recebidos ? fmtPct((g.ativados / g.recebidos) * 100, 0) : TRACO}</td>
                  <td className={cn('num col-p3', !g.lotes && 'subtle')}>{n0(g.lotes)}</td>
                  <td className={cn('num', !g.receita && 'subtle')}>{r0(g.receita)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Contatos com leads" subtitle={`Contatos registrados em ${rotulo}, pelo responsável do lead. Até ganhar = todos os contatos dos leads ganhos, dividido por esses ganhos.`}>
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead>
              <tr><th>Atendente</th><th className="num">Contatos</th><th className="num">Leads contatados</th><th className="num col-p2">Por lead</th><th className="num col-p2">Dias com contato</th><th className="num col-p2">Por dia</th><th className="num">Ganhos</th><th className="num">Contatos até ganhar</th></tr>
            </thead>
            <tbody>
              {contatosAt.linhas.length === 0 && <LinhaVazia colunas={8}>Nenhum contato registrado em {rotulo}.</LinhaVazia>}
              {contatosAt.linhas.map(a => <LinhaAtendente key={a.grupo} a={a} />)}
            </tbody>
            {contatosAt.linhas.length > 1 && <tfoot><LinhaAtendente a={contatosAt.total} total /></tfoot>}
          </table>
        </div>
      </Panel>

      <Panel title="Contatos com clientes" subtitle={`Registrados na ficha do cliente em ${rotulo}. Quem atendeu: o nome entre parênteses na nota, como “WhatsApp (Milena)”, ou o login de quem registrou.`}>
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead>
              <tr><th>Atendente</th><th className="num">Contatos</th><th className="num">Clientes contatados</th><th className="num col-p2">Por cliente</th><th className="num col-p2">Dias com contato</th><th className="num col-p2">Por dia</th><th className="col-p2">Por corretora</th></tr>
            </thead>
            <tbody>
              {contatosCliAt.linhas.length === 0 && <LinhaVazia colunas={7}>Nenhum contato com cliente registrado em {rotulo}.</LinhaVazia>}
              {contatosCliAt.linhas.map(a => <LinhaContatoCliente key={a.grupo} a={a} />)}
            </tbody>
            {contatosCliAt.linhas.length > 1 && <tfoot><LinhaContatoCliente a={contatosCliAt.total} total /></tfoot>}
          </table>
        </div>
      </Panel>

      <Panel title={`Campanha de ativação · ${mesLongo(mesRef)}`}
        subtitle={`As contas atribuídas a cada atendente e, no mês, os contatos com elas, quantas operaram, quantas fizeram a 1ª operação e quantas voltaram depois de ${MESES_INATIVO} meses paradas. Lotes e receita são das contas com 1ª operação ou reativação.`}>
        {ativacoes === null ? (
          <Alert tone="warn" title="Campanha de ativação ainda não ativada no banco">Rode a S52 no Supabase para atribuir contas e ver este painel.</Alert>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead>
                <tr><th>Atendente</th><th className="num">Contas</th><th className="num">Contatos</th><th className="num col-p2">Contatadas</th><th className="num col-p2">Operaram</th><th className="num">1ª operação</th><th className="num">Reativadas</th><th className="num col-p3">Lotes</th><th className="num">Receita</th></tr>
              </thead>
              <tbody>
                {ativacoes.length === 0 && <LinhaVazia colunas={9}>Nenhuma conta na campanha ainda: em Clientes, marque as contas e use “Atribuir à campanha”.</LinhaVazia>}
                {ativacoes.map(a => <LinhaAtivacao key={a.ativador} a={a} />)}
              </tbody>
              {ativacoes.length > 1 && camp && <tfoot><LinhaAtivacao a={camp} total /></tfoot>}
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}

// Contatos com leads: médias com uma casa, traço quando não há base
function LinhaAtendente({ a, total }: { a: ResumoAtendente; total?: boolean }) {
  const media = (x: number, n: number) => (n ? fmtMedia(x / n) : TRACO)
  return (
    <tr className={cn(total && 'total')}>
      <td className="font-medium">{a.grupo}</td>
      <td className="num font-semibold">{n0(a.contatos)}</td>
      <td className="num">{n0(a.leads)}</td>
      <td className="num col-p2">{media(a.contatos, a.leads)}</td>
      <td className="num col-p2">{n0(a.dias)}</td>
      <td className="num col-p2">{media(a.contatos, a.dias)}</td>
      <td className={cn('num', a.ganhos && 'text-gain')}>{n0(a.ganhos)}</td>
      <td className="num font-semibold">{media(a.contatos_ganhos, a.ganhos)}</td>
    </tr>
  )
}

// Contatos com clientes: corretoras como texto ("BTG 168 · Genial 1")
function LinhaContatoCliente({ a, total }: { a: ResumoContatosClientes; total?: boolean }) {
  const media = (x: number, n: number) => (n ? fmtMedia(x / n) : TRACO)
  const corretoras = Object.entries(a.por_corretora).sort((x, y) => y[1] - x[1]).map(([c, n]) => `${c === 'GENIAL' ? 'Genial' : c} ${fmtNum(n)}`).join(' · ')
  return (
    <tr className={cn(total && 'total')}>
      <td className="font-medium">{a.grupo}</td>
      <td className="num font-semibold">{n0(a.contatos)}</td>
      <td className="num">{n0(a.clientes)}</td>
      <td className="num col-p2">{media(a.contatos, a.clientes)}</td>
      <td className="num col-p2">{n0(a.dias)}</td>
      <td className="num col-p2">{media(a.contatos, a.dias)}</td>
      <td className="muted col-p2">{corretoras || TRACO}</td>
    </tr>
  )
}

// Campanha de ativação por atendente (S52)
function LinhaAtivacao({ a, total }: { a: AtivacaoAtendenteRow; total?: boolean }) {
  return (
    <tr className={cn(total && 'total')}>
      <td className="font-medium">{a.ativador}</td>
      <td className="num">{n0(a.contas)}</td>
      <td className="num font-semibold">{n0(a.contatos)}</td>
      <td className="num col-p2">{n0(a.contas_contatadas)}</td>
      <td className="num col-p2">{n0(a.operaram)}</td>
      <td className={cn('num font-semibold', a.ativados && 'text-gain')}>{n0(a.ativados)}</td>
      <td className={cn('num font-semibold', a.reativados && 'text-gain')}>{n0(a.reativados)}</td>
      <td className="num col-p3">{n0(a.lotes)}</td>
      <td className="num">{r0(a.receita)}</td>
    </tr>
  )
}
