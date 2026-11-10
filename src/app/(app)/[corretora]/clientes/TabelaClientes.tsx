'use client'

// A lista de clientes de uma corretora. Em cima, a situação em um toque (com a contagem de cada uma),
// a busca e os dois atalhos de atenção (em risco, com alertas); os outros filtros ficam recolhidos em
// "Filtros" e viram etiquetas quando estão ligados (filtro ligado nunca fica escondido). As colunas vêm
// em visões (Giro, Atendimento, Cadastro, Todas) para a tabela caber na tela; a escolha fica guardada.
import Link from 'next/link'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Download, Pencil, Search, SlidersHorizontal, X } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { ExcluirClienteButton } from './ExcluirClienteButton'
import { AtribuirCampanha } from './AtribuirCampanha'
import type { Corretora } from '@/lib/corretoras'
import { NivelMarca, RiscoTexto, SituacaoBadge, TRACO, dataCurta, n0, n2, r0 } from '@/components/gestao/Celulas'
import { CAMPOS_CLIENTE_LINHA, GRUPOS_CORRETAGEM, NIVEIS, RISCOS, type ClienteLinha } from '@/lib/gestao/tipos'
import {
  COLUNAS_DA_VISAO, COOKIE_VISAO_CLIENTES, SEM_FILTRO_CLIENTES, SITUACAO_PLURAL, SITUACOES_CLIENTE, STATUS_CLIENTE, VISAO_ROTULO, VISOES_CLIENTES,
  chaveAlerta, etiquetasDosFiltros, passaFiltros, telefoneCurto, visaoClientes,
  type ColunaCliente, type ColunaDaVisao, type FiltrosClientes, type VisaoClientes,
} from '@/lib/gestao/listaClientes'
import { linkTelefone } from '@/lib/gestao/fila'
import { expandir, type Compacto } from '@/lib/compacto'
import { mesCurto, type MesRef } from '@/lib/gestao/meses'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { casaBusca, indexarBusca, lerBusca } from '@/lib/busca'
import { CHAVES_FILTRO_CLIENTES, comEscolhido, cookieFiltrosClientes, lerCookie, limiteDe, opcaoValida, type ValoresFiltro } from '@/lib/filtrosLista'
import { filtrosNoNavegador, lembrarAberto, useFiltrosNaUrl, useRolarAteAberto } from '@/lib/useFiltrosNaUrl'

type Ordem = { col: keyof ClienteLinha; dir: 'asc' | 'desc' }
// Padrões dos filtros (o que não vai para o endereço nem para o cookie da lista)
const PADROES_FILTRO = { ...SEM_FILTRO_CLIENTES, ordem: 'lotes_12m:desc', n: '100' }
// "lotes_12m:desc" → ordem; inválida → padrão
function lerOrdem(v: string | null | undefined): Ordem {
  const [col, dir] = String(v ?? '').split(':')
  if ((CAMPOS_CLIENTE_LINHA as readonly string[]).includes(col) && (dir === 'asc' || dir === 'desc')) return { col: col as keyof ClienteLinha, dir }
  return { col: 'lotes_12m', dir: 'desc' }
}

// Filtros a partir dos valores guardados: opção de lista fixa que não existe vira vazio (filtro escondido não)
function filtrosDe(v: ValoresFiltro): FiltrosClientes {
  return {
    busca: v.busca ?? '', status: opcaoValida(v.status, STATUS_CLIENTE), situacao: opcaoValida(v.situacao, SITUACOES_CLIENTE),
    responsavel: v.responsavel ?? '', ativacao: v.ativacao ?? '', contato: opcaoValida(v.contato, ['sim', 'nao']), assessor: v.assessor ?? '', alerta: v.alerta ?? '',
    grupo: opcaoValida(v.grupo, [...GRUPOS_CORRETAGEM, 'vazio']), risco: opcaoValida(v.risco, ['qualquer', ...RISCOS]),
    nivel: opcaoValida(v.nivel, [...NIVEIS, 'vazio']),
  }
}

