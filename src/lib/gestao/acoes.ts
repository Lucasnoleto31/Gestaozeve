'use server'

// Escritas do controle (server actions chamadas pelos componentes de cliente).
// Importações vão em blocos (o Vercel limita o corpo da requisição a 4,5 MB).
import { revalidatePath } from 'next/cache'
import { corretoraValida, equipe, falha, num, somenteAdmin, type Admin } from './guard'
import { dataBR, type ClienteImport, type LeadImport, type LoteImport } from './planilhas'
import { lerFaixas, lerMetas, lerParticipacoes, numeroParam } from './btg'
import { CORRETORA_LABEL, CORRETORA_SLUG, temListaPropria, type Corretora } from '@/lib/corretoras'
import { normTexto } from '@/lib/texto'
import { buscarClientes, lotesNoPeriodo } from './consultas'
import { esquecerMesReferencia } from './pagina'
import type { LeadCampos, Resultado } from './tipos'

type Row = Record<string, unknown>

async function tentar<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, dados: await fn() }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro inesperado' }
  }
}

function revalidarCorretora(corretora: Corretora) {
  esquecerMesReferencia(corretora)
  revalidatePath(`/${CORRETORA_SLUG[corretora]}`, 'layout')
  revalidatePath('/dashboard')
}

async function recalcular(db: Admin, corretora: Corretora) {
  const { error } = await db.rpc('recalcular_lotes', { p_corretora: corretora, p_importacao_id: null })
  if (error) falha(error, 'recalcular_lotes')
}

// ── Importação de clientes ─────────────────────────────────────────────────
export async function importarClientes(corretoraIn: string, nomeArquivo: string, linhas: ClienteImport[]) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db, profile } = await somenteAdmin()
    const tot = { clientesNovos: 0, contasNovas: 0, contasAtualizadas: 0, semConta: 0, porCpf: 0, porConta: 0, porTelefone: 0, porNome: 0 }
    for (let i = 0; i < linhas.length; i += 1000) {
      const bloco = linhas.slice(i, i + 1000)
      const { data, error } = await db.rpc('importar_clientes', { p_corretora: corretora, p_linhas: bloco })
      if (error) falha(error, 'importar_clientes')
      const r = ((data ?? []) as Row[])[0] ?? {}
      tot.clientesNovos += num(r.clientes_novos); tot.contasNovas += num(r.contas_novas); tot.contasAtualizadas += num(r.contas_atualizadas)
      tot.semConta += num(r.sem_conta); tot.porCpf += num(r.por_cpf); tot.porConta += num(r.por_conta); tot.porTelefone += num(r.por_telefone); tot.porNome += num(r.por_nome)
    }
    const { error } = await db.from('importacoes').insert({
      corretora, tipo: 'clientes', nome_arquivo: nomeArquivo, linhas: linhas.length, linhas_novas: tot.contasNovas, linhas_ignoradas: 0,
      detalhes: {
        clientes_novos: tot.clientesNovos, contas_atualizadas: tot.contasAtualizadas, sem_conta: tot.semConta,
        por_cpf: tot.porCpf, por_conta: tot.porConta, por_telefone: tot.porTelefone, por_nome: tot.porNome,
      },
      criado_por: profile.user_id, criado_por_nome: profile.nome,
    })
    if (error) falha(error, 'importacoes')
    revalidarCorretora(corretora)
    return { linhas: linhas.length, ...tot }
  })
}

// ── Importação de lotes (em blocos) ────────────────────────────────────────
// Antes de importar: o que já existe no período do arquivo
export async function prepararLotes(corretoraIn: string, dataMin: string, dataMax: string) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    await somenteAdmin()
    return lotesNoPeriodo(corretora, dataMin, dataMax)
  })
}

export async function iniciarImportacaoLotes(corretoraIn: string, nomeArquivo: string, dataMin: string, dataMax: string, modo: 'substituir' | 'acrescentar') {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db, profile } = await somenteAdmin()
    let removidas = 0
    if (modo === 'substituir') {
      const { count, error } = await db.from('lotes').delete({ count: 'exact' }).eq('corretora', corretora).gte('data', dataMin).lte('data', dataMax)
      if (error) falha(error, 'lotes')
      removidas = count ?? 0
    }
    const { data, error } = await db.from('importacoes').insert({
      corretora, tipo: 'lotes', nome_arquivo: nomeArquivo, data_min: dataMin, data_max: dataMax,
      detalhes: { modo, removidas, status: 'em andamento' }, criado_por: profile.user_id, criado_por_nome: profile.nome,
    }).select('id').single()
    if (error) falha(error, 'importacoes')
    return { importacaoId: String((data as Row).id), removidas }
  })
}

