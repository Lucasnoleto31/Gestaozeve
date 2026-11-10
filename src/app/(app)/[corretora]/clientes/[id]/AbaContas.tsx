// Ficha do cliente › Contas e tarifas: as contas do cliente na corretora e a tarifa por lote
import type { Contexto } from '@/lib/gestao/pagina'
import { mesCurto } from '@/lib/gestao/meses'
import { cn } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { LinhaVazia, StatusBadge, TRACO, dataPt, n0, r0 } from '@/components/gestao/Celulas'
import { TarifasCliente } from './TarifasCliente'
import type { Ficha } from './comum'

export function AbaContas({ ctx, id, ficha, admin }: { ctx: Contexto; id: string; ficha: Ficha; admin: boolean }) {
  const { corretora, mesRef } = ctx
  const { resumo, contas, tarifas } = ficha

  return (
    <div className="grid gap-8 xl:grid-cols-3">
      <Panel className="xl:col-span-2" title={`Contas · ${contas.length}`} subtitle={`A conta principal representa o cliente nas contagens; lotes e receita somam todas. Mês = ${mesCurto(mesRef)}.`}>
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead>
              <tr>
                <th>Conta</th><th className="col-p2">Situação</th><th>Status</th><th className="num col-p2">Migração</th><th className="col-p3">Assessor</th>
                <th className="num">Lotes mês</th><th className="num">Lotes 12 m</th><th className="num col-p2">Receita mês</th><th className="num col-p2">Receita 12 m</th><th className="num col-p2">Último giro</th>
              </tr>
            </thead>
            <tbody>
              {contas.length === 0 && <LinhaVazia colunas={10}>Nenhuma conta nesta corretora.</LinhaVazia>}
              {contas.map(c => (
                <tr key={c.conta_id ?? `lotes:${c.conta}`}>
                  <td className="whitespace-nowrap font-medium tabular-nums">{c.conta}{c.conta_digito && <span className="ml-1 text-micro text-fg-subtle">{c.conta_digito}</span>}{c.principal && <span className="ml-1.5 text-micro text-accent">principal</span>}</td>
                  <td className="muted col-p2">{c.situacao_conta ?? TRACO}</td>
                  <td>{c.conta_id ? <StatusBadge status={c.status} /> : <span title="Conta que só aparece nos lotes; ligada ao cliente pelo nome ou ID"><Badge variant="warn">só nos lotes</Badge></span>}</td>
                  <td className="num col-p2">{dataPt(c.data_habilitacao)}</td>
                  <td className="max-w-[160px] truncate muted col-p3">{c.assessor_nome ?? TRACO}</td>
                  <td className={cn('num', !c.lotes_mes && 'subtle')}>{n0(c.lotes_mes)}</td>
                  <td className={cn('num font-medium', !c.lotes_12m && 'subtle')}>{n0(c.lotes_12m)}</td>
                  <td className={cn('num col-p2', !c.receita_mes && 'subtle')}>{r0(c.receita_mes)}</td>
                  <td className={cn('num col-p2', !c.receita_12m && 'subtle')}>{r0(c.receita_12m)}</td>
                  <td className="num col-p2">{dataPt(c.ultimo_giro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="min-w-0">
        <TarifasCliente corretora={corretora} clienteId={id} tarifas={tarifas} admin={admin} tarifaAtual={resumo?.tarifa ?? 0} />
      </div>
    </div>
  )
}
