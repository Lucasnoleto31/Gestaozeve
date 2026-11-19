'use client'

// Operações de um dia: cada linha do relatório com a corretagem em uso; o administrador ajusta a
// corretagem de uma operação.
// No celular (DESIGN.md §8) a tela abre pela frase (quem operou e se há corretagem fora do cadastro) e
// por dois números (receita e lotes); cada operação é um item: o cliente e a quantidade em cima, o ativo,
// a corretagem e a receita embaixo. O toque abre a operação: conta, assessor, modo e, para o administrador,
// o campo da corretagem. Com alteração por salvar, "Desfazer" e "Salvar" ficam presos acima da barra de
// baixo. O computador não muda.
import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import { Dica } from '@/components/ui/Dica'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { useToast } from '@/components/ui/Toast'
import { LinhaVazia, TRACO, n2, r0, rCurto } from '@/components/gestao/Celulas'
import { Resumo } from '@/components/gestao/Resumo'
import { salvarCorretagensDia } from '@/lib/gestao/acoes'
import { numeroBR } from '@/lib/gestao/planilhas'
import { somarDias } from '@/lib/gestao/meses'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Corretora } from '@/lib/corretoras'
import type { OperacaoDia } from '@/lib/gestao/tipos'
import { fraseDoDia } from '../frases'

// unidadeLonga: a mesma unidade por extenso, só no celular (lá a linha não tem a coluna para explicar "/op.")
const TIPO: Record<OperacaoDia['tipo'], { label: string; variant: BadgeVariant; unidade: string; unidadeLonga: string }> = {
  lote: { label: 'Lotes', variant: 'accent', unidade: '/lote', unidadeLonga: 'por lote' },
  acoes: { label: 'Ações', variant: 'warn', unidade: '/op.', unidadeLonga: 'por operação' },
  posicao: { label: 'Posição', variant: 'neutral', unidade: '/op.', unidadeLonga: 'por operação' },
  zeragem: { label: 'Zeragem', variant: 'loss', unidade: '/contr.', unidadeLonga: 'por contrato' },
}
// a unidade curta no computador e por extenso no celular
const Unidade = ({ t }: { t: (typeof TIPO)[OperacaoDia['tipo']] }) => <><span className="max-md:hidden">{t.unidade}</span><span className="md:hidden">{t.unidadeLonga}</span></>
const GLOSSARIO = 'Lotes = day trade em futuros (R$ por lote) · Ações = day trade em ações e cripto (R$ por operação) · Posição = carregada, só rende se tiver corretagem informada · Zeragem = R$ por contrato zerado.'

const EPS = 1e-9
const fmtEntrada = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false })
const igual = (a: number, b: number) => Math.abs(a - b) < EPS

// Celular: quantas operações aparecem antes do "mostrar todas", e a busca sem acento nem maiúscula
const A_VISTA = 30
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Navegação entre dias (cabeçalho da página)
export function DiaPicker({ base, dia }: { base: string; dia: string }) {
  const router = useRouter()
  const ir = (d: string) => { if (d) router.push(`${base}/lotes/${d}`) }
  return (
    <div className="flex items-center gap-1">
      <IconButton aria-label="Dia anterior" onClick={() => ir(somarDias(dia, -1))}><ChevronLeft className="h-4 w-4" aria-hidden /></IconButton>
      <input type="date" value={dia} onChange={e => ir(e.target.value)} className="h-9 w-[9.5rem]" aria-label="Dia" />
      <IconButton aria-label="Dia seguinte" onClick={() => ir(somarDias(dia, 1))}><ChevronRight className="h-4 w-4" aria-hidden /></IconButton>
    </div>
  )
}

