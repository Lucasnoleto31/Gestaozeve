'use client'

// Histórico de contatos de um lead (S47): a "rota" do atendimento. Lista o que já foi registrado,
// registra um contato com data e nota e apaga o que entrou por engano. Vive dentro da ficha do lead.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneCall, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Dica } from '@/components/ui/Dica'
import { useToast } from '@/components/ui/Toast'
import { TRACO, dataCurta } from '@/components/gestao/Celulas'
import { excluirContatoLead, listarContatosLead } from '@/lib/gestao/acoes'
import { registrarContato } from '@/lib/gestao/acoesFila'
import type { LeadContato } from '@/lib/gestao/tipos'
import { somarDias } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum } from '@/lib/format'

export function ContatosLead({ leadId, nome, status, aberto, onRegistrado, onExcluido, onLista }: {
  leadId: string
  nome: string
  status: string
  aberto: boolean
  onRegistrado?: (data: string, novoStatus?: string) => void   // a ficha acompanha o último contato e o status
  onExcluido?: (ultimo: string | null) => void                  // a ficha volta ao último contato que sobrou
  onLista?: (total: number) => void                             // quantos contatos há, a cada leitura do histórico
}) {
  const router = useRouter()
  const { avisar } = useToast()
  const hoje = fmtDate(hojeBrasil())
  const [lista, setLista] = useState<LeadContato[] | null>(null)
  const [data, setData] = useState(hoje)
  const [nota, setNota] = useState('')
  const [proximo, setProximo] = useState('')   // retorno combinado (S59); vazio = nenhum
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // o histórico vem do servidor quando a ficha abre (e some se a ficha trocar de lead no meio)
  useEffect(() => {
    let ativo = true
    listarContatosLead(leadId).then(r => {
      if (!ativo) return
      if (r.ok) { setLista(r.dados); onLista?.(r.dados.length) }
      else { setLista([]); setErro(r.erro) }
    })
    return () => { ativo = false }
    // onLista é só um aviso para a ficha: não refaz a leitura quando muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])
  // recarrega depois de registrar ou apagar; devolve a lista nova para quem precisa dela
  const carregar = async () => {
    const r = await listarContatosLead(leadId)
    if (r.ok) { setLista(r.dados); onLista?.(r.dados.length) }
    else { setLista([]); setErro(r.erro) }
    return r.ok ? r.dados : []
  }

  const registrar = async () => {
    setSalvando(true); setErro(null)
    const novoStatus = aberto && status === 'Novo' ? 'Em contato' : undefined
    const r = await registrarContato({ tipo: 'lead', id: leadId }, { data, nota, proximo: proximo || null, status: novoStatus })
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: `Contato registrado · ${nome}`, detalhe: `${fmtNum(r.dados.contatos)}º contato com este lead.${r.dados.proximo ? ` Retorno marcado para ${dataCurta(r.dados.proximo)}.` : ''}`, tom: 'gain' })
    onRegistrado?.(data, novoStatus)
    setNota(''); setData(hoje); setProximo('')
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

  // Celular (DESIGN.md §8), só por classe: o título do bloco mais forte que o rótulo dos campos; a nota na
  // largura toda, a data e o próximo contato lado a lado e o botão largo (antes, quatro linhas de larguras
  // diferentes, com o botão fora da vista); no histórico a nota aparece inteira, embaixo da data.
  return (
    <div>
      <p className="label mb-3 flex items-center gap-1.5 max-md:text-dense max-md:font-semibold max-md:text-fg">
        Contatos{lista ? ` · ${fmtNum(lista.length)}` : ''}
        <Dica texto="Cada ligação ou mensagem conta; a média de contatos até ganhar sai daqui." />
      </p>
      {erro && <p className="mb-2 text-label text-loss">{erro}</p>}
      <div className="flex flex-wrap items-end gap-2 max-md:grid max-md:grid-cols-2 max-md:gap-3">
        <div className="w-44 max-md:w-auto"><Input label="Data" type="date" value={data} max={hoje} onChange={e => setData(e.target.value)} /></div>
        <div className="min-w-[220px] flex-1 max-md:order-first max-md:col-span-2 max-md:min-w-0">
          <Input label="Nota" value={nota} onChange={e => setNota(e.target.value)} placeholder="Ligou, mandou WhatsApp, pediu retorno…" className="max-md:placeholder:text-label"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void registrar() } }} />
        </div>
        <div className="w-44 max-md:w-auto"><Input label="Próximo contato" type="date" value={proximo} min={somarDias(data || hoje, 1)} onChange={e => setProximo(e.target.value)} title="Retorno combinado: entra na Minha fila no dia" /></div>
        <Button variant="secondary" onClick={registrar} loading={salvando} className="max-md:col-span-2"><PhoneCall className="h-4 w-4" aria-hidden />Registrar contato</Button>
      </div>
      {/* celular: o que no computador está na dica do mouse do campo "Próximo contato" */}
      <p className="mt-2 text-label text-fg-muted md:hidden">O contato fica gravado na hora. Com próximo contato, o lead entra na Minha fila no dia.</p>
      <ul className="mt-3 divide-y divide-line text-dense">
        {lista === null && <li className="py-2 text-fg-subtle">Carregando…</li>}
        {lista?.length === 0 && <li className="py-2 text-fg-subtle">Nenhum contato registrado ainda.</li>}
        {lista?.map((c, i) => (
          <li key={c.id} className="flex items-center gap-3 py-1.5 max-md:grid max-md:grid-cols-[auto_minmax(0,1fr)_auto] max-md:gap-x-2 max-md:gap-y-0">
            <span className="w-7 shrink-0 text-right tabular-nums text-fg-subtle max-md:w-auto max-md:text-left max-md:text-fg-muted">{lista.length - i}º</span>
            <span className="w-20 shrink-0 font-medium tabular-nums max-md:w-auto">{dataCurta(c.data)}</span>
            <span className="min-w-0 flex-1 text-fg-muted md:truncate max-md:col-span-2 max-md:col-start-1 max-md:row-start-2 max-md:break-words">{c.nota ?? TRACO}{c.criado_por_nome ? <span className="text-fg-subtle"> · {c.criado_por_nome}</span> : null}</span>
            <IconButton tone="danger" aria-label={`Apagar contato de ${dataCurta(c.data)}`} title="Apagar" onClick={() => excluir(c)} className="h-7 w-7 max-md:col-start-3 max-md:row-span-2 max-md:row-start-1 max-md:self-center"><Trash2 className="h-3.5 w-3.5" aria-hidden /></IconButton>
          </li>
        ))}
      </ul>
    </div>
  )
}
