// Painel › Clientes: como está a base. Quantos vieram, quantos migraram e quantos giram; quem cuida de
// quem; quem está em risco ou migrou e não girou; por onde operam e quem mais gira mês a mês.
import Link from 'next/link'
import type { Contexto } from '@/lib/gestao/pagina'
import { gruposDaBase, mixPlataforma, painelClientesMensal, painelResumo } from '@/lib/gestao/consultas'
import { temListaPropria, termosDaCorretora } from '@/lib/corretoras'
import { janelaMeses, limitesDoMes, mesCurto } from '@/lib/gestao/meses'
import { MOMENTOS, MOMENTO_GRUPO, MOMENTO_RESUMO } from '@/lib/gestao/momentoCliente'
import { telefoneCurto } from '@/lib/gestao/listaClientes'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { BarraCelula, LinhaVazia, MomentoBadge, NivelMarca, TRACO, dataCurta, n0, r0 } from '@/components/gestao/Celulas'
import { HeatmapClientes } from './HeatmapClientes'

// Mapa de calor: só os maiores clientes da janela (a lista completa fica na tela Clientes)
const TOP_HEATMAP = 80

export async function AbaClientes({ ctx }: { ctx: Contexto }) {
  const { corretora, mesRef, base } = ctx
  const lim = limitesDoMes(mesRef)
  const termos = termosDaCorretora(corretora)
  const listaPropria = temListaPropria(corretora)
  // os agregados da base vêm prontos do banco (painel_resumo): uma só passagem pela lista de clientes
  // e a divisão da base nos grupos da tela Clientes (gruposDaBase: só a situação e o risco de cada cliente)
  const [painel, mix, porCliente, grupos] = await Promise.all([
    painelResumo(corretora, mesRef),
    mixPlataforma(corretora, lim.inicio, lim.fim),
    painelClientesMensal(corretora, mesRef, 12, TOP_HEATMAP),
    gruposDaBase(corretora, mesRef),
  ])

  const r = painel.resumo
  const risco = painel.em_risco
  const totalRisco = r.em_risco
  const semGiro = painel.sem_giro
  const taxaMigracao = r.levados ? (r.migrados / r.levados) * 100 : 0
  const pctAtivosMigrados = r.migrados ? (r.ativos / r.migrados) * 100 : 0
  const pctAtivosLevados = r.levados ? (r.ativos / r.levados) * 100 : 0
  const assessores = painel.grupos.filter(g => g.tipo === 'assessor')
  const porResponsavel = [...painel.grupos.filter(g => g.tipo === 'responsavel')]
    .sort((a, b) => (a.grupo === 'Sem responsável' ? 1 : b.grupo === 'Sem responsável' ? -1 : a.grupo.localeCompare(b.grupo, 'pt-BR')))
  const baseStatus = [
    { status: 'Migrado', total: r.migrados, por: porResponsavel.map(g => g.migrados) },
    { status: 'Em processamento', total: r.em_processamento, por: porResponsavel.map(g => g.em_processamento) },
    { status: 'Recusou', total: r.recusaram, por: porResponsavel.map(g => g.recusaram) },
  ]
  const mixTotal = mix.reduce((s, m) => s + m.lotes, 0)
  const totalClientesGiro = porCliente[0]?.total_clientes ?? 0
  // o mapa de calor começa no primeiro mês com giro (meses vazios à esquerda só ocupavam espaço)
  const janela = janelaMeses(mesRef, 12)
  const primeiroComGiro = porCliente.reduce<string | null>((m, c) => (c.lotes > 0 && (m == null || c.mes_ref < m) ? c.mes_ref : m), null)
  const meses = primeiroComGiro ? janela.filter(m => m >= primeiroComGiro) : janela.slice(-1)

  return (
    <>
      <KpiRow cols={4}>
        <KpiCard destaque label="Ativos no mês" value={fmtNum(r.ativos)} sub={`giraram em ${mesCurto(mesRef)} · ${fmtPct(pctAtivosMigrados)} da base migrada`} />
        <KpiCard label="Clientes levados" value={fmtNum(r.levados)} sub={`${fmtNum(r.contas)} contas · ${fmtNum(r.em_processamento)} em processamento · ${fmtPct(pctAtivosLevados)} giram`} />
        <KpiCard label="Taxa de migração" value={fmtPct(taxaMigracao)} sub={`${fmtNum(r.migrados)} migrados · ${fmtNum(r.recusaram)} recusaram`} />
        <KpiCard label="Em risco" tone={r.em_risco_alto ? 'warn' : 'neutral'}
          value={totalRisco ? <Link href={`${base}/clientes?momento=risco`} className="link">{fmtNum(totalRisco)}</Link> : fmtNum(0)}
          sub={`${r.em_risco_alto ? `${fmtNum(r.em_risco_alto)} de nível alto · ` : ''}giraram nos últimos 3 meses e pararam ou caíram`} />
      </KpiRow>

      <div className="grid gap-8 xl:grid-cols-2">
        <Panel title="Base por status" subtitle={listaPropria ? 'Status e responsável vêm da lista de clientes.' : 'Status vem da situação da conta; responsável vem do assessor.'}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th>Status</th><th className="num">Clientes</th><th className="num">% da base</th>
                  {porResponsavel.map(g => <th key={g.grupo} className="num col-p2">{g.grupo}</th>)}
                </tr>
              </thead>
              <tbody>
                {baseStatus.map(l => (
                  <tr key={l.status}>
                    <td>{l.status}</td>
                    <td className="num">{n0(l.total)}</td>
                    <td className="num">{r.levados ? fmtPct((l.total / r.levados) * 100) : TRACO}</td>
                    {l.por.map((v, i) => <td key={i} className={cn('num col-p2', !v && 'subtle')}>{n0(v)}</td>)}
                  </tr>
                ))}
                <tr className="total">
                  <td>Total levado</td><td className="num">{fmtNum(r.levados)}</td><td className="num">100,0%</td>
                  {porResponsavel.map(g => <td key={g.grupo} className="num col-p2">{n0(g.levados)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        {/* os mesmos grupos (e os mesmos números) dos cartões da tela Clientes; cada um abre a lista filtrada */}
        <Panel title="Como está a base" subtitle={`Cada cliente em um grupo só, pelo estado em ${mesCurto(mesRef)}; um clique abre a lista.`}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead><tr><th>Grupo</th><th className="num">Clientes</th><th className="num">% da base</th><th className="col-p2">O que é</th></tr></thead>
              <tbody>
                {MOMENTOS.filter(m => m !== 'recusou' || grupos.por[m] > 0).map(m => (
                  <tr key={m}>
                    <td><Link href={`${base}/clientes?momento=${m}`} className="link font-medium">{MOMENTO_GRUPO[m]}</Link></td>
                    <td className={cn('num', m === 'risco' && grupos.por[m] > 0 && 'text-warn', !grupos.por[m] && 'subtle')}>{n0(grupos.por[m])}</td>
                    <td className="num">{grupos.total ? fmtPct((grupos.por[m] / grupos.total) * 100) : TRACO}</td>
                    <td className="muted col-p2">{m === 'risco' && grupos.por.risco > 0 ? `${fmtNum(grupos.emQueda)} em queda · ${fmtNum(grupos.pararam)} ${grupos.pararam === 1 ? 'parou' : 'pararam'}` : MOMENTO_RESUMO[m]}</td>
                  </tr>
                ))}
                <tr className="total"><td>Todos</td><td className="num">{fmtNum(grupos.total)}</td><td className="num">100,0%</td><td className="col-p2">{fmtNum(grupos.giraram)} giraram em {mesCurto(mesRef)}</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title={`Por ${termos.assessor.toLowerCase()}`} subtitle="Clientes levados e migrados pela conta principal; lotes e receita do mês e dos últimos 12 meses.">
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead>
              <tr>
                <th>{termos.assessor}</th><th className="col-p3">Responsável</th><th className="num col-p2">Levados</th><th className="num col-p2">Migrados</th><th className="num">Ativos</th>
                <th className="num col-p3">% ativação</th><th className="num">Lotes no mês</th><th className="num col-p2">Receita no mês</th><th className="num col-p3">Lotes 12 m</th><th className="num col-p3">Receita 12 m</th>
              </tr>
            </thead>
            <tbody>
              <tr className="total">
                <td>Total</td><td className="col-p3"></td><td className="num col-p2">{fmtNum(r.levados)}</td><td className="num col-p2">{fmtNum(r.migrados)}</td><td className="num">{fmtNum(r.ativos)}</td>
                <td className="num col-p3">{fmtPct(pctAtivosMigrados)}</td><td className="num">{fmtNum(r.lotes_mes)}</td><td className="num col-p2">{r0(r.receita_mes)}</td>
                <td className="num col-p3">{fmtNum(r.lotes_12m)}</td><td className="num col-p3">{r0(r.receita_12m)}</td>
              </tr>
              {assessores.map(a => (
                <tr key={a.grupo}>
                  <td><Link href={`${base}/assessores?assessor=${encodeURIComponent(a.grupo)}`} className="link">{a.grupo}</Link></td>
                  <td className="muted col-p3">{a.responsavel ?? TRACO}</td>
                  <td className="num col-p2">{n0(a.levados)}</td><td className="num col-p2">{n0(a.migrados)}</td><td className="num">{n0(a.ativos)}</td>
                  <td className={cn('num col-p3', !a.ativos && 'subtle')}>{a.migrados ? fmtPct((a.ativos / a.migrados) * 100) : TRACO}</td>
                  <td className="num"><BarraCelula valor={a.lotes_mes} max={assessores[0]?.lotes_mes ?? 0} /></td>
                  <td className="num col-p2">{r0(a.receita_mes)}</td><td className="num col-p3">{n0(a.lotes_12m)}</td><td className="num col-p3">{r0(a.receita_12m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-8 xl:grid-cols-2">
        <Panel title="Clientes em risco" subtitle={`Giraram nos últimos 3 meses e pararam (dias contados até o último lançamento) ou caíram contra os 3 meses anteriores · nível mais alto primeiro${r.em_risco_alto ? ` · ${fmtNum(r.em_risco_alto)} de nível alto` : ''}.`}
          action={<Link href={`${base}/clientes?momento=risco`} className="link text-label">ver todos ({fmtNum(totalRisco)})</Link>}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead><tr><th>Cliente</th><th>Como está</th><th className="col-p2">Nível</th><th className="col-p2">Responsável</th><th className="num col-p2">Lotes mês</th><th className="num col-p2">Média 3 m</th><th className="num col-p3">Receita 12 m</th><th className="num col-p2">Último giro</th></tr></thead>
              <tbody>
                {risco.length === 0 && <LinhaVazia colunas={8}>Nenhum cliente em risco.</LinhaVazia>}
                {risco.map(c => (
                  <tr key={c.cliente_id}>
                    <td className="max-w-[170px] truncate md:max-w-[200px]"><Link href={`${base}/clientes/${c.cliente_id}`} className={cn('link', c.nivel === 'Alto' && 'font-semibold')}>{c.nome}</Link></td>
                    {/* o mesmo selo da lista de Clientes: "Em queda" ou "Parou há N dias" */}
                    <td className="whitespace-nowrap"><MomentoBadge cliente={{ situacao: '', risco: c.risco, dias_sem_giro: c.dias_sem_giro }} /></td>
                    <td className="col-p2"><NivelMarca nivel={c.nivel} media={c.lotes_media_3m} /></td>
                    <td className="muted col-p2">{c.responsavel ?? TRACO}</td>
                    <td className={cn('num col-p2', !c.lotes_mes && 'subtle')}>{n0(c.lotes_mes)}</td>
                    <td className="num col-p2">{n0(Math.round(c.lotes_media_3m))}</td>
                    <td className="num col-p3">{r0(c.receita_12m)}</td>
                    <td className="num col-p2">{dataCurta(c.ultimo_giro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Nunca operaram" subtitle="Migraram e ainda não giraram: priorizar contato · migrações mais recentes primeiro."
          action={<Link href={`${base}/clientes?momento=nunca`} className="link text-label">ver todos ({fmtNum(grupos.por.nunca)})</Link>}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead><tr><th>Cliente</th><th className="col-p2">Responsável</th><th className="num col-p2">Migrou em</th><th className="num">Telefone</th></tr></thead>
              <tbody>
                {semGiro.length === 0 && <LinhaVazia colunas={4}>Ninguém migrou sem operar.</LinhaVazia>}
                {semGiro.map(c => (
                  <tr key={c.cliente_id}>
                    <td className="max-w-[170px] truncate md:max-w-[200px]"><Link href={`${base}/clientes/${c.cliente_id}`} className="link">{c.nome}</Link></td>
                    <td className="muted col-p2">{c.responsavel ?? TRACO}</td>
                    <td className="num col-p2">{dataCurta(c.data_migracao)}</td>
                    <td className="num whitespace-nowrap">{telefoneCurto(c.telefone) ?? TRACO}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title="Mix de plataforma" subtitle={`Lotes operados por plataforma em ${mesCurto(mesRef)}.`}>
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead><tr><th>Plataforma</th><th className="num">Lotes</th><th className="num">% lotes</th><th className="num col-p2">Zerados</th><th className="num col-p2">Clientes</th></tr></thead>
            <tbody>
              {mix.length === 0 && <LinhaVazia colunas={5}>Sem lotes no mês.</LinhaVazia>}
              {mix.map(m => (
                <tr key={m.plataforma}>
                  <td>{m.plataforma}</td>
                  <td className="num"><BarraCelula valor={m.lotes} max={mix[0]?.lotes ?? 0} /></td>
                  <td className="num">{mixTotal ? fmtPct((m.lotes / mixTotal) * 100) : TRACO}</td>
                  <td className={cn('num col-p2', !m.zerados && 'subtle')}>{n0(m.zerados)}</td>
                  <td className="num col-p2">{n0(m.clientes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <HeatmapClientes meses={meses} dados={porCliente} base={base} totalClientes={totalClientesGiro} />
    </>
  )
}