export async function enviarLotes(corretoraIn: string, importacaoId: string, linhas: LoteImport[]) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const { data, error } = await db.rpc('importar_lotes', { p_corretora: corretora, p_importacao_id: importacaoId, p_linhas: linhas })
    if (error) falha(error, 'importar_lotes')
    return { inseridas: num(data) }
  })
}

export async function concluirImportacaoLotes(corretoraIn: string, importacaoId: string, totais: { linhas: number; inseridas: number; operados: number; zerados: number }) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const { data: atual } = await db.from('importacoes').select('detalhes').eq('id', importacaoId).maybeSingle()
    const detalhes = { ...(((atual as Row | null)?.detalhes as Row | null) ?? {}), status: 'concluída', operados: totais.operados, zerados: totais.zerados }
    const { error } = await db.from('importacoes').update({ linhas: totais.linhas, linhas_novas: totais.inseridas, detalhes }).eq('id', importacaoId)
    if (error) falha(error, 'importacoes')
    revalidarCorretora(corretora)
    return { ok: true }
  })
}

export async function cancelarImportacaoLotes(corretoraIn: string, importacaoId: string) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    // ON DELETE CASCADE apaga os lotes do bloco que já tinha entrado
    const { error } = await db.from('importacoes').delete().eq('id', importacaoId)
    if (error) falha(error, 'importacoes')
    revalidarCorretora(corretora)
    return { ok: true }
  })
}

// Desfaz uma importação de lotes concluída (apaga os lotes dela)
export async function desfazerImportacao(corretoraIn: string, importacaoId: string) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const { data, error: e1 } = await db.from('importacoes').select('tipo, corretora').eq('id', importacaoId).maybeSingle()
    if (e1) falha(e1, 'importacoes')
    const imp = data as Row | null
    if (!imp || imp.corretora !== corretora) throw new Error('Importação não encontrada')
    if (imp.tipo !== 'lotes') throw new Error('Só importações de lotes podem ser desfeitas (clientes e leads são atualizações de cadastro)')
    const { error } = await db.from('importacoes').delete().eq('id', importacaoId)
    if (error) falha(error, 'importacoes')
    revalidarCorretora(corretora)
    return { ok: true }
  })
}

// ── Importação de leads ────────────────────────────────────────────────────
export async function importarLeads(nomeArquivo: string, linhas: LeadImport[]) {
  return tentar(async () => {
    const { db, profile } = await somenteAdmin()
    const { data: imp, error: e0 } = await db.from('importacoes').insert({
      corretora: 'GERAL', tipo: 'leads', nome_arquivo: nomeArquivo, linhas: linhas.length, criado_por: profile.user_id, criado_por_nome: profile.nome,
    }).select('id').single()
    if (e0) falha(e0, 'importacoes')
    const id = String((imp as Row).id)
    let novos = 0, atualizados = 0
    for (let i = 0; i < linhas.length; i += 1000) {
      const { data, error } = await db.rpc('importar_leads', { p_importacao_id: id, p_linhas: linhas.slice(i, i + 1000) })
      if (error) falha(error, 'importar_leads')
      const r = ((data ?? []) as Row[])[0] ?? {}
      novos += num(r.novos); atualizados += num(r.atualizados)
    }
    await db.from('importacoes').update({ linhas_novas: novos, linhas_ignoradas: linhas.length - novos, detalhes: { atualizados } }).eq('id', id)
    revalidatePath('/leads', 'layout')
    revalidatePath('/funil')
    return { linhas: linhas.length, novos, atualizados }
  })
}

