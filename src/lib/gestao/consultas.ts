// Leituras do controle (só servidor: páginas e server actions). Cada função chama uma
// RPC da S19 com o client service_role e devolve linhas tipadas.
import type { Corretora } from '@/lib/corretoras'
import { fmtDate, hojeBrasil, mesBrasil } from '@/lib/periodo'
import { mesAtual } from './meses'
import { diarioPelaLista, type ContatoLeve, type LeadLeve } from './contatos'
import { equipe, falha, linhas, num, str, type Admin } from './guard'
import { porAssessor, porResponsavel, resumoClientes, type GrupoClientes } from './derivados'
import { grupoCorretagem, nivel as nivelDe, nivelPelaMedia, risco as riscoDe } from './tipos'
import { casaBusca, contaCasa, digitosTelefone, indexarBusca, lerBusca, regexDoTexto } from '@/lib/busca'
import { normTexto } from '@/lib/texto'
import type { ClienteEncontrado } from './tipos'
import type {
  OperacaoDia, ClienteRiscoRow, GiroDiaRow,
  ComissaoContaMes, ComissaoItem, ComissaoMensalRow, ComissaoPagamento, ComissaoRegra, ExtratoParceiroRow,
  AssessorMensalRow, AssessorNaoCadastrado, AssessorParam, AssessorResumoRow, AssessoresPorCorretora, ClienteCadastro, ClienteContexto, ClienteMensalRow, ClienteMesRow,
  ClienteRow, Consolidado, ContaRow, DiarioRow, ExtratoRow, Faixa, FunilMensalRow, FunilPorRow, FunilResultadoRow, FunilSafraPorRow, FunilSafraRow, GrupoPainel, Importacao, IncentivoHistRow,
  IncentivoRow, LeadAcao, LeadContato, LeadDiaRow, LeadRow, LeadsResumo, LoteNaoCadastradoRow, MigracaoDiaRow, MixPlataformaRow, Multiplicador, PainelKpis, PainelMensalRow, PainelResumo,
  Parametro, Parceiro, PorAtivoRow, ReceitaMensalRow, Responsavel, SituacaoNaoMapeada, StatusContaMapa, StatusLead, TarifaCliente, TopClienteRow,
} from './tipos'

type Row = Record<string, unknown>
const bool = (v: unknown) => v === true
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])

// A API do Supabase devolve no máximo "Max rows" linhas por chamada (10.000 em Settings → API).
// Pedimos páginas desse tamanho e seguimos só quando a página veio cheia. Sem pedir a contagem
// total (count: 'exact'): ela fazia o banco executar a função duas vezes.
const PAGINA = 10000
async function rpc(db: Admin, fn: string, args: Record<string, unknown>): Promise<Row[]> {
  const out: Row[] = []
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await db.rpc(fn, args).range(offset, offset + PAGINA - 1)
    if (error) falha(error, fn)
    const rows = (data ?? []) as Row[]
    out.push(...rows)
    if (rows.length < PAGINA) break
  }
  return out
}

// Erro da API quando a função ainda não existe no banco (script SQL não aplicado)
export const funcaoAusente = (e: { code?: string; message: string } | null) =>
  !!e && (e.code === 'PGRST202' || /could not find the function/i.test(e.message))

// Leitura paginada de uma tabela/view (mesmo limite de 1.000 por chamada)
export async function todasAsLinhas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, contexto: string): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await consulta(offset, offset + PAGINA - 1)
    if (error) falha(error, contexto)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGINA) break
  }
  return out
}

export const mapCliente = (r: Row): ClienteRow => ({
  cliente_id: String(r.cliente_id), nome: String(r.nome ?? ''), documento: str(r.documento), telefone: str(r.telefone),
  email: str(r.email), uf: str(r.uf), perfil: str(r.perfil), tipo_pessoa: str(r.tipo_pessoa),
  n_contas: num(r.n_contas), conta_principal: str(r.conta_principal), status: (str(r.status) ?? 'Em processamento') as ClienteRow['status'],
  situacao_conta: str(r.situacao_conta), assessor_nome: str(r.assessor_nome), responsavel: str(r.responsavel), tarifa: num(r.tarifa),
  data_migracao: str(r.data_migracao), data_entrada: str(r.data_entrada),
  dias_ate_migrar: r.dias_ate_migrar == null ? null : num(r.dias_ate_migrar),
  lotes_total: num(r.lotes_total), lotes_mes: num(r.lotes_mes), zerados_mes: num(r.zerados_mes), receita_mes: num(r.receita_mes),
  receita_corretagem_mes: num(r.receita_corretagem_mes), receita_zeragem_mes: num(r.receita_zeragem_mes),
  lotes_12m: num(r.lotes_12m), receita_12m: num(r.receita_12m), ultimo_giro: str(r.ultimo_giro), ultimo_mes_giro: str(r.ultimo_mes_giro),
  meses_sem_giro: r.meses_sem_giro == null ? null : num(r.meses_sem_giro),
  situacao: (str(r.situacao) ?? 'Em processamento') as ClienteRow['situacao'], alertas: arr(r.alertas),
  parceiro: str(r.parceiro), observacoes: str(r.observacoes), motivo_recusa: str(r.motivo_recusa),
  grupo_corretagem: grupoCorretagem(r.grupo_corretagem),
  receita_total: num(r.receita_total), primeiro_mes_giro: str(r.primeiro_mes_giro), meses_ativos: num(r.meses_ativos),
  lotes_mes_anterior: num(r.lotes_mes_anterior), lotes_media_3m: num(r.lotes_media_3m),
  dias_sem_giro: r.dias_sem_giro == null ? null : num(r.dias_sem_giro), risco: riscoDe(r.risco), nivel: nivelDoBanco(r),
})

// ── Clientes ───────────────────────────────────────────────────────────────
export async function clientesLista(corretora: Corretora, mesRef: string | null): Promise<ClienteRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'clientes_lista', { p_corretora: corretora, p_mes_ref: mesRef }), mapCliente)
}

// Contas do cliente no mês de referência; antes da S37 a função não tem p_mes_ref
async function contasDoCliente(db: Admin, corretora: Corretora, clienteId: string, mesRef: string | null): Promise<Row[]> {
  try {
    return await rpc(db, 'cliente_contas', { p_corretora: corretora, p_cliente_id: clienteId, p_mes_ref: mesRef })
  } catch (e) {
    if (e instanceof Error && funcaoAusente({ message: e.message })) return rpc(db, 'cliente_contas', { p_corretora: corretora, p_cliente_id: clienteId })
    throw e
  }
}

