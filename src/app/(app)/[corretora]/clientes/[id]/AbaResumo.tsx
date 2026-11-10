// Ficha do cliente › Resumo: o mês e o histórico em números, o giro dos 12 meses, os últimos dias
// com giro, o atendimento (contatos e retorno) e o lead de onde o cliente veio.
import Link from 'next/link'
import type { Contexto } from '@/lib/gestao/pagina'
import type { LeadDoCliente } from '@/lib/gestao/consultasFicha'
import type { GiroPorDia } from '@/lib/gestao/fichaCliente'
import { variacaoMensal } from '@/lib/gestao/projecao'
import { janelaMeses, mesAtual, mesCurto, somarMeses } from '@/lib/gestao/meses'
import type { ClienteContato, ClienteContexto } from '@/lib/gestao/tipos'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { BarraCelula, LinhaVazia, TRACO, dataCurta, n0, n2, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { ContatosCliente } from './ContatosCliente'
import { LeadDeOrigem, ListaPendencias, diaDaSemana, type Ficha, type Pendencia } from './comum'

const ULTIMOS_DIAS = 8

export function AbaResumo({ ctx, id, ficha, contexto360, leads, contatos, giro, pendencias, hrefAba }: {
  ctx: Contexto
  id: string
  ficha: Ficha
  contexto360: ClienteContexto
  leads: LeadDoCliente[]
  contatos: ClienteContato[]
  giro: GiroPorDia
  pendencias: Pendencia[]
  hrefAba: (aba: string) => string
}) {
  const { corretora, mesRef } = ctx
  const { resumo, cadastro, mensal, tarifas } = ficha
  const meses = janelaMeses(mesRef, 12)
  const mensalPorMes = new Map(mensal.map(m => [m.mes_ref, m]))
  // Variação do mês contra o anterior: sem cor enquanto o mês de referência é o corrente (parcial)
  const mesAnt = somarMeses(mesRef, -1)
  const parcial = mesRef === mesAtual()
  const pontos12 = mensal.reduce((s, m) => s + m.pontos, 0)
  const grafico = meses.map(m => { const x = mensalPorMes.get(m); return { label: mesCurto(m), lotes: x?.lotes ?? 0, receita: x?.receita ?? 0 } })
  const { posicao, receita_total_mes: receitaTotalMes, media_lotes_ativos: mediaAtivos } = contexto360
  const zeragemMes = resumo?.receita_zeragem_mes ?? 0
  // quanto o cliente paga por lote no mês, com a zeragem dentro
  const efetiva = resumo && resumo.lotes_mes > 0 ? resumo.receita_mes / resumo.lotes_mes : null
  const dias = giro.dias.slice(0, ULTIMOS_DIAS)
  const maxDia = Math.max(0, ...dias.map(d => d.lotes))
  const avisos = pendencias.filter(p => p.estado === 'warn')

  return (
    <>
      <KpiRow cols={6}>
        <KpiCard destaque label={`Lotes em ${mesCurto(mesRef)}`} value={n0(resumo?.lotes_mes)}
          delta={resumo ? variacaoMensal(resumo.lotes_mes, mensalPorMes.get(mesAnt)?.lotes ?? null, mesAnt, parcial, fmtNum) : null}
          sub={`${n0(resumo?.zerados_mes)} zerados · média de 3 meses ${n0(Math.round(resumo?.lotes_media_3m ?? 0))}`} />
        <KpiCard label={`Receita em ${mesCurto(mesRef)}`} value={rCurto(resumo?.receita_mes)}
          delta={resumo ? variacaoMensal(resumo.receita_mes, mensalPorMes.get(mesAnt)?.receita ?? null, mesAnt, parcial, rCurto) : null}
          sub={[receitaTotalMes && resumo?.receita_mes ? `${fmtPct((resumo.receita_mes / receitaTotalMes) * 100)} da receita do mês` : null, zeragemMes ? `${rCurto(zeragemMes)} de zeragem` : null].filter(Boolean).join(' · ') || undefined} />
        <KpiCard label="Lotes 12 meses" value={n0(resumo?.lotes_12m)}
          sub={posicao != null
            ? `${posicao}º de ${fmtNum(contexto360.com_giro)} clientes${mediaAtivos && resumo?.lotes_mes ? ` · ${(resumo.lotes_mes / mediaAtivos).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× a média dos ativos no mês` : ''}`
            : 'sem giro na janela'} />
        <KpiCard label="Receita 12 meses" value={rCurto(resumo?.receita_12m)} sub={`${n0(pontos12)} pontos de incentivo`} />
        {resumo && !resumo.receita_total && resumo.receita_12m > 0 ? (
          // banco ainda sem a S44: a coluna chega vazia
          <KpiCard label="Receita no histórico" value={TRACO} sub={`${n0(resumo.lotes_total)} lotes · rode o script S44 no banco`} />
        ) : (
          <KpiCard label="Receita no histórico" value={rCurto(resumo?.receita_total)} sub={`${n0(resumo?.lotes_total)} lotes · ${fmtNum(resumo?.meses_ativos ?? 0)} ${resumo?.meses_ativos === 1 ? 'mês' : 'meses'} com giro${resumo?.primeiro_mes_giro ? ` desde ${mesCurto(resumo.primeiro_mes_giro)}` : ''}`} />
        )}
        <KpiCard label="Tarifa vigente" value={resumo ? `${n2(resumo.tarifa)} R$/lote` : TRACO}
          sub={`${tarifas.length ? 'tarifa própria do cliente' : 'tarifa do assessor'}${efetiva != null && zeragemMes ? ` · com a zeragem pagou ${n2(efetiva)} por lote no mês` : ''}`} />
      </KpiRow>

      <div className="grid gap-8 xl:grid-cols-3">
        <div className="min-w-0 space-y-8 xl:col-span-2">
          <Panel title="Giro dos 12 meses" subtitle={`Lotes operados e receita de ${mesCurto(meses[0])} a ${mesCurto(mesRef)}.`}
            action={<Link href={hrefAba('giro')} className="link text-dense">Mês a mês em números</Link>}>
            <GraficoSeries
              dados={grafico}
              series={[{ key: 'lotes', nome: 'Lotes operados', tipo: 'bar' }, { key: 'receita', nome: 'Receita', tipo: 'line', eixo: 'dir', formato: 'brl' }]}
              formatoDir="brl"
              altura={220}
            />
          </Panel>

          <Panel title="Últimos dias com giro" subtitle="O que o cliente operou nos dias mais recentes: bom de ter à mão antes de ligar."
            action={giro.dias.length > ULTIMOS_DIAS ? <Link href={hrefAba('giro')} className="link text-dense">Todos os dias</Link> : undefined}>
            <div className="tbl-wrap">
              <table className="tbl tbl-dense">
                <thead><tr><th>Data</th><th className="num">Lotes</th><th className="num col-p2">Zerados</th><th className="col-p2">Ativos</th><th className="num">Receita</th></tr></thead>
                <tbody>
                  {dias.length === 0 && <LinhaVazia colunas={5}>Sem lançamentos nesta corretora.</LinhaVazia>}
                  {dias.map(d => (
                    <tr key={d.dia}>
                      <td className="whitespace-nowrap tabular-nums"><span className="font-medium">{dataCurta(d.dia)}</span> <span className="text-fg-subtle">{diaDaSemana(d.dia)}</span></td>
                      <td className="num"><BarraCelula valor={d.lotes} max={maxDia} largura={72} /></td>
                      <td className={cn('num col-p2', !d.zerados && 'subtle')}>{n0(d.zerados)}</td>
                      <td className="muted col-p2">{d.ativos.join(' · ') || TRACO}</td>
                      <td className="num">{r0(d.receita)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <div id="contatos" className="scroll-mt-24">
            <ContatosCliente corretora={corretora} clienteId={id} nome={cadastro?.nome ?? ''} ativador={resumo?.ativador ?? null} contatos={contatos} retorno={ficha.manual.proximo_contato} />
          </div>

          {leads.length > 0 && <LeadDeOrigem leads={leads} />}

          {avisos.length > 0 && (
            <Panel variant="card" title={`Pendências · ${avisos.length}`} subtitle="O que falta resolver no cadastro."
              action={<Link href={hrefAba('cadastro')} className="link text-dense">Cadastro</Link>}>
              <ListaPendencias itens={avisos} />
            </Panel>
          )}
        </div>
      </div>
    </>
  )
}
