// Painel › Clientes: como está a base. Quantos vieram, quantos migraram e quantos giram; quem cuida de
// quem; quem está em risco ou migrou e não girou; por onde operam e quem mais gira mês a mês.
// No celular (DESIGN.md §8) a aba abre pela frase; os grupos da base, quem está em risco, quem nunca operou
// e quem mais gira viram listas (os primeiros de cada uma, com "ver todos"); status, assessor e plataforma
// ficam recolhidos no fim. As tabelas são as mesmas do computador: cada célula só diz o papel dela na lista.
import Link from 'next/link'
import type { Contexto } from '@/lib/gestao/pagina'
import { gruposDaBase, mixPlataforma, painelClientesMensal, painelResumo } from '@/lib/gestao/consultas'
import { temListaPropria, termosDaCorretora } from '@/lib/corretoras'
import { janelaMeses, limitesDoMes, mesCurto } from '@/lib/gestao/meses'
import { MOMENTOS, MOMENTO_GRUPO, MOMENTO_RESUMO } from '@/lib/gestao/momentoCliente'
import { telefoneCurto } from '@/lib/gestao/listaClientes'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Dica } from '@/components/ui/Dica'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { RecolheNoCelular } from '@/components/ui/RecolheNoCelular'
import { BarraCelula, LinhaVazia, MomentoBadge, NivelMarca, TRACO, dataCurta, n0, r0 } from '@/components/gestao/Celulas'
import { Resumo } from '@/components/gestao/Resumo'
import { HeatmapClientes } from './HeatmapClientes'
import { frasesDaBase } from './frases'
import { LINHA_INTEIRA, NO_CELULAR, TOQUE, apoio, soNoComputador } from './celular'

