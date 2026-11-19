// Funil › Equipe: quem fez o quê — os leads de cada responsável, os contatos com leads e com clientes
// e a campanha de ativação por atendente.
//
// No celular (DESIGN.md §8) a aba abre pela frase com os totais (no lugar dos quatro cartões) e as tabelas
// viram listas de pessoas: o nome, o que a pessoa fez em palavras e um número à direita. As outras colunas
// entram na linha de apoio com "Mais números". Contatos com clientes e a campanha ficam recolhidos, com o
// total no título. O computador não muda.
import type { CSSProperties, ReactNode } from 'react'
import { contatosClientesParaResumo, contatosParaResumo, funilAtivacoesPorAtendente, funilSafraPor, responsaveisAtivos } from '@/lib/gestao/consultas'
import { fmtMedia, resumoContatosClientesPorAtendente, resumoContatosPorAtendente, somaAtivacoes, type ResumoAtendente, type ResumoContatosClientes } from '@/lib/gestao/contatos'
import { janelaMeses, mesCurto, mesLongo, somarMeses } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Alert } from '@/components/ui/Alert'
import { Resumo } from '@/components/gestao/Resumo'
import { LinhaVazia, TRACO, n0, r0 } from '@/components/gestao/Celulas'
import { DicaNoTitulo, Palavra } from './Celular'
import { MaisNumeros } from './MaisNumeros'
import { RecolheNoCelular } from '@/components/ui/RecolheNoCelular'
import { LISTA_LARGA, MESES_INATIVO, celApoio, celMais, plural, type PeriodoFunil } from './comum'
import type { AtivacaoAtendenteRow } from '@/lib/gestao/tipos'