export async function clienteFicha(corretora: Corretora, clienteId: string, mesRef: string | null) {
  const { db } = await equipe()
  const [lista, cad, contas, mensal, tarifas, extrato, porAtivo, manualRes] = await Promise.all([
    rpc(db, 'clientes_lista', { p_corretora: corretora, p_mes_ref: mesRef, p_cliente_id: clienteId }),
    db.from('clientes').select('*').eq('id', clienteId).maybeSingle(),
    contasDoCliente(db, corretora, clienteId, mesRef),
    rpc(db, 'cliente_mensal', { p_corretora: corretora, p_cliente_id: clienteId, p_mes_ref: mesRef, p_meses: 12 }),
    db.from('tarifas_cliente').select('id, vigencia, corretagem, observacao').eq('corretora', corretora).eq('cliente_id', clienteId).order('vigencia', { ascending: false }),
    rpc(db, 'cliente_extrato', { p_corretora: corretora, p_cliente_id: clienteId, p_limit: 400 }),
    rpc(db, 'cliente_por_ativo', { p_corretora: corretora, p_cliente_id: clienteId }),
    // campos manuais que a ficha edita (status manual, responsável, data de migração)
    db.from('cliente_corretora').select('*').eq('cliente_id', clienteId).eq('corretora', corretora).maybeSingle(),
  ])
  if (cad.error) falha(cad.error, 'clientes')
  if (tarifas.error) falha(tarifas.error, 'tarifas_cliente')
  if (manualRes.error) falha(manualRes.error, 'cliente_corretora')
  const manualRow = manualRes.data as Row | null
  const c = cad.data as Row | null
  const cadastro: ClienteCadastro | null = c ? {
    id: String(c.id), nome: String(c.nome ?? ''), documento: str(c.documento), tipo_pessoa: str(c.tipo_pessoa), sexo: str(c.sexo),
    estado_civil: str(c.estado_civil), uf: str(c.uf), profissao: str(c.profissao),
    rendimentos: c.rendimentos == null ? null : num(c.rendimentos), patrimonio: c.patrimonio == null ? null : num(c.patrimonio),
    email: str(c.email), telefone: str(c.telefone), perfil: str(c.perfil), perfil_suitability: str(c.perfil_suitability),
    dt_nascimento: str(c.dt_nascimento),
  } : null
  return {
    resumo: lista.length ? mapCliente(lista[0]) : null,
    cadastro,
    manual: { status: str(manualRow?.status), responsavel: str(manualRow?.responsavel), assessor: str(manualRow?.assessor), data_migracao: str(manualRow?.data_migracao) },
    contas: linhas<ContaRow>(contas, r => ({
      conta_id: String(r.conta_id), conta: String(r.conta ?? ''), conta_digito: str(r.conta_digito), situacao_conta: str(r.situacao_conta),
      status: (str(r.status) ?? 'Em processamento') as ContaRow['status'], assessor_nome: str(r.assessor_nome), filial: str(r.filial),
      data_habilitacao: str(r.data_habilitacao), principal: bool(r.principal), lotes: num(r.lotes), lotes_12m: num(r.lotes_12m),
      zerados: num(r.zerados), receita: num(r.receita), ultimo_giro: str(r.ultimo_giro),
      lotes_mes: num(r.lotes_mes), receita_mes: num(r.receita_mes), receita_12m: num(r.receita_12m),
    })),
    mensal: linhas<ClienteMensalRow>(mensal, r => ({ mes_ref: String(r.mes_ref), lotes: num(r.lotes), zerados: num(r.zerados), receita: num(r.receita), pontos: num(r.pontos) })),
    tarifas: ((tarifas.data ?? []) as Row[]).map<TarifaCliente>(r => ({ id: String(r.id), vigencia: String(r.vigencia), corretagem: num(r.corretagem), observacao: str(r.observacao) })),
    extrato: linhas<ExtratoRow>(extrato, r => ({
      id: String(r.id), data: String(r.data), conta: str(r.conta), ativo: str(r.ativo), produto: str(r.produto), plataforma: str(r.plataforma),
      modo: str(r.modo), lotes_operados: num(r.lotes_operados), lotes_zerados: num(r.lotes_zerados), tarifa: num(r.tarifa), zeragem_rs: num(r.zeragem_rs),
      receita_corretagem: num(r.receita_corretagem), receita_zeragem: num(r.receita_zeragem), pontos: num(r.pontos), nome_cliente: str(r.nome_cliente),
    })),
    porAtivo: linhas<PorAtivoRow>(porAtivo, r => ({ ativo: String(r.ativo ?? '—'), lotes: num(r.lotes), zerados: num(r.zerados), receita: num(r.receita), operacoes: num(r.operacoes) })),
  }
}

// Busca rápida de clientes (consulta): nome, CPF ou conta
// Busca rápida de cliente por nome, telefone, CPF/CNPJ, e-mail ou conta (mesmas regras de src/lib/busca.ts).
// escopo 'corretora' (topo de Clientes): só quem é cliente na corretora, pelas duas portas da
// v_cliente_corretora — conta na corretora, ou cadastro manual com status (cliente sem conta, como no BTG).
// escopo 'cadastro' (Importar › Vincular conta, só admin): todo o cadastro, para ligar a conta nova a quem já existe.
// Cada jeito de procurar vira uma consulta (em paralelo); depois todas as palavras do termo precisam
// casar ("vitor 8596"), conferindo todas as contas do cliente na corretora (com e sem dígito).
export async function buscarClientes(corretora: Corretora, termo: string, limite = 12, escopo: 'corretora' | 'cadastro' = 'corretora'): Promise<ClienteEncontrado[]> {
  const { db } = await equipe()
  const t = termo.trim()
  const busca = lerBusca(t)
  if (t.length < 2 || !busca) return []
  const textos = busca.tokens.filter(k => k.tipo === 'texto')
  const padroesNome = textos.map(regexDoTexto).filter((x): x is string => !!x)
  const tokensNumero = busca.tokens.filter(k => k.tipo === 'digitos' && !k.soTexto)
  const numeros = tokensNumero.flatMap(k => [k.valor, ...(k.partes ?? [])]).filter((d, i, a) => d.length >= 3 && a.indexOf(d) === i).slice(0, 4)
  const limpaLike = (v: string) => v.replace(/[%*,()"\\]/g, '')
  const emails = busca.tokens.filter(k => k.tipo === 'email').map(k => limpaLike(k.valor)).filter(Boolean)
  // cada palavra do termo também pode ser um pedaço do e-mail ("andre.silva", "joao_92")
  const pedacosEmail = textos.map(k => limpaLike(k.valor.toLowerCase())).filter(v => v.length >= 3).slice(0, 2)
  const CAMPOS = 'id, nome, documento, telefone, email'
  type Consulta = PromiseLike<{ data: unknown; error: { message: string } | null }>
  // o pedaço do construtor de consultas que os filtros usam (o tipo completo do supabase-js é profundo demais)
  type Filtravel = { ilike(c: string, v: string): Filtravel; like(c: string, v: string): Filtravel; filter(c: string, op: string, v: string): Filtravel; limit(n: number): Consulta }
  const filtravel = (q: unknown) => q as Filtravel

  // onde procurar: as duas portas da corretora, ou o cadastro inteiro
  const portas = (filtro: (q: Filtravel) => Filtravel, n: number): Consulta[] => escopo === 'cadastro'
    ? [filtro(filtravel(db.from('clientes').select(CAMPOS))).limit(n)]
    : [
        filtro(filtravel(db.from('clientes').select(`${CAMPOS}, contas!inner(corretora)`).eq('contas.corretora', corretora))).limit(n),
        filtro(filtravel(db.from('clientes').select(`${CAMPOS}, cliente_corretora!inner(corretora, status)`).eq('cliente_corretora.corretora', corretora).not('cliente_corretora.status', 'is', null))).limit(n),
      ]
  const consultas: Consulta[] = []
  // nome: cada palavra do termo (apóstrofo opcional: DAVILA acha D'AVILA, o nome_norm do banco mantém o apóstrofo)
  if (padroesNome.length) consultas.push(...portas(q => padroesNome.reduce((acc, re) => acc.filter('nome_norm', 'imatch', re), q), 60))
  for (const p of [...emails, ...pedacosEmail]) consultas.push(...portas(q => q.ilike('email', `%${p}%`), 30))
  for (const d of numeros) {
    consultas.push(...portas(q => q.like('documento', `%${d}%`), 30))
    const nacional = digitosTelefone(d)
    if (nacional.length >= 4) consultas.push(...portas(q => q.like('telefone_digits', `%${nacional.slice(-8)}%`), 30))
    // "+5511987" ainda incompleto: também sem o 55 (o 55 pode ser DDD, por isso a consulta acima continua)
    if (d.startsWith('55') && d.length >= 6 && d.length < 12) consultas.push(...portas(q => q.like('telefone_digits', `%${d.slice(2)}%`), 30))
    const semZeros = d.replace(/^0+(?=\d)/, '')
    consultas.push(db.from('contas').select(`cliente_id, clientes!inner(${CAMPOS})`).eq('corretora', corretora)
      .or(`conta.like.%${semZeros}%,conta_digito.like.%${semZeros}%`).limit(30))
  }
  if (!consultas.length) return []

  const candidatos = new Map<string, Row>()
  for (const r of await Promise.all(consultas)) {
    if (r.error) falha(r.error, 'clientes')
    for (const x of (r.data ?? []) as Row[]) {
      const c = (x.clientes as Row | undefined) ?? x
      if (c?.id) candidatos.set(String(c.id), c)
    }
  }
  if (!candidatos.size) return []

  // quem é cliente na corretora (conta principal) e todas as contas dele lá, com e sem dígito
  const ids = [...candidatos.keys()].slice(0, 300)
  const principal = new Map<string, string | null>()
  const contasDe = new Map<string, { conta: string; digito: string | null }[]>()
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100)
    const [v, ct] = await Promise.all([
      db.from('v_cliente_corretora').select('cliente_id, conta_principal').eq('corretora', corretora).in('cliente_id', lote),
      db.from('contas').select('cliente_id, conta, conta_digito').eq('corretora', corretora).in('cliente_id', lote),
    ])
    if (v.error) falha(v.error, 'v_cliente_corretora')
    if (ct.error) falha(ct.error, 'contas')
    for (const r of (v.data ?? []) as Row[]) principal.set(String(r.cliente_id), str(r.conta_principal))
    for (const r of (ct.data ?? []) as Row[]) {
      if (!r.conta) continue
      const lista = contasDe.get(String(r.cliente_id)) ?? []
      lista.push({ conta: String(r.conta), digito: str(r.conta_digito) })
      contasDe.set(String(r.cliente_id), lista)
    }
  }

  const out: ClienteEncontrado[] = []
  for (const id of ids) {
    const r = candidatos.get(id) as Row
    if (escopo === 'corretora' && !principal.has(id)) continue
    const contas = contasDe.get(id) ?? []
    const ix = indexarBusca({ textos: [str(r.nome)], telefones: [str(r.telefone)], documentos: [str(r.documento)], contas: [principal.get(id), ...contas.flatMap(c => [c.conta, c.digito])], emails: [str(r.email)] })
    if (!casaBusca(busca, ix)) continue
    // mostra a conta que casou com o número digitado; senão a principal
    const casou = contas.find(c => tokensNumero.some(k => contaCasa(k, c.conta) || (!!c.digito && contaCasa(k, c.digito))))
    const conta = casou?.conta ?? principal.get(id) ?? contas[0]?.conta ?? null
    out.push({ id, nome: String(r.nome ?? ''), documento: str(r.documento), conta, telefone: str(r.telefone), email: str(r.email) })
  }
  // quem começa com o termo primeiro, depois em ordem alfabética
  const tn = normTexto(t)
  return out.sort((a, b) => Number(normTexto(b.nome).startsWith(tn)) - Number(normTexto(a.nome).startsWith(tn)) || a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, limite)
}

