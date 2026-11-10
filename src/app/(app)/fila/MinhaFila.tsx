'use client'

// A fila do dia: seções (combinados, leads novos, leads parados, clientes em risco, campanha), cada
// linha com o motivo, o telefone e as ações — registrar o contato (com o próximo combinado) ou só
// marcar o retorno. Quem registra sai da fila na hora; o servidor recarrega em seguida.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, MessageCircle, PhoneCall, RefreshCw } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button, IconButton } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Empty } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { TRACO, dataCurta } from '@/components/gestao/Celulas'
import { linkTelefone, montarFila, totalDaFila, type ItemFila, type SecaoFila } from '@/lib/gestao/fila'
import type { DadosFila } from '@/lib/gestao/consultasFila'
import { agendarContato, registrarContato, type AlvoFila } from '@/lib/gestao/acoesFila'
import { CORRETORA_SLUG, isCorretora, labelCorretora } from '@/lib/corretoras'
import { somarDias } from '@/lib/gestao/meses'
import { mesmaPessoa } from '@/lib/texto'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

const alvoDe = (i: ItemFila): AlvoFila => (i.tipo === 'lead' ? { tipo: 'lead', id: i.id } : { tipo: 'cliente', id: i.id, corretora: i.corretora ?? '' })
const linkDe = (i: ItemFila) =>
  i.tipo === 'lead' ? `/leads?busca=${encodeURIComponent(i.nome)}` : isCorretora(i.corretora) ? `/${CORRETORA_SLUG[i.corretora]}/clientes/${i.id}` : '/leads'

type Aberto = { chave: string; modo: 'contato' | 'agendar' }

