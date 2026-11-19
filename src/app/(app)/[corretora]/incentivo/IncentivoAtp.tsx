// Incentivo do BTG (ATP Turbo Receita): prêmios por comissão acumulada dentro de prazos contados da
// assinatura do termo. Tudo vem dos parâmetros da corretora (atp_*). A previsão projeta o acumulado no
// ritmo de receita escolhido (?ritmo=atual|3m|ultimo|tudo).
// Redesenho de nov/26: a tela responde "quanto falta para a próxima meta, quando bate e quanto de prêmio
// está em jogo" numa frase; as metas viram uma trilha com a situação em palavra (com folga, apertado, fora
// do prazo); o gráfico tem um eixo só (acumulado, projeção e a linha de cada meta até o prazo dela); as
// regras e o histórico mensal ficam recolhidos. As contas são as de antes (btg.ts).
import Link from 'next/link'
import { Panel } from '@/components/ui/Panel'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import { Dica } from '@/components/ui/Dica'
import { Recolhido } from '@/components/ui/Recolhido'
import { RecolheNoCelular } from '@/components/ui/RecolheNoCelular'
import { ChevronRight } from 'lucide-react'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { SelectParam } from '@/components/gestao/Filtros'
import { Resumo } from '@/components/gestao/Resumo'
import { LinhaVazia, dataPt, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { BASES_ATP, RITMOS, avaliarMetas, baseAtp, mesesEntre, preverMeta, ritmosReceita, somarMesesData, type ConfigBtg, type Previsao, type RitmoBase } from '@/lib/gestao/btg'
import { FOLGA_MINIMA_MESES, SITUACAO_META, fraseDoAtp, situacaoDaMeta, textoDaFolga, textoDaPrevisao } from '@/lib/gestao/incentivoTela'
import type { ReceitaMensalRow } from '@/lib/gestao/tipos'
import type { Corretora } from '@/lib/corretoras'
import { mesCurto } from '@/lib/gestao/meses'
import { fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { InformarAssinatura } from './InformarAssinatura'
import { MetaNoCelular } from './MetaNoCelular'

// Celular: o que de uma meta só aparece com ela aberta (prazo, quanto falta, quanto precisa por mês e a
// observação). O "!" vence o `flex` das linhas do cartão (o mesmo jeito do ALEM_NO_CELULAR da base).
const FECHADA_NO_CELULAR = 'max-md:group-data-[aberta=false]/meta:hidden!'
const COR_DA_BARRA = { gain: 'var(--gain)', warn: 'var(--warn)', loss: 'var(--loss)', neutral: 'var(--fg-subtle)' } as const
const milhares = (v: number) => (v >= 1000 ? `R$ ${fmtNum(Math.round(v / 1000))} mil` : rCurto(v))

export function IncentivoAtp({ cfg, serie, hoje, ultimaData, ritmoBase, base, label, corretora, admin, projecaoAtual = null }: {
  cfg: ConfigBtg
  serie: ReceitaMensalRow[]
  hoje: string
  ultimaData: string | null   // último dia com lotes lançados (projeção do mês atual)
  ritmoBase?: string          // ?ritmo= da URL
  base: string
  label: string
  corretora: Corretora
  admin: boolean              // só o administrador informa a data de assinatura
  projecaoAtual?: number | null   // receita do mês corrente prevista pelo perfil do histórico (Painel); null = ritmo linear
}) {
  const primeiroMes = serie[0]?.mes_ref ?? null
  const assinatura = cfg.atpAssinatura ?? primeiroMes ?? `${hoje.slice(0, 7)}-01`
  // cada mês entra na base que as metas usam (atp_base): receita, bruta/líquida do BTG ou comissão
  const rotuloBase = BASES_ATP.find(b => b.base === cfg.atpBase)?.label ?? 'receita'
  const desde = serie.filter(m => m.mes_ref >= `${assinatura.slice(0, 7)}-01`).map(m => ({ ...m, receita: baseAtp(m.receita, cfg, m.mes_ref) }))
  const metas = avaliarMetas(cfg.atpMetas, assinatura, desde, hoje)
  const acumulado = desde.reduce((s, m) => s + m.receita, 0)
  const corretagem = desde.reduce((s, m) => s + m.receita_corretagem, 0)
  const zeragem = desde.reduce((s, m) => s + m.receita_zeragem, 0)
  const proxima = metas.find(m => m.status === 'em andamento')
  const conquistadas = metas.filter(m => m.status === 'atingida')
  const premios = conquistadas.reduce((s, m) => s + m.premio, 0)
  const premiosPossiveis = metas.reduce((s, m) => s + m.premio, 0)
  const mediaMensal = desde.length ? acumulado / desde.length : 0

  // Previsão: no ritmo escolhido (padrão: mês atual projetado; cai para o próximo disponível)
  const ritmos = ritmosReceita(desde, assinatura, ultimaData, hoje)
  // Mês atual projetado: quando há histórico, vale o mesmo fechamento previsto do Painel (perfil
  // intra-mês), convertido para a base das metas; sem histórico fica o ritmo linear dos dias úteis
  const atualPeloHistorico = projecaoAtual != null && projecaoAtual > 0 && ritmos.atual.disponivel
  if (atualPeloHistorico) ritmos.atual = { ...ritmos.atual, valor: baseAtp(projecaoAtual, cfg) }
  const ordem = RITMOS.map(r => r.base)
  const pedido: RitmoBase = (ordem as string[]).includes(ritmoBase ?? '') ? (ritmoBase as RitmoBase) : 'atual'
  const baseUsada = [pedido, ...ordem].find(b => ritmos[b].disponivel) ?? pedido
  const ritmo = ritmos[baseUsada]
  const previsoes = new Map<number, Previsao>(metas.map(m => [m.indice, preverMeta(m, ritmo.valor, hoje)]))
  const proximaPrev = proxima ? previsoes.get(proxima.indice) : undefined
  const rotuloRitmo = RITMOS.find(r => r.base === baseUsada)?.label ?? ''
  const mesHoje = `${hoje.slice(0, 7)}-01`
  const detalheRitmo = baseUsada === 'atual'
    ? `${rCurto(ritmo.receitaParcial ?? 0)} em ${fmtNum(ritmo.diasDecorridos ?? 0)} de ${fmtNum(ritmo.diasTotal ?? 0)} dias úteis de ${mesCurto(mesHoje)}${atualPeloHistorico ? ', pelo perfil do histórico' : ''}`
    : `média de ${ritmo.meses === 1 ? '1 mês completo' : `${fmtNum(ritmo.meses)} meses completos`}`
  const noPrazo = metas.filter(m => m.status !== 'vencida' && previsoes.get(m.indice)?.alcanca).length
  // o padrão é o mês atual projetado; com outro ritmo escolhido a tela diz "no ritmo escolhido"
  const noRitmo = baseUsada === 'atual' ? 'No ritmo atual' : 'No ritmo escolhido'

  // acumulado mês a mês (poucos meses: somar o prefixo é mais simples que carregar estado)
  const prefixo = (i: number) => desde.slice(0, i + 1).reduce((s, x) => s + x.receita, 0)
  const acumulados = new Map(desde.map((m, i) => [m.mes_ref, prefixo(i)]))
  // projeção do acumulado até o prazo da última meta (no máximo 24 meses à frente)
  const ultimoPrazo = metas.reduce((s, m) => (m.prazoFim > s ? m.prazoFim : s), hoje)
  const mesesAFrente = ritmo.valor > 0 ? Math.min(24, Math.max(0, Math.ceil(mesesEntre(hoje, ultimoPrazo)))) : 0
  const grafico: Record<string, string | number>[] = [
    ...desde.map((m, i) => ({ label: mesCurto(m.mes_ref), acumulado: prefixo(i), ...(i === desde.length - 1 ? { projecao: prefixo(i) } : {}) })),
    ...Array.from({ length: mesesAFrente }, (_, k) => ({ label: mesCurto(somarMesesData(mesHoje, k + 1)), projecao: Math.round(acumulado + ritmo.valor * (k + 1)) })),
  ]
  // a linha de cada meta vai até o mês do prazo dela: a projeção cruzar antes do fim da linha = dentro do prazo
  const linhasDeMeta = metas.map(m => ({ valor: m.comissao, rotulo: `Meta ${m.indice} · ${milhares(m.comissao)}`, ate: mesCurto(`${m.prazoFim.slice(0, 7)}-01`) }))
  const subtituloDoGrafico = `O que já foi acumulado desde ${dataPt(assinatura)} e para onde vai no ritmo de ${rCurto(ritmo.valor)} por mês. A linha de cada meta termina no prazo dela.`

  return (
    <>
      <Resumo frase={fraseDoAtp(metas, proximaPrev, noRitmo)}
        apoio={metas.length ? `Comissão acumulada de ${rCurto(acumulado)} desde ${dataPt(assinatura)}. A previsão usa o ritmo de ${rCurto(ritmo.valor)} por mês (${rotuloRitmo.toLowerCase()}).` : null} />

      {!cfg.atpAssinatura && (
        <Alert tone="warn" title="Data de assinatura do termo não informada">
          {/* celular: o aviso não pode tomar um quinto da primeira tela. Fica a primeira frase, em tom de apoio
              (a cor do aviso só no título); a segunda só no computador: o título e o botão já dizem o que fazer */}
          <p className="max-md:text-fg-muted">Os prazos estão sendo contados a partir de {primeiroMes ? `${mesCurto(primeiroMes)}, o primeiro mês com lotes` : 'hoje'}.<span className="max-md:hidden"> Com a data certa, os prazos e a situação de cada meta podem mudar.</span></p>
          {admin ? <InformarAssinatura corretora={corretora} /> : <p>Peça a um administrador para informar a data.</p>}
        </Alert>
      )}

      <KpiRow cols={4}>
        <KpiCard destaque label="Comissão acumulada" value={rCurto(acumulado)}
          sub={proxima ? `${fmtPct(proxima.comissao ? Math.min(100, (acumulado / proxima.comissao) * 100) : 100, 0)} da próxima meta (${rCurto(proxima.comissao)})` : `desde ${dataPt(assinatura)}`}
          dica={cfg.atpBase === 'receita' ? `Receita desde a assinatura: corretagem ${rCurto(corretagem)} e zeragem ${rCurto(zeragem)}.` : `Base das metas: ${rotuloBase} desde a assinatura (escolhida em Parâmetros).`} />
        <KpiCard label="Ritmo por mês" value={rCurto(ritmo.valor)}
          sub={proxima ? `a próxima meta pede ${rCurto(proxima.ritmoMensal)} por mês` : rotuloRitmo.toLowerCase()}
          tone={proxima && ritmo.valor < proxima.ritmoMensal ? 'warn' : 'neutral'}
          dica={`${rotuloRitmo}: ${detalheRitmo}. A previsão supõe essa receita constante a partir de hoje.`} />
        <KpiCard label="Prêmios possíveis" value={rCurto(premiosPossiveis)} sub={`${fmtNum(noPrazo)} de ${fmtNum(metas.length)} metas dentro do prazo ${noRitmo.toLowerCase()}`} />
        <KpiCard label="Já conquistado" value={premios ? rCurto(premios) : 'R$ 0'} sub={`${fmtNum(conquistadas.length)} de ${fmtNum(metas.length)} metas atingidas`} tone={premios ? 'gain' : 'neutral'} />
      </KpiRow>

      <Panel title="As metas, em ordem"
        subtitle={<span className="inline-flex items-center gap-1.5">Cada meta paga um prêmio quando a comissão acumulada chega ao valor dentro do prazo.<Dica texto={`Com folga: bate com ${FOLGA_MINIMA_MESES} meses ou mais de sobra no ritmo escolhido. Apertado: bate dentro do prazo, com menos de ${FOLGA_MINIMA_MESES} meses de sobra. Fora do prazo: no ritmo escolhido só bate depois do prazo.`} /></span>}
        // celular: o seletor na largura toda, para o valor escolhido (que move todas as previsões) não ser cortado
        action={<SelectParam param="ritmo" valor={baseUsada} label="Ritmo da previsão" todos={null}
          className="max-md:w-[calc(100vw-2rem)] max-md:[&_select]:w-full max-md:[&_select]:max-w-none"
          opcoes={RITMOS.map(r => ({ valor: r.base, label: `${r.label}${ritmos[r.base].disponivel ? ` · ${rCurto(ritmos[r.base].valor)}/mês` : ' · sem dados'}` }))} />}>
        {metas.length === 0 ? <p className="py-10 text-center text-dense text-fg-subtle">Sem metas cadastradas. <Link href={`${base}/parametros`} className="link">Cadastrar em Parâmetros</Link></p> : (
          // celular: as metas viram uma lista de linhas separadas por fio (sem cartão), cada uma abre no toque
          <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-5 max-md:gap-0">
            {metas.map(m => {
              const p = previsoes.get(m.indice)
              const sit = situacaoDaMeta(m, p)
              const { texto, tom } = SITUACAO_META[sit]
              const pct = m.comissao ? Math.min(100, (m.acumulado / m.comissao) * 100) : 100
              return (
                <MetaNoCelular key={m.indice} indice={m.indice} inicial={m === proxima}
                  className={cn('panel flex min-w-0 flex-col gap-2 p-4', m === proxima && 'ring-2 ring-fg',
                    // no celular o contorno da próxima parecia opção escolhida: a palavra "a próxima" já marca
                    'max-md:gap-1.5 max-md:rounded-none max-md:border-0 max-md:border-b max-md:border-line max-md:bg-transparent max-md:px-0 max-md:py-3.5 max-md:ring-0 max-md:last:border-b-0')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="label inline-flex items-center gap-1 max-md:text-dense max-md:font-medium max-md:text-fg">
                      <ChevronRight className="-ml-0.5 h-4 w-4 shrink-0 text-fg-muted transition-transform group-data-[aberta=true]/meta:rotate-90 md:hidden" aria-hidden />
                      Meta {m.indice}{m === proxima ? ' · a próxima' : ''}
                    </span>
                    <Badge variant={tom}>{texto}</Badge>
                  </div>
                  {/* celular: o valor da meta numa linha só, com o nome do valor ao lado ("de comissão acumulada"),
                      para não ser confundido com o prêmio logo abaixo */}
                  <div className="max-md:flex max-md:flex-wrap max-md:items-baseline max-md:gap-x-1.5">
                    <p className="text-kpi font-bold tabular-nums tracking-tight text-fg max-md:text-section">{rCurto(m.comissao)}</p>
                    <p className="text-micro text-fg-muted max-md:text-label">de comissão acumulada</p>
                  </div>
                  <div className="bar-track" role="img" aria-label={`${fmtPct(pct, 0)} da meta`}><div className="bar-fill" style={{ width: `${pct}%`, background: COR_DA_BARRA[tom] }} /></div>
                  <dl className="space-y-1.5 text-dense">
                    <div className="flex items-baseline justify-between gap-2"><dt className="text-fg-muted">Prêmio</dt><dd className="font-semibold tabular-nums text-fg">{rCurto(m.premio)}</dd></div>
                    <div className={cn('flex items-baseline justify-between gap-2', FECHADA_NO_CELULAR)}><dt className="text-fg-muted">Prazo</dt><dd className="tabular-nums text-fg">{dataPt(m.prazoFim)} <span className="text-micro text-fg-subtle">({fmtNum(m.prazoMeses)} meses)</span></dd></div>
                    {m.status === 'em andamento' && <>
                      <div className={cn('flex items-baseline justify-between gap-2', FECHADA_NO_CELULAR)}><dt className="text-fg-muted">Faltam</dt><dd className="tabular-nums text-fg">{rCurto(m.faltam)} <span className="text-micro text-fg-subtle">({fmtPct(pct, 0)} feito)</span></dd></div>
                      <div className={cn('flex items-baseline justify-between gap-2', FECHADA_NO_CELULAR)}><dt className="text-fg-muted">Precisa de</dt><dd className="tabular-nums text-fg">{rCurto(m.ritmoMensal)} <span className="text-micro text-fg-subtle">por mês</span></dd></div>
                    </>}
                  </dl>
                  {/* celular: a cor fica só na palavra da situação (o selo acima); a frase vai em tom de apoio,
                      para as cinco metas não virarem cinco blocos de texto colorido */}
                  <p className={cn('mt-auto border-t border-line pt-2 text-label max-md:border-t-0 max-md:pt-0 max-md:text-fg-muted!', tom === 'gain' ? 'text-gain' : tom === 'warn' ? 'text-warn' : tom === 'loss' ? 'text-loss' : 'text-fg-muted')}>
                    {m.status === 'atingida' ? `Atingida${m.atingidaEm ? ` em ${mesCurto(m.atingidaEm)}` : ''}${p?.folgaMeses != null ? `, ${textoDaFolga(p.folgaMeses)}` : ''}.`
                      : m.status === 'vencida' ? `Venceu com ${rCurto(m.acumulado)} acumulados.`
                      : `${noRitmo} ${textoDaPrevisao(p)}.`}
                  </p>
                  {m.observacao && <p className={cn('text-micro text-fg-subtle', FECHADA_NO_CELULAR)}>{m.observacao}</p>}
                </MetaNoCelular>
              )
            })}
          </ol>
        )}
      </Panel>

      {/* celular: o gráfico repete o que a situação de cada meta já diz em palavra e fica apertado em 350 px;
          fica recolhido atrás do próprio título (aberto no computador). A explicação vai para o "i". */}
      <RecolheNoCelular titulo="Acumulado, projeção e metas" dica={subtituloDoGrafico}>
        <Panel title="Acumulado, projeção e metas" subtitle={subtituloDoGrafico} className="max-md:[&>header]:hidden">
          {grafico.length === 0 ? <p className="py-10 text-center text-dense text-fg-subtle">Sem lotes desde a assinatura.</p> : (
            <GraficoSeries
              dados={grafico}
              series={[
                { key: 'acumulado', nome: 'Comissão acumulada', tipo: 'line', formato: 'brl' },
                { key: 'projecao', nome: `Projeção ${noRitmo.toLowerCase()}`, tipo: 'line', formato: 'brl', tracejada: true },
              ]}
              linhas={linhasDeMeta}
              formato="brl" altura={320}
            />
          )}
        </Panel>
      </RecolheNoCelular>

      <Recolhido titulo="Regras do programa" resumo={`os prêmios voltam se sair antes de 48 meses ou não chegar a ${rCurto(metas[0]?.comissao ?? 50000)} em ${fmtNum(metas[0]?.prazoMeses ?? 18)} meses`}>
        <div>
          <ul className="max-w-3xl space-y-2 text-dense text-fg-muted">
            <li><span className="font-medium text-fg">O que faz devolver prêmio:</span> sair antes de <span className="text-fg">48 meses</span> de permanência (devolve os prêmios recebidos, corrigidos pelo CDI desde a assinatura) ou ficar abaixo de <span className="text-fg">{rCurto(metas[0]?.comissao ?? 50000)}</span> de comissão acumulada em {fmtNum(metas[0]?.prazoMeses ?? 18)} meses (o upfront é devolvido proporcionalmente).</li>
            <li>O {label} paga todos os prêmios, inclusive o upfront.</li>
            <li>Comissão acumulada = {rotuloBase} desde a assinatura (base escolhida em Parâmetros, atp_base).</li>
          </ul>
          <p className="mt-3 text-dense"><Link href={`${base}/parametros`} className="link">Editar metas e assinatura em Parâmetros</Link></p>
        </div>
      </Recolhido>

      <Recolhido titulo="Histórico mensal" resumo={`${fmtNum(desde.length)} ${desde.length === 1 ? 'mês' : 'meses'} desde ${dataPt(assinatura)} · média de ${rCurto(mediaMensal)} por mês`}>
        {/* matriz mês a mês continua tabela no celular (§8.6): as sete colunas à vista, rolando de lado dentro
            da moldura (antes lotes, zerados, corretagem e zeragem sumiam sem ter onde ser achados) */}
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead><tr><th>Mês</th><th className="num col-p2 max-md:table-cell">Lotes</th><th className="num col-p3 max-md:table-cell">Zerados</th><th className="num col-p2 max-md:table-cell">Corretagem</th><th className="num col-p2 max-md:table-cell">Zeragem</th><th className="num">Receita</th><th className="num">Acumulado</th></tr></thead>
            <tbody>
              {desde.length === 0 && <LinhaVazia colunas={7}>Sem lotes desde a assinatura.</LinhaVazia>}
              {desde.map(m => (
                <tr key={m.mes_ref}>
                  <td>{mesCurto(m.mes_ref)}</td>
                  <td className="num col-p2 max-md:table-cell">{n0(m.lotes)}</td>
                  <td className={cn('num col-p3 max-md:table-cell', !m.zerados && 'subtle')}>{n0(m.zerados)}</td>
                  <td className="num col-p2 max-md:table-cell">{r0(m.receita_corretagem)}</td>
                  <td className={cn('num col-p2 max-md:table-cell', !m.receita_zeragem && 'subtle')}>{r0(m.receita_zeragem)}</td>
                  <td className="num font-semibold">{r0(m.receita)}</td>
                  <td className="num">{r0(acumulados.get(m.mes_ref) ?? 0)}</td>
                </tr>
              ))}
              {desde.length > 0 && <tr className="total"><td>Total</td><td className="num col-p2 max-md:table-cell">{n0(desde.reduce((s, m) => s + m.lotes, 0))}</td><td className="num col-p3 max-md:table-cell">{n0(desde.reduce((s, m) => s + m.zerados, 0))}</td><td className="num col-p2 max-md:table-cell">{r0(corretagem)}</td><td className="num col-p2 max-md:table-cell">{r0(zeragem)}</td><td className="num">{r0(acumulado)}</td><td></td></tr>}
            </tbody>
          </table>
        </div>
      </Recolhido>
    </>
  )
}
