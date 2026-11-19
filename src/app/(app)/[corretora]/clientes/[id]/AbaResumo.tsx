// Ficha do cliente › Resumo: o mês e os 12 meses em quatro números, o giro dos 12 meses, os últimos dias
// com giro e, ao lado, o atendimento (contatos e retorno), o lead de onde o cliente veio e as pendências.
// No computador os contatos ficam na coluna da direita, à mostra sem rolar; no celular (DESIGN.md §8) a
// ordem é: os dois números do mês em cartão e os de 12 meses em linha, os contatos, o lead de origem, os
// últimos dias com giro (em lista) e, por último, o gráfico. A pendência aparece no alto da ficha.
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
import { Dica } from '@/components/ui/Dica'
import { BarraCelula, LinhaVazia, TRACO, dataCurta, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { ContatosCliente } from './ContatosCliente'
import { LeadDeOrigem, ListaPendencias, SEM_BARRA_NO_CELULAR, diaDaSemana, type Ficha, type Pendencia } from './comum'

const ULTIMOS_DIAS = 8
// Celular: no cartão, o "i" fica ao lado da comparação (sem isto ele caía sozinho numa terceira linha)
const I_AO_LADO = 'max-md:[&_.kpi-apoio]:flex-nowrap max-md:[&_.kpi-apoio]:items-start max-md:[&_.kpi-apoio]:justify-between'
// Celular: o link pequeno do título do bloco ganha área de toque sem mexer na linha
const TOQUE = 'max-md:relative max-md:after:absolute max-md:after:-inset-3'

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

  // O apoio dos dois cartões do mês. No celular (DESIGN.md §8) o cartão fica com o número e uma comparação
  // só: o apoio vai para um "i" ao lado da comparação, junto com o valor do mês anterior (que no computador
  // aparece ao passar o mouse na variação). O "i" fica na linha de apoio e não ao lado do nome do cartão:
  // lá ele quebrava "Receita em nov/26" em duas linhas e desalinhava os dois números.
  const lotesAnt = mensalPorMes.get(mesAnt)?.lotes ?? null
  const receitaAnt = mensalPorMes.get(mesAnt)?.receita ?? null
  const apoioLotes = [resumo?.lotes_media_3m ? `média de 3 meses ${n0(Math.round(resumo.lotes_media_3m))}` : null, resumo?.zerados_mes ? `${n0(resumo.zerados_mes)} zerados` : null].filter(Boolean).join(' · ')
  const apoioReceita = [receitaTotalMes && resumo?.receita_mes ? `${fmtPct((resumo.receita_mes / receitaTotalMes) * 100)} da receita do mês` : null, zeragemMes ? `${rCurto(zeragemMes)} de zeragem` : null].filter(Boolean).join(' · ')
  const dicaLotes = [lotesAnt ? `${mesCurto(mesAnt)}: ${n0(lotesAnt)}` : null, apoioLotes || null].filter(Boolean).join(' · ')
  const dicaReceita = [receitaAnt ? `${mesCurto(mesAnt)}: ${rCurto(receitaAnt)}` : null, apoioReceita || null].filter(Boolean).join(' · ')

  return (
    <div className="grid gap-8 xl:grid-cols-3 xl:grid-rows-[auto_1fr]">
      <div className="min-w-0 xl:col-span-2">
        <KpiRow cols={4}>
          <KpiCard destaque label={`Lotes em ${mesCurto(mesRef)}`} value={n0(resumo?.lotes_mes)} className={I_AO_LADO}
            delta={resumo ? variacaoMensal(resumo.lotes_mes, lotesAnt, mesAnt, parcial, fmtNum) : null}
            sub={dicaLotes ? <>{apoioLotes && <span className="max-md:hidden">{apoioLotes}</span>}<Dica destaque className="md:hidden" texto={dicaLotes} /></> : undefined} />
          <KpiCard label={`Receita em ${mesCurto(mesRef)}`} value={rCurto(resumo?.receita_mes)} className={I_AO_LADO}
            delta={resumo ? variacaoMensal(resumo.receita_mes, receitaAnt, mesAnt, parcial, rCurto) : null}
            sub={dicaReceita ? <>{apoioReceita && <span className="max-md:hidden">{apoioReceita}</span>}<Dica className="md:hidden" texto={dicaReceita} /></> : undefined} />
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

        {/* no celular a pendência aparece em uma linha no alto da ficha, que leva à lista da aba Cadastro */}
        {avisos.length > 0 && (
          <Panel variant="card" className="max-md:hidden" title={`Pendências · ${avisos.length}`} subtitle="O que falta resolver no cadastro."
            action={<Link href={hrefAba('cadastro')} className="link text-dense">Cadastro</Link>}>
            <ListaPendencias itens={avisos} />
          </Panel>
        )}
      </div>

      {/* celular: os últimos dias (o que se olha antes de ligar) vêm antes do gráfico */}
      <div className="min-w-0 space-y-8 xl:col-span-2 max-md:flex max-md:flex-col max-md:gap-8 max-md:space-y-0">
        <Panel className="max-md:order-last" title="Giro dos 12 meses" subtitle={`Lotes operados e receita de ${mesCurto(meses[0])} a ${mesCurto(mesRef)}.`}
          action={<Link href={hrefAba('giro')} className={cn('link text-dense', TOQUE)}>Mês a mês em números</Link>}>
          <GraficoSeries
            dados={grafico}
            series={[{ key: 'lotes', nome: 'Lotes operados', tipo: 'bar' }, { key: 'receita', nome: 'Receita', tipo: 'line', eixo: 'dir', formato: 'brl' }]}
            formatoDir="brl"
            altura={220}
          />
        </Panel>

        {/* celular: cada dia é um item (tbl-lista): a data, os lotes à direita e, embaixo, os zerados, os ativos e a receita */}
        <Panel title="Últimos dias com giro" subtitle={<span className="max-md:hidden">O que o cliente operou nos dias mais recentes: bom de ter à mão antes de ligar.</span>}
          action={giro.dias.length > ULTIMOS_DIAS ? <Link href={hrefAba('giro')} className={cn('link text-dense', TOQUE)}>Todos os dias</Link> : undefined}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense tbl-lista">
              <thead><tr><th>Data</th><th className="num">Lotes</th><th className="num col-p2">Zerados</th><th className="col-p2">Ativos</th><th className="num">Receita</th></tr></thead>
              <tbody>
                {dias.length === 0 && <LinhaVazia colunas={5}>Sem lançamentos nesta corretora.</LinhaVazia>}
                {dias.map(d => (
                  <tr key={d.dia}>
                    <td className="cel-titulo whitespace-nowrap tabular-nums"><span className="font-medium">{dataCurta(d.dia)}</span> <span className="text-fg-subtle">{diaDaSemana(d.dia)}</span></td>
                    <td className="cel-valor num" data-rotulo="lotes"><BarraCelula valor={d.lotes} max={maxDia} largura={72} className={SEM_BARRA_NO_CELULAR} /></td>
                    <td className={cn('cel-sub num col-p2', !d.zerados && 'subtle vazio')}>{n0(d.zerados)}<span className="md:hidden"> zerados</span></td>
                    <td className={cn('cel-sub muted col-p2', d.ativos.length === 0 && 'vazio')}>{d.ativos.join(' · ') || TRACO}</td>
                    <td className={cn('cel-sub num', !d.receita && 'vazio')}>{r0(d.receita)}</td>
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