// ── Cliente: campos manuais, tarifas, cadastro ─────────────────────────────
// Campos manuais do cliente na corretora. Status manual vale sobre o status da conta
// (vazio = automático); responsável muda também o "assessor" dos lotes que herdaram o anterior.
export async function salvarCamposCliente(corretoraIn: string, clienteId: string, campos: {
  data_entrada: string | null; parceiro: string | null; observacoes: string | null; motivo_recusa: string | null
  status?: string | null; responsavel?: string | null; data_migracao?: string | null
}) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await equipe()
    const limpo = (v: string | null | undefined) => (v && v.trim() !== '' ? v.trim() : null)
    const status = limpo(campos.status)
    if (status && !['Migrado', 'Em processamento', 'Recusou'].includes(status)) throw new Error('Status inválido')
    const dataMigracao = limpo(campos.data_migracao)
    if (dataMigracao && !/^\d{4}-\d{2}-\d{2}$/.test(dataMigracao)) throw new Error('Data de migração inválida')
    const responsavel = limpo(campos.responsavel)

    const { data: atual } = await db.from('cliente_corretora').select('responsavel').eq('cliente_id', clienteId).eq('corretora', corretora).maybeSingle()
    const responsavelAntigo = ((atual as Row | null)?.responsavel as string | null) ?? null

    const { error } = await db.from('cliente_corretora').upsert({
      cliente_id: clienteId, corretora,
      data_entrada: limpo(campos.data_entrada), parceiro: limpo(campos.parceiro), observacoes: limpo(campos.observacoes), motivo_recusa: limpo(campos.motivo_recusa),
      status, responsavel, data_migracao: dataMigracao,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'cliente_id,corretora' })
    if (error) falha(error, 'cliente_corretora')

    // Lotes sem assessor da corretora (BTG) seguem o responsável: troca quem herdou o antigo
    if (responsavel && responsavel !== responsavelAntigo) {
      const novo = { assessor_nome: responsavel, assessor_norm: normTexto(responsavel) }
      const base = () => db.from('lotes').update(novo).eq('corretora', corretora).eq('cliente_id', clienteId)
      const r1 = await base().is('assessor_nome', null)
      if (r1.error) falha(r1.error, 'lotes')
      if (responsavelAntigo) {
        const r2 = await base().eq('assessor_nome', responsavelAntigo)
        if (r2.error) falha(r2.error, 'lotes')
      }
      await recalcular(db, corretora)
    }
    revalidarCorretora(corretora)
    return { ok: true }
  })
}

