// Giro diário › Dia a dia: cada dia com giro do período, do mais recente para o mais antigo.
// A data abre as operações do dia (onde a corretagem de uma operação pode ser ajustada).
import Link from 'next/link'
import type { Contexto } from '@/lib/gestao/pagina'
import { diario } from '@/lib/gestao/consultas'
import { MEDIA_MOVEL, resumoPeriodo, serieDoPeriodo } from '@/lib/gestao/giro'
import { diaSemanaCurto } from '@/lib/gestao/mensagens'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { BarraCelula, LinhaVazia, TRACO, Variacao, dataCurta, n0, r0 } from '@/components/gestao/Celulas'
import { ehParcial } from './comum'

export async function AbaDiaADia({ ctx, inicio, fim, ultima, momento: momentoP }: { ctx: Contexto; inicio: string; fim: string; ultima: string | null; momento: Promise<string | null> }) {
  const [dias, momento] = await Promise.all([diario(ctx.corretora, inicio, fim), momentoP])
  const r = resumoPeriodo(dias)
  const serie = serieDoPeriodo(dias)
  const maxLotes = Math.max(0, ...dias.map(d => d.lotes))
  const parcial = ehParcial(momento) ? ultima : null

  return (
    <Panel title={`Dia a dia · ${fmtNum(r.dias)} ${r.dias === 1 ? 'dia' : 'dias'} com giro`}
      subtitle={`Mais recente primeiro · clique na data para ver e ajustar as operações do dia. Média móvel de ${MEDIA_MOVEL} dias; acumulado e "vs média" contam dentro do período.`}>
      <div className="tbl-wrap max-h-[70vh]">
        <table className="tbl tbl-dense">
          <thead>
            <tr>
              <th>Data</th><th className="col-p2">Dia</th><th className="num">Lotes</th><th className="num col-p2">Zerados</th><th className="num col-p2">Clientes</th><th className="num col-p3">Operações</th>
              <th className="num">Receita</th><th className="num">Var. dia ant.</th><th className="num col-p3">Média móvel</th><th className="num col-p3">Acumulado</th><th className="num col-p2">vs média</th>
            </tr>
          </thead>
          <tbody>
            {serie.length === 0 && <LinhaVazia colunas={11}>Sem lotes de {dataCurta(inicio)} a {dataCurta(fim)}.</LinhaVazia>}
            {serie.length > 0 && (
              <tr className="total">
                <td>Período</td>
                <td className="col-p2">{r.dias} {r.dias === 1 ? 'dia' : 'dias'}</td>
                <td className="num">{fmtNum(r.lotes)}</td>
                <td className="num col-p2">{n0(r.zerados)}</td>
                <td className="num col-p2" title="Média de clientes com giro por dia">{fmtNum(Math.round(r.clientesMedia))}/dia</td>
                <td className="num col-p3">{n0(r.operacoes)}</td>
                <td className="num">{r0(r.receita)}</td>
                <td className="num subtle">{TRACO}</td>
                <td className="num col-p3" title="Média de lotes por dia com giro">{fmtNum(Math.round(r.media))}</td>
                <td className="num col-p3">{fmtNum(r.lotes)}</td>
                <td className="num subtle col-p2">{TRACO}</td>
              </tr>
            )}
            {[...serie].reverse().map(d => {
              const aberto = d.dia === parcial
              return (
                <tr key={d.dia}>
                  <td className="whitespace-nowrap font-medium tabular-nums">
                    <Link href={`${ctx.base}/lotes/${d.dia}`} className="hover:text-accent hover:underline">{dataCurta(d.dia)}</Link>
                    {aberto && <span className="ml-1.5 text-micro font-normal text-warn" title={`O dia ainda não fechou: ${momento}`}>parcial</span>}
                  </td>
                  <td className="muted col-p2">{diaSemanaCurto(d.dia)}</td>
                  <td className="num"><BarraCelula valor={d.lotes} max={maxLotes} largura={80} /></td>
                  <td className={cn('num col-p2', !d.zerados && 'subtle')}>{n0(d.zerados)}</td>
                  <td className="num col-p2">{n0(d.clientes)}</td>
                  <td className="num col-p3">{n0(d.operacoes)}</td>
                  <td className="num">{r0(d.receita)}</td>
                  {/* dia ainda correndo: a comparação com um dia inteiro fica sem cor */}
                  <td className="num"><Variacao atual={d.lotes} anterior={d.anteriorLotes} className={aberto ? 'text-fg-muted' : undefined} /></td>
                  <td className="num col-p3">{fmtNum(Math.round(d.mm))}</td>
                  <td className="num muted col-p3">{fmtNum(d.acumulado)}</td>
                  <td className={cn('num col-p2', aberto ? 'muted' : d.acimaMedia ? 'text-gain' : 'text-loss')}>{d.acimaMedia ? 'acima' : 'abaixo'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
