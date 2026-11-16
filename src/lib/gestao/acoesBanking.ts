'use server'

// Receitas do BTG que não são giro, gravadas pela tela (Importar): o Banking da planilha "…_DW_<mês>.xlsx"
// da Delta e os produtos fora do giro do fechamento principal (CDB, saldo remunerado, aluguel, fundos…).
// Cada mês de cada fonte é uma importação protegida, sem lotes; gravar de novo substitui e dá para tirar.
// O servidor refaz os grupos a partir das linhas: não confia nos totais que chegam da tela.
import { revalidatePath } from 'next/cache'
import { corretoraValida, falha, num, somenteAdmin, str, type Admin } from './guard'
import { CORRETORA_SLUG, temListaPropria, type Corretora } from '@/lib/corretoras'
import { ehIso, mesCurto } from './meses'
import { lerParceirosRepasse, numeroParam } from './btg'
import {
  FONTE_ROTULO, gruposDasLinhas, lerExtraGravado, somarBanking,
  type FonteExtra, type GrupoBanking, type ItemBanking, type PercentualGrupo, type TotaisBanking,
} from './banking'
import { foraDoGiro, type ForaDoGiro, type QuadroFechamento } from './foraGiro'
import { PRODUTOS_RV, type LinhaFechamento } from './fechamento'
import type { Resultado } from './tipos'
import type { Profile } from '@/types'

type Row = Record<string, unknown>
const UUID = /^[0-9a-f-]{36}$/i

async function tentar<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, dados: await fn() }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro inesperado' }
  }
}

function revalidar(corretora: Corretora) {
  revalidatePath(`/${CORRETORA_SLUG[corretora]}`, 'layout')
  revalidatePath('/dashboard')
}