// Cadastro manual de um cliente na corretora (lista própria, ex.: BTG). Passa pela mesma rotina
// da importação: quem já existe (CPF, conta, telefone ou nome único) é completado, não duplicado.
export async function criarCliente(corretoraIn: string, campos: {
  nome: string; documento: string | null; telefone: string | null; email: string | null
  status: string | null; responsavel: string | null; parceiro: string | null; corretagem: number | null
  data_entrada: string | null; data_migracao: string | null; conta: string | null; observacoes: string | null; motivo_recusa: string | null
}) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await equipe()
    const limpo = (v: string | null | undefined) => (v && v.trim() !== '' ? v.trim() : null)
    const nome = limpo(campos.nome)
    if (!nome) throw new Error('Informe o nome do cliente')
    const documento = limpo(campos.documento)?.replace(/\D/g, '') || null
    if (documento && documento.length !== 11 && documento.length !== 14) throw new Error('CPF tem 11 dígitos e CNPJ tem 14')
    const status = limpo(campos.status) ?? 'Em processamento'
    if (!['Migrado', 'Em processamento', 'Recusou'].includes(status)) throw new Error('Status inválido')
    const data = (v: string | null | undefined, rotulo: string) => {
      const d = limpo(v)
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`${rotulo} inválida`)
      return d
    }
    const dataEntrada = data(campos.data_entrada, 'Data de entrada')
    const dataMigracao = data(campos.data_migracao, 'Data de migração')
    if (campos.corretagem != null && (!Number.isFinite(campos.corretagem) || campos.corretagem < 0)) throw new Error('Corretagem inválida')
    const conta = limpo(campos.conta)?.replace(/\D/g, '') || null

    const linha: ClienteImport = {
      conta: conta ?? '', conta_digito: '', id_conta: '', id_cliente: '', nome, documento: documento ?? '', assessor: '', filial: '', situacao_conta: '',
      tipo_pessoa: documento ? (documento.length === 14 ? 'J' : 'F') : '', sexo: '', estado_civil: '', uf: '', profissao: '', rendimentos: null, patrimonio: null,
      email: limpo(campos.email)?.toLowerCase() ?? '', telefone: limpo(campos.telefone) ?? '', perfil: '', perfil_suitability: '', dt_nascimento: null,
      data_habilitacao: dataMigracao, soma_total: null, id_assessor: '', dt_partition: null,
      data_entrada: dataEntrada, parceiro: limpo(campos.parceiro) ?? '', observacoes: limpo(campos.observacoes) ?? '', motivo_recusa: limpo(campos.motivo_recusa) ?? '',
      status, responsavel: limpo(campos.responsavel) ?? '', corretagem: campos.corretagem,
    }
    const { data: res, error } = await db.rpc('importar_clientes', { p_corretora: corretora, p_linhas: [linha] })
    if (error) falha(error, 'importar_clientes')
    const r = ((res ?? []) as Row[])[0] ?? {}
    const novo = num(r.clientes_novos) > 0
    const casadoPor = num(r.por_cpf) ? 'CPF/CNPJ' : num(r.por_conta) ? 'conta' : num(r.por_telefone) ? 'telefone' : num(r.por_nome) ? 'nome' : null

    // Acha o cliente para abrir a ficha: pelo CPF ou pelo nome (preferindo quem tem ficha nesta corretora)
    let clienteId: string | null = null
    if (documento) {
      const { data: c } = await db.from('clientes').select('id').eq('documento', documento).maybeSingle()
      clienteId = c ? String((c as Row).id) : null
    }
    if (!clienteId) {
      const { data: cs } = await db.from('clientes').select('id').eq('nome_norm', normTexto(nome)).limit(20)
      const ids = ((cs ?? []) as Row[]).map(x => String(x.id))
      if (ids.length) {
        const { data: cc } = await db.from('cliente_corretora').select('cliente_id').eq('corretora', corretora).in('cliente_id', ids).limit(1)
        clienteId = cc && cc.length ? String((cc[0] as Row).cliente_id) : ids[0]
      }
    }
    revalidarCorretora(corretora)
    return { clienteId, novo, casadoPor }
  })
}

// Remove o cliente da corretora (só onde a lista é nossa, ex.: BTG): ficha, contas, tarifas e o
// vínculo dos lotes, que ficam como "não cadastrados". Se ele não existir em outra corretora,
// o cadastro básico também sai (leads ligados a ele ficam sem vínculo).
export async function excluirClienteDaCorretora(corretoraIn: string, clienteId: string) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    if (!temListaPropria(corretora)) throw new Error(`Na ${CORRETORA_LABEL[corretora]} o cadastro vem do export da corretora e não pode ser excluído à mão`)
    if (!/^[0-9a-f-]{36}$/i.test(clienteId)) throw new Error('Cliente inválido')
    const passo = async (p: PromiseLike<{ error: { message: string } | null }>, contexto: string) => {
      const { error } = await p
      if (error) falha(error, contexto)
    }
    await passo(db.from('lotes').update({ cliente_id: null, conta_id: null }).eq('corretora', corretora).eq('cliente_id', clienteId), 'lotes')
    await passo(db.from('contas').delete().eq('corretora', corretora).eq('cliente_id', clienteId), 'contas')
    await passo(db.from('tarifas_cliente').delete().eq('corretora', corretora).eq('cliente_id', clienteId), 'tarifas_cliente')
    await passo(db.from('cliente_corretora').delete().eq('corretora', corretora).eq('cliente_id', clienteId), 'cliente_corretora')

    // Ainda existe em outra corretora? Senão, sai do cadastro básico também
    const [c1, c2, c3] = await Promise.all([
      db.from('contas').select('id', { count: 'exact', head: true }).eq('cliente_id', clienteId),
      db.from('cliente_corretora').select('cliente_id', { count: 'exact', head: true }).eq('cliente_id', clienteId),
      db.from('lotes').select('id', { count: 'exact', head: true }).eq('cliente_id', clienteId),
    ])
    const emOutras = (c1.count ?? 0) + (c2.count ?? 0) + (c3.count ?? 0)
    if (emOutras === 0) await passo(db.from('clientes').delete().eq('id', clienteId), 'clientes')

    await recalcular(db, corretora)
    revalidarCorretora(corretora)
    return { cadastroRemovido: emOutras === 0 }
  })
}

