'use client'

// O calendário do Funil (aba Calendário): a grade do mês e, ao lado, o dia escolhido por extenso.
// Lucas, 17/11/2026: "melhore esse calendário, está muito feio e não entendo direito". O que ele quer bater o
// olho e saber: quantos ganhamos por dia, quem mais ganhou (no mês e no dia), qual dia foi ruim e quem parou
// de girar para ligar; e faltava "ativados no dia".
//  - Cada dia tem quatro números sempre no mesmo lugar: em cima os leads (ganhos, perdidos), embaixo os
//    clientes (ativados, pararam). Cor e ícone por tipo; a legenda fica acima da grade.
//  - A lista do dia fica ao lado (no celular, embaixo), já aberta em hoje: nada de janela por cima.
//  - O melhor dia e o dia mais difícil do mês vêm marcados na própria grade.
// No celular (DESIGN.md §8) o dia fica embaixo da grade: os quatro quadros do dia viram botões e mostram
// uma lista por vez (abre em ganhos), cada lista começa pelos primeiros nomes, e tocar num dia que não está
// à vista leva a tela até ele. O computador continua com tudo aberto ao lado.
// A página manda tudo pronto; aqui não há leitura.
import Link from 'next/link'
import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, MessageCircle, Pause, Phone, Trophy, XCircle, Zap } from 'lucide-react'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import { Dica } from '@/components/ui/Dica'
import { rotuloDia } from '@/lib/gestao/contatos'
import { linkTelefone } from '@/lib/gestao/fila'
import { SEM_RESPONSAVEL, rankingDeGanhos, rotuloAtivado, semanasDoMes, type AtivadoDia, type DiaDoCalendario, type FechadoDia, type ParouDia } from '@/lib/gestao/calendario'
import { CORRETORA_LABEL, CORRETORA_SLUG } from '@/lib/corretoras'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { buttonClasses } from '@/components/ui/buttonStyles'

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const plural = (n: number, um: string, varios: string) => `${fmtNum(n)} ${n === 1 ? um : varios}`

// Os quatro números do dia: a cor, o ícone e as palavras de cada um (a ordem é a da grade)
const TIPOS = {
  ganhos: { chip: 'bg-gain-soft text-gain', icone: Trophy, um: 'lead ganho', varios: 'leads ganhos', curto: 'ganhos', legenda: 'leads ganhos' },
  perdidos: { chip: 'bg-loss-soft text-loss', icone: XCircle, um: 'lead perdido', varios: 'leads perdidos', curto: 'perdidos', legenda: 'leads perdidos' },
  ativados: { chip: 'bg-accent-soft text-accent', icone: Zap, um: 'cliente ativado', varios: 'clientes ativados', curto: 'ativados', legenda: 'clientes ativados' },
  pararam: { chip: 'bg-warn-soft text-warn', icone: Pause, um: 'cliente parou de girar', varios: 'clientes pararam de girar', curto: 'pararam', legenda: 'clientes que pararam de girar' },
} as const
type Tipo = keyof typeof TIPOS
const ORDEM: Tipo[] = ['ganhos', 'perdidos', 'ativados', 'pararam']
// celular: quantos nomes de cada lista do dia aparecem antes de "ver os outros"
const LIMITE_DO_DIA = 5

