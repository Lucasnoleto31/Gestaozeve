'use client'

import { useState, type ReactNode } from 'react'
import { Panel } from '@/components/ui/Panel'
import { Recolhido } from '@/components/ui/Recolhido'
import { GraficoSeries } from '@/components/gestao/Graficos'
import { CelulaCalor, n0, rCurto } from '@/components/gestao/Celulas'
import { nomeDeFrase, seriesDaEvolucao, type EvolucaoDoTime } from '@/lib/gestao/responsaveisTela'
import { mesCurto } from '@/lib/gestao/meses'
import { cn } from '@/lib/utils'

// Evolução mês a mês por pessoa: um gráfico só, que alterna entre receita e lotes. As duas matrizes de 12
// meses da tela antiga (lotes e receita por assessor) ficam atrás de "ver os números", uma de cada vez,
// e só com os meses que têm dado.
// No celular (DESIGN.md §8.6) a matriz continua tabela, agora com todos os meses (antes só o mês de
// referência aparecia): a moldura nasce rolada para os meses mais novos (direção invertida só na moldura;
// a tabela continua da esquerda para a direita) e o nome, preso à esquerda, quebra em vez de cortar.
type Medida = 'receita' | 'lotes'
const COL_NOME = 'max-md:min-w-[10.5rem] max-md:max-w-[10.5rem]! max-md:whitespace-normal!'
const COL_MES = 'max-md:table-cell max-md:min-w-[4.5rem]'

export function EvolucaoTime({ evolucao, mesRef, parcial, titulo = 'Evolução por mês', comNumeros = true, rodape }: {
  evolucao: EvolucaoDoTime
  mesRef: string
  parcial: boolean
  titulo?: string          // na tela Gráficos o título é a pergunta que o gráfico responde
  comNumeros?: boolean     // "ver os números mês a mês" (a tabela pessoa × mês)
  rodape?: ReactNode
}) {
  const [medida, setMedida] = useState<Medida>('receita')
  const { series, valores } = seriesDaEvolucao(evolucao, medida, 6)
  const dados = evolucao.meses.map((m, i) => ({ label: mesCurto(m), ...valores[i] }))
  const fmt = medida === 'receita' ? rCurto : n0
  const linhas = evolucao.pessoas.map(p => ({ ...p, valores: p[medida], total: p[medida].reduce((s, v) => s + v, 0) })).filter(p => p.total > 0).sort((a, b) => b.total - a.total)
  const maximo = Math.max(0, ...linhas.flatMap(p => p.valores))
  const totalMes = evolucao.meses.map((_, i) => linhas.reduce((s, p) => s + p.valores[i], 0))
  // de 768 px em diante os quatro últimos meses; de 1280 px, todos; no celular todos, rolando de lado
  const colMes = (i: number) => { const n = evolucao.meses.length; return cn(COL_MES, i >= n - 1 ? '' : i >= n - 4 ? 'col-p2' : 'col-p3') }

  return (
    <Panel title={titulo}
      // celular: os botões ao lado já dizem a medida; fica só o aviso do mês em andamento, numa linha
      subtitle={<><span className="max-md:hidden">{medida === 'receita' ? 'Receita' : 'Lotes'} de cada pessoa{parcial ? '; ' : '.'}</span>{parcial && <><span className="md:hidden">O mês de </span>{mesCurto(mesRef)} ainda está em andamento.</>}</>}
      action={
        <div className="seg" role="group" aria-label="O que o gráfico mostra">
          <button type="button" data-active={medida === 'receita'} onClick={() => setMedida('receita')}>Receita</button>
          <button type="button" data-active={medida === 'lotes'} onClick={() => setMedida('lotes')}>Lotes</button>
        </div>
      }>
      {linhas.length === 0 ? <p className="py-10 text-center text-dense text-fg-subtle">Sem lotes na janela.</p> : (
        <>
          {/* a chave refaz o gráfico ao trocar a medida, para as séries e a legenda seguirem a nova ordem */}
          <GraficoSeries key={medida} colorido dados={dados} series={series.map(s => ({ ...s, tipo: 'bar' as const, empilhar: 't' }))} formato={medida === 'receita' ? 'brl' : 'num'} altura={260} />
          {rodape}
          {comNumeros && <Recolhido tamanho="linha" titulo="ver os números mês a mês">
            {evolucao.meses.length > 2 && <p className="mb-1 text-label text-fg-muted md:hidden">Começa pelos meses mais novos; os anteriores ficam à esquerda.</p>}
            <div className="tbl-wrap max-md:[direction:rtl]">
              <table className="tbl tbl-dense max-md:[direction:ltr] max-md:[&_td]:px-1.5 max-md:[&_th]:px-1.5">
                <thead>
                  <tr>
                    <th className={cn('sticky-col', COL_NOME)}>Pessoa</th>
                    {evolucao.meses.map((m, i) => <th key={m} className={cn('num', colMes(i), m === mesRef && 'text-fg')}>{mesCurto(m)}</th>)}
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(p => (
                    <tr key={p.chave}>
                      <td className={cn('sticky-col max-w-[46vw] truncate font-medium md:max-w-[220px]', COL_NOME)}>
                        {/* celular: o nome como a frase e a lista o escrevem, mais estreito que em maiúsculas */}
                        <span className="max-md:hidden">{p.nome}</span><span className="md:hidden">{nomeDeFrase(p.nome)}</span>
                      </td>
                      {p.valores.map((v, i) => <CelulaCalor key={evolucao.meses[i]} valor={v} max={maximo} tom={medida === 'receita' ? 'accent' : 'gain'} fmt={fmt} className={colMes(i)} />)}
                      <td className="num font-semibold">{fmt(p.total)}</td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td className={cn('sticky-col', COL_NOME)}>Total</td>
                    {totalMes.map((v, i) => <td key={evolucao.meses[i]} className={cn('num', colMes(i))}>{fmt(v)}</td>)}
                    <td className="num">{fmt(totalMes.reduce((s, v) => s + v, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Recolhido>}
        </>
      )}
    </Panel>
  )
}