// ── Painel ─────────────────────────────────────────────────────────────────
export const mapKpis = (r: Row): PainelKpis => ({
  mes_ref: String(r.mes_ref), clientes_levados: num(r.clientes_levados), total_contas: num(r.total_contas), migrados: num(r.migrados),
  em_processamento: num(r.em_processamento), recusaram: num(r.recusaram), ativos_mes: num(r.ativos_mes), lotes_mes: num(r.lotes_mes),
  zerados_mes: num(r.zerados_mes), receita_mes: num(r.receita_mes), incentivo_mes: num(r.incentivo_mes), clientes_com_faixa: num(r.clientes_com_faixa),
  migrados_sem_giro: num(r.migrados_sem_giro), inativos: num(r.inativos), com_alertas: num(r.com_alertas), migrados_sem_data: num(r.migrados_sem_data),
  multi_conta: num(r.multi_conta), linhas_nao_cadastradas: num(r.linhas_nao_cadastradas), lotes_nao_cadastrados: num(r.lotes_nao_cadastrados),
  ultima_data: str(r.ultima_data), lotes_12m: num(r.lotes_12m), receita_12m: num(r.receita_12m), posicao_mes: num(r.posicao_mes),
  acoes_operacoes_mes: num(r.acoes_operacoes_mes), receita_acoes_mes: num(r.receita_acoes_mes), em_risco: num(r.em_risco),
})

// Nível como o banco devolve (S46); antes da S46 a coluna não existe e o nível sai da média com os limites padrão
const nivelDoBanco = (r: Row) => ('nivel' in r ? nivelDe(r.nivel) : nivelPelaMedia(num(r.lotes_media_3m)))

// Ordem dos níveis: Alto primeiro, sem nível por último
const ordemNivel = (n: string | null) => (n === 'Alto' ? 1 : n === 'Médio' ? 2 : n === 'Baixo' ? 3 : 4)

// Cliente em risco (S44), como vem de painel_resumo.em_risco ou de clientes_risco
const mapRisco = (r: Row): ClienteRiscoRow => ({
  cliente_id: String(r.cliente_id), nome: String(r.nome ?? ''), responsavel: str(r.responsavel), telefone: str(r.telefone),
  risco: riscoDe(r.risco) ?? 'parou', lotes_mes: num(r.lotes_mes), lotes_mes_anterior: num(r.lotes_mes_anterior), lotes_media_3m: num(r.lotes_media_3m),
  receita_12m: num(r.receita_12m), ultimo_giro: str(r.ultimo_giro), dias_sem_giro: r.dias_sem_giro == null ? null : num(r.dias_sem_giro),
  nivel: nivelDoBanco(r),
})

// Giro por dia para a projeção de fechamento (S44): só clientes cadastrados, como os KPIs. Antes da
// S44 cai no `diario`, que traz o mesmo par lotes/receita (todos os lançamentos; só mais pesado).
export async function giroDiario(corretora: Corretora, inicio: string, fim: string): Promise<GiroDiaRow[]> {
  const { db } = await equipe()
  const mapa = (r: Row): GiroDiaRow => ({ dia: String(r.dia), lotes: num(r.lotes), receita: num(r.receita) })
  try {
    return linhas(await rpc(db, 'giro_diario', { p_corretora: corretora, p_inicio: inicio, p_fim: fim }), mapa)
  } catch (e) {
    if (!(e instanceof Error && funcaoAusente({ message: e.message }))) throw e
    return linhas(await rpc(db, 'diario', { p_corretora: corretora, p_inicio: inicio, p_fim: fim }), mapa)
  }
}

export async function painelKpis(corretora: Corretora, mesRef: string | null): Promise<PainelKpis | null> {
  const { db } = await equipe()
  const rows = await rpc(db, 'painel_kpis', { p_corretora: corretora, p_mes_ref: mesRef })
  return rows.length ? mapKpis(rows[0]) : null
}

export const mapMensal = (r: Row): PainelMensalRow => ({
  mes_ref: String(r.mes_ref), migrados_acumulados: num(r.migrados_acumulados), novas_migracoes: num(r.novas_migracoes), entradas: num(r.entradas),
  clientes_ativos: num(r.clientes_ativos), lotes: num(r.lotes), zerados: num(r.zerados), receita_corretagem: num(r.receita_corretagem),
  receita_zeragem: num(r.receita_zeragem), receita: num(r.receita), incentivo: num(r.incentivo), clientes_pontuando: num(r.clientes_pontuando),
  clientes_com_faixa: num(r.clientes_com_faixa), posicao: num(r.posicao), acoes_operacoes: num(r.acoes_operacoes), receita_acoes: num(r.receita_acoes),
})

export async function painelMensal(corretora: Corretora, mesRef: string | null, meses = 12): Promise<PainelMensalRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'painel_mensal', { p_corretora: corretora, p_mes_ref: mesRef, p_meses: meses }), mapMensal)
}

// Lotes por cliente e mês; `top` traz só os N maiores (mapa de calor). Antes da S24 a função
// não tem p_top: cai no formato antigo e conta os clientes aqui.
export async function painelClientesMensal(corretora: Corretora, mesRef: string | null, meses = 12, top: number | null = null): Promise<ClienteMesRow[]> {
  const { db } = await equipe()
  const mapa = (total: number | null) => (r: Row): ClienteMesRow => ({
    cliente_id: String(r.cliente_id), cliente_nome: String(r.cliente_nome ?? ''), responsavel: str(r.responsavel), mes_ref: String(r.mes_ref), lotes: num(r.lotes),
    total_clientes: total ?? num(r.total_clientes),
  })
  try {
    return linhas(await rpc(db, 'painel_clientes_mensal', { p_corretora: corretora, p_mes_ref: mesRef, p_meses: meses, p_top: top }), mapa(null))
  } catch (e) {
    if (!(e instanceof Error && funcaoAusente({ message: e.message }))) throw e
    const rows = await rpc(db, 'painel_clientes_mensal', { p_corretora: corretora, p_mes_ref: mesRef, p_meses: meses })
    const total = new Set(rows.map(r => String(r.cliente_id))).size
    return linhas(rows, mapa(total))
  }
}

export async function lotesNaoCadastrados(corretora: Corretora): Promise<LoteNaoCadastradoRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'lotes_nao_cadastrados', { p_corretora: corretora }), r => ({
    conta: str(r.conta), nome_cliente: str(r.nome_cliente), assessor_nome: str(r.assessor_nome), lotes: num(r.lotes), linhas: num(r.linhas),
    primeira: str(r.primeira), ultima: str(r.ultima),
  }))
}

