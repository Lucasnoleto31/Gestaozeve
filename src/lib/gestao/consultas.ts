// Leituras do controle (só servidor: páginas e server actions). Cada função chama uma
// RPC da S19 com o client service_role e devolve linhas tipadas.
import type { Corretora } from '@/lib/corretoras'
import { equipe, falha, linhas, num, str, type Admin } from './guard'
import type {
  AssessorMensalRow, AssessorNaoCadastrado, AssessorParam, AssessorResumoRow, ClienteCadastro, ClienteMensalRow, ClienteMesRow,
  ClienteRow, Consolidado, ContaRow, DiarioRow, ExtratoRow, Faixa, FunilMensalRow, FunilPorRow, Importacao, IncentivoHistRow,
  IncentivoRow, LeadRow, LoteNaoCadastradoRow, MigracaoDiaRow, MixPlataformaRow, Multiplicador, PainelKpis, PainelMensalRow,
  Parametro, PorAtivoRow, Responsavel, SituacaoNaoMapeada, StatusContaMapa, StatusLead, TarifaCliente, TopClienteRow,
} from './tipos'

type Row = Record<string, unknown>
const bool = (v: unknown) => v === true
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])

async function rpc(db: Admin, fn: string, args: Record<string, unknown>): Promise<Row[]> {
  const { data, error } = await db.rpc(fn, args)
  if (error) falha(error, fn)
  return (data ?? []) as Row[]
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
})

// ── Clientes ───────────────────────────────────────────────────────────────
export async function clientesLista(corretora: Corretora, mesRef: string | null): Promise<ClienteRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'clientes_lista', { p_corretora: corretora, p_mes_ref: mesRef }), mapCliente)
}

export async function clienteFicha(corretora: Corretora, clienteId: string, mesRef: string | null) {
  const { db } = await equipe()
  const [lista, cad, contas, mensal, tarifas, extrato, porAtivo] = await Promise.all([
    rpc(db, 'clientes_lista', { p_corretora: corretora, p_mes_ref: mesRef, p_cliente_id: clienteId }),
    db.from('clientes').select('*').eq('id', clienteId).maybeSingle(),
    rpc(db, 'cliente_contas', { p_corretora: corretora, p_cliente_id: clienteId }),
    rpc(db, 'cliente_mensal', { p_corretora: corretora, p_cliente_id: clienteId, p_mes_ref: mesRef, p_meses: 12 }),
    db.from('tarifas_cliente').select('id, vigencia, corretagem, observacao').eq('corretora', corretora).eq('cliente_id', clienteId).order('vigencia', { ascending: false }),
    rpc(db, 'cliente_extrato', { p_corretora: corretora, p_cliente_id: clienteId, p_limit: 400 }),
    rpc(db, 'cliente_por_ativo', { p_corretora: corretora, p_cliente_id: clienteId }),
  ])
  if (cad.error) falha(cad.error, 'clientes')
  if (tarifas.error) falha(tarifas.error, 'tarifas_cliente')
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
    contas: linhas<ContaRow>(contas, r => ({
      conta_id: String(r.conta_id), conta: String(r.conta ?? ''), conta_digito: str(r.conta_digito), situacao_conta: str(r.situacao_conta),
      status: (str(r.status) ?? 'Em processamento') as ContaRow['status'], assessor_nome: str(r.assessor_nome), filial: str(r.filial),
      data_habilitacao: str(r.data_habilitacao), principal: bool(r.principal), lotes: num(r.lotes), lotes_12m: num(r.lotes_12m),
      zerados: num(r.zerados), receita: num(r.receita), ultimo_giro: str(r.ultimo_giro),
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
export async function buscarClientes(corretora: Corretora, termo: string, limite = 12): Promise<{ id: string; nome: string; documento: string | null; conta: string | null }[]> {
  const { db } = await equipe()
  const t = termo.trim()
  if (t.length < 2) return []
  const digitos = t.replace(/\D/g, '')
  if (digitos.length >= 4 && digitos.length === t.replace(/[.\-\/\s]/g, '').length) {
    const { data, error } = await db.from('contas').select('cliente_id, conta, clientes!inner(id, nome, documento)')
      .eq('corretora', corretora).or(`conta.like.${digitos}%,conta_digito.like.${digitos}%`).limit(limite)
    if (error) falha(error, 'contas')
    const porDoc = await db.from('clientes').select('id, nome, documento').like('documento', `${digitos}%`).limit(limite)
    const out = new Map<string, { id: string; nome: string; documento: string | null; conta: string | null }>()
    for (const r of (data ?? []) as Row[]) {
      const c = r.clientes as Row
      if (c) out.set(String(c.id), { id: String(c.id), nome: String(c.nome), documento: str(c.documento), conta: str(r.conta) })
    }
    for (const r of (porDoc.data ?? []) as Row[]) if (!out.has(String(r.id))) out.set(String(r.id), { id: String(r.id), nome: String(r.nome), documento: str(r.documento), conta: null })
    return [...out.values()].slice(0, limite)
  }
  const { data, error } = await db.from('contas').select('cliente_id, conta, principal, clientes!inner(id, nome, documento, nome_norm)')
    .eq('corretora', corretora).ilike('clientes.nome_norm', `%${t.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}%`).limit(limite * 3)
  if (error) falha(error, 'contas')
  const out = new Map<string, { id: string; nome: string; documento: string | null; conta: string | null }>()
  for (const r of (data ?? []) as Row[]) {
    const c = r.clientes as Row
    if (!c) continue
    const id = String(c.id)
    if (!out.has(id) || r.principal === true) out.set(id, { id, nome: String(c.nome), documento: str(c.documento), conta: str(r.conta) })
  }
  return [...out.values()].slice(0, limite)
}

// ── Painel ─────────────────────────────────────────────────────────────────
export const mapKpis = (r: Row): PainelKpis => ({
  mes_ref: String(r.mes_ref), clientes_levados: num(r.clientes_levados), total_contas: num(r.total_contas), migrados: num(r.migrados),
  em_processamento: num(r.em_processamento), recusaram: num(r.recusaram), ativos_mes: num(r.ativos_mes), lotes_mes: num(r.lotes_mes),
  zerados_mes: num(r.zerados_mes), receita_mes: num(r.receita_mes), incentivo_mes: num(r.incentivo_mes), clientes_com_faixa: num(r.clientes_com_faixa),
  migrados_sem_giro: num(r.migrados_sem_giro), inativos: num(r.inativos), com_alertas: num(r.com_alertas), migrados_sem_data: num(r.migrados_sem_data),
  multi_conta: num(r.multi_conta), linhas_nao_cadastradas: num(r.linhas_nao_cadastradas), lotes_nao_cadastrados: num(r.lotes_nao_cadastrados),
  ultima_data: str(r.ultima_data),
})

export async function painelKpis(corretora: Corretora, mesRef: string | null): Promise<PainelKpis | null> {
  const { db } = await equipe()
  const rows = await rpc(db, 'painel_kpis', { p_corretora: corretora, p_mes_ref: mesRef })
  return rows.length ? mapKpis(rows[0]) : null
}

export const mapMensal = (r: Row): PainelMensalRow => ({
  mes_ref: String(r.mes_ref), migrados_acumulados: num(r.migrados_acumulados), novas_migracoes: num(r.novas_migracoes), entradas: num(r.entradas),
  clientes_ativos: num(r.clientes_ativos), lotes: num(r.lotes), zerados: num(r.zerados), receita_corretagem: num(r.receita_corretagem),
  receita_zeragem: num(r.receita_zeragem), receita: num(r.receita), incentivo: num(r.incentivo), clientes_pontuando: num(r.clientes_pontuando),
  clientes_com_faixa: num(r.clientes_com_faixa),
})

export async function painelMensal(corretora: Corretora, mesRef: string | null, meses = 12): Promise<PainelMensalRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'painel_mensal', { p_corretora: corretora, p_mes_ref: mesRef, p_meses: meses }), mapMensal)
}

export async function painelClientesMensal(corretora: Corretora, mesRef: string | null, meses = 12): Promise<ClienteMesRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'painel_clientes_mensal', { p_corretora: corretora, p_mes_ref: mesRef, p_meses: meses }),
    r => ({ cliente_id: String(r.cliente_id), cliente_nome: String(r.cliente_nome ?? ''), responsavel: str(r.responsavel), mes_ref: String(r.mes_ref), lotes: num(r.lotes) }))
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
  dias: r.dias == null ? null : num(r.dias), alerta: bool(r.alerta),
})

