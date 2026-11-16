// A parte de um parceiro na comissão do BTG num mês (parâmetro repasse_parceiros): o bloco do BTG na
// página dele em Comissões e, sem os links, na versão para imprimir. Lucas, 16/11/2026, sobre o Fabio
// PTAX: "BTG: corretagem | zeragem | igual foi com a Atual Capital mês passado". A conta é a do Painel do
// BTG; o valor não entra no saldo dos pagamentos de Comissões, porque o acerto do BTG segue o fechamento
// mensal (como o da Atual Capital).
import Link from 'next/link'
import { participacaoBtg } from '@/lib/gestao/consultasParticipacao'
import { mesCurto, mesLongo } from '@/lib/gestao/meses'
import { fmtBRL2, fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { n0, r0 } from '@/components/gestao/Celulas'

const pct = (v: number) => fmtPct(v, Number.isInteger(v) ? 0 : 1).replace('%', ' %')

export async function ParticipacaoBtg({ parceiro, mesRef, impressao }: { parceiro: string; mesRef: string; impressao?: boolean }) {
  const b = await participacaoBtg(parceiro, mesRef)
  if (!b) return null
  // no papel o bloco só aparece quando há valor
  if (impressao && b.receita <= 0) return null
  const mes = mesCurto(mesRef)
  const regra = `A comissão que o BTG paga sobre os clientes dele (corretagem e zeragem) paga o imposto de ${pct(b.impostoPct)} e ${parceiro} leva ${pct(b.regra.pctParceiro)} do que sobra.`
  return (
    <Panel title="BTG · participação na comissão" subtitle={`${regra} Clientes dele no BTG são os que têm ${parceiro} no campo Parceiro da ficha.`}>
      {b.receita > 0 ? (
        <>
          <KpiRow cols={3}>
            <KpiCard label={`Parte de ${parceiro} em ${mes}`} value={fmtBRL2(b.parte)} sub={`${pct(b.regra.pctParceiro)} de ${fmtBRL2(b.comissao - b.imposto)}`} />
            <KpiCard label="Receita dos clientes dele" value={fmtBRL2(b.receita)} sub={`${fmtNum(b.clientes.length)} ${b.clientes.length === 1 ? 'cliente girou' : 'clientes giraram'} · corretagem e zeragem`} />
            <KpiCard label="Comissão do BTG sobre eles" value={fmtBRL2(b.comissao)} sub={`${pct(Math.round(b.pctComissao * 10) / 10)} da receita líquida · imposto ${fmtBRL2(b.imposto)}`} />
          </KpiRow>
          <div className="tbl-wrap mt-4">
            <table className="tbl tbl-dense">
              <thead><tr><th>Cliente</th><th className="num">Lotes</th><th className={cn('num', !impressao && 'col-p2')}>Receita</th><th className="num">A receber</th></tr></thead>
              <tbody>
                {b.clientes.map(c => (
                  <tr key={c.cliente_id}>
                    <td className="max-w-[260px] truncate font-medium">{impressao ? c.nome : <Link href={`/btg/clientes/${c.cliente_id}`} className="link">{c.nome}</Link>}</td>
                    <td className={cn('num', !c.lotes && 'subtle')}>{n0(c.lotes)}</td>
                    <td className={cn('num', !impressao && 'col-p2')}>{r0(c.receita)}</td>
                    <td className="num font-semibold">{r0(c.parte)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="total">
                  <td>{fmtNum(b.clientes.length)} {b.clientes.length === 1 ? 'cliente' : 'clientes'}</td>
                  <td className="num">{n0(b.clientes.reduce((s, c) => s + c.lotes, 0))}</td>
                  <td className={cn('num', !impressao && 'col-p2')}>{r0(b.receita)}</td>
                  <td className="num">{r0(b.parte)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <p className="max-w-3xl text-dense text-fg-muted">
          Nada em {mesLongo(mesRef)}: {b.contas > 0
            ? `nenhuma das ${fmtNum(b.contas)} ${b.contas === 1 ? 'conta dele' : 'contas dele'} no BTG gerou receita no mês.`
            : `ainda não há cliente do BTG com ${parceiro} no campo Parceiro da ficha. Para um cliente contar, escreva ${parceiro} nesse campo, na ficha dele no BTG.`}
        </p>
      )}
      <p className="mt-3 max-w-3xl text-label text-fg-subtle">
        Mesma conta do Painel do BTG{b.fechado ? ', com o percentual de comissão do fechamento do mês' : '; antes do fechamento do mês é uma prévia pelas faixas de comissão'}.
        Este valor não entra no saldo dos pagamentos de Comissões: o acerto do BTG segue o fechamento mensal.
      </p>
    </Panel>
  )
}