export async function salvarCadastroCliente(clienteId: string, campos: { nome: string; documento: string | null; telefone: string | null; email: string | null }) {
  return tentar(async () => {
    const { db } = await somenteAdmin()
    const nome = campos.nome.trim()
    if (!nome) throw new Error('Informe o nome')
    const documento = campos.documento ? campos.documento.replace(/\D/g, '') || null : null
    const telefone = campos.telefone?.trim() || null
    const { error } = await db.from('clientes').update({
      nome, nome_norm: normTexto(nome), documento, telefone, telefone_digits: telefone ? telefone.replace(/\D/g, '') || null : null,
      email: campos.email?.trim().toLowerCase() || null, updated_at: new Date().toISOString(),
    }).eq('id', clienteId)
    if (error) falha(error, 'clientes')
    for (const c of ['GENIAL', 'XP', 'BTG'] as Corretora[]) revalidarCorretora(c)
    return { ok: true }
  })
}

export async function salvarTarifa(corretoraIn: string, clienteId: string, tarifa: { id?: string | null; vigencia: string; corretagem: number; observacao: string | null }) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarifa.vigencia)) throw new Error('Vigência inválida')
    if (!Number.isFinite(tarifa.corretagem) || tarifa.corretagem < 0) throw new Error('Corretagem inválida')
    const registro = { corretora, cliente_id: clienteId, vigencia: tarifa.vigencia, corretagem: tarifa.corretagem, observacao: tarifa.observacao?.trim() || null }
    const { error } = tarifa.id
      ? await db.from('tarifas_cliente').update(registro).eq('id', tarifa.id)
      : await db.from('tarifas_cliente').upsert(registro, { onConflict: 'corretora,cliente_id,vigencia' })
    if (error) falha(error, 'tarifas_cliente')
    await recalcular(db, corretora)
    revalidarCorretora(corretora)
    return { ok: true }
  })
}

export async function excluirTarifa(corretoraIn: string, tarifaId: string) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const { error } = await db.from('tarifas_cliente').delete().eq('id', tarifaId).eq('corretora', corretora)
    if (error) falha(error, 'tarifas_cliente')
    await recalcular(db, corretora)
    revalidarCorretora(corretora)
    return { ok: true }
  })
}

// Liga uma conta de lotes não cadastrada a um cliente existente (cria a conta no cadastro)
export async function vincularContaNaoCadastrada(corretoraIn: string, conta: string, clienteId: string) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const { data: l } = await db.from('lotes').select('assessor_nome, assessor_norm, id_assessor, filial, id_cliente').eq('corretora', corretora).eq('conta', conta).limit(1).maybeSingle()
    const lote = (l as Row | null) ?? {}
    const { error } = await db.from('contas').upsert({
      corretora, conta, cliente_id: clienteId, assessor_nome: lote.assessor_nome ?? null, assessor_norm: lote.assessor_norm ?? null,
      id_assessor: lote.id_assessor ?? null, filial: lote.filial ?? null, id_cliente: lote.id_cliente ?? null, updated_at: new Date().toISOString(),
    }, { onConflict: 'corretora,conta' })
    if (error) falha(error, 'contas')
    for (const fn of ['marcar_contas_principais', 'vincular_lotes', 'recalcular_lotes'] as const) {
      const args: Record<string, unknown> = fn === 'marcar_contas_principais' ? { p_corretora: corretora } : { p_corretora: corretora, p_importacao_id: null }
      const { error: e } = await db.rpc(fn, args)
      if (e) falha(e, fn)
    }
    revalidarCorretora(corretora)
    return { ok: true }
  })
}

// ── Leads ──────────────────────────────────────────────────────────────────
function leadRegistro(c: LeadCampos) {
  const limpo = (v: string | null | undefined) => (v && v.trim() !== '' ? v.trim() : null)
  const whatsapp = limpo(c.whatsapp), cpf = limpo(c.cpf)
  return {
    nome: c.nome.trim(), whatsapp, whatsapp_digits: whatsapp ? whatsapp.replace(/\D/g, '') || null : null,
    cpf, cpf_digits: cpf ? cpf.replace(/\D/g, '') || null : null, email: limpo(c.email)?.toLowerCase() ?? null,
    ja_opera: limpo(c.ja_opera), corretora: limpo(c.corretora), origem: limpo(c.origem), responsavel: limpo(c.responsavel),
    status: limpo(c.status) ?? 'Novo', ultimo_contato: limpo(c.ultimo_contato), data_fechamento: limpo(c.data_fechamento),
    motivo_perda: limpo(c.motivo_perda), observacoes: limpo(c.observacoes), updated_at: new Date().toISOString(),
  }
}