// Mapa de calor: só os maiores clientes da janela (a lista completa fica na tela Clientes)
const TOP_HEATMAP = 80
// Na lista do celular a barra da célula sai: fica só o número, à direita
const SEM_BARRA = 'max-md:[&>span:first-child]:hidden'

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
  // a frase do celular, com os números dos cartões e dos grupos logo abaixo
  const frases = frasesDaBase({ mes: mesRef, ativos: r.ativos, levados: r.levados, emRisco: totalRisco, riscoAlto: r.em_risco_alto, nunca: grupos.por.nunca })
  // "8,6%" na tabela; na lista do celular o número vem com o nome ("8,6% da base")
  const parte = (valor: number, total: number, deQue: string) => (total ? <>{fmtPct((valor / total) * 100)}<span className="md:hidden"> {deQue}</span></> : TRACO)

  // Uma coluna só, com a ordem trocada no celular: frase, números, grupos, em risco, nunca operaram e quem
  // mais gira; depois, recolhidos, status, assessor e plataforma. O espaço entre os blocos é o da página.
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div className="md:hidden"><Resumo frase={frases.frase} apoio={frases.apoio} /></div>

      <KpiRow cols={4}>
        <KpiCard destaque label="Ativos no mês" value={fmtNum(r.ativos)} sub={`giraram em ${mesCurto(mesRef)} · ${fmtPct(pctAtivosMigrados)} da base migrada`} />
        <KpiCard label="Clientes levados" value={fmtNum(r.levados)}
          sub={apoio(`${fmtNum(r.contas)} contas · ${fmtNum(r.em_processamento)} em processamento · ${fmtPct(pctAtivosLevados)} giram`, `${fmtNum(r.contas)} contas · ${fmtPct(pctAtivosLevados)} giram`)} />
        <KpiCard label="Taxa de migração" value={fmtPct(taxaMigracao)} sub={`${fmtNum(r.migrados)} migrados · ${fmtNum(r.recusaram)} recusaram`} />
        <KpiCard label="Em risco" tone={r.em_risco_alto ? 'warn' : 'neutral'} className="max-md:relative"
          value={totalRisco ? <Link href={`${base}/clientes?momento=risco`} className={cn('link', LINHA_INTEIRA)}>{fmtNum(totalRisco)}</Link> : fmtNum(0)}
          sub={apoio(
            `${r.em_risco_alto ? `${fmtNum(r.em_risco_alto)} de nível alto · ` : ''}giraram nos últimos 3 meses e pararam ou caíram`,
            `${r.em_risco_alto ? `${fmtNum(r.em_risco_alto)} de nível alto · ` : ''}${MOMENTO_RESUMO.risco}`,
          )} />
      </KpiRow>

      {/* no celular os dois blocos saem da grade para cada um ir para o seu lugar na ordem */}
      <div className="grid gap-8 max-md:contents xl:grid-cols-2">
        <RecolheNoCelular titulo="Base por status" resumo="migrados, em processamento e recusaram" className="max-md:order-5">
          <Panel title={soNoComputador('Base por status')} subtitle={listaPropria ? 'Status e responsável vêm da lista de clientes.' : 'Status vem da situação da conta; responsável vem do assessor.'}>
            {/* no celular a divisão por responsável, que antes sumia, vai para a linha de apoio de cada status */}
            <div className="tbl-wrap">
              <table className="tbl tbl-dense tbl-lista">
                <thead>
                  <tr>
                    <th>Status</th><th className="num">Clientes</th><th className="num">% da base</th>
                    {porResponsavel.map(g => <th key={g.grupo} className="num col-p2">{g.grupo}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {baseStatus.map(l => (
                    <tr key={l.status}>
                      <td className="cel-titulo">{l.status}</td>
                      <td className="num cel-valor">{n0(l.total)}</td>
                      <td className="num cel-sub">{parte(l.total, r.levados, 'da base')}</td>
                      {l.por.map((v, i) => <td key={i} className={cn('num col-p2 cel-sub', !v && 'subtle vazio')} data-rotulo={porResponsavel[i].grupo}>{n0(v)}</td>)}
                    </tr>
                  ))}
                  <tr className="total">
                    <td className="cel-titulo">Total levado</td><td className="num cel-valor">{fmtNum(r.levados)}</td><td className="num">100,0%</td>
                    {porResponsavel.map(g => <td key={g.grupo} className={cn('num col-p2 cel-sub', !g.levados && 'vazio')} data-rotulo={g.grupo}>{n0(g.levados)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>
        </RecolheNoCelular>

        {/* os mesmos grupos (e os mesmos números) dos cartões da tela Clientes; cada um abre a lista filtrada.
            No celular é a lista principal da aba: o grupo, o que ele é e quantos são; a linha inteira abre. */}
        <Panel className="max-md:order-1" title="Como está a base"
          subtitle={<>Cada cliente em um grupo só<span className="max-md:hidden">, pelo estado em {mesCurto(mesRef)}; um clique abre a lista</span>.</>}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense tbl-lista lista-abre">
              <thead><tr><th>Grupo</th><th className="num">Clientes</th><th className="num">% da base</th><th className="col-p2">O que é</th></tr></thead>
              <tbody>
                {MOMENTOS.filter(m => m !== 'recusou' || grupos.por[m] > 0).map(m => (
                  <tr key={m}>
                    <td className="cel-titulo"><Link href={`${base}/clientes?momento=${m}`} className="link font-medium">{MOMENTO_GRUPO[m]}</Link></td>
                    {/* na lista a parte da base vai embaixo do número (a linha de apoio fica só com o que o grupo é) */}
                    <td className={cn('num cel-valor', m === 'risco' && grupos.por[m] > 0 && 'text-warn max-md:text-warn!', !grupos.por[m] && 'subtle')}
                      data-rotulo={grupos.total ? fmtPct((grupos.por[m] / grupos.total) * 100) : undefined}>{n0(grupos.por[m])}</td>
                    <td className="num">{grupos.total ? fmtPct((grupos.por[m] / grupos.total) * 100) : TRACO}</td>
                    <td className="muted col-p2 cel-sub">{m === 'risco' && grupos.por.risco > 0 ? `${fmtNum(grupos.emQueda)} em queda · ${fmtNum(grupos.pararam)} ${grupos.pararam === 1 ? 'parou' : 'pararam'}` : MOMENTO_RESUMO[m]}</td>
                  </tr>
                ))}
                <tr className="total sem-seta"><td className="cel-titulo">Todos</td><td className="num cel-valor">{fmtNum(grupos.total)}</td><td className="num">100,0%</td><td className="col-p2 cel-sub">{fmtNum(grupos.giraram)} giraram em {mesCurto(mesRef)}</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <RecolheNoCelular titulo={`Por ${termos.assessor.toLowerCase()}`} resumo="ativos, lotes e receita do mês" className="max-md:order-6">
        <Panel title={soNoComputador(`Por ${termos.assessor.toLowerCase()}`)}
          subtitle={apoio('Clientes levados e migrados pela conta principal; lotes e receita do mês e dos últimos 12 meses.', 'Cada nome abre os levados, os migrados e os últimos 12 meses.')}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense tbl-lista lista-abre">
              <thead>
                <tr>
                  <th>{termos.assessor}</th><th className="col-p3">Responsável</th><th className="num col-p2">Levados</th><th className="num col-p2">Migrados</th><th className="num">Ativos</th>
                  <th className="num col-p3">% ativação</th><th className="num">Lotes no mês</th><th className="num col-p2">Receita no mês</th><th className="num col-p3">Lotes 12 m</th><th className="num col-p3">Receita 12 m</th>
                </tr>
              </thead>
              <tbody>
                <tr className="total sem-seta">
                  <td className="cel-titulo">Total</td><td className="col-p3"></td><td className="num col-p2">{fmtNum(r.levados)}</td><td className="num col-p2">{fmtNum(r.migrados)}</td>
                  <td className="num cel-sub">{fmtNum(r.ativos)}<span className="md:hidden"> ativos</span></td>
                  <td className="num col-p3">{fmtPct(pctAtivosMigrados)}</td><td className="num cel-valor" data-rotulo="lotes">{fmtNum(r.lotes_mes)}</td>
                  <td className="num col-p2 cel-sub" data-rotulo="receita">{r0(r.receita_mes)}</td>
                  <td className="num col-p3">{fmtNum(r.lotes_12m)}</td><td className="num col-p3">{r0(r.receita_12m)}</td>
                </tr>
                {assessores.map(a => (
                  <tr key={a.grupo}>
                    <td className="cel-titulo"><Link href={`${base}/assessores?assessor=${encodeURIComponent(a.grupo)}`} className="link">{a.grupo}</Link></td>
                    <td className="muted col-p3">{a.responsavel ?? TRACO}</td>
                    <td className="num col-p2">{n0(a.levados)}</td><td className="num col-p2">{n0(a.migrados)}</td>
                    <td className={cn('num cel-sub', !a.ativos && 'vazio')}>{n0(a.ativos)}<span className="md:hidden">{a.ativos === 1 ? ' ativo' : ' ativos'}</span></td>
                    <td className={cn('num col-p3', !a.ativos && 'subtle')}>{a.migrados ? fmtPct((a.ativos / a.migrados) * 100) : TRACO}</td>
                    <td className="num cel-valor" data-rotulo="lotes"><BarraCelula valor={a.lotes_mes} max={assessores[0]?.lotes_mes ?? 0} className={SEM_BARRA} /></td>
                    <td className={cn('num col-p2 cel-sub', !a.receita_mes && 'vazio')} data-rotulo="receita">{r0(a.receita_mes)}</td>
                    <td className="num col-p3">{n0(a.lotes_12m)}</td><td className="num col-p3">{r0(a.receita_12m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </RecolheNoCelular>

      <div className="grid gap-8 max-md:contents xl:grid-cols-2">
        {/* no celular: os primeiros da lista, cada um com o estado em palavras, o nível e a média de lotes dos
            3 meses anteriores (é ela que dá o tamanho do cliente); o resto da linha está na ficha, a um toque */}
        <Panel className="max-md:order-2"
          title={<>Clientes em risco<span className="ml-1.5 md:hidden"><Dica texto="Giraram nos últimos 3 meses e pararam (dias contados até o último lançamento) ou caíram contra os 3 meses anteriores. O número à direita é a média de lotes por mês nesses 3 meses." /></span></>}
          subtitle={apoio(
            `Giraram nos últimos 3 meses e pararam (dias contados até o último lançamento) ou caíram contra os 3 meses anteriores · nível mais alto primeiro${r.em_risco_alto ? ` · ${fmtNum(r.em_risco_alto)} de nível alto` : ''}.`,
            'Nível mais alto primeiro.',   // quantos ficam de fora o "ver todos" ao lado já diz
          )}
          action={<Link href={`${base}/clientes?momento=risco`} className={cn('link text-label', TOQUE)}>ver todos ({fmtNum(totalRisco)})</Link>}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense tbl-lista lista-abre">
              <thead><tr><th>Cliente</th><th>Como está</th><th className="col-p2">Nível</th><th className="col-p2">Responsável</th><th className="num col-p2">Lotes mês</th><th className="num col-p2">Média 3 m</th><th className="num col-p3">Receita 12 m</th><th className="num col-p2">Último giro</th></tr></thead>
              <tbody>
                {risco.length === 0 && <LinhaVazia colunas={8}>Nenhum cliente em risco.</LinhaVazia>}
                {risco.map((c, i) => (
                  <tr key={c.cliente_id} className={cn(i >= NO_CELULAR && 'max-md:hidden!')}>
                    {/* o negrito do nível alto fica no computador: na lista o nível vem escrito na linha de apoio */}
                    <td className="cel-titulo max-w-[170px] truncate md:max-w-[200px]"><Link href={`${base}/clientes/${c.cliente_id}`} className={cn('link', c.nivel === 'Alto' && 'md:font-semibold')}>{c.nome}</Link></td>
                    {/* o mesmo selo da lista de Clientes: "Em queda" ou "Parou há N dias" */}
                    <td className="cel-sub whitespace-nowrap"><MomentoBadge cliente={{ situacao: '', risco: c.risco, dias_sem_giro: c.dias_sem_giro }} /></td>
                    <td className={cn('col-p2 cel-sub', !c.nivel && 'vazio')}><NivelMarca nivel={c.nivel} media={c.lotes_media_3m} /></td>
                    <td className={cn('muted col-p2 cel-sub', !c.responsavel && 'vazio')} data-rotulo="resp.">{c.responsavel ?? TRACO}</td>
                    <td className={cn('num col-p2', !c.lotes_mes && 'subtle')}>{n0(c.lotes_mes)}</td>
                    <td className="num col-p2 cel-valor" data-rotulo="média 3 m">{n0(Math.round(c.lotes_media_3m))}</td>
                    <td className="num col-p3">{r0(c.receita_12m)}</td>
                    <td className="num col-p2">{dataCurta(c.ultimo_giro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel className="max-md:order-3" title="Nunca operaram"
          subtitle={apoio(
            'Migraram e ainda não giraram: priorizar contato · migrações mais recentes primeiro.',
            'Migrações mais recentes primeiro.',
          )}
          action={<Link href={`${base}/clientes?momento=nunca`} className={cn('link text-label', TOQUE)}>ver todos ({fmtNum(grupos.por.nunca)})</Link>}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense tbl-lista lista-abre">
              <thead><tr><th>Cliente</th><th className="col-p2">Responsável</th><th className="num col-p2">Migrou em</th><th className="num">Telefone</th></tr></thead>
              <tbody>
                {semGiro.length === 0 && <LinhaVazia colunas={4}>Ninguém migrou sem operar.</LinhaVazia>}
                {semGiro.map((c, i) => (
                  <tr key={c.cliente_id} className={cn(i >= NO_CELULAR && 'max-md:hidden!')}>
                    <td className="cel-titulo max-w-[170px] truncate md:max-w-[200px]"><Link href={`${base}/clientes/${c.cliente_id}`} className="link">{c.nome}</Link></td>
                    <td className={cn('muted col-p2 cel-sub', !c.responsavel && 'vazio')} data-rotulo="resp.">{c.responsavel ?? TRACO}</td>
                    <td className={cn('num col-p2 cel-sub', !c.data_migracao && 'vazio')} data-rotulo="migrou em">{dataCurta(c.data_migracao)}</td>
                    <td className={cn('num whitespace-nowrap cel-sub', !c.telefone && 'vazio')}>{telefoneCurto(c.telefone) ?? TRACO}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <RecolheNoCelular titulo="Mix de plataforma" resumo={`lotes de ${mesCurto(mesRef)}`} className="max-md:order-7">
        <Panel title={soNoComputador('Mix de plataforma')} subtitle={`Lotes operados por plataforma em ${mesCurto(mesRef)}.`}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense tbl-lista">
              <thead><tr><th>Plataforma</th><th className="num">Lotes</th><th className="num">% lotes</th><th className="num col-p2">Zerados</th><th className="num col-p2">Clientes</th></tr></thead>
              <tbody>
                {mix.length === 0 && <LinhaVazia colunas={5}>Sem lotes no mês.</LinhaVazia>}
                {mix.map(m => (
                  <tr key={m.plataforma}>
                    <td className="cel-titulo">{m.plataforma}</td>
                    <td className="num cel-valor" data-rotulo="lotes"><BarraCelula valor={m.lotes} max={mix[0]?.lotes ?? 0} className={SEM_BARRA} /></td>
                    <td className="num cel-sub">{parte(m.lotes, mixTotal, 'dos lotes')}</td>
                    <td className={cn('num col-p2 cel-sub', !m.zerados && 'subtle vazio')}>{n0(m.zerados)}<span className="md:hidden"> zerados</span></td>
                    <td className={cn('num col-p2 cel-sub', !m.clientes && 'vazio')}>{n0(m.clientes)}<span className="md:hidden">{m.clientes === 1 ? ' cliente' : ' clientes'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </RecolheNoCelular>

      <HeatmapClientes className="max-md:order-4" meses={meses} dados={porCliente} base={base} totalClientes={totalClientesGiro} />
    </div>
  )
}
