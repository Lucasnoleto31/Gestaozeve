// Incentivo do BTG (ATP Turbo Receita): prêmios por comissão acumulada dentro de prazos
// contados da assinatura do termo. Tudo vem dos parâmetros da corretora (atp_*).
import Link from 'next/link'
import { Panel } from '@/components/ui/Panel'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { BarraCelula, LinhaVazia, TRACO, dataPt, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { avaliarMetas, type ConfigBtg } from '@/lib/gestao/btg'
import type { ReceitaMensalRow } from '@/lib/gestao/tipos'
import { mesCurto } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'

const STATUS = {
  atingida: { variant: 'gain', texto: 'Atingida' },
  'em andamento': { variant: 'accent', texto: 'Em andamento' },
  vencida: { variant: 'loss', texto: 'Vencida' },
} as const

export function IncentivoAtp({ cfg, serie, hoje, base, label }: { cfg: ConfigBtg; serie: ReceitaMensalRow[]; hoje: string; base: string; label: string }) {
  const primeiroMes = serie[0]?.mes_ref ?? null
  const assinatura = cfg.atpAssinatura ?? primeiroMes ?? `${hoje.slice(0, 7)}-01`
  const desde = serie.filter(m => m.mes_ref >= `${assinatura.slice(0, 7)}-01`)
  const metas = avaliarMetas(cfg.atpMetas, assinatura, desde, hoje)
  const acumulado = desde.reduce((s, m) => s + m.receita, 0)
  const corretagem = desde.reduce((s, m) => s + m.receita_corretagem, 0)
  const zeragem = desde.reduce((s, m) => s + m.receita_zeragem, 0)
  const proxima = metas.find(m => m.status === 'em andamento')
  const conquistadas = metas.filter(m => m.status === 'atingida')
  const premios = conquistadas.reduce((s, m) => s + m.premio, 0)
  const mediaMensal = desde.length ? acumulado / desde.length : 0

  // acumulado mês a mês (poucos meses: somar o prefixo é mais simples que carregar estado)
  const grafico = desde.map((m, i) => ({ label: mesCurto(m.mes_ref), receita: m.receita, acumulado: desde.slice(0, i + 1).reduce((s, x) => s + x.receita, 0) }))
  const acumulados = new Map(grafico.map((g, i) => [desde[i].mes_ref, g.acumulado]))

  return (
    <>
      {!cfg.atpAssinatura && (
        <Alert tone="warn" title="Data de assinatura do termo não informada">
          Os prazos estão sendo contados a partir de {primeiroMes ? `${mesCurto(primeiroMes)}, o primeiro mês com lotes` : 'hoje'}. Informe a data em <Link href={`${base}/parametros`} className="link">Parâmetros</Link>.
        </Alert>
      )}

      <KpiRow cols={5}>
        <KpiCard label="Comissão acumulada" value={rCurto(acumulado)} sub={`corretagem ${rCurto(corretagem)} · zeragem ${rCurto(zeragem)}`} />
        <KpiCard label="Próxima meta" value={proxima ? rCurto(proxima.comissao) : TRACO} sub={proxima ? `prêmio ${rCurto(proxima.premio)} · até ${dataPt(proxima.prazoFim)}` : metas.length ? 'nenhuma meta em aberto' : 'sem metas cadastradas'} />
        <KpiCard label="Faltam" value={proxima ? rCurto(proxima.faltam) : TRACO} sub={proxima ? `${rCurto(proxima.ritmoMensal)} por mês em ${fmtNum(Math.ceil(proxima.mesesRestantes))} meses` : undefined} tone={proxima && proxima.ritmoMensal > mediaMensal * 1.5 ? 'warn' : 'neutral'} />
        <KpiCard label="Prêmios conquistados" value={rCurto(premios)} sub={`${fmtNum(conquistadas.length)} de ${fmtNum(metas.length)} metas`} tone={premios ? 'gain' : 'neutral'} />
        <KpiCard label="Média mensal" value={rCurto(mediaMensal)} sub={`${fmtNum(desde.length)} ${desde.length === 1 ? 'mês' : 'meses'} desde ${dataPt(assinatura)}`} />
      </KpiRow>

      <div className="grid gap-8 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Comissão acumulada" subtitle={`Receita bruta de cada mês (corretagem + zeragem) e o acumulado desde ${dataPt(assinatura)}.`}>
          {grafico.length === 0 ? (
            <p className="py-10 text-center text-dense text-fg-subtle">Sem lotes desde a assinatura.</p>
          ) : (
            <GraficoSeries
              dados={grafico}
              series={[{ key: 'receita', nome: 'Receita do mês', tipo: 'bar', formato: 'brl' }, { key: 'acumulado', nome: 'Comissão acumulada', tipo: 'line', eixo: 'dir', formato: 'brl' }]}
              formato="brl" formatoDir="brl" altura={240}
            />
          )}
        </Panel>
        <Panel title="Regras do programa" subtitle={<Link href={`${base}/parametros`} className="link">editar metas e assinatura em Parâmetros</Link>}>
          <ul className="space-y-2 text-dense text-fg-muted">
            <li>Permanência mínima de <span className="text-fg">48 meses</span>: saindo antes, devolve os prêmios recebidos corrigidos pelo CDI desde a assinatura.</li>
            <li>O {label} paga todos os prêmios, inclusive o upfront.</li>
            <li>Mínimo de <span className="text-fg">{rCurto(metas[0]?.comissao ?? 50000)}</span> de comissão acumulada em {fmtNum(metas[0]?.prazoMeses ?? 18)} meses; abaixo disso o upfront é devolvido proporcionalmente.</li>
            <li>Comissão acumulada = receita bruta gerada no {label} (corretagem + zeragem) desde a assinatura.</li>
          </ul>
        </Panel>
      </div>

      <Panel title="Metas" subtitle="Cada meta é um prêmio por comissão acumulada dentro do prazo contado da assinatura.">
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead>
              <tr>
                <th className="num">#</th><th>Prazo</th><th className="num">Comissão acumulada</th><th className="num">Prêmio</th>
                <th className="num">Progresso</th><th>Status</th><th className="col-p2">Observação</th>
              </tr>
            </thead>
            <tbody>
              {metas.length === 0 && <LinhaVazia colunas={7}>Sem metas cadastradas.</LinhaVazia>}
              {metas.map(m => {
                const pct = m.comissao ? Math.min(100, (m.acumulado / m.comissao) * 100) : 100
                const st = STATUS[m.status]
                return (
                  <tr key={m.indice} className={cn(m.status === 'vencida' && 'text-fg-muted')}>
                    <td className="num">{m.indice}</td>
                    <td><span className="tabular-nums">{fmtNum(m.prazoMeses)} meses</span><span className="ml-1.5 text-micro text-fg-subtle">até {dataPt(m.prazoFim)}</span></td>
                    <td className="num">{r0(m.comissao)}</td>
                    <td className="num font-semibold">{r0(m.premio)}</td>
                    <td className="num"><BarraCelula valor={Math.min(m.acumulado, m.comissao)} max={m.comissao} tom={m.status === 'atingida' ? 'gain' : m.status === 'vencida' ? 'neutral' : 'accent'} fmt={() => fmtPct(pct, 0)} largura={80} /></td>
                    <td>
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <Badge variant={st.variant}>{st.texto}</Badge>
                        <span className="text-micro text-fg-muted">
                          {m.status === 'atingida' && m.atingidaEm ? `em ${mesCurto(m.atingidaEm)}` : m.status === 'em andamento' ? `faltam ${rCurto(m.faltam)} · ${rCurto(m.ritmoMensal)}/mês` : `fechou em ${rCurto(m.acumulado)}`}
                        </span>
                      </span>
                    </td>
                    <td className="muted col-p2">{m.observacao || TRACO}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Histórico mensal" subtitle="Meses desde a assinatura do termo.">
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead><tr><th>Mês</th><th className="num col-p2">Lotes</th><th className="num col-p3">Zerados</th><th className="num col-p2">Corretagem</th><th className="num col-p2">Zeragem</th><th className="num">Receita</th><th className="num">Acumulado</th></tr></thead>
            <tbody>
              {desde.length === 0 && <LinhaVazia colunas={7}>Sem lotes desde a assinatura.</LinhaVazia>}
              {desde.map(m => (
                <tr key={m.mes_ref}>
                  <td>{mesCurto(m.mes_ref)}</td>
                  <td className="num col-p2">{n0(m.lotes)}</td>
                  <td className={cn('num col-p3', !m.zerados && 'subtle')}>{n0(m.zerados)}</td>
                  <td className="num col-p2">{r0(m.receita_corretagem)}</td>
                  <td className={cn('num col-p2', !m.receita_zeragem && 'subtle')}>{r0(m.receita_zeragem)}</td>
                  <td className="num font-semibold">{r0(m.receita)}</td>
                  <td className="num">{r0(acumulados.get(m.mes_ref) ?? 0)}</td>
                </tr>
              ))}
              {desde.length > 0 && <tr className="total"><td>Total</td><td className="num col-p2">{n0(desde.reduce((s, m) => s + m.lotes, 0))}</td><td className="num col-p3">{n0(desde.reduce((s, m) => s + m.zerados, 0))}</td><td className="num col-p2">{r0(corretagem)}</td><td className="num col-p2">{r0(zeragem)}</td><td className="num">{r0(acumulado)}</td><td></td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}