export async function migracoesDiarias(corretora: Corretora, inicio: string, fim: string): Promise<MigracaoDiaRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'migracoes_diarias', { p_corretora: corretora, p_inicio: inicio, p_fim: fim }),
    r => ({ dia: String(r.dia), migrados: num(r.migrados), entradas: num(r.entradas), acumulado: num(r.acumulado) }))
}

export async function mixPlataforma(corretora: Corretora, inicio: string, fim: string): Promise<MixPlataformaRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'mix_plataforma', { p_corretora: corretora, p_inicio: inicio, p_fim: fim }),
    r => ({ plataforma: String(r.plataforma ?? 'Não informada'), lotes: num(r.lotes), zerados: num(r.zerados), clientes: num(r.clientes) }))
}

// ── Assessores ─────────────────────────────────────────────────────────────
export async function assessoresResumo(corretora: Corretora, mesRef: string | null): Promise<AssessorResumoRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'assessores_resumo', { p_corretora: corretora, p_mes_ref: mesRef }), r => ({
    assessor_nome: String(r.assessor_nome ?? 'Sem assessor'), responsavel: str(r.responsavel), tarifa: r.tarifa == null ? null : num(r.tarifa),
    tipo_zeragem: str(r.tipo_zeragem), clientes_ativos: num(r.clientes_ativos), lotes: num(r.lotes), zerados: num(r.zerados),
    receita_corretagem: num(r.receita_corretagem), receita_zeragem: num(r.receita_zeragem), receita: num(r.receita),
    lotes_mes_anterior: num(r.lotes_mes_anterior), lotes_12m: num(r.lotes_12m), receita_12m: num(r.receita_12m),
  }))
}

export async function assessoresMensal(corretora: Corretora, mesRef: string | null, meses = 12): Promise<AssessorMensalRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'assessores_mensal', { p_corretora: corretora, p_mes_ref: mesRef, p_meses: meses }),
    r => ({ mes_ref: String(r.mes_ref), assessor_nome: String(r.assessor_nome ?? 'Sem assessor'), lotes: num(r.lotes), receita: num(r.receita), clientes: num(r.clientes) }))
}

export async function topClientes(corretora: Corretora, inicio: string, fim: string, assessor: string | null, limite = 20): Promise<TopClienteRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'top_clientes', { p_corretora: corretora, p_inicio: inicio, p_fim: fim, p_assessor: assessor, p_limit: limite }), r => ({
    cliente_id: str(r.cliente_id), cliente_nome: String(r.cliente_nome ?? 'Não cadastrado'), assessor_nome: str(r.assessor_nome), responsavel: str(r.responsavel),
    lotes: num(r.lotes), zerados: num(r.zerados), receita: num(r.receita), pct_lotes: num(r.pct_lotes),
  }))
}

// Série mensal de receita bruta desde uma data (ATP Turbo e repasse do BTG); todo o histórico quando inicio = null
export async function receitaMensal(corretora: Corretora, inicio: string | null): Promise<ReceitaMensalRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'receita_mensal', { p_corretora: corretora, p_inicio: inicio }), r => ({
    mes_ref: String(r.mes_ref), lotes: num(r.lotes), zerados: num(r.zerados), receita_corretagem: num(r.receita_corretagem),
    receita_zeragem: num(r.receita_zeragem), receita: num(r.receita), clientes_ativos: num(r.clientes_ativos),
  }))
}

// ── Incentivo ──────────────────────────────────────────────────────────────
export async function incentivoMes(corretora: Corretora, mesRef: string | null): Promise<IncentivoRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'incentivo_mes', { p_corretora: corretora, p_mes_ref: mesRef }), r => ({
    chave: String(r.chave), nome: String(r.nome ?? ''), cliente_id: str(r.cliente_id), contas: num(r.contas), lotes: num(r.lotes), pontos: num(r.pontos),
    pontos_win: num(r.pontos_win), pontos_wdo: num(r.pontos_wdo), pontos_dol: num(r.pontos_dol), pontos_outros: num(r.pontos_outros),
    faixa_min: num(r.faixa_min), valor_incentivo: num(r.valor_incentivo),
    proxima_faixa: r.proxima_faixa == null ? null : num(r.proxima_faixa), pontos_faltantes: r.pontos_faltantes == null ? null : num(r.pontos_faltantes),
  }))
}

export async function incentivoHistorico(corretora: Corretora, mesRef: string | null, meses = 12): Promise<IncentivoHistRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'incentivo_historico', { p_corretora: corretora, p_mes_ref: mesRef, p_meses: meses }),
    r => ({ mes_ref: String(r.mes_ref), pontos: num(r.pontos), clientes_pontuando: num(r.clientes_pontuando), clientes_com_faixa: num(r.clientes_com_faixa), incentivo: num(r.incentivo) }))
}

// ── Diário ─────────────────────────────────────────────────────────────────
export async function diario(corretora: Corretora, inicio: string, fim: string): Promise<DiarioRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'diario', { p_corretora: corretora, p_inicio: inicio, p_fim: fim }),
    r => ({ dia: String(r.dia), lotes: num(r.lotes), zerados: num(r.zerados), clientes: num(r.clientes), operacoes: num(r.operacoes), receita: num(r.receita) }))
}

// Última data lançada (sem passar pelo painel inteiro)
export async function ultimaData(corretora: Corretora): Promise<string | null> {
  const { db } = await equipe()
  const { data, error } = await db.from('lotes').select('data').eq('corretora', corretora).order('data', { ascending: false }).limit(1).maybeSingle()
  if (error) falha(error, 'lotes')
  return data ? String((data as Row).data) : null
}

// ── Leads ──────────────────────────────────────────────────────────────────
export const mapLead = (r: Row): LeadRow => ({
  id: String(r.id), corretora: str(r.corretora), data_hora: String(r.data_hora), nome: String(r.nome ?? ''), whatsapp: str(r.whatsapp), cpf: str(r.cpf),
  email: str(r.email), ja_opera: str(r.ja_opera), origem: str(r.origem), responsavel: str(r.responsavel), status: String(r.status ?? 'Novo'),
  tipo_status: (str(r.tipo_status) ?? 'Aberto') as LeadRow['tipo_status'], ultimo_contato: str(r.ultimo_contato), data_fechamento: str(r.data_fechamento),
  motivo_perda: str(r.motivo_perda), observacoes: str(r.observacoes), cliente_id: str(r.cliente_id), cliente_nome: str(r.cliente_nome),
  cliente_status: str(r.cliente_status), cliente_corretora: str(r.cliente_corretora), conta: str(r.conta), girou: bool(r.girou), lotes_12m: num(r.lotes_12m),
  dias: r.dias == null ? null : num(r.dias), alerta: bool(r.alerta), contatos: num(r.contatos),
})

export async function leadsLista(): Promise<LeadRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'leads_lista', { p_corretora_opera: null }), mapLead)
}