export async function salvarLead(leadId: string | null, campos: LeadCampos) {
  return tentar(async () => {
    const { db, profile } = await equipe()
    if (!campos.nome.trim()) throw new Error('Informe o nome do lead')
    const registro = leadRegistro(campos)
    if (leadId) {
      const { error } = await db.from('leads').update(registro).eq('id', leadId)
      if (error) falha(error, 'leads')
    } else {
      const { error } = await db.from('leads').insert({ ...registro, criado_por: profile.user_id })
      if (error) falha(error, 'leads')
    }
    const { error: e2 } = await db.rpc('vincular_leads')
    if (e2) falha(e2, 'vincular_leads')
    revalidatePath('/leads', 'layout')
    revalidatePath('/funil')
    return { ok: true }
  })
}

export async function excluirLead(leadId: string) {
  return tentar(async () => {
    const { db } = await somenteAdmin()
    const { error } = await db.from('leads').delete().eq('id', leadId)
    if (error) falha(error, 'leads')
    revalidatePath('/leads', 'layout')
    revalidatePath('/funil')
    return { ok: true }
  })
}

// Registra um contato hoje (atalho da lista)
export async function registrarContatoLead(leadId: string, status?: string) {
  return tentar(async () => {
    const { db } = await equipe()
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const patch: Record<string, unknown> = { ultimo_contato: hoje, updated_at: new Date().toISOString() }
    if (status) patch.status = status
    const { error } = await db.from('leads').update(patch).eq('id', leadId)
    if (error) falha(error, 'leads')
    revalidatePath('/leads', 'layout')
    return { ok: true }
  })
}

// ── Parâmetros ─────────────────────────────────────────────────────────────
// Valida e normaliza o valor de cada parâmetro (nomes da aba Premissas e da economia do BTG)
function validarParametro(chave: string, valor: string): string {
  const v = valor.trim()
  const numero = () => {
    const n = numeroParam(v)
    if (n == null || n < 0) throw new Error('Informe um número')
    return String(n)
  }
  switch (chave) {
    case 'zeragem_padrao': case 'meses_inativo': case 'dias_alerta_lead': case 'imposto_pct': case 'delta_pct':
      return numero()
    case 'modo_zeragem':
      if (!v) throw new Error('Informe o texto que marca a zeragem')
      return v.toUpperCase()
    case 'modelo_incentivo': {
      const m = v.toUpperCase()
      if (m !== 'PONTOS' && m !== 'ATP') throw new Error('Modelo: PONTOS ou ATP')
      return m
    }
    case 'repasse_faixas':
      if (v && lerFaixas(v).length === 0) throw new Error('Faixas no formato "a partir de:%; …", ex.: 0:75;100000:80;250000:85')
      return v
    case 'participacoes':
      if (v && lerParticipacoes(v).length === 0) throw new Error('Participações no formato "nome:%; …", ex.: Lucas:50;Artur:50')
      return v
    case 'atp_assinatura': {
      if (!v) return ''
      const d = dataBR(v)
      if (!d) throw new Error('Data no formato dd/mm/aaaa')
      return d
    }
    case 'atp_metas':
      if (v && lerMetas(v).length === 0) throw new Error('Metas no formato "prazo em meses:comissão:prêmio[:observação]; …"')
      return v
    default:
      throw new Error('Parâmetro desconhecido')
  }
}

export async function salvarParametro(corretoraIn: string, chave: string, valor: string) {
  return tentar(async () => {
    const corretora = corretoraIn === 'GERAL' ? 'GERAL' : await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const v = validarParametro(chave, valor)
    const { error } = await db.from('parametros').upsert({ corretora, chave, valor: v, updated_at: new Date().toISOString() }, { onConflict: 'corretora,chave' })
    if (error) falha(error, 'parametros')
    if (corretora !== 'GERAL') { await recalcular(db, corretora); revalidarCorretora(corretora) }
    else { revalidatePath('/leads', 'layout'); revalidatePath('/funil') }
    return { ok: true }
  })
}