// A visão de colunas guardada no navegador (no servidor quem lê o cookie é a página)
function visaoNoNavegador(): VisaoClientes | null {
  if (typeof document === 'undefined') return null
  try {
    const v = lerCookie(document.cookie, COOKIE_VISAO_CLIENTES)
    return v ? visaoClientes(v) : null
  } catch {
    return null
  }
}

// Guarda a escolha por um ano
function guardarVisao(v: VisaoClientes) {
  try { document.cookie = `${COOKIE_VISAO_CLIENTES}=${v}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax` } catch { /* sem cookie: vale só nesta visita */ }
}

// ── Colunas ────────────────────────────────────────────────────────────────
type Ctx = { base: string; mesParam?: string | null; nomeCookie: string; mesRef: MesRef }
type Coluna = {
  campo?: keyof ClienteLinha     // ordena por este campo ao clicar no cabeçalho
  titulo: (x: Ctx) => ReactNode
  num?: boolean                  // cabeçalho à direita, como a célula
  dica?: string
  td: (c: ClienteLinha, cls: string | undefined, x: Ctx) => ReactNode
}

const COLUNAS: Record<ColunaCliente, Coluna> = {
  nome: {
    campo: 'nome', titulo: () => 'Cliente',
    td: (c, cls, x) => (
      <td className={cn('col-nome max-w-[240px] truncate', cls)}>
        <Link href={`${x.base}/clientes/${c.cliente_id}${x.mesParam ? `?mes=${x.mesParam}` : ''}`} onClick={() => lembrarAberto(x.nomeCookie, c.cliente_id)} className={cn('link', c.nivel === 'Alto' && 'font-semibold')}>{c.nome}</Link>
      </td>
    ),
  },
  nivel: {
    campo: 'lotes_media_3m', titulo: () => 'Nível', dica: 'Nível pela média de lotes/mês dos 3 meses anteriores',
    td: (c, cls) => <td className={cls}><NivelMarca nivel={c.nivel} media={c.lotes_media_3m} mostrarMedia /></td>,
  },
  documento: { campo: 'documento', titulo: () => 'CPF/CNPJ', num: true, td: (c, cls) => <td className={cn('num muted', cls)}>{c.documento ?? TRACO}</td> },
  conta: { campo: 'conta_principal', titulo: () => 'Conta', num: true, td: (c, cls) => <td className={cn('num', cls)}>{c.conta_principal ?? TRACO}</td> },
  contas: { campo: 'n_contas', titulo: () => 'Contas', num: true, td: (c, cls) => <td className={cn('num', cls, c.n_contas <= 1 && 'subtle')}>{c.n_contas}</td> },
  status: { campo: 'status', titulo: () => 'Status', td: (c, cls) => <td className={cn(cls, c.status === 'Recusou' ? 'text-loss' : c.status !== 'Migrado' && 'muted')}>{c.status}</td> },
  situacao: { campo: 'situacao', titulo: () => 'Situação', td: (c, cls) => <td className={cls}><SituacaoBadge situacao={c.situacao} mesesSemGiro={c.meses_sem_giro} /></td> },
  risco: { campo: 'risco', titulo: () => 'Risco', td: (c, cls) => <td className={cls}><RiscoTexto risco={c.risco} diasSemGiro={c.dias_sem_giro} /></td> },
  assessor: { campo: 'assessor_nome', titulo: () => 'Assessor', td: (c, cls) => <td className={cn('max-w-[180px] truncate muted', cls)}>{c.assessor_nome ?? TRACO}</td> },
  responsavel: { campo: 'responsavel', titulo: () => 'Resp.', dica: 'Responsável pelo cliente', td: (c, cls) => <td className={cn('muted', cls)}>{c.responsavel ?? TRACO}</td> },
  ativador: {
    campo: 'ativador', titulo: () => 'Ativação', dica: 'Atendente da campanha de ativação (não é o responsável)',
    td: (c, cls) => <td className={cn('whitespace-nowrap', cls, c.ativador ? 'font-medium' : 'subtle')} title={c.ativador ? `Na campanha de ativação com ${c.ativador}` : undefined}>{c.ativador ?? TRACO}</td>,
  },
  contato: {
    campo: 'ultimo_contato', titulo: () => 'Contato', num: true, dica: 'Último contato registrado na ficha · quantos já foram',
    td: (c, cls) => (
      <td className={cn('num whitespace-nowrap', cls, !c.contatos && 'subtle')}
        title={c.contatos ? `${fmtNum(c.contatos)} ${c.contatos === 1 ? 'contato registrado' : 'contatos registrados'} · último em ${dataCurta(c.ultimo_contato)}` : 'Nenhum contato registrado'}>
        {c.contatos ? `${dataCurta(c.ultimo_contato)} · ${fmtNum(c.contatos)}` : TRACO}
      </td>
    ),
  },
  telefone: {
    campo: 'telefone', titulo: () => 'Telefone', num: true,
    td: (c, cls) => {
      const wa = linkTelefone(c.telefone)
      return (
        <td className={cn('num whitespace-nowrap', cls, !c.telefone && 'subtle')}>
          {wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className="link" title="Abrir a conversa no WhatsApp">{telefoneCurto(c.telefone)}</a> : (telefoneCurto(c.telefone) ?? TRACO)}
        </td>
      )
    },
  },
  tarifa: { campo: 'tarifa', titulo: () => 'Tarifa', num: true, td: (c, cls) => <td className={cn('num', cls)}>{n2(c.tarifa)}</td> },
  grupo: {
    campo: 'grupo_corretagem', titulo: () => 'Grupo corr.', dica: 'Situação no grupo de corretagem',
    td: (c, cls) => (
      <td className={cn('whitespace-nowrap', cls, c.grupo_corretagem === 'Vinculado' ? 'text-gain' : c.grupo_corretagem === 'Bloqueado' ? 'text-loss' : c.grupo_corretagem === 'Não vinculado' ? 'text-warn' : 'subtle')}
        title={c.grupo_corretagem === 'Bloqueado' ? 'Alteração do grupo bloqueada pelo banco: pedir o desbloqueio' : 'Situação no grupo de corretagem'}>
        {c.grupo_corretagem ?? TRACO}
      </td>
    ),
  },
  migracao: { campo: 'data_migracao', titulo: () => 'Migração', num: true, td: (c, cls) => <td className={cn('num', cls)}>{dataCurta(c.data_migracao)}</td> },
  entrada: { campo: 'data_entrada', titulo: () => 'Entrada', num: true, td: (c, cls) => <td className={cn('num', cls)}>{dataCurta(c.data_entrada)}</td> },
  parceiro: { campo: 'parceiro', titulo: () => 'Parceiro', td: (c, cls) => <td className={cn('muted', cls)}>{c.parceiro ?? TRACO}</td> },
  lotes_mes: { campo: 'lotes_mes', titulo: x => <>Lotes {mesCurto(x.mesRef)}</>, num: true, td: (c, cls) => <td className={cn('num', cls, !c.lotes_mes && 'subtle')}>{n0(c.lotes_mes)}</td> },
  receita_mes: { campo: 'receita_mes', titulo: x => <>Receita {mesCurto(x.mesRef)}</>, num: true, td: (c, cls) => <td className={cn('num', cls, !c.receita_mes && 'subtle')}>{r0(c.receita_mes)}</td> },
  lotes_12m: { campo: 'lotes_12m', titulo: () => 'Lotes 12 m', num: true, td: (c, cls) => <td className={cn('num font-medium', cls, !c.lotes_12m && 'subtle')}>{n0(c.lotes_12m)}</td> },
  receita_12m: { campo: 'receita_12m', titulo: () => 'Receita 12 m', num: true, td: (c, cls) => <td className={cn('num', cls, !c.receita_12m && 'subtle')}>{r0(c.receita_12m)}</td> },
  ultimo_giro: { campo: 'ultimo_giro', titulo: () => 'Último giro', num: true, td: (c, cls) => <td className={cn('num', cls)}>{dataCurta(c.ultimo_giro)}</td> },
  alertas: {
    titulo: () => 'Alertas',
    td: (c, cls) => (
      <td className={cls}>
        {c.alertas.length > 0
          ? <span className={cn('text-label', c.alertas.some(a => a === 'migrado sem giro' || a === 'migrado sem data') ? 'text-warn' : 'text-fg-muted')} title={c.alertas.join(' · ')}>{c.alertas.length} {c.alertas.length === 1 ? 'alerta' : 'alertas'}</span>
          : <span className="subtle">{TRACO}</span>}
      </td>
    ),
  },
}