const SEM_RESPONSAVEL = ['Sem responsável', '—']

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

  // A frase do celular: os totais dos cartões "Contatos com leads" e "Ganhos dos contatados" e os leads
  // que estão sem responsável (a linha "Sem responsável" da primeira lista)
  const tot = contatosAt.total
  const semDono = porResp.find(g => SEM_RESPONSAVEL.includes(g.grupo))?.recebidos ?? 0
  const quando = `${soMes ? 'Em' : 'De'} ${rotulo}`
  const frase = tot.contatos
    ? `${quando}, a equipe fez ${plural(tot.contatos, 'contato', 'contatos')} com ${plural(tot.leads, 'lead', 'leads')}; ${tot.ganhos ? plural(tot.ganhos, 'desses leads virou ganho', 'desses leads viraram ganho') : 'nenhum desses leads virou ganho ainda'}.`
    : `${quando}, a equipe ainda não registrou contato com leads.`
  const apoio = semDono ? `${plural(semDono, 'lead', 'leads')} ${soMes ? 'do mês' : 'do período'} ${semDono === 1 ? 'está' : 'estão'} sem responsável.` : null

  const explica = {
    leads: 'Os leads que entraram no período, atribuídos a cada pessoa, e até onde chegaram: tombaram = abriram a conta; operaram = já giraram.',
    contatos: `Contatos registrados em ${rotulo}, pelo responsável do lead. Até ganhar = todos os contatos dos leads ganhos, dividido por esses ganhos.`,
    clientes: `Registrados na ficha do cliente em ${rotulo}. Quem atendeu: o nome entre parênteses na nota, como “WhatsApp (Milena)”, ou o login de quem registrou.`,
    campanha: `As contas atribuídas a cada atendente e, no mês, os contatos com elas, quantas operaram, quantas fizeram a 1ª operação e quantas voltaram depois de ${MESES_INATIVO} meses paradas. Lotes e receita são das contas com 1ª operação ou reativação.`,
  }
  const soNoPc = (texto: ReactNode) => <span className="max-md:hidden">{texto}</span>

  return (
    <>
      <div className="md:hidden"><Resumo frase={frase} apoio={apoio} /></div>

      {/* celular: os quatro totais estão na frase, na linha Total de cada lista e no título das duas recolhidas */}
      <KpiRow cols={4} className="max-md:hidden">
        <KpiCard label="Contatos com leads" value={fmtNum(contatosAt.total.contatos)} sub={`${fmtNum(contatosAt.total.leads)} leads · ${media(contatosAt.total.contatos, contatosAt.total.dias)} por dia com contato`} />
        <KpiCard label="Ganhos dos contatados" value={fmtNum(contatosAt.total.ganhos)} tone={contatosAt.total.ganhos ? 'gain' : 'neutral'} sub={contatosAt.total.ganhos ? `${media(contatosAt.total.contatos_ganhos, contatosAt.total.ganhos)} contatos até ganhar` : 'leads contatados no período que viraram Ganho'} />
        <KpiCard label="Contatos com clientes" value={fmtNum(contatosCliAt.total.contatos)} sub={`${fmtNum(contatosCliAt.total.clientes)} clientes · campanha de ativação e reativação`} />
        <KpiCard label={`Campanha em ${mesCurto(mesRef)}`} value={camp ? `${fmtNum(camp.ativados)} · ${fmtNum(camp.reativados)}` : TRACO} sub={camp ? `1ª operação · reativadas, de ${fmtNum(camp.contas)} contas na campanha` : 'campanha de ativação ainda não ativada'} />
      </KpiRow>

      <Panel title={<>Leads de {rotulo} por responsável<DicaNoTitulo texto={explica.leads} /></>} subtitle={soNoPc(explica.leads)}>
        <MaisNumeros>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense tbl-lista" style={LISTA_LARGA}>
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
                    <td className="cel-titulo font-medium">{g.grupo}</td>
                    <td className={cn('num', celApoio(g.recebidos > 0))}>{n0(g.recebidos)}<Palavra n={g.recebidos} um="lead" varios="leads" /></td>
                    <td className={cn('num col-p2', celMais(g.contatados > 0))}>{n0(g.contatados)}<Palavra n={g.contatados} um="contatado" varios="contatados" /></td>
                    <td className={cn('num col-p2', celMais(g.em_contato > 0))}>{n0(g.em_contato)}<Palavra um="em contato" /></td>
                    <td className={cn('num col-p2', g.perdidos_funil ? 'text-loss' : 'subtle', celMais(g.perdidos_funil > 0))}>{n0(g.perdidos_funil)}<Palavra n={g.perdidos_funil} um="perdido" varios="perdidos" /></td>
                    <td className={cn('num font-semibold', !g.ativados && 'subtle', celApoio(g.ativados > 0))}>{n0(g.ativados)}<Palavra n={g.ativados} um="tombou" varios="tombaram" /></td>
                    <td className={cn('num font-semibold', g.com_giro ? 'text-gain' : 'subtle', celApoio(g.com_giro > 0))}>{n0(g.com_giro)}<Palavra n={g.com_giro} um="operou" varios="operaram" /></td>
                    <td className={cn('num col-p2', celMais(g.ativados > 0))}>{g.recebidos ? fmtPct((g.ativados / g.recebidos) * 100, 0) : TRACO}<Palavra um="dos leads tombaram" /></td>
                    <td className={cn('num col-p3', !g.lotes && 'subtle', celMais(g.lotes > 0))}>{n0(g.lotes)}<Palavra n={g.lotes} um="lote" varios="lotes" /></td>
                    <td className={cn('num cel-valor', !g.receita && 'subtle')} data-rotulo="receita">{r0(g.receita)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MaisNumeros>
      </Panel>

      <Panel title={<>Contatos com leads<span className="md:hidden"> por responsável</span><DicaNoTitulo texto={explica.contatos} /></>} subtitle={<>{soNoPc(explica.contatos)}<span className="md:hidden">Ganhos dos contatados: os leads contatados no período que viraram Ganho.</span></>}>
        <MaisNumeros>
          <div className="tbl-wrap">
            {/* mais espaço à direita: na linha Total o número leva o nome inteiro, "ganhos dos contatados" */}
            <table className="tbl tbl-dense tbl-lista" style={{ '--lista-direita': '8.5rem' } as CSSProperties}>
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
        </MaisNumeros>
      </Panel>

      <RecolheNoCelular titulo="Contatos com clientes" dica={explica.clientes}
        resumo={`${plural(contatosCliAt.total.contatos, 'contato', 'contatos')} com ${plural(contatosCliAt.total.clientes, 'cliente', 'clientes')}`}>
        <Panel title={soNoPc('Contatos com clientes')} subtitle={soNoPc(explica.clientes)}>
          <MaisNumeros>
            <div className="tbl-wrap">
              <table className="tbl tbl-dense tbl-lista">
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
          </MaisNumeros>
        </Panel>
      </RecolheNoCelular>

      {/* a campanha é sempre do mês, mesmo com "12 meses" ligado: o título diz o mês */}
      <RecolheNoCelular titulo={`Campanha de ativação · ${mesLongo(mesRef)}`} dica={explica.campanha}
        resumo={camp ? `${plural(camp.ativados, 'primeira operação', 'primeiras operações')} e ${plural(camp.reativados, 'reativada', 'reativadas')}, de ${plural(camp.contas, 'conta', 'contas')}` : undefined}>
        <Panel title={soNoPc(`Campanha de ativação · ${mesLongo(mesRef)}`)} subtitle={soNoPc(explica.campanha)}>
          {ativacoes === null ? (
            <Alert tone="warn" title="Campanha de ativação ainda não ativada no banco">Rode a S52 no Supabase para atribuir contas e ver este painel.</Alert>
          ) : (
            <MaisNumeros>
              <div className="tbl-wrap">
                <table className="tbl tbl-dense tbl-lista" style={LISTA_LARGA}>
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
            </MaisNumeros>
          )}
        </Panel>
      </RecolheNoCelular>
    </>
  )
}

