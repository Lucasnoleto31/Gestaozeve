'use client'

// Histórico de contatos de um lead (S47): a "rota" do atendimento. Lista o que já foi registrado,
// registra um contato com data e nota e apaga o que entrou por engano. Vive dentro da ficha do lead.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneCall, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { TRACO, dataCurta } from '@/components/gestao/Celulas'
import { excluirContatoLead, listarContatosLead, registrarContatoLead } from '@/lib/gestao/acoes'
import type { LeadContato } from '@/lib/gestao/tipos'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum } from '@/lib/format'

export function ContatosLead({ leadId, nome, status, aberto, onRegistrado, onExcluido }: {
  leadId: string
  nome: string
  status: string
  aberto: boolean
  onRegistrado?: (data: string, novoStatus?: string) => void   // a ficha acompanha o último contato e o status
  onExcluido?: (ultimo: string | null) => void                  // a ficha volta ao último contato que sobrou
}) {
  const router = useRouter()
  const { avisar } = useToast()
  const hoje = fmtDate(hojeBrasil())
  const [lista, setLista] = useState<LeadContato[] | null>(null)
  const [data, setData] = useState(hoje)
  const [nota, setNota] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // o histórico vem do servidor quando a ficha abre (e some se a ficha trocar de lead no meio)
  useEffect(() => {
    let ativo = true
    listarContatosLead(leadId).then(r => {
      if (!ativo) return
      if (r.ok) setLista(r.dados)
      else { setLista([]); setErro(r.erro) }
    })
    return () => { ativo = false }
  }, [leadId])
  // recarrega depois de registrar ou apagar; devolve a lista nova para quem precisa dela
  const carregar = async () => {
    const r = await listarContatosLead(leadId)
    if (r.ok) setLista(r.dados)
    else { setLista([]); setErro(r.erro) }
    return r.ok ? r.dados : []
  }

  const registrar = async () => {
    setSalvando(true); setErro(null)
    const novoStatus = aberto && status === 'Novo' ? 'Em contato' : undefined
    const r = await registrarContatoLead(leadId, novoStatus, data, nota)
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: `Contato registrado · ${nome}`, detalhe: r.dados.contatos != null ? `${fmtNum(r.dados.contatos)}º contato com este lead.` : undefined, tom: 'gain' })
    onRegistrado?.(data, novoStatus)
    setNota(''); setData(hoje)
    await carregar()
    router.refresh()
  }
  const excluir = async (c: LeadContato) => {
    if (!confirm(`Apagar o contato de ${dataCurta(c.data)}?`)) return
    const r = await excluirContatoLead(c.id)
    if (!r.ok) { setErro(r.erro); return }
    const restantes = await carregar()
    onExcluido?.(restantes.reduce<string | null>((m, x) => (m == null || x.data > m ? x.data : m), null))
    router.refresh()
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="label">Contatos{lista ? ` · ${fmtNum(lista.length)}` : ''}</p>
        <p className="text-micro text-fg-subtle">Cada ligação ou mensagem conta; a média de contatos até ganhar sai daqui.</p>
      </div>
      {erro && <p className="mb-2 text-label text-loss">{erro}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40"><Input label="Data" type="date" value={data} max={hoje} onChange={e => setData(e.target.value)} /></div>
        <div className="min-w-[220px] flex-1">
          <Input label="Nota" value={nota} onChange={e => setNota(e.target.value)} placeholder="Ligou, mandou WhatsApp, pediu retorno…"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void registrar() } }} />
        </div>
        <Button variant="secondary" onClick={registrar} loading={salvando}><PhoneCall className="h-4 w-4" aria-hidden />Registrar contato</Button>
      </div>
      <ul className="mt-3 divide-y divide-line text-dense">
        {lista === null && <li className="py-2 text-fg-subtle">Carregando…</li>}
        {lista?.length === 0 && <li className="py-2 text-fg-subtle">Nenhum contato registrado ainda.</li>}
        {lista?.map((c, i) => (
          <li key={c.id} className="flex items-center gap-3 py-1.5">
            <span className="w-7 shrink-0 text-right tabular-nums text-fg-subtle">{lista.length - i}º</span>
            <span className="w-20 shrink-0 font-medium tabular-nums">{dataCurta(c.data)}</span>
            <span className="min-w-0 flex-1 truncate text-fg-muted">{c.nota ?? TRACO}{c.criado_por_nome ? <span className="text-fg-subtle"> · {c.criado_por_nome}</span> : null}</span>
            <IconButton tone="danger" aria-label={`Apagar contato de ${dataCurta(c.data)}`} title="Apagar" onClick={() => excluir(c)} className="h-7 w-7"><Trash2 className="h-3.5 w-3.5" aria-hidden /></IconButton>
          </li>
        ))}
      </ul>
    </div>
  )
}
