// Giro por horário (S58): matriz dia × hora montada a partir das subidas da planilha de lotes.
// Server Component: só lê o resultado de giroPorHorario.
import Link from 'next/link'
import { Panel } from '@/components/ui/Panel'
import { CelulaCalor, LinhaVazia, TRACO, dataCurta, estiloCalor, n0 } from '@/components/gestao/Celulas'
import { fmtNum, fmtPct } from '@/lib/format'
import { HORAS, horaCurta, type GiroHorario } from '@/lib/gestao/horario'

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const diaSemana = (iso: string) => DIAS[new Date(iso + 'T12:00:00').getDay()]

export function GiroPorHorario({ giro, base, diasComGiro }: { giro: GiroHorario; base: string; diasComGiro: number }) {
  const max = Math.max(0, ...giro.dias.flatMap(d => d.horas))
  const semParcial = Math.max(0, diasComGiro - giro.dias.length)
  const partes = giro.totais.map(v => (giro.total ? (v / giro.total) * 100 : 0))
  const maxParte = Math.max(0, ...partes)
  const colunas = HORAS.length + 4
  const subtitulo = giro.dias.length
    ? `${fmtNum(giro.dias.length)} dias com subida parcial${semParcial ? ` · ${fmtNum(semParcial)} dias com giro ficaram de fora por terem só a planilha do fim do dia` : ''} · a hora é a do nome do arquivo ("parcial 13h40") ou a da subida`
    : 'Nenhuma subida parcial no período.'

  return (
    <Panel title="Giro por horário" subtitle={subtitulo}>
      <div className="tbl-wrap max-h-[60vh]">
        <table className="tbl tbl-dense">
          <thead>
            <tr>
              <th className="sticky-col">Data</th>
              <th className="col-p2">Dia</th>
              {HORAS.map(h => <th key={h} className="num">{h}h</th>)}
              <th className="num">Total</th>
              <th className="col-p2">Subidas</th>
            </tr>
          </thead>
          <tbody>
            {giro.dias.length === 0 && (
              <LinhaVazia colunas={colunas}>Suba a planilha de lotes mais de uma vez durante o pregão: cada subida registra o giro até aquela hora.</LinhaVazia>
            )}
            {giro.dias.map(d => (
              <tr key={d.dia}>
                <td className="num font-medium sticky-col"><Link href={`${base}/lotes/${d.dia}`} className="hover:text-accent hover:underline">{dataCurta(d.dia)}</Link></td>
                <td className="muted col-p2">{diaSemana(d.dia)}</td>
                {HORAS.map((h, i) => (d.completo || h < d.ate
                  ? <CelulaCalor key={h} valor={d.horas[i]} max={max} />
                  : <td key={h} className="num subtle" title={`Em aberto: a última subida foi às ${horaCurta(d.ate)}`} />))}
                <td className="num font-semibold">{n0(d.total)}</td>
                <td className="muted col-p2 whitespace-nowrap">{d.completo ? fmtNum(d.subidas) : `${fmtNum(d.subidas)} · até ${horaCurta(d.ate)}`}</td>
              </tr>
            ))}
          </tbody>
          {giro.diasCompletos > 0 && (
            <tfoot>
              <tr className="total">
                <td className="sticky-col">Total</td>
                <td className="muted col-p2">{fmtNum(giro.diasCompletos)} dias</td>
                {giro.totais.map((v, i) => <td key={i} className="num">{n0(v)}</td>)}
                <td className="num">{n0(giro.total)}</td>
                <td className="col-p2" />
              </tr>
              <tr className="total">
                <td className="sticky-col">% do giro</td>
                <td className="muted col-p2">dias completos</td>
                {partes.map((p, i) => <td key={i} className="num" style={estiloCalor(p, maxParte)}>{p ? fmtPct(p) : TRACO}</td>)}
                <td className="num">{fmtPct(100, 0)}</td>
                <td className="col-p2" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-3 text-micro text-fg-subtle">
        A planilha do BTG soma os lotes por dia; cada subida durante o pregão registra o acumulado até aquela hora, e a diferença entre duas subidas é o giro do intervalo, repartido pelas horas que ele cobre. A primeira subida conta desde as 9h; a planilha final, até 18h30. Entra o dia com subida até as 17h30; sem a planilha final ele fica incompleto e fora do total.
      </p>
    </Panel>
  )
}
