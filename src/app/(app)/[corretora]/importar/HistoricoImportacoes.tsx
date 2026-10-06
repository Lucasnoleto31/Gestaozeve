'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Undo2 } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'
import { desfazerImportacao } from '@/lib/gestao/acoes'
import { dataPt, LinhaVazia, n0, TRACO } from '@/components/gestao/Celulas'
import type { Corretora } from '@/lib/corretoras'
import type { Importacao } from '@/lib/gestao/tipos'
import { fmtDataHoraPt } from '@/lib/format'

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

  return (
    <Panel title="Histórico" subtitle="Importações de lotes podem ser desfeitas (apaga só os lotes daquela importação); cadastro e leads são atualizações.">
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      <div className="tbl-wrap">
        <table className="tbl tbl-dense">
          <thead><tr><th>Quando</th><th>Tipo</th><th>Arquivo</th><th className="num">Linhas</th><th className="num col-p2">Novas</th><th className="col-p2">Período</th><th className="col-p3">Detalhes</th><th className="col-p3">Por</th><th><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {itens.length === 0 && <LinhaVazia colunas={9}>Nenhuma importação ainda.</LinhaVazia>}
            {itens.map(i => {
              const d = i.detalhes ?? {}
              const detalhes = [
                d.modo ? `modo: ${String(d.modo)}` : null,
                d.removidas ? `${n0(Number(d.removidas))} substituídas` : null,
                d.operados != null ? `${n0(Number(d.operados))} operados · ${n0(Number(d.zerados ?? 0))} zerados` : null,
                d.clientes_novos != null ? `${n0(Number(d.clientes_novos))} clientes novos · ${n0(Number(d.contas_atualizadas ?? 0))} contas atualizadas` : null,
                d.por_cpf != null ? `casados: ${n0(Number(d.por_cpf))} CPF · ${n0(Number(d.por_conta))} conta · ${n0(Number(d.por_telefone))} tel. · ${n0(Number(d.por_nome))} nome` : null,
                d.status === 'em andamento' ? 'incompleta' : null,
              ].filter(Boolean).join(' · ')
              return (
                <tr key={i.id}>
                  <td className="num whitespace-nowrap">{fmtDataHoraPt(i.created_at)}</td>
                  <td><Badge variant="neutral">{i.tipo}</Badge></td>
                  <td className="max-w-[260px] truncate" title={i.nome_arquivo}>{i.nome_arquivo}</td>
                  <td className="num">{n0(i.linhas)}</td>
                  <td className="num col-p2">{n0(i.linhas_novas)}</td>
                  <td className="num col-p2">{i.data_min ? `${dataPt(i.data_min)} a ${dataPt(i.data_max)}` : TRACO}</td>
                  <td className="muted col-p3 text-label">{detalhes || TRACO}</td>
                  <td className="muted col-p3">{i.criado_por_nome ?? TRACO}</td>
                  <td className="text-right">
                    {i.tipo === 'lotes' && (
                      <Button variant="ghost" size="xs" loading={ocupado === i.id} onClick={() => desfazer(i)}><Undo2 className="h-3.5 w-3.5" aria-hidden />Desfazer</Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
