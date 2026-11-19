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

// Celular: quantos contatos do histórico ficam à vista, e o campo de data numa linha só (o rótulo à
// esquerda e o campo à direita, com largura para "dd/mm/aaaa" caber inteiro)
const NO_CELULAR = 3
const DATA_NO_CELULAR = 'max-md:w-full max-md:[&>div]:flex-row max-md:[&>div]:items-center max-md:[&>div]:justify-between'

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
  const [todos, setTodos] = useState(false)    // celular: o histórico inteiro só depois do toque

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

  // No celular (DESIGN.md §8): a nota vem primeiro, as duas datas ficam cada uma na sua linha (rótulo à
  // esquerda, campo à direita: lado a lado o "dd/mm/aaaa" não cabia) e "Registrar contato" ocupa a largura,
  // como botão principal. O histórico mostra os 3 últimos; o resto abre no toque. A regra de contagem do
  // Funil sai do subtítulo: não ajuda quem está registrando.
  return (
    <Panel variant="card" title={`Contatos · ${fmtNum(lista.length)}`}
      subtitle={ativador
        ? <>Campanha de ativação com {ativador}.<span className="max-md:hidden"> Cada ligação ou mensagem conta.</span></>
        : <span className="max-md:hidden">Cada ligação ou mensagem conta; o Funil soma por atendente da campanha.</span>}>
      {erro && <p className="mb-2 text-label text-loss">{erro}</p>}
      {retorno && (
        <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-dense">
          <CalendarClock className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
          <span>Retorno combinado para <span className={cn('font-semibold tabular-nums', retorno <= hoje && 'text-warn')}>{dataCurta(retorno)}</span> <span className="text-fg-muted">({quando(retorno, hoje)})</span></span>
          <button type="button" className="link text-label" disabled={salvando} onClick={() => marcarRetorno(null)}>desmarcar</button>
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className={cn('w-40 max-md:order-2', DATA_NO_CELULAR)}><Input label="Data" type="date" className="max-md:w-48" value={data} max={hoje} onChange={e => setData(e.target.value)} /></div>
        <div className="min-w-[180px] flex-1 max-md:order-1 max-md:basis-full">
          <Input label="Nota" className="max-md:placeholder:text-label" value={nota} onChange={e => setNota(e.target.value)} placeholder="Ligou, mandou WhatsApp, pediu retorno…"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void registrar() } }} />
        </div>
        <div className={cn('w-40 max-md:order-3', DATA_NO_CELULAR)}><Input label="Próximo contato" type="date" className="max-md:w-48" value={proximo} min={somarDias(data || hoje, 1)} onChange={e => setProximo(e.target.value)} title="Retorno combinado: entra na Minha fila no dia" /></div>
        <Button variant="secondary" className="max-md:order-4 max-md:mt-1 max-md:h-11 max-md:w-full max-md:border-accent max-md:bg-accent max-md:text-accent-fg max-md:hover:bg-accent-hover" onClick={registrar} loading={salvando}><PhoneCall className="h-4 w-4" aria-hidden />Registrar contato</Button>
      </div>
      {proximo && (
        <p className="mt-2 text-label text-fg-muted">
          {/* no computador esta explicação aparece ao passar o mouse no campo */}
          <span className="md:hidden">O retorno entra na Minha fila no dia. </span>
          Não falou com o cliente agora?{' '}
          <button type="button" className="link" disabled={salvando} onClick={() => marcarRetorno(proximo)}>Marcar só o retorno para {dataCurta(proximo)}</button>
        </p>
      )}
      <ul className="mt-3 divide-y divide-line text-dense">
        {lista.length === 0 && <li className="py-2 text-fg-subtle">Nenhum contato registrado ainda.</li>}
        {lista.map((c, i) => (
          <li key={c.id} className={cn('flex items-start gap-3 py-1.5 max-md:flex-wrap max-md:items-center max-md:gap-x-2 max-md:gap-y-0', !todos && i >= NO_CELULAR && 'max-md:hidden')}>
            <span className="w-7 shrink-0 text-right tabular-nums text-fg-subtle max-md:hidden">{lista.length - i}º</span>
            <span className="w-20 shrink-0 font-medium tabular-nums max-md:w-auto max-md:flex-1">{dataCurta(c.data)}{c.criado_por_nome ? <span className="font-normal text-fg-subtle md:hidden"> · {c.criado_por_nome}</span> : null}</span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-fg-muted max-md:order-last max-md:basis-full max-md:pb-1">{c.nota ?? TRACO}{c.criado_por_nome ? <span className="text-fg-subtle max-md:hidden"> · {c.criado_por_nome}</span> : null}</span>
            <IconButton tone="danger" aria-label={`Apagar contato de ${dataCurta(c.data)}`} title="Apagar" onClick={() => excluir(c)} className="h-7 w-7"><Trash2 className="h-3.5 w-3.5" aria-hidden /></IconButton>
          </li>
        ))}
      </ul>
      {!todos && lista.length > NO_CELULAR && (
        <button type="button" className="link mt-1 text-dense md:hidden" onClick={() => setTodos(true)}>Ver todos os {fmtNum(lista.length)} contatos</button>
      )}
    </Panel>
  )
}
