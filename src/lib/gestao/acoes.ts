'use server'

// Escritas do controle (server actions chamadas pelos componentes de cliente).
// Importações vão em blocos (o Vercel limita o corpo da requisição a 4,5 MB).
import { revalidatePath } from 'next/cache'
import { corretoraValida, equipe, falha, num, somenteAdmin, type Admin } from './guard'
import { dataBR, type ClienteImport, type LeadImport, type LoteImport } from './planilhas'
import { lerFaixas, lerMetas, lerParticipacoes, numeroParam } from './btg'
import { CORRETORA_LABEL, CORRETORA_SLUG, temListaPropria, type Corretora } from '@/lib/corretoras'
import { normTexto } from '@/lib/texto'
import { buscarClientes, funcaoAusente, lotesNoPeriodo } from './consultas'
import { esquecerMesReferencia } from './pagina'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import type { ClienteDuplicado, LeadCampos, NovoClienteCampos, Resultado } from './tipos'

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
  status?: string | null; responsavel?: string | null; data_migracao?: string | null; assessor?: string | null
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

    const registro: Record<string, unknown> = {
      cliente_id: clienteId, corretora,
      data_entrada: limpo(campos.data_entrada), parceiro: limpo(campos.parceiro), observacoes: limpo(campos.observacoes), motivo_recusa: limpo(campos.motivo_recusa),
      status, responsavel, data_migracao: dataMigracao,
      updated_at: new Date().toISOString(),
    }
    if (campos.assessor !== undefined) registro.assessor = limpo(campos.assessor)
    let { error } = await db.from('cliente_corretora').upsert(registro, { onConflict: 'cliente_id,corretora' })
    // antes da S25 a coluna assessor não existe: grava o resto mesmo assim
    if (error && 'assessor' in registro && /assessor/i.test(error.message)) {
      delete registro.assessor
      ;({ error } = await db.from('cliente_corretora').upsert(registro, { onConflict: 'cliente_id,corretora' }))
    }
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

const hojeIso = () => fmtDate(hojeBrasil())

// Cadastro manual de um cliente na corretora. Passa pela mesma rotina da importação: quem já
// existe (CPF, conta, telefone ou nome único) é completado, não duplicado. Devolve o id da ficha.
async function cadastrarCliente(db: Admin, corretora: Corretora, campos: NovoClienteCampos) {
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
    conta: conta ?? '', conta_digito: '', id_conta: '', id_cliente: '', nome, documento: documento ?? '', assessor: limpo(campos.assessor) ?? '', filial: '', situacao_conta: '',
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
  return { clienteId, novo, casadoPor }
}

export async function criarCliente(corretoraIn: string, campos: NovoClienteCampos) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await equipe()
    const r = await cadastrarCliente(db, corretora, campos)
    revalidarCorretora(corretora)
    return r
  })
}

// Lead ganho: cria (ou completa) a ficha do cliente na corretora escolhida, fecha o lead como
// Ganho hoje e liga os dois. Daí em diante os imports de lotes e clientes cruzam pelo CPF,
// telefone ou nome.
export async function converterLeadEmCliente(leadId: string, corretoraIn: string, campos: NovoClienteCampos) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await equipe()
    const { data: lead, error: e0 } = await db.from('leads').select('id, data_fechamento').eq('id', leadId).maybeSingle()
    if (e0) falha(e0, 'leads')
    if (!lead) throw new Error('Lead não encontrado')
    const r = await cadastrarCliente(db, corretora, campos)
    const patch: Record<string, unknown> = {
      status: 'Ganho', data_fechamento: (lead as Row).data_fechamento ?? hojeIso(), cliente_id: r.clienteId,
      motivo_perda: null, updated_at: new Date().toISOString(),
    }
    if (campos.responsavel?.trim()) patch.responsavel = campos.responsavel.trim()
    const { error } = await db.from('leads').update(patch).eq('id', leadId)
    if (error) falha(error, 'leads')
    revalidarCorretora(corretora)
    revalidatePath('/leads', 'layout')
    revalidatePath('/funil')
    return { ...r, corretora }
  })
}

