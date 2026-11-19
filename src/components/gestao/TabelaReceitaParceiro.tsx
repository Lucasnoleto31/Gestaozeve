// Participação do parceiro na receita num mês, cliente a cliente: a mesma tabela na tela Comissões e na
// versão para imprimir. As colunas de corretagem, zeragem e incentivo mostram o que o cliente gerou; a
// última ("A receber"), quanto disso vai para o parceiro. O rodapé repete a conta: total dos clientes e
// parte do parceiro.
// Sem hooks: serve em Server Components. Na impressão não há links e a tabela leva só o que cabe na folha.
// Na tela, no celular, a tabela vira lista (DESIGN.md §8.6): o cliente em cima; a corretora, os lotes e o que
// ele gerou de corretagem, zeragem e incentivo na linha de apoio (só o que tem valor); a parte do parceiro à
// direita. Zerados e pontos por cliente ficam na planilha. Nada disso entra no papel (`impressao`).
import type { CSSProperties } from 'react'
import Link from 'next/link'
import type { LinhaReceita, TotaisReceita } from '@/lib/gestao/participacao'
import { CORRETORA_SLUG, isCorretora } from '@/lib/corretoras'
import { rotuloCorretora } from '@/lib/gestao/extrato'
import { LinhaVazia, n0, r0 } from '@/components/gestao/Celulas'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

