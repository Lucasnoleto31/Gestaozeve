'use client'

// A lista de leads: quem eu preciso chamar agora e em que pé está cada lead.
// Redesenho de nov/26 (só a apresentação): a frase e os 4 cartões no topo, as etapas como abas com
// contagem (as que pedem contato primeiro), a tabela em 7 colunas com visões de colunas (Atendimento,
// Cadastro, Fechamento, como na tela Clientes) e os filtros menos usados atrás do botão "Filtros".
// A tela é usada por automações diárias. NÃO mudam: os filtros do endereço (busca, mes, status,
// responsavel, origem, corretora, alerta, clientes, n), o clique na linha abrindo a edição com o histórico,
// as três ações da linha (registrar contato hoje, marcar ganho, marcar perdido, com os mesmos rótulos) e
// os botões "Registrar contato" e "Salvar" do formulário (LeadForm e ContatosLead, que este arquivo não toca).
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneCall, Search, SlidersHorizontal, Trophy, XCircle } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button, IconButton } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { KpiCard } from '@/components/ui/Kpi'
import { Dica } from '@/components/ui/Dica'
import { useToast } from '@/components/ui/Toast'
import { Resumo } from '@/components/gestao/Resumo'
import { MotivoPerda } from '@/components/gestao/MotivoPerda'
import { StatusLeadBadge, TRACO, dataCurta, n0 } from '@/components/gestao/Celulas'
import { marcarLeadPerdido, registrarContatoLead } from '@/lib/gestao/acoes'
import { COOKIE_VISAO_LEADS, VISAO_LEADS_ROTULO, VISOES_LEADS, abasDeStatus, fraseDosLeads, resumoDosLeads, ultimoContatoTexto, visaoLeads, type VisaoLeads } from '@/lib/gestao/leadsTela'
import { variacaoMensal } from '@/lib/gestao/projecao'
import { mesCurto, somarMeses } from '@/lib/gestao/meses'
import type { AssessoresPorCorretora, LeadRow, StatusLead } from '@/lib/gestao/tipos'
import type { OpcoesOrigem } from '@/lib/gestao/origens'
import { CORRETORA_SLUG, isCorretora, type Corretora } from '@/lib/corretoras'
import { fmtNum, labelMesCurto } from '@/lib/format'
import { expandir, type Compacto } from '@/lib/compacto'
import { diaBrasil, mesBrasil } from '@/lib/periodo'
import { cn } from '@/lib/utils'
import { mesmaPessoa } from '@/lib/texto'
import { casaBusca, indexarBusca, lerBusca } from '@/lib/busca'
import { CHAVES_FILTRO_LEADS, COOKIE_FILTROS_LEADS, comEscolhido, lerCookie, limiteDe, opcaoValida, type ValoresFiltro } from '@/lib/filtrosLista'
import { filtrosNoNavegador, lembrarAberto, useFiltrosNaUrl, useRolarAteAberto } from '@/lib/useFiltrosNaUrl'
import { LeadForm } from './LeadForm'
import { GanhoWizard } from './GanhoWizard'

type Filtros = { busca: string; mes: string; status: string; responsavel: string; origem: string; corretora: string; alerta: boolean; clientes: string }
// Padrões dos filtros (o que não vai para o endereço nem para o cookie da lista)
const PADROES_FILTRO = { busca: '', mes: '', status: '', responsavel: '', origem: '', corretora: '', alerta: '', clientes: '', n: '100' }
const FILTROS_VAZIOS: Filtros = { busca: '', mes: '', status: '', responsavel: '', origem: '', corretora: '', alerta: false, clientes: '' }
// Filtros a partir dos valores guardados (mês como AAAA-MM; 'Base' só sim/não)
function filtrosDe(v: ValoresFiltro): Filtros {
  const mes = /^\d{4}-\d{2}/.test(v.mes ?? '') ? (v.mes as string).slice(0, 7) : ''
  return { busca: v.busca ?? '', mes, status: v.status ?? '', responsavel: v.responsavel ?? '', origem: v.origem ?? '', corretora: v.corretora ?? '', alerta: v.alerta === '1', clientes: opcaoValida(v.clientes, ['sim', 'nao']) }
}

