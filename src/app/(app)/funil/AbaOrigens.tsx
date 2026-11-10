// Funil › Origens: de onde vêm os leads e quanto cada origem rendeu (conta aberta, operação, receita).
import { funilSafraPor } from '@/lib/gestao/consultas'
import { janelaMeses, mesCurto, mesLongo } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { BarraCelula, LinhaVazia, TRACO, n0, r0, rCurto } from '@/components/gestao/Celulas'
import type { PeriodoFunil } from './comum'

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

  return (
    <>
      <KpiRow cols={4}>
        <KpiCard label="Mais leads" value={volume?.grupo ?? TRACO} sub={volume ? `${fmtNum(volume.recebidos)} de ${fmtNum(tot.recebidos)} leads (${fmtPct((volume.recebidos / tot.recebidos) * 100, 0)})` : `sem leads em ${rotulo}`} />
        <KpiCard label="Mais contas abertas" value={contas?.grupo ?? TRACO} sub={contas ? `${fmtNum(contas.ativados)} tombaram · ${fmtNum(contas.com_giro)} operaram` : 'nenhuma conta aberta no período'} />
        <KpiCard label="Melhor aproveitamento" value={aproveitamento?.grupo ?? TRACO} sub={aproveitamento ? `${fmtPct((aproveitamento.ativados / aproveitamento.recebidos) * 100, 0)} dos leads abriram conta (origens com 5+ leads)` : 'sem origem com 5 leads e conta aberta'} />
        <KpiCard destaque label="Maior receita" value={receita?.grupo ?? TRACO} sub={receita ? `${rCurto(receita.receita)} dos leads dessa origem até hoje` : 'nenhuma receita ainda'} />
      </KpiRow>

      <Panel title={`Origens dos leads de ${rotulo}`} subtitle="Os leads que entraram no período por origem e até onde chegaram até hoje: tombaram = abriram a conta; operaram = já giraram. Receita = o que esses leads já deixaram.">
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead>
              <tr>
                <th>Origem</th><th className="num">Entraram</th><th className="num col-p2">Contatados</th><th className="num col-p3">Em contato</th><th className="num col-p2">Perdidos</th>
                <th className="num">Tombaram</th><th className="num">Operaram</th><th className="num col-p2">% tombaram</th><th className="num">Receita</th><th className="num col-p2">R$ por lead</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && <LinhaVazia colunas={10}>Sem leads em {rotulo}.</LinhaVazia>}
              {linhas.map(g => (
                <tr key={g.grupo}>
                  <td className="font-medium">{g.grupo}</td>
                  <td className="num"><BarraCelula valor={g.recebidos} max={max} /></td>
                  <td className="num col-p2">{n0(g.contatados)}</td>
                  <td className="num col-p3">{n0(g.em_contato)}</td>
                  <td className={cn('num col-p2', g.perdidos_funil ? 'text-loss' : 'subtle')}>{n0(g.perdidos_funil)}</td>
                  <td className={cn('num font-semibold', !g.ativados && 'subtle')}>{n0(g.ativados)}</td>
                  <td className={cn('num font-semibold', g.com_giro ? 'text-gain' : 'subtle')}>{n0(g.com_giro)}</td>
                  <td className="num col-p2">{g.recebidos ? fmtPct((g.ativados / g.recebidos) * 100, 0) : TRACO}</td>
                  <td className={cn('num', !g.receita && 'subtle')}>{r0(g.receita)}</td>
                  <td className={cn('num col-p2', !g.receita && 'subtle')}>{g.recebidos && g.receita ? r0(g.receita / g.recebidos) : TRACO}</td>
                </tr>
              ))}
            </tbody>
            {linhas.length > 1 && (
              <tfoot>
                <tr className="total">
                  <td>Total</td>
                  <td className="num">{n0(tot.recebidos)}</td>
                  <td className="num col-p2">{n0(tot.contatados)}</td>
                  <td className="num col-p3">{n0(tot.em_contato)}</td>
                  <td className="num col-p2">{n0(tot.perdidos)}</td>
                  <td className="num">{n0(tot.tombaram)}</td>
                  <td className="num">{n0(tot.operaram)}</td>
                  <td className="num col-p2">{tot.recebidos ? fmtPct((tot.tombaram / tot.recebidos) * 100, 0) : TRACO}</td>
                  <td className="num">{r0(tot.receita)}</td>
                  <td className="num col-p2">{tot.recebidos && tot.receita ? r0(tot.receita / tot.recebidos) : TRACO}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Panel>
    </>
  )
}