// A contagem ao lado de uma opção
function Conta({ n }: { n: number }) {
  return <span className="font-normal tabular-nums text-fg-subtle">{fmtNum(n)}</span>
}

export function TabelaClientes({ clientes: compacto, base, mesRef, mesParam, filtrosSalvos, visaoInicial = 'giro', corretora, comAcoes = false, podeExcluir = false, atendentes = [] }: {
  clientes: Compacto<ClienteLinha>; base: string; mesRef: MesRef; mesParam?: string | null; filtrosSalvos: ValoresFiltro; corretora: Corretora
  visaoInicial?: VisaoClientes   // a visão de colunas que a pessoa escolheu da última vez (cookie lido pela página)
  comAcoes?: boolean; podeExcluir?: boolean
  atendentes?: string[]   // quem pode trabalhar contas na campanha de ativação (S52); com a lista vem a seleção em lote
}) {
  // a lista chega compacta (colunas + arrays) e vira objetos aqui
  const clientes = useMemo(() => expandir(compacto), [compacto])
  // filtros, ordenação e linhas à mostra guardados no endereço e no cookie da lista: voltar da ficha (seta,
  // menu ou voltar do navegador) reabre a lista como estava. No navegador valem o endereço real e o cookie
  // (no voltar, o Next reaproveita a página com as props antigas); no servidor, o que a página mandou.
  const nomeCookie = cookieFiltrosClientes(corretora)
  const [inicio] = useState(() => filtrosNoNavegador(nomeCookie, CHAVES_FILTRO_CLIENTES) ?? filtrosSalvos)
  const [f, setF] = useState<FiltrosClientes>(() => filtrosDe(inicio))
  const [ordem, setOrdem] = useState<Ordem>(() => lerOrdem(inicio.ordem))
  const [limite, setLimite] = useState(() => limiteDe(inicio.n))
  useFiltrosNaUrl(nomeCookie, { ...f, ordem: `${String(ordem.col)}:${ordem.dir}`, n: String(limite) }, PADROES_FILTRO)
  useRolarAteAberto(nomeCookie)
  // seleção em lote (campanha de ativação): ids marcados; sobrevive à troca de filtro, some depois de atribuir
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set())
  // visão de colunas: escolha da pessoa, guardada por um ano (não some com os filtros)
  const [visao, setVisao] = useState<VisaoClientes>(() => visaoNoNavegador() ?? visaoInicial)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  // opções tiradas dos dados, sem perder o valor guardado que não aparece mais (senão o filtro fica escondido)
  const responsaveis = useMemo(() => comEscolhido([...new Set(clientes.map(c => c.responsavel ?? ''))].filter(Boolean).sort(), f.responsavel), [clientes, f.responsavel])
  // atendentes da campanha: os cadastrados (para achar quem ainda não tem conta) mais os que já aparecem nas fichas
  const ativacoes = useMemo(() => comEscolhido([...new Set([...atendentes, ...clientes.map(c => c.ativador ?? '')])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR')), f.ativacao, ['sem']), [clientes, atendentes, f.ativacao])
  const assessores = useMemo(() => comEscolhido([...new Set(clientes.map(c => c.assessor_nome ?? ''))].filter(Boolean).sort(), f.assessor), [clientes, f.assessor])
  const alertas = useMemo(() => comEscolhido([...new Set(clientes.flatMap(c => c.alertas.map(chaveAlerta)))].sort(), f.alerta, ['qualquer']), [clientes, f.alerta])
  const porNivel = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of clientes) if (c.nivel) m.set(c.nivel, (m.get(c.nivel) ?? 0) + 1)
    return m
  }, [clientes])

  // índice de busca de cada cliente (nome, assessor, parceiro, e-mail, telefone, CPF/CNPJ e conta), montado uma vez
  const indice = useMemo(() => new Map(clientes.map(c => [c.cliente_id, indexarBusca({
    textos: [c.nome, c.assessor_nome, c.parceiro], telefones: [c.telefone], documentos: [c.documento], contas: [c.conta_principal], emails: [c.email],
  })])), [clientes])
  // a lista filtrada e as contagens das opções à mostra: cada contagem ignora só o próprio filtro
  // (quantos inativos há entre os clientes do responsável escolhido, por exemplo)
  const { filtrados, porSituacao, total, emRisco, comAlertas } = useMemo(() => {
    const termo = lerBusca(f.busca)
    const porSituacao = new Map<string, number>()
    let total = 0, emRisco = 0, comAlertas = 0
    const out: ClienteLinha[] = []
    for (const c of clientes) {
      if (termo) { const ix = indice.get(c.cliente_id); if (!ix || !casaBusca(termo, ix)) continue }
      if (passaFiltros(c, f, 'situacao')) { total++; porSituacao.set(c.situacao, (porSituacao.get(c.situacao) ?? 0) + 1) }
      if (c.risco && passaFiltros(c, f, 'risco')) emRisco++
      if (c.alertas.length > 0 && passaFiltros(c, f, 'alerta')) comAlertas++
      if (passaFiltros(c, f)) out.push(c)
    }
    const { col, dir } = ordem
    out.sort((a, b) => {
      const va = a[col], vb = b[col]
      let cmp = 0
      if (va == null && vb == null) cmp = 0
      else if (va == null) cmp = 1
      else if (vb == null) cmp = -1
      else if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb
      else cmp = String(va).localeCompare(String(vb), 'pt-BR')
      return dir === 'asc' ? cmp : -cmp
    })
    return { filtrados: out, porSituacao, total, emRisco, comAlertas }
  }, [clientes, f, ordem, indice])

  const visiveis = filtrados.slice(0, limite)
  const todosVisiveis = visiveis.length > 0 && visiveis.every(c => selecionados.has(c.cliente_id))
  const marcar = (ids: string[], on: boolean) => setSelecionados(s => { const n = new Set(s); for (const id of ids) { if (on) n.add(id); else n.delete(id) } return n })

  const ordenar = (col: keyof ClienteLinha) => setOrdem(o => (o.col === col ? { col, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: typeof clientes[0]?.[col] === 'number' ? 'desc' : 'asc' }))
  const x: Ctx = { base, mesParam, nomeCookie, mesRef }
  const colunasVisao = COLUNAS_DA_VISAO[visao]
  // Cabeçalho de uma coluna, ordenável quando ela tem campo (função, não componente: evita remontar a cada render)
  const cabecalho = ([id, prio]: ColunaDaVisao) => {
    const col = COLUNAS[id]
    const cls = cn(col.num && 'num', prio && `col-${prio}`, id === 'nome' && 'col-nome')
    const campo = col.campo
    if (!campo) return <th key={id} className={cls} title={col.dica}>{col.titulo(x)}</th>
    const ativa = ordem.col === campo
    return (
      <th key={id} className={cn(cls, 'cursor-pointer select-none hover:text-fg')} title={col.dica} onClick={() => ordenar(campo)} aria-sort={ativa ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
        <span className="inline-flex items-center gap-1">{col.titulo(x)}{ativa && (ordem.dir === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}</span>
      </th>
    )
  }
  const escolherVisao = (v: VisaoClientes) => { setVisao(v); guardarVisao(v) }

  const exportar = () => {
    const cab = ['Cliente', 'Nível', 'Média de lotes 3 m', 'CPF/CNPJ', 'Conta principal', 'Contas', 'Status', 'Situação', 'Risco', 'Assessor', 'Responsável', 'Ativação', 'Último contato', 'Contatos', 'Tarifa', 'Grupo de corretagem', 'Migração', 'Entrada', 'Parceiro', `Lotes ${mesCurto(mesRef)}`, `Receita ${mesCurto(mesRef)}`, 'Lotes 12m', 'Receita 12m', 'Receita total', 'Último giro', 'Dias sem giro', 'Telefone', 'E-mail', 'Alertas']
    const linhas = filtrados.map(c => [c.nome, c.nivel ?? '', Math.round(c.lotes_media_3m), c.documento ?? '', c.conta_principal ?? '', c.n_contas, c.status, c.situacao, c.risco ?? '', c.assessor_nome ?? '', c.responsavel ?? '', c.ativador ?? '', c.ultimo_contato ?? '', c.contatos, c.tarifa, c.grupo_corretagem ?? '', c.data_migracao ?? '', c.data_entrada ?? '', c.parceiro ?? '', c.lotes_mes, c.receita_mes, c.lotes_12m, c.receita_12m, c.receita_total, c.ultimo_giro ?? '', c.dias_sem_giro ?? '', c.telefone ?? '', c.email ?? '', c.alertas.join('; ')])
    const csv = [cab, ...linhas].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `clientes-${mesRef.slice(0, 7)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const sel = (k: keyof FiltrosClientes, v: string) => setF(a => ({ ...a, [k]: v }))
  const temFiltro = Object.values(f).some(Boolean)
  const etiquetas = etiquetasDosFiltros(f)
  const nColunas = colunasVisao.length + (comAcoes ? 2 : 0)

  return (
    <Panel
      title={filtrados.length === clientes.length ? `${fmtNum(clientes.length)} clientes` : `${fmtNum(filtrados.length)} de ${fmtNum(clientes.length)} clientes`}
      subtitle={comAcoes ? 'Clique no nome para abrir a ficha e no cabeçalho para ordenar. Marque as linhas para atribuir à campanha de ativação.' : 'Clique no nome para abrir a ficha e no cabeçalho para ordenar.'}
      action={<Button variant="secondary" size="sm" onClick={exportar}><Download className="h-4 w-4" aria-hidden />CSV</Button>}
    >
      <div className="mb-3 space-y-2">
        {/* a situação em um toque, com quantos clientes há em cada uma */}
        <div className="seg" role="group" aria-label="Situação">
          <button type="button" data-active={!f.situacao} onClick={() => sel('situacao', '')}>Todos<Conta n={total} /></button>
          {SITUACOES_CLIENTE.map(s => (
            <button key={s} type="button" data-active={f.situacao === s} onClick={() => sel('situacao', f.situacao === s ? '' : s)}>{SITUACAO_PLURAL[s]}<Conta n={porSituacao.get(s) ?? 0} /></button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative w-full sm:w-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <input className="field-sm w-full pl-8 sm:w-64" placeholder="Filtrar: nome, telefone, CPF, conta…" value={f.busca} onChange={e => sel('busca', e.target.value)} aria-label="Filtrar a lista" />
          </label>
          <button type="button" className="chip" data-active={f.risco === 'qualquer'} aria-pressed={f.risco === 'qualquer'} onClick={() => sel('risco', f.risco === 'qualquer' ? '' : 'qualquer')}
            title="Giravam e pararam, ou estão girando bem menos que nos 3 meses anteriores">Em risco<Conta n={emRisco} /></button>
          <button type="button" className="chip" data-active={f.alerta === 'qualquer'} aria-pressed={f.alerta === 'qualquer'} onClick={() => sel('alerta', f.alerta === 'qualquer' ? '' : 'qualquer')}
            title="Algo a completar no cadastro">Com alertas<Conta n={comAlertas} /></button>
          <button type="button" className="chip" data-active={filtrosAbertos} aria-expanded={filtrosAbertos} onClick={() => setFiltrosAbertos(a => !a)}>
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />Filtros{etiquetas.length > 0 && <Conta n={etiquetas.length} />}
          </button>
          {temFiltro && <button type="button" className="link text-label" onClick={() => setF(SEM_FILTRO_CLIENTES)}>limpar</button>}
          <div className="flex max-w-full items-center gap-2 sm:ml-auto">
            <span className="label">Colunas</span>
            <div className="seg" role="group" aria-label="Colunas da tabela">
              {VISOES_CLIENTES.map(v => <button key={v} type="button" data-active={visao === v} onClick={() => escolherVisao(v)}>{VISAO_ROTULO[v]}</button>)}
            </div>
          </div>
        </div>

        {filtrosAbertos && (
          <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
            <select className="field-sm min-w-0" value={f.status} onChange={e => sel('status', e.target.value)} aria-label="Status">
              <option value="">Status: todos</option>{STATUS_CLIENTE.map(s => <option key={s}>{s}</option>)}
            </select>
            <select className="field-sm min-w-0" value={f.responsavel} onChange={e => sel('responsavel', e.target.value)} aria-label="Responsável">
              <option value="">Responsável: todos</option>{responsaveis.map(s => <option key={s}>{s}</option>)}
            </select>
            <select className="field-sm min-w-0" value={f.ativacao} onChange={e => sel('ativacao', e.target.value)} aria-label="Ativação" title="Atendente da campanha de ativação (não é o responsável)">
              <option value="">Ativação: todos</option>
              {ativacoes.map(a => <option key={a} value={a}>{a}</option>)}
              <option value="sem">sem atendente</option>
            </select>
            <select className="field-sm min-w-0" value={f.contato} onChange={e => sel('contato', e.target.value)} aria-label="Contato" title="Contatos registrados na ficha do cliente (campanha de ativação)">
              <option value="">Contato: todos</option>
              <option value="sim">já chamados</option>
              <option value="nao">ainda não chamados</option>
            </select>
            <select className="field-sm min-w-0 md:max-w-[220px]" value={f.assessor} onChange={e => sel('assessor', e.target.value)} aria-label="Assessor">
              <option value="">Assessor: todos</option>{assessores.map(s => <option key={s}>{s}</option>)}
            </select>
            <select className="field-sm min-w-0" value={f.alerta} onChange={e => sel('alerta', e.target.value)} aria-label="Alertas">
              <option value="">Alertas: todos</option>
              <option value="qualquer">com algum alerta</option>
              {alertas.map(a => <option key={a} value={a}>{a === 'contas' ? 'mais de uma conta' : a}</option>)}
            </select>
            <select className="field-sm min-w-0" value={f.grupo} onChange={e => sel('grupo', e.target.value)} aria-label="Grupo de corretagem">
              <option value="">Grupo de corretagem: todos</option>
              {GRUPOS_CORRETAGEM.map(g => <option key={g} value={g}>{g}</option>)}
              <option value="vazio">não informado</option>
            </select>
            <select className="field-sm min-w-0" value={f.risco} onChange={e => sel('risco', e.target.value)} aria-label="Risco">
              <option value="">Risco: todos</option>
              <option value="qualquer">em risco</option>
              {RISCOS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select className="field-sm min-w-0" value={f.nivel} onChange={e => sel('nivel', e.target.value)} aria-label="Nível" title="Nível pela média de lotes/mês dos 3 meses anteriores">
              <option value="">Nível: todos</option>
              {NIVEIS.map(n => <option key={n} value={n}>{n} ({fmtNum(porNivel.get(n) ?? 0)})</option>)}
              <option value="vazio">sem giro nos 3 meses</option>
            </select>
          </div>
        )}
        {/* filtro recolhido e ligado aparece como etiqueta: um toque tira */}
        {!filtrosAbertos && etiquetas.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {etiquetas.map(e => (
              <button key={e.chave} type="button" className="chip" data-active="true" onClick={() => sel(e.chave, '')} title="Tirar este filtro">
                {e.texto}<X className="h-3 w-3" aria-hidden />
              </button>
            ))}
          </div>
        )}
      </div>

      {comAcoes && selecionados.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-surface-2 px-3 py-2 text-dense" role="status">
          <span className="font-semibold tabular-nums">{fmtNum(selecionados.size)} {selecionados.size === 1 ? 'selecionado' : 'selecionados'}</span>
          <AtribuirCampanha corretora={corretora} clienteIds={[...selecionados]} atendentes={atendentes} onFeito={() => setSelecionados(new Set())} />
          {filtrados.length > visiveis.length && !filtrados.every(c => selecionados.has(c.cliente_id)) && (
            <button type="button" className="link text-label" onClick={() => marcar(filtrados.map(c => c.cliente_id), true)}>selecionar todos os {fmtNum(filtrados.length)} filtrados</button>
          )}
          <button type="button" className="link text-label" onClick={() => setSelecionados(new Set())}>limpar seleção</button>
        </div>
      )}

      <div className="tbl-wrap max-h-[70vh]">
        <table className="tbl tbl-dense">
          <thead>
            <tr>
              {comAcoes && (
                <th className="col-p2 w-8">
                  <input type="checkbox" checked={todosVisiveis} disabled={visiveis.length === 0} onChange={e => marcar(visiveis.map(c => c.cliente_id), e.target.checked)}
                    aria-label={todosVisiveis ? 'Desmarcar as linhas à mostra' : 'Marcar as linhas à mostra'} title="Marcar as linhas à mostra para atribuir à campanha" />
                </th>
              )}
              {colunasVisao.map(cabecalho)}
              {comAcoes && <th className="w-20"><span className="sr-only">Ações</span></th>}
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={nColunas} className="py-10 text-center text-dense text-fg-subtle">Nenhum cliente com esses filtros.</td></tr>}
            {visiveis.map(c => (
              <tr key={c.cliente_id} data-linha={c.cliente_id} className={cn(selecionados.has(c.cliente_id) && 'bg-accent-soft')}>
                {comAcoes && (
                  <td className="col-p2">
                    <input type="checkbox" checked={selecionados.has(c.cliente_id)} onChange={e => marcar([c.cliente_id], e.target.checked)} aria-label={`Marcar ${c.nome}`} />
                  </td>
                )}
                {colunasVisao.map(([id, prio]) => <Fragment key={id}>{COLUNAS[id].td(c, prio && `col-${prio}`, x)}</Fragment>)}
                {comAcoes && (
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`${base}/clientes/${c.cliente_id}?editar=1`} className="icon-btn inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-3 hover:text-fg" title="Editar cliente" aria-label={`Editar ${c.nome}`}>
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Link>
                      {podeExcluir && <ExcluirClienteButton corretora={corretora} clienteId={c.cliente_id} nome={c.nome} base={base} />}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtrados.length > visiveis.length && (
        <div className="py-2 text-center">
          <button type="button" className="link text-label" onClick={() => setLimite(n => n + 200)}>
            mostrar mais ({n0(filtrados.length - visiveis.length)} restantes)
          </button>
        </div>
      )}
    </Panel>
  )
}