// A visão de colunas guardada no navegador (no servidor quem lê o cookie é a página); a escolha vale um ano
function visaoNoNavegador(): VisaoLeads | null {
  if (typeof document === 'undefined') return null
  try { const v = lerCookie(document.cookie, COOKIE_VISAO_LEADS); return v ? visaoLeads(v) : null } catch { return null }
}
function guardarVisao(v: VisaoLeads) {
  try { document.cookie = `${COOKIE_VISAO_LEADS}=${v}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax` } catch { /* sem cookie: vale só nesta visita */ }
}

// Quem está atendendo o lead: chip leve com a inicial na tinta quando é outra pessoa (não
// chamar), inicial só no contorno quando é você, "livre" tracejado quando ninguém assumiu.
// Lead fechado mostra só o nome. (Chip todo na tinta ficou pesado com 46 leads de uma pessoa.)
function Atendimento({ responsavel, aberto, meu }: { responsavel: string | null; aberto: boolean; meu: boolean }) {
  if (!responsavel) return aberto ? <span className="inline-flex h-[22px] items-center rounded-sm border border-dashed border-line-strong px-2 text-micro font-medium text-fg-muted">livre</span> : <span className="text-fg-subtle">{TRACO}</span>
  if (!aberto) return <span className="muted">{responsavel}</span>
  return (
    <span
      className="inline-flex h-[22px] max-w-full items-center gap-1.5 whitespace-nowrap rounded-sm border border-line bg-surface pl-1 pr-2 text-micro text-fg"
      title={meu ? 'Você está atendendo este lead' : `${responsavel} está atendendo este lead: não chamar`}
    >
      <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold', meu ? 'border border-fg text-fg' : 'bg-fg text-bg')} aria-hidden>{responsavel.charAt(0).toUpperCase()}</span>
      <span className="font-semibold">{responsavel}</span>
      <span className="text-fg-muted">{meu ? 'você' : 'atende'}</span>
    </span>
  )
}

// Cartão do topo que filtra a lista (um toque liga, outro desliga); o ligado fica na tinta, como em Clientes
function CartaoFiltro({ rotulo, n, nota, ativo, alerta, onClick }: { rotulo: string; n: number; nota: string; ativo: boolean; alerta?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={ativo} onClick={onClick} aria-label={`${rotulo}: ${fmtNum(n)}, ${nota}. ${ativo ? 'Tirar o filtro' : 'Filtrar a lista'}`}
      className={cn('kpi min-w-0 cursor-pointer px-5 py-4 text-left transition-colors', ativo ? 'bg-fg' : 'hover:bg-surface-2')}>
      <span className={cn('label block', ativo && 'text-bg/70')}>{rotulo}</span>
      <span className={cn('mt-1.5 block truncate text-kpi font-bold tracking-tight tabular-nums', ativo ? 'text-bg' : alerta ? 'text-warn' : 'text-fg')}>{fmtNum(n)}</span>
      <span className={cn('mt-1.5 block text-micro', ativo ? 'text-bg/70' : 'text-fg-muted')}>{nota}</span>
    </button>
  )
}

