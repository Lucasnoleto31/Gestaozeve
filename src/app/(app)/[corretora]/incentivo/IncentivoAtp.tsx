// Incentivo do BTG (ATP Turbo Receita): prêmios por comissão acumulada dentro de prazos
// contados da assinatura do termo. Tudo vem dos parâmetros da corretora (atp_*).
// A previsão projeta o acumulado no ritmo de receita escolhido (?ritmo=atual|3m|ultimo|tudo).
import Link from 'next/link'
import { Panel } from '@/components/ui/Panel'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { SegParam } from '@/components/gestao/Filtros'
import { BarraCelula, LinhaVazia, TRACO, dataPt, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { BASES_ATP, RITMOS, avaliarMetas, baseAtp, mesesEntre, preverMeta, ritmosReceita, somarMesesData, type ConfigBtg, type Previsao, type RitmoBase } from '@/lib/gestao/btg'
import type { ReceitaMensalRow } from '@/lib/gestao/tipos'
import { mesCurto } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'

const STATUS = {
  atingida: { variant: 'gain', texto: 'Atingida' },
  'em andamento': { variant: 'accent', texto: 'Em andamento' },
  vencida: { variant: 'loss', texto: 'Vencida' },
} as const

const mesesTxt = (n: number) => `${fmtNum(n)} ${n === 1 ? 'mês' : 'meses'}`
// "3 meses antes do prazo" / "12 dias depois do prazo" / "10 meses depois do prazo"
const folgaTxt = (folga: number | null) => {
  const f = folga ?? 0
  if (Math.abs(f) < 1) {
    const d = Math.max(1, Math.round(Math.abs(f) * 30.4375))
    return `${fmtNum(d)} ${d === 1 ? 'dia' : 'dias'} ${f >= 0 ? 'antes' : 'depois'} do prazo`
  }
  return f > 0 ? `${mesesTxt(Math.round(f))} antes do prazo` : `${mesesTxt(Math.round(-f))} depois do prazo`
}

export function IncentivoAtp({ cfg, serie, hoje, ultimaData, ritmoBase, base, label }: {
  cfg: ConfigBtg
  serie: ReceitaMensalRow[]
  hoje: string
  ultimaData: string | null   // último dia com lotes lançados (projeção do mês atual)
  ritmoBase?: string          // ?ritmo= da URL
  base: string
  label: string
}) {
  const primeiroMes = serie[0]?.mes_ref ?? null
  const assinatura = cfg.atpAssinatura ?? primeiroMes ?? `${hoje.slice(0, 7)}-01`
  // cada mês entra na base que as metas usam (atp_base): receita, bruta/líquida do BTG ou comissão
  const rotuloBase = BASES_ATP.find(b => b.base === cfg.atpBase)?.label ?? 'receita'
  const desde = serie.filter(m => m.mes_ref >= `${assinatura.slice(0, 7)}-01`).map(m => ({ ...m, receita: baseAtp(m.receita, cfg) }))
  const metas = avaliarMetas(cfg.atpMetas, assinatura, desde, hoje)
  const acumulado = desde.reduce((s, m) => s + m.receita, 0)
  const corretagem = desde.reduce((s, m) => s + m.receita_corretagem, 0)
  const zeragem = desde.reduce((s, m) => s + m.receita_zeragem, 0)
  const proxima = metas.find(m => m.status === 'em andamento')
  const conquistadas = metas.filter(m => m.status === 'atingida')
  const premios = conquistadas.reduce((s, m) => s + m.premio, 0)
  const mediaMensal = desde.length ? acumulado / desde.length : 0

  // Previsão: no ritmo escolhido (padrão: mês atual projetado; cai para o próximo disponível)
  const ritmos = ritmosReceita(desde, assinatura, ultimaData, hoje)
  const ordem = RITMOS.map(r => r.base)
  const pedido: RitmoBase = (ordem as string[]).includes(ritmoBase ?? '') ? (ritmoBase as RitmoBase) : 'atual'
  const baseUsada = [pedido, ...ordem].find(b => ritmos[b].disponivel) ?? pedido
  const ritmo = ritmos[baseUsada]
  const previsoes = new Map<number, Previsao>(metas.map(m => [m.indice, preverMeta(m, ritmo.valor, hoje)]))
  const proximaPrev = proxima ? previsoes.get(proxima.indice) : undefined
  const rotuloRitmo = RITMOS.find(r => r.base === baseUsada)?.label ?? ''
  const mesHoje = `${hoje.slice(0, 7)}-01`
  const detalheRitmo = baseUsada === 'atual'
    ? `${rCurto(ritmo.receitaParcial ?? 0)} em ${fmtNum(ritmo.diasDecorridos ?? 0)} de ${fmtNum(ritmo.diasTotal ?? 0)} dias úteis de ${mesCurto(mesHoje)}`
    : `média de ${ritmo.meses === 1 ? '1 mês completo' : `${fmtNum(ritmo.meses)} meses completos`}`
  const alcancadas = metas.filter(m => m.status !== 'vencida' && previsoes.get(m.indice)?.alcanca).length

  // acumulado mês a mês (poucos meses: somar o prefixo é mais simples que carregar estado)
  const prefixo = (i: number) => desde.slice(0, i + 1).reduce((s, x) => s + x.receita, 0)
  const acumulados = new Map(desde.map((m, i) => [m.mes_ref, prefixo(i)]))
  // projeção do acumulado até o prazo da última meta (no máximo 24 meses à frente)
  const ultimoPrazo = metas.reduce((s, m) => (m.prazoFim > s ? m.prazoFim : s), hoje)
  const mesesAFrente = ritmo.valor > 0 ? Math.min(24, Math.max(0, Math.ceil(mesesEntre(hoje, ultimoPrazo)))) : 0
  const grafico: Record<string, string | number>[] = [
    ...desde.map((m, i) => ({ label: mesCurto(m.mes_ref), receita: m.receita, acumulado: prefixo(i), ...(i === desde.length - 1 ? { projecao: prefixo(i) } : {}) })),
    ...Array.from({ length: mesesAFrente }, (_, k) => ({ label: mesCurto(somarMesesData(mesHoje, k + 1)), projecao: Math.round(acumulado + ritmo.valor * (k + 1)) })),
  ]

  return (
    <>
      {!cfg.atpAssinatura && (
        <Alert tone="warn" title="Data de assinatura do termo não informada">
          Os prazos estão sendo contados a partir de {primeiroMes ? `${mesCurto(primeiroMes)}, o primeiro mês com lotes` : 'hoje'}. Informe a data em <Link href={`${base}/parametros`} className="link">Parâmetros</Link>.
        </Alert>
      )}

      <KpiRow cols={6}>
        <KpiCard label="Comissão acumulada" value={rCurto(acumulado)} sub={cfg.atpBase === 'receita' ? `corretagem ${rCurto(corretagem)} · zeragem ${rCurto(zeragem)}` : `base: ${rotuloBase}`} />
        <KpiCard label="Próxima meta" value={proxima ? rCurto(proxima.comissao) : TRACO} sub={proxima ? `prêmio ${rCurto(proxima.premio)} · até ${dataPt(proxima.prazoFim)}` : metas.length ? 'nenhuma meta em aberto' : 'sem metas cadastradas'} />
        <KpiCard label="Faltam" value={proxima ? rCurto(proxima.faltam) : TRACO} sub={proxima ? `${rCurto(proxima.ritmoMensal)} por mês em ${fmtNum(Math.ceil(proxima.mesesRestantes))} meses` : undefined} tone={proxima && proxima.ritmoMensal > mediaMensal * 1.5 ? 'warn' : 'neutral'} />
        <KpiCard
          label="Previsão da próxima meta"
          value={proximaPrev?.dataPrevista ? mesCurto(`${proximaPrev.dataPrevista.slice(0, 7)}-01`) : proxima ? 'não atinge' : TRACO}
          sub={proximaPrev?.dataPrevista ? `${folgaTxt(proximaPrev.folgaMeses)} · ritmo ${rCurto(ritmo.valor)}/mês` : proxima ? 'sem receita no ritmo escolhido' : undefined}
          tone={!proxima ? 'neutral' : proximaPrev?.alcanca ? 'gain' : 'loss'}
        />
        <KpiCard label="Prêmios conquistados" value={rCurto(premios)} sub={`${fmtNum(conquistadas.length)} de ${fmtNum(metas.length)} metas`} tone={premios ? 'gain' : 'neutral'} />
        <KpiCard label="Média mensal" value={rCurto(mediaMensal)} sub={`${fmtNum(desde.length)} ${desde.length === 1 ? 'mês' : 'meses'} desde ${dataPt(assinatura)}`} />
      </KpiRow>

      <div className="grid gap-8 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Comissão acumulada" subtitle={`Receita bruta de cada mês (corretagem + zeragem), o acumulado desde ${dataPt(assinatura)} e a projeção no ritmo de ${rCurto(ritmo.valor)}/mês.`}>
          {grafico.length === 0 ? (
            <p className="py-10 text-center text-dense text-fg-subtle">Sem lotes desde a assinatura.</p>
          ) : (
            <GraficoSeries
              dados={grafico}
              series={[
                { key: 'receita', nome: 'Receita do mês', tipo: 'bar', formato: 'brl' },
                { key: 'acumulado', nome: 'Comissão acumulada', tipo: 'line', eixo: 'dir', formato: 'brl' },
                { key: 'projecao', nome: 'Projeção', tipo: 'line', eixo: 'dir', formato: 'brl', cor: 'violet' },
              ]}
              formato="brl" formatoDir="brl" altura={240}
            />
          )}
        </Panel>
        <Panel title="Regras do programa" subtitle={<Link href={`${base}/parametros`} className="link">editar metas e assinatura em Parâmetros</Link>}>
          <ul className="space-y-2 text-dense text-fg-muted">
            <li>Permanência mínima de <span className="text-fg">48 meses</span>: saindo antes, devolve os prêmios recebidos corrigidos pelo CDI desde a assinatura.</li>
            <li>O {label} paga todos os prêmios, inclusive o upfront.</li>
            <li>Mínimo de <span className="text-fg">{rCurto(metas[0]?.comissao ?? 50000)}</span> de comissão acumulada em {fmtNum(metas[0]?.prazoMeses ?? 18)} meses; abaixo disso o upfront é devolvido proporcionalmente.</li>
            <li>Comissão acumulada = {rotuloBase} desde a assinatura (base escolhida em Parâmetros, atp_base).</li>
          </ul>
        </Panel>
      </div>

      <Panel
        title="Metas e previsão"
        subtitle={`Cada meta é um prêmio por comissão acumulada dentro do prazo contado da assinatura. Previsão no ritmo "${rotuloRitmo}": ${rCurto(ritmo.valor)}/mês (${detalheRitmo}) · ${fmtNum(alcancadas)} de ${fmtNum(metas.length)} metas dentro do prazo.`}
        action={<SegParam param="ritmo" valor={baseUsada} opcoes={RITMOS.map(r => ({ valor: r.base, label: r.label }))} />}
      >
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead>
              <tr>
                <th className="num">#</th><th>Prazo</th><th className="num">Comissão acumulada</th><th className="num">Prêmio</th>
                <th className="num">Progresso</th><th>Status</th><th>Previsão no ritmo atual</th><th className="col-p2">Observação</th>
              </tr>
            </thead>
            <tbody>
              {metas.length === 0 && <LinhaVazia colunas={8}>Sem metas cadastradas.</LinhaVazia>}
              {metas.map(m => {
                const pct = m.comissao ? Math.min(100, (m.acumulado / m.comissao) * 100) : 100
                const st = STATUS[m.status]
                const p = previsoes.get(m.indice)
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
                          {m.status === 'atingida' && m.atingidaEm ? `em ${mesCurto(m.atingidaEm)}` : m.status === 'em andamento' ? `faltam ${rCurto(m.faltam)} · precisa de ${rCurto(m.ritmoMensal)}/mês` : `fechou em ${rCurto(m.acumulado)}`}
                        </span>
                      </span>
                    </td>
                    <td>
                      {m.status === 'atingida' ? (
                        <span className="text-gain">atingida{m.atingidaEm ? ` em ${mesCurto(m.atingidaEm)}` : ''}</span>
                      ) : m.status === 'vencida' ? (
                        <span className="text-fg-subtle">{TRACO}</span>
                      ) : !p?.dataPrevista ? (
                        <span className="text-loss">não atinge sem receita</span>
                      ) : (p.mesesParaAtingir ?? 0) > 120 ? (
                        <span className="text-loss">mais de 10 anos<span className="ml-1.5 text-micro font-normal text-fg-muted">no ritmo escolhido</span></span>
                      ) : (
                        <span className={cn('font-semibold', p.alcanca ? 'text-gain' : 'text-loss')}>
                          {mesCurto(`${p.dataPrevista.slice(0, 7)}-01`)}
                          <span className="ml-1.5 text-micro font-normal text-fg-muted">em {mesesTxt(Math.ceil(p.mesesParaAtingir ?? 0))} · {folgaTxt(p.folgaMeses)}</span>
                        </span>
                      )}
                    </td>
                    <td className="muted col-p2">{m.observacao || TRACO}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-micro text-fg-subtle">
          Ritmos possíveis: {RITMOS.map(r => `${r.label} ${ritmos[r.base].disponivel ? rCurto(ritmos[r.base].valor) + '/mês' : 'sem dados'}`).join(' · ')}. A previsão supõe a receita constante a partir de hoje.
        </p>
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