// Lead perdido: fecha hoje com o motivo
export async function marcarLeadPerdido(leadId: string, motivo: string | null) {
  return tentar(async () => {
    const { db } = await equipe()
    const { data: lead, error: e0 } = await db.from('leads').select('id, data_fechamento').eq('id', leadId).maybeSingle()
    if (e0) falha(e0, 'leads')
    if (!lead) throw new Error('Lead não encontrado')
    const { error } = await db.from('leads').update({
      status: 'Perdido', data_fechamento: (lead as Row).data_fechamento ?? hojeIso(), motivo_perda: motivo?.trim() || null, updated_at: new Date().toISOString(),
    }).eq('id', leadId)
    if (error) falha(error, 'leads')
    revalidatePath('/leads', 'layout')
    revalidatePath('/funil')
    return { ok: true }
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

// Outro cadastro que já usa este CPF/CNPJ (a constraint clientes_documento_key impede repetir)
async function clienteComDocumento(db: Admin, documento: string, exceto: string): Promise<ClienteDuplicado | null> {
  const { data } = await db.from('clientes').select('id, nome').eq('documento', documento).neq('id', exceto).limit(1).maybeSingle()
  if (!data) return null
  const { data: vc } = await db.from('v_cliente_corretora').select('corretora').eq('cliente_id', data.id).order('corretora').limit(1).maybeSingle()
  return { id: String(data.id), nome: String(data.nome ?? ''), corretora: vc ? String(vc.corretora) : null }
}

export type ResultadoCadastro = Resultado<undefined> | { ok: false; erro: string; duplicado: ClienteDuplicado }

export async function salvarCadastroCliente(clienteId: string, campos: { nome: string; documento: string | null; telefone: string | null; email: string | null }): Promise<ResultadoCadastro> {
  const achado: { duplicado: ClienteDuplicado | null } = { duplicado: null }
  const r = await tentar(async () => {
    const { db } = await somenteAdmin()
    const nome = campos.nome.trim()
    if (!nome) throw new Error('Informe o nome')
    const documento = campos.documento ? campos.documento.replace(/\D/g, '') || null : null
    const telefone = campos.telefone?.trim() || null
    if (documento) {
      achado.duplicado = await clienteComDocumento(db, documento, clienteId)
      if (achado.duplicado) throw new Error(`Já existe outro cadastro com esse CPF/CNPJ: ${achado.duplicado.nome}. Unifique os dois cadastros ou corrija o documento.`)
    }
    const { error } = await db.from('clientes').update({
      nome, nome_norm: normTexto(nome), documento, telefone, telefone_digits: telefone ? telefone.replace(/\D/g, '') || null : null,
      email: campos.email?.trim().toLowerCase() || null, updated_at: new Date().toISOString(),
    }).eq('id', clienteId)
    if (error) {
      if (error.code === '23505') throw new Error('Já existe outro cadastro com esse CPF/CNPJ. Unifique os dois cadastros ou corrija o documento.')
      falha(error, 'clientes')
    }
    for (const c of ['GENIAL', 'XP', 'BTG'] as Corretora[]) revalidarCorretora(c)
    return undefined
  })
  return !r.ok && achado.duplicado ? { ok: false, erro: r.erro, duplicado: achado.duplicado } : r
}

// Contas do cliente na corretora, mantidas à mão na ficha (além das que os lotes e as listas criam):
// inclui as novas (ou liga as que já existiam sem dono), tira as que saíram da lista (os lotes
// delas voltam a "não cadastrados") e refaz conta principal, vínculos e tarifas dos lotes.
export async function salvarContasCliente(corretoraIn: string, clienteId: string, contas: string[]) {
  return tentar(async () => {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await equipe()
    const desejadas = [...new Set(contas.map(c => c.replace(/\D/g, '')).filter(Boolean))]
    if (desejadas.length > 10) throw new Error('No máximo 10 contas por cliente')
    const passo = async (p: PromiseLike<{ error: { message: string } | null }>, contexto: string) => {
      const { error } = await p
      if (error) falha(error, contexto)
    }
    const { data: atuaisRes, error: e1 } = await db.from('contas').select('id, conta, conta_digito').eq('corretora', corretora).eq('cliente_id', clienteId)
    if (e1) falha(e1, 'contas')
    const atuais = (atuaisRes ?? []) as { id: string; conta: string; conta_digito: string | null }[]
    const novas = desejadas.filter(n => !atuais.some(a => a.conta === n || a.conta_digito === n))
    const removidas = atuais.filter(a => !desejadas.includes(a.conta) && !(a.conta_digito && desejadas.includes(a.conta_digito)))
    if (!novas.length && !removidas.length) return { adicionadas: 0, removidas: 0 }
    // conta nova herda o assessor informado à mão ou o responsável (lista própria)
    const { data: m } = await db.from('cliente_corretora').select('assessor, responsavel').eq('cliente_id', clienteId).eq('corretora', corretora).maybeSingle()
    const mm = (m ?? {}) as Row
    const assessor = (mm.assessor ?? mm.responsavel ?? null) as string | null
    for (const n of novas) {
      const { data: ex } = await db.from('contas').select('id, cliente_id, clientes(nome)').eq('corretora', corretora).or(`conta.eq.${n},conta_digito.eq.${n}`).limit(1).maybeSingle()
      const e = ex as Row | null
      if (e && e.cliente_id && e.cliente_id !== clienteId) {
        const dono = ((e.clientes as Row | null)?.nome as string | undefined) ?? 'outro cliente'
        throw new Error(`A conta ${n} já pertence a ${dono}`)
      }
      if (e) await passo(db.from('contas').update({ cliente_id: clienteId, updated_at: new Date().toISOString() }).eq('id', e.id), 'contas')
      else await passo(db.from('contas').insert({ corretora, cliente_id: clienteId, conta: n, assessor_nome: assessor, assessor_norm: assessor ? normTexto(assessor) : null }), 'contas')
    }
    for (const a of removidas) {
      await passo(db.from('lotes').update({ cliente_id: null, conta_id: null }).eq('conta_id', a.id), 'lotes')
      await passo(db.from('contas').delete().eq('id', a.id), 'contas')
    }
    for (const [fn, args] of [
      ['marcar_contas_principais', { p_corretora: corretora }],
      ['vincular_lotes', { p_corretora: corretora, p_importacao_id: null }],
      ['recalcular_lotes', { p_corretora: corretora, p_importacao_id: null }],
    ] as [string, Record<string, unknown>][]) {
      const { error } = await db.rpc(fn, args)
      if (error) falha(error, fn)
    }
    revalidarCorretora(corretora)
    return { adicionadas: novas.length, removidas: removidas.length }
  })
}

// Junta dois cadastros da mesma pessoa (CPF/CNPJ repetido): mantém `manterId` e passa para ele
// contas, lotes, leads, campos por corretora e tarifas do outro cadastro, que é apagado (S29).
export async function unificarClientes(manterId: string, removerId: string) {
  return tentar(async () => {
    const { db } = await somenteAdmin()
    if (!manterId || !removerId || manterId === removerId) throw new Error('Escolha dois cadastros diferentes')
    const { data, error } = await db.rpc('unificar_clientes', { p_manter: manterId, p_remover: removerId })
    if (error) {
      if (funcaoAusente(error)) throw new Error('Rode o script S29 no Supabase para liberar a unificação de cadastros')
      falha(error, 'unificar_clientes')
    }
    for (const c of ['GENIAL', 'XP', 'BTG'] as Corretora[]) revalidarCorretora(c)
    revalidatePath('/leads', 'layout'); revalidatePath('/funil')
    const j = (data ?? {}) as Row
    return { contas: num(j.contas), lotes: num(j.lotes), leads: num(j.leads) }
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
    case 'zeragem_faixas':
      // mesmo formato "a partir de:valor; …" das faixas de repasse (contratos operados no mês:R$ por contrato zerado)
      if (v && lerFaixas(v).length === 0) throw new Error('Faixas no formato "contratos no mês:R$; …", ex.: 1:24,50;20:23,25;500:22;1000:20,75;5000:19,50')
      return v
    case 'zeragem_faixas_desde': {
      if (!v) return ''
      const d = dataBR(v)
      if (!d) throw new Error('Data no formato dd/mm/aaaa (ou deixe vazio para todo o histórico)')
      return d
    }
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