export function TabelaLeads({ leads: compacto, responsaveis, responsaveisClientes, status, admin, filtrosSalvos, corretoras, assessores, hoje, usuario, diasAlerta, opcoesOrigem, restrito = false, visaoInicial = 'atendimento' }: {
  leads: Compacto<LeadRow>
  responsaveis: string[]           // quem trabalha leads
  responsaveisClientes: string[]   // quem cuida de clientes (ficha do lead ganho)
  status: StatusLead[]
  admin: boolean
  filtrosSalvos: ValoresFiltro    // filtros do endereço ou, sem eles, os últimos usados (cookie)
  corretoras: Corretora[]          // corretoras que o usuário vê (destino do lead ganho)
  assessores: AssessoresPorCorretora
  hoje: string
  usuario: string                  // nome de quem está logado (destaca "você" nos leads que atende)
  diasAlerta: number               // sem contato há mais que isso vira alerta (parâmetro dias_alerta_lead)
  opcoesOrigem: OpcoesOrigem       // parceiros e origens em uso: o campo Origem / parceiro das duas fichas
  restrito?: boolean               // atendente: a lista já vem só com os leads dele
  visaoInicial?: VisaoLeads        // a visão de colunas escolhida da última vez (cookie lido pela página)
}) {
  const router = useRouter()
  const ehMeu = (responsavel: string | null) => mesmaPessoa(responsavel, usuario)
  const { avisar } = useToast()
  // a lista chega compacta (colunas + arrays) e vira objetos aqui
  const leads = useMemo(() => expandir(compacto), [compacto])
  // filtros e linhas à mostra no endereço e no cookie da lista: voltar da ficha do cliente (voltar do
  // navegador ou menu) reabre a lista como estava. No navegador valem o endereço real e o cookie (no voltar,
  // o Next reaproveita a página com as props antigas); no servidor, o que a página mandou.
  const [inicio] = useState(() => filtrosNoNavegador(COOKIE_FILTROS_LEADS, CHAVES_FILTRO_LEADS) ?? filtrosSalvos)
  const [f, setF] = useState<Filtros>(() => filtrosDe(inicio))
  const [limite, setLimite] = useState(() => limiteDe(inicio.n))
  useFiltrosNaUrl(COOKIE_FILTROS_LEADS, { ...f, alerta: f.alerta ? '1' : '', n: String(limite) }, PADROES_FILTRO)
  useRolarAteAberto(COOKIE_FILTROS_LEADS)
  const [visao, setVisao] = useState<VisaoLeads>(() => visaoNoNavegador() ?? visaoInicial)
  // os filtros menos usados ficam recolhidos; quando um deles já vem ligado (endereço ou cookie), o bloco abre
  const [filtrosAbertos, setFiltrosAbertos] = useState(() => !!(inicio.mes || inicio.corretora || inicio.clientes))
  const [editando, setEditando] = useState<LeadRow | null>(null)
  const [registrando, setRegistrando] = useState<string | null>(null)
  const [ganhando, setGanhando] = useState<LeadRow | null>(null)
  const [perdendo, setPerdendo] = useState<LeadRow | null>(null)
  const [motivo, setMotivo] = useState('')
  const [fechando, setFechando] = useState(false)
  const [erroPerda, setErroPerda] = useState<string | null>(null)

  // os números do topo valem para a lista inteira, não para o que está filtrado
  const mes = `${hoje.slice(0, 7)}-01`
  const resumo = useMemo(() => resumoDosLeads(leads, mes), [leads, mes])
  const ganhosSemCliente = useMemo(() => leads.filter(l => l.status === 'Ganho' && !l.cliente_id), [leads])

  // opções tiradas dos dados, sem perder o valor guardado que não aparece mais (senão o filtro fica escondido)
  const origens = useMemo(() => comEscolhido([...new Set(leads.map(l => l.origem ?? ''))].filter(Boolean).sort(), f.origem), [leads, f.origem])
  const corretorasOpera = useMemo(() => comEscolhido([...new Set(leads.map(l => l.corretora ?? ''))].filter(Boolean).sort(), f.corretora), [leads, f.corretora])
  const respOpcoes = useMemo(() => comEscolhido([...new Set([...responsaveis, ...leads.map(l => l.responsavel ?? '')])].filter(Boolean).sort(), f.responsavel, ['__livre']), [leads, responsaveis, f.responsavel])
  const temFiltro = !!(f.busca || f.mes || f.status || f.responsavel || f.origem || f.corretora || f.alerta || f.clientes)
  const escondidosLigados = [f.mes, f.corretora, f.clientes, f.alerta].filter(Boolean).length
  // Mês de entrada de cada lead no fuso de Brasília (mesmo critério do funil)
  const mesPorLead = useMemo(() => new Map(leads.map(l => [l.id, mesBrasil(l.data_hora)])), [leads])
  const mesesOpcoes = useMemo(() => {
    const contagem = new Map<string, number>()
    for (const m of mesPorLead.values()) contagem.set(m, (contagem.get(m) ?? 0) + 1)
    if (f.mes && !contagem.has(f.mes)) contagem.set(f.mes, 0)   // mês vindo da URL sem leads continua selecionável
    return [...contagem.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [mesPorLead, f.mes])

  // índice de busca de cada lead (nome, e-mail, observações, nome do cliente ligado, telefone e CPF), montado uma vez
  const indice = useMemo(() => new Map(leads.map(l => [l.id, indexarBusca({
    textos: [l.nome, l.observacoes, l.cliente_nome], telefones: [l.whatsapp], documentos: [l.cpf], emails: [l.email],
  })])), [leads])
  // tudo menos a etapa: é a base das abas (a contagem de cada aba respeita os outros filtros)
  const semEtapa = useMemo(() => {
    const termo = lerBusca(f.busca)
    return leads.filter(l => {
      if (f.mes && mesPorLead.get(l.id) !== f.mes) return false
      if (f.responsavel === '__livre') { if (l.responsavel) return false }
      else if (f.responsavel && (l.responsavel ?? '') !== f.responsavel) return false
      if (f.origem && (l.origem ?? '') !== f.origem) return false
      if (f.corretora && (l.corretora ?? '') !== f.corretora) return false
      if (f.alerta && !l.alerta) return false
      if (f.clientes === 'sim' && !l.cliente_id) return false
      if (f.clientes === 'nao' && l.cliente_id) return false
      const ix = indice.get(l.id)
      if (termo && (!ix || !casaBusca(termo, ix))) return false
      return true
    })
  }, [leads, f.busca, f.mes, f.responsavel, f.origem, f.corretora, f.alerta, f.clientes, mesPorLead, indice])
  const filtrados = useMemo(() => (f.status ? semEtapa.filter(l => l.status === f.status) : semEtapa), [semEtapa, f.status])
  const abas = useMemo(() => abasDeStatus(status, semEtapa), [status, semEtapa])
  const visiveis = filtrados.slice(0, limite)
  const sel = (k: keyof Filtros, v: string | boolean) => setF(x => ({ ...x, [k]: v }))
  const escolherVisao = (v: VisaoLeads) => { setVisao(v); guardarVisao(v) }

  const contato = async (l: LeadRow) => {
    setRegistrando(l.id)
    const r = await registrarContatoLead(l.id, l.status === 'Novo' ? 'Em contato' : undefined)
    setRegistrando(null)
    if (!r.ok) { avisar({ titulo: 'Não consegui registrar o contato', detalhe: r.erro, tom: 'loss' }); return }
    const n = r.dados.contatos
    avisar({
      titulo: `Contato registrado · ${l.nome}`,
      detalhe: [n != null ? `${fmtNum(n)}º contato com este lead.` : null, l.status === 'Novo' ? 'Status passou para Em contato.' : null].filter(Boolean).join(' ') || undefined,
      tom: 'gain',
    })
    router.refresh()
  }
  const perder = async () => {
    if (!perdendo) return
    setFechando(true); setErroPerda(null)
    const r = await marcarLeadPerdido(perdendo.id, motivo)
    setFechando(false)
    if (!r.ok) { setErroPerda(r.erro); return }
    avisar({ titulo: `Lead perdido · ${perdendo.nome}`, detalhe: motivo.trim() || undefined, tom: 'neutral' })
    setPerdendo(null); setMotivo('')
    router.refresh()
  }
  const fichaHref = (l: LeadRow) => (l.cliente_id && l.cliente_corretora && isCorretora(l.cliente_corretora) ? `/${CORRETORA_SLUG[l.cliente_corretora]}/clientes/${l.cliente_id}` : null)
  const nColunas = 7

  return (
    <>
      <Resumo frase={fraseDosLeads(resumo, mes, { diasAlerta, meus: restrito })} />

      <div className="kpi-row panel grid grid-cols-2 md:grid-cols-4" role="group" aria-label="Resumo dos leads">
        <CartaoFiltro rotulo="Em aberto com alerta" n={resumo.comAlerta} nota={`de ${fmtNum(resumo.abertos)} em aberto · sem contato há mais de ${diasAlerta} dias`} ativo={f.alerta} alerta={resumo.comAlerta > 0} onClick={() => sel('alerta', !f.alerta)} />
        <CartaoFiltro rotulo="Novos sem contato" n={resumo.novosSemContato} nota="em aberto, sem nenhum contato registrado" ativo={f.status === 'Novo'} onClick={() => sel('status', f.status === 'Novo' ? '' : 'Novo')} />
        <KpiCard label={`Ganhos em ${mesCurto(mes)}`} value={fmtNum(resumo.ganhosMes)} delta={variacaoMensal(resumo.ganhosMes, resumo.ganhosMesAnterior || null, somarMeses(mes, -1), true, fmtNum)}
          dica="Leads fechados como Ganho com a data de fechamento neste mês. O mês ainda está em andamento: a comparação com o anterior fica sem cor." />
        <KpiCard label="Tempo até fechar" value={resumo.mediaFechar != null ? `${Math.round(resumo.mediaFechar)} dias` : TRACO} sub={resumo.mediaAberto != null ? `os em aberto estão há ${Math.round(resumo.mediaAberto)} dias, em média` : undefined}
          dica="Média de dias entre o lead entrar e ser fechado, contando ganhos e perdidos." />
      </div>

      {ganhosSemCliente.length > 0 && (
        <Alert tone="warn" title={`${fmtNum(ganhosSemCliente.length)} ${ganhosSemCliente.length === 1 ? 'lead marcado como Ganho sem cliente cadastrado' : 'leads marcados como Ganho sem cliente cadastrado'}`}>
          Use o troféu na linha para cadastrar o cliente e ligar ao lead; sem isso a conta não aparece em Clientes nem na comissão.
          {' '}{ganhosSemCliente.slice(0, 8).map(l => l.nome).join(', ')}{ganhosSemCliente.length > 8 ? '…' : ''}.
        </Alert>
      )}

      <Panel title={`${fmtNum(filtrados.length)} de ${fmtNum(leads.length)} leads`}
        subtitle={<span className="inline-flex items-center gap-1.5">Clique na linha para editar tudo e ver o histórico de contatos.<Dica texto="Ícones da linha: o telefone registra um contato hoje (Novo vira Em contato); o troféu abre a ficha de ganho, que cadastra o cliente e fecha o lead como Ganho; o X marca Perdido." /></span>}>
        {/* as etapas como abas: em aberto primeiro (são as que pedem contato); é o mesmo filtro ?status= do endereço */}
        <div className="mb-3 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Etapa do lead">
          {abas.map(a => {
            const ativa = f.status === a.status
            return (
              <button key={a.status} type="button" role="tab" aria-selected={ativa} onClick={() => sel('status', a.status)}
                title={a.comAlerta ? `${fmtNum(a.comAlerta)} com alerta de contato` : undefined}
                className={cn('inline-flex min-h-[44px] items-center whitespace-nowrap border-b-2 px-3 text-dense font-medium', ativa ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg')}>
                {a.status}<span className={cn('ml-1.5 text-micro font-normal tabular-nums', a.comAlerta ? 'text-warn' : 'text-fg-subtle')}>{fmtNum(a.leads)}</span>
              </button>
            )
          })}
          <button type="button" role="tab" aria-selected={!f.status} onClick={() => sel('status', '')}
            className={cn('inline-flex min-h-[44px] items-center whitespace-nowrap border-b-2 px-3 text-dense font-medium', !f.status ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg')}>
            Todos<span className="ml-1.5 text-micro font-normal tabular-nums text-fg-subtle">{fmtNum(semEtapa.length)}</span>
          </button>
        </div>

        <div className="mb-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative w-full sm:w-auto">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
              <input className="field-sm w-full pl-8 sm:w-56" placeholder="Nome, telefone, CPF, e-mail…" value={f.busca} onChange={e => sel('busca', e.target.value)} aria-label="Buscar" />
            </label>
            <select className="field-sm" value={f.responsavel} onChange={e => sel('responsavel', e.target.value)} aria-label="Responsável"><option value="">Responsável: todos</option><option value="__livre">livres (sem responsável)</option>{respOpcoes.map(r => <option key={r}>{r}</option>)}</select>
            <select className="field-sm" value={f.origem} onChange={e => sel('origem', e.target.value)} aria-label="Origem"><option value="">Origem: todas</option>{origens.map(o => <option key={o}>{o}</option>)}</select>
            <button type="button" className="chip" data-active={filtrosAbertos} aria-expanded={filtrosAbertos} onClick={() => setFiltrosAbertos(a => !a)} title="Mês de entrada, corretora onde opera, se já é cliente e só com alerta">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />Filtros{escondidosLigados > 0 && <span className="font-normal tabular-nums text-fg-subtle">{escondidosLigados}</span>}
            </button>
            {temFiltro && <button type="button" className="link text-label" onClick={() => setF(FILTROS_VAZIOS)}>limpar</button>}
            <div className="flex max-w-full items-center gap-2 sm:ml-auto">
              <span className="label">Colunas</span>
              <div className="seg" role="group" aria-label="Colunas da tabela">
                {VISOES_LEADS.map(v => <button key={v} type="button" data-active={visao === v} onClick={() => escolherVisao(v)}>{VISAO_LEADS_ROTULO[v]}</button>)}
              </div>
            </div>
          </div>
          {filtrosAbertos && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
              <select className="field-sm" value={f.mes} onChange={e => sel('mes', e.target.value)} aria-label="Mês de entrada"><option value="">Mês: todos</option>{mesesOpcoes.map(([m, n]) => <option key={m} value={m}>{labelMesCurto(m + '-01')} · {fmtNum(n)}</option>)}</select>
              <select className="field-sm" value={f.corretora} onChange={e => sel('corretora', e.target.value)} aria-label="Corretora onde opera"><option value="">Opera em: todas</option>{corretorasOpera.map(c => <option key={c}>{c}</option>)}</select>
              <select className="field-sm" value={f.clientes} onChange={e => sel('clientes', e.target.value)} aria-label="Já é cliente"><option value="">Base: todos</option><option value="sim">já são clientes</option><option value="nao">não são clientes</option></select>
              <label className="flex items-center gap-1.5 text-label text-fg-muted"><input type="checkbox" checked={f.alerta} onChange={e => sel('alerta', e.target.checked)} />só com alerta</label>
            </div>
          )}
        </div>

        <div className="tbl-wrap max-h-[70vh]">
          <table className="tbl tbl-dense">
            <thead>
              <tr>
                <th>Nome e WhatsApp</th>
                {visao === 'atendimento' && <><th className="col-p3">Origem</th><th className="col-p3">Opera em</th><th className="col-p2">Responsável</th><th className="col-p2">Status</th><th className="col-p2">Último contato</th></>}
                {visao === 'cadastro' && <><th className="col-p2">CPF</th><th className="col-p2">E-mail</th><th className="col-p3">Já opera?</th><th className="col-p3">Recebido em</th><th className="col-p2">Status</th></>}
                {visao === 'fechamento' && <><th className="col-p2">Status</th><th className="col-p2">Fechamento</th><th className="col-p2">Motivo da perda</th><th className="col-p2">Cliente?</th><th className="num col-p3">Contatos</th></>}
                <th><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 && <tr><td colSpan={nColunas} className="py-10 text-center text-dense text-fg-subtle">Nenhum lead com esses filtros.</td></tr>}
              {visiveis.map(l => {
                const href = fichaHref(l)
                const aberto = l.tipo_status === 'Aberto'
                const contatoTxt = ultimoContatoTexto(l.ultimo_contato, hoje)
                // lead em aberto que nunca foi chamado: há quanto tempo ele entrou (o dia de Brasília)
                const entrou = !l.ultimo_contato && aberto ? `entrou ${ultimoContatoTexto(diaBrasil(l.data_hora), hoje)}` : null
                const contatosTitulo = l.contatos ? `${fmtNum(l.contatos)} ${l.contatos === 1 ? 'contato registrado' : 'contatos registrados'}${l.ultimo_contato ? ` · último em ${dataCurta(l.ultimo_contato)}` : ''}` : 'Nenhum contato registrado'
                return (
                  <tr key={l.id} data-linha={l.id} className="cursor-pointer" onClick={() => setEditando(l)}>
                    <td className="max-w-[240px] md:max-w-[200px] xl:max-w-[280px]">
                      <span className="block truncate font-medium">{l.nome}</span>
                      <span className="block truncate text-micro tabular-nums text-fg-muted">{l.whatsapp ?? 'sem telefone'}</span>
                      {/* no celular as outras colunas somem: a etapa, quem atende e o último contato descem para baixo do nome */}
                      <span className={cn('mt-0.5 block truncate text-micro md:hidden', l.alerta ? 'text-warn' : 'text-fg-muted')}>
                        {l.status}{aberto && l.responsavel ? ` · ${ehMeu(l.responsavel) ? 'você atende' : `${l.responsavel} atende`}` : ''}{aberto ? ` · ${contatoTxt}${entrou ? `, ${entrou}` : ''}` : ''}
                      </span>
                    </td>
                    {visao === 'atendimento' && (
                      <>
                        <td className="muted col-p3">{l.origem ?? TRACO}</td>
                        <td className="muted col-p3">{l.corretora ?? TRACO}</td>
                        <td className="col-p2"><Atendimento responsavel={l.responsavel} aberto={aberto} meu={ehMeu(l.responsavel)} /></td>
                        <td className="col-p2"><StatusLeadBadge status={l.status} tipo={l.tipo_status} /></td>
                        <td className={cn('col-p2 whitespace-nowrap', l.alerta ? 'font-semibold text-warn' : aberto ? '' : 'muted')} title={l.alerta ? `Sem contato há mais de ${diasAlerta} dias · ${contatosTitulo}` : contatosTitulo}>
                          {contatoTxt}{entrou && <span className="block text-micro font-normal text-fg-muted">{entrou}</span>}
                        </td>
                      </>
                    )}
                    {visao === 'cadastro' && (
                      <>
                        <td className="num muted col-p2">{l.cpf ?? TRACO}</td>
                        <td className="max-w-[220px] truncate muted col-p2">{l.email ?? TRACO}</td>
                        <td className="max-w-[160px] truncate muted col-p3">{l.ja_opera ?? TRACO}</td>
                        <td className="num whitespace-nowrap col-p3">{new Date(l.data_hora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="col-p2"><StatusLeadBadge status={l.status} tipo={l.tipo_status} /></td>
                      </>
                    )}
                    {visao === 'fechamento' && (
                      <>
                        <td className="col-p2"><StatusLeadBadge status={l.status} tipo={l.tipo_status} /></td>
                        <td className="num col-p2" title={l.dias != null && !aberto ? `fechou em ${fmtNum(l.dias)} dias` : undefined}>{dataCurta(l.data_fechamento)}</td>
                        <td className="max-w-[220px] truncate muted col-p2">{l.motivo_perda ?? TRACO}</td>
                        <td className="col-p2" onClick={e => e.stopPropagation()}>
                          {l.cliente_id ? (
                            <span className="inline-flex items-center gap-1.5 text-label">
                              <span className={l.girou ? 'text-gain' : 'text-fg-muted'}>{l.cliente_status ?? 'cliente'}{l.girou ? ` · ${n0(l.lotes_12m)} lotes` : ''}</span>
                              {href && <Link href={href} onClick={() => lembrarAberto(COOKIE_FILTROS_LEADS, l.id)} className="link">ficha</Link>}
                            </span>
                          ) : <span className="text-fg-subtle">{TRACO}</span>}
                        </td>
                        <td className={cn('num col-p3', l.contatos > 0 && 'font-medium')} title={contatosTitulo}>{n0(l.contatos)}</td>
                      </>
                    )}
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        {aberto && (
                          <IconButton tone="success" aria-label={`Registrar contato hoje · ${l.nome}`} title="Registrar contato hoje" disabled={registrando === l.id} onClick={() => contato(l)}><PhoneCall className="h-4 w-4" aria-hidden /></IconButton>
                        )}
                        {(l.status !== 'Ganho' || !l.cliente_id) && (
                          <IconButton tone="accent" aria-label={`Marcar ${l.nome} como ganho`} title={l.status === 'Ganho' ? 'Ganho sem cliente: cadastrar o cliente' : 'Ganho: cadastrar como cliente'} onClick={() => setGanhando(l)}><Trophy className="h-4 w-4" aria-hidden /></IconButton>
                        )}
                        {aberto && (
                          <IconButton tone="danger" aria-label={`Marcar ${l.nome} como perdido`} title="Perdido" onClick={() => { setPerdendo(l); setMotivo(l.motivo_perda ?? ''); setErroPerda(null) }}><XCircle className="h-4 w-4" aria-hidden /></IconButton>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtrados.length > visiveis.length && (
          <div className="py-2 text-center">
            <button type="button" className="link text-label" onClick={() => setLimite(n => n + 200)}>mostrar mais ({fmtNum(filtrados.length - visiveis.length)} restantes)</button>
          </div>
        )}
        {editando && <LeadForm key={editando.id} lead={editando} aberto onClose={() => setEditando(null)} responsaveis={responsaveis} status={status} admin={admin} usuario={usuario} opcoesOrigem={opcoesOrigem}
          onGanhar={() => { const l = editando; setEditando(null); setGanhando(l) }} />}
        {ganhando && <GanhoWizard key={ganhando.id} lead={ganhando} aberto onClose={() => setGanhando(null)} corretoras={corretoras} responsaveis={responsaveisClientes} assessores={assessores} hoje={hoje} opcoesOrigem={opcoesOrigem} />}
        <Modal open={!!perdendo} onClose={() => setPerdendo(null)} title="Marcar como perdido" subtitle={perdendo?.nome}
          footer={<><Button variant="secondary" onClick={() => setPerdendo(null)}>Cancelar</Button><Button variant="danger" onClick={perder} loading={fechando}>Marcar perdido</Button></>}>
          {erroPerda && <Alert tone="danger" className="mb-3">{erroPerda}</Alert>}
          {perdendo && <MotivoPerda key={perdendo.id} valor={motivo} onChange={setMotivo} autoFocus hint="Fecha o lead hoje. Dá para reabrir editando o status na linha." />}
        </Modal>
      </Panel>
    </>
  )
}