// Erro da API quando a tabela ainda não existe no banco (script SQL não aplicado)
const tabelaAusente = (e: { code?: string; message: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|does not exist/i.test(e.message))

// Histórico de contatos de um lead (S47), do mais recente para o mais antigo
export async function leadContatos(leadId: string): Promise<LeadContato[]> {
  const { db } = await equipe()
  const { data, error } = await db.from('lead_contatos').select('id, lead_id, data, nota, criado_por_nome, created_at')
    .eq('lead_id', leadId).order('data', { ascending: false }).order('created_at', { ascending: false })
  if (error) { if (tabelaAusente(error)) return []; falha(error, 'lead_contatos') }
  return linhas(data, r => ({
    id: String(r.id), lead_id: String(r.lead_id), data: String(r.data), nota: str(r.nota), criado_por_nome: str(r.criado_por_nome), created_at: String(r.created_at),
  }))
}

// Histórico de contatos inteiro (lead e data) e os leads (responsável e status), para o resumo de
// contatos por atendente no Funil. São tabelas pequenas (duas colunas); antes da S47 vem vazio.
export async function contatosParaResumo(): Promise<{ contatos: ContatoLeve[]; leads: LeadLeve[] }> {
  const { db } = await equipe()
  const [contatos, leads] = await Promise.all([
    db.from('lead_contatos').select('lead_id, data').range(0, PAGINA - 1),
    db.from('leads').select('id, responsavel, status').range(0, PAGINA - 1),
  ])
  if (contatos.error) { if (tabelaAusente(contatos.error)) return { contatos: [], leads: [] }; falha(contatos.error, 'lead_contatos') }
  if (leads.error) falha(leads.error, 'leads')
  return {
    contatos: linhas(contatos.data, r => ({ lead_id: String(r.lead_id), data: String(r.data) })),
    leads: linhas(leads.data, r => ({ id: String(r.id), responsavel: str(r.responsavel), status: String(r.status ?? 'Novo') })),
  }
}

// Série diária dos leads (S47): quantos entraram, contatos feitos, ganhos, perdidos e contas abertas
// nos últimos N dias. Antes da S47 (função ausente) calcula da lista, sem contatos nem contas.
export async function leadsDiario(dias = 30): Promise<LeadDiaRow[]> {
  const { db } = await equipe()
  const { data, error } = await db.rpc('leads_diario', { p_dias: dias })
  if (error) {
    if (!funcaoAusente(error)) falha(error, 'leads_diario')
    return diarioPelaLista(await leadsLista(), fmtDate(hojeBrasil()), dias)
  }
  return linhas(data, r => ({
    dia: String(r.dia), entraram: num(r.entraram), contatos: num(r.contatos), ganhos: num(r.ganhos), perdidos: num(r.perdidos), contas_abertas: num(r.contas_abertas),
  }))
}

// Contagens dos leads + lista de ação (abertos com alerta, mais antigos primeiro), sem baixar a
// lista inteira. Antes da S29 (função ausente) calcula a partir da lista.
const mapLeadAcao = (r: Row): LeadAcao => ({
  id: String(r.id), nome: String(r.nome ?? ''), whatsapp: str(r.whatsapp), responsavel: str(r.responsavel), status: String(r.status ?? 'Novo'),
  tipo_status: (str(r.tipo_status) ?? 'Aberto') as LeadAcao['tipo_status'], data_hora: String(r.data_hora), ultimo_contato: str(r.ultimo_contato),
  dias: r.dias == null ? null : num(r.dias), corretora: str(r.corretora),
})
export async function leadsResumo(limite = 40): Promise<LeadsResumo> {
  const { db } = await equipe()
  const { data, error } = await db.rpc('leads_resumo', { p_limite: limite })
  if (error) {
    if (!funcaoAusente(error)) falha(error, 'leads_resumo')
    return resumoPelaListaLeads(await leadsLista(), limite)
  }
  const j = (data ?? {}) as Row
  return {
    total: num(j.total), neste_mes: num(j.neste_mes), abertos: num(j.abertos), com_alerta: num(j.com_alerta), ganhos: num(j.ganhos),
    perdidos: num(j.perdidos), ja_clientes: num(j.ja_clientes), acao: linhas<LeadAcao>(j.acao, mapLeadAcao),
  }
}
function resumoPelaListaLeads(leads: LeadRow[], limite: number): LeadsResumo {
  const mes = mesAtual().slice(0, 7)
  return {
    total: leads.length, neste_mes: leads.filter(l => mesBrasil(l.data_hora) === mes).length,
    abertos: leads.filter(l => l.tipo_status === 'Aberto').length, com_alerta: leads.filter(l => l.alerta).length,
    ganhos: leads.filter(l => l.status === 'Ganho').length, perdidos: leads.filter(l => l.status === 'Perdido').length,
    ja_clientes: leads.filter(l => l.cliente_id).length,
    acao: leads.filter(l => l.alerta).sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0)).slice(0, limite),
  }
}

export async function funilMensal(mesRef: string | null, meses = 12): Promise<FunilMensalRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'funil_mensal', { p_mes_ref: mesRef, p_meses: meses }), r => ({
    mes_ref: String(r.mes_ref), recebidos: num(r.recebidos), ja_clientes: num(r.ja_clientes), ganhos: num(r.ganhos), perdidos: num(r.perdidos),
    safra_ganhos: num(r.safra_ganhos), safra_perdidos: num(r.safra_perdidos), safra_abertos: num(r.safra_abertos), abertos_acumulado: num(r.abertos_acumulado),
    dias_fechar: r.dias_fechar == null ? null : num(r.dias_fechar),
  }))
}

export async function funilPor(campo: 'responsavel' | 'origem' | 'corretora' | 'status', mesRef: string | null, meses = 12): Promise<FunilPorRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'funil_por', { p_campo: campo, p_mes_ref: mesRef, p_meses: meses }), r => ({
    grupo: String(r.grupo ?? '—'), leads: num(r.leads), ja_clientes: num(r.ja_clientes), abertos: num(r.abertos), ganhos: num(r.ganhos), perdidos: num(r.perdidos),
    taxa_ganho: num(r.taxa_ganho), conversao: num(r.conversao), dias_fechar: r.dias_fechar == null ? null : num(r.dias_fechar), com_alerta: num(r.com_alerta),
  }))
}

// ── Parâmetros ─────────────────────────────────────────────────────────────
export async function parametrosDaCorretora(corretora: Corretora) {
  const { db } = await equipe()
  const [p, a, m, mu, f, c, sl, rs, snm, anc, ger] = await Promise.all([
    db.from('parametros').select('chave, valor, descricao').eq('corretora', corretora).order('chave'),
    db.from('assessores').select('*').eq('corretora', corretora).order('nome'),
    db.from('status_conta_mapa').select('situacao, status').eq('corretora', corretora).order('situacao'),
    db.from('multiplicadores').select('produto, pontos').eq('corretora', corretora).order('produto'),
    db.from('faixas_incentivo').select('pontos_min, valor').eq('corretora', corretora).order('pontos_min'),
    db.from('consolidados').select('nome').eq('corretora', corretora).order('nome'),
    db.from('status_lead').select('status, tipo, ordem').order('ordem'),
    db.from('responsaveis').select('*').order('nome'),
    rpc(db, 'situacoes_nao_mapeadas', { p_corretora: corretora }),
    rpc(db, 'assessores_nao_cadastrados', { p_corretora: corretora }),
    db.from('parametros').select('chave, valor, descricao').eq('corretora', 'GERAL'),
  ])
  for (const q of [p, a, m, mu, f, c, sl, rs, ger]) if (q.error) falha(q.error, 'parametros')
  return {
    parametros: ((p.data ?? []) as Row[]).map<Parametro>(r => ({ chave: String(r.chave), valor: String(r.valor), descricao: str(r.descricao) })),
    gerais: ((ger.data ?? []) as Row[]).map<Parametro>(r => ({ chave: String(r.chave), valor: String(r.valor), descricao: str(r.descricao) })),
    assessores: ((a.data ?? []) as Row[]).map<AssessorParam>(r => ({
      id: String(r.id), corretora, nome: String(r.nome), id_assessor: str(r.id_assessor), corretagem: num(r.corretagem),
      tipo_zeragem: (str(r.tipo_zeragem) ?? 'PADRAO') as AssessorParam['tipo_zeragem'], zeragem_fixa: num(r.zeragem_fixa),
      responsavel: str(r.responsavel), parceiro: str(r.parceiro), ativo: r.ativo !== false,
    })),
    statusConta: ((m.data ?? []) as Row[]).map<StatusContaMapa>(r => ({ situacao: String(r.situacao), status: String(r.status) as StatusContaMapa['status'] })),
    multiplicadores: ((mu.data ?? []) as Row[]).map<Multiplicador>(r => ({ produto: String(r.produto), pontos: num(r.pontos) })),
    faixas: ((f.data ?? []) as Row[]).map<Faixa>(r => ({ pontos_min: num(r.pontos_min), valor: num(r.valor) })),
    consolidados: ((c.data ?? []) as Row[]).map<Consolidado>(r => ({ nome: String(r.nome) })),
    statusLead: ((sl.data ?? []) as Row[]).map<StatusLead>(r => ({ status: String(r.status), tipo: String(r.tipo) as StatusLead['tipo'], ordem: num(r.ordem) })),
    responsaveis: ((rs.data ?? []) as Row[]).map<Responsavel>(r => ({ nome: String(r.nome), atende_clientes: r.atende_clientes !== false, atende_leads: r.atende_leads !== false, ativo: r.ativo !== false, comissionado: r.comissionado === true })),
    situacoesNaoMapeadas: linhas<SituacaoNaoMapeada>(snm, r => ({ situacao: String(r.situacao), contas: num(r.contas) })),
    assessoresNaoCadastrados: linhas<AssessorNaoCadastrado>(anc, r => ({ assessor_nome: String(r.assessor_nome ?? ''), contas: num(r.contas), lotes: num(r.lotes) })),
  }
}