export async function salvarAssessor(corretoraIn: string, a: { id?: string | null; nome: string; id_assessor: string | null; corretagem: number; tipo_zeragem: 'PADRAO' | 'FIXA'; zeragem_fixa: number; responsavel: string | null; ativo: boolean }) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const nome = a.nome.trim()
    if (!nome) throw new Error('Informe o nome do assessor')
    if (!Number.isFinite(a.corretagem) || a.corretagem < 0) throw new Error('Corretagem inválida')
    const registro = {
      corretora, nome, nome_norm: normTexto(nome), id_assessor: a.id_assessor?.trim() || null, corretagem: a.corretagem,
      tipo_zeragem: a.tipo_zeragem, zeragem_fixa: a.tipo_zeragem === 'FIXA' ? a.zeragem_fixa : 0, responsavel: a.responsavel?.trim() || null,
      ativo: a.ativo, updated_at: new Date().toISOString(),
    }
    const { error } = a.id
      ? await db.from('assessores').update(registro).eq('id', a.id)
      : await db.from('assessores').upsert(registro, { onConflict: 'corretora,nome_norm' })
    if (error) falha(error, 'assessores')
    await recalcular(db, corretora)
    revalidarCorretora(corretora)
    return { ok: true }
  })
}

export async function excluirAssessor(corretoraIn: string, id: string) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const { error } = await db.from('assessores').delete().eq('id', id).eq('corretora', corretora)
    if (error) falha(error, 'assessores')
    await recalcular(db, corretora)
    revalidarCorretora(corretora)
    return { ok: true }
  })
}

export async function salvarStatusConta(corretoraIn: string, situacao: string, status: 'Migrado' | 'Em processamento' | 'Recusou') {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const s = situacao.trim().toUpperCase()
    if (!s) throw new Error('Informe a situação')
    const { error } = await db.from('status_conta_mapa').upsert({ corretora, situacao: s, status }, { onConflict: 'corretora,situacao' })
    if (error) falha(error, 'status_conta_mapa')
    const { error: e2 } = await db.rpc('marcar_contas_principais', { p_corretora: corretora })
    if (e2) falha(e2, 'marcar_contas_principais')
    revalidarCorretora(corretora)
    return { ok: true }
  })
}

export async function excluirStatusConta(corretoraIn: string, situacao: string) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const { error } = await db.from('status_conta_mapa').delete().eq('corretora', corretora).eq('situacao', situacao)
    if (error) falha(error, 'status_conta_mapa')
    revalidarCorretora(corretora)
    return { ok: true }
  })
}

export async function salvarMultiplicador(corretoraIn: string, produto: string, pontos: number) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const p = produto.trim().toUpperCase()
    if (!p) throw new Error('Informe o produto')
    if (!Number.isFinite(pontos) || pontos < 0) throw new Error('Pontos inválidos')
    const { error } = await db.from('multiplicadores').upsert({ corretora, produto: p, pontos }, { onConflict: 'corretora,produto' })
    if (error) falha(error, 'multiplicadores')
    await recalcular(db, corretora)
    revalidarCorretora(corretora)
    return { ok: true }
  })
}

export async function excluirMultiplicador(corretoraIn: string, produto: string) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const { error } = await db.from('multiplicadores').delete().eq('corretora', corretora).eq('produto', produto)
    if (error) falha(error, 'multiplicadores')
    await recalcular(db, corretora)
    revalidarCorretora(corretora)
    return { ok: true }
  })
}

export async function salvarFaixa(corretoraIn: string, pontosMin: number, valor: number, pontosMinAnterior?: number | null) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    if (!Number.isFinite(pontosMin) || pontosMin < 0 || !Number.isFinite(valor) || valor < 0) throw new Error('Valores inválidos')
    if (pontosMinAnterior != null && pontosMinAnterior !== pontosMin) {
      await db.from('faixas_incentivo').delete().eq('corretora', corretora).eq('pontos_min', pontosMinAnterior)
    }
    const { error } = await db.from('faixas_incentivo').upsert({ corretora, pontos_min: pontosMin, valor }, { onConflict: 'corretora,pontos_min' })
    if (error) falha(error, 'faixas_incentivo')
    revalidarCorretora(corretora)
    return { ok: true }
  })
}

