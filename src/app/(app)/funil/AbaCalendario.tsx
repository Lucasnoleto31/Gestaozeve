// Funil › Calendário: o mês dia a dia. Lucas, 17/11/2026, depois de ver a primeira versão ("está muito feio
// e não entendo direito"), disse o que quer bater o olho e saber: quantos ganhamos por dia, o ranking de quem
// mais teve ganhos no mês e no dia, qual dia foi ruim e quem parou de girar para ligar; e pediu os ativados
// no dia ("o cliente estava inativo e voltou a operar, ou trouxemos ele ontem e começou a operar hoje").
//
// A tela, de cima para baixo: a frase do mês (com o melhor dia e o mais difícil), quatro cartões, o calendário
// com o dia escolhido ao lado, o ranking de ganhos e a lista de quem parou de girar, na ordem de quem ligar.
// Os números de cada dia:
//  - ganhos e perdidos: leads fechados, pela data de fechamento (os mesmos dos cartões da aba Mês);
//  - ativados: cliente que fez a primeira operação ou voltou a operar depois de 4 meses, no dia em que operou
//    (a mesma classificação de novos, ativados e reativados do resultado do mês);
//  - pararam: o último dia em que o cliente operou, para quem não voltou e já está há N pregões sem operar.
// Nada saiu de outra aba.
//
// No celular (DESIGN.md §8): a frase, uma faixa com os quatro números do mês (cada um com o do mês anterior
// embaixo, no lugar dos quatro cartões), o atalho para a lista de quem ligar, o calendário com o dia embaixo,
// o ranking e a lista "Para ligar" como lista de verdade (nome inteiro, o que aconteceu em palavras e os dois
// botões de contato). "Melhores dias" fica recolhido: o melhor e o pior já estão na frase e na grade.
import Link from 'next/link'
import { ArrowDown, MessageCircle, Phone } from 'lucide-react'
import { CORRETORA_LABEL, CORRETORA_SLUG, type Corretora } from '@/lib/corretoras'
import { funilResultadoPorCorretora } from '@/lib/gestao/consultas'
import { clientesAtivados, clientesQuePararam, leadsFechados } from '@/lib/gestao/consultasCalendario'
import { diasDoCalendario, diasEmDestaque, doMes, rankingDeGanhos, SEM_RESPONSAVEL, type DiaDoCalendario } from '@/lib/gestao/calendario'
import { rotuloDia } from '@/lib/gestao/contatos'
import { linkTelefone } from '@/lib/gestao/fila'
import { variacaoMensal } from '@/lib/gestao/projecao'
import { mesAtual, mesCurto, mesLongo, somarMeses } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import { Dica } from '@/components/ui/Dica'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Resumo } from '@/components/gestao/Resumo'
import { SegParam } from '@/components/gestao/Filtros'
import { LinhaVazia, TRACO, dataCurta, n0 } from '@/components/gestao/Celulas'
import { CalendarioDoMes } from './CalendarioDoMes'
import { MostrarMais, ALEM_NO_CELULAR } from '@/components/ui/MostrarMais'
import { RecolheNoCelular } from '@/components/ui/RecolheNoCelular'
import { MESES_INATIVO } from './comum'

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
// celular: quantos clientes de "Para ligar" aparecem antes de "ver os outros"
const LIMITE_PARA_LIGAR = 15
// botão de contato: 28 px no computador, 44 px no dedo
const BOTAO_CONTATO = 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-fg-muted hover:border-line-strong hover:text-fg max-md:h-11 max-md:w-11'
const plural = (n: number, um: string, varios: string) => `${fmtNum(n)} ${n === 1 ? um : varios}`
// tel: a partir do telefone do cadastro (55 + DDD + número)
function linkLigar(telefone: string | null): string | null {
  const d = (telefone ?? '').replace(/\D/g, '')
  return d.length >= 10 ? `tel:+${d.startsWith('55') && d.length >= 12 ? d : `55${d}`}` : null
}