export async function responsaveisAtivos(): Promise<Responsavel[]> {
  const { db } = await equipe()
  const { data, error } = await db.from('responsaveis').select('*').eq('ativo', true).order('nome')
  if (error) falha(error, 'responsaveis')
  return ((data ?? []) as Row[]).map(r => ({ nome: String(r.nome), atende_clientes: r.atende_clientes !== false, atende_leads: r.atende_leads !== false, ativo: true, comissionado: r.comissionado === true }))
}

export async function statusLeadLista(): Promise<StatusLead[]> {
  const { db } = await equipe()
  const { data, error } = await db.from('status_lead').select('*').order('ordem')
  if (error) falha(error, 'status_lead')
  return ((data ?? []) as Row[]).map(r => ({ status: String(r.status), tipo: String(r.tipo) as StatusLead['tipo'], ordem: num(r.ordem) }))
}

export async function parametroGeral(chave: string, padrao: string): Promise<string> {
  const { db } = await equipe()
  const { data } = await db.from('parametros').select('valor').eq('corretora', 'GERAL').eq('chave', chave).maybeSingle()
  return data ? String((data as Row).valor) : padrao
}

// ── Importações ────────────────────────────────────────────────────────────
export async function importacoesLista(corretora: Corretora | 'GERAL', tipo?: Importacao['tipo'], limite = 30): Promise<Importacao[]> {
  const { db } = await equipe()
  let q = db.from('importacoes').select('*').eq('corretora', corretora).order('created_at', { ascending: false }).limit(limite)
  if (tipo) q = q.eq('tipo', tipo)
  const { data, error } = await q
  if (error) falha(error, 'importacoes')
  return ((data ?? []) as Row[]).map(r => ({
    id: String(r.id), corretora: String(r.corretora), tipo: String(r.tipo) as Importacao['tipo'], nome_arquivo: String(r.nome_arquivo ?? ''),
    linhas: num(r.linhas), linhas_novas: num(r.linhas_novas), linhas_ignoradas: num(r.linhas_ignoradas), data_min: str(r.data_min), data_max: str(r.data_max),
    detalhes: (r.detalhes as Record<string, unknown> | null) ?? null, criado_por_nome: str(r.criado_por_nome), created_at: String(r.created_at),
  }))
}

// Quantos lotes já existem num período (pra avisar antes de substituir)
export async function lotesNoPeriodo(corretora: Corretora, inicio: string, fim: string): Promise<{ linhas: number; importacoes: string[] }> {
  const { db } = await equipe()
  const { count, error } = await db.from('lotes').select('id', { count: 'exact', head: true }).eq('corretora', corretora).gte('data', inicio).lte('data', fim)
  if (error) falha(error, 'lotes')
  const { data } = await db.from('importacoes').select('nome_arquivo, created_at').eq('corretora', corretora).eq('tipo', 'lotes')
    .lte('data_min', fim).gte('data_max', inicio).order('created_at', { ascending: false }).limit(5)
  return { linhas: count ?? 0, importacoes: ((data ?? []) as Row[]).map(r => `${r.nome_arquivo} (${String(r.created_at).slice(0, 10)})`) }
}

// ── Painel: agregados calculados no banco (S24) ─────────────────────────────
// Antes da S24 (função ausente) cai no cálculo em memória sobre a lista completa.
export async function painelResumo(corretora: Corretora, mesRef: string | null): Promise<PainelResumo> {
  const { db } = await equipe()
  const { data, error } = await db.rpc('painel_resumo', { p_corretora: corretora, p_mes_ref: mesRef })
  if (error) {
    if (!funcaoAusente(error)) falha(error, 'painel_resumo')
    return resumoPelaLista(await clientesLista(corretora, mesRef))
  }
  const j = (data ?? {}) as Row
  const r = (j.resumo ?? {}) as Row
  const grupo = (g: Row): GrupoPainel => ({
    tipo: g.tipo === 'responsavel' ? 'responsavel' : 'assessor', grupo: String(g.grupo ?? ''), responsavel: str(g.responsavel),
    levados: num(g.levados), migrados: num(g.migrados), em_processamento: num(g.em_processamento), recusaram: num(g.recusaram), ativos: num(g.ativos),
    lotes_mes: num(g.lotes_mes), receita_mes: num(g.receita_mes), lotes_12m: num(g.lotes_12m), receita_12m: num(g.receita_12m), com_receita: num(g.com_receita),
  })
  return {
    resumo: {
      levados: num(r.levados), contas: num(r.contas), migrados: num(r.migrados), em_processamento: num(r.em_processamento), recusaram: num(r.recusaram),
      ativos: num(r.ativos), lotes_mes: num(r.lotes_mes), zerados_mes: num(r.zerados_mes), receita_mes: num(r.receita_mes), lotes_12m: num(r.lotes_12m),
      receita_12m: num(r.receita_12m), nunca_giraram: num(r.nunca_giraram), inativos: num(r.inativos), ativos_sit: num(r.ativos_sit), com_alertas: num(r.com_alertas),
      migrados_sem_data: num(r.migrados_sem_data), multi_conta: num(r.multi_conta), com_receita: num(r.com_receita),
      media_dias_migrar: r.media_dias_migrar == null ? null : num(r.media_dias_migrar),
      em_risco: num(r.em_risco),
      nivel_alto: num(r.nivel_alto), nivel_medio: num(r.nivel_medio), nivel_baixo: num(r.nivel_baixo), em_risco_alto: num(r.em_risco_alto),
    },
    grupos: linhas<GrupoPainel>(j.grupos, grupo),
    sem_giro: linhas(j.sem_giro, s => ({ cliente_id: String(s.cliente_id), nome: String(s.nome ?? ''), responsavel: str(s.responsavel), data_migracao: str(s.data_migracao), telefone: str(s.telefone) })),
    em_risco: linhas(j.em_risco, mapRisco),
  }
}

function resumoPelaLista(rows: ClienteRow[]): PainelResumo {
  const r = resumoClientes(rows)
  const grupo = (tipo: GrupoPainel['tipo']) => (g: GrupoClientes): GrupoPainel => ({
    tipo, grupo: g.grupo, responsavel: g.responsavel, levados: g.levados, migrados: g.migrados, em_processamento: g.emProcessamento, recusaram: g.recusaram,
    ativos: g.ativos, lotes_mes: g.lotesMes, receita_mes: g.receitaMes, lotes_12m: g.lotes12m, receita_12m: g.receita12m, com_receita: g.comReceita,
  })
  return {
    resumo: {
      levados: r.levados, contas: r.contas, migrados: r.migrados, em_processamento: r.emProcessamento, recusaram: r.recusaram, ativos: r.ativos,
      lotes_mes: r.lotesMes, zerados_mes: r.zeradosMes, receita_mes: r.receitaMes, lotes_12m: r.lotes12m, receita_12m: r.receita12m,
      nunca_giraram: r.nuncaGiraram, inativos: r.inativos, ativos_sit: r.ativosSit, com_alertas: r.comAlertas, migrados_sem_data: r.migradosSemData,
      multi_conta: r.multiConta, com_receita: r.comReceita, media_dias_migrar: r.mediaDiasMigrar, em_risco: rows.filter(c => c.risco).length,
      nivel_alto: rows.filter(c => c.nivel === 'Alto').length, nivel_medio: rows.filter(c => c.nivel === 'Médio').length,
      nivel_baixo: rows.filter(c => c.nivel === 'Baixo').length, em_risco_alto: rows.filter(c => c.risco && c.nivel === 'Alto').length,
    },
    grupos: [...porAssessor(rows).map(grupo('assessor')), ...porResponsavel(rows).map(grupo('responsavel'))],
    sem_giro: rows.filter(c => c.situacao === 'Nunca girou').sort((a, b) => (b.data_migracao ?? '').localeCompare(a.data_migracao ?? '')).slice(0, 15)
      .map(c => ({ cliente_id: c.cliente_id, nome: c.nome, responsavel: c.responsavel, data_migracao: c.data_migracao, telefone: c.telefone })),
    em_risco: rows.filter(c => c.risco).sort((a, b) => ordemNivel(a.nivel) - ordemNivel(b.nivel) || b.lotes_media_3m - a.lotes_media_3m || b.receita_12m - a.receita_12m).slice(0, 12)
      .map(c => ({ cliente_id: c.cliente_id, nome: c.nome, responsavel: c.responsavel, telefone: c.telefone, risco: c.risco!, lotes_mes: c.lotes_mes, lotes_mes_anterior: c.lotes_mes_anterior, lotes_media_3m: c.lotes_media_3m, receita_12m: c.receita_12m, ultimo_giro: c.ultimo_giro, dias_sem_giro: c.dias_sem_giro, nivel: c.nivel })),
  }
}

