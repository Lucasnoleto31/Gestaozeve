'use client'

// A fila do dia: o que fazer hoje, em ordem de prioridade (retornos combinados, leads novos sem contato,
// clientes em risco, leads parados, contas da campanha). Cada tarefa é uma linha com quem é, o motivo em
// uma frase e os botões da ação: WhatsApp, registrar o contato (com o próximo combinado) ou só agendar
// o retorno. Quem registra sai da fila na hora; o servidor recarrega em seguida.
// Redesenho de nov/26: no lugar dos 5 cartões, a frase "N tarefas para hoje, M já feitas"; as colunas
// Quem, Último contato e Retorno viraram parte da frase de cada linha.
import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, MessageCircle, PhoneCall, RefreshCw } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Empty } from '@/components/ui/Skeleton'
import { Dica } from '@/components/ui/Dica'
import { useToast } from '@/components/ui/Toast'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Resumo } from '@/components/gestao/Resumo'
import { dataCurta } from '@/components/gestao/Celulas'
import { feitasHoje, fraseDaFila, linkTelefone, montarFila, totalDaFila, type ItemFila, type SecaoFila } from '@/lib/gestao/fila'
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
const PASSO = 30

export function MinhaFila({ leads, clientes, restrito, usuario, responsaveis, diasAlerta, hoje, semS59, contatosHoje }: DadosFila) {
  const router = useRouter()
  const { avisar } = useToast()
  const meuNome = responsaveis.find(r => mesmaPessoa(r, usuario)) ?? null
  const [quem, setQuem] = useState<string>(restrito ? '' : (meuNome ?? ''))
  // o que foi feito aqui some da fila na hora; quando o servidor manda dados novos (base muda), volta a valer só o servidor
  const [feitosDe, setFeitosDe] = useState<{ base: unknown; chaves: Set<string>; contatos: number }>({ base: leads, chaves: new Set(), contatos: 0 })
  const feitos = useMemo(() => (feitosDe.base === leads ? feitosDe.chaves : new Set<string>()), [feitosDe, leads])
  const contatosAqui = feitosDe.base === leads ? feitosDe.contatos : 0
  const [atualizandoDesde, setAtualizandoDesde] = useState<unknown>(null)
  const atualizando = atualizandoDesde === leads
  const [aberto, setAberto] = useState<Aberto | null>(null)
  const [form, setForm] = useState({ data: hoje, nota: '', proximo: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // quantas linhas cada seção mostra (a de leads novos passa de mil em "toda a equipe")
  const [limites, setLimites] = useState<Record<string, number>>({})
  const limiteDe = (chave: string) => limites[chave] ?? PASSO

  const secoes = useMemo<SecaoFila[]>(
    () => montarFila(leads, clientes, { hoje, diasAlerta, quem: quem || null }).map(s => ({ ...s, itens: s.itens.filter(i => !feitos.has(i.chave)) })),
    [leads, clientes, hoje, diasAlerta, quem, feitos],
  )
  const comItens = secoes.filter(s => s.itens.length > 0)
  const total = totalDaFila(secoes)
  // já feitas hoje: contatos registrados com a data de hoje (os do servidor mais os que acabaram de sair daqui)
  const feitas = feitasHoje(contatosHoje, restrito ? null : quem || null) + contatosAqui
  const souEu = restrito || (!!quem && quem === meuNome)

  const abrir = (item: ItemFila, modo: Aberto['modo']) => {
    setErro(null)
    if (aberto?.chave === item.chave && aberto.modo === modo) { setAberto(null); return }
    setForm({ data: hoje, nota: '', proximo: modo === 'agendar' ? (item.proximo_contato ?? somarDias(hoje, 1)) : '' })
    setAberto({ chave: item.chave, modo })
  }
  const concluir = (item: ItemFila, comContato: boolean) => {
    setFeitosDe({ base: leads, chaves: new Set(feitos).add(item.chave), contatos: contatosAqui + (comContato ? 1 : 0) })
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
    concluir(item, form.data === hoje)
  }
  const agendar = async (item: ItemFila, data: string | null) => {
    setSalvando(true); setErro(null)
    const r = await agendarContato(alvoDe(item), data)
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: data ? `Retorno marcado para ${dataCurta(data)}` : 'Retorno desmarcado', detalhe: item.nome, tom: data ? 'gain' : 'neutral' })
    if (data === hoje) { setAberto(null); setAtualizandoDesde(leads); router.refresh() } else concluir(item, false)
  }
  const atualizar = () => { setAtualizandoDesde(leads); router.refresh() }

  return (
    <>
      {/* Celular: a frase vem sozinha e antes de tudo (sobe pela ordem, até acima de "Meus pontos"); a
          linha de apoio, que é instrução e não dado, desce para o fim da lista */}
      <div className="max-md:-order-1 max-md:[&_p+p]:hidden">
        <Resumo frase={fraseDaFila({ total, feitas, quem: quem || null, souEu })} apoio={total > 0 ? APOIO : null} />
      </div>

      {/* Celular: "Tarefas de" e o atualizar (só o ícone) numa linha; os atalhos dos grupos numa fileira
          que rola de lado, e só quando há mais de um grupo (com um só, repetem o título logo abaixo) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-2 max-md:gap-y-3">
        {!restrito && (
          <label className="flex items-center gap-2 text-dense text-fg-muted max-md:min-w-0 max-md:whitespace-nowrap">
            Tarefas de
            <select className="field-sm max-md:min-w-0 max-md:flex-1" value={quem} onChange={e => setQuem(e.target.value)} aria-label="Tarefas de">
              <option value="">toda a equipe</option>
              {responsaveis.map(r => <option key={r} value={r}>{r}{meuNome === r ? ' (eu)' : ''}</option>)}
            </select>
          </label>
        )}
        {/* atalhos para cada grupo, na ordem de prioridade; quem atende não tem "Tarefas de": a fileira fica ao lado do atualizar */}
        <div className={cn('trilho md:contents', restrito ? 'max-md:col-start-1 max-md:row-start-1 max-md:mr-0!' : 'max-md:col-span-2 max-md:row-start-2', comItens.length < 2 && 'max-md:hidden!')}>
          {comItens.map(s => <a key={s.chave} href={`#fila-${s.chave}`} className="chip">{s.titulo}<span className="ml-1.5 tabular-nums text-fg-subtle">{fmtNum(s.itens.length)}</span></a>)}
        </div>
        <Button variant="ghost" size="xs" onClick={atualizar} loading={atualizando}
          className="ml-auto max-md:col-start-2 max-md:row-start-1 max-md:h-11 max-md:w-11 max-md:border-line-strong max-md:px-0 max-md:text-fg">
          <RefreshCw className={cn('h-3.5 w-3.5 max-md:h-4 max-md:w-4', atualizando && 'max-md:hidden')} aria-hidden /><span className="max-md:sr-only">Atualizar</span>
        </Button>
      </div>

      {/* no celular o erro aparece dentro do formulário aberto, que pode estar três telas abaixo */}
      {erro && <p className="text-dense text-loss max-md:hidden" role="alert">{erro}</p>}

      {total === 0 && <Empty>Tudo em dia{quem ? ` para ${quem}` : ''}: nenhum retorno vencido, nenhum lead parado e nenhum cliente em risco sem contato.</Empty>}

      {/* só no celular: a linha de apoio da frase, que saiu do alto. Vai para o fim da lista pela ordem e não
          por ser o último bloco, para o último grupo continuar sendo o último bloco no computador (o espaço
          entre os blocos depende disso) */}
      {total > 0 && <p className="order-last mt-6 text-label text-fg-muted md:hidden">{APOIO}</p>}

      {comItens.map((s, ordem) => (
        // Celular: sem o "1 ·" (a ordem da tela já é a prioridade) e com a explicação do grupo atrás do "i"
        <Panel key={s.chave} className="scroll-mt-20"
          title={<span id={`fila-${s.chave}`} className="scroll-mt-20"><span className="mr-1.5 text-fg-subtle max-md:hidden">{ordem + 1} ·</span>{s.titulo}<span className="ml-2 text-dense font-normal tabular-nums text-fg-muted">{fmtNum(s.itens.length)}</span><Dica texto={s.descricao} className="ml-2 md:hidden" /></span>}
          subtitle={<span className="max-md:hidden">{s.descricao}</span>}>
          <ul className="border-t border-line">
            {s.itens.slice(0, limiteDe(s.chave)).map(item => {
              const wa = linkTelefone(item.telefone)
              const abertoAqui = aberto?.chave === item.chave ? aberto.modo : null
              const erroAqui = erro && <p className="col-span-2 text-dense text-loss max-md:order-1 md:hidden" role="alert">{erro}</p>
              return (
                <li key={item.chave} className={cn('border-b border-line', abertoAqui && 'bg-surface-2 max-md:-mx-4 max-md:px-4')}>
                  {/* Celular, três linhas: o nome (abre a ficha) com o WhatsApp ao lado; de onde é e o motivo; os dois
                      botões, meia largura cada. É a mesma marcação do computador, só muda a grade. */}
                  <div className="grid items-center gap-x-4 gap-y-1.5 px-1 py-2.5 max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-2 max-md:px-0 max-md:py-3.5 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_auto]">
                    <p className="min-w-0 md:truncate">
                      <Link href={linkDe(item)} className="link font-medium max-md:flex max-md:min-h-11 max-md:items-center">{item.nome}</Link>
                      <span className="ml-2 text-micro text-fg-subtle max-md:hidden">{item.tipo === 'lead' ? `lead · ${item.status}` : `cliente ${labelCorretora(item.corretora)}`}</span>
                    </p>
                    <p className={cn('min-w-0 text-dense max-md:col-span-2', item.motivo === 'atrasado' ? 'text-warn' : 'text-fg-muted')}>
                      {/* a etiqueta miúda ao lado do nome vira o começo do motivo */}
                      <span className="md:hidden">{item.tipo === 'lead' ? `Lead · ${item.status}` : labelCorretora(item.corretora)} · </span>
                      {comValor(primeiraMaiuscula(item.detalhe))}.{!quem && item.quem && <span className="text-fg-subtle"> Com {item.quem}.</span>}
                    </p>
                    <div className="flex flex-wrap items-center gap-1 max-md:contents md:flex-nowrap md:justify-end">
                      {wa
                        ? <a href={wa} target="_blank" rel="noopener noreferrer" title={`WhatsApp ${item.telefone}`} aria-label={`WhatsApp de ${item.nome}`}
                            className={buttonClasses('ghost', 'xs', 'max-md:col-start-2 max-md:row-start-1 max-md:h-11 max-md:gap-1.5 max-md:border-line-strong max-md:px-3 max-md:text-dense! max-md:text-fg')}>
                            <MessageCircle className="h-3.5 w-3.5 max-md:h-4 max-md:w-4" aria-hidden /><span>WhatsApp</span>
                          </a>
                        : <span className="col-start-2 row-start-1 text-label text-fg-muted md:hidden">sem telefone</span>}
                      <div className="max-md:col-span-2 max-md:grid max-md:grid-cols-2 max-md:gap-2 md:contents">
                        <Button variant="secondary" size="xs" className="max-md:h-11 max-md:text-dense!" onClick={() => abrir(item, 'contato')} aria-expanded={abertoAqui === 'contato'} aria-label={`Registrar contato com ${item.nome}`}><PhoneCall className="h-3.5 w-3.5" aria-hidden />Registrar contato</Button>
                        {!semS59 && <Button variant="ghost" size="xs" className="max-md:h-11 max-md:border-line max-md:text-dense! max-md:text-fg" onClick={() => abrir(item, 'agendar')} aria-expanded={abertoAqui === 'agendar'} aria-label={`Agendar retorno de ${item.nome}`}><CalendarClock className="h-3.5 w-3.5" aria-hidden />Agendar retorno</Button>}
                      </div>
                    </div>
                  </div>
                  {/* Celular: as duas datas lado a lado, a nota na largura toda e os botões embaixo, meia largura cada */}
                  {abertoAqui === 'contato' && (
                    <Formulario>
                      <div className="w-40 max-md:w-auto"><Input label="Data" type="date" value={form.data} max={hoje} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} /></div>
                      <div className="min-w-[220px] flex-1 max-md:order-1 max-md:col-span-2 max-md:min-w-0">
                        <Input label="Nota" value={form.nota} placeholder="Ligou, mandou WhatsApp, pediu retorno…" onChange={e => setForm(f => ({ ...f, nota: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void registrar(item) } }} />
                      </div>
                      {!semS59 && <div className="w-40 max-md:w-auto"><Input label="Próximo contato" type="date" value={form.proximo} min={somarDias(form.data || hoje, 1)} onChange={e => setForm(f => ({ ...f, proximo: e.target.value }))} /></div>}
                      <Button variant="secondary" size="sm" className="max-md:order-2 max-md:h-11" onClick={() => registrar(item)} loading={salvando}><PhoneCall className="h-4 w-4" aria-hidden />Registrar</Button>
                      <Button variant="ghost" size="sm" className="max-md:order-2 max-md:h-11 max-md:border-line" onClick={() => setAberto(null)}>Cancelar</Button>
                      {erroAqui}
                    </Formulario>
                  )}
                  {abertoAqui === 'agendar' && (
                    <Formulario>
                      <div className="w-40 max-md:w-auto"><Input label="Retorno em" type="date" value={form.proximo} min={hoje} onChange={e => setForm(f => ({ ...f, proximo: e.target.value }))} /></div>
                      <Button variant="secondary" size="sm" className="max-md:h-11" onClick={() => agendar(item, form.proximo || null)} loading={salvando} disabled={!form.proximo}><CalendarClock className="h-4 w-4" aria-hidden />Marcar</Button>
                      {item.proximo_contato && <Button variant="ghost" size="sm" className="max-md:h-11 max-md:border-line" onClick={() => agendar(item, null)} loading={salvando}>Desmarcar</Button>}
                      <Button variant="ghost" size="sm" className="max-md:h-11 max-md:border-line" onClick={() => setAberto(null)}>Cancelar</Button>
                      {erroAqui}
                    </Formulario>
                  )}
                </li>
              )
            })}
          </ul>
          {s.itens.length > limiteDe(s.chave) && (
            <div className="mt-3 text-center">
              <button type="button" className="link text-dense" onClick={() => setLimites(l => ({ ...l, [s.chave]: limiteDe(s.chave) + PASSO }))}>
                mostrar mais ({fmtNum(s.itens.length - limiteDe(s.chave))} restantes)
              </button>
            </div>
          )}
        </Panel>
      ))}
    </>
  )
}

const APOIO = 'Em ordem de prioridade: comece pelo alto da lista. O que você resolve sai da fila na hora.'

const primeiraMaiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// O valor que ordena o grupo ("rendia R$ 1.250 por mês") fica perdido no meio da frase: no celular ele
// sai em negrito. É um recorte do texto na tela; a frase de montarFila e o computador ficam como estão.
function comValor(frase: string): ReactNode {
  const m = /R\$\s[\d.]+/.exec(frase)
  if (!m) return frase
  return <>{frase.slice(0, m.index)}<span className="max-md:font-semibold max-md:text-fg">{m[0]}</span>{frase.slice(m.index + m[0].length)}</>
}

// O formulário que abre embaixo da linha (registrar contato ou agendar retorno)
function Formulario({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-2 px-1 pb-3 max-md:grid max-md:grid-cols-2 max-md:px-0 max-md:pb-4">{children}</div>
}
