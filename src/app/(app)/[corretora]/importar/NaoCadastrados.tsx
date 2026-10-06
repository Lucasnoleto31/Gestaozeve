'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Link2 } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'
import { buscarClientesAction, vincularContaNaoCadastrada } from '@/lib/gestao/acoes'
import { dataPt, LinhaVazia, n0, TRACO } from '@/components/gestao/Celulas'
import type { Corretora } from '@/lib/corretoras'
import type { LoteNaoCadastradoRow } from '@/lib/gestao/tipos'
import { fmtNum } from '@/lib/format'

type Item = { id: string; nome: string; documento: string | null; conta: string | null }

export function NaoCadastrados({ corretora, linhas, base }: { corretora: Corretora; linhas: LoteNaoCadastradoRow[]; base: string }) {
  const router = useRouter()
  const { avisar } = useToast()
  const [alvo, setAlvo] = useState<LoteNaoCadastradoRow | null>(null)
  const [termo, setTermo] = useState('')
  const [itens, setItens] = useState<Item[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [limite, setLimite] = useState(30)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (termo.trim().length < 2) return
    timer.current = setTimeout(async () => {
      const r = await buscarClientesAction(corretora, termo)
      if (r.ok) setItens(r.dados)
    }, 250)
  }, [termo, corretora])

  const vincular = async (clienteId: string, nome: string) => {
    if (!alvo?.conta) return
    setSalvando(clienteId); setErro(null)
    const r = await vincularContaNaoCadastrada(corretora, alvo.conta, clienteId)
    setSalvando(null)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: `Conta ${alvo.conta} vinculada`, detalhe: nome, tom: 'gain' })
    setAlvo(null); setTermo(''); setItens([])
    router.refresh()
  }

  const total = linhas.reduce((s, l) => s + l.lotes, 0)
  return (
    <Panel title="Lotes com cliente não cadastrado" subtitle={`${fmtNum(linhas.length)} contas · ${fmtNum(total)} lotes. Some ao importar o cadastro atualizado; se a conta não vier no export, vincule aqui.`}>
      <div id="nao-cadastrados" className="tbl-wrap max-h-[480px]">
        <table className="tbl tbl-dense">
          <thead><tr><th>Conta</th><th className="col-p2">Nome no relatório</th><th className="col-p3">Assessor</th><th className="num">Lotes</th><th className="num col-p3">Linhas</th><th className="col-p3">Primeira</th><th className="col-p2">Última</th><th><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {linhas.length === 0 && <LinhaVazia colunas={8}>Todos os lotes estão ligados a um cliente.</LinhaVazia>}
            {linhas.slice(0, limite).map(l => (
              <tr key={l.conta ?? '?'}>
                <td className="num font-medium">{l.conta ?? TRACO}</td>
                <td className="col-p2">{l.nome_cliente ?? TRACO}</td>
                <td className="muted col-p3">{l.assessor_nome ?? TRACO}</td>
                <td className="num">{n0(l.lotes)}</td>
                <td className="num col-p3">{n0(l.linhas)}</td>
                <td className="num col-p3">{dataPt(l.primeira)}</td>
                <td className="num col-p2">{dataPt(l.ultima)}</td>
                <td className="text-right"><Button variant="ghost" size="xs" onClick={() => { setAlvo(l); setTermo(l.nome_cliente ?? '') }}><Link2 className="h-3.5 w-3.5" aria-hidden />Vincular</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {linhas.length > limite && (
        <div className="py-2 text-center">
          <button type="button" className="link text-label" onClick={() => setLimite(n => n + 100)}>mostrar mais ({fmtNum(linhas.length - limite)} restantes)</button>
        </div>
      )}
      <Modal open={!!alvo} onClose={() => setAlvo(null)} title={`Vincular a conta ${alvo?.conta ?? ''}`} subtitle={`"${alvo?.nome_cliente ?? ''}" · ${fmtNum(alvo?.lotes ?? 0)} lotes. Escolha o cliente do cadastro; a conta passa a existir nele.`}>
        <div className="space-y-3">
          {erro && <Alert tone="loss">{erro}</Alert>}
          <input className="w-full" placeholder="Buscar cliente por nome, CPF ou conta" value={termo} onChange={e => setTermo(e.target.value)} autoFocus aria-label="Buscar cliente" />
          <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line">
            {itens.length === 0 && <li className="px-3 py-3 text-dense text-fg-subtle">Digite para buscar…</li>}
            {itens.map(it => (
              <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-dense font-medium">{it.nome}</p>
                  <p className="text-micro text-fg-subtle">{it.documento ?? 'sem CPF'}{it.conta ? ` · conta ${it.conta}` : ''} · <a className="link" href={`${base}/clientes/${it.id}`} target="_blank" rel="noreferrer">ver ficha</a></p>
                </div>
                <Button size="xs" loading={salvando === it.id} onClick={() => vincular(it.id, it.nome)}>Vincular</Button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </Panel>
  )
}