const fimDoMes = (mes: string) => {
  const y = +mes.slice(0, 4), m = +mes.slice(5, 7)
  return `${mes.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}

async function corretoraDoBtg(corretoraIn: string) {
  const corretora = await corretoraValida(corretoraIn)
  if (!temListaPropria(corretora)) throw new Error('Estas receitas fora do giro são só do BTG')
  return corretora
}

const curto = (v: unknown, max = 160) => String(v ?? '').trim().slice(0, max)
const valor = (v: unknown) => {
  const n = Number(v)
  if (!Number.isFinite(n) || Math.abs(n) > 1e9) throw new Error('Valor inválido na planilha')
  return n
}
const mesValido = (mes: string) => { if (!ehIso(mes) || !mes.endsWith('-01')) throw new Error('Mês inválido') }

export type ExtraGravado = { importacaoId: string; nome: string; substituidos: number; grupos: GrupoBanking[]; total: TotaisBanking }

// Grava o mês de uma fonte numa importação protegida sem lotes; o mesmo mês da mesma fonte gravado antes sai
async function gravarExtra(db: Admin, profile: Profile, corretora: Corretora, fonte: FonteExtra, mes: string, origemIn: string, grupos: GrupoBanking[], itens: ItemBanking[], motivo: string): Promise<ExtraGravado> {
  const total = somarBanking(grupos, itens)
  const { data: antigos, error: e0 } = await db.from('importacoes').select('id, detalhes').eq('corretora', corretora).eq('protegida', true)
    .or('detalhes->banking.not.is.null,detalhes->fora_giro.not.is.null')
  if (e0) falha(e0, 'importacoes')
  const doMes = ((antigos ?? []) as Row[]).filter(r => { const x = lerExtraGravado(r.detalhes); return x?.fonte === fonte && x.dados.mes === mes }).map(r => String(r.id))

  const nome = `${FONTE_ROTULO[fonte]} BTG ${mesCurto(mes)}`
  const origem = curto(origemIn, 200) || null
  // sem período (data_min/data_max): não são lotes de dia nenhum, e o Giro diário procura a subida do dia por data_max
  const { data: imp, error: e1 } = await db.from('importacoes').insert({
    corretora, tipo: 'lotes', nome_arquivo: nome, linhas: itens.length, linhas_novas: 0, linhas_ignoradas: 0,
    criado_por: profile.user_id, criado_por_nome: profile.nome, protegida: true,
    detalhes: { modo: fonte === 'banking' ? 'banking' : 'fora do giro', status: 'concluída', origem, motivo, [fonte]: { mes, origem, grupos, total, itens } },
  }).select('id').single()
  if (e1) falha(e1, 'importacoes')
  if (doMes.length) {
    const { error: e2 } = await db.from('importacoes').delete().in('id', doMes)
    if (e2) falha(e2, 'importacoes')
  }
  revalidar(corretora)
  return { importacaoId: String((imp as Row).id), nome, substituidos: doMes.length, grupos, total }
}

// ── Banking (planilha "DW" da Delta) ───────────────────────────────────────────
export type AplicacaoBanking = {
  mes: string                    // 'YYYY-MM-01'
  origem: string                 // nome da planilha
  itens: ItemBanking[]
  percentuais: PercentualGrupo[]
}

export async function aplicarBankingBtg(corretoraIn: string, dados: AplicacaoBanking) {
  return tentar<ExtraGravado>(async () => {
    const corretora = await corretoraDoBtg(corretoraIn)
    const { db, profile } = await somenteAdmin()
    const { mes } = dados
    mesValido(mes)
    if (!Array.isArray(dados.itens) || dados.itens.length === 0) throw new Error('A planilha não tem linhas')
    if (dados.itens.length > 5000) throw new Error('Planilha grande demais')
    const fim = fimDoMes(mes)
    const percentuais = (dados.percentuais ?? []).map<PercentualGrupo>(p => ({ grupo: curto(p.grupo, 80), pctEscritorio: Number(p.pctEscritorio), impostoPct: Number(p.impostoPct) }))
    if (!percentuais.length || new Set(percentuais.map(p => p.grupo)).size !== percentuais.length) throw new Error('Grupos inválidos')
    for (const p of percentuais) {
      if (!p.grupo || !Number.isFinite(p.pctEscritorio) || p.pctEscritorio < 0 || p.pctEscritorio > 100) throw new Error(`Parte do escritório inválida em "${p.grupo}"`)
      if (!Number.isFinite(p.impostoPct) || p.impostoPct < 0 || p.impostoPct > 100) throw new Error(`Imposto inválido em "${p.grupo}"`)
    }
    const nomes = new Set(percentuais.map(p => p.grupo))
    const itens = dados.itens.map<ItemBanking>(i => {
      const grupo = curto(i.grupo, 80), data = String(i.data ?? '')
      if (!nomes.has(grupo)) throw new Error('Linha sem grupo')
      if (!ehIso(data) || data < mes || data > fim) throw new Error('Linha fora do mês')
      return {
        grupo, data, conta: curto(i.conta, 40), cliente: curto(i.cliente), categoria: curto(i.categoria), produto: curto(i.produto), ativo: curto(i.ativo), tipo: curto(i.tipo, 60),
        bruta: valor(i.bruta), liquida: valor(i.liquida), comissao: valor(i.comissao),
      }
    })
    return gravarExtra(db, profile, corretora, 'banking', mes, dados.origem, gruposDasLinhas(itens, percentuais), itens,
      'receita de Banking do mês (planilha da Delta): comissão à parte, fora dos lotes e do giro')
  })
}

// ── Produtos fora do giro do fechamento principal ──────────────────────────────
// As linhas chegam como a tela leu a planilha; aqui só entram as que não são giro, do mês, com os campos limpos
function linhasForaDoGiro(linhas: LinhaFechamento[], mes: string): LinhaFechamento[] {
  if (!Array.isArray(linhas) || linhas.length === 0) throw new Error('A planilha não tem linhas')
  if (linhas.length > 20000) throw new Error('Planilha grande demais')
  const fim = fimDoMes(mes)
  const out: LinhaFechamento[] = []
  for (const l of linhas) {
    const produto = curto(l.produto, 80).toUpperCase(), data = String(l.data ?? '')
    if (PRODUTOS_RV.includes(produto) || !ehIso(data) || data < mes || data > fim) continue
    const conta = curto(l.conta, 40)
    out.push({
      aba: curto(l.aba, 80), linha: Number(l.linha) || 0, data, conta, conta_sz: conta.replace(/\D/g, '').replace(/^0+/, ''), cliente: curto(l.cliente),
      categoria: curto(l.categoria).toUpperCase(), produto, ativo: curto(l.ativo).toUpperCase(), tipo: curto(l.tipo, 60),
      bruta: valor(l.bruta), liquida: valor(l.liquida), comissao: valor(l.comissao),
    })
  }
  return out
}

function quadroValido(q: QuadroFechamento | null | undefined): QuadroFechamento {
  const pcts = Object.entries(q?.pctPorProduto ?? {}).slice(0, 300)
  const pctPorProduto: Record<string, number> = {}
  for (const [produto, pct] of pcts) {
    const v = Number(pct)
    if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error(`Parte do escritório inválida em "${curto(produto, 80)}"`)
    pctPorProduto[curto(produto, 80).toUpperCase()] = v
  }
  const imposto = q?.impostoPct == null ? null : Number(q.impostoPct)
  if (imposto != null && (!Number.isFinite(imposto) || imposto < 0 || imposto > 100)) throw new Error('Alíquota de imposto inválida')
  return { pctPorProduto, impostoPct: imposto }
}

// Quem é cliente de parceiro com participação (pela ficha) e os percentuais dos parâmetros da corretora
async function calcularForaDoGiro(db: Admin, corretora: Corretora, mes: string, linhas: LinhaFechamento[], quadro: QuadroFechamento): Promise<ForaDoGiro> {
  const [contas, fichas, par] = await Promise.all([
    db.from('contas').select('conta, cliente_id').eq('corretora', corretora).range(0, 9999),
    db.from('cliente_corretora').select('cliente_id, parceiro').eq('corretora', corretora).not('parceiro', 'is', null).range(0, 9999),
    db.from('parametros').select('chave, valor').eq('corretora', corretora).in('chave', ['delta_pct', 'imposto_pct', 'repasse_parceiros']),
  ])
  if (contas.error) falha(contas.error, 'contas')
  if (fichas.error) falha(fichas.error, 'cliente_corretora')
  if (par.error) falha(par.error, 'parametros')
  const p = Object.fromEntries(((par.data ?? []) as Row[]).map(r => [String(r.chave), String(r.valor ?? '')]))
  return foraDoGiro(linhasForaDoGiro(linhas, mes), mes, {
    contaParaCliente: new Map(((contas.data ?? []) as Row[]).map(r => [String(r.conta ?? '').replace(/\D/g, '').replace(/^0+/, ''), String(r.cliente_id)])),
    parceiroDoCliente: new Map(((fichas.data ?? []) as Row[]).map(r => [String(r.cliente_id), String(r.parceiro ?? '')])),
    parceiros: lerParceirosRepasse(p.repasse_parceiros), deltaPct: numeroParam(p.delta_pct) ?? 0, impostoPct: numeroParam(p.imposto_pct) ?? 0,
    quadro: quadroValido(quadro),
  })
}

export type ForaGiroConferido = ForaDoGiro & { gravado: { liquida: number; origem: string | null; quando: string } | null }

// 1. O que a planilha do fechamento traz fora do giro, já com a parte do escritório, e o que está gravado para o mês
export async function prepararForaDoGiroBtg(corretoraIn: string, mes: string, linhas: LinhaFechamento[], quadro: QuadroFechamento) {
  return tentar<ForaGiroConferido>(async () => {
    const corretora = await corretoraDoBtg(corretoraIn)
    const { db } = await somenteAdmin()
    mesValido(mes)
    const [fora, gravados] = await Promise.all([
      calcularForaDoGiro(db, corretora, mes, linhas, quadro),
      db.from('importacoes').select('created_at, detalhes').eq('corretora', corretora).eq('protegida', true).not('detalhes->fora_giro', 'is', null).order('created_at', { ascending: false }),
    ])
    if (gravados.error) falha(gravados.error, 'importacoes')
    const atual = ((gravados.data ?? []) as Row[]).map(r => ({ quando: String(r.created_at), x: lerExtraGravado(r.detalhes) })).find(r => r.x?.fonte === 'fora_giro' && r.x.dados.mes === mes)
    return { ...fora, gravado: atual?.x ? { liquida: atual.x.dados.total.liquida, origem: atual.x.dados.origem, quando: atual.quando } : null }
  })
}

// 2. Grava o fora do giro do mês (refeito aqui a partir das linhas e do quadro da planilha)
export async function aplicarForaDoGiroBtg(corretoraIn: string, dados: { mes: string; origem: string; linhas: LinhaFechamento[]; quadro: QuadroFechamento }) {
  return tentar<ExtraGravado>(async () => {
    const corretora = await corretoraDoBtg(corretoraIn)
    const { db, profile } = await somenteAdmin()
    mesValido(dados.mes)
    const fora = await calcularForaDoGiro(db, corretora, dados.mes, dados.linhas, dados.quadro)
    if (!fora.itens.length) throw new Error('A planilha não tem produto fora do giro neste mês')
    return gravarExtra(db, profile, corretora, 'fora_giro', dados.mes, dados.origem, fora.grupos, fora.itens,
      'produtos fora do giro do fechamento do mês (CDB, saldo remunerado, aluguel, fundos…): comissão à parte dos lotes')
  })
}

// ── Tirar um mês gravado (Banking ou fora do giro) ─────────────────────────────
export async function tirarReceitaExtraBtg(corretoraIn: string, importacaoId: string) {
  return tentar(async () => {
    const corretora = await corretoraDoBtg(corretoraIn)
    const { db } = await somenteAdmin()
    if (!UUID.test(importacaoId)) throw new Error('Importação inválida')
    const { data, error } = await db.from('importacoes').select('id, corretora, detalhes').eq('id', importacaoId).maybeSingle()
    if (error) falha(error, 'importacoes')
    const imp = data as Row | null
    const extra = lerExtraGravado(imp?.detalhes)
    if (!imp || imp.corretora !== corretora || !extra) throw new Error('Esta importação não é um mês de Banking nem de fora do giro')
    const { error: eDel } = await db.from('importacoes').delete().eq('id', importacaoId)
    if (eDel) falha(eDel, 'importacoes')
    revalidar(corretora)
    return { mes: extra.dados.mes, fonte: extra.fonte, liquida: num(extra.dados.total.liquida), origem: str(extra.dados.origem) }
  })
}
