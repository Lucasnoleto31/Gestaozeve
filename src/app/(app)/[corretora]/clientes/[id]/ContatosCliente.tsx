'use client'

// Histórico de contatos com o cliente (S52): a rota da campanha de ativação. Lista o que já foi
// registrado, registra um contato com data e nota e apaga o que entrou por engano. O mesmo modelo do
// ContatosLead; aqui o histórico já chega da página e o Funil soma por atendente da campanha.
// Mostra também o retorno combinado (S59): dá para desmarcar ou marcar só o retorno, sem novo contato.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, PhoneCall, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Panel } from '@/components/ui/Panel'
import { useToast } from '@/components/ui/Toast'
import { TRACO, dataCurta } from '@/components/gestao/Celulas'
import { excluirContatoCliente, listarContatosCliente } from '@/lib/gestao/acoes'
import { agendarContato, registrarContato } from '@/lib/gestao/acoesFila'
import { quando } from '@/lib/gestao/fichaCliente'
import type { Corretora } from '@/lib/corretoras'
import type { ClienteContato } from '@/lib/gestao/tipos'
import { somarDias } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

export function ContatosCliente({ corretora, clienteId, nome, ativador, contatos, retorno }: {
  corretora: Corretora
  clienteId: string
  nome: string
  ativador: string | null        // atendente da campanha (subtítulo)
  contatos: ClienteContato[]     // histórico já carregado pela página
  retorno: string | null         // retorno combinado em aberto (S59); a página recarrega depois de cada mudança
}) {
  const router = useRouter()
  const { avisar } = useToast()
  const hoje = fmtDate(hojeBrasil())
  const [lista, setLista] = useState<ClienteContato[]>(contatos)
  const [data, setData] = useState(hoje)
  const [nota, setNota] = useState('')
  const [proximo, setProximo] = useState('')   // retorno combinado (S59); vazio = nenhum
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
    const r = await registrarContato({ tipo: 'cliente', id: clienteId, corretora }, { data, nota, proximo: proximo || null })
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: `Contato registrado · ${nome}`, detalhe: `${fmtNum(r.dados.contatos)}º contato com este cliente.${r.dados.proximo ? ` Retorno marcado para ${dataCurta(r.dados.proximo)}.` : ''}`, tom: 'gain' })
    setNota(''); setData(hoje); setProximo('')
    await carregar()
    router.refresh()
  }
  // marca (ou desmarca, com null) só o retorno, sem registrar contato
  const marcarRetorno = async (dia: string | null) => {
    setSalvando(true); setErro(null)
    const r = await agendarContato({ tipo: 'cliente', id: clienteId, corretora }, dia)
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: dia ? `Retorno marcado · ${nome}` : `Retorno desmarcado · ${nome}`, detalhe: dia ? `Entra na Minha fila em ${dataCurta(dia)}.` : undefined, tom: 'gain' })
    setProximo('')
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
      {retorno && (
        <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-dense">
          <CalendarClock className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
          <span>Retorno combinado para <span className={cn('font-semibold tabular-nums', retorno <= hoje && 'text-warn')}>{dataCurta(retorno)}</span> <span className="text-fg-muted">({quando(retorno, hoje)})</span></span>
          <button type="button" className="link text-label" disabled={salvando} onClick={() => marcarRetorno(null)}>desmarcar</button>
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40"><Input label="Data" type="date" value={data} max={hoje} onChange={e => setData(e.target.value)} /></div>
        <div className="min-w-[180px] flex-1">
          <Input label="Nota" value={nota} onChange={e => setNota(e.target.value)} placeholder="Ligou, mandou WhatsApp, pediu retorno…"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void registrar() } }} />
        </div>
        <div className="w-40"><Input label="Próximo contato" type="date" value={proximo} min={somarDias(data || hoje, 1)} onChange={e => setProximo(e.target.value)} title="Retorno combinado: entra na Minha fila no dia" /></div>
        <Button variant="secondary" onClick={registrar} loading={salvando}><PhoneCall className="h-4 w-4" aria-hidden />Registrar contato</Button>
      </div>
      {proximo && (
        <p className="mt-2 text-label text-fg-muted">
          Não falou com o cliente agora?{' '}
          <button type="button" className="link" disabled={salvando} onClick={() => marcarRetorno(proximo)}>Marcar só o retorno para {dataCurta(proximo)}</button>
        </p>
      )}
      <ul className="mt-3 divide-y divide-line text-dense">
        {lista.length === 0 && <li className="py-2 text-fg-subtle">Nenhum contato registrado ainda.</li>}
        {lista.map((c, i) => (
          <li key={c.id} className="flex items-start gap-3 py-1.5">
            <span className="w-7 shrink-0 text-right tabular-nums text-fg-subtle">{lista.length - i}º</span>
            <span className="w-20 shrink-0 font-medium tabular-nums">{dataCurta(c.data)}</span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-fg-muted">{c.nota ?? TRACO}{c.criado_por_nome ? <span className="text-fg-subtle"> · {c.criado_por_nome}</span> : null}</span>
            <IconButton tone="danger" aria-label={`Apagar contato de ${dataCurta(c.data)}`} title="Apagar" onClick={() => excluir(c)} className="h-7 w-7"><Trash2 className="h-3.5 w-3.5" aria-hidden /></IconButton>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
