'use server'

// Fechamento mensal do BTG na tela: conferir a planilha do BTG com os lotes do mês e aplicar o plano
// (corretagem manual por operação, lançamentos que faltaram e o % de comissão do mês), com desfazer.
// O que muda fica registrado numa importação protegida: o retrato das corretagens anteriores e o
// parâmetro anterior, para voltar atrás com um clique.
import { revalidatePath } from 'next/cache'
import { corretoraValida, falha, num, somenteAdmin, str, type Admin } from './guard'
import { todasAsLinhas } from './consultas'
import { esquecerMesReferencia } from './pagina'
import { CORRETORA_SLUG, temListaPropria, type Corretora } from '@/lib/corretoras'
import { lerPctMes, numeroParam } from './btg'
import { ehIso, mesCurto } from './meses'
import { normTexto } from '@/lib/texto'
import {
  cruzarFechamento, pctMesComFechamento, type ItemTarifa, type LancamentoNovo, type LinhaFechamento, type LoteSistema, type PlanoFechamento,
} from './fechamento'
import type { Resultado } from './tipos'

type Row = Record<string, unknown>
const UUID = /^[0-9a-f-]{36}$/i
const COLS_LOTE = 'id, data, cliente_id, conta, ativo, qtd, zeragem, posicao, acoes, conta_para_receita, tarifa, tarifa_manual, zeragem_rs, assessor_nome, plataforma'
type LoteLido = LoteSistema & { assessor_nome: string | null; plataforma: string | null }

async function tentar<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, dados: await fn() }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro inesperado' }
  }
}

function revalidar(corretora: Corretora) {
  esquecerMesReferencia(corretora)
  revalidatePath(`/${CORRETORA_SLUG[corretora]}`, 'layout')
  revalidatePath('/dashboard')
  revalidatePath('/comissoes')
}

