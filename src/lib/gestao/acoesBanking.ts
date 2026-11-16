'use server'

// Receita de Banking do BTG na tela: grava o mês lido da planilha da Delta ("…_DW_<mês>.xlsx") numa
// importação protegida, sem lotes, e desfaz. Gravar de novo o mesmo mês substitui o anterior.
// O servidor refaz os grupos a partir das linhas e dos percentuais: não confia nos totais da tela.
import { revalidatePath } from 'next/cache'
import { corretoraValida, falha, somenteAdmin } from './guard'
import { CORRETORA_SLUG, temListaPropria, type Corretora } from '@/lib/corretoras'
import { ehIso, mesCurto } from './meses'
import { gruposDasLinhas, lerBankingGravado, somarBanking, type GrupoBanking, type ItemBanking, type TotaisBanking } from './banking'
import type { Resultado } from './tipos'

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

async function corretoraDoBanking(corretoraIn: string) {
  const corretora = await corretoraValida(corretoraIn)
  if (!temListaPropria(corretora)) throw new Error('A receita de Banking é só do BTG')
  return corretora
}

export type AplicacaoBanking = {
  mes: string                    // 'YYYY-MM-01'
  origem: string                 // nome da planilha
  itens: ItemBanking[]
  percentuais: { grupo: string; pctEscritorio: number; impostoPct: number }[]
}
export type BankingGravado = { importacaoId: string; nome: string; substituidos: number; grupos: GrupoBanking[]; total: TotaisBanking }

const curto = (v: unknown, max = 160) => String(v ?? '').trim().slice(0, max)
const valor = (v: unknown) => {
  const n = Number(v)
  if (!Number.isFinite(n) || Math.abs(n) > 1e9) throw new Error('Valor inválido na planilha')
  return n
}

export async function aplicarBankingBtg(corretoraIn: string, dados: AplicacaoBanking) {
  return tentar<BankingGravado>(async () => {
    const corretora = await corretoraDoBanking(corretoraIn)
    const { db, profile } = await somenteAdmin()
    const { mes } = dados
    if (!ehIso(mes) || !mes.endsWith('-01')) throw new Error('Mês inválido')
    if (!Array.isArray(dados.itens) || dados.itens.length === 0) throw new Error('A planilha não tem linhas')
    if (dados.itens.length > 5000) throw new Error('Planilha grande demais')
    const fim = fimDoMes(mes)
    const percentuais = (dados.percentuais ?? []).map(p => ({ grupo: curto(p.grupo, 80), pctEscritorio: Number(p.pctEscritorio), impostoPct: Number(p.impostoPct) }))
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
    const grupos = gruposDasLinhas(itens, percentuais)
    const total = somarBanking(grupos, itens)

    // o mesmo mês gravado antes sai: vale a planilha mais recente
    const { data: antigos, error: e0 } = await db.from('importacoes').select('id, detalhes').eq('corretora', corretora).eq('protegida', true).not('detalhes->banking', 'is', null)
    if (e0) falha(e0, 'importacoes')
    const doMes = ((antigos ?? []) as Row[]).filter(r => lerBankingGravado((r.detalhes as Row | null)?.banking)?.mes === mes).map(r => String(r.id))

    const nome = `Banking BTG ${mesCurto(mes)}`
    const origem = curto(dados.origem, 200) || null
    // sem período (data_min/data_max): não são lotes de dia nenhum, e o Giro diário procura a subida do dia por data_max
    const { data: imp, error: e1 } = await db.from('importacoes').insert({
      corretora, tipo: 'lotes', nome_arquivo: nome, linhas: itens.length, linhas_novas: 0, linhas_ignoradas: 0,
      criado_por: profile.user_id, criado_por_nome: profile.nome, protegida: true,
      detalhes: {
        modo: 'banking', status: 'concluída', origem,
        motivo: 'receita de Banking do mês (planilha da Delta): comissão à parte, fora dos lotes e do giro',
        banking: { mes, origem, grupos, total, itens },
      },
    }).select('id').single()
    if (e1) falha(e1, 'importacoes')
    if (doMes.length) {
      const { error: e2 } = await db.from('importacoes').delete().in('id', doMes)
      if (e2) falha(e2, 'importacoes')
    }
    revalidar(corretora)
    return { importacaoId: String((imp as Row).id), nome, substituidos: doMes.length, grupos, total }
  })
}

export async function desfazerBankingBtg(corretoraIn: string, importacaoId: string) {
  return tentar(async () => {
    const corretora = await corretoraDoBanking(corretoraIn)
    const { db } = await somenteAdmin()
    if (!UUID.test(importacaoId)) throw new Error('Importação inválida')
    const { data, error } = await db.from('importacoes').select('id, corretora, detalhes').eq('id', importacaoId).maybeSingle()
    if (error) falha(error, 'importacoes')
    const imp = data as Row | null
    const banking = lerBankingGravado((imp?.detalhes as Row | null)?.banking)
    if (!imp || imp.corretora !== corretora || !banking) throw new Error('Esta importação não é um mês de Banking')
    const { error: eDel } = await db.from('importacoes').delete().eq('id', importacaoId)
    if (eDel) falha(eDel, 'importacoes')
    revalidar(corretora)
    return { mes: banking.mes }
  })
}