// Posição do cliente no ranking de lotes 12 m, receita total do mês e média de lotes dos ativos (ficha)
export async function clienteContexto(corretora: Corretora, clienteId: string, mesRef: string | null): Promise<ClienteContexto> {
  const { db } = await equipe()
  const { data, error } = await db.rpc('cliente_contexto', { p_corretora: corretora, p_cliente_id: clienteId, p_mes_ref: mesRef })
  if (error) {
    if (!funcaoAusente(error)) falha(error, 'cliente_contexto')
    const todos = await clientesLista(corretora, mesRef)
    const ordenados = todos.filter(c => c.lotes_12m > 0)
    const i = ordenados.findIndex(c => c.cliente_id === clienteId)
    const ativos = todos.filter(c => c.lotes_mes > 0)
    return {
      posicao: i >= 0 ? i + 1 : null, com_giro: ordenados.length,
      receita_total_mes: todos.reduce((s, c) => s + c.receita_mes, 0),
      media_lotes_ativos: ativos.length ? ativos.reduce((s, c) => s + c.lotes_mes, 0) / ativos.length : 0,
    }
  }
  const r = ((data ?? []) as Row[])[0] ?? {}
  return { posicao: r.posicao == null ? null : num(r.posicao), com_giro: num(r.com_giro), receita_total_mes: num(r.receita_total_mes), media_lotes_ativos: num(r.media_lotes_ativos) }
}

// Assessores ativos de cada corretora (selects de cadastro de cliente e do lead ganho)
export async function assessoresPorCorretora(): Promise<AssessoresPorCorretora> {
  const { db } = await equipe()
  const { data, error } = await db.from('assessores').select('corretora, nome').eq('ativo', true).order('nome')
  if (error) falha(error, 'assessores')
  const out: AssessoresPorCorretora = { GENIAL: [], XP: [], BTG: [] }
  for (const r of (data ?? []) as Row[]) {
    const c = String(r.corretora) as keyof AssessoresPorCorretora
    if (out[c]) out[c].push(String(r.nome))
  }
  return out
}

// ── Funil por safra (S26) ───────────────────────────────────────────────────
// Antes da S26 (função ausente) devolve vazio; a tela mostra traços.
const mapSafra = (r: Row) => ({
  recebidos: num(r.recebidos), contatados: num(r.contatados), perdidos: num(r.perdidos), ganhos: num(r.ganhos), em_aberto: num(r.em_aberto),
  ja_clientes: num(r.ja_clientes), viraram_clientes: num(r.viraram_clientes), com_giro: num(r.com_giro),
  ativados: num(r.ativados), em_processamento: num(r.em_processamento), recusaram: num(r.recusaram), lotes: num(r.lotes), receita: num(r.receita),
  contatos: num(r.contatos), contatos_ganhos: num(r.contatos_ganhos), ganhos_contatados: num(r.ganhos_contatados),
  em_contato: num(r.em_contato), perdidos_funil: num(r.perdidos_funil), contas_abertas: num(r.contas_abertas), contas_em_abertura: num(r.contas_em_abertura),
})
export async function funilSafra(mesRef: string | null, meses = 12): Promise<FunilSafraRow[]> {
  const { db } = await equipe()
  try {
    return linhas(await rpc(db, 'funil_safra', { p_mes_ref: mesRef, p_meses: meses }), r => ({ ...mapSafra(r), mes_ref: String(r.mes_ref) }))
  } catch (e) {
    if (e instanceof Error && funcaoAusente({ message: e.message })) return []
    throw e
  }
}
export async function funilSafraPor(campo: 'responsavel' | 'origem' | 'corretora', mesRef: string | null, meses = 12): Promise<FunilSafraPorRow[]> {
  const { db } = await equipe()
  try {
    return linhas(await rpc(db, 'funil_safra_por', { p_campo: campo, p_mes_ref: mesRef, p_meses: meses }), r => ({ ...mapSafra(r), grupo: String(r.grupo ?? '—') }))
  } catch (e) {
    if (e instanceof Error && funcaoAusente({ message: e.message })) return []
    throw e
  }
}

// Resultado do mês (S51): ganhos e perdidos pela data de fechamento, contas novas pela migração, e quem
// operou no mês em um tipo só (novo, ativado, reativado, carteira) com lotes e receita. Antes da S51: vazio.
export async function funilResultado(mesRef: string | null, meses = 12, mesesInativo = 4): Promise<FunilResultadoRow[]> {
  const { db } = await equipe()
  try {
    return linhas(await rpc(db, 'funil_resultado', { p_mes_ref: mesRef, p_meses: meses, p_meses_inativo: mesesInativo }), r => ({
      mes_ref: String(r.mes_ref), ganhos: num(r.ganhos), perdidos: num(r.perdidos),
      contas_novas: num(r.contas_novas), novos_operaram: num(r.novos_operaram), ativados: num(r.ativados), reativados: num(r.reativados), carteira_operou: num(r.carteira_operou),
      receita_total: num(r.receita_total), receita_novos: num(r.receita_novos), receita_ativados: num(r.receita_ativados), receita_reativados: num(r.receita_reativados), receita_carteira: num(r.receita_carteira),
      lotes_total: num(r.lotes_total), lotes_novos: num(r.lotes_novos), lotes_ativados: num(r.lotes_ativados), lotes_reativados: num(r.lotes_reativados), lotes_carteira: num(r.lotes_carteira),
    }))
  } catch (e) {
    if (e instanceof Error && funcaoAusente({ message: e.message })) return []
    throw e
  }
}

// ── Operações de um dia ────────────────────────────────────────────────────
// Todas as linhas do relatório no dia, inclusive as que não contam para a receita (antes da migração).
export async function operacoesDoDia(corretora: Corretora, dia: string): Promise<OperacaoDia[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'operacoes_dia', { p_corretora: corretora, p_data: dia }), r => ({
    id: String(r.id), conta: str(r.conta), cliente_id: str(r.cliente_id), cliente_nome: String(r.cliente_nome ?? 'Não cadastrado'),
    nao_cadastrado: bool(r.nao_cadastrado), assessor_nome: str(r.assessor_nome), ativo: str(r.ativo), produto: str(r.produto), modo: str(r.modo),
    plataforma: str(r.plataforma), tipo: (str(r.tipo) ?? 'lote') as OperacaoDia['tipo'], qtd: num(r.qtd), tarifa: num(r.tarifa),
    tarifa_manual: r.tarifa_manual == null ? null : num(r.tarifa_manual), tarifa_padrao: num(r.tarifa_padrao), zeragem_rs: num(r.zeragem_rs),
    conta_para_receita: bool(r.conta_para_receita), receita: num(r.receita),
  }))
}

// ── Comissão de parceiros (S39) ───────────────────────────────────────────────
// Antes da S39 rodar, tudo aqui devolve vazio em vez de quebrar a tela.
const semS39 = (e: { message: string } | null) => !!e && (funcaoAusente(e) || /comissionado|comissao_/i.test(e.message))

export async function parceirosComissionados(): Promise<string[]> {
  const { db } = await equipe()
  const { data, error } = await db.from('responsaveis').select('nome').eq('comissionado', true).eq('ativo', true).order('nome')
  if (error) { if (semS39(error)) return []; falha(error, 'responsaveis') }
  return ((data ?? []) as Row[]).map(r => String(r.nome))
}