// Uma lista curta de dias (os melhores ou os mais difíceis): o dia, os ganhos, os perdidos e o saldo
function ListaDeDias({ titulo, dias, hoje, vazio }: { titulo: string; dias: DiaDoCalendario[]; hoje: string; vazio: string }) {
  return (
    <div className="min-w-0">
      <p className="label">{titulo}</p>
      {dias.length === 0 ? <p className="mt-1.5 text-dense text-fg-muted">{vazio}</p> : (
        <ul className="mt-1 divide-y divide-line">
          {dias.map(d => {
            const saldo = d.ganhos - d.perdidos
            return (
              <li key={d.dia} className="flex items-center justify-between gap-3 py-1.5 text-dense max-md:flex-wrap max-md:gap-x-2 max-md:py-2">
                <span className="min-w-0 truncate font-medium">{rotuloDia(d.dia, hoje)}</span>
                <span className="flex shrink-0 items-center gap-3 tabular-nums max-md:gap-2.5">
                  <span className="text-gain" title="leads ganhos">{fmtNum(d.ganhos)} {d.ganhos === 1 ? 'ganho' : 'ganhos'}</span>
                  <span className="text-loss" title="leads perdidos">{fmtNum(d.perdidos)} {d.perdidos === 1 ? 'perdido' : 'perdidos'}</span>
                  <span className={cn('w-9 text-right font-semibold max-md:w-auto', saldo > 0 ? 'text-gain' : saldo < 0 ? 'text-loss' : 'text-fg-muted')} title="saldo do dia"><span className="font-normal text-fg-muted md:hidden">saldo </span>{saldo > 0 ? '+' : saldo < 0 ? '−' : ''}{fmtNum(Math.abs(saldo))}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export async function AbaCalendario({ mesRef, corretoras, minimo }: { mesRef: string; corretoras: Corretora[]; minimo: number }) {
  const hoje = fmtDate(hojeBrasil())
  const anterior = somarMeses(mesRef, -1)
  // o mês e o anterior saem das mesmas leituras: o anterior é a comparação dos cartões
  const [fechados, parou, ativados, resultadoAnterior] = await Promise.all([
    leadsFechados(anterior, mesRef), clientesQuePararam(corretoras, anterior, hoje, minimo), clientesAtivados(corretoras, mesRef, MESES_INATIVO),
    funilResultadoPorCorretora(anterior, corretoras, MESES_INATIVO),
  ])
  const ganhos = doMes(fechados.ganhos, mesRef), perdidos = doMes(fechados.perdidos, mesRef), parados = doMes(parou.parados, mesRef)
  const antes = {
    ganhos: doMes(fechados.ganhos, anterior).length, perdidos: doMes(fechados.perdidos, anterior).length, parados: doMes(parou.parados, anterior).length,
    // novos que operaram + ativados + reativados do mês anterior, nas mesmas corretoras
    ativados: resultadoAnterior ? resultadoAnterior.reduce((s, x) => s + x.r.novos_operaram + x.r.ativados + x.r.reativados, 0) : 0,
  }
  const dias = diasDoCalendario(mesRef, ganhos, perdidos, parados, ativados)
  const { melhores, dificeis } = diasEmDestaque(dias, hoje)
  const melhor = melhores[0] ?? null, pior = dificeis[0] ?? null
  const parcial = mesRef >= mesAtual()
  const noMesDeHoje = hoje.slice(0, 7) === mesRef.slice(0, 7)
  const mes = mesCurto(mesRef)
  const pregoes = minimo === 1 ? '1 pregão' : `${minimo} pregões`
  const lancados = parou.ultimas.filter(u => u.dia).map(u => `${CORRETORA_LABEL[u.corretora]} até ${ddmm(u.dia as string)}`).join(' · ')
  const ranking = rankingDeGanhos(ganhos)
  const deHoje = new Map(rankingDeGanhos(ganhos.filter(g => g.dia === hoje)).map(r => [r.nome, r.ganhos]))
  const maior = Math.max(1, ...ranking.map(r => r.ganhos))
  // quem ligar primeiro: do que mais girava para o que menos girava
  const paraLigar = [...parados].sort((a, b) => b.lotes_12m - a.lotes_12m || a.nome.localeCompare(b.nome, 'pt-BR'))
  // as explicações dos quatro números do mês: no "i" do cartão (computador) e da faixa (celular)
  const explica = {
    ganhos: 'Leads fechados como Ganho, pela data de fechamento. É o mesmo número do cartão Ganhos da aba Mês.',
    perdidos: 'Leads fechados como Perdido, pela data de fechamento. É o mesmo número do cartão Perdidos da aba Mês.',
    ativados: `Clientes que fizeram a primeira operação ou voltaram a operar depois de ${MESES_INATIVO} meses sem girar. É a soma de novos que operaram, ativados e reativados do resultado do mês.`,
    pararam: `Clientes que operaram pela última vez em um dia do mês e não voltaram. Só entra quem já está há pelo menos ${pregoes} sem operar (pregão = dia com lote lançado na corretora).`,
  }
  // celular: os quatro números numa faixa só, cada um com o valor do mês anterior inteiro embaixo (o mesmo
  // valor que no computador aparece ao passar o mouse na variação)
  const faixa = [
    { rotulo: 'ganhos', valor: ganhos.length, antes: antes.ganhos, cor: 'text-gain', dica: explica.ganhos },
    { rotulo: 'perdidos', valor: perdidos.length, antes: antes.perdidos, cor: 'text-loss', dica: explica.perdidos },
    { rotulo: 'ativados', valor: ativados.length, antes: antes.ativados, cor: 'text-fg', dica: explica.ativados },
    { rotulo: 'pararam', valor: parados.length, antes: antes.parados, cor: 'text-warn', dica: explica.pararam },
  ]
  const destaques = [
    melhor ? `Melhor dia: ${rotuloDia(melhor.dia, hoje)}, com ${plural(melhor.ganhos, 'ganho', 'ganhos')}.` : null,
    pior ? `Dia mais difícil: ${rotuloDia(pior.dia, hoje)}, com ${plural(pior.perdidos, 'perdido', 'perdidos')} e ${plural(pior.ganhos, 'ganho', 'ganhos')}.` : null,
  ].filter(Boolean).join(' ')

  // A lista de quem ligar: no celular as primeiras linhas e o resto atrás de "ver os outros" (só quando sobra)
  const alemDoLimite = Math.max(0, paraLigar.length - LIMITE_PARA_LIGAR)
  const tabelaParaLigar = (
    <div className="tbl-wrap max-h-[60vh]">
      <table className="tbl tbl-dense tbl-lista" style={{ '--lista-direita': '6.5rem' } as React.CSSProperties}>
        <thead>
          <tr>
            <th>Cliente</th><th className="col-p2">Corretora</th><th className="col-p2">Último giro</th><th className="num">Parado há</th>
            <th className="num col-p2">Lotes em 12 meses</th><th className="col-p3">Responsável</th><th>Contato</th>
          </tr>
        </thead>
        <tbody>
          {paraLigar.length === 0 && <LinhaVazia colunas={7}>Ninguém parou de girar em {mesLongo(mesRef)} por esse critério.</LinhaVazia>}
          {paraLigar.map((x, i) => {
            const whats = linkTelefone(x.telefone), ligar = linkLigar(x.telefone)
            return (
              <tr key={`${x.corretora}:${x.cliente_id}`} className={i >= LIMITE_PARA_LIGAR ? ALEM_NO_CELULAR : undefined}>
                <td className="cel-titulo max-w-[150px] truncate font-medium sm:max-w-[240px]"><Link href={`/${CORRETORA_SLUG[x.corretora]}/clientes/${x.cliente_id}`} className="link max-md:-my-2 max-md:inline-block max-md:py-2">{x.nome}</Link></td>
                <td className="cel-sub col-p2"><CorretoraBadge corretora={x.corretora} className="max-md:hidden" /><span className="md:hidden">{CORRETORA_LABEL[x.corretora]}</span></td>
                <td className="cel-sub col-p2 whitespace-nowrap tabular-nums" data-rotulo="parou em"><span className="max-md:hidden">{dataCurta(x.dia)}</span><span className="md:hidden">{ddmm(x.dia)}</span></td>
                <td className="cel-sub num whitespace-nowrap" data-rotulo="há">{plural(x.pregoes, 'pregão', 'pregões')}</td>
                <td className={cn('num col-p2', x.lotes_12m > 0 && 'cel-sub')}>{n0(x.lotes_12m)}<span className="md:hidden"> lotes em 12 meses</span></td>
                <td className={cn('muted col-p3 cel-sub', !x.responsavel && 'vazio')} data-rotulo="resp.">{x.responsavel ?? TRACO}</td>
                <td className="cel-acoes">
                  {whats || ligar ? (
                    <span className="flex items-center gap-1.5 max-md:gap-1">
                      {whats && <a href={whats} target="_blank" rel="noreferrer" title={`WhatsApp de ${x.nome}`} aria-label={`WhatsApp de ${x.nome}`} className={BOTAO_CONTATO}><MessageCircle className="h-3.5 w-3.5 max-md:h-5 max-md:w-5" aria-hidden /></a>}
                      {ligar && <a href={ligar} title={`Ligar para ${x.nome}`} aria-label={`Ligar para ${x.nome}`} className={BOTAO_CONTATO}><Phone className="h-3.5 w-3.5 max-md:h-5 max-md:w-5" aria-hidden /></a>}
                    </span>
                  ) : <span className="text-fg-subtle max-md:text-label">sem telefone</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      <Resumo
        frase={`Em ${mesLongo(mesRef)}${parcial ? ', até hoje' : ''}: ${plural(ganhos.length, 'lead ganho', 'leads ganhos')}, ${plural(perdidos.length, 'perdido', 'perdidos')}, ${plural(ativados.length, 'cliente ativado', 'clientes ativados')} e ${plural(parados.length, 'parou de girar', 'pararam de girar')}.`}
        apoio={destaques || null}
        nota={lancados ? `Lotes lançados: ${lancados}.` : undefined} />

      <KpiRow cols={4} className="max-md:hidden">
        <KpiCard label={`Ganhos em ${mes}`} value={fmtNum(ganhos.length)} delta={variacaoMensal(ganhos.length, antes.ganhos || null, anterior, parcial, fmtNum)} dica={explica.ganhos} />
        <KpiCard label={`Perdidos em ${mes}`} value={fmtNum(perdidos.length)} delta={{ ...variacaoMensal(perdidos.length, antes.perdidos || null, anterior, parcial, fmtNum), menorMelhor: true }} dica={explica.perdidos} />
        <KpiCard label={`Ativados em ${mes}`} value={fmtNum(ativados.length)} delta={variacaoMensal(ativados.length, antes.ativados || null, anterior, parcial, fmtNum)} dica={explica.ativados} />
        <KpiCard label={`Pararam de girar em ${mes}`} value={fmtNum(parados.length)} delta={{ ...variacaoMensal(parados.length, antes.parados || null, anterior, parcial, fmtNum), menorMelhor: true }} dica={explica.pararam} />
      </KpiRow>
      <div className="md:hidden">
        <ul className="grid grid-cols-4 gap-2">
          {faixa.map(x => (
            <li key={x.rotulo} className="min-w-0">
              <p className={cn('text-kpi font-bold leading-none tabular-nums', x.valor ? x.cor : 'text-fg-subtle')}>{fmtNum(x.valor)}</p>
              <p className="mt-1.5 flex items-center gap-1 text-label text-fg-muted">{x.rotulo}<Dica texto={x.dica} /></p>
              <p className="mt-0.5 text-micro tabular-nums text-fg-subtle">{mesCurto(anterior)}: {x.antes ? fmtNum(x.antes) : TRACO}</p>
            </li>
          ))}
        </ul>
        {/* mês em andamento contra o anterior inteiro: dito uma vez, para "79 contra 106" não parecer queda (no
            computador a variação diz "mês parcial" e fica neutra) */}
        {parcial && <p className="mt-2 text-label text-fg-muted">Embaixo, {mesCurto(anterior)} inteiro; {mesCurto(mesRef)} ainda não acabou.</p>}
      </div>
      {/* celular: a lista de quem ligar fica no fim da aba; este atalho leva direto a ela (o nome curto cabe numa linha) */}
      {paraLigar.length > 0 && (
        <a href="#para-ligar" className={buttonClasses('secondary', 'md', 'h-11 w-full justify-between md:hidden')}>
          Para ligar: {plural(paraLigar.length, 'cliente', 'clientes')}<ArrowDown className="h-4 w-4 text-fg-muted" aria-hidden />
        </a>
      )}

      <Panel title={`${mesLongo(mesRef)} dia a dia`}
        subtitle={<><span className="max-md:hidden">Em cada dia: em cima os leads, embaixo os clientes. Clique em um dia para ver os nomes ao lado.</span><span className="md:hidden">Em cada dia: em cima os leads, embaixo os clientes. Toque em um dia para ver os nomes.</span></>}
        action={<>
          <span className="label max-md:hidden">Pregões sem operar para contar como parado</span>
          <span className="label md:hidden">Parado após</span>
          <SegParam param="parado" valor={String(minimo)} opcoes={[{ valor: '1', label: '1' }, { valor: '3', label: '3' }, { valor: '5', label: '5' }]} />
          <span className="label md:hidden">pregões sem operar</span>
        </>}>
        <CalendarioDoMes mes={mesRef} hoje={hoje} dias={dias} ganhos={ganhos} perdidos={perdidos} ativados={ativados} parados={parados}
          melhor={melhor?.dia ?? null} pior={pior?.dia ?? null} minimo={minimo} conhecidoAte={parou.conhecidoAte} />
      </Panel>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] xl:items-start">
        <div className="space-y-8">
        <Panel title={`Quem mais ganhou em ${mesLongo(mesRef)}`} subtitle="Leads ganhos por responsável.">
          {ranking.length === 0 ? (
            <p className="text-dense text-fg-muted">Nenhum lead ganho em {mesLongo(mesRef)}.</p>
          ) : (
            <ol className="space-y-2">
              <li className="grid grid-cols-[1.25rem_minmax(0,9rem)_minmax(0,1fr)_3rem_3rem] items-center gap-3 text-micro text-fg-subtle" aria-hidden>
                <span /><span>Responsável</span><span /><span className="text-right">No mês</span><span className="text-right">{noMesDeHoje ? 'Hoje' : ''}</span>
              </li>
              {ranking.map((r, i) => {
                const semDono = r.nome === SEM_RESPONSAVEL
                const lider = !semDono && r.ganhos === maior   // empate na frente: todos em destaque
                const hojeN = deHoje.get(r.nome) ?? 0
                return (
                  <li key={r.nome} className="grid grid-cols-[1.25rem_minmax(0,9rem)_minmax(0,1fr)_3rem_3rem] items-center gap-3 text-dense">
                    <span className="text-label tabular-nums text-fg-subtle">{semDono ? '' : i + 1}</span>
                    <span className={cn('truncate', lider ? 'font-semibold text-fg' : semDono ? 'text-fg-muted' : 'text-fg')}>{r.nome}</span>
                    <span className="h-2 min-w-0 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                      <span className={cn('block h-2 rounded-full', lider ? 'bg-gain' : 'bg-fg-subtle')} style={{ width: `${Math.max(3, (r.ganhos / maior) * 100)}%` }} />
                    </span>
                    <span className="text-right font-semibold tabular-nums">{fmtNum(r.ganhos)}</span>
                    <span className={cn('text-right tabular-nums', hojeN ? 'font-medium text-gain' : 'text-fg-subtle')}>{noMesDeHoje ? (hojeN ? `+${fmtNum(hojeN)}` : TRACO) : ''}</span>
                  </li>
                )
              })}
            </ol>
          )}
        </Panel>

        {(melhores.length > 0 || dificeis.length > 0) && (
          <RecolheNoCelular titulo="Melhores dias e dias mais difíceis" resumo="ganhos, perdidos e o saldo de cada dia">
            <Panel title={<span className="max-md:hidden">Melhores dias e dias mais difíceis</span>} subtitle={<span className="max-md:hidden">Pelos leads fechados em cada dia: ganhos, perdidos e o saldo.</span>}>
              <div className="grid gap-5 sm:grid-cols-2">
                <ListaDeDias titulo="Melhores" dias={melhores} hoje={hoje} vazio="Nenhum dia com lead ganho." />
                <ListaDeDias titulo="Mais difíceis" dias={dificeis} hoje={hoje} vazio="Nenhum dia com mais perdidos que ganhos." />
              </div>
            </Panel>
          </RecolheNoCelular>
        )}
        </div>

        {/* celular: cada cliente é um item (DESIGN.md §8.6): o nome inteiro abre a ficha, a linha de apoio diz a
            corretora, quando parou, há quantos pregões, quanto girava e de quem é; à direita, os dois botões.
            A lista corre com a página e começa pelos primeiros (a ordem é a de quem ligar primeiro). */}
        <Panel title={<span id="para-ligar" className="scroll-mt-20">{`Para ligar: ${plural(paraLigar.length, 'cliente parou', 'clientes pararam')} de girar`}</span>}
          subtitle={<><span className="max-md:hidden">{`Operaram pela última vez em ${mesLongo(mesRef)} e estão há ${pregoes} ou mais sem operar. Do que mais girava para o que menos girava.`}</span><span className="md:hidden">Do que mais girava para o que menos girava.</span></>}>
          {alemDoLimite > 0 ? <MostrarMais rotulo={`ver os outros ${fmtNum(alemDoLimite)}`}>{tabelaParaLigar}</MostrarMais> : tabelaParaLigar}
        </Panel>
      </div>
    </>
  )
}
