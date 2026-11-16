// Ficha do cliente › Resumo: o mês e os 12 meses em quatro números, o giro dos 12 meses, os últimos dias
// com giro e, ao lado, o atendimento (contatos e retorno), o lead de onde o cliente veio e as pendências.
// No computador os contatos ficam na coluna da direita, à mostra sem rolar; no celular vêm logo depois
// dos números, antes dos gráficos.
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
import { BarraCelula, LinhaVazia, TRACO, dataCurta, n0, r0, rCurto } from '@/components/gestao/Celulas'
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
  const { resumo, cadastro, mensal } = ficha
  const meses = janelaMeses(mesRef, 12)
  const mensalPorMes = new Map(mensal.map(m => [m.mes_ref, m]))
  // Variação do mês contra o anterior: sem cor enquanto o mês de referência é o corrente (parcial)
  const mesAnt = somarMeses(mesRef, -1)
  const parcial = mesRef === mesAtual()
  const grafico = meses.map(m => { const x = mensalPorMes.get(m); return { label: mesCurto(m), lotes: x?.lotes ?? 0, receita: x?.receita ?? 0 } })
  const { posicao, receita_total_mes: receitaTotalMes } = contexto360
  const zeragemMes = resumo?.receita_zeragem_mes ?? 0
  const dias = giro.dias.slice(0, ULTIMOS_DIAS)
  const maxDia = Math.max(0, ...dias.map(d => d.lotes))
  const avisos = pendencias.filter(p => p.estado === 'warn')
  // o histórico inteiro só aparece quando vai além dos 12 meses; senão, há quanto tempo o cliente gira
  const historico = !resumo ? undefined
    : resumo.receita_total > resumo.receita_12m + 0.5 ? `${rCurto(resumo.receita_total)} desde ${resumo.primeiro_mes_giro ? mesCurto(resumo.primeiro_mes_giro) : 'o início'}`
    : resumo.meses_ativos ? `${fmtNum(resumo.meses_ativos)} ${resumo.meses_ativos === 1 ? 'mês' : 'meses'} com giro${resumo.primeiro_mes_giro ? ` desde ${mesCurto(resumo.primeiro_mes_giro)}` : ''}` : undefined

  return (
    <div className="grid gap-8 xl:grid-cols-3 xl:grid-rows-[auto_1fr]">
      <div className="min-w-0 xl:col-span-2">
        <KpiRow cols={4}>
          <KpiCard destaque label={`Lotes em ${mesCurto(mesRef)}`} value={n0(resumo?.lotes_mes)}
            delta={resumo ? variacaoMensal(resumo.lotes_mes, mensalPorMes.get(mesAnt)?.lotes ?? null, mesAnt, parcial, fmtNum) : null}
            sub={[resumo?.lotes_media_3m ? `média de 3 meses ${n0(Math.round(resumo.lotes_media_3m))}` : null, resumo?.zerados_mes ? `${n0(resumo.zerados_mes)} zerados` : null].filter(Boolean).join(' · ') || undefined} />
          <KpiCard label={`Receita em ${mesCurto(mesRef)}`} value={rCurto(resumo?.receita_mes)}
            delta={resumo ? variacaoMensal(resumo.receita_mes, mensalPorMes.get(mesAnt)?.receita ?? null, mesAnt, parcial, rCurto) : null}
            sub={[receitaTotalMes && resumo?.receita_mes ? `${fmtPct((resumo.receita_mes / receitaTotalMes) * 100)} da receita do mês` : null, zeragemMes ? `${rCurto(zeragemMes)} de zeragem` : null].filter(Boolean).join(' · ') || undefined} />
          <KpiCard label="Lotes em 12 meses" value={n0(resumo?.lotes_12m)}
            sub={posicao != null ? `${posicao}º de ${fmtNum(contexto360.com_giro)} clientes` : 'sem giro nos 12 meses'} />
          <KpiCard label="Receita em 12 meses" value={rCurto(resumo?.receita_12m)} sub={historico} />
        </KpiRow>
      </div>

      <div className="min-w-0 space-y-5 xl:row-span-2">
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
    </div>
  )
}