// Parceiros da tela Comissões e do extrato: quem é comissionado (Parâmetros › Responsáveis) mais quem
// aparece no campo Parceiro da ficha dos clientes e nos assessores (S40). Agrupado sem acento nem caixa,
// como o banco casa (norm_texto); a grafia mostrada é a mais usada nas fichas. Comissionados primeiro,
// depois em ordem alfabética (o campo mistura parceiros e origens, como "Direto" e "Indicação").
// As fontes que ainda não existem no banco são ignoradas.
export async function parceirosLista(): Promise<Parceiro[]> {
  const { db } = await equipe()
  const [resp, fichas, ass] = await Promise.all([
    db.from('responsaveis').select('nome').eq('comissionado', true).eq('ativo', true),
    db.from('cliente_corretora').select('parceiro').not('parceiro', 'is', null).range(0, PAGINA - 1),
    db.from('assessores').select('parceiro').not('parceiro', 'is', null),
  ])
  type Acum = { nome: string; comissionado: boolean; clientes: number; grafias: Map<string, number> }
  const porNorm = new Map<string, Acum>()
  const entrada = (nome: string | null, comissionado: boolean, ficha: boolean) => {
    const n = (nome ?? '').trim()
    if (!n) return
    const k = normTexto(n)
    let p = porNorm.get(k)
    if (!p) { p = { nome: n, comissionado: false, clientes: 0, grafias: new Map() }; porNorm.set(k, p) }
    if (comissionado) { p.comissionado = true; p.nome = n }
    if (ficha) { p.clientes++; p.grafias.set(n, (p.grafias.get(n) ?? 0) + 1) }
  }
  for (const r of (resp.error ? [] : resp.data ?? []) as Row[]) entrada(str(r.nome), true, false)
  for (const r of (fichas.error ? [] : fichas.data ?? []) as Row[]) entrada(str(r.parceiro), false, true)
  for (const r of (ass.error ? [] : ass.data ?? []) as Row[]) entrada(str(r.parceiro), false, false)
  return [...porNorm.values()]
    .map(p => ({ nome: p.comissionado ? p.nome : ([...p.grafias.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? p.nome), comissionado: p.comissionado, clientes: p.clientes }))
    .sort((a, b) => Number(b.comissionado) - Number(a.comissionado) || a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
}

export async function comissaoItens(parceiro: string, corretora: Corretora | null): Promise<ComissaoItem[]> {
  const { db } = await equipe()
  try {
    return linhas(await rpc(db, 'comissao_itens', { p_parceiro: parceiro, p_corretora: corretora }), r => ({
      cliente_id: String(r.cliente_id), nome: String(r.nome ?? ''), corretora: String(r.corretora ?? ''), origem: (r.origem === 'parceiro' || r.origem === 'assessor' || r.origem === 'responsavel' ? r.origem : 'lead') as ComissaoItem['origem'], assessor_nome: str(r.assessor_nome),
      data_lead: str(r.data_lead), status: String(r.status ?? ''), data_abertura: str(r.data_abertura), data_ativacao: str(r.data_ativacao),
      prazo_dias: num(r.prazo_dias), limite_ativacao: str(r.limite_ativacao), ativou_no_prazo: bool(r.ativou_no_prazo),
      mes_abertura: str(r.mes_abertura), mes_ativacao: str(r.mes_ativacao), valor_abertura: num(r.valor_abertura), valor_ativacao: num(r.valor_ativacao),
      situacao: String(r.situacao ?? ''), reativacoes: num(r.reativacoes), ultima_reativacao: str(r.ultima_reativacao),
    }))
  } catch (e) {
    if (e instanceof Error && semS39({ message: e.message })) return []
    throw e
  }
}

export async function comissaoMensal(mesRef: string, meses: number, parceiro: string | null, corretora: Corretora | null): Promise<ComissaoMensalRow[]> {
  const { db } = await equipe()
  try {
    return linhas(await rpc(db, 'comissao_mensal', { p_mes_ref: mesRef, p_meses: meses, p_parceiro: parceiro, p_corretora: corretora }), r => ({
      mes_ref: String(r.mes_ref), parceiro: String(r.parceiro ?? ''), corretora: String(r.corretora ?? ''),
      aberturas: num(r.aberturas), ativacoes: num(r.ativacoes), reativacoes: num(r.reativacoes), valor_abertura: num(r.valor_abertura), valor_ativacao: num(r.valor_ativacao),
      contas_mes: num(r.contas_mes), receita_contas: num(r.receita_contas), receita_carteira: num(r.receita_carteira),
    }))
  } catch (e) {
    if (e instanceof Error && semS39({ message: e.message })) return []
    throw e
  }
}

// Eventos dos últimos N meses até mesRef, um por linha, com a receita bruta da conta (S43)
export async function comissaoContasMes(parceiro: string, corretora: Corretora | null, mesRef: string, meses: number): Promise<ComissaoContaMes[]> {
  const { db } = await equipe()
  try {
    return linhas(await rpc(db, 'comissao_contas_mes', { p_parceiro: parceiro, p_corretora: corretora, p_mes_ref: mesRef, p_meses: meses }), r => ({
      mes_ref: String(r.mes_ref), cliente_id: String(r.cliente_id), nome: String(r.nome ?? ''), corretora: String(r.corretora ?? ''),
      origem: (r.origem === 'parceiro' || r.origem === 'assessor' || r.origem === 'responsavel' ? r.origem : 'lead') as ComissaoItem['origem'], assessor_nome: str(r.assessor_nome),
      tipo: (r.tipo === 'abertura' || r.tipo === 'reativacao' ? r.tipo : 'ativacao') as ComissaoContaMes['tipo'], data: String(r.data ?? ''), valor: num(r.valor),
      lotes_mes: num(r.lotes_mes), receita_mes: num(r.receita_mes), receita_desde: num(r.receita_desde),
    }))
  } catch (e) {
    if (e instanceof Error && semS39({ message: e.message })) return []
    throw e
  }
}

export async function comissaoPagamentos(parceiro: string): Promise<ComissaoPagamento[]> {
  const { db } = await equipe()
  const { data, error } = await db.from('comissao_pagamentos').select('*').eq('parceiro', parceiro).order('mes_ref', { ascending: false }).order('data_pagamento', { ascending: false })
  if (error) { if (semS39(error)) return []; falha(error, 'comissao_pagamentos') }
  return ((data ?? []) as Row[]).map(r => ({
    id: String(r.id), parceiro: String(r.parceiro), corretora: str(r.corretora), mes_ref: String(r.mes_ref), valor: num(r.valor),
    data_pagamento: String(r.data_pagamento), observacao: str(r.observacao), criado_por_nome: str(r.criado_por_nome),
  }))
}

// Extrato mensal do parceiro (S48): a carteira inteira com lotes e receita bruta do mês e dos 12 meses.
// Antes da S48 rodar devolve vazio (a tela avisa).
export async function comissaoCarteiraMes(parceiro: string, corretora: Corretora | null, mesRef: string): Promise<ExtratoParceiroRow[]> {
  const { db } = await equipe()
  try {
    return linhas(await rpc(db, 'comissao_carteira_mes', { p_parceiro: parceiro, p_corretora: corretora, p_mes_ref: mesRef }), r => ({
      cliente_id: String(r.cliente_id), nome: String(r.nome ?? ''), corretora: String(r.corretora ?? ''), conta: str(r.conta), status: String(r.status ?? ''),
      origem: (r.origem === 'parceiro' || r.origem === 'assessor' || r.origem === 'responsavel' ? r.origem : 'lead') as ComissaoItem['origem'], assessor_nome: str(r.assessor_nome),
      data_abertura: str(r.data_abertura), lotes_mes: num(r.lotes_mes), zerados_mes: num(r.zerados_mes), receita_mes: num(r.receita_mes),
      lotes_12m: num(r.lotes_12m), receita_12m: num(r.receita_12m), ultimo_mes_giro: str(r.ultimo_mes_giro),
    }))
  } catch (e) {
    if (e instanceof Error && semS39({ message: e.message })) return []
    throw e
  }
}

export async function comissaoRegras(parceiro: string): Promise<ComissaoRegra[]> {
  const { db } = await equipe()
  const { data, error } = await db.from('comissao_regras').select('*').eq('parceiro', parceiro).order('corretora').order('vigencia', { ascending: false })
  if (error) { if (semS39(error)) return []; falha(error, 'comissao_regras') }
  return ((data ?? []) as Row[]).map(r => ({
    id: String(r.id), parceiro: String(r.parceiro), corretora: String(r.corretora), vigencia: String(r.vigencia), prazo_ativacao_dias: num(r.prazo_ativacao_dias),
    reativacao_meses: num(r.reativacao_meses) || 4, metas_abertura: String(r.metas_abertura ?? ''), metas_ativacao: String(r.metas_ativacao ?? ''),
  }))
}
