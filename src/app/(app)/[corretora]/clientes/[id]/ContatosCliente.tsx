'use client'

// Histórico de contatos com o cliente (S52): a rota da campanha de ativação. Lista o que já foi
// registrado, registra um contato com data e nota e apaga o que entrou por engano. O mesmo modelo do
// ContatosLead; aqui o histórico já chega da página e o Funil soma por atendente da campanha.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneCall, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Panel } from '@/components/ui/Panel'
import { useToast } from '@/components/ui/Toast'
import { TRACO, dataCurta } from '@/components/gestao/Celulas'
import { excluirContatoCliente, listarContatosCliente, registrarContatoCliente } from '@/lib/gestao/acoes'
import type { Corretora } from '@/lib/corretoras'
import type { ClienteContato } from '@/lib/gestao/tipos'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum } from '@/lib/format'

export function ContatosCliente({ corretora, clienteId, nome, ativador, contatos }: {
  corretora: Corretora
  clienteId: string
  nome: string
  ativador: string | null        // atendente da campanha (subtítulo)
  contatos: ClienteContato[]     // histórico já carregado pela página
}) {
  const router = useRouter()
  const { avisar } = useToast()
  const hoje = fmtDate(hojeBrasil())
  const [lista, setLista] = useState<ClienteContato[]>(contatos)
  const [data, setData] = useState(hoje)
  const [nota, setNota] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // recarrega depois de registrar ou apagar
  const carregar = async () => {
    const r = await listarContatosCliente(corretora, clienteId)
    if (r.ok) setLista(r.dados)
    else setErro(r.erro)
  }
  const registrar = async () => {
    setSalvando(true); setErro(null)
    const r = await registrarContatoCliente(corretora, clienteId, data, nota)
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: `Contato registrado · ${nome}`, detalhe: `${fmtNum(r.dados.contatos)}º contato com este cliente.`, tom: 'gain' })
    setNota(''); setData(hoje)
    await carregar()
    router.refresh()
  }
  const excluir = async (c: ClienteContato) => {
    if (!confirm(`Apagar o contato de ${dataCurta(c.data)}?`)) return
    const r = await excluirContatoCliente(corretora, c.id)
    if (!r.ok) { setErro(r.erro); return }
    await carregar()
    router.refresh()
  }

  return (
    <Panel variant="card" title={`Contatos · ${fmtNum(lista.length)}`}
      subtitle={ativador ? `Campanha de ativação com ${ativador}. Cada ligação ou mensagem conta.` : 'Cada ligação ou mensagem conta; o Funil soma por atendente da campanha.'}>
      {erro && <p className="mb-2 text-label text-loss">{erro}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40"><Input label="Data" type="date" value={data} max={hoje} onChange={e => setData(e.target.value)} /></div>
        <div className="min-w-[180px] flex-1">
          <Input label="Nota" value={nota} onChange={e => setNota(e.target.value)} placeholder="Ligou, mandou WhatsApp, pediu retorno…"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void registrar() } }} />
        </div>
        <Button variant="secondary" onClick={registrar} loading={salvando}><PhoneCall className="h-4 w-4" aria-hidden />Registrar contato</Button>
      </div>
      <ul className="mt-3 divide-y divide-line text-dense">
        {lista.length === 0 && <li className="py-2 text-fg-subtle">Nenhum contato registrado ainda.</li>}
        {lista.map((c, i) => (
          <li key={c.id} className="flex items-center gap-3 py-1.5">
            <span className="w-7 shrink-0 text-right tabular-nums text-fg-subtle">{lista.length - i}º</span>
            <span className="w-20 shrink-0 font-medium tabular-nums">{dataCurta(c.data)}</span>
            <span className="min-w-0 flex-1 truncate text-fg-muted" title={c.nota ?? undefined}>{c.nota ?? TRACO}{c.criado_por_nome ? <span className="text-fg-subtle"> · {c.criado_por_nome}</span> : null}</span>
            <IconButton tone="danger" aria-label={`Apagar contato de ${dataCurta(c.data)}`} title="Apagar" onClick={() => excluir(c)} className="h-7 w-7"><Trash2 className="h-3.5 w-3.5" aria-hidden /></IconButton>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
