// Giro diário › Dia a dia: cada dia com giro do período, do mais recente para o mais antigo.
// A data abre as operações do dia (onde a corretagem de uma operação pode ser ajustada).
// No celular (DESIGN.md §8) a aba abre pela frase com o total do período e cada dia é um item que abre as
// operações: o dia e os lotes em cima; embaixo, a receita, se ficou acima ou abaixo da média e a variação
// sobre o dia anterior. Aparecem os dias mais recentes e o resto fica atrás de "mostrar". O computador
// não muda.
import type { CSSProperties } from 'react'
import Link from 'next/link'
import type { Contexto } from '@/lib/gestao/pagina'
import { diario } from '@/lib/gestao/consultas'
import { MEDIA_MOVEL, resumoPeriodo, serieDoPeriodo } from '@/lib/gestao/giro'
import { diaSemanaCurto } from '@/lib/gestao/mensagens'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Panel } from '@/components/ui/Panel'
import { MostrarMais } from '@/components/ui/MostrarMais'
import { BarraCelula, LinhaVazia, TRACO, Variacao, dataCurta, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { Resumo } from '@/components/gestao/Resumo'
import { ddmm, diaCurto, ehParcial } from './comum'
import { fraseDias, variacaoTexto } from './frases'

// Celular: quantos dias aparecem antes do "mostrar"; com poucos dias a mais a lista vem inteira
const DIAS_A_VISTA = 20, FOLGA = 5
// A mesma classe de ALEM_NO_CELULAR (MostrarMais): o módulo de lá é 'use client' e esta aba roda no
// servidor, onde não dá para chamar alemDe() nem ler a constante; o texto precisa ser igual ao da base.
const ALEM_DO_CORTE = 'max-md:group-data-[tudo=false]/mais:hidden!'
const alemDoCelular = (i: number) => (i >= DIAS_A_VISTA ? ALEM_DO_CORTE : undefined)

export async function AbaDiaADia({ ctx, inicio, fim, ultima, momento: momentoP }: { ctx: Contexto; inicio: string; fim: string; ultima: string | null; momento: Promise<string | null> }) {
  const [dias, momento] = await Promise.all([diario(ctx.corretora, inicio, fim), momentoP])
  const r = resumoPeriodo(dias)
  const serie = serieDoPeriodo(dias)
  const maxLotes = Math.max(0, ...dias.map(d => d.lotes))
  const parcial = ehParcial(momento) ? ultima : null
  const recentes = [...serie].reverse()
  const alemDoCorte = recentes.length > DIAS_A_VISTA + FOLGA ? recentes.length - DIAS_A_VISTA : 0
  const fr = fraseDias({ inicio, fim, dias: r.dias, lotes: r.lotes, media: r.media, receita: r.receita ? rCurto(r.receita) : null })

  const tabela = (
    <div className="tbl-wrap max-h-[70vh]">
      <table className="tbl tbl-dense tbl-lista lista-abre" style={{ '--lista-direita': '9.5rem' } as CSSProperties}>
        <thead>
          <tr>
            <th>Data</th><th className="col-p2">Dia</th><th className="num">Lotes</th><th className="num col-p2">Zerados</th><th className="num col-p2">Clientes</th><th className="num col-p3">Operações</th>
            <th className="num">Receita</th><th className="num">Var. dia ant.</th><th className="num col-p3">Média móvel</th><th className="num col-p3">Acumulado</th><th className="num col-p2">vs média</th>
          </tr>
        </thead>
        <tbody>
          {serie.length === 0 && <LinhaVazia colunas={11}>Sem lotes de {dataCurta(inicio)} a {dataCurta(fim)}.</LinhaVazia>}
          {serie.length > 0 && (
            // celular: o total do período está na frase, acima da lista
            <tr className="total max-md:hidden!">
              <td>Período</td>
              <td className="col-p2">{r.dias} {r.dias === 1 ? 'dia' : 'dias'}</td>
              <td className="num">{fmtNum(r.lotes)}</td>
              <td className="num col-p2">{n0(r.zerados)}</td>
              <td className="num col-p2" title="Média de clientes com giro por dia">{fmtNum(Math.round(r.clientesMedia))}/dia</td>
              <td className="num col-p3">{n0(r.operacoes)}</td>
              <td className="num">{r0(r.receita)}</td>
              <td className="num subtle">{TRACO}</td>
              <td className="num col-p3" title="Média de lotes por dia com giro">{fmtNum(Math.round(r.media))}</td>
              <td className="num col-p3">{fmtNum(r.lotes)}</td>
              <td className="num subtle col-p2">{TRACO}</td>
            </tr>
          )}
          {recentes.map((d, i) => {
            const aberto = d.dia === parcial
            const variacao = variacaoTexto(d.lotes, d.anteriorLotes)
            const corDaMedia = aberto ? 'muted' : d.acimaMedia ? 'text-gain' : 'text-loss'
            return (
              <tr key={d.dia} className={alemDoCorte > 0 ? alemDoCelular(i) : undefined}>
                <td className="cel-titulo whitespace-nowrap font-medium tabular-nums">
                  <Link href={`${ctx.base}/lotes/${d.dia}`} className="hover:text-accent hover:underline">
                    {/* celular: o dia da semana vem junto da data (a coluna "Dia" é só do computador) */}
                    <span className="md:hidden">{diaCurto(d.dia)}</span><span className="max-md:hidden">{dataCurta(d.dia)}</span>
                  </Link>
                  {aberto && (
                    <span className="ml-1.5 text-micro font-normal text-warn" title={`O dia ainda não fechou: ${momento}`}>
                      <span className="max-md:hidden">parcial</span><span className="md:hidden">{momento}</span>
                    </span>
                  )}
                </td>
                <td className="muted col-p2">{diaSemanaCurto(d.dia)}</td>
                {/* celular: embaixo dos lotes vai a variação sobre o dia anterior (a coluna "Var. dia ant.") */}
                <td className="num cel-valor" data-rotulo={variacao ? `${variacao} vs dia anterior` : undefined}>
                  <BarraCelula valor={d.lotes} max={maxLotes} largura={80} className="max-md:[&>span:first-child]:hidden" />
                </td>
                <td className={cn('num col-p2', !d.zerados && 'subtle')}>{n0(d.zerados)}</td>
                <td className="num col-p2">{n0(d.clientes)}</td>
                <td className="num col-p3">{n0(d.operacoes)}</td>
                {/* celular: sem o cabeçalho "Receita", receita zero vem em palavras em vez do traço */}
                <td className="num cel-sub"><span className="max-md:hidden">{r0(d.receita)}</span><span className="md:hidden">{d.receita ? rCurto(d.receita) : 'sem receita'}</span></td>
                {/* dia ainda correndo: a comparação com um dia inteiro fica sem cor */}
                <td className="num"><Variacao atual={d.lotes} anterior={d.anteriorLotes} className={aberto ? 'text-fg-muted' : undefined} /></td>
                <td className="num col-p3">{fmtNum(Math.round(d.mm))}</td>
                <td className="num muted col-p3">{fmtNum(d.acumulado)}</td>
                {/* a cor vai também no texto: no celular a célula de apoio é sempre apagada */}
                <td className={cn('num col-p2 cel-sub', corDaMedia)}><span className={aberto ? undefined : corDaMedia}>{d.acimaMedia ? 'acima' : 'abaixo'}<span className="md:hidden"> da média</span></span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      {/* Celular: o total do período (a linha "Período" da tabela) em uma frase, com a média que serve de régua aos dias */}
      {serie.length > 0 && (
        <div className="md:hidden">
          <Resumo frase={fr.frase} apoio={fr.apoio} nota={parcial && serie.some(d => d.dia === parcial) ? `${ddmm(parcial)} ainda é ${momento}` : undefined} />
        </div>
      )}

      {/* celular: a aba e a frase já dizem o que é a lista; o título e a explicação das colunas ficam só no computador */}
      <Panel className={serie.length > 0 ? 'max-md:-mt-3' : undefined}
        title={<span className="max-md:hidden">{`Dia a dia · ${fmtNum(r.dias)} ${r.dias === 1 ? 'dia' : 'dias'} com giro`}</span>}
        subtitle={<span className="max-md:hidden">{`Mais recente primeiro · clique na data para ver e ajustar as operações do dia. Média móvel de ${MEDIA_MOVEL} dias; acumulado e "vs média" contam dentro do período.`}</span>}>
        {/* celular: com mais dias que o corte, a lista termina em "mostrar"; senão ela vem inteira, sem o botão */}
        {alemDoCorte > 0 ? <MostrarMais rotulo={`Mostrar os ${fmtNum(alemDoCorte)} dias anteriores`}>{tabela}</MostrarMais> : tabela}
      </Panel>
    </>
  )
}