export async function excluirFaixa(corretoraIn: string, pontosMin: number) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const { error } = await db.from('faixas_incentivo').delete().eq('corretora', corretora).eq('pontos_min', pontosMin)
    if (error) falha(error, 'faixas_incentivo')
    revalidarCorretora(corretora)
    return { ok: true }
  })
}

export async function salvarConsolidado(corretoraIn: string, nome: string) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const n = nome.trim()
    if (!n) throw new Error('Informe o nome')
    const { error } = await db.from('consolidados').upsert({ corretora, nome: n, nome_norm: normTexto(n) }, { onConflict: 'corretora,nome_norm' })
    if (error) falha(error, 'consolidados')
    await recalcular(db, corretora)
    revalidarCorretora(corretora)
    return { ok: true }
  })
}

export async function excluirConsolidado(corretoraIn: string, nome: string) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const { error } = await db.from('consolidados').delete().eq('corretora', corretora).eq('nome_norm', normTexto(nome))
    if (error) falha(error, 'consolidados')
    await recalcular(db, corretora)
    revalidarCorretora(corretora)
    return { ok: true }
  })
}

export async function salvarStatusLead(status: string, tipo: 'Aberto' | 'Fechado', ordem: number) {
  return tentar(async () => {
    const { db } = await somenteAdmin()
    const s = status.trim()
    if (!s) throw new Error('Informe o status')
    const { error } = await db.from('status_lead').upsert({ status: s, tipo, ordem }, { onConflict: 'status' })
    if (error) falha(error, 'status_lead')
    revalidatePath('/leads', 'layout'); revalidatePath('/funil')
    return { ok: true }
  })
}

export async function excluirStatusLead(status: string) {
  return tentar(async () => {
    const { db } = await somenteAdmin()
    if (['Novo', 'Ganho', 'Perdido'].includes(status)) throw new Error('Esse status é fixo do funil')
    const { error } = await db.from('status_lead').delete().eq('status', status)
    if (error) falha(error, 'status_lead')
    revalidatePath('/leads', 'layout'); revalidatePath('/funil')
    return { ok: true }
  })
}

export async function salvarResponsavel(r: { nome: string; atende_clientes: boolean; atende_leads: boolean; ativo: boolean }) {
  return tentar(async () => {
    const { db } = await somenteAdmin()
    const nome = r.nome.trim()
    if (!nome) throw new Error('Informe o nome')
    const { error } = await db.from('responsaveis').upsert({ nome, atende_clientes: r.atende_clientes, atende_leads: r.atende_leads, ativo: r.ativo }, { onConflict: 'nome' })
    if (error) falha(error, 'responsaveis')
    revalidatePath('/', 'layout')
    return { ok: true }
  })
}

export async function excluirResponsavel(nome: string) {
  return tentar(async () => {
    const { db } = await somenteAdmin()
    const { error } = await db.from('responsaveis').delete().eq('nome', nome)
    if (error) falha(error, 'responsaveis')
    revalidatePath('/', 'layout')
    return { ok: true }
  })
}

// Recalcula tudo da corretora (botão de manutenção)
export async function recalcularTudo(corretoraIn: string) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const passos: [string, Record<string, unknown>][] = [
      ['marcar_contas_principais', { p_corretora: corretora }],
      ['vincular_lotes', { p_corretora: corretora, p_importacao_id: null }],
      ['recalcular_lotes', { p_corretora: corretora, p_importacao_id: null }],
      ['vincular_leads', {}],
    ]
    const resultado: Record<string, number> = {}
    for (const [fn, args] of passos) {
      const { data, error } = await db.rpc(fn, args)
      if (error) falha(error, fn)
      resultado[fn] = num(data)
    }
    revalidarCorretora(corretora)
    revalidatePath('/leads', 'layout')
    return resultado
  })
}

// Busca de clientes pra vincular (usada em modais)
export async function buscarClientesAction(corretoraIn: string, termo: string) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    return buscarClientes(corretora, termo)
  })
}
