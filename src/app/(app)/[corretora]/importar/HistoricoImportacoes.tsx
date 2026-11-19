'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { Undo2 } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Dica } from '@/components/ui/Dica'
import { alemDe, MostrarMais } from '@/components/ui/MostrarMais'
import { useToast } from '@/components/ui/Toast'
import { desfazerImportacao } from '@/lib/gestao/acoes'
import { dataPt, LinhaVazia, n0, TRACO } from '@/components/gestao/Celulas'
import type { Corretora } from '@/lib/corretoras'
import type { Importacao } from '@/lib/gestao/tipos'
import { fmtDataHoraPt, fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ehRegistroDoFechamento } from './registros'

const AJUDA = 'Importações de lotes podem ser desfeitas (apaga só os lotes daquela importação); cadastro e leads são atualizações.'
// no celular o Histórico mostra as últimas importações e o resto atrás de "mostrar mais"
const NO_CELULAR = 8
const alem = alemDe(NO_CELULAR)

export function HistoricoImportacoes({ corretora, itens }: { corretora: Corretora; itens: Importacao[] }) {
  const router = useRouter()
  const { avisar } = useToast()
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const desfazer = async (imp: Importacao) => {
    if (!confirm(`Desfazer a importação "${imp.nome_arquivo}"? Os ${imp.linhas_novas} lotes dela serão apagados.`)) return
    setOcupado(imp.id); setErro(null)
    const r = await desfazerImportacao(corretora, imp.id)
    setOcupado(null)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: 'Importação desfeita', detalhe: imp.nome_arquivo, tom: 'neutral' })
    router.refresh()
  }

  const tabela = (
    <div className="tbl-wrap">
      {/* No celular (DESIGN.md §8.6) cada importação vira um item: o nome do arquivo inteiro em cima (a hora da
          parcial não é mais cortada) e, embaixo, quando, o tipo, as linhas, o período, quem subiu e os detalhes */}
      <table className="tbl tbl-dense tbl-lista" style={{ '--lista-direita': '7.5rem' } as CSSProperties}>
        <thead><tr><th>Quando</th><th>Tipo</th><th>Arquivo</th><th className="num">Linhas</th><th className="num col-p2">Novas</th><th className="col-p2">Período</th><th className="col-p3">Detalhes</th><th className="col-p3">Por</th><th><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>
          {itens.length === 0 && <LinhaVazia colunas={9}>Nenhuma importação ainda.</LinhaVazia>}
          {itens.map((i, idx) => {
            const d = i.detalhes ?? {}
            const detalhes = [
              d.modo ? `modo: ${String(d.modo)}` : null,
              d.removidas ? `${n0(Number(d.removidas))} substituídas` : null,
              d.operados != null ? `${n0(Number(d.operados))} operados · ${n0(Number(d.zerados ?? 0))} zerados` : null,
              d.clientes_novos != null ? `${n0(Number(d.clientes_novos))} clientes novos · ${n0(Number(d.contas_atualizadas ?? 0))} contas atualizadas` : null,
              d.por_cpf != null ? `casados: ${n0(Number(d.por_cpf))} CPF · ${n0(Number(d.por_conta))} conta · ${n0(Number(d.por_telefone))} tel. · ${n0(Number(d.por_nome))} nome` : null,
              d.status === 'em andamento' ? 'incompleta' : null,
            ].filter(Boolean).join(' · ')
            // Fechamento, Banking e fora do giro também são gravados como "lotes". No celular o "Desfazer" daqui
            // não fica à mão nessas linhas (apagaria o registro sem devolver as corretagens ajustadas): a linha
            // diz que o lugar de desfazer é "Fechamento e Banking do mês". No computador fica como sempre.
            const doFechamento = ehRegistroDoFechamento(i)
            const acaoNoCelular = i.tipo === 'lotes' && !doFechamento
            return (
              <tr key={i.id} className={alem(idx)}>
                <td className="num whitespace-nowrap">{fmtDataHoraPt(i.created_at)}</td>
                <td><Badge variant="neutral">{i.tipo}</Badge></td>
                <td className="max-w-[260px] truncate cel-titulo" title={i.nome_arquivo}>
                  {i.nome_arquivo}
                  {/* no celular, quando e o tipo logo embaixo do nome (as duas colunas vêm antes do nome na linha) */}
                  <span className="block text-label font-normal text-fg-muted md:hidden">{fmtDataHoraPt(i.created_at)} · {i.tipo}</span>
                </td>
                <td className="num cel-sub" data-sufixo="linhas">{n0(i.linhas)}</td>
                <td className={cn('num col-p2 cel-sub', !i.linhas_novas && 'vazio')} data-sufixo="novas">{n0(i.linhas_novas)}</td>
                <td className={cn('num col-p2 cel-sub', !i.data_min && 'vazio')}>{i.data_min ? `${dataPt(i.data_min)} a ${dataPt(i.data_max)}` : TRACO}</td>
                <td className={cn('muted col-p3 text-label cel-sub', !detalhes && 'vazio')}>{detalhes || TRACO}</td>
                <td className={cn('muted col-p3 cel-sub', !i.criado_por_nome && 'vazio')} data-rotulo="por">{i.criado_por_nome ?? TRACO}</td>
                <td className={cn('text-right', acaoNoCelular ? 'cel-acoes' : doFechamento && 'cel-bloco')}>
                  {i.tipo === 'lotes' && (
                    <span className={cn(doFechamento && 'max-md:hidden')}>
                      <Button variant="ghost" size="xs" loading={ocupado === i.id} onClick={() => desfazer(i)}><Undo2 className="h-3.5 w-3.5" aria-hidden />Desfazer</Button>
                    </span>
                  )}
                  {/* o nome do botão de lá: o fechamento tem "Desfazer"; Banking e fora do giro têm "Tirar" */}
                  {doFechamento && <span className="text-label text-fg-subtle md:hidden">{i.detalhes?.fechamento != null ? 'Desfazer' : 'Tirar'} em Fechamento e Banking do mês.</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <Panel title={<>Histórico <Dica texto={AJUDA} className="md:hidden" /></>} subtitle={<span className="max-md:hidden">{AJUDA}</span>}>
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      {itens.length > NO_CELULAR
        ? <MostrarMais rotulo={`mostrar mais (${fmtNum(itens.length - NO_CELULAR)} ${itens.length - NO_CELULAR === 1 ? 'importação' : 'importações'})`}>{tabela}</MostrarMais>
        : tabela}
    </Panel>
  )
}
