// Ficha do cliente › Contas e tarifas: as contas do cliente na corretora e a tarifa por lote.
// No celular (DESIGN.md §8) cada conta é um item (tbl-lista): o número, os lotes do mês à direita e,
// embaixo, a linha dos 12 meses, que abre com um toque o que as colunas escondidas mostram no
// computador. O status só aparece na linha quando foge do normal (o "Migrado" se repetia em todas).
import type { CSSProperties } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Contexto } from '@/lib/gestao/pagina'
import { mesCurto } from '@/lib/gestao/meses'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { Dica } from '@/components/ui/Dica'
import { Resumo } from '@/components/gestao/Resumo'
import { LinhaVazia, StatusBadge, TRACO, dataPt, n0, n2, r0 } from '@/components/gestao/Celulas'
import { TarifasCliente } from './TarifasCliente'
import type { Ficha } from './comum'

const SO_NOS_LOTES = 'Conta que só aparece nos lotes; ligada ao cliente pelo nome ou ID'
const CONTA_PRINCIPAL = 'A conta principal representa o cliente nas contagens; lotes e receita somam todas.'

export function AbaContas({ ctx, id, ficha, admin }: { ctx: Contexto; id: string; ficha: Ficha; admin: boolean }) {
  const { corretora, mesRef } = ctx
  const { resumo, contas, tarifas } = ficha
  const mes = mesCurto(mesRef)
  // quanto o cliente pagou por lote no mês, com a zeragem dentro (vinha no cartão "Tarifa vigente" do Resumo)
  const zeragemMes = resumo?.receita_zeragem_mes ?? 0
  const efetiva = resumo && resumo.lotes_mes > 0 ? resumo.receita_mes / resumo.lotes_mes : null
  // Celular: com mais de uma conta, a frase que abre a aba conta quantas operaram no mês (com uma conta
  // só a lista já é a resposta: a frase repetiria a linha)
  const comLotes = contas.filter(c => c.lotes_mes > 0).length
  const frase = contas.length > 1 ? `${fmtNum(contas.length)} contas: ${comLotes ? fmtNum(comLotes) : 'nenhuma'} com lotes em ${mes}.` : null

  return (
    <div className="grid gap-8 xl:grid-cols-3">
      {frase && <div className="-mb-3 md:hidden"><Resumo frase={frase} /></div>}

      <Panel className="xl:col-span-2"
        title={<>Contas · {contas.length}<Dica className="ml-1.5 md:hidden" texto={CONTA_PRINCIPAL} /></>}
        subtitle={<span className="max-md:hidden">{`${CONTA_PRINCIPAL} Mês = ${mes}.`}</span>}>
        <div className="tbl-wrap">
          <table className="tbl tbl-dense tbl-lista" style={{ '--lista-direita': '6.75rem' } as CSSProperties}>
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
                  <td className="cel-titulo whitespace-nowrap font-medium tabular-nums">{c.conta}{c.conta_digito && <span className="ml-1 text-micro text-fg-subtle max-md:hidden">{c.conta_digito}</span>}{c.principal && <span className="ml-1.5 text-micro text-accent">principal</span>}</td>
                  <td className="muted col-p2">{c.situacao_conta ?? TRACO}</td>
                  <td className={cn('cel-sub', c.conta_id && c.status === 'Migrado' && 'vazio')}>{c.conta_id ? <StatusBadge status={c.status} /> : <span title={SO_NOS_LOTES}><Badge variant="warn">só nos lotes</Badge></span>}</td>
                  <td className="num col-p2">{dataPt(c.data_habilitacao)}</td>
                  <td className="max-w-[160px] truncate muted col-p3">{c.assessor_nome ?? TRACO}</td>
                  {/* celular: conta sem lotes no mês diz isso em palavras, em letra comum (o traço em negrito no
                      lugar do número parecia dado faltando); no computador continua o traço */}
                  <td className={cn('cel-valor num', !c.lotes_mes && 'subtle')} data-rotulo={c.lotes_mes ? `lotes em ${mes}` : `em ${mes}`}>
                    {c.lotes_mes ? n0(c.lotes_mes) : <><span className="max-md:hidden">{n0(c.lotes_mes)}</span><span className="text-dense font-normal text-fg-muted md:hidden">sem lotes</span></>}
                  </td>
                  <td className={cn('num font-medium', !c.lotes_12m && 'subtle')}>{n0(c.lotes_12m)}</td>
                  <td className={cn('num col-p2', !c.receita_mes && 'subtle')}>{r0(c.receita_mes)}</td>
                  <td className={cn('num col-p2', !c.receita_12m && 'subtle')}>{r0(c.receita_12m)}</td>
                  <td className="num col-p2">{dataPt(c.ultimo_giro)}</td>
                  {/* só no celular: a linha dos 12 meses abre o que as colunas escondidas mostram no computador
                      (um "Detalhes" em cada conta repetia a mesma palavra oito vezes); com uma conta só, já vem aberta */}
                  <td className="cel-bloco max-md:mt-0.5! md:hidden">
                    <details className="group/conta" open={contas.length === 1}>
                      <summary className="flex cursor-pointer list-none items-center gap-1 py-0.5 text-label text-fg-muted after:absolute after:inset-x-0 after:-inset-y-2.5 [&::-webkit-details-marker]:hidden">
                        <ChevronRight className="-ml-0.5 h-3.5 w-3.5 shrink-0 transition-transform group-open/conta:rotate-90" aria-hidden />
                        <span>12 meses: {c.lotes_12m ? `${n0(c.lotes_12m)} lotes` : 'sem lotes'}</span>
                      </summary>
                      {/* a margem negativa devolve aos detalhes a largura que a linha reserva para o número */}
                      <dl className="mr-[calc(var(--lista-direita)*-1)] mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 pb-1 text-label">
                        <dt className="text-fg-subtle">Situação</dt><dd>{c.situacao_conta ?? TRACO}</dd>
                        <dt className="text-fg-subtle">Status</dt><dd>{c.conta_id ? c.status : `Só nos lotes: ${SO_NOS_LOTES.toLowerCase()}`}</dd>
                        <dt className="text-fg-subtle">Migração</dt><dd className="tabular-nums">{dataPt(c.data_habilitacao)}</dd>
                        <dt className="text-fg-subtle">Assessor</dt><dd>{c.assessor_nome ?? TRACO}</dd>
                        <dt className="text-fg-subtle">Receita em {mes}</dt><dd className="tabular-nums">{r0(c.receita_mes)}</dd>
                        <dt className="text-fg-subtle">Receita em 12 meses</dt><dd className="tabular-nums">{r0(c.receita_12m)}</dd>
                        <dt className="text-fg-subtle">Último giro</dt><dd className="tabular-nums">{dataPt(c.ultimo_giro)}</dd>
                        {c.conta_digito && <><dt className="text-fg-subtle">Conta com dígito</dt><dd className="tabular-nums">{c.conta_digito}</dd></>}
                      </dl>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="min-w-0">
        <TarifasCliente corretora={corretora} clienteId={id} tarifas={tarifas} admin={admin} tarifaAtual={resumo?.tarifa ?? 0}
          nota={efetiva != null && zeragemMes > 0 ? `Em ${mes}, com a zeragem, pagou R$ ${n2(efetiva)} por lote.` : null} />
      </div>
    </div>
  )
}
