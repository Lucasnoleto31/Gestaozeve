// Tabela do extrato do parceiro (S48): a mesma na tela Comissões e na versão para imprimir.
// Sem hooks: serve em Server Components. Na impressão todas as colunas aparecem.
// Na tela, no celular, a tabela vira lista (DESIGN.md §8.6): o cliente em cima; a situação, a corretora, os
// lotes do mês e o último giro na linha de apoio; a receita bruta do mês à direita (sem receita, os lotes).
// Conta, abertura, zerados e os 12 meses ficam na planilha e na versão para imprimir. Nada disso entra no
// papel (`impressao`).
import type { CSSProperties } from 'react'
import type { ExtratoParceiroRow } from '@/lib/gestao/tipos'
import { rotuloCorretora, totaisExtrato } from '@/lib/gestao/extrato'
import { mesCurto } from '@/lib/gestao/meses'
import { LinhaVazia, TRACO, dataCurta, n0, r0 } from '@/components/gestao/Celulas'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

export function TabelaExtrato({ linhas, comReceita, impressao, vazio, classeLinha }: {
  linhas: ExtratoParceiroRow[]
  comReceita: boolean
  impressao?: boolean   // todas as colunas visíveis (papel)
  vazio?: string
  classeLinha?: (i: number) => string | undefined   // celular: as linhas além do limite ficam atrás de "mostrar mais"
}) {
  const t = totaisExtrato(linhas)
  const p2 = impressao ? '' : 'col-p2'
  const p3 = impressao ? '' : 'col-p3'
  const colunas = 9 + (comReceita ? 2 : 0)
  // só na tela: o papel de cada célula na lista do celular e o nome do dado na frente do valor
  const papel = (classe: string, tem: unknown = true) => (!impressao && tem ? classe : '')
  const rotulo = (nome: string) => (impressao ? undefined : nome)
  const unidade = (texto: string) => (impressao ? null : <span className="md:hidden"> {texto}</span>)
  // o número à direita: a receita do mês; no extrato sem receita, os lotes
  const papelLotes = (n: number) => (comReceita ? papel('cel-sub', n) : papel('cel-valor'))
  return (
    <table className={cn('tbl tbl-dense', !impressao && 'tbl-lista')} style={impressao ? undefined : ({ '--lista-direita': '7rem' } as CSSProperties)}>
      <thead>
        <tr>
          <th>Cliente</th><th className={p2}>Corretora</th><th className={p3}>Conta</th><th className={p2}>Situação</th><th className={cn('num', p3)}>Abertura</th>
          <th className="num">Lotes no mês</th><th className={cn('num', p3)}>Zerados</th>{comReceita && <th className="num">Receita bruta no mês</th>}
          <th className={cn('num', p2)}>Lotes 12 m</th>{comReceita && <th className={cn('num', p2)}>Receita 12 m</th>}<th className={cn('num', p3)}>Último giro</th>
        </tr>
      </thead>
      <tbody>
        {linhas.length === 0 && <LinhaVazia colunas={colunas}>{vazio ?? 'Nenhuma conta na carteira com esse filtro.'}</LinhaVazia>}
        {linhas.map((l, i) => (
          <tr key={`${l.cliente_id}:${l.corretora}`} className={classeLinha?.(i)}>
            <td className={cn('max-w-[260px] truncate font-medium', papel('cel-titulo'))}>{l.nome}</td>
            <td className={cn('muted', p2, papel('cel-sub'))}>{rotuloCorretora(l.corretora)}</td>
            <td className={cn('num muted', p3)}>{l.conta ?? TRACO}</td>
            <td className={cn('muted', p2, papel('cel-sub'))}>{l.status}</td>
            <td className={cn('num', p3)}>{dataCurta(l.data_abertura)}</td>
            <td className={cn('num font-semibold', !l.lotes_mes && 'subtle', papelLotes(l.lotes_mes), !impressao && comReceita && 'max-md:font-normal')} data-rotulo={comReceita ? undefined : rotulo('lotes\u00a0no\u00a0mês')}>{n0(l.lotes_mes)}{comReceita && unidade(l.lotes_mes === 1 ? 'lote no mês' : 'lotes no mês')}</td>
            <td className={cn('num', p3, !l.zerados_mes && 'subtle')}>{n0(l.zerados_mes)}</td>
            {/* no celular o número da direita é sempre forte: o zero é apagado à mão, como nas outras listas */}
            {comReceita && <td className={cn('num', !l.receita_mes && 'subtle', papel('cel-valor'))}>{!impressao && !l.receita_mes ? <span className="max-md:text-fg-subtle">{r0(l.receita_mes)}</span> : r0(l.receita_mes)}</td>}
            <td className={cn('num', p2, !l.lotes_12m && 'subtle')}>{n0(l.lotes_12m)}</td>
            {comReceita && <td className={cn('num', p2, !l.receita_12m && 'subtle')}>{r0(l.receita_12m)}</td>}
            <td className={cn('num', p3, !l.ultimo_mes_giro && 'subtle', papel('cel-sub', l.ultimo_mes_giro))} data-rotulo={rotulo('último\u00a0giro')}>{l.ultimo_mes_giro ? mesCurto(l.ultimo_mes_giro) : TRACO}</td>
          </tr>
        ))}
      </tbody>
      {linhas.length > 0 && (
        <tfoot>
          <tr className="total">
            <td className={papel('cel-titulo')}>{fmtNum(t.contas)} {t.contas === 1 ? 'conta' : 'contas'} · {fmtNum(t.giraram)} {t.giraram === 1 ? 'girou' : 'giraram'} no mês</td>
            <td className={p2} /><td className={p3} /><td className={p2} /><td className={p3} />
            <td className={cn('num', papelLotes(t.lotes_mes))} data-rotulo={comReceita ? undefined : rotulo('lotes\u00a0no\u00a0mês')}>{n0(t.lotes_mes)}{comReceita && unidade(t.lotes_mes === 1 ? 'lote no mês' : 'lotes no mês')}</td>
            <td className={cn('num', p3)}>{n0(t.zerados_mes)}</td>
            {comReceita && <td className={cn('num', papel('cel-valor'))}>{r0(t.receita_mes)}</td>}
            <td className={cn('num', p2)}>{n0(t.lotes_12m)}</td>
            {comReceita && <td className={cn('num', p2)}>{r0(t.receita_12m)}</td>}
            <td className={p3} />
          </tr>
        </tfoot>
      )}
    </table>
  )
}