// Contatos com leads: médias com uma casa, traço quando não há base.
// Celular: "N contatos · N leads" na linha de apoio e os ganhos à direita. São os ganhos dos contatados (o
// nome do cartão no computador), não os ganhos do mês das abas Mês e Calendário: a linha Total diz o nome
// inteiro, para o número não parecer errado ao lado daqueles.
function LinhaAtendente({ a, total }: { a: ResumoAtendente; total?: boolean }) {
  const media = (x: number, n: number) => (n ? fmtMedia(x / n) : TRACO)
  return (
    <tr className={cn(total && 'total')}>
      <td className="cel-titulo font-medium">{a.grupo}</td>
      <td className={cn('num font-semibold', celApoio(a.contatos > 0))}>{n0(a.contatos)}<Palavra n={a.contatos} um="contato" varios="contatos" /></td>
      <td className={cn('num', celApoio(a.leads > 0))}>{n0(a.leads)}<Palavra n={a.leads} um="lead" varios="leads" /></td>
      <td className={cn('num col-p2', celMais(a.leads > 0))}>{media(a.contatos, a.leads)}<Palavra um="por lead" /></td>
      <td className={cn('num col-p2', celMais(a.dias > 0))}>{n0(a.dias)}<Palavra n={a.dias} um="dia com contato" varios="dias com contato" /></td>
      <td className={cn('num col-p2', celMais(a.dias > 0))}>{media(a.contatos, a.dias)}<Palavra um="por dia" /></td>
      <td className={cn('num cel-valor', a.ganhos && 'text-gain')} data-rotulo={total ? 'ganhos dos contatados' : a.ganhos === 1 ? 'ganho' : 'ganhos'}>{n0(a.ganhos)}</td>
      <td className={cn('num font-semibold', celMais(a.ganhos > 0))}>{media(a.contatos_ganhos, a.ganhos)}<Palavra um="contatos até ganhar" /></td>
    </tr>
  )
}

// Contatos com clientes: corretoras como texto ("BTG 168 · Genial 1").
// Celular: os contatos à direita; "N clientes" e as corretoras na linha de apoio.
function LinhaContatoCliente({ a, total }: { a: ResumoContatosClientes; total?: boolean }) {
  const media = (x: number, n: number) => (n ? fmtMedia(x / n) : TRACO)
  const corretoras = Object.entries(a.por_corretora).sort((x, y) => y[1] - x[1]).map(([c, n]) => `${c === 'GENIAL' ? 'Genial' : c} ${fmtNum(n)}`).join(' · ')
  return (
    <tr className={cn(total && 'total')}>
      <td className="cel-titulo font-medium">{a.grupo}</td>
      <td className="num cel-valor font-semibold" data-rotulo={a.contatos === 1 ? 'contato' : 'contatos'}>{n0(a.contatos)}</td>
      <td className={cn('num', celApoio(a.clientes > 0))}>{n0(a.clientes)}<Palavra n={a.clientes} um="cliente" varios="clientes" /></td>
      <td className={cn('num col-p2', celMais(a.clientes > 0))}>{media(a.contatos, a.clientes)}<Palavra um="por cliente" /></td>
      <td className={cn('num col-p2', celMais(a.dias > 0))}>{n0(a.dias)}<Palavra n={a.dias} um="dia com contato" varios="dias com contato" /></td>
      <td className={cn('num col-p2', celMais(a.dias > 0))}>{media(a.contatos, a.dias)}<Palavra um="por dia" /></td>
      <td className={cn('muted col-p2', celApoio(!!corretoras))}>{corretoras || TRACO}</td>
    </tr>
  )
}

// Campanha de ativação por atendente (S52).
// Celular: contas, contatos, primeiras operações e reativadas na linha de apoio; a receita à direita.
function LinhaAtivacao({ a, total }: { a: AtivacaoAtendenteRow; total?: boolean }) {
  return (
    <tr className={cn(total && 'total')}>
      <td className="cel-titulo font-medium">{a.ativador}</td>
      <td className={cn('num', celApoio(a.contas > 0))}>{n0(a.contas)}<Palavra n={a.contas} um="conta" varios="contas" /></td>
      <td className={cn('num font-semibold', celApoio(a.contatos > 0))}>{n0(a.contatos)}<Palavra n={a.contatos} um="contato" varios="contatos" /></td>
      <td className={cn('num col-p2', celMais(a.contas_contatadas > 0))}>{n0(a.contas_contatadas)}<Palavra n={a.contas_contatadas} um="contatada" varios="contatadas" /></td>
      <td className={cn('num col-p2', celMais(a.operaram > 0))}>{n0(a.operaram)}<Palavra n={a.operaram} um="operou" varios="operaram" /></td>
      <td className={cn('num font-semibold', a.ativados && 'text-gain', celApoio(a.ativados > 0))}>{n0(a.ativados)}<Palavra n={a.ativados} um="primeira operação" varios="primeiras operações" /></td>
      <td className={cn('num font-semibold', a.reativados && 'text-gain', celApoio(a.reativados > 0))}>{n0(a.reativados)}<Palavra n={a.reativados} um="reativada" varios="reativadas" /></td>
      <td className={cn('num col-p3', celMais(a.lotes > 0))}>{n0(a.lotes)}<Palavra n={a.lotes} um="lote" varios="lotes" /></td>
      <td className="num cel-valor" data-rotulo="receita">{r0(a.receita)}</td>
    </tr>
  )
}