export function MinhaFila({ leads, clientes, restrito, usuario, responsaveis, diasAlerta, hoje, semS59 }: DadosFila) {
  const router = useRouter()
  const { avisar } = useToast()
  const meuNome = responsaveis.find(r => mesmaPessoa(r, usuario)) ?? null
  const [quem, setQuem] = useState<string>(restrito ? '' : (meuNome ?? ''))
  // o que foi feito aqui some da fila na hora; quando o servidor manda dados novos (base muda), volta a valer só o servidor
  const [feitosDe, setFeitosDe] = useState<{ base: unknown; chaves: Set<string> }>({ base: leads, chaves: new Set() })
  const feitos = useMemo(() => (feitosDe.base === leads ? feitosDe.chaves : new Set<string>()), [feitosDe, leads])
  const [atualizandoDesde, setAtualizandoDesde] = useState<unknown>(null)
  const atualizando = atualizandoDesde === leads
  const [aberto, setAberto] = useState<Aberto | null>(null)
  const [form, setForm] = useState({ data: hoje, nota: '', proximo: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const secoes = useMemo<SecaoFila[]>(
    () => montarFila(leads, clientes, { hoje, diasAlerta, quem: quem || null }).map(s => ({ ...s, itens: s.itens.filter(i => !feitos.has(i.chave)) })),
    [leads, clientes, hoje, diasAlerta, quem, feitos],
  )
  const total = totalDaFila(secoes)
  const conta = (chave: SecaoFila['chave']) => secoes.find(s => s.chave === chave)?.itens.length ?? 0
  const atrasados = secoes[0].itens.filter(i => i.motivo === 'atrasado').length

  const abrir = (item: ItemFila, modo: Aberto['modo']) => {
    setErro(null)
    if (aberto?.chave === item.chave && aberto.modo === modo) { setAberto(null); return }
    setForm({ data: hoje, nota: '', proximo: modo === 'agendar' ? (item.proximo_contato ?? somarDias(hoje, 1)) : '' })
    setAberto({ chave: item.chave, modo })
  }
  const concluir = (item: ItemFila) => {
    setFeitosDe({ base: leads, chaves: new Set(feitos).add(item.chave) })
    setAberto(null)
    setAtualizandoDesde(leads)
    router.refresh()
  }
  const registrar = async (item: ItemFila) => {
    setSalvando(true); setErro(null)
    const r = await registrarContato(alvoDe(item), {
      data: form.data, nota: form.nota, proximo: form.proximo || null,
      status: item.tipo === 'lead' && item.status === 'Novo' ? 'Em contato' : null,
    })
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: `Contato registrado · ${item.nome}`, detalhe: `${fmtNum(r.dados.contatos)}º contato${r.dados.proximo ? ` · retorno marcado para ${dataCurta(r.dados.proximo)}` : ''}`, tom: 'gain' })
    concluir(item)
  }
  const agendar = async (item: ItemFila, data: string | null) => {
    setSalvando(true); setErro(null)
    const r = await agendarContato(alvoDe(item), data)
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: data ? `Retorno marcado para ${dataCurta(data)}` : 'Retorno desmarcado', detalhe: item.nome, tom: data ? 'gain' : 'neutral' })
    if (data === hoje) { setAberto(null); setAtualizandoDesde(leads); router.refresh() } else concluir(item)
  }
  const atualizar = () => { setAtualizandoDesde(leads); router.refresh() }

  return (
    <>
      <KpiRow cols={5}>
        <KpiCard label="Combinados" value={fmtNum(conta('agendados'))} sub={atrasados ? `${fmtNum(atrasados)} ${atrasados === 1 ? 'atrasado' : 'atrasados'}` : 'retornos para hoje'} tone={atrasados ? 'warn' : 'neutral'} />
        <KpiCard label="Leads novos" value={fmtNum(conta('novos'))} sub="sem nenhum contato" tone={conta('novos') ? 'warn' : 'neutral'} />
        <KpiCard label="Leads parados" value={fmtNum(conta('parados'))} sub={`sem contato há ${diasAlerta}+ dias`} />
        <KpiCard label="Clientes em risco" value={fmtNum(conta('risco'))} sub="sem contato recente" />
        <KpiCard label="Campanha" value={fmtNum(conta('campanha'))} sub="contas ainda não chamadas" />
      </KpiRow>

      <div className="flex flex-wrap items-center gap-3">
        {!restrito && (
          <label className="flex items-center gap-2 text-dense text-fg-muted">
            Tarefas de
            <select className="field-sm" value={quem} onChange={e => setQuem(e.target.value)} aria-label="Tarefas de">
              <option value="">toda a equipe</option>
              {responsaveis.map(r => <option key={r} value={r}>{r}{meuNome === r ? ' (eu)' : ''}</option>)}
            </select>
          </label>
        )}
        <p className="text-dense text-fg-subtle">{total === 0 ? 'Nada pendente.' : `${fmtNum(total)} ${total === 1 ? 'item' : 'itens'} na fila.`}</p>
        <Button variant="ghost" size="xs" onClick={atualizar} loading={atualizando} className="ml-auto"><RefreshCw className="h-3.5 w-3.5" aria-hidden />Atualizar</Button>
      </div>

      {erro && <p className="text-dense text-loss" role="alert">{erro}</p>}

      {total === 0 && <Empty>Tudo em dia{quem ? ` para ${quem}` : ''}: nenhum retorno vencido, nenhum lead parado e nenhum cliente em risco sem contato.</Empty>}

      {secoes.filter(s => s.itens.length > 0).map(s => (
        <Panel key={s.chave} title={`${s.titulo} · ${fmtNum(s.itens.length)}`} subtitle={s.descricao}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th className="col-p2">Quem</th>
                  <th>Por quê</th>
                  <th className="col-p2">Último contato</th>
                  <th className="col-p3">Retorno</th>
                  <th><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {s.itens.map(item => {
                  const wa = linkTelefone(item.telefone)
                  const abertoAqui = aberto?.chave === item.chave ? aberto.modo : null
                  return (
                    <FragmentoLinha key={item.chave}>
                      <tr className={cn(abertoAqui && 'bg-surface-2')}>
                        <td>
                          <Link href={linkDe(item)} className="link font-medium">{item.nome}</Link>
                          <span className="ml-2 text-micro text-fg-subtle">{item.tipo === 'lead' ? `lead · ${item.status}` : `${labelCorretora(item.corretora)} · ${item.status}`}</span>
                        </td>
                        <td className="muted col-p2">{item.quem ?? TRACO}</td>
                        <td className={cn(item.motivo === 'atrasado' && 'text-warn')}>{item.detalhe}</td>
                        <td className="num col-p2">{dataCurta(item.ultimo_contato)}</td>
                        <td className="num col-p3">{dataCurta(item.proximo_contato)}</td>
                        <td className="whitespace-nowrap text-right">
                          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="icon-btn inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-3 hover:text-fg" title={`WhatsApp ${item.telefone}`} aria-label={`WhatsApp de ${item.nome}`}><MessageCircle className="h-3.5 w-3.5" aria-hidden /></a>}
                          <Button variant="ghost" size="xs" onClick={() => abrir(item, 'contato')} aria-expanded={abertoAqui === 'contato'}><PhoneCall className="h-3.5 w-3.5" aria-hidden />Contato</Button>
                          {!semS59 && <IconButton onClick={() => abrir(item, 'agendar')} title="Marcar retorno" aria-label={`Marcar retorno de ${item.nome}`} className="h-7 w-7"><CalendarClock className="h-3.5 w-3.5" aria-hidden /></IconButton>}
                        </td>
                      </tr>
                      {abertoAqui === 'contato' && (
                        <tr className="bg-surface-2">
                          <td colSpan={6} className="!py-3">
                            <div className="flex flex-wrap items-end gap-2">
                              <div className="w-40"><Input label="Data" type="date" value={form.data} max={hoje} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} /></div>
                              <div className="min-w-[220px] flex-1">
                                <Input label="Nota" value={form.nota} placeholder="Ligou, mandou WhatsApp, pediu retorno…" onChange={e => setForm(f => ({ ...f, nota: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void registrar(item) } }} />
                              </div>
                              {!semS59 && <div className="w-40"><Input label="Próximo contato" type="date" value={form.proximo} min={somarDias(form.data || hoje, 1)} onChange={e => setForm(f => ({ ...f, proximo: e.target.value }))} /></div>}
                              <Button variant="secondary" size="sm" onClick={() => registrar(item)} loading={salvando}><PhoneCall className="h-4 w-4" aria-hidden />Registrar</Button>
                              <Button variant="ghost" size="sm" onClick={() => setAberto(null)}>Cancelar</Button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {abertoAqui === 'agendar' && (
                        <tr className="bg-surface-2">
                          <td colSpan={6} className="!py-3">
                            <div className="flex flex-wrap items-end gap-2">
                              <div className="w-40"><Input label="Retorno em" type="date" value={form.proximo} min={hoje} onChange={e => setForm(f => ({ ...f, proximo: e.target.value }))} /></div>
                              <Button variant="secondary" size="sm" onClick={() => agendar(item, form.proximo || null)} loading={salvando} disabled={!form.proximo}><CalendarClock className="h-4 w-4" aria-hidden />Marcar</Button>
                              {item.proximo_contato && <Button variant="ghost" size="sm" onClick={() => agendar(item, null)} loading={salvando}>Desmarcar</Button>}
                              <Button variant="ghost" size="sm" onClick={() => setAberto(null)}>Cancelar</Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </FragmentoLinha>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
    </>
  )
}

// Só agrupa as linhas de um item (a principal e a do formulário) com uma chave
function FragmentoLinha({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