// tel: a partir do telefone do cadastro (55 + DDD + número)
function linkLigar(telefone: string | null): string | null {
  const d = (telefone ?? '').replace(/\D/g, '')
  return d.length >= 10 ? `tel:+${d.startsWith('55') && d.length >= 12 ? d : `55${d}`}` : null
}
// "Terça-feira, 17 de novembro · hoje"
function tituloDoDia(dia: string, hoje: string): string {
  const t = new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const r = rotuloDia(dia, hoje)
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}${r === 'hoje' || r === 'ontem' ? ` · ${r}` : ''}`
}

// Um número do dia na grade: caixinha na cor do tipo; sem valor, o lugar fica vazio (a posição não muda)
function Numero({ n, tipo }: { n: number; tipo: Tipo }) {
  const t = TIPOS[tipo]
  if (!n) return <span className="h-[22px]" aria-hidden />
  return (
    <span className={cn('inline-flex h-[22px] min-w-0 items-center justify-center gap-1 rounded-md px-1 text-dense font-semibold tabular-nums max-md:px-0.5 max-md:text-label', t.chip)}>
      <t.icone className="hidden h-3 w-3 shrink-0 lg:block" aria-hidden />{fmtNum(n)}
    </span>
  )
}

// Botão redondo de contato (WhatsApp ou ligar) nas listas do dia
function Contato({ href, rotulo, icone: Icone }: { href: string | null; rotulo: string; icone: typeof Phone }) {
  if (!href) return null
  return (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" title={rotulo} aria-label={rotulo}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-fg-muted hover:border-line-strong hover:text-fg max-md:h-11 max-md:w-11">
      <Icone className="h-3.5 w-3.5 max-md:h-5 max-md:w-5" aria-hidden />
    </a>
  )
}

// Uma linha das listas do dia: quem é, uma linha de apoio e o que fica à direita
function Linha({ nome, href, apoio, className, children }: { nome: string; href?: string; apoio?: React.ReactNode; className?: string; children?: React.ReactNode }) {
  return (
    <li className={cn('flex items-center justify-between gap-3 py-2', className)}>
      <div className="min-w-0">
        {/* celular: o nome aparece inteiro e, quando abre a ficha, o toque pega uma área mais alta que a letra */}
        <p className="truncate text-dense font-medium max-md:overflow-visible max-md:whitespace-normal max-md:[overflow-wrap:anywhere]">{href ? <Link href={href} className="link max-md:-my-2 max-md:inline-block max-md:py-2">{nome}</Link> : nome}</p>
        {apoio && <p className="truncate text-label text-fg-muted max-md:whitespace-normal">{apoio}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
    </li>
  )
}

function Bloco({ tipo, n, escondido, resto, aoVerTudo, children }: {
  tipo: Tipo
  n: number
  escondido: boolean        // celular: outro tipo está escolhido
  resto: number             // celular: quantos nomes estão atrás de "ver os outros" (0 = lista inteira à vista)
  aoVerTudo: () => void
  children: React.ReactNode
}) {
  const t = TIPOS[tipo]
  return (
    <section className={cn(escondido && 'max-md:hidden')}>
      <h4 className="flex items-center gap-2 text-dense font-semibold">
        <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-md', t.chip)}><t.icone className="h-3 w-3" aria-hidden /></span>
        {plural(n, t.um, t.varios)}
      </h4>
      {children}
      {resto > 0 && <button type="button" className={buttonClasses('secondary', 'md', 'mt-2 w-full md:hidden')} onClick={aoVerTudo}>ver os outros {fmtNum(resto)}</button>}
    </section>
  )
}

export function CalendarioDoMes({ mes, hoje, dias, ganhos, perdidos, ativados, parados, melhor, pior, minimo, conhecidoAte }: {
  mes: string
  hoje: string
  dias: DiaDoCalendario[]
  ganhos: FechadoDia[]
  perdidos: FechadoDia[]
  ativados: AtivadoDia[]
  parados: ParouDia[]
  melhor: string | null         // o dia com mais ganhos
  pior: string | null           // o dia em que os perdidos mais passaram dos ganhos
  minimo: number                // pregões sem operar para contar como parado
  conhecidoAte: string | null   // quem girou pela última vez depois deste dia ainda não completou o tempo parado
}) {
  const porDia = new Map(dias.map(d => [d.dia, d]))
  const total = (d: DiaDoCalendario | undefined) => (d ? d.ganhos + d.perdidos + d.ativados + d.pararam : 0)
  // dias que dá para abrir: os que têm alguma coisa (em ordem)
  const comAlgo = dias.filter(d => total(d) > 0).map(d => d.dia)
  // abre em hoje; se hoje não é deste mês ou ainda está vazio, no último dia com alguma coisa
  const inicial = total(porDia.get(hoje)) > 0 ? hoje : comAlgo.filter(d => d <= hoje).at(-1) ?? comAlgo.at(-1) ?? null
  const [aberto, setAberto] = useState<string | null>(inicial)
  const dia = aberto && porDia.has(aberto) ? aberto : inicial
  const d = dia ? porDia.get(dia) : undefined
  const doDia = <T extends { dia: string }>(itens: T[]) => itens.filter(i => i.dia === dia)
  const g = doDia(ganhos), p = doDia(perdidos), a = doDia(ativados)
  // quem parou aparece do que mais gira para o que menos gira: é a ordem de quem chamar primeiro
  const s = doDia(parados).sort((x, y) => y.lotes_12m - x.lotes_12m)
  const rankingDoDia = rankingDeGanhos(g)
  const i = dia ? comAlgo.indexOf(dia) : -1
  const anterior = i > 0 ? comAlgo[i - 1] : null, proximo = i >= 0 && i < comAlgo.length - 1 ? comAlgo[i + 1] : null
  const saldo = d ? d.ganhos - d.perdidos : 0
  const ultimoParado = parados.map(x => x.dia).sort().at(-1) ?? null
  const pregoes = minimo === 1 ? '1 pregão' : `${minimo} pregões`
  const explicaParou = `Cliente que operou pela última vez naquele dia e está há ${pregoes} ou mais sem operar (pregão = dia com lote lançado na corretora).`
  const aviso = conhecidoAte && ultimoParado !== null && conhecidoAte < hoje
    ? `Quem girou pela última vez depois de ${conhecidoAte.slice(8, 10)}/${conhecidoAte.slice(5, 7)} ainda não aparece como parado: falta completar ${pregoes} sem operar.`
    : null

  // Celular: uma lista do dia por vez (a do quadro tocado; abre no primeiro tipo que tem alguém) e, em cada
  // lista, os primeiros nomes até pedirem os outros. No computador as quatro listas ficam abertas, como antes.
  const [tipoEscolhido, setTipoEscolhido] = useState<Tipo>('ganhos')
  const tipoVisivel = d && !d[tipoEscolhido] ? ORDEM.find(t => d[t] > 0) ?? tipoEscolhido : tipoEscolhido
  const [inteira, setInteira] = useState<string | null>(null)   // o dia e o tipo da lista aberta por inteiro
  const chave = (tipo: Tipo) => `${dia}:${tipo}`
  const resto = (tipo: Tipo, n: number) => (inteira === chave(tipo) ? 0 : Math.max(0, n - LIMITE_DO_DIA))
  const alem = (tipo: Tipo, k: number) => (inteira !== chave(tipo) && k >= LIMITE_DO_DIA ? 'max-md:hidden' : undefined)
  // Celular: o dia fica embaixo da grade. Se o cabeçalho dele não está à vista, a tela desce até ele; se já
  // está, fica parada (quem compara dias toca em vários seguidos).
  const topoDoDia = useRef<HTMLDivElement>(null)
  const escolher = (iso: string) => {
    setAberto(iso)
    if (!window.matchMedia('(max-width: 767.98px)').matches) return
    requestAnimationFrame(() => {
      const el = topoDoDia.current
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.top >= 56 && r.bottom <= window.innerHeight - 96) return
      el.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    })
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-label text-fg-muted max-md:gap-x-2">
          {ORDEM.map(tipo => {
            const t = TIPOS[tipo]
            return (
              <li key={tipo} className="inline-flex items-center gap-1.5 max-md:gap-1">
                <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-md max-md:hidden', t.chip)}><t.icone className="h-3 w-3" aria-hidden /></span>
                <span className="max-md:hidden">{t.legenda}</span>
                {/* celular: na grade o número não tem ícone, só a cor; a legenda é a palavra na mesma cor, numa linha só */}
                <span className={cn('rounded-md px-1.5 py-0.5 font-medium md:hidden', t.chip)}>{t.curto}</span>
                {tipo === 'ativados' && <Dica texto="Cliente que fez a primeira operação ou voltou a operar depois de 4 meses sem girar, no dia em que operou. É a mesma conta de novos, ativados e reativados da aba Mês." />}
                {/* celular: o aviso de até que dia se sabe quem parou sai de baixo da grade e vem para este "i" */}
                {tipo === 'pararam' && <><Dica className="max-md:hidden" texto={explicaParou} /><Dica className="md:hidden" texto={aviso ? `${explicaParou} ${aviso}` : explicaParou} /></>}
              </li>
            )
          })}
          {/* celular: na grade o melhor dia, o dia difícil e hoje são só um ponto; aqui, o que cada ponto quer dizer */}
          <li className="hidden h-0 basis-full max-md:block" aria-hidden />
          {melhor && <li className="inline-flex items-center gap-1 md:hidden"><span className="text-gain" aria-hidden>●</span>melhor dia</li>}
          {pior && <li className="inline-flex items-center gap-1 md:hidden"><span className="text-loss" aria-hidden>●</span>dia difícil</li>}
          {hoje.slice(0, 7) === mes.slice(0, 7) && hoje !== melhor && hoje !== pior && <li className="inline-flex items-center gap-1 md:hidden"><span className="text-fg" aria-hidden>●</span>hoje</li>}
        </ul>

        <div className="grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label="Calendário do mês">
          {SEMANA.map(x => <div key={x} role="columnheader" className="pb-0.5 text-center text-micro text-fg-subtle">{x}</div>)}
          {semanasDoMes(mes).flat().map((iso, k) => {
            if (!iso) return <div key={`v${k}`} role="gridcell" />
            const x = porDia.get(iso)
            const tem = total(x) > 0
            const futuro = iso > hoje, fimDeSemana = k % 7 === 0 || k % 7 === 6
            const marca = iso === melhor ? { texto: 'melhor dia', cor: 'text-gain' } : iso === pior ? { texto: 'dia difícil', cor: 'text-loss' } : iso === hoje ? { texto: 'hoje', cor: 'text-fg' } : null
            const base = cn(
              'flex min-h-[64px] min-w-0 flex-col gap-1 rounded-lg border p-1 text-left sm:min-h-[92px] sm:p-2',
              iso === dia ? 'border-fg bg-surface-2' : iso === hoje ? 'border-line-strong' : 'border-line',
              fimDeSemana && iso !== dia && 'bg-surface',
            )
            const conteudo = (
              <>
                <span className="flex items-center justify-between gap-1">
                  <span className={cn('text-label tabular-nums', iso === hoje ? 'font-semibold text-fg' : futuro ? 'text-fg-subtle' : 'text-fg-muted')}>{Number(iso.slice(8, 10))}</span>
                  {marca && (
                    <span className={cn('min-w-0 truncate text-micro font-medium', marca.cor)}>
                      <span className="hidden lg:inline">{marca.texto}</span>
                      <span className="lg:hidden" aria-hidden>●</span>
                    </span>
                  )}
                </span>
                {x && tem && (
                  <span className="grid grid-cols-2 gap-1">
                    <Numero n={x.ganhos} tipo="ganhos" /><Numero n={x.perdidos} tipo="perdidos" />
                    {(x.ativados > 0 || x.pararam > 0) && <><Numero n={x.ativados} tipo="ativados" /><Numero n={x.pararam} tipo="pararam" /></>}
                  </span>
                )}
              </>
            )
            return tem && x
              ? (
                <button key={iso} type="button" role="gridcell" aria-selected={iso === dia} onClick={() => escolher(iso)}
                  className={cn(base, 'cursor-pointer transition-colors hover:border-line-strong hover:bg-surface-2')}
                  aria-label={`${tituloDoDia(iso, hoje)}: ${ORDEM.map(tipo => plural(x[tipo], TIPOS[tipo].um, TIPOS[tipo].varios)).join(', ')}${marca && marca.texto !== 'hoje' ? `. ${marca.texto} do mês` : ''}. Ver a lista`}>
                  {conteudo}
                </button>
              )
              : <div key={iso} role="gridcell" className={base}>{conteudo}</div>
          })}
        </div>
        {aviso && <p className="mt-2 text-label text-fg-subtle max-md:hidden">{aviso}</p>}
      </div>

      {/* O dia escolhido, por extenso. Na tela larga o painel tem a altura do calendário e a lista rola dentro dele */}
      <div className="relative min-w-0 xl:min-h-[520px]">
      <section className="panel flex min-w-0 flex-col p-4 sm:p-5 xl:absolute xl:inset-0" aria-live="polite" aria-label="O dia escolhido">
        {!dia || !d ? (
          <p className="text-dense text-fg-muted">Nenhum dia deste mês tem lead fechado, cliente ativado ou cliente parado.</p>
        ) : (
          <>
            <div ref={topoDoDia} className="shrink-0 scroll-mb-28 scroll-mt-16">
            <header className="flex shrink-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-section font-semibold text-fg">{tituloDoDia(dia, hoje)}</h3>
                <p className="mt-0.5 text-dense text-fg-muted">
                  {d.ganhos + d.perdidos === 0
                    ? 'Nenhum lead fechado neste dia.'
                    : `Saldo de leads: ${saldo > 0 ? '+' : saldo < 0 ? '−' : ''}${fmtNum(Math.abs(saldo))}.`}
                  {dia === melhor ? ' Melhor dia do mês em ganhos.' : dia === pior ? ' O dia mais difícil do mês.' : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-1 max-md:gap-2">
                <button type="button" disabled={!anterior} onClick={() => anterior && setAberto(anterior)} title="Dia anterior com movimento" aria-label="Dia anterior com movimento"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-default disabled:opacity-40 disabled:hover:border-line disabled:hover:text-fg-muted max-md:h-11 max-md:w-11">
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" disabled={!proximo} onClick={() => proximo && setAberto(proximo)} title="Próximo dia com movimento" aria-label="Próximo dia com movimento"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-default disabled:opacity-40 disabled:hover:border-line disabled:hover:text-fg-muted max-md:h-11 max-md:w-11">
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </header>

            <dl className="mt-4 grid shrink-0 grid-cols-4 gap-2 max-md:hidden">
              {ORDEM.map(tipo => (
                <div key={tipo} className={cn('min-w-0 rounded-lg px-2.5 py-2', d[tipo] ? TIPOS[tipo].chip : 'bg-surface-2 text-fg-subtle')}>
                  <dd className="text-title font-semibold tabular-nums leading-none">{fmtNum(d[tipo])}</dd>
                  <dt className="mt-1 truncate text-micro">{TIPOS[tipo].curto}</dt>
                </div>
              ))}
            </dl>
            {/* celular: os mesmos quatro números como botões; o que está marcado mostra a lista dele logo abaixo */}
            <div className="mt-4 grid grid-cols-4 gap-2 md:hidden" role="group" aria-label="Qual lista do dia mostrar">
              {ORDEM.map(tipo => {
                const marcado = tipo === tipoVisivel && d[tipo] > 0
                return (
                  <button key={tipo} type="button" disabled={!d[tipo]} aria-pressed={marcado} onClick={() => setTipoEscolhido(tipo)}
                    className={cn('min-w-0 rounded-lg border px-2 py-2 text-left', d[tipo] ? TIPOS[tipo].chip : 'bg-surface-2 text-fg-subtle', marcado ? 'border-current' : 'border-transparent')}>
                    <span className="block text-title font-semibold leading-none tabular-nums">{fmtNum(d[tipo])}</span>
                    <span className="mt-1 block text-micro">{TIPOS[tipo].curto}</span>
                  </button>
                )
              })}
            </div>
            </div>

            <div className="mt-5 min-h-0 space-y-5 xl:flex-1 xl:overflow-y-auto xl:pr-1">
              {g.length > 0 && (
                <Bloco tipo="ganhos" n={g.length} escondido={tipoVisivel !== 'ganhos'} resto={resto('ganhos', g.length)} aoVerTudo={() => setInteira(chave('ganhos'))}>
                  {(rankingDoDia.length > 1 || g.length > 1) && (
                    // celular: texto corrido, sem a pílula (ali ela parecia um filtro que dá para tocar)
                    <p className="mt-1.5 flex flex-wrap gap-1.5 text-label max-md:gap-x-3">
                      {rankingDoDia.map(r => (
                        <span key={r.nome} className={cn('rounded-md px-1.5 py-0.5 tabular-nums max-md:bg-transparent max-md:px-0', r.ganhos === rankingDoDia[0].ganhos && r.nome !== SEM_RESPONSAVEL ? 'bg-gain-soft font-semibold text-gain' : 'bg-surface-2 text-fg-muted')}>{r.nome} {fmtNum(r.ganhos)}</span>
                      ))}
                    </p>
                  )}
                  <ul className="mt-1 divide-y divide-line">
                    {g.map((x, k) => (
                      <Linha key={x.id} className={alem('ganhos', k)} nome={x.nome} apoio={x.responsavel ?? 'sem responsável'}>
                        <Contato href={linkTelefone(x.whatsapp)} rotulo={`WhatsApp de ${x.nome}`} icone={MessageCircle} />
                      </Linha>
                    ))}
                  </ul>
                </Bloco>
              )}
              {p.length > 0 && (
                <Bloco tipo="perdidos" n={p.length} escondido={tipoVisivel !== 'perdidos'} resto={resto('perdidos', p.length)} aoVerTudo={() => setInteira(chave('perdidos'))}>
                  <ul className="mt-1 divide-y divide-line">
                    {p.map((x, k) => <Linha key={x.id} className={alem('perdidos', k)} nome={x.nome} apoio={[x.motivo ?? 'sem motivo informado', x.responsavel].filter(Boolean).join(' · ')} />)}
                  </ul>
                </Bloco>
              )}
              {a.length > 0 && (
                <Bloco tipo="ativados" n={a.length} escondido={tipoVisivel !== 'ativados'} resto={resto('ativados', a.length)} aoVerTudo={() => setInteira(chave('ativados'))}>
                  <ul className="mt-1 divide-y divide-line">
                    {a.map((x, k) => {
                      const r = rotuloAtivado(x)
                      return (
                        <Linha key={`${x.corretora}:${x.cliente_id}`} className={alem('ativados', k)} nome={x.nome} href={`/${CORRETORA_SLUG[x.corretora]}/clientes/${x.cliente_id}`}
                          apoio={[`${r.titulo}: ${r.detalhe}`, x.responsavel].filter(Boolean).join(' · ')}>
                          <CorretoraBadge corretora={x.corretora} />
                        </Linha>
                      )
                    })}
                  </ul>
                </Bloco>
              )}
              {s.length > 0 && (
                <Bloco tipo="pararam" n={s.length} escondido={tipoVisivel !== 'pararam'} resto={resto('pararam', s.length)} aoVerTudo={() => setInteira(chave('pararam'))}>
                  <p className="mt-1 text-label text-fg-muted">Operaram pela última vez neste dia. Do que mais girava para o que menos girava: a ordem de quem ligar primeiro.</p>
                  <ul className="mt-1 divide-y divide-line">
                    {s.map((x, k) => (
                      // celular: os dois botões de contato ocupam a direita; a corretora vai para a linha de apoio
                      <Linha key={`${x.corretora}:${x.cliente_id}`} className={alem('pararam', k)} nome={x.nome} href={`/${CORRETORA_SLUG[x.corretora]}/clientes/${x.cliente_id}`}
                        apoio={<>{[`há ${plural(x.pregoes, 'pregão', 'pregões')}`, `${fmtNum(x.lotes_12m)} lotes em 12 meses`, x.responsavel].filter(Boolean).join(' · ')}<span className="md:hidden"> · {CORRETORA_LABEL[x.corretora]}</span></>}>
                        <Contato href={linkTelefone(x.telefone)} rotulo={`WhatsApp de ${x.nome}`} icone={MessageCircle} />
                        <Contato href={linkLigar(x.telefone)} rotulo={`Ligar para ${x.nome}`} icone={Phone} />
                        <CorretoraBadge corretora={x.corretora} className="max-md:hidden" />
                      </Linha>
                    ))}
                  </ul>
                </Bloco>
              )}
            </div>
          </>
        )}
      </section>
      </div>
    </div>
  )
}