const fimDoMes = (mes: string) => {
  const y = +mes.slice(0, 4), m = +mes.slice(5, 7)
  return `${mes.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}

async function corretoraDoFechamento(corretoraIn: string) {
  const corretora = await corretoraValida(corretoraIn)
  if (!temListaPropria(corretora)) throw new Error('O fechamento na tela é só do BTG')
  return corretora
}

async function lotesDoMes(db: Admin, corretora: Corretora, mes: string): Promise<LoteLido[]> {
  const rows = await todasAsLinhas<Row>((de, ate) => db.from('lotes').select(COLS_LOTE).eq('corretora', corretora).gte('data', mes).lte('data', fimDoMes(mes)).order('id').range(de, ate), 'lotes')
  return rows.map(r => ({
    id: String(r.id), data: String(r.data), cliente_id: str(r.cliente_id), conta: str(r.conta), ativo: str(r.ativo), qtd: num(r.qtd),
    zeragem: r.zeragem === true, posicao: r.posicao === true, acoes: r.acoes === true, conta_para_receita: r.conta_para_receita !== false,
    tarifa: num(r.tarifa), tarifa_manual: r.tarifa_manual == null ? null : num(r.tarifa_manual), zeragem_rs: num(r.zeragem_rs),
    assessor_nome: str(r.assessor_nome), plataforma: str(r.plataforma),
  }))
}

// Retrato curto dos lotes do mês: o plano só se aplica se nada mudou entre a conferência e o clique
function versaoDe(lotes: LoteSistema[]): string {
  let h = 0
  for (const l of [...lotes].sort((a, b) => a.id.localeCompare(b.id))) {
    const p = `${l.id}:${l.qtd}:${l.tarifa}:${l.tarifa_manual ?? ''}:${l.zeragem_rs}`
    for (let i = 0; i < p.length; i++) h = (h * 31 + p.charCodeAt(i)) | 0
  }
  return `${lotes.length}-${h}`
}

async function parametros(db: Admin, corretora: Corretora): Promise<Record<string, string>> {
  const { data, error } = await db.from('parametros').select('chave, valor').eq('corretora', corretora).in('chave', ['impostos_embutidos_pct', 'repasse_pct_mes', 'zeragem_manual'])
  if (error) falha(error, 'parametros')
  return Object.fromEntries(((data ?? []) as Row[]).map(r => [String(r.chave), String(r.valor ?? '')]))
}

async function nomesDe(db: Admin, ids: string[]): Promise<Map<string, { nome: string; documento: string | null }>> {
  const out = new Map<string, { nome: string; documento: string | null }>()
  const lista = [...new Set(ids.filter(id => UUID.test(id)))]
  for (let i = 0; i < lista.length; i += 100) {
    const { data, error } = await db.from('clientes').select('id, nome, documento').in('id', lista.slice(i, i + 100))
    if (error) falha(error, 'clientes')
    for (const r of (data ?? []) as Row[]) out.set(String(r.id), { nome: String(r.nome ?? ''), documento: str(r.documento) })
  }
  return out
}

export type Conferencia = { plano: PlanoFechamento; versao: string; pctAtual: number | null; zeragemManual: boolean; lotesNoMes: number }

// 1. Cruza a planilha (já lida no navegador) com os lotes do mês
export async function prepararFechamentoBtg(corretoraIn: string, mes: string, linhas: LinhaFechamento[]) {
  return tentar<Conferencia>(async () => {
    const corretora = await corretoraDoFechamento(corretoraIn)
    const { db } = await somenteAdmin()
    if (!ehIso(mes) || !mes.endsWith('-01')) throw new Error('Mês inválido')
    if (!Array.isArray(linhas) || linhas.length === 0) throw new Error('A planilha não tem linhas')
    if (linhas.length > 20000) throw new Error('Planilha grande demais')
    const [lotes, contasRes, tarifasRes, par] = await Promise.all([
      lotesDoMes(db, corretora, mes),
      db.from('contas').select('conta, cliente_id').eq('corretora', corretora).range(0, 9999),
      db.from('tarifas_cliente').select('cliente_id, vigencia, corretagem').eq('corretora', corretora).range(0, 9999),
      parametros(db, corretora),
    ])
    if (contasRes.error) falha(contasRes.error, 'contas')
    if (tarifasRes.error) falha(tarifasRes.error, 'tarifas_cliente')
    const contas = ((contasRes.data ?? []) as Row[]).map(r => ({ conta: String(r.conta ?? ''), cliente_id: String(r.cliente_id) }))
    const tarifas = ((tarifasRes.data ?? []) as Row[]).map(r => ({ cliente_id: String(r.cliente_id), vigencia: String(r.vigencia), corretagem: num(r.corretagem) }))
    const nomes = await nomesDe(db, [...contas.map(c => c.cliente_id), ...lotes.map(l => l.cliente_id ?? '')])
    const impostos = numeroParam(par.impostos_embutidos_pct) ?? 9.65
    const zeragemManual = (par.zeragem_manual ?? '').trim().toUpperCase() === 'SIM'
    const plano = cruzarFechamento(linhas, lotes, contas, new Map([...nomes].map(([id, c]) => [id, c.nome])), tarifas, { fator: 1 - impostos / 100, zeragemManual }, mes)
    return { plano, versao: versaoDe(lotes), pctAtual: lerPctMes(par.repasse_pct_mes)[mes.slice(0, 7)] ?? null, zeragemManual, lotesNoMes: lotes.length }
  })
}

export type AplicacaoFechamento = {
  mes: string
  origem: string                 // nome da planilha
  updates: ItemTarifa[]
  inserts: LancamentoNovo[]
  pct: number | null             // % de comissão do mês para repasse_pct_mes (null = não gravar)
  versao: string
}

const maisComum = (valores: (string | null)[]) => {
  const m = new Map<string, number>()
  for (const v of valores) if (v) m.set(v, (m.get(v) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

// 2. Aplica o plano: importação protegida com os lançamentos novos (e o retrato para desfazer),
//    corretagem manual nas operações e o % do mês em repasse_pct_mes
export async function aplicarFechamentoBtg(corretoraIn: string, dados: AplicacaoFechamento) {
  return tentar(async () => {
    const corretora = await corretoraDoFechamento(corretoraIn)
    const { db, profile } = await somenteAdmin()
    const { mes } = dados
    if (!ehIso(mes) || !mes.endsWith('-01')) throw new Error('Mês inválido')
    const updates = (dados.updates ?? []).map(u => ({ id: String(u.id), tarifa: Number(u.tarifa) }))
    if (updates.some(u => !UUID.test(u.id) || !Number.isFinite(u.tarifa) || u.tarifa < 0 || u.tarifa > 100000)) throw new Error('Corretagem inválida no plano')
    const inserts = dados.inserts ?? []
    const fim = fimDoMes(mes)
    for (const i of inserts) {
      if (!UUID.test(i.cliente_id) || !ehIso(i.data) || i.data < mes || i.data > fim || !i.ativo || !Number.isFinite(i.qtd) || i.qtd < 0 || i.qtd > 100000) throw new Error('Lançamento inválido no plano')
      if (i.tarifa_manual != null && (!Number.isFinite(i.tarifa_manual) || i.tarifa_manual < 0)) throw new Error('Lançamento inválido no plano')
    }
    if (dados.pct != null && (!Number.isFinite(dados.pct) || dados.pct < 0 || dados.pct > 100)) throw new Error('Percentual de comissão inválido')
    if (!updates.length && !inserts.length && dados.pct == null) throw new Error('Nada a aplicar')

    const [lotes, par] = await Promise.all([lotesDoMes(db, corretora, mes), parametros(db, corretora)])
    if (versaoDe(lotes) !== dados.versao) throw new Error('Os lotes do mês mudaram desde a conferência. Confira a planilha de novo antes de aplicar.')
    const porId = new Map(lotes.map(l => [l.id, l]))
    const zeragemManual = (par.zeragem_manual ?? '').trim().toUpperCase() === 'SIM'
    for (const u of updates) {
      const l = porId.get(u.id)
      if (!l) throw new Error('Uma das operações do plano não está mais no mês')
      if (l.zeragem && !zeragemManual) throw new Error('Zeragem só aceita corretagem manual depois da S60')
    }
    const antes = updates.map(u => ({ id: u.id, tarifa_manual: porId.get(u.id)!.tarifa_manual }))

    // lançamentos novos: conta, cadastro e os campos que o relatório traria
    const nomes = await nomesDe(db, inserts.map(i => i.cliente_id))
    const { data: contasData, error: eContas } = await db.from('contas').select('id, conta, cliente_id').eq('corretora', corretora).range(0, 9999)
    if (eContas) falha(eContas, 'contas')
    const contaDe = new Map(((contasData ?? []) as Row[]).map(r => [String(r.conta ?? '').replace(/^0+/, ''), { id: String(r.id), cliente_id: String(r.cliente_id) }]))
    const { data: ccData } = inserts.length ? await db.from('cliente_corretora').select('cliente_id, responsavel').eq('corretora', corretora).in('cliente_id', [...new Set(inserts.map(i => i.cliente_id))]) : { data: [] }
    const respDe = new Map(((ccData ?? []) as Row[]).map(r => [String(r.cliente_id), str(r.responsavel)]))
    const novas = inserts.map(i => {
      const ct = contaDe.get(i.conta.replace(/^0+/, ''))
      const cli = nomes.get(i.cliente_id)
      if (!ct || ct.cliente_id !== i.cliente_id || !cli) throw new Error(`Conta ${i.conta} não confere com o cadastro do cliente`)
      const doCliente = lotes.filter(l => l.cliente_id === i.cliente_id)
      const futuro = i.tipo === 'futuro'
      const mesmoTipo = doCliente.filter(l => (futuro ? !l.posicao && !l.acoes && !l.zeragem : l.posicao || l.acoes))
      const assessor = maisComum(doCliente.map(l => l.assessor_nome)) ?? respDe.get(i.cliente_id) ?? 'Artur'
      return {
        corretora, data: i.data, conta: i.conta.replace(/^0+/, ''), documento: cli.documento, nome_cliente: cli.nome,
        ativo: i.ativo.toUpperCase(), modo: futuro ? 'DAYTRADE' : 'POSIÇÃO', zeragem: false, qtd: i.qtd,
        plataforma: maisComum(mesmoTipo.map(l => l.plataforma)) ?? (futuro ? 'NELOGICA' : 'BTG_INVESTIMENTOS'),
        assessor_nome: assessor, assessor_norm: normTexto(assessor), cliente_id: i.cliente_id, conta_id: ct.id, tarifa_manual: i.tarifa_manual,
      }
    })

    // a importação protegida guarda o retrato para desfazer, mesmo sem lançamentos novos
    const { data: existentes } = await db.from('importacoes').select('id').eq('corretora', corretora).like('nome_arquivo', `Fechamento BTG ${mesCurto(mes)}%`)
    const n = (existentes ?? []).length
    const nome = `Fechamento BTG ${mesCurto(mes)} (ajuste)${n ? ` · ${n + 1}` : ''}`
    const datas = novas.map(x => x.data).sort()
    const { data: imp, error: eImp } = await db.from('importacoes').insert({
      corretora, tipo: 'lotes', nome_arquivo: nome, linhas: novas.length, linhas_novas: novas.length, linhas_ignoradas: 0,
      data_min: datas[0] ?? mes, data_max: datas[datas.length - 1] ?? fim, criado_por: profile.user_id, criado_por_nome: profile.nome, protegida: true,
      detalhes: {
        modo: 'ajuste', status: 'concluída', origem: dados.origem,
        motivo: 'fechamento mensal do BTG aplicado pela tela: corretagem paga por operação e lançamentos que faltavam',
        fechamento: { mes, origem: dados.origem, ajustadas: updates.length, inseridas: novas.length, pct: dados.pct, pct_param_antes: par.repasse_pct_mes ?? null, antes },
      },
    }).select('id').single()
    if (eImp) falha(eImp, 'importacoes')
    const importacaoId = String((imp as Row).id)
    if (novas.length) {
      const { error } = await db.from('lotes').insert(novas.map(x => ({ ...x, importacao_id: importacaoId })))
      if (error) falha(error, 'lotes')
      const { error: eV } = await db.rpc('vincular_lotes', { p_corretora: corretora, p_importacao_id: importacaoId })
      if (eV) falha(eV, 'vincular_lotes')
    }
    let ajustadas = 0
    if (updates.length) {
      const { data, error } = await db.rpc('definir_corretagem_dia', { p_corretora: corretora, p_itens: updates })
      if (error) falha(error, 'definir_corretagem_dia')
      ajustadas = num(data)
    }
    if (ajustadas === 0 && novas.length) {
      const { error } = await db.rpc('recalcular_lotes', { p_corretora: corretora, p_importacao_id: null })
      if (error) falha(error, 'recalcular_lotes')
    }
    if (dados.pct != null) {
      const valor = pctMesComFechamento(lerPctMes(par.repasse_pct_mes), mes, dados.pct)
      const { error } = await db.from('parametros').upsert({ corretora, chave: 'repasse_pct_mes', valor, updated_at: new Date().toISOString() }, { onConflict: 'corretora,chave' })
      if (error) falha(error, 'parametros')
    }
    revalidar(corretora)
    return { importacaoId, nome, ajustadas, inseridas: novas.length, pct: dados.pct }
  })
}

// 3. Desfaz um fechamento aplicado: corretagens de volta ao que eram, lançamentos novos apagados
//    (cascata da importação) e o parâmetro do % como estava
export async function desfazerFechamentoBtg(corretoraIn: string, importacaoId: string) {
  return tentar(async () => {
    const corretora = await corretoraDoFechamento(corretoraIn)
    const { db } = await somenteAdmin()
    if (!UUID.test(importacaoId)) throw new Error('Importação inválida')
    const { data, error } = await db.from('importacoes').select('id, corretora, detalhes').eq('id', importacaoId).maybeSingle()
    if (error) falha(error, 'importacoes')
    const imp = data as Row | null
    const f = ((imp?.detalhes as Row | null)?.fechamento as Row | undefined)
    if (!imp || imp.corretora !== corretora || !f) throw new Error('Esta importação não é um fechamento aplicado pela tela')
    const antes = (Array.isArray(f.antes) ? (f.antes as Row[]) : []).map(a => ({ id: String(a.id), tarifa: a.tarifa_manual == null ? null : Number(a.tarifa_manual) }))
    let ajustadas = 0
    if (antes.length) {
      const { data: ainda, error: e1 } = await db.from('lotes').select('id').eq('corretora', corretora).in('id', antes.map(a => a.id))
      if (e1) falha(e1, 'lotes')
      const ids = new Set(((ainda ?? []) as Row[]).map(r => String(r.id)))
      const itens = antes.filter(a => ids.has(a.id))
      if (itens.length) {
        const { data: n, error: e2 } = await db.rpc('definir_corretagem_dia', { p_corretora: corretora, p_itens: itens })
        if (e2) falha(e2, 'definir_corretagem_dia')
        ajustadas = num(n)
      }
    }
    const { error: eDel } = await db.from('importacoes').delete().eq('id', importacaoId)
    if (eDel) falha(eDel, 'importacoes')
    const { error: eRec } = await db.rpc('recalcular_lotes', { p_corretora: corretora, p_importacao_id: null })
    if (eRec) falha(eRec, 'recalcular_lotes')
    if (f.pct != null) {
      const anterior = f.pct_param_antes == null ? null : String(f.pct_param_antes)
      if (anterior == null || anterior.trim() === '') {
        const { error: eP } = await db.from('parametros').delete().eq('corretora', corretora).eq('chave', 'repasse_pct_mes')
        if (eP) falha(eP, 'parametros')
      } else {
        const { error: eP } = await db.from('parametros').upsert({ corretora, chave: 'repasse_pct_mes', valor: anterior, updated_at: new Date().toISOString() }, { onConflict: 'corretora,chave' })
        if (eP) falha(eP, 'parametros')
      }
    }
    revalidar(corretora)
    return { ajustadas, inseridasApagadas: num(f.inseridas) }
  })
}
