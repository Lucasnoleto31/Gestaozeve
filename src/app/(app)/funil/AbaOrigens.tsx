// Funil › Origens: de onde vêm os leads e quanto cada origem rendeu (conta aberta, operação, receita).
//
// No celular (DESIGN.md §8) a aba abre pela frase com as origens campeãs (no lugar dos quatro cartões, que
// ali mostravam um nome como se fosse número) e a tabela vira lista: a origem, quantos leads, quantos
// tombaram e operaram, e a receita à direita. As outras colunas entram com "Mais números"; as origens com
// poucos leads e nenhuma conta aberta ficam atrás de "ver as outras". O computador não muda.
import { funilSafraPor } from '@/lib/gestao/consultas'
import { janelaMeses, mesCurto, mesLongo } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Resumo } from '@/components/gestao/Resumo'
import { BarraCelula, LinhaVazia, TRACO, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { DicaNoTitulo, Palavra } from './Celular'
import { MaisNumeros } from './MaisNumeros'
import { MostrarMais, ALEM_NO_CELULAR } from '@/components/ui/MostrarMais'
import { LISTA_LARGA, celApoio, celMais, plural, type PeriodoFunil } from './comum'

const EXPLICA = 'Os leads que entraram no período por origem e até onde chegaram até hoje: tombaram = abriram a conta; operaram = já giraram. Receita = o que esses leads já deixaram.'

export async function AbaOrigens({ mesRef, periodo }: { mesRef: string; periodo: PeriodoFunil }) {
  const soMes = periodo === 'mes'
  const meses = janelaMeses(mesRef, 12)
  const rotulo = soMes ? mesLongo(mesRef) : `${mesCurto(meses[0])} a ${mesCurto(mesRef)}`
  const dados = await funilSafraPor('origem', mesRef, soMes ? 1 : 12)
  const linhas = [...dados].sort((a, b) => b.recebidos - a.recebidos || a.grupo.localeCompare(b.grupo, 'pt-BR'))
  const max = Math.max(0, ...linhas.map(g => g.recebidos))
  const tot = linhas.reduce((t, g) => ({
    recebidos: t.recebidos + g.recebidos, contatados: t.contatados + g.contatados, em_contato: t.em_contato + g.em_contato, perdidos: t.perdidos + g.perdidos_funil,
    tombaram: t.tombaram + g.ativados, operaram: t.operaram + g.com_giro, receita: t.receita + g.receita,
  }), { recebidos: 0, contatados: 0, em_contato: 0, perdidos: 0, tombaram: 0, operaram: 0, receita: 0 })
  const maior = <K extends 'recebidos' | 'ativados' | 'receita'>(k: K) => linhas.filter(g => g[k] > 0).sort((a, b) => b[k] - a[k])[0]
  const volume = maior('recebidos'), contas = maior('ativados'), receita = maior('receita')
  // melhor aproveitamento entre as origens com volume para comparar (5 leads ou mais)
  const aproveitamento = linhas.filter(g => g.recebidos >= 5 && g.ativados > 0).sort((a, b) => b.ativados / b.recebidos - a.ativados / a.recebidos)[0]

  // A frase do celular diz o que os quatro cartões dizem, com o período na frente (o seletor de mês continua
  // mostrando um mês só mesmo quando a conta é de 12 meses)
  const quando = `${soMes ? 'Em' : 'De'} ${rotulo}`
  const parte = volume ? `${fmtNum(volume.recebidos)} dos ${fmtNum(tot.recebidos)} leads (${fmtPct((volume.recebidos / tot.recebidos) * 100, 0)})` : ''
  const umaSo = volume && contas?.grupo === volume.grupo && receita?.grupo === volume.grupo
  // "Tombaram" é a palavra da lista e do Funil inteiro; na primeira vez que aparece, a explicação vem junto
  const tombaram = (n: number) => plural(n, 'tombou (abriu a conta)', 'tombaram (abriram a conta)')
  const frase = !volume ? `Sem leads em ${rotulo}.`
    : umaSo && contas && receita ? `${quando}, a origem ${volume.grupo} trouxe ${parte}; ${tombaram(contas.ativados)} e a receita foi de ${rCurto(receita.receita)}.`
    : `${quando}, a origem com mais leads foi ${volume.grupo}: ${parte}.`
      + (contas ? ` Mais leads que tombaram (abriram a conta): ${contas.grupo} (${fmtNum(contas.ativados)}).` : ' Nenhum lead tombou (abriu a conta) no período.')
      + (receita ? ` Maior receita: ${receita.grupo} (${rCurto(receita.receita)}).` : '')
  const apoio = aproveitamento
    ? `Melhor aproveitamento entre as origens com 5 leads ou mais: ${aproveitamento.grupo}, ${fmtPct((aproveitamento.ativados / aproveitamento.recebidos) * 100, 0)} dos leads tombaram.`
    : null

  // Celular: a origem com menos de 5 leads, sem conta aberta e sem receita fica atrás de "ver as outras"
  // (é o mesmo corte de 5 leads do melhor aproveitamento). Só quando sobra lista de verdade: em "Só o mês"
  // quase todas são pequenas e aparecem todas.
  const pequena = (g: (typeof linhas)[number]) => g.recebidos < 5 && g.ativados === 0 && !g.receita
  const pequenas = linhas.filter(pequena).length
  const recolhe = pequenas >= 3 && linhas.length - pequenas >= 3

  const tabela = (
    <div className="tbl-wrap">
      <table className="tbl tbl-dense tbl-lista" style={LISTA_LARGA}>
        <thead>
          <tr>
            <th>Origem</th><th className="num">Entraram</th><th className="num col-p2">Contatados</th><th className="num col-p3">Em contato</th><th className="num col-p2">Perdidos</th>
            <th className="num">Tombaram</th><th className="num">Operaram</th><th className="num col-p2">% tombaram</th><th className="num">Receita</th><th className="num col-p2">R$ por lead</th>
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 && <LinhaVazia colunas={10}>Sem leads em {rotulo}.</LinhaVazia>}
          {linhas.map(g => (
            <tr key={g.grupo} className={recolhe && pequena(g) ? ALEM_NO_CELULAR : undefined}>
              <td className="cel-titulo font-medium">{g.grupo}</td>
              {/* celular: a barra não informa (uma origem sozinha tem quase todos os leads); fica o número */}
              <td className={cn('num max-md:[&_.bar-track]:hidden', celApoio())}><BarraCelula valor={g.recebidos} max={max} /><Palavra n={g.recebidos} um="lead" varios="leads" /></td>
              <td className={cn('num col-p2', celMais(g.contatados > 0))}>{n0(g.contatados)}<Palavra n={g.contatados} um="contatado" varios="contatados" /></td>
              <td className={cn('num col-p3', celMais(g.em_contato > 0))}>{n0(g.em_contato)}<Palavra um="em contato" /></td>
              <td className={cn('num col-p2', g.perdidos_funil ? 'text-loss' : 'subtle', celMais(g.perdidos_funil > 0))}>{n0(g.perdidos_funil)}<Palavra n={g.perdidos_funil} um="perdido" varios="perdidos" /></td>
              <td className={cn('num font-semibold', !g.ativados && 'subtle', celApoio(g.ativados > 0))}>{n0(g.ativados)}<Palavra n={g.ativados} um="tombou" varios="tombaram" /></td>
              <td className={cn('num font-semibold', g.com_giro ? 'text-gain' : 'subtle', celApoio(g.com_giro > 0))}>{n0(g.com_giro)}<Palavra n={g.com_giro} um="operou" varios="operaram" /></td>
              <td className={cn('num col-p2', celMais(g.ativados > 0))}>{g.recebidos ? fmtPct((g.ativados / g.recebidos) * 100, 0) : TRACO}<Palavra um="dos leads tombaram" /></td>
              <td className={cn('num cel-valor', !g.receita && 'subtle')} data-rotulo="receita">{r0(g.receita)}</td>
              <td className={cn('num col-p2', !g.receita && 'subtle', celMais(g.recebidos > 0 && g.receita > 0))}>{g.recebidos && g.receita ? r0(g.receita / g.recebidos) : TRACO}<Palavra um="por lead" /></td>
            </tr>
          ))}
        </tbody>
        {linhas.length > 1 && (
          <tfoot>
            <tr className="total">
              <td className="cel-titulo">Total</td>
              <td className={cn('num', celApoio())}>{n0(tot.recebidos)}<Palavra n={tot.recebidos} um="lead" varios="leads" /></td>
              <td className={cn('num col-p2', celMais(tot.contatados > 0))}>{n0(tot.contatados)}<Palavra n={tot.contatados} um="contatado" varios="contatados" /></td>
              <td className={cn('num col-p3', celMais(tot.em_contato > 0))}>{n0(tot.em_contato)}<Palavra um="em contato" /></td>
              <td className={cn('num col-p2', celMais(tot.perdidos > 0))}>{n0(tot.perdidos)}<Palavra n={tot.perdidos} um="perdido" varios="perdidos" /></td>
              <td className={cn('num', celApoio(tot.tombaram > 0))}>{n0(tot.tombaram)}<Palavra n={tot.tombaram} um="tombou" varios="tombaram" /></td>
              <td className={cn('num', celApoio(tot.operaram > 0))}>{n0(tot.operaram)}<Palavra n={tot.operaram} um="operou" varios="operaram" /></td>
              <td className={cn('num col-p2', celMais(tot.tombaram > 0))}>{tot.recebidos ? fmtPct((tot.tombaram / tot.recebidos) * 100, 0) : TRACO}<Palavra um="dos leads tombaram" /></td>
              <td className="num cel-valor" data-rotulo="receita">{r0(tot.receita)}</td>
              <td className={cn('num col-p2', celMais(tot.recebidos > 0 && tot.receita > 0))}>{tot.recebidos && tot.receita ? r0(tot.receita / tot.recebidos) : TRACO}<Palavra um="por lead" /></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )

  return (
    <>
      <div className="md:hidden"><Resumo frase={frase} apoio={apoio} /></div>

      <KpiRow cols={4} className="max-md:hidden">
        <KpiCard label="Mais leads" value={volume?.grupo ?? TRACO} sub={volume ? `${fmtNum(volume.recebidos)} de ${fmtNum(tot.recebidos)} leads (${fmtPct((volume.recebidos / tot.recebidos) * 100, 0)})` : `sem leads em ${rotulo}`} />
        <KpiCard label="Mais contas abertas" value={contas?.grupo ?? TRACO} sub={contas ? `${fmtNum(contas.ativados)} tombaram · ${fmtNum(contas.com_giro)} operaram` : 'nenhuma conta aberta no período'} />
        <KpiCard label="Melhor aproveitamento" value={aproveitamento?.grupo ?? TRACO} sub={aproveitamento ? `${fmtPct((aproveitamento.ativados / aproveitamento.recebidos) * 100, 0)} dos leads abriram conta (origens com 5+ leads)` : 'sem origem com 5 leads e conta aberta'} />
        <KpiCard destaque label="Maior receita" value={receita?.grupo ?? TRACO} sub={receita ? `${rCurto(receita.receita)} dos leads dessa origem até hoje` : 'nenhuma receita ainda'} />
      </KpiRow>

      <Panel title={<>Origens dos leads de {rotulo}<DicaNoTitulo texto={EXPLICA} /></>} subtitle={<span className="max-md:hidden">{EXPLICA}</span>}>
        <MaisNumeros>
          {recolhe ? <MostrarMais rotulo={`ver as outras ${fmtNum(pequenas)} origens`}>{tabela}</MostrarMais> : tabela}
        </MaisNumeros>
      </Panel>
    </>
  )
}
