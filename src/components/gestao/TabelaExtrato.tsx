// Tabela do extrato do parceiro (S48): a mesma na tela Comissões e na versão para imprimir.
// Sem hooks: serve em Server Components. Na impressão todas as colunas aparecem.
import type { ExtratoParceiroRow } from '@/lib/gestao/tipos'
import { rotuloCorretora, totaisExtrato } from '@/lib/gestao/extrato'
import { mesCurto } from '@/lib/gestao/meses'
import { LinhaVazia, TRACO, dataCurta, n0, r0 } from '@/components/gestao/Celulas'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

export function TabelaExtrato({ linhas, comReceita, impressao, vazio }: {
  linhas: ExtratoParceiroRow[]
  comReceita: boolean
  impressao?: boolean   // todas as colunas visíveis (papel)
  vazio?: string
}) {
  const t = totaisExtrato(linhas)
  const p2 = impressao ? '' : 'col-p2'
  const p3 = impressao ? '' : 'col-p3'
  const colunas = 9 + (comReceita ? 2 : 0)
  return (
    <table className="tbl tbl-dense">
      <thead>
        <tr>
          <th>Cliente</th><th className={p2}>Corretora</th><th className={p3}>Conta</th><th className={p2}>Situação</th><th className={cn('num', p3)}>Abertura</th>
          <th className="num">Lotes no mês</th><th className={cn('num', p3)}>Zerados</th>{comReceita && <th className="num">Receita bruta no mês</th>}
          <th className={cn('num', p2)}>Lotes 12 m</th>{comReceita && <th className={cn('num', p2)}>Receita 12 m</th>}<th className={cn('num', p3)}>Último giro</th>
        </tr>
      </thead>
      <tbody>
        {linhas.length === 0 && <LinhaVazia colunas={colunas}>{vazio ?? 'Nenhuma conta na carteira com esse filtro.'}</LinhaVazia>}
        {linhas.map(l => (
          <tr key={`${l.cliente_id}:${l.corretora}`}>
            <td className="max-w-[260px] truncate font-medium">{l.nome}</td>
            <td className={cn('muted', p2)}>{rotuloCorretora(l.corretora)}</td>
            <td className={cn('num muted', p3)}>{l.conta ?? TRACO}</td>
            <td className={cn('muted', p2)}>{l.status}</td>
            <td className={cn('num', p3)}>{dataCurta(l.data_abertura)}</td>
            <td className={cn('num font-semibold', !l.lotes_mes && 'subtle')}>{n0(l.lotes_mes)}</td>
            <td className={cn('num', p3, !l.zerados_mes && 'subtle')}>{n0(l.zerados_mes)}</td>
            {comReceita && <td className={cn('num', !l.receita_mes && 'subtle')}>{r0(l.receita_mes)}</td>}
            <td className={cn('num', p2, !l.lotes_12m && 'subtle')}>{n0(l.lotes_12m)}</td>
            {comReceita && <td className={cn('num', p2, !l.receita_12m && 'subtle')}>{r0(l.receita_12m)}</td>}
            <td className={cn('num', p3, !l.ultimo_mes_giro && 'subtle')}>{l.ultimo_mes_giro ? mesCurto(l.ultimo_mes_giro) : TRACO}</td>
          </tr>
        ))}
      </tbody>
      {linhas.length > 0 && (
        <tfoot>
          <tr className="total">
            <td>{fmtNum(t.contas)} {t.contas === 1 ? 'conta' : 'contas'} · {fmtNum(t.giraram)} {t.giraram === 1 ? 'girou' : 'giraram'} no mês</td>
            <td className={p2} /><td className={p3} /><td className={p2} /><td className={p3} />
            <td className="num">{n0(t.lotes_mes)}</td>
            <td className={cn('num', p3)}>{n0(t.zerados_mes)}</td>
            {comReceita && <td className="num">{r0(t.receita_mes)}</td>}
            <td className={cn('num', p2)}>{n0(t.lotes_12m)}</td>
            {comReceita && <td className={cn('num', p2)}>{r0(t.receita_12m)}</td>}
            <td className={p3} />
          </tr>
        </tfoot>
      )}
    </table>
  )
}
