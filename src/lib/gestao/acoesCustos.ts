'use server'

// Grava os custos fixos do escritório (parâmetro custos_fixos da corretora), editados em Parâmetros. O formato
// e a conta ficam em custos.ts; a leitura para o Painel, em consultasCustos.ts.
import { revalidatePath } from 'next/cache'
import { corretoraValida, falha, somenteAdmin } from './guard'
import { CHAVE_CUSTOS_FIXOS, lerCustosFixos, textoCustosFixos, validarCustosFixos } from './custos'
import { CORRETORA_SLUG } from '@/lib/corretoras'
import type { Resultado } from './tipos'

const DESCRICAO = 'Custos fixos do escritório, descontados da comissão líquida antes da divisão entre os sócios — "nome:valor:desde AAAA-MM[:até AAAA-MM]" para custo mensal e "nome:equipe:desde[:até]" (ou equipe-btg, só a parte do BTG) para o que a pessoa gerou em Comissões (a Equipe já inclui o fixo do nível), separados por ;'

// Valor vazio apaga os custos da corretora. Só muda a leitura do Painel: os lotes não são recalculados.
// Devolve o texto como ficou gravado (a forma canônica), para o campo mostrar.
export async function salvarCustosFixos(corretoraIn: string, valor: string): Promise<Resultado<{ valor: string; itens: number }>> {
  try {
    const corretora = await corretoraValida(corretoraIn)
    const { db } = await somenteAdmin()
    const v = valor.trim()
    const lista = lerCustosFixos(v)
    if (v && lista.length === 0) throw new Error('Use "nome:valor:desde AAAA-MM" ou "nome:equipe:desde AAAA-MM", separados por ; — por exemplo: Supabase:228,01:2026-11;Aikon:equipe:2026-11')
    const erro = validarCustosFixos(lista)
    if (erro) throw new Error(erro)
    const gravado = textoCustosFixos(lista)
    if (!v) {
      const { error } = await db.from('parametros').delete().eq('corretora', corretora).eq('chave', CHAVE_CUSTOS_FIXOS)
      if (error) falha(error, 'parametros')
    } else {
      const { error } = await db.from('parametros').upsert(
        { corretora, chave: CHAVE_CUSTOS_FIXOS, valor: gravado, descricao: DESCRICAO, updated_at: new Date().toISOString() },
        { onConflict: 'corretora,chave' },
      )
      if (error) falha(error, 'parametros')
    }
    revalidatePath(`/${CORRETORA_SLUG[corretora]}/parametros`)
    revalidatePath(`/${CORRETORA_SLUG[corretora]}/painel`)
    return { ok: true, dados: { valor: gravado, itens: lista.length } }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro inesperado' }
  }
}
