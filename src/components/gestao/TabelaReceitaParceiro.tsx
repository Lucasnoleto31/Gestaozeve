// Participação do parceiro na receita num mês, cliente a cliente: a mesma tabela na tela Comissões e na
// versão para imprimir. As colunas de corretagem, zeragem e incentivo mostram o que o cliente gerou; a
// última ("A receber"), quanto disso vai para o parceiro. O rodapé repete a conta: total dos clientes e
// parte do parceiro. No celular ficam cliente, lotes e a receber.
// Sem hooks: serve em Server Components. Na impressão não há links e a tabela leva só o que cabe na folha.
import Link from 'next/link'
import type { LinhaReceita, TotaisReceita } from '@/lib/gestao/participacao'
import { CORRETORA_SLUG, isCorretora } from '@/lib/corretoras'
import { rotuloCorretora } from '@/lib/gestao/extrato'
import { LinhaVazia, n0, r0 } from '@/components/gestao/Celulas'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

export function TabelaReceitaParceiro({ linhas, totais, parceiro, comCorretora, impressao, vazio }: {
  linhas: LinhaReceita[]
  totais: TotaisReceita
  parceiro: string
  comCorretora?: boolean
  impressao?: boolean   // papel: sem links, sem esconder coluna por largura e sem zerados e pontos, para caber na folha
  vazio?: string
}) {
  const p2 = impressao ? '' : 'col-p2'
  const pc = impressao ? '' : 'col-p3'   // corretora: no papel aparece sempre
  const detalhe = !impressao             // zerados e pontos: só na tela larga
  const colunas = 6 + (detalhe ? 2 : 0) + (comCorretora ? 1 : 0)
  return (
    <table className="tbl tbl-dense">
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
        {linhas.map(c => {
          const slug = isCorretora(c.corretora) ? CORRETORA_SLUG[c.corretora] : null
          // cliente que também operou fora dos códigos do parceiro: só parte do incentivo entra
          const parcial = c.incentivoCliente > 0 && c.incentivo < c.incentivoCliente
          return (
            <tr key={`${c.corretora}:${c.chave}`}>
              <td className="max-w-[260px] truncate font-medium">{!impressao && slug && c.cliente_id ? <Link href={`/${slug}/clientes/${c.cliente_id}`} className="link">{c.nome}</Link> : c.nome}</td>
              {comCorretora && <td className={cn('muted', pc)}>{rotuloCorretora(c.corretora)}</td>}
              <td className={cn('num', !c.lotes && 'subtle')}>{n0(c.lotes)}</td>
              {detalhe && <td className={cn('num col-p3', !c.zerados && 'subtle')}>{n0(c.zerados)}</td>}
              <td className={cn('num', p2, !c.corretagem && 'subtle')}>{r0(c.corretagem)}</td>
              <td className={cn('num', p2, !c.zeragem && 'subtle')}>{r0(c.zeragem)}</td>
              {detalhe && <td className={cn('num col-p3', !c.pontos && 'subtle')}>{n0(c.pontos)}</td>}
              <td className={cn('num', p2, !c.incentivo && 'subtle')} title={parcial ? `${fmtNum(c.pontos)} dos ${fmtNum(c.pontosCliente)} pontos do cliente foram no código do parceiro: entra essa fração do incentivo de ${r0(c.incentivoCliente)}` : c.pontosFaltantes ? `faltam ${fmtNum(c.pontosFaltantes)} pontos para a próxima faixa` : undefined}>
                {r0(c.incentivo)}{parcial && <span className="text-fg-subtle"> *</span>}
              </td>
              <td className={cn('num font-semibold', !c.total && 'subtle')}>{r0(c.total)}</td>
            </tr>
          )
        })}
      </tbody>
      {linhas.length > 0 && (
        <tfoot>
          <tr className="total">
            <td>{fmtNum(linhas.length)} {linhas.length === 1 ? 'cliente · gerou' : 'clientes · geraram'}</td>{comCorretora && <td className={pc} />}
            <td className="num">{n0(totais.lotes)}</td>
            {detalhe && <td className="num col-p3">{n0(totais.zerados)}</td>}
            <td className={cn('num', p2)}>{r0(totais.corretagem)}</td>
            <td className={cn('num', p2)}>{r0(totais.zeragem)}</td>
            {detalhe && <td className="col-p3" />}
            <td className={cn('num', p2)}>{r0(totais.incentivo)}</td>
            <td />
          </tr>
          <tr className="total">
            <td>Parte de {parceiro}</td>{comCorretora && <td className={pc} />}
            <td />{detalhe && <td className="col-p3" />}
            <td className={cn('num', p2)}>{r0(totais.parteCorretagem)}</td>
            <td className={cn('num', p2)}>{r0(totais.parteZeragem)}</td>
            {detalhe && <td className="col-p3" />}
            <td className={cn('num', p2)}>{r0(totais.parteIncentivo)}</td>
            <td className="num">{r0(totais.total)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  )
}