export function OperacoesDia({ corretora, dia, linhas, admin }: {
  corretora: Corretora
  dia: string
  linhas: OperacaoDia[]
  admin: boolean
}) {
  const router = useRouter()
  const { avisar } = useToast()
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(linhas.map(o => [o.id, fmtEntrada(o.tarifa)])))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  // só do celular: a busca, o "mostrar todas" e a operação aberta (uma por vez)
  const [busca, setBusca] = useState('')
  const [todas, setTodas] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)

  const editavel = (o: OperacaoDia) => admin && o.tipo !== 'zeragem' && o.conta_para_receita
  const valorDe = (o: OperacaoDia) => {
    if (!editavel(o)) return o.tarifa
    const v = numeroBR(valores[o.id] ?? '')
    return Number.isFinite(v) && v >= 0 ? v : 0
  }
  const receitaDe = (o: OperacaoDia) => {
    if (!o.conta_para_receita) return 0
    if (o.tipo === 'zeragem') return o.qtd * o.zeragem_rs
    if (o.tipo === 'lote') return o.qtd * valorDe(o)
    return valorDe(o)
  }

  const alteradas = linhas.filter(o => editavel(o) && !igual(valorDe(o), o.tarifa))
  const contam = linhas.filter(o => o.conta_para_receita)
  const lotes = contam.filter(o => o.tipo === 'lote').reduce((s, o) => s + o.qtd, 0)
  const zerados = contam.filter(o => o.tipo === 'zeragem').reduce((s, o) => s + o.qtd, 0)
  const opAcoes = contam.filter(o => o.tipo === 'acoes').length
  const posicao = contam.filter(o => o.tipo === 'posicao').reduce((s, o) => s + o.qtd, 0)
  const receita = linhas.reduce((s, o) => s + receitaDe(o), 0)
  const clientes = new Set(contam.filter(o => o.tipo === 'lote' || o.tipo === 'acoes').map(o => o.cliente_id ?? o.cliente_nome)).size
  const manuais = linhas.filter(o => o.tarifa_manual != null).length

  const restaurar = (o: OperacaoDia) => setValores(v => ({ ...v, [o.id]: fmtEntrada(o.tarifa_padrao) }))
  const desfazer = () => { setValores(Object.fromEntries(linhas.map(o => [o.id, fmtEntrada(o.tarifa)]))); setErro(null) }

  const salvar = async () => {
    setSalvando(true); setErro(null)
    const itens = alteradas.map(o => {
      const v = valorDe(o)
      return { id: o.id, tarifa: igual(v, o.tarifa_padrao) ? null : v }
    })
    const r = await salvarCorretagensDia(corretora, dia, itens)
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: 'Corretagens salvas', detalhe: `${fmtNum(r.dados.alteradas)} operação(ões) ajustada(s) · lotes e receita recalculados.`, tom: 'gain' })
    router.refresh()
  }

  // a frase do celular usa os números dos cartões Operações, Clientes operando e Corretagens manuais
  const fr = fraseDoDia({ dia, clientes, operacoes: contam.length, emAcoes: opAcoes, foraDaReceita: linhas.length - contam.length, manuais })
  const filtro = semAcento(busca.trim())
  const casa = (o: OperacaoDia) => semAcento(`${o.cliente_nome} ${o.conta ?? ''} ${o.ativo ?? ''}`).includes(filtro)
  const nenhumaCasa = filtro !== '' && !linhas.some(casa)
  // celular: a conta só aparece com a operação aberta, salvo para quem operou em mais de uma conta no dia
  // (acontece no BTG): sem a conta à vista, as linhas dele ficariam iguais
  const contasDe = new Map<string, Set<string>>()
  for (const o of linhas) contasDe.set(o.cliente_nome, (contasDe.get(o.cliente_nome) ?? new Set<string>()).add(o.conta ?? ''))
  const comAlteracao = admin && alteradas.length > 0

  return (
    <>
      {linhas.length > 0 && (
        <div className="md:hidden">
          <Resumo frase={fr.frase} apoio={fr.apoio} />
        </div>
      )}

      {/* celular: dois números lado a lado (receita e lotes); operações, clientes e corretagens manuais estão
          na frase. Dia sem operações: só o aviso da lista, sem cartões zerados. */}
      <KpiRow cols={5} className={linhas.length === 0 ? 'max-md:hidden' : undefined}>
        <KpiCard label="Lotes no dia" value={fmtNum(lotes)} sub={`${fmtNum(zerados)} zerados${posicao ? ` · ${fmtNum(posicao)} em posição` : ''}`} />
        <KpiCard className="max-md:hidden!" label="Operações" value={fmtNum(contam.length)} sub={opAcoes ? `${fmtNum(opAcoes)} em ações e cripto` : `${fmtNum(linhas.length - contam.length) || 'nenhuma'} fora da receita`} />
        <KpiCard className="max-md:hidden!" label="Clientes operando" value={fmtNum(clientes)} sub="com lotes ou ações no dia" />
        {/* a base leva o destaque para o topo na largura toda; aqui ele divide a linha com "Lotes no dia" */}
        <KpiCard destaque className="max-md:col-auto!" label="Receita do dia" value={rCurto(receita)} sub={alteradas.length ? 'com as alterações ainda não salvas' : lotes ? `${n2(Math.round((receita / lotes) * 1000) / 1000)} R$/lote` : undefined} tone={alteradas.length ? 'warn' : 'neutral'} />
        <KpiCard className="max-md:hidden!" label="Corretagens manuais" value={fmtNum(manuais)} sub={manuais ? 'diferentes do cadastro' : 'tudo pelo cadastro'} />
      </KpiRow>

      <Panel
        // celular: com a barra de salvar presa no pé, a última operação não pode ficar atrás dela
        className={comAlteracao ? 'max-md:pb-16' : undefined}
        // celular: a explicação dos tipos (e de como ajustar) fica atrás do "i"
        title={<>Operações do dia <Dica className="md:hidden" texto={admin ? `${GLOSSARIO} Toque numa operação para ver a conta e ajustar a corretagem, quando o cliente foi cobrado diferente do cadastro.` : `${GLOSSARIO} Toque numa operação para ver a conta, o assessor e o modo.`} /></>}
        subtitle={<span className="max-md:hidden">{GLOSSARIO}</span>}
        action={comAlteracao ? (
          // celular: os mesmos botões, presos acima da barra de baixo, perto de qualquer operação alterada
          <div className="flex items-center gap-2 max-md:fixed max-md:inset-x-4 max-md:bottom-[calc(5.75rem+env(safe-area-inset-bottom))] max-md:z-30 max-md:flex-wrap max-md:justify-end max-md:rounded-lg max-md:border max-md:border-line max-md:bg-popover max-md:p-2 max-md:shadow-float">
            {erro && <p className="w-full px-1 text-label text-loss md:hidden">{erro}</p>}
            <Button variant="ghost" size="sm" onClick={desfazer} disabled={salvando}>Desfazer</Button>
            <Button size="sm" className="max-md:flex-1" onClick={salvar} loading={salvando}>Salvar {alteradas.length} {alteradas.length === 1 ? 'alteração' : 'alterações'}</Button>
          </div>
        ) : undefined}
      >
        {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
        {linhas.length > 8 && (
          <label className="relative mb-2 block md:hidden">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <input type="search" className="field-sm w-full pl-8" placeholder="Buscar cliente, conta ou ativo" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar nas operações do dia" />
          </label>
        )}
        <div className="tbl-wrap max-h-[70vh]">
          <table className="tbl tbl-dense tbl-lista" style={{ '--lista-direita': '5rem' } as CSSProperties}>
            <thead>
              <tr>
                <th>Cliente</th><th>Ativo</th><th>Tipo</th><th className="num">Qtd.</th><th className="num">Corretagem</th><th className="num">Receita</th><th className="col-p3">Modo</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && <LinhaVazia colunas={7}>Nenhuma operação lançada nesse dia.</LinhaVazia>}
              {linhas.map((o, i) => {
                const t = TIPO[o.tipo]
                const pode = editavel(o)
                const mudou = pode && !igual(valorDe(o), o.tarifa)
                const foraDoPadrao = pode && !igual(valorDe(o), o.tarifa_padrao)
                // celular: a operação abre no toque (uma por vez) e segue aberta enquanto a alteração não é salva
                const expandida = mudou || aberta === o.id
                // celular: aberta, a operação de quem pode ajustar troca a corretagem em texto pelo campo
                const comCampo = pode && expandida
                // celular: com busca, só o que casa; sem busca, as primeiras e as que têm alteração por salvar
                const some = filtro ? !casa(o) : !todas && i >= A_VISTA && !mudou
                const modo = `${o.modo ?? ''}${o.plataforma ? `${o.modo ? ' · ' : ''}${o.plataforma}` : ''}`
                const variasContas = (contasDe.get(o.cliente_nome)?.size ?? 0) > 1
                const ultimaPalavra = o.cliente_nome.trimEnd().lastIndexOf(' ') + 1
                return (
                  <tr key={o.id} className={cn(!o.conta_para_receita && 'opacity-60', mudou && 'bg-warn-soft/40', some && 'max-md:hidden!')}>
                    <td className="cel-titulo">
                      <div className="font-medium">
                        <span className="max-md:hidden">{o.cliente_nome}</span>
                        {/* celular: o nome é o botão que abre e fecha a operação; o toque vale na linha inteira
                            (o que é campo ou botão dentro dela continua por cima) */}
                        <button type="button" aria-expanded={expandida} onClick={() => setAberta(a => (a === o.id ? null : o.id))}
                          className="static! min-h-0! text-left font-medium after:absolute after:inset-0 after:content-[''] md:hidden">
                          {/* a seta vai presa à última palavra do nome: nunca cai sozinha na linha de baixo */}
                          {o.cliente_nome.slice(0, ultimaPalavra)}
                          <span className="whitespace-nowrap">{o.cliente_nome.slice(ultimaPalavra)}<ChevronDown className={cn('ml-1 inline h-3.5 w-3.5 text-fg-subtle transition-transform', expandida && 'rotate-180')} aria-hidden /></span>
                        </button>
                        {o.nao_cadastrado && <Badge variant="warn" className="ml-1.5">não cadastrado</Badge>}
                      </div>
                      {/* celular: conta e assessor aparecem com a operação aberta, junto do modo e da plataforma
                          (coluna que no computador só existe em tela larga) */}
                      <div className={cn('text-micro text-fg-subtle', !expandida && !variasContas && 'max-md:hidden')}>{o.conta ?? TRACO}{o.assessor_nome ? ` · ${o.assessor_nome}` : ''}{modo && expandida && <span className="md:hidden"> · {modo}</span>}</div>
                    </td>
                    <td className="num cel-sub">{o.ativo ?? TRACO}</td>
                    {/* celular: o tipo vai embaixo da quantidade; aqui sobra só o aviso "antes da migração" */}
                    <td className={cn('cel-sub', o.conta_para_receita && 'vazio')}>
                      <Badge variant={t.variant} className="max-md:hidden!">{t.label}</Badge>
                      {!o.conta_para_receita && <Badge variant="neutral" className="ml-1 max-md:ml-0">antes da migração</Badge>}
                    </td>
                    <td className="num cel-valor" data-rotulo={t.label.toLowerCase()}>{fmtNum(o.qtd)}</td>
                    <td className={cn('num', comCampo ? 'cel-bloco' : 'cel-sub')}>
                      {pode ? (
                        <>
                          {/* celular, operação fechada: a corretagem em texto; o campo aparece quando ela abre */}
                          {!comCampo && <span className="md:hidden">{valores[o.id] ?? fmtEntrada(o.tarifa)} <span className="text-micro text-fg-subtle">{t.unidadeLonga}</span></span>}
                          <div className={cn('flex items-center justify-end gap-1', comCampo ? 'max-md:flex-wrap max-md:justify-start' : 'max-md:hidden')}>
                            <input
                              inputMode="decimal"
                              value={valores[o.id] ?? ''}
                              onChange={e => setValores(v => ({ ...v, [o.id]: e.target.value }))}
                              className={cn('h-8 w-24 text-right', mudou && 'border-warn')}
                              aria-label={`Corretagem de ${o.cliente_nome} em ${o.ativo ?? 'ativo'}`}
                            />
                            <span className="w-10 text-left text-micro text-fg-subtle max-md:w-auto"><Unidade t={t} /></span>
                            <IconButton
                              aria-label={`Voltar ao cadastro (${fmtEntrada(o.tarifa_padrao)})`}
                              title={`Voltar ao cadastro: ${fmtEntrada(o.tarifa_padrao)}${t.unidade}`}
                              onClick={() => restaurar(o)}
                              disabled={!foraDoPadrao}
                              className="h-8 w-8 max-md:w-auto max-md:gap-1.5 max-md:px-2.5 max-md:text-label"
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                              {/* celular: o valor do cadastro, que no computador aparece ao passar o mouse */}
                              <span className="md:hidden">cadastro {fmtEntrada(o.tarifa_padrao)}</span>
                            </IconButton>
                          </div>
                        </>
                      ) : (
                        <span>{n2(o.tipo === 'zeragem' ? o.zeragem_rs : o.tarifa)} <span className="text-micro text-fg-subtle"><Unidade t={t} /></span></span>
                      )}
                      {o.tarifa_manual != null && !mudou && <div className="text-micro text-warn max-md:ml-1 max-md:inline">manual · cadastro {fmtEntrada(o.tarifa_padrao)}</div>}
                    </td>
                    {/* celular: com o campo aberto a receita vai para a linha de baixo dele, e muda enquanto se digita */}
                    <td className={cn('num', comCampo ? 'cel-bloco' : 'cel-sub', mudou && 'font-semibold')}>
                      {comCampo && <span className="font-normal text-fg-muted md:hidden">Receita: </span>}
                      {/* celular: sem o cabeçalho "Receita", o traço sozinho parece dado faltando; ali diz em palavras */}
                      {receitaDe(o) ? r0(receitaDe(o)) : <><span className="max-md:hidden">{TRACO}</span><span className="md:hidden">{comCampo ? 'R$ 0' : 'sem receita'}</span></>}
                    </td>
                    <td className="muted col-p3">{o.modo ?? TRACO}{o.plataforma ? ` · ${o.plataforma}` : ''}</td>
                  </tr>
                )
              })}
            </tbody>
            {linhas.length > 0 && (
              // celular: o total já está nos dois números do alto e o "a salvar", na barra de salvar
              <tfoot className="max-md:hidden!">
                <tr className="total">
                  <td colSpan={3}>{fmtNum(linhas.length)} operações</td>
                  <td className="num">{fmtNum(lotes)}</td>
                  <td className="num muted">{alteradas.length ? `${alteradas.length} a salvar` : TRACO}</td>
                  <td className="num">{r0(receita)}</td>
                  <td className="col-p3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {nenhumaCasa && <p className="py-6 text-center text-dense text-fg-subtle md:hidden">Nenhuma operação com “{busca.trim()}” nesse dia.</p>}
        {!filtro && !todas && linhas.length > A_VISTA && (
          <Button variant="secondary" className="mt-3 w-full md:hidden" onClick={() => setTodas(true)}>Mostrar todas as {fmtNum(linhas.length)} operações</Button>
        )}
        {!admin && <p className="mt-3 text-label text-fg-subtle">Só administradores alteram corretagens.</p>}
      </Panel>
    </>
  )
}