export function TabelaReceitaParceiro({ linhas, totais, parceiro, comCorretora, impressao, vazio, classeLinha }: {
  linhas: LinhaReceita[]
  totais: TotaisReceita
  parceiro: string
  comCorretora?: boolean
  impressao?: boolean   // papel: sem links, sem esconder coluna por largura e sem zerados e pontos, para caber na folha
  vazio?: string
  classeLinha?: (i: number) => string | undefined   // celular: as linhas além do limite ficam atrás de "mostrar mais"
}) {
  const p2 = impressao ? '' : 'col-p2'
  const pc = impressao ? '' : 'col-p3'   // corretora: no papel aparece sempre
  const detalhe = !impressao             // zerados e pontos: só na tela larga
  const colunas = 6 + (detalhe ? 2 : 0) + (comCorretora ? 1 : 0)
  // só na tela: o papel de cada célula na lista do celular e o nome do dado na frente do valor
  const papel = (classe: string, tem: unknown = true) => (!impressao && tem ? classe : '')
  const rotulo = (nome: string) => (impressao ? undefined : nome)
  const lotes = (n: number) => (impressao ? null : <span className="md:hidden"> {n === 1 ? 'lote' : 'lotes'}</span>)
  return (
    <table className={cn('tbl tbl-dense', !impressao && 'tbl-lista lista-abre')} style={impressao ? undefined : ({ '--lista-direita': '7rem' } as CSSProperties)}>
      <thead>
        <tr>
          <th>Cliente</th>{comCorretora && <th className={pc}>Corretora</th>}
          <th className="num">Lotes</th>{detalhe && <th className="num col-p3">Zerados</th>}
          <th className={cn('num', p2)}>Corretagem</th><th className={cn('num', p2)}>Zeragem</th>
          {detalhe && <th className="num col-p3">Pontos</th>}<th className={cn('num', p2)} title="O que a corretora paga pelo cliente no mês, pela faixa de pontos">Incentivo</th>
          <th className="num" title={`Parte de ${parceiro}: o que ele recebe pelo cliente`}>A receber</th>
        </tr>
      </thead>
      <tbody>
        {linhas.length === 0 && <LinhaVazia colunas={colunas}>{vazio ?? 'Nenhum cliente do parceiro operou neste mês.'}</LinhaVazia>}
        {linhas.map((c, i) => {
          const slug = isCorretora(c.corretora) ? CORRETORA_SLUG[c.corretora] : null
          // cliente que também operou fora dos códigos do parceiro: só parte do incentivo entra
          const parcial = c.incentivoCliente > 0 && c.incentivo < c.incentivoCliente
          const temFicha = !impressao && !!slug && !!c.cliente_id
          return (
            // linha sem ficha para abrir não leva a seta da lista do celular
            <tr key={`${c.corretora}:${c.chave}:${c.pctFicha ?? ''}`} className={impressao ? undefined : cn(classeLinha?.(i), !temFicha && 'sem-seta') || undefined}>
              <td className={cn('max-w-[260px] truncate font-medium', papel('cel-titulo'))}>
                {temFicha ? <Link href={`/${slug}/clientes/${c.cliente_id}`} className="link">{c.nome}</Link> : c.nome}
                {/* entra pela lista de parceiros da ficha (S61), com o percentual do parceiro naquele cliente */}
                {c.pctFicha != null && <span className="block text-micro font-normal text-fg-subtle" title={`${parceiro} está na lista de parceiros da ficha deste cliente e leva este percentual do que ele gerar, em qualquer código nosso`}>pela ficha · {c.pctFicha.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} %</span>}
              </td>
              {comCorretora && <td className={cn('muted', pc, papel('cel-sub'))}>{rotuloCorretora(c.corretora)}</td>}
              <td className={cn('num', !c.lotes && 'subtle', papel('cel-sub', c.lotes))}>{n0(c.lotes)}{lotes(c.lotes)}</td>
              {detalhe && <td className={cn('num col-p3', !c.zerados && 'subtle')}>{n0(c.zerados)}</td>}
              <td className={cn('num', p2, !c.corretagem && 'subtle', papel('cel-sub', c.corretagem))} data-rotulo={rotulo('corretagem')}>{r0(c.corretagem)}</td>
              <td className={cn('num', p2, !c.zeragem && 'subtle', papel('cel-sub', c.zeragem))} data-rotulo={rotulo('zeragem')}>{r0(c.zeragem)}</td>
              {detalhe && <td className={cn('num col-p3', !c.pontos && 'subtle')}>{n0(c.pontos)}</td>}
              <td className={cn('num', p2, !c.incentivo && 'subtle', papel('cel-sub', c.incentivo))} data-rotulo={rotulo('incentivo')} title={parcial ? `${fmtNum(c.pontos)} dos ${fmtNum(c.pontosCliente)} pontos do cliente foram no código do parceiro: entra essa fração do incentivo de ${r0(c.incentivoCliente)}` : c.pontosFaltantes ? `faltam ${fmtNum(c.pontosFaltantes)} pontos para a próxima faixa` : undefined}>
                {r0(c.incentivo)}{parcial && <span className="text-fg-subtle"> *</span>}
              </td>
              <td className={cn('num font-semibold', !c.total && 'subtle', papel('cel-valor'))}>{r0(c.total)}</td>
            </tr>
          )
        })}
      </tbody>
      {linhas.length > 0 && (
        <tfoot>
          <tr className="total">
            {/* no celular o verbo ficaria solto (os valores vão para a linha de apoio): lá fica só a contagem */}
            <td className={papel('cel-titulo')}>{fmtNum(linhas.length)} {linhas.length === 1 ? 'cliente' : 'clientes'}{impressao ? (linhas.length === 1 ? ' · gerou' : ' · geraram') : <span className="max-md:hidden">{linhas.length === 1 ? ' · gerou' : ' · geraram'}</span>}</td>{comCorretora && <td className={pc} />}
            <td className={cn('num', papel('cel-sub', totais.lotes))}>{n0(totais.lotes)}{lotes(totais.lotes)}</td>
            {detalhe && <td className="num col-p3">{n0(totais.zerados)}</td>}
            <td className={cn('num', p2, papel('cel-sub', totais.corretagem))} data-rotulo={rotulo('corretagem')}>{r0(totais.corretagem)}</td>
            <td className={cn('num', p2, papel('cel-sub', totais.zeragem))} data-rotulo={rotulo('zeragem')}>{r0(totais.zeragem)}</td>
            {detalhe && <td className="col-p3" />}
            <td className={cn('num', p2, papel('cel-sub', totais.incentivo))} data-rotulo={rotulo('incentivo')}>{r0(totais.incentivo)}</td>
            <td />
          </tr>
          <tr className="total">
            <td className={papel('cel-titulo')}>Parte de {parceiro}</td>{comCorretora && <td className={pc} />}
            <td />{detalhe && <td className="col-p3" />}
            <td className={cn('num', p2, papel('cel-sub', totais.parteCorretagem))} data-rotulo={rotulo('corretagem')}>{r0(totais.parteCorretagem)}</td>
            <td className={cn('num', p2, papel('cel-sub', totais.parteZeragem))} data-rotulo={rotulo('zeragem')}>{r0(totais.parteZeragem)}</td>
            {detalhe && <td className="col-p3" />}
            <td className={cn('num', p2, papel('cel-sub', totais.parteIncentivo))} data-rotulo={rotulo('incentivo')}>{r0(totais.parteIncentivo)}</td>
            <td className={cn('num', papel('cel-valor'))}>{r0(totais.total)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  )
}