export async function leadsLista(): Promise<LeadRow[]> {
  const { db } = await equipe()
  return linhas(await rpc(db, 'leads_lista', { p_corretora_opera: null }), mapLead)
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
      responsavel: str(r.responsavel), ativo: r.ativo !== false,
    })),
    statusConta: ((m.data ?? []) as Row[]).map<StatusContaMapa>(r => ({ situacao: String(r.situacao), status: String(r.status) as StatusContaMapa['status'] })),
    multiplicadores: ((mu.data ?? []) as Row[]).map<Multiplicador>(r => ({ produto: String(r.produto), pontos: num(r.pontos) })),
    faixas: ((f.data ?? []) as Row[]).map<Faixa>(r => ({ pontos_min: num(r.pontos_min), valor: num(r.valor) })),
    consolidados: ((c.data ?? []) as Row[]).map<Consolidado>(r => ({ nome: String(r.nome) })),
    statusLead: ((sl.data ?? []) as Row[]).map<StatusLead>(r => ({ status: String(r.status), tipo: String(r.tipo) as StatusLead['tipo'], ordem: num(r.ordem) })),
    responsaveis: ((rs.data ?? []) as Row[]).map<Responsavel>(r => ({ nome: String(r.nome), atende_clientes: r.atende_clientes !== false, atende_leads: r.atende_leads !== false, ativo: r.ativo !== false })),
    situacoesNaoMapeadas: linhas<SituacaoNaoMapeada>(snm, r => ({ situacao: String(r.situacao), contas: num(r.contas) })),
    assessoresNaoCadastrados: linhas<AssessorNaoCadastrado>(anc, r => ({ assessor_nome: String(r.assessor_nome ?? ''), contas: num(r.contas), lotes: num(r.lotes) })),
  }
}

export async function responsaveisAtivos(): Promise<Responsavel[]> {
  const { db } = await equipe()
  const { data, error } = await db.from('responsaveis').select('*').eq('ativo', true).order('nome')
  if (error) falha(error, 'responsaveis')
  return ((data ?? []) as Row[]).map(r => ({ nome: String(r.nome), atende_clientes: r.atende_clientes !== false, atende_leads: r.atende_leads !== false, ativo: true }))
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
